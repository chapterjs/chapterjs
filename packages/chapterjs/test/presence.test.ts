// Presence: what the bot shows under its name, from `src/presence.ts`.
import { fakeGateway } from '@chapterjs/test-utils';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GatewayOpcode } from '../src/discord/codes.js';
import { Shard, type ShardOptions } from '../src/gateway/shard.js';
import {
  listFolder,
  loadBuilt,
  loadFolder,
  type Convention,
} from '../src/loader/loader.js';
import {
  DEFAULT_PRESENCE,
  presenceConvention,
} from '../src/presence/convention.js';
import { presence } from '../src/presence/presence.js';
import {
  connected,
  project,
  runDev,
  runProduction,
  world,
} from './dev-helpers.js';

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const read = (exports: Record<string, unknown>) =>
  presenceConvention.read(exports, 'presence.ts');

describe('src/presence.ts', () => {
  it.each([
    [
      {},
      "This file has no default export. It should look like: import { presence } from 'chapterjs'; export default presence({ status: 'online', activity: { type: 'watching', name: 'over the server' } })",
    ],
    [
      { default: { status: 'online' } },
      'The default export of this file must be what presence() returns',
    ],
    [
      { default: presence('online' as never) },
      "presence() needs an object: presence({ status: 'online', activity: { type: 'watching', name: 'over the server' } })",
    ],
    [
      { default: presence({ game: 'chess' } as never) },
      '"game" is not something a presence has. It can have: status, activity.',
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
      '"details" is not something an activity has. It can have: type, name, url.',
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
  ])('refuses a wrong file (%#)', (exports, message) => {
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

describe('a single-file convention', () => {
  const single: Convention<string> = {
    folder: 'presence',
    single: true,
    one: 'presence',
    many: 'presences',
    read: (exports, path) => `${path}:${String(exports.default)}`,
  };

  it('is one file at the root of src, with any source extension', async () => {
    const cwd = project({
      'src/presence.ts': 'export default 1;',
      'src/presence.d.ts': 'export default 2;',
      'src/presence/index.ts': 'export default 3;',
      'src/presence.txt': '4',
      'src/presence-old.ts': 'export default 5;',
      'src/events/presence.ts': 'export default 6;',
    });
    expect((await listFolder(cwd, single)).map(found => found.file)).toEqual([
      'src/presence.ts',
    ]);
    const result = await loadFolder(cwd, single);
    expect(result.loaded).toEqual([
      { file: 'src/presence.ts', value: 'presence.ts:1' },
    ]);
    expect(result.failed).toEqual([]);
    expect(await listFolder(project({}), single)).toEqual([]);
  });

  it('is read from a build the same way', async () => {
    const result = await loadBuilt(single, [
      { file: 'src/presence.ts', exports: { default: 1 } },
      { file: 'src/presence/index.ts', exports: { default: 3 } },
      { file: 'src/presence-old.ts', exports: { default: 5 } },
      { file: 'src/events/presence.ts', exports: { default: 6 } },
      { file: 'src/presence.js', exports: { default: 7 } },
    ]);
    expect(result.loaded.map(({ value }) => value)).toEqual([
      'presence.js:7',
      'presence.ts:1',
    ]);
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

  it('refuses to start with a broken presence file, like any other file', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/presence.ts': `export default { status: 'online' };\n`,
        'src/commands/ping.ts': `import { command } from 'chapterjs';
export default command({ description: 'Pong', run({ interaction }) { return interaction.reply('Pong'); } });
`,
      }),
      fake
    );
    await cli.waitFor(
      '✗ src/presence.ts The default export of this file must be what presence() returns'
    );
    await cli.waitFor('✓ 1 command loaded');
    const connection = await connected(fake);
    const identify = await connection.waitFor(GatewayOpcode.Identify);
    expect((identify.d as { presence?: unknown }).presence).toBeUndefined();
    cli.signal('SIGTERM');
    await cli.exited;
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
