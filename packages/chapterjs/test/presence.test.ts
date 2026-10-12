// Presence: what the bot shows under its name, declared with `presence()`.
import { fakeGateway } from '@chapterjs/test-utils';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayOpcode } from '../src/discord/codes.js';
import { Shard, type ShardOptions } from '../src/gateway/shard.js';
import {
  DEFAULT_PRESENCE,
  presenceDeclaration,
} from '../src/presence/declaration.js';
import { presence } from '../src/presence/presence.js';
import { activityAt, PresenceRotation } from '../src/presence/rotation.js';
import {
  connected,
  project,
  runDev,
  runProduction,
  site,
  world,
} from './dev-helpers.js';

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const read = (exports: Record<string, unknown>) =>
  presenceDeclaration.read(exports.default, site('src/presence.ts'));

describe('presence()', () => {
  it('is recognised among the exports of a file, and nothing else is', () => {
    expect(presenceDeclaration.is(presence({}))).toBe(true);
    expect(presenceDeclaration.is({ status: 'online' })).toBe(false);
    expect(presenceDeclaration.list).toBe(false);
  });

  it.each([
    [
      { default: presence('online' as never) },
      "presence() needs an object: presence({ status: 'online', activity: { type: 'watching', name: 'over the server' } })",
    ],
    [
      { default: presence({ game: 'chess' } as never) },
      '"game" is not something a presence has. It can have: status, activity, activities.',
    ],
    [
      { default: presence({ status: 'busy' as never }) },
      "\"status\" is \"busy\": it can be 'online', 'idle', 'dnd', 'invisible'.",
    ],
    [
      { default: presence({ status: 'offline' as never }) },
      '"status" is "offline": it can be',
    ],
    [
      { default: presence({ activity: 'chess' as never }) },
      "\"activity\" is what the bot is doing, an object: activity: { type: 'playing', name: '/help' }",
    ],
    [
      {
        default: presence({
          activity: { type: 'playing', name: 'chess', details: 'x' } as never,
        }),
      },
      '"details" is not something an activity has. It can have: type, name, url, for.',
    ],
    [
      {
        default: presence({ activity: { type: 'gaming', name: 'x' } as never }),
      },
      "The \"type\" of the activity is \"gaming\": it can be 'playing', 'streaming', 'listening', 'watching', 'custom', 'competing'.",
    ],
    [
      { default: presence({ activity: { name: 'x' } as never }) },
      'The "type" of the activity is undefined: it can be',
    ],
    [
      { default: presence({ activity: { type: 'playing', name: '' } }) },
      'The "name" of the activity is the text shown under the name of the bot: it can\'t be empty.',
    ],
    [
      { default: presence({ activity: { type: 'playing', name: '   ' } }) },
      "can't be empty",
    ],
    [
      { default: presence({ activity: { type: 'playing' } as never }) },
      "can't be empty",
    ],
    [
      {
        default: presence({
          activity: { type: 'streaming', name: 'x' } as never,
        }),
      },
      'A "streaming" activity needs the "url" of the stream, and Discord only accepts a https://twitch.tv/ or a https://youtube.com/ link.',
    ],
    [
      {
        default: presence({
          activity: {
            type: 'streaming',
            name: 'x',
            url: 'https://kick.com/me',
          },
        }),
      },
      'A "streaming" activity needs the "url" of the stream, and Discord only accepts a https://twitch.tv/ or a https://youtube.com/ link (got "https://kick.com/me").',
    ],
    [
      {
        default: presence({
          activity: {
            type: 'streaming',
            name: 'x',
            url: 'http://twitch.tv/me',
          },
        }),
      },
      '(got "http://twitch.tv/me")',
    ],
    [
      {
        default: presence({
          activity: {
            type: 'playing',
            name: 'x',
            url: 'https://twitch.tv/me',
          } as never,
        }),
      },
      '"url" only goes with a "streaming" activity: a "playing" activity has no link.',
    ],
  ])('refuses a wrong presence (%#)', (exports, message) => {
    expect(() => read(exports)).toThrow(message);
  });

  it.each([
    [{}, { since: null, activities: [], status: 'online', afk: false }],
    [
      { status: 'dnd' },
      { since: null, activities: [], status: 'dnd', afk: false },
    ],
    [
      { status: 'idle', activity: { type: 'playing', name: 'chess ♟️' } },
      {
        since: null,
        activities: [{ name: 'chess ♟️', type: 0 }],
        status: 'idle',
        afk: false,
      },
    ],
    [
      { activity: { type: 'listening', name: 'you' } },
      {
        since: null,
        activities: [{ name: 'you', type: 2 }],
        status: 'online',
        afk: false,
      },
    ],
    [
      { activity: { type: 'watching', name: 'over the server' } },
      {
        since: null,
        activities: [{ name: 'over the server', type: 3 }],
        status: 'online',
        afk: false,
      },
    ],
    [
      { activity: { type: 'competing', name: 'the finals' } },
      {
        since: null,
        activities: [{ name: 'the finals', type: 5 }],
        status: 'online',
        afk: false,
      },
    ],
    [
      { status: 'invisible', activity: { type: 'custom', name: 'Back soon' } },
      {
        since: null,
        activities: [{ name: 'Custom Status', type: 4, state: 'Back soon' }],
        status: 'invisible',
        afk: false,
      },
    ],
    [
      {
        activity: {
          type: 'streaming',
          name: 'the finals',
          url: 'https://www.twitch.tv/someone',
        },
      },
      {
        since: null,
        activities: [
          { name: 'the finals', type: 1, url: 'https://www.twitch.tv/someone' },
        ],
        status: 'online',
        afk: false,
      },
    ],
    [
      {
        activity: {
          type: 'streaming',
          name: 'x',
          url: 'https://youtube.com/watch?v=1',
        },
      },
      {
        since: null,
        activities: [
          { name: 'x', type: 1, url: 'https://youtube.com/watch?v=1' },
        ],
        status: 'online',
        afk: false,
      },
    ],
  ] as const)('reads %j', (config, raw) => {
    const loaded = read({ default: presence(config) });
    expect(loaded.raw).toEqual(raw);
    expect(loaded.key).toBe(JSON.stringify(raw));
  });

  it('is told apart by what it sends, not by how it was written', () => {
    const a = read({ default: presence({ status: 'online' }) });
    const b = read({ default: presence({}) });
    expect(a.key).toBe(b.key);
    expect(a.key).toBe(JSON.stringify(DEFAULT_PRESENCE));
  });
});

