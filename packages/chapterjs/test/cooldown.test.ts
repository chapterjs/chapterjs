// Cooldowns: a command refused to a person, a channel or a server that used
// it a moment ago, from the `cooldown` of its file.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { command } from '../src/commands/command.js';
import { commandsConvention } from '../src/commands/convention.js';
import {
  checkCooldown,
  MemoryCooldowns,
  NO_COOLDOWN,
} from '../src/interactions/cooldown.js';
import { parseDuration } from '../src/util/duration.js';
import {
  ALICE,
  connected,
  GENERAL,
  GUILD,
  project,
  runDev,
  world,
  type FakeWorld,
} from './dev-helpers.js';

describe('a duration', () => {
  it.each([
    ['1s', 1000],
    ['30s', 30_000],
    ['10m', 600_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
    ['1h30m', 5_400_000],
    ['1H 30M', 5_400_000],
    ['1.5h', 5_400_000],
    ['0s', 0],
    ['0.5s', 500],
  ])('reads %s', (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(['', ' ', '10', '10 minutes', 'm10', '500ms', '1h30', '-1s', 'ten'])(
    'is not %j',
    text => {
      expect(parseDuration(text)).toBeNull();
    }
  );
});

describe('the store in memory', () => {
  it('remembers until when, and forgets what expired', () => {
    const store = new MemoryCooldowns();
    expect(store.until('a', 100)).toBe(0);
    store.set('a', 150);
    expect(store.until('a', 100)).toBe(150);
    expect(store.until('a', 149)).toBe(150);
    expect(store.until('a', 150)).toBe(0);
    expect(store.size).toBe(0);
  });

  it('sweeps what expired by itself, so it never grows with the past', () => {
    const store = new MemoryCooldowns();
    for (let i = 0; i < 999; i++) store.set(`old${i}`, 1);
    expect(store.size).toBe(999);
    // The thousandth write sweeps: only what still holds stays.
    store.set('fresh', Date.now() + 60_000);
    expect(store.size).toBe(1);
    // Then it sweeps again once the rest doubled, 1000 at least.
    for (let i = 0; i < 998; i++) store.set(`old${i}`, 1);
    expect(store.size).toBe(999);
    store.set('last', 1);
    expect(store.size).toBe(1);
  });
});

describe('checking a cooldown', () => {
  const ids = { user: 'u1', channel: 'c1', guild: 'g1' };

  it('counts a use, then refuses until it is over', () => {
    const store = new MemoryCooldowns();
    const limits = { ...NO_COOLDOWN, user: 10_000 };
    expect(checkCooldown(store, 'ping', limits, ids, 1000)).toBe(0);
    expect(checkCooldown(store, 'ping', limits, ids, 5000)).toBe(11_000);
    expect(checkCooldown(store, 'ping', limits, ids, 10_999)).toBe(11_000);
    expect(checkCooldown(store, 'ping', limits, ids, 11_000)).toBe(0);
    // A refused use counts for nothing: the first one still decides.
    expect(checkCooldown(store, 'ping', limits, ids, 11_001)).toBe(21_000);
  });

  it('keeps each scope, each command and each id apart', () => {
    const store = new MemoryCooldowns();
    const limits = { user: 10_000, channel: 2000, guild: 5000 };
    expect(checkCooldown(store, 'ping', limits, ids, 0)).toBe(0);
    // Another person in the same channel: the channel still waits, and
    // the server too, which lasts longer: that is what they are told.
    expect(
      checkCooldown(store, 'ping', limits, { ...ids, user: 'u2' }, 1000)
    ).toBe(5000);
    expect(
      checkCooldown(store, 'ping', limits, { ...ids, user: 'u2' }, 2500)
    ).toBe(5000);
    // Another channel of the same server: the server still waits.
    expect(
      checkCooldown(
        store,
        'ping',
        limits,
        { user: 'u2', channel: 'c2', guild: 'g1' },
        3000
      )
    ).toBe(5000);
    // Another server, another person: nothing waits.
    expect(
      checkCooldown(
        store,
        'ping',
        limits,
        { user: 'u2', channel: 'c2', guild: 'g2' },
        3000
      )
    ).toBe(0);
    // The same person elsewhere: they wait, until the latest of the scopes.
    expect(
      checkCooldown(
        store,
        'ping',
        limits,
        { user: 'u1', channel: 'c2', guild: 'g2' },
        4000
      )
    ).toBe(10_000);
    // Another command: its own count.
    expect(checkCooldown(store, 'pong', limits, ids, 4000)).toBe(0);
  });

  it('ignores a scope without an id (no server in a private message)', () => {
    const store = new MemoryCooldowns();
    const limits = { ...NO_COOLDOWN, guild: 5000 };
    expect(
      checkCooldown(store, 'ping', limits, { user: 'u1', channel: 'dm1' }, 0)
    ).toBe(0);
    expect(
      checkCooldown(store, 'ping', limits, { user: 'u1', channel: 'dm1' }, 1)
    ).toBe(0);
    expect(store.size).toBe(0);
  });
});

describe('the cooldown of a command file', () => {
  const read = (config: Record<string, unknown>) =>
    commandsConvention.read(
      {
        default: command({
          description: 'd',
          run() {},
          ...config,
        } as never),
      },
      'ping.ts'
    );

  it('is none when left out', () => {
    expect(read({}).cooldown).toEqual({ user: 0, channel: 0, guild: 0 });
  });

  it.each([
    ['10s', { user: 10_000, channel: 0, guild: 0 }],
    ['1h 30m', { user: 5_400_000, channel: 0, guild: 0 }],
    [{ user: '10s' }, { user: 10_000, channel: 0, guild: 0 }],
    [{ channel: '5s' }, { user: 0, channel: 5000, guild: 0 }],
    [{ guild: '1m' }, { user: 0, channel: 0, guild: 60_000 }],
    [
      { user: '10s', channel: '5s', guild: '1m' },
      { user: 10_000, channel: 5000, guild: 60_000 },
    ],
  ])('reads %j', (cooldown, limits) => {
    const loaded = read({ cooldown });
    expect(loaded.cooldown).toEqual(limits);
    expect(Object.isFrozen(loaded.cooldown)).toBe(true);
  });

  it('is kept for a command of private messages, without a server', () => {
    expect(read({ where: 'dm', cooldown: { user: '10s' } }).cooldown).toEqual({
      user: 10_000,
      channel: 0,
      guild: 0,
    });
    expect(
      read({ where: 'both', cooldown: { guild: '1m' } }).cooldown.guild
    ).toBe(60_000);
  });

  const example = `cooldown: '10s' (a number and a unit: s, m, h or d, like '30s', '2h', '1d' or '1h30m') for each person, or cooldown: { user: '10s', channel: '5s', guild: '1m' } for each place`;

  it.each([
    ['', `"cooldown" is a duration, got "": ${example}.`],
    ['   ', '"cooldown" is a duration, got "   "'],
    ['10', `"cooldown" is "10", which is not a duration: ${example}.`],
    ['500ms', '"cooldown" is "500ms", which is not a duration'],
    ['10 seconds', '"cooldown" is "10 seconds", which is not a duration'],
    [
      '0s',
      '"cooldown" is "0s": a cooldown is 1 second at least. Leave it out for none.',
    ],
    ['0.5s', '"cooldown" is "0.5s": a cooldown is 1 second at least.'],
    [
      10,
      `"cooldown" says how long to wait before the command can be used again: ${example}.`,
    ],
    [
      true,
      '"cooldown" says how long to wait before the command can be used again',
    ],
    [
      null,
      '"cooldown" says how long to wait before the command can be used again',
    ],
    [
      ['10s'],
      '"cooldown" says how long to wait before the command can be used again',
    ],
    [{}, `"cooldown" is empty: ${example}. Leave it out for none.`],
    [{ user: undefined }, '"cooldown" is empty'],
    [
      { member: '10s' },
      '"member" is not something "cooldown" has. It can have: user, channel, guild.',
    ],
    [{ user: 10 }, `"user" of "cooldown" is a duration, got 10: ${example}.`],
    [{ channel: '' }, '"channel" of "cooldown" is a duration, got ""'],
    [{ guild: 'x' }, '"guild" of "cooldown" is "x", which is not a duration'],
    [
      { user: '1s', guild: '0m' },
      '"guild" of "cooldown" is "0m": a cooldown is 1 second at least.',
    ],
  ])('refuses %j', (cooldown, message) => {
    expect(() => read({ cooldown })).toThrow(message);
  });

  it('refuses a server cooldown for a command of private messages', () => {
    expect(() => read({ where: 'dm', cooldown: { guild: '1m' } })).toThrow(
      `"cooldown" has "guild", but this command only works in private messages (where: 'dm'), where there is no server: use "user".`
    );
  });
});

/** A slash command being used, as Discord sends it. */
const use = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  application_id: '100000000000000002',
  type: 2,
  token: `token-${id}`,
  version: 1,
  guild_id: GUILD,
  channel_id: GENERAL,
  locale: 'fr',
  member: {
    user: { id: ALICE, username: 'alice', discriminator: '0' },
    roles: [],
    permissions: '1024',
    joined_at: '2024-01-01T00:00:00Z',
    deaf: false,
    mute: false,
    flags: 0,
  },
  app_permissions: '0',
  entitlements: [],
  authorizing_integration_owners: {},
  attachment_size_limit: 1,
  data: { id: '100000000000000500', name, type: 1 },
  ...extra,
});

const waitUntil = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

/** Lets the bot answer the interaction `id`, and returns what it sent. */
function answers(fake: FakeWorld, id: string) {
  const callback = `/interactions/${id}/token-${id}/callback`;
  fake.discord.on('POST', callback, {});
  return () => fake.discord.requestsTo('POST', callback);
}

/** Lets the bot delete its answer to `id`, and returns the deletions. */
function deletions(fake: FakeWorld, id: string) {
  const original = `/webhooks/100000000000000002/token-${id}/messages/@original`;
  fake.discord.on('DELETE', original, {});
  return () => fake.discord.requestsTo('DELETE', original);
}

describe.skipIf(process.platform === 'win32')(
  'a command with a cooldown',
  () => {
    const BOB = '100000000000000004';
    const OTHER_CHANNEL = '100000000000000022';
    const asBob = {
      member: {
        user: { id: BOB, username: 'bob', discriminator: '0' },
        roles: [],
        permissions: '1024',
        joined_at: '2024-01-01T00:00:00Z',
        deaf: false,
        mute: false,
        flags: 0,
      },
    };

    const COOLDOWN = (cooldown: string) => `import { command } from 'chapterjs';
export default command({
  description: 'd',
  cooldown: ${cooldown},
  async run({ interaction }) { console.log('ran', interaction.id); await interaction.reply('ok'); },
});
`;

    it('refuses the person who used it a moment ago, saying when, and runs nothing', async () => {
      const fake = await world();
      const cwd = project({
        'src/commands/daily.ts': COOLDOWN(`'2s'`),
        'src/messages/fr.ts': `import { language } from 'chapterjs';
export default language({
  default: true,
  texts: {},
  framework: { command: 'commande', cooldown: 'Tu pourras réutiliser cette {what} {when}.' },
});
`,
      });
      const cli = runDev(cwd, fake);
      await cli.waitFor('✓ 1 command, messages in 1 language loaded');
      const connection = await connected(fake);
      const run = async (id: string, extra: Record<string, unknown> = {}) => {
        const sent = answers(fake, id);
        connection.dispatch('INTERACTION_CREATE', use(id, 'daily', extra));
        await waitUntil(() => sent().length === 1, `the answer to ${id}`);
        return (sent()[0]!.body as { data: { content: string; flags: number } })
          .data;
      };
      const before = Date.now();
      expect(await run('100000000000000701')).toEqual({
        content: 'ok',
        flags: 0,
      });
      const deleted = deletions(fake, '100000000000000702');
      const refused = await run('100000000000000702');
      // When, as a Discord timestamp: shown in the language of each reader.
      const when = refused.content.match(
        /^Tu pourras réutiliser cette commande <t:(\d+):R>\.$/
      );
      expect(when, refused.content).not.toBeNull();
      const at = Number(when![1]) * 1000;
      expect(at).toBeGreaterThanOrEqual(before + 2000);
      expect(at).toBeLessThanOrEqual(before + 4000);
      expect(refused.flags).toBe(64);
      // Someone else is not waiting.
      expect(await run('100000000000000703', asBob)).toEqual({
        content: 'ok',
        flags: 0,
      });
      // Nor the same person, once it is over: and the refusal, whose time
      // would now read "52 seconds ago", is deleted by itself.
      await waitUntil(() => Date.now() >= at, 'the cooldown to end');
      await waitUntil(() => deleted().length === 1, 'the refusal to go');
      expect(await run('100000000000000704')).toEqual({
        content: 'ok',
        flags: 0,
      });
      expect(cli.output.match(/ran 1000000000000007/g)).toHaveLength(3);
      expect(cli.output).not.toContain('ran 100000000000000702');
    });

    it('shows the date and time when it is too long to delete the answer', async () => {
      const fake = await world();
      const cli = runDev(
        project({ 'src/commands/daily.ts': COOLDOWN(`'1d'`) }),
        fake
      );
      await cli.waitFor('✓ 1 command loaded');
      const connection = await connected(fake);
      const run = async (id: string) => {
        const sent = answers(fake, id);
        connection.dispatch('INTERACTION_CREATE', use(id, 'daily'));
        await waitUntil(() => sent().length === 1, `the answer to ${id}`);
        return (sent()[0]!.body as { data: { content: string } }).data.content;
      };
      const before = Date.now();
      expect(await run('100000000000000731')).toBe('ok');
      const when = (await run('100000000000000732')).match(
        /^You can use this command again <t:(\d+):f>\.$/
      );
      expect(when).not.toBeNull();
      const at = Number(when![1]) * 1000;
      expect(at).toBeGreaterThanOrEqual(before + 86_400_000);
      expect(at).toBeLessThanOrEqual(before + 86_400_000 + 2000);
    });

    it('can be for a channel or a server, whoever used it', async () => {
      const fake = await world();
      const cwd = project({
        'src/commands/channel.ts': COOLDOWN(`{ channel: '1h' }`),
        'src/commands/server.ts': COOLDOWN(`{ guild: '1h' }`),
      });
      const cli = runDev(cwd, fake);
      await cli.waitFor('✓ 2 commands loaded');
      const connection = await connected(fake);
      const run = async (
        id: string,
        name: string,
        extra: Record<string, unknown> = {}
      ) => {
        const sent = answers(fake, id);
        connection.dispatch('INTERACTION_CREATE', use(id, name, extra));
        await waitUntil(() => sent().length === 1, `the answer to ${id}`);
        return (sent()[0]!.body as { data: { content: string } }).data.content;
      };
      expect(await run('100000000000000711', 'channel')).toBe('ok');
      expect(await run('100000000000000712', 'channel', asBob)).toMatch(
        /^You can use this command again <t:\d+:f>\.$/
      );
      expect(
        await run('100000000000000713', 'channel', {
          ...asBob,
          // A channel Discord sends with the use: known without asking.
          channel_id: OTHER_CHANNEL,
          channel: {
            id: OTHER_CHANNEL,
            type: 0,
            name: 'other',
            guild_id: GUILD,
          },
        })
      ).toBe('ok');
      expect(await run('100000000000000714', 'server')).toBe('ok');
      expect(
        await run('100000000000000715', 'server', {
          ...asBob,
          // A channel Discord sends with the use: known without asking.
          channel_id: OTHER_CHANNEL,
          channel: {
            id: OTHER_CHANNEL,
            type: 0,
            name: 'other',
            guild_id: GUILD,
          },
        })
      ).toMatch(/^You can use this command again <t:\d+:f>\.$/);
    });

    it('holds through a reload, and is gone when the file drops it', async () => {
      const fake = await world();
      const cwd = project({ 'src/commands/daily.ts': COOLDOWN(`'1h'`) });
      const cli = runDev(cwd, fake);
      await cli.waitFor('✓ 1 command loaded');
      const connection = await connected(fake);
      const run = async (id: string) => {
        const sent = answers(fake, id);
        connection.dispatch('INTERACTION_CREATE', use(id, 'daily'));
        await waitUntil(() => sent().length === 1, `the answer to ${id}`);
        return (sent()[0]!.body as { data: { content: string } }).data.content;
      };
      expect(await run('100000000000000721')).toBe('ok');
      writeFileSync(
        join(cwd, 'src/commands/daily.ts'),
        COOLDOWN(`'1h'`).replace("'ok'", "'ok again'")
      );
      await cli.waitFor(/↻ Reloaded in \d+ ms, 1 command loaded/);
      // A save does not reset the cooldowns.
      expect(await run('100000000000000722')).toMatch(
        /^You can use this command again <t:\d+:f>\.$/
      );
      writeFileSync(
        join(cwd, 'src/commands/daily.ts'),
        COOLDOWN(`'1h'`).replace("cooldown: '1h',\n", '')
      );
      await cli.waitFor(
        /↻ Reloaded in \d+ ms, 1 command loaded[\s\S]*↻ Reloaded in \d+ ms, 1 command loaded/
      );
      expect(await run('100000000000000723')).toBe('ok');
    });

    it('is reported when it is not a duration', async () => {
      const fake = await world();
      const cli = runDev(
        project({ 'src/commands/daily.ts': COOLDOWN(`'10 minutes'`) }),
        fake
      );
      await cli.waitFor(
        `✗ src/commands/daily.ts "cooldown" is "10 minutes", which is not a duration: cooldown: '10s' (a number and a unit: s, m, h or d, like '30s', '2h', '1d' or '1h30m') for each person, or cooldown: { user: '10s', channel: '5s', guild: '1m' } for each place.`
      );
    });
  }
);
