import { fakeDiscord } from '@chapterjs/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Cache, DEFAULT_CACHE_LIMITS } from '../src/cache/cache.js';
import {
  configure,
  readMemory,
  relax,
  tighten,
  watchMemory,
  type MemoryReading,
} from '../src/core/memory.js';
import { EVENTS } from '../src/events/registry.js';
import { limitsFor } from '../src/events/router.js';
import { RestClient } from '../src/rest/rest.js';
import { createContext } from '../src/structures/entities.js';

const GUILD = '100000000000000000';
const BOT = '100000000000000002';
const id = (n: number) => String(100000000000001000n + BigInt(n));
const rawMember = (userId: string) => ({
  user: { id: userId, username: `u${userId.slice(-4)}`, discriminator: '0' },
  roles: [],
  joined_at: '2024-01-01T00:00:00Z',
  deaf: false,
  mute: false,
  flags: 0,
});

async function world(members: number, guilds = [GUILD]) {
  const discord = await fakeDiscord();
  const rest = new RestClient({
    token: 't',
    version: '1',
    baseUrl: discord.url,
  });
  // What a project that listens to members leaving remembers.
  const cache = new Cache({ limits: { members: 1000 } });
  const ctx = createContext({ rest, cache });
  ctx.self = { userId: BOT, applicationId: BOT };
  for (const guildId of guilds) {
    ctx.entities.guild({
      id: guildId,
      name: 'Server',
      owner_id: BOT,
      roles: [
        { id: guildId, name: '@everyone', permissions: '0', position: 0 },
      ],
      emojis: [],
      features: [],
      members: [rawMember(BOT)],
      channels: [{ id: `${guildId.slice(0, -1)}9`, type: 0, name: 'general' }],
    } as never);
    for (let n = 0; n < members; n++) {
      ctx.entities.member(guildId, rawMember(id(n)) as never);
    }
  }
  return { ctx, cache, guild: cache.guilds.get(GUILD)! };
}

describe('how many members a server remembers', () => {
  it('is 100 by default, and more only for the files that need it', () => {
    expect(DEFAULT_CACHE_LIMITS).toEqual({
      users: Infinity,
      members: 100,
      messages: 0,
    });
    expect(new Cache().limits).toEqual(DEFAULT_CACHE_LIMITS);
    const file = (name: string) => ({
      file: `src/events/${name}/x.ts`,
      export: 'default',
      event: { name, handler: () => {}, options: {} } as never,
    });
    expect(limitsFor([])).toEqual(DEFAULT_CACHE_LIMITS);
    // What comes with the event needs nothing remembered.
    expect(
      limitsFor(
        ['messageCreate', 'memberJoin', 'memberUpdate', 'ready'].map(file)
      )
    ).toEqual(DEFAULT_CACHE_LIMITS);
    // "The member as it was" is a member the bot remembered.
    expect(limitsFor([file('messageCreate'), file('memberLeave')])).toEqual({
      users: Infinity,
      members: 1000,
      messages: 0,
    });
    // Never mutated by asking.
    expect(DEFAULT_CACHE_LIMITS.members).toBe(100);
  });

  it('follows the files of the project while the bot runs', async () => {
    const { ctx, cache, guild } = await world(300);
    expect(guild.members.size).toBe(301);
    // The file that needed members is gone: fewer are kept, at once.
    configure(cache, limitsFor([]));
    expect(cache.configured.members).toBe(100);
    expect(cache.limits.members).toBe(100);
    expect(guild.members.size).toBe(100);
    expect(guild.members.has(id(299))).toBe(true);
    // It is back: there is room again.
    configure(cache, { members: 1000 });
    for (let n = 0; n < 300; n++) {
      ctx.entities.member(GUILD, rawMember(id(n)) as never);
    }
    expect(guild.members.size).toBe(300);
    // While memory is short, what is kept stays as low as memory made it...
    expect(tighten(cache)).toMatchObject({ members: 500 });
    expect(tighten(cache)).toMatchObject({ members: 250 });
    configure(cache, { members: 1000 });
    expect(cache.limits.members).toBe(250);
    // ...and never higher than what the files need.
    configure(cache, { members: 100 });
    expect(cache.limits.members).toBe(100);
    expect(guild.members.size).toBe(100);
    // Members are already all the files need: only users come back.
    expect(relax(cache)).toEqual({ members: 100, users: Infinity });
    expect(relax(cache)).toBeNull();
  });

  it('keeps the most recently seen, and always the bot', async () => {
    const { ctx, guild } = await world(1500);
    expect(guild.members.size).toBe(1000);
    // The first ones left, the bot among them...
    expect(guild.members.has(id(0))).toBe(false);
    expect(guild.members.has(BOT)).toBe(false);
    expect(guild.members.has(id(1499))).toBe(true);
    // ...but a server never forgets the bot itself.
    expect(guild.me.id).toBe(BOT);

    // Seen again (they wrote, used a command, changed): the most recent.
    const quiet = id(500);
    const active = id(501);
    ctx.entities.member(GUILD, rawMember(active) as never);
    for (let n = 2000; n < 2998; n++) {
      ctx.entities.member(GUILD, rawMember(id(n)) as never);
    }
    expect(guild.members.size).toBe(1000);
    expect(guild.members.has(quiet)).toBe(false);
    expect(guild.members.has(active)).toBe(true);
    // The same member all along: the same object.
    const before = guild.members.get(active);
    expect(ctx.entities.member(GUILD, rawMember(active) as never)).toBe(before);
  });
});