describe('several activities', () => {
  const rotating = (config: unknown) =>
    read({ default: presence(config as never) });

  it('are read with how long each is shown: 30 s by default, 5 s at least', () => {
    const loaded = rotating({
      status: 'idle',
      activities: [
        { type: 'watching', name: 'the tickets', for: '1m30s' },
        { type: 'playing', name: '/help' },
        {
          type: 'streaming',
          name: 'live',
          url: 'https://twitch.tv/x',
          for: '5s',
        },
      ],
    });
    expect(loaded.status).toBe('idle');
    expect(loaded.activities).toEqual([
      { type: 'watching', name: 'the tickets', for: 90_000 },
      { type: 'playing', name: '/help', for: 30_000 },
      {
        type: 'streaming',
        name: 'live',
        url: 'https://twitch.tv/x',
        for: 5_000,
      },
    ]);
    // It connects with the first one.
    expect(loaded.raw.activities).toEqual([{ name: 'the tickets', type: 3 }]);
  });

  it.each([
    [
      { activity: { type: 'playing', name: 'a' }, activities: [] },
      'A presence has "activity" (one) or "activities" (several, shown in turn), not both.',
    ],
    [
      { activities: [] },
      '"activities" is empty: give it the activities to show in turn, or leave it out.',
    ],
    [
      { activities: 'chess' },
      `"activities" is a list of activities, like [{ type: 'playing', name: '/help', for: '30s' }]: got "chess".`,
    ],
    [
      { activities: [{ type: 'playing', name: 'a', for: '4s' }] },
      '"for" of activity 1 of "activities" is "4s": an activity is shown 5 seconds at least, since Discord takes 5 changes of presence per 20 seconds.',
    ],
    [
      {
        activities: [
          { type: 'playing', name: 'a' },
          { type: 'playing', name: 'b', for: 'soon' },
        ],
      },
      '"for" of activity 2 of "activities" is how long it is shown, a duration',
    ],
    [
      { activities: [{ type: 'playing', name: 'a', for: 30 }] },
      '"for" of activity 1 of "activities" is how long it is shown, a duration',
    ],
    [
      { activities: [{ type: 'gaming', name: 'a' }] },
      'The "type" of activity 1 of "activities" is "gaming"',
    ],
    [
      { activities: ['a'] },
      `activity 1 of "activities" is what the bot is doing, an object: { type: 'playing', name: '/help' }`,
    ],
    [
      {
        activities: Array.from({ length: 101 }, () => ({
          type: 'playing',
          name: 'a',
        })),
      },
      '"activities" has 101 activities: 100 at most.',
    ],
  ])('refuses %j', (config, message) => {
    expect(() => rotating(config)).toThrow(message);
  });

  it('take functions, and connect with the status alone until they ran', () => {
    const name = () => 'computed';
    const loaded = rotating({
      activities: [{ type: 'playing', name, for: '10s' }],
    });
    expect(loaded.raw).toEqual(DEFAULT_PRESENCE);
    const list = rotating({ status: 'dnd', activities: () => [] });
    expect(typeof list.activities).toBe('function');
    expect(list.raw.status).toBe('dnd');
    // The same code saved again is no change; other code is one.
    expect(
      rotating({ activities: [{ type: 'playing', name: () => 'computed' }] })
        .key
    ).toBe(
      rotating({ activities: [{ type: 'playing', name: () => 'computed' }] })
        .key
    );
    expect(
      rotating({ activities: [{ type: 'playing', name: () => 'other' }] }).key
    ).not.toBe(
      rotating({ activities: [{ type: 'playing', name: () => 'computed' }] })
        .key
    );
  });

  it('are picked by the clock, as a cycle from the epoch', () => {
    const list = [
      { type: 'playing', name: 'a', for: 10_000 },
      { type: 'playing', name: 'b', for: 5_000 },
      { type: 'playing', name: 'c', for: 20_000 },
    ] as const;
    expect(activityAt(list, 0)).toEqual({ index: 0, left: 10_000 });
    expect(activityAt(list, 9_999)).toEqual({ index: 0, left: 1 });
    expect(activityAt(list, 10_000)).toEqual({ index: 1, left: 5_000 });
    expect(activityAt(list, 14_000)).toEqual({ index: 1, left: 1_000 });
    expect(activityAt(list, 15_000)).toEqual({ index: 2, left: 20_000 });
    // The next cycle starts over, whatever the time.
    expect(activityAt(list, 35_000 * 1000 + 12_000)).toEqual({
      index: 1,
      left: 3_000,
    });
  });
});

describe('the rotation of the presence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A rotation on a fake clock, and what it sent. */
  function rotate(
    config: unknown,
    context: Record<string, unknown> | null = {}
  ) {
    vi.useFakeTimers({ now: 0 });
    const sent: string[] = [];
    const errors: string[] = [];
    const rotation = new PresenceRotation({
      apply: raw =>
        sent.push(
          `${raw.status} ${raw.activities.map(one => one.state ?? one.name).join(',') || '-'}`
        ),
      context: () => (context ? ({ guilds: 3, ...context } as never) : null),
      onError: error =>
        errors.push(error instanceof Error ? error.message : String(error)),
    });
    rotation.set(read({ default: presence(config as never) }));
    return { rotation, sent, errors };
  }

  it('shows each activity for its time, in turn, and starts over', async () => {
    const { rotation, sent } = rotate({
      activities: [
        { type: 'playing', name: 'a', for: '10s' },
        { type: 'custom', name: 'b', for: '5s' },
      ],
    });
    // Nothing before it is started.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sent).toEqual([]);
    rotation.start();
    await vi.advanceTimersByTimeAsync(0);
    // 20 s after the epoch: the cycle is 15 s, so 5 s into "a".
    expect(sent).toEqual(['online a']);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sent).toEqual(['online a', 'online b']);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual(['online a', 'online b', 'online a', 'online b']);
    rotation.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(4);
  });

  it('runs a text function each time its activity comes, with the context', async () => {
    let calls = 0;
    const { rotation, sent } = rotate({
      activities: [
        {
          type: 'watching',
          name: async ({ guilds }: { guilds: number }) =>
            `${guilds} servers, call ${++calls}`,
          for: '10s',
        },
      ],
    });
    rotation.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual([
      'online 3 servers, call 1',
      'online 3 servers, call 2',
    ]);
  });

  it('asks a list function again once the list was shown in full', async () => {
    const lists = [
      [
        { type: 'playing', name: 'one', for: '10s' },
        { type: 'playing', name: 'two', for: '10s' },
      ],
      [{ type: 'playing', name: 'three', for: '5s' }],
    ];
    let asked = 0;
    const { rotation, sent } = rotate({
      activities: () => lists[Math.min(asked++, lists.length - 1)],
    });
    rotation.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sent).toEqual(['online one', 'online two']);
    expect(asked).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(asked).toBe(2);
    expect(sent.at(-1)).toBe('online three');
  });

  it('shows the status alone while a list function gives nothing, and asks again', async () => {
    let list: unknown[] = [];
    const { rotation, sent } = rotate({
      status: 'idle',
      activities: () => list,
    });
    rotation.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(['idle -']);
    list = [{ type: 'playing', name: 'back' }];
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sent.at(-1)).toBe('idle back');
  });

  it('says once what a function does wrong, and keeps the last good text and list', async () => {
    let fail = false;
    const { rotation, sent, errors } = rotate({
      activities: [
        {
          type: 'playing',
          name: () => {
            if (fail) throw new Error('no data');
            return 'fine';
          },
          for: '5s',
        },
        { type: 'playing', name: () => '', for: '5s' },
      ],
    });
    rotation.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(['online fine']);
    fail = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(errors).toEqual([
      `The "name" of the activity is the text shown under the name of the bot: it can't be empty.`,
      'no data',
    ]);
    // "fine" stays shown: nothing else could be.
    expect(new Set(sent)).toEqual(new Set(['online fine']));

    let broken = false;
    const second = rotate({
      activities: () => {
        if (broken) return [{ type: 'gaming', name: 'x' }];
        return [{ type: 'playing', name: 'good' }];
      },
    });
    second.rotation.start();
    await vi.advanceTimersByTimeAsync(0);
    broken = true;
    await vi.advanceTimersByTimeAsync(90_000);
    expect(second.errors).toEqual([
      `The "type" of activity 1 of "activities" is "gaming": it can be 'playing', 'streaming', 'listening', 'watching', 'custom', 'competing'.`,
    ]);
    expect(second.sent.at(-1)).toBe('online good');
  });

  it('waits for a bot, and goes back to the default when the presence is removed', async () => {
    let context: Record<string, unknown> | null = null;
    vi.useFakeTimers({ now: 0 });
    const sent: unknown[] = [];
    const rotation = new PresenceRotation({
      apply: raw => sent.push(raw),
      context: () => context as never,
      onError: () => {},
    });
    rotation.set(
      read({ default: presence({ activity: { type: 'playing', name: 'x' } }) })
    );
    rotation.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toEqual([]);
    context = { guilds: 1 };
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent).toHaveLength(1);
    rotation.set(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.at(-1)).toEqual(DEFAULT_PRESENCE);
    rotation.stop();
  });

  it('gives up a slow function when the presence changed meanwhile', async () => {
    let release!: (text: string) => void;
    const { rotation, sent } = rotate({
      activity: {
        type: 'playing',
        name: () => new Promise<string>(resolve => (release = resolve)),
      },
    });
    rotation.start();
    await vi.advanceTimersByTimeAsync(0);
    rotation.set(
      read({
        default: presence({ activity: { type: 'playing', name: 'new' } }),
      })
    );
    await vi.advanceTimersByTimeAsync(0);
    release('old');
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(['online new']);
    rotation.stop();
  });
});