/** Tightens until nothing is left to give up; returns how many steps. */
function empty(cache: Cache): number {
  let steps = 0;
  // Bounded: a bug must fail a test, not hang it.
  while (steps < 50 && tighten(cache)) steps++;
  return steps;
}

describe('freeing memory', () => {
  const OTHER = '100000000000000500';

  it('remembers half as much, the most recent, and nothing else changes', async () => {
    const { ctx, cache, guild } = await world(100, [GUILD, OTHER]);
    const other = cache.guilds.get(OTHER)!;
    // 100 people and the bot, in two servers.
    expect(cache.users.size).toBe(101);
    expect(guild.members.size).toBe(101);
    expect(cache.limits).toEqual({
      users: Infinity,
      members: 1000,
      messages: 0,
    });
    const kept = guild.members.get(id(99))!;

    // 500 members per server is more than there are: only users leave.
    expect(tighten(cache)).toEqual({ members: 500, users: 50, forgotten: 51 });
    expect(cache.users.size).toBe(50);
    expect(guild.members.size).toBe(101);
    expect(tighten(cache)).toEqual({ members: 250, users: 25, forgotten: 25 });
    expect(tighten(cache)).toEqual({ members: 125, users: 12, forgotten: 13 });
    // 62 per server: 39 leave each of the two servers, and 6 users.
    expect(tighten(cache)).toEqual({ members: 62, users: 6, forgotten: 84 });
    expect(guild.members.size).toBe(62);
    expect(other.members.size).toBe(62);
    expect(guild.members.has(id(0))).toBe(false);
    expect(guild.members.get(id(99))).toBe(kept);
    // The limit is what holds from now on, also for a server that arrives.
    expect(cache.limits).toMatchObject({ members: 62, users: 6 });
    expect(cache.configured).toMatchObject({ members: 1000, users: Infinity });
    for (let n = 200; n < 300; n++) {
      ctx.entities.member(GUILD, rawMember(id(n)) as never);
    }
    expect(guild.members.size).toBe(62);
    expect(cache.users.size).toBe(6);
    const late = ctx.entities.guild({
      id: '100000000000000600',
      name: 'Late',
      owner_id: BOT,
      roles: [],
      emojis: [],
      features: [],
      members: Array.from({ length: 80 }, (_, n) => rawMember(id(n))),
    } as never);
    expect(late.members.size).toBe(62);

    // What keeps everything else true stays.
    expect(cache.guilds.size).toBe(3);
    expect(guild.roles.size).toBe(1);
    expect(guild.channels.size).toBe(1);
    expect(guild.me.id).toBe(BOT);
    expect(kept.guild).toBe(guild);
    expect(kept.user.id).toBe(id(99));

    // Down to nothing, then there is nothing left to give up.
    expect(empty(cache)).toBe(6);
    expect(cache.limits).toMatchObject({ members: 0, users: 0 });
    expect(guild.members.size).toBe(0);
    expect(cache.users.size).toBe(0);
    expect(tighten(cache)).toBeNull();
    expect(guild.me.id).toBe(BOT);
  });

  it('remembers more again, step by step, up to what was configured', async () => {
    const { ctx, cache, guild } = await world(10);
    empty(cache);
    expect(relax(cache)).toEqual({ members: 1, users: Infinity });
    expect(relax(cache)).toEqual({ members: 2, users: Infinity });
    for (let n = 0; n < 10; n++) {
      ctx.entities.member(GUILD, rawMember(id(n)) as never);
    }
    expect(guild.members.size).toBe(2);
    // Users are remembered again as soon as memory allows.
    expect(cache.users.size).toBe(10);
    const steps = [];
    for (let now = relax(cache); now && steps.length < 50; now = relax(cache))
      steps.push(now.members);
    expect(steps).toEqual([4, 8, 16, 32, 64, 128, 256, 512, 1000]);
    expect(cache.limits).toEqual(cache.configured);
    expect(relax(cache)).toBeNull();
  });

  it('still gives the member an event comes with when no member is remembered', async () => {
    const { ctx, cache, guild } = await world(3);
    empty(cache);
    expect(guild.members.size).toBe(0);
    const data = { ...rawMember(id(7)), guild_id: GUILD, nick: 'Seven' };
    for (const name of ['memberJoin', 'memberUpdate'] as const) {
      const built = EVENTS[name].sources[0]!.build(ctx, data as never, {
        joined: false,
        before: undefined,
        prepared: undefined,
      }) as { member: { displayName: string; guild: unknown }; guild: unknown };
      expect(built.member.displayName).toBe('Seven');
      expect(built.member.guild).toBe(guild);
      expect(built.guild).toBe(guild);
    }
  });

  it('reads the memory of the process', () => {
    const reading = readMemory();
    expect(reading.used).toBeGreaterThan(1_000_000);
    expect(reading.limit).toBeGreaterThan(reading.used);
  });

  async function watched(members = 8) {
    const { cache, guild } = await world(members);
    let reading: MemoryReading = { used: 10, limit: 100 };
    const said: string[] = [];
    const watch = watchMemory({
      cache: () => cache,
      onTightened: (now, at) =>
        said.push(
          `less: ${now.members} members, ${now.forgotten} forgotten at ${at.used}`
        ),
      onRestored: now => said.push(`restored: ${now.members} members`),
      onFull: (at, freed) => said.push(`full at ${at.used}, ${freed} freed`),
      read: () => reading,
      every: 60_000,
    });
    return {
      cache,
      guild,
      said,
      watch,
      /** Looks `times` times with memory at `used` percent. */
      at: (used: number, times = 1) => {
        reading = { used, limit: 100 };
        for (let n = 0; n < times; n++) watch.check();
      },
    };
  }

  it('does nothing while memory is fine, or high for a moment', async () => {
    const { watch, said, at, cache } = await watched();
    for (const used of [10, 79, 85, 60, 90, 79.9, 80, 49, 50, 49, 85, 49])
      at(used);
    // Never twice in a row on the same side: Node frees memory by itself,
    // and limits don't move for a moment of calm.
    expect(said).toEqual([]);
    expect(cache.limits).toEqual(cache.configured);
    watch.stop();
  });

  it('remembers less when memory stays high, and only warns with nothing left', async () => {
    const { watch, said, at, cache, guild } = await watched();
    at(80);
    expect(said).toEqual([]);
    at(80);
    // 9 users: 5 leave. 500 members per server is still more than there are.
    expect(said).toEqual(['less: 500 members, 5 forgotten at 80']);
    expect(cache.limits.members).toBe(500);
    at(95, 9);
    expect(cache.limits).toMatchObject({ members: 0, users: 0 });
    expect(guild.members.size).toBe(0);
    expect(said).toHaveLength(10);
    expect(said.at(-1)).toMatch(/^less: 0 members, \d forgotten at 95$/);
    // Nothing left: said once, not at every look.
    at(95, 3);
    // What remembering less gave back: from 80 when it started, to 95.
    expect(said.slice(10)).toEqual(['full at 95, 0 freed']);
    // Between the two levels nothing moves, and nothing is said.
    at(60, 5);
    expect(said).toHaveLength(11);
    expect(cache.limits.members).toBe(0);
    // Full again after that: said again.
    at(99, 2);
    expect(said.slice(11)).toEqual(['full at 99, 0 freed']);
    watch.stop();
  });

  it('says how much remembering less gave back', async () => {
    const { watch, said, at } = await watched();
    // It started at 95 and ended at 82: 13 came back, the rest is not what
    // the bot remembers.
    at(95, 2);
    at(90, 4);
    at(82, 6);
    expect(said.at(-1)).toBe('full at 82, 13 freed');
    // Fine again, then full again without anything to give up: a new count.
    at(60);
    at(85, 2);
    expect(said.at(-1)).toBe('full at 85, 0 freed');
    watch.stop();
  });

  it('remembers more again when memory stays low, and says so once it is all back', async () => {
    const { watch, said, at, cache } = await watched();
    at(90, 4);
    expect(cache.limits.members).toBe(125);
    said.length = 0;
    // Low must last: a look in between, or a high one, starts over.
    for (const used of [49, 60, 49, 90, 49]) at(used);
    expect(cache.limits.members).toBe(125);
    at(60);
    at(49);
    expect(cache.limits.members).toBe(125);
    at(49);
    expect(cache.limits).toMatchObject({ members: 250, users: Infinity });
    at(49);
    expect(cache.limits.members).toBe(500);
    expect(said).toEqual([]);
    at(49);
    expect(said).toEqual(['restored: 1000 members']);
    // All it may: nothing more to do, nothing more to say.
    at(10, 5);
    expect(said).toEqual(['restored: 1000 members']);
    expect(cache.limits).toEqual(cache.configured);
    watch.stop();
  });

  it('warns without a bot to ask, and follows its own levels', async () => {
    const said: string[] = [];
    const watch = watchMemory({
      cache: () => undefined,
      onTightened: () => {
        throw new Error('nothing to give up');
      },
      onRestored: () => {
        throw new Error('nothing to restore');
      },
      onFull: at => said.push(`full at ${at.used}`),
      read: () => ({ used: 55, limit: 100 }),
      high: 0.5,
      every: 60_000,
    });
    watch.check();
    watch.check();
    expect(said).toEqual(['full at 55']);
    watch.stop();
  });

  it('looks by itself from time to time, and stops when told', () => {
    vi.useFakeTimers();
    try {
      const read = vi.fn(() => ({ used: 60, limit: 100 }));
      const watch = watchMemory({
        cache: () => undefined,
        onTightened: () => {},
        onRestored: () => {},
        onFull: () => {},
        read,
        every: 1000,
      });
      vi.advanceTimersByTime(3500);
      expect(read).toHaveBeenCalledTimes(3);
      watch.stop();
      vi.advanceTimersByTime(5000);
      expect(read).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