describe('a shard', () => {
  const noGate = { wait: () => Promise.resolve() };
  async function startShard(options: Partial<ShardOptions> = {}) {
    const gateway = await fakeGateway();
    const shard = new Shard({
      id: 0,
      count: 1,
      token: 'test-token',
      intents: 1,
      url: gateway.url,
      identifyGate: noGate,
      onDispatch: () => {},
      backoff: () => 10,
      presenceWindow: 300,
      ...options,
    });
    return { gateway, shard };
  }
  const at = (status: string) => ({
    since: null,
    activities: [],
    status: status as 'online',
    afk: false,
  });
  const updates = (received: { op: number; d?: unknown }[]) =>
    received
      .filter(payload => payload.op === GatewayOpcode.PresenceUpdate)
      .map(payload => (payload.d as { status: string }).status);

  it('sends a new presence at once, 5 per window at most, and the latest after', async () => {
    const { gateway, shard } = await startShard();
    await shard.connect();
    const connection = gateway.connections[0]!;
    for (const status of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      shard.setPresence(at(status));
    }
    await tick();
    expect(updates(connection.received)).toEqual(['a', 'b', 'c', 'd', 'e']);
    await tick(350);
    // Only the latest one of what waited: f was never worth sending.
    expect(updates(connection.received)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'g',
    ]);
    await shard.close();
  });

  it('identifies with the presence set before connecting, and after a lost session', async () => {
    const { gateway, shard } = await startShard();
    shard.setPresence(at('idle'));
    await shard.connect();
    const first = gateway.connections[0]!;
    const identify = await first.waitFor(GatewayOpcode.Identify);
    expect(identify.d).toMatchObject({ presence: at('idle') });
    expect(updates(first.received)).toEqual([]);

    // The session is lost: the next Identify carries the newest presence.
    shard.setPresence(at('dnd'));
    await tick();
    expect(updates(first.received)).toEqual(['dnd']);
    first.close(4007);
    const second = await gateway.connection(1);
    const again = await second.waitFor(GatewayOpcode.Identify);
    expect(again.d).toMatchObject({ presence: at('dnd') });
    await tick();
    expect(updates(second.received)).toEqual([]);
    await shard.close();
  });

  it('sends after Resumed what changed while it was disconnected', async () => {
    const { gateway, shard } = await startShard({ backoff: () => 150 });
    await shard.connect();
    const first = gateway.connections[0]!;
    first.drop();
    await tick(10);
    expect(shard.status).toBe('reconnecting');
    shard.setPresence(at('dnd'));
    const second = await gateway.connection(1);
    await second.waitFor(GatewayOpcode.Resume);
    const update = await second.waitFor(GatewayOpcode.PresenceUpdate);
    expect(update.d).toEqual(at('dnd'));
    expect(
      second.received.some(payload => payload.op === GatewayOpcode.Identify)
    ).toBe(false);
    await shard.close();
  });
});

const FILE = (type: string, name: string, status = 'online') =>
  `import { presence } from 'chapterjs';
export default presence({ status: '${status}', activity: { type: '${type}', name: '${name}' } });
`;

describe('chapterjs dev', () => {
  it('connects with the presence, follows the file, and keeps the last good one', async () => {
    const fake = await world();
    const cwd = project({ 'src/presence.ts': FILE('watching', 'you') });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ a presence loaded');
    const connection = await connected(fake);
    const identify = await connection.waitFor(GatewayOpcode.Identify);
    expect(identify.d).toMatchObject({
      presence: {
        since: null,
        activities: [{ name: 'you', type: 3 }],
        status: 'online',
        afk: false,
      },
    });

    // Changed: sent at once.
    writeFileSync(
      join(cwd, 'src/presence.ts'),
      FILE('playing', 'chess', 'idle')
    );
    await cli.waitFor('↻ Presence updated');
    await cli.waitFor('↻ Reloaded in');
    const update = await connection.waitFor(GatewayOpcode.PresenceUpdate);
    expect(update.d).toEqual({
      since: null,
      activities: [{ name: 'chess', type: 0 }],
      status: 'idle',
      afk: false,
    });

    // Saved again without a change: nothing is sent.
    writeFileSync(
      join(cwd, 'src/presence.ts'),
      `${FILE('playing', 'chess', 'idle')}// a comment\n`
    );
    await cli.waitFor(
      /↻ Reloaded in \d+ ms, a presence loaded\n(?:(?!Presence updated)[^\n]*\n)*$/
    );

    // Broken: said, and the last good one stays.
    writeFileSync(join(cwd, 'src/presence.ts'), FILE('gaming', 'chess'));
    await cli.waitFor(
      '✗ src/presence.ts The "type" of the activity is "gaming": it can be'
    );
    await cli.waitFor('⚠ Reloaded with an error');
    expect(cli.output.match(/Presence updated/g)).toHaveLength(1);

    // Removed: back to what Discord shows without one.
    rmSync(join(cwd, 'src/presence.ts'));
    await cli.waitFor('↻ Presence updated');
    await cli.waitFor(/↻ Reloaded in \d+ ms, Nothing to run yet/);
    await tick(100);
    const sent = connection.received.filter(
      payload => payload.op === GatewayOpcode.PresenceUpdate
    );
    expect(sent.map(payload => payload.d)).toEqual([
      {
        since: null,
        activities: [{ name: 'chess', type: 0 }],
        status: 'idle',
        afk: false,
      },
      { since: null, activities: [], status: 'online', afk: false },
    ]);
    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('refuses to start with a broken presence, like any other declaration', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/presence.ts': `import { presence } from 'chapterjs';\nexport default presence({ status: 'busy' } as never);\n`,
        'src/commands/ping.ts': `import { command } from 'chapterjs';
export default command({ name: 'ping', description: 'Pong', run({ interaction }) { return interaction.reply('Pong'); } });
`,
      }),
      fake
    );
    await cli.waitFor(
      `✗ src/presence.ts "status" is "busy": it can be 'online', 'idle', 'dnd', 'invisible'.`
    );
    await cli.waitFor('✓ 1 command loaded');
    const connection = await connected(fake);
    const identify = await connection.waitFor(GatewayOpcode.Identify);
    expect((identify.d as { presence?: unknown }).presence).toBeUndefined();
    cli.signal('SIGTERM');
    await cli.exited;
  });
});

describe('chapterjs dev, with functions', () => {
  it('shows what the functions give, and says once what they do wrong, with the line', async () => {
    const fake = await world();
    const cwd = project({
      'src/presence.ts': `import { presence } from 'chapterjs';
export default presence({
  status: 'idle',
  activities: [
    { type: 'watching', name: async ({ guilds }) => \`\${guilds} servers\`, for: '5s' },
    { type: 'playing', name: () => { throw new Error('nothing to show'); }, for: '5s' },
  ],
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ a presence loaded');
    const connection = await connected(fake);
    // The dev bot runs one server.
    const update = await connection.waitFor(
      payload =>
        payload.op === GatewayOpcode.PresenceUpdate &&
        JSON.stringify(payload.d).includes('servers'),
      12_000
    );
    expect(update.d).toEqual({
      since: null,
      activities: [{ name: '1 servers', type: 3 }],
      status: 'idle',
      afk: false,
    });
    await cli.waitFor('✗ src/presence.ts:6 nothing to show');
    await tick(5_500);
    expect(cli.output.match(/nothing to show/g)).toHaveLength(1);
    cli.signal('SIGTERM');
    await cli.exited;
  }, 30_000);

  it('are typed: one activity or several, and what the functions receive and give', async () => {
    const { cpSync, symlinkSync } = await import('node:fs');
    const { spawnSync } = await import('node:child_process');
    const { packageDir } = await import('./dev-helpers.js');
    const fake = await world();
    const cwd = project({
      'src/ok.ts': `import { presence, type Activity } from 'chapterjs';
const list: Activity[] = [{ type: 'playing', name: 'a', for: '1m' }];
export const a = presence({ activities: async ({ guilds }) => [...list, { type: 'watching', name: String(guilds) }] });
export const b = presence({ activity: { type: 'custom', name: ({ guilds }) => \`\${guilds + 1}\` } });
`,
      'src/both.ts': `import { presence } from 'chapterjs';
export default presence({ activity: { type: 'playing', name: 'a' }, activities: [] });
`,
      'src/for.ts': `import { presence } from 'chapterjs';
export default presence({ activities: [{ type: 'playing', name: 'a', for: 30 }] });
`,
      'src/text.ts': `import { presence } from 'chapterjs';
export default presence({ activity: { type: 'playing', name: () => 42 } });
`,
    });
    cpSync(
      join(packageDir, '../create-chapterjs/templates/default/tsconfig.json'),
      join(cwd, 'tsconfig.json')
    );
    symlinkSync(
      join(packageDir, 'node_modules/@types'),
      join(cwd, 'node_modules/@types'),
      'dir'
    );
    await runDev(cwd, fake, ['sync']).exited;
    const result = spawnSync(
      join(packageDir, 'node_modules/.bin/tsc'),
      ['-b'],
      {
        cwd,
        encoding: 'utf8',
      }
    );
    const errors = result.stdout
      .split('\n')
      .filter(line => line.includes('error TS'))
      .map(line => line.replace(/\(\d+,\d+\).*/, ''))
      .sort();
    expect([...new Set(errors)]).toEqual([
      'src/both.ts',
      'src/for.ts',
      'src/text.ts',
    ]);
  });
});

describe('chapterjs test', () => {
  it('runs each function of the presence once, and reports what throws', async () => {
    const { spawnSync } = await import('node:child_process');
    const { bin } = await import('./dev-helpers.js');
    const run = (files: Record<string, string>) => {
      const result = spawnSync(process.execPath, [bin, 'test'], {
        cwd: project(files),
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', NO_COLOR: '1' },
      });
      return { code: result.status, output: result.stdout + result.stderr };
    };
    const broken = run({
      'src/presence.ts': `import { presence } from 'chapterjs';
export default presence({
  activities: async ({ guilds }) => [
    { type: 'watching', name: \`\${guilds} servers\` },
    { type: 'playing', name: () => { throw new Error('no data'); } },
  ],
});
`,
    });
    expect(broken.code).toBe(1);
    expect(broken.output).toContain(
      '✗ Checked src/presence.ts: the presence failed\n  src/presence.ts:5 no data'
    );
    const wrong = run({
      'src/presence.ts': `import { presence } from 'chapterjs';
export default presence({ activities: () => [{ type: 'gaming', name: 'x' }] as never });
`,
    });
    expect(wrong.output).toContain(
      'The "type" of activity 1 of "activities" is "gaming"'
    );
    // Nothing to run: nothing to check.
    const plain = run({
      'src/presence.ts': `import { presence } from 'chapterjs';
export default presence({ activity: { type: 'playing', name: 'x' } });
`,
    });
    expect(plain.output).not.toContain('Checked');
    const fine = run({
      'src/presence.ts': `import { presence } from 'chapterjs';
export default presence({ activity: { type: 'playing', name: async () => 'ok' } });
`,
    });
    expect(fine.code).toBe(0);
    expect(fine.output).toContain('✓ Checked every file once: 1 check');
  });
});

describe('chapterjs start', () => {
  it('runs the presence of the build on every shard', async () => {
    const fake = await world({ shards: 2, maxConcurrency: 16 });
    const cli = runProduction(
      project(
        { 'src/presence.ts': FILE('custom', 'Ask me anything', 'dnd') },
        'BOT_TOKEN=test-token\n'
      ),
      fake
    );
    await cli.waitFor('✓ Online as test-bot in 2 servers (2 shards)');
    await cli.waitFor('✓ a presence loaded');
    for (const index of [0, 1]) {
      const connection = await connected(fake, index);
      const identify = await connection.waitFor(GatewayOpcode.Identify);
      expect(identify.d).toMatchObject({
        presence: {
          since: null,
          activities: [
            { name: 'Custom Status', type: 4, state: 'Ask me anything' },
          ],
          status: 'dnd',
          afk: false,
        },
      });
    }
    cli.signal('SIGTERM');
    await cli.exited;
  });
});
