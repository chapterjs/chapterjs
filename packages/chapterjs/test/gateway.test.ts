import {
  fakeDiscord,
  fakeGateway,
  type FakeGateway,
  type FakeGatewayBehavior,
} from '@chapterjs/test-utils';
import { describe, expect, it } from 'vitest';
import { createBot, type BotEvent, type BotOptions } from '../src/core/bot.js';
import { GatewayOpcode } from '../src/discord/codes.js';
import { GatewayIntent } from '../src/discord/intents.js';
import { ChannelType } from '../src/discord/types/channel.js';
import { GatewayFatalError, SessionLimitError } from '../src/gateway/errors.js';
import { shardIdFor } from '../src/gateway/gateway.js';
import { IdentifyQueue } from '../src/gateway/identify-queue.js';
import {
  Shard,
  type ShardEvent,
  type ShardOptions,
} from '../src/gateway/shard.js';
import { tracksState } from '../src/gateway/state.js';
import { InvalidTokenError } from '../src/rest/errors.js';

const BOT = '100000000000000002';
const GUILD = '100000000000000000';
const GENERAL = '100000000000000021';
const ALICE = '100000000000000003';

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const noGate = { wait: () => Promise.resolve() };

/** A shard connected to a fake gateway, with everything it reports. */
async function startShard(
  behavior: Partial<FakeGatewayBehavior> = {},
  options: Partial<ShardOptions> = {}
) {
  const gateway = await fakeGateway(behavior);
  const dispatched: { event: string; data: unknown }[] = [];
  const events: ShardEvent[] = [];
  const shard = new Shard({
    id: 0,
    count: 1,
    token: 'test-token',
    intents: 513,
    url: gateway.url,
    identifyGate: noGate,
    onDispatch: (event, data) => dispatched.push({ event, data }),
    onEvent: event => events.push(event),
    backoff: () => 10,
    ...options,
  });
  return { gateway, shard, dispatched, events };
}

describe('a shard', () => {
  it('connects with the version and encoding, identifies and becomes ready', async () => {
    const { gateway, shard, dispatched, events } = await startShard();
    expect(shard.status).toBe('idle');
    await shard.connect();

    expect(shard.status).toBe('ready');
    const [connection] = gateway.connections;
    expect(connection!.query).toEqual({ v: '10', encoding: 'json' });
    const identify = await connection!.waitFor(GatewayOpcode.Identify);
    expect(identify.d).toEqual({
      token: 'test-token',
      intents: 513,
      properties: {
        os: process.platform,
        browser: 'chapterjs',
        device: 'chapterjs',
      },
      shard: [0, 1],
    });
    expect(dispatched.map(one => one.event)).toEqual(['READY']);
    expect(events).toEqual([{ type: 'ready', shardId: 0, resumed: false }]);
    await shard.close();
  });

  it('sends its shard and its first presence when identifying', async () => {
    const presence = {
      since: null,
      activities: [],
      status: 'idle' as const,
      afk: false,
    };
    const { gateway, shard } = await startShard(
      {},
      { id: 3, count: 8, presence }
    );
    await shard.connect();
    const identify = await gateway.connections[0]!.waitFor(
      GatewayOpcode.Identify
    );
    expect(identify.d).toMatchObject({ shard: [3, 8], presence });
    await shard.close();
  });

  it('cannot be started twice', async () => {
    const { shard } = await startShard();
    await shard.connect();
    expect(() => shard.connect()).toThrow(/already started/);
    await shard.close();
  });

  it('waits for its turn before identifying', async () => {
    let open!: () => void;
    const gate = { wait: () => new Promise<void>(resolve => (open = resolve)) };
    const { gateway, shard } = await startShard({}, { identifyGate: gate });
    const ready = shard.connect();
    const connection = await gateway.connection(0);
    await tick(60);
    expect(shard.status).toBe('identifying');
    expect(
      connection.received.some(payload => payload.op === GatewayOpcode.Identify)
    ).toBe(false);
    open();
    await ready;
    expect(
      connection.received.some(payload => payload.op === GatewayOpcode.Identify)
    ).toBe(true);
    await shard.close();
  });

  it('identifies once, on the live connection, when one dropped while it waited', async () => {
    const turns: (() => void)[] = [];
    const gate = {
      wait: () => new Promise<void>(resolve => turns.push(resolve)),
    };
    const { gateway, shard } = await startShard({}, { identifyGate: gate });
    const ready = shard.connect();
    const first = await gateway.connection(0);
    await tick();
    first.drop();
    const second = await gateway.connection(1);
    await tick();
    // Both turns come: the one asked for the dead connection must be ignored.
    for (const open of turns) open();
    await ready;
    await tick();
    expect(
      second.received.filter(payload => payload.op === GatewayOpcode.Identify)
    ).toHaveLength(1);
    await shard.close();
  });

  it('heartbeats with the last sequence number, within the interval', async () => {
    const { gateway, shard } = await startShard({ heartbeatInterval: 60 });
    await shard.connect();
    const connection = gateway.connections[0]!;
    connection.dispatch('TYPING_START', {});
    connection.dispatch('TYPING_START', {});
    await tick(250);
    const beats = connection.received.filter(
      payload => payload.op === GatewayOpcode.Heartbeat
    );
    // The first one comes after interval * jitter, then one per interval.
    expect(beats.length).toBeGreaterThanOrEqual(3);
    expect(beats.length).toBeLessThanOrEqual(5);
    // Ready was 1, then two events.
    expect(beats.at(-1)!.d).toBe(3);
    expect(shard.ping).toBeGreaterThanOrEqual(0);
    expect(shard.ping).toBeLessThan(100);
    expect(shard.status).toBe('ready');
    await shard.close();
  });

  it('answers a heartbeat request at once', async () => {
    const { gateway, shard } = await startShard();
    await shard.connect();
    const connection = gateway.connections[0]!;
    expect(
      connection.received.some(
        payload => payload.op === GatewayOpcode.Heartbeat
      )
    ).toBe(false);
    connection.send({ op: GatewayOpcode.Heartbeat });
    const beat = await connection.waitFor(GatewayOpcode.Heartbeat);
    expect(beat.d).toBe(1);
    await shard.close();
  });

  it('resumes on the URL of Ready when Discord asks to reconnect', async () => {
    const other = await fakeGateway();
    const { gateway, shard, dispatched, events } = await startShard({
      ready: { session_id: 'abc', resume_gateway_url: other.url },
    });
    await shard.connect();
    const first = gateway.connections[0]!;
    first.dispatch('TYPING_START', { n: 1 });
    await tick();
    first.send({ op: GatewayOpcode.Reconnect, d: null });

    const second = await other.connection(0);
    const resume = await second.waitFor(GatewayOpcode.Resume);
    expect(resume.d).toEqual({
      token: 'test-token',
      session_id: 'abc',
      seq: 2,
    });
    expect(second.query).toEqual({ v: '10', encoding: 'json' });
    expect(
      second.received.some(payload => payload.op === GatewayOpcode.Identify)
    ).toBe(false);
    // The old connection was closed with a code that keeps the session.
    expect(await first.waitForClose()).not.toBe(1000);
    expect(await first.waitForClose()).not.toBe(1001);

    second.dispatch('TYPING_START', { n: 2 });
    await tick();
    expect(shard.status).toBe('ready');
    expect(dispatched.map(one => one.event)).toEqual([
      'READY',
      'TYPING_START',
      'RESUMED',
      'TYPING_START',
    ]);
    expect(events).toEqual([
      { type: 'ready', shardId: 0, resumed: false },
      {
        type: 'disconnected',
        shardId: 0,
        code: null,
        resumable: true,
        retryIn: 10,
      },
      { type: 'ready', shardId: 0, resumed: true },
    ]);
    // Only the original gateway ever got an Identify.
    expect(gateway.connections).toHaveLength(1);
    await shard.close();
  });

  it.each([
    ['a dropped connection', null],
    ['an unknown error', 4000],
    ['a rate limit', 4008],
    ['an unknown close code', 4999],
  ])('resumes after %s', async (_name, code) => {
    const { gateway, shard, events } = await startShard();
    await shard.connect();
    if (code === null) gateway.connections[0]!.drop();
    else gateway.connections[0]!.close(code);
    const second = await gateway.connection(1);
    await second.waitFor(GatewayOpcode.Resume);
    await tick();
    expect(shard.status).toBe('ready');
    expect(events[1]).toEqual({
      type: 'disconnected',
      shardId: 0,
      code,
      resumable: true,
      retryIn: 10,
    });
    await shard.close();
  });

  it.each([
    ['not authenticated', 4003],
    ['an invalid seq', 4007],
    ['a session that timed out', 4009],
    ['a normal closure', 1000],
  ])('starts a new session after %s', async (_name, code) => {
    const { gateway, shard, events } = await startShard();
    await shard.connect();
    gateway.connections[0]!.close(code);
    const second = await gateway.connection(1);
    await second.waitFor(GatewayOpcode.Identify);
    expect(
      second.received.some(payload => payload.op === GatewayOpcode.Resume)
    ).toBe(false);
    expect(events[1]).toMatchObject({
      type: 'disconnected',
      code,
      resumable: false,
    });
    await tick();
    expect(shard.status).toBe('ready');
    await shard.close();
  });

  it('follows what an invalid session says: resume or start over', async () => {
    const { gateway, shard } = await startShard();
    await shard.connect();
    gateway.connections[0]!.send({ op: GatewayOpcode.InvalidSession, d: true });
    const second = await gateway.connection(1);
    await second.waitFor(GatewayOpcode.Resume);

    second.send({ op: GatewayOpcode.InvalidSession, d: false });
    const third = await gateway.connection(2);
    await third.waitFor(GatewayOpcode.Identify);
    // A session that can't be resumed is ended cleanly.
    expect(await second.waitForClose()).toBe(1000);
    await tick();
    expect(shard.status).toBe('ready');
    await shard.close();
  });

  it('starts over when the resume was refused', async () => {
    const { gateway, shard, dispatched } = await startShard();
    gateway.behavior.onResume = connection =>
      connection.send({ op: GatewayOpcode.InvalidSession, d: false });
    await shard.connect();
    gateway.connections[0]!.drop();
    const third = await gateway.connection(2);
    await third.waitFor(GatewayOpcode.Identify);
    await tick();
    expect(dispatched.map(one => one.event)).toEqual(['READY', 'READY']);
    await shard.close();
  });

  it('goes back to the first URL when the resume URL cannot be reached', async () => {
    const { gateway, shard } = await startShard({
      ready: { resume_gateway_url: 'ws://127.0.0.1:1' },
    });
    await shard.connect();
    gateway.connections[0]!.drop();
    const second = await gateway.connection(1);
    await second.waitFor(GatewayOpcode.Identify);
    await tick();
    expect(shard.status).toBe('ready');
    await shard.close();
  });

  it('reconnects a connection that stopped acknowledging heartbeats', async () => {
    const { gateway, shard } = await startShard({ heartbeatInterval: 40 });
    await shard.connect();
    gateway.behavior.ackHeartbeats = false;
    const second = await gateway.connection(1);
    gateway.behavior.ackHeartbeats = true;
    await second.waitFor(GatewayOpcode.Resume);
    expect(await gateway.connections[0]!.waitForClose()).toBe(4000);
    await tick();
    expect(shard.status).toBe('ready');
    await shard.close();
  });

  it('keeps trying, waiting longer each time, until Discord is back', async () => {
    const attempts: number[] = [];
    const { gateway, shard, events } = await startShard(
      {},
      { backoff: attempt => (attempts.push(attempt), 5) }
    );
    await shard.connect();
    // Discord says Hello then hangs up, three times.
    let refusals = 3;
    gateway.behavior.onResume = connection => {
      if (refusals-- > 0) connection.close(4000);
      else connection.dispatch('RESUMED', {});
    };
    gateway.connections[0]!.close(4000);
    await gateway.connection(4);
    await tick(60);
    expect(shard.status).toBe('ready');
    expect(attempts).toEqual([0, 1, 2, 3]);
    expect(events.at(-1)).toEqual({ type: 'ready', shardId: 0, resumed: true });
    // Once back, the count starts again from zero.
    gateway.behavior.onResume = connection =>
      connection.dispatch('RESUMED', {});
    gateway.connections[4]!.close(4000);
    await gateway.connection(5);
    expect(attempts.at(-1)).toBe(0);
    await shard.close();
  });

  it.each([
    [4004, /BOT_TOKEN/],
    [4010, /number of shards/],
    [4011, /too many servers/],
    [4012, /update ChapterJS/],
    [4013, /bug in ChapterJS/],
    [
      4014,
      /privileged intents \(GuildMembers, MessageContent\).*Privileged Gateway Intents/,
    ],
  ])('stops for good on the close code %s', async (code, message) => {
    const { gateway, shard, events } = await startShard(
      { onIdentify: connection => connection.close(code) },
      {
        intents:
          GatewayIntent.Guilds |
          GatewayIntent.GuildMembers |
          GatewayIntent.MessageContent,
      }
    );
    const error = await shard.connect().catch(error => error);
    expect(error).toBeInstanceOf(GatewayFatalError);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
    expect(shard.status).toBe('closed');
    expect(events).toEqual([{ type: 'fatal', shardId: 0, error }]);
    await tick(60);
    expect(gateway.connections).toHaveLength(1);
    // Whoever asks later gets the same answer.
    await expect(shard.send(GatewayOpcode.PresenceUpdate, {})).rejects.toBe(
      error
    );
  });

  it('closes cleanly: the session ends and nothing reconnects', async () => {
    const { gateway, shard, events } = await startShard();
    await shard.connect();
    await shard.close();
    expect(await gateway.connections[0]!.waitForClose()).toBe(1000);
    expect(shard.status).toBe('closed');
    await tick(60);
    expect(gateway.connections).toHaveLength(1);
    expect(events).toHaveLength(1);
    await shard.close();
  });

  it('can be closed while it waits to reconnect', async () => {
    const { gateway, shard } = await startShard({}, { backoff: () => 100 });
    await shard.connect();
    gateway.connections[0]!.drop();
    await tick();
    expect(shard.status).toBe('reconnecting');
    await shard.close();
    await tick(150);
    expect(gateway.connections).toHaveLength(1);
  });

  it('sends events once ready, and refuses the ones that are too big', async () => {
    const { gateway, shard } = await startShard();
    const early = shard.send(GatewayOpcode.RequestGuildMembers, {
      guild_id: GUILD,
      limit: 0,
    });
    await shard.connect();
    await early;
    const sent = await gateway.connections[0]!.waitFor(
      GatewayOpcode.RequestGuildMembers
    );
    expect(sent.d).toEqual({ guild_id: GUILD, limit: 0 });

    await expect(
      shard.send(GatewayOpcode.PresenceUpdate, { text: 'é'.repeat(2100) })
    ).rejects.toThrow(/bytes long: Discord accepts 4096 at most/);
    await shard.close();
  });

  it('holds back events when the send limit is reached', async () => {
    const { gateway, shard } = await startShard();
    await shard.connect();
    // Identify counted for one: 114 more fit before the reserve for heartbeats.
    for (let index = 0; index < 114; index++) {
      await shard.send(GatewayOpcode.PresenceUpdate, { index });
    }
    let sent = false;
    void shard
      .send(GatewayOpcode.PresenceUpdate, { index: 'late' })
      .then(() => (sent = true));
    await tick(80);
    expect(sent).toBe(false);
    const received = gateway.connections[0]!.received.filter(
      payload => payload.op === GatewayOpcode.PresenceUpdate
    );
    expect(received).toHaveLength(114);
    await shard.close();
  });

  it('ignores what is not JSON', async () => {
    const { gateway, shard } = await startShard();
    await shard.connect();
    gateway.connections[0]!.send('not a payload' as never);
    gateway.connections[0]!.dispatch('TYPING_START', {});
    await tick();
    expect(shard.status).toBe('ready');
    await shard.close();
  });
});

describe('the identify queue', () => {
  it('lets one shard per bucket identify per interval, buckets in parallel', async () => {
    const queue = new IdentifyQueue(2, 60);
    const started = Date.now();
    const times: Record<number, number> = {};
    await Promise.all(
      [0, 1, 2, 3, 4].map(id =>
        queue.wait(id).then(() => (times[id] = Date.now() - started))
      )
    );
    // Buckets: {0, 2, 4} and {1, 3}.
    expect(times[0]).toBeLessThan(40);
    expect(times[1]).toBeLessThan(40);
    expect(times[2]).toBeGreaterThanOrEqual(55);
    expect(times[3]).toBeGreaterThanOrEqual(55);
    expect(times[2]).toBeLessThan(110);
    expect(times[4]).toBeGreaterThanOrEqual(115);
  });

  it('treats a wrong concurrency as one at a time', async () => {
    const queue = new IdentifyQueue(0, 50);
    const started = Date.now();
    await queue.wait(0);
    await queue.wait(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });
});

describe('sharding', () => {
  it('routes servers with the formula of the documentation', () => {
    expect(shardIdFor('175928847299117063', 1)).toBe(0);
    expect(shardIdFor('175928847299117063', 3)).toBe(
      Number((175928847299117063n >> 22n) % 3n)
    );
    const spread = new Set(
      Array.from({ length: 50 }, (_, n) =>
        shardIdFor(String((BigInt(n) << 22n) + 5n), 4)
      )
    );
    expect([...spread].sort()).toEqual([0, 1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------

const rawGuild = (id = GUILD, extra: Record<string, unknown> = {}) => ({
  id,
  name: 'Test Server',
  owner_id: ALICE,
  roles: [
    { id, name: '@everyone', permissions: '1024', position: 0, color: 0 },
  ],
  emojis: [],
  features: [],
  member_count: 2,
  joined_at: '2024-01-01T00:00:00Z',
  large: false,
  members: [
    {
      user: { id: BOT, username: 'bot', discriminator: '0' },
      roles: [],
      joined_at: null,
      deaf: false,
      mute: false,
      flags: 0,
    },
  ],
  channels: [{ id: GENERAL, type: ChannelType.GuildText, name: 'general' }],
  threads: [],
  voice_states: [],
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  soundboard_sounds: [],
  ...extra,
});

/** A whole bot wired to a fake REST API and a fake gateway. */
async function startBot(
  behavior: Partial<FakeGatewayBehavior> = {},
  options: Partial<BotOptions> = {},
  gatewayBot: Record<string, unknown> = {}
) {
  const discord = await fakeDiscord();
  const gateway: FakeGateway = await fakeGateway(behavior);
  discord.on('GET', '/gateway/bot', {
    body: {
      url: gateway.url,
      shards: 1,
      session_start_limit: {
        total: 1000,
        remaining: 999,
        reset_after: 3_600_000,
        max_concurrency: 1,
      },
      ...gatewayBot,
    },
  });
  const dispatched: { event: string; joined: boolean; shardId: number }[] = [];
  const events: BotEvent[] = [];
  const bot = createBot({
    token: 'test-token',
    version: '1.0.0',
    intents: 513,
    rest: { baseUrl: discord.url },
    gateway: { backoff: () => 10, identifyInterval: 20 },
    guildsTimeout: 150,
    onDispatch: (event, _data, info) => dispatched.push({ event, ...info }),
    onEvent: event => events.push(event),
    ...options,
  });
  return { discord, gateway, bot, dispatched, events };
}

describe('a bot', () => {
  it('connects once every server has sent its data', async () => {
    const { gateway, bot, dispatched, events } = await startBot({
      ready: { guilds: [{ id: GUILD, unavailable: true }] },
    });
    let connected = false;
    const connecting = bot.connect().then(() => (connected = true));
    const connection = await gateway.connection(0);
    await connection.waitFor(GatewayOpcode.Identify);
    await tick(40);
    expect(connected).toBe(false);
    expect(bot.ctx.self).toEqual({ userId: BOT, applicationId: BOT });

    const sentAt = Date.now();
    connection.dispatch('GUILD_CREATE', rawGuild());
    await connecting;
    // Right away: not after the delay given to servers that never answer.
    expect(Date.now() - sentAt).toBeLessThan(100);
    const guild = bot.ctx.cache.guilds.get(GUILD)!;
    expect(guild.name).toBe('Test Server');
    expect(guild.available).toBe(true);
    expect(guild.me?.id).toBe(BOT);
    expect(guild.channels.get(GENERAL)?.isText()).toBe(true);
    expect(dispatched).toEqual([
      { event: 'READY', joined: false, shardId: 0 },
      { event: 'GUILD_CREATE', joined: false, shardId: 0 },
    ]);
    expect(events.map(event => event.type)).toEqual(['ready', 'guildsReady']);
    await bot.close();
    expect(await connection.waitForClose()).toBe(1000);
  });

  it('waits for the servers of every shard, even when one shard is done first', async () => {
    const OTHER = '100000000000000100';
    const { gateway, bot } = await startBot({}, {}, { shards: 2 });
    const original = gateway.behavior.onIdentify;
    gateway.behavior.onIdentify = (connection, data) => {
      const shard = (data as { shard: number[] }).shard[0];
      gateway.behavior.ready = {
        guilds: [{ id: shard === 0 ? GUILD : OTHER, unavailable: true }],
      };
      original(connection, data);
      // The first shard has all its servers before the second one is ready.
      if (shard === 0) connection.dispatch('GUILD_CREATE', rawGuild());
    };
    let connected = false;
    const connecting = bot.connect().then(() => (connected = true));
    const second = await gateway.connection(1);
    await second.waitFor(GatewayOpcode.Identify);
    await tick(40);
    expect(connected).toBe(false);

    second.dispatch('GUILD_CREATE', rawGuild(OTHER));
    await connecting;
    expect([...bot.ctx.cache.guilds.keys()].sort()).toEqual([GUILD, OTHER]);
    await bot.close();
  });

  it('tells a server it just joined from one it was already in', async () => {
    const OTHER = '100000000000000100';
    const { gateway, bot, dispatched } = await startBot({
      ready: { guilds: [{ id: GUILD, unavailable: true }] },
    });
    const connecting = bot.connect();
    const connection = await gateway.connection(0);
    await connection.waitFor(GatewayOpcode.Identify);
    connection.dispatch('GUILD_CREATE', rawGuild());
    await connecting;
    connection.dispatch('GUILD_CREATE', rawGuild(OTHER));
    await tick();
    expect(
      dispatched
        .filter(one => one.event === 'GUILD_CREATE')
        .map(one => one.joined)
    ).toEqual([false, true]);
    expect(bot.ctx.cache.guilds.size).toBe(2);
    // An outage, then the server comes back: the bot did not join it again.
    connection.dispatch('GUILD_DELETE', { id: OTHER, unavailable: true });
    connection.dispatch('GUILD_CREATE', rawGuild(OTHER));
    connection.dispatch('GUILD_CREATE', rawGuild(GUILD));
    await tick();
    expect(dispatched.slice(-3).map(one => one.joined)).toEqual([
      false,
      false,
      false,
    ]);
    await bot.close();
  });

  it('does not wait forever for a server that is down', async () => {
    const { gateway, bot, events, dispatched } = await startBot({
      ready: {
        guilds: [
          { id: GUILD, unavailable: true },
          { id: '100000000000000100', unavailable: true },
        ],
      },
    });
    const started = Date.now();
    const connecting = bot.connect();
    const connection = await gateway.connection(0);
    await connection.waitFor(GatewayOpcode.Identify);
    // One is reported as still down, the other never comes.
    connection.dispatch('GUILD_DELETE', { id: GUILD, unavailable: true });
    await connecting;
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(events.at(-1)).toEqual({ type: 'guildsReady' });
    // When it comes back later, it is still not a server the bot joined.
    connection.dispatch('GUILD_CREATE', rawGuild('100000000000000100'));
    await tick();
    expect(dispatched.at(-1)).toMatchObject({
      event: 'GUILD_CREATE',
      joined: false,
    });
    await bot.close();
  });

  it('connects at once when it is in no server', async () => {
    const { bot, events } = await startBot();
    await bot.connect();
    expect(events.map(event => event.type)).toEqual(['ready', 'guildsReady']);
    expect(bot.gateway.shardCount).toBe(1);
    await bot.close();
  });

  it('starts as many shards as Discord recommends, respecting the identify limit', async () => {
    const identified: { shard: number; at: number }[] = [];
    const started = Date.now();
    const { gateway, bot } = await startBot(
      {},
      { gateway: { backoff: () => 10, identifyInterval: 100 } },
      { shards: 3 }
    );
    const original = gateway.behavior.onIdentify;
    gateway.behavior.onIdentify = (connection, data) => {
      identified.push({
        shard: (data as { shard: number[] }).shard[0]!,
        at: Date.now() - started,
      });
      original(connection, data);
    };
    await bot.connect();
    expect(bot.gateway.shardCount).toBe(3);
    expect([...bot.gateway.shards.keys()]).toEqual([0, 1, 2]);
    expect(identified.map(one => one.shard)).toEqual([0, 1, 2]);
    // max_concurrency 1: one identify per interval (100 ms here). It is
    // measured when the identify arrives, a few ms after the queue let it
    // go, and that delay is not the same for every connection.
    expect(identified[1]!.at - identified[0]!.at).toBeGreaterThanOrEqual(60);
    expect(identified[2]!.at - identified[1]!.at).toBeGreaterThanOrEqual(60);
    expect(bot.gateway.shardFor(GUILD)?.id).toBe(shardIdFor(GUILD, 3));
    await bot.close();
    for (const connection of gateway.connections) {
      expect(await connection.waitForClose()).toBe(1000);
    }
  });

  it('runs only the shards it is given', async () => {
    const { gateway, bot } = await startBot(
      {},
      { shards: { ids: [1, 3], count: 4 } }
    );
    await bot.connect();
    const shards = await Promise.all(
      gateway.connections.map(
        async connection =>
          (
            (await connection.waitFor(GatewayOpcode.Identify)).d as {
              shard: number[];
            }
          ).shard
      )
    );
    expect(shards.sort()).toEqual([
      [1, 4],
      [3, 4],
    ]);
    await expect(
      bot.gateway.send(0, GatewayOpcode.PresenceUpdate, {})
    ).rejects.toThrow(/Shard 0 does not run in this process/);
    await bot.close();
  });

  it.each([
    [[4], 4],
    [[-1], 2],
    [[0.5], 2],
  ])('refuses the shards %j of %s', async (ids, count) => {
    const { gateway, bot } = await startBot({}, { shards: { ids, count } });
    await expect(bot.connect()).rejects.toThrow(/does not exist/);
    expect(gateway.connections).toHaveLength(0);
  });

  it('does not start when the daily session limit would be exceeded', async () => {
    const { gateway, bot } = await startBot(
      {},
      {},
      {
        shards: 2,
        session_start_limit: {
          total: 1000,
          remaining: 1,
          reset_after: 60_000,
          max_concurrency: 1,
        },
      }
    );
    const error = await bot.connect().catch(error => error);
    expect(error).toBeInstanceOf(SessionLimitError);
    expect(error.message).toMatch(
      /needs to start 2 session\(s\) but Discord only allows 1 more/
    );
    expect(error.resetAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    expect(gateway.connections).toHaveLength(0);
  });

  it('reports a refused token before opening any connection', async () => {
    const { discord, gateway, bot } = await startBot();
    discord.on('GET', '/gateway/bot', {
      status: 401,
      body: { code: 0, message: '401: Unauthorized' },
    });
    await expect(bot.connect()).rejects.toThrow(InvalidTokenError);
    expect(gateway.connections).toHaveLength(0);
  });

  it('closes every shard when one is refused', async () => {
    const { gateway, bot } = await startBot({}, {}, { shards: 2 });
    const original = gateway.behavior.onIdentify;
    gateway.behavior.onIdentify = (connection, data) => {
      if ((data as { shard: number[] }).shard[0] === 1) connection.close(4014);
      else original(connection, data);
    };
    await expect(bot.connect()).rejects.toThrow(GatewayFatalError);
    await tick(60);
    expect([...bot.gateway.shards.values()].map(shard => shard.status)).toEqual(
      ['closed', 'closed']
    );
    expect(gateway.connections).toHaveLength(2);
  });

  it('still delivers an event the cache could not take', async () => {
    const { gateway, bot, dispatched, events } = await startBot();
    await bot.connect();
    gateway.connections[0]!.dispatch('GUILD_MEMBER_ADD', {
      guild_id: GUILD,
      roles: [],
    });
    await tick();
    expect(dispatched.at(-1)!.event).toBe('GUILD_MEMBER_ADD');
    expect(events.at(-1)).toMatchObject({
      type: 'stateError',
      event: 'GUILD_MEMBER_ADD',
    });
    gateway.connections[0]!.dispatch('TYPING_START', {});
    await tick();
    expect(dispatched.at(-1)!.event).toBe('TYPING_START');
    await bot.close();
  });
});

describe('the cache follows events', () => {
  const member = (id: string, extra: Record<string, unknown> = {}) => ({
    user: { id, username: `user${id.slice(-2)}`, discriminator: '0' },
    roles: [],
    joined_at: '2024-01-01T00:00:00Z',
    deaf: false,
    mute: false,
    flags: 0,
    ...extra,
  });

  async function connected(options: Partial<BotOptions> = {}) {
    const context = await startBot(
      { ready: { guilds: [{ id: GUILD, unavailable: true }] } },
      options
    );
    const connecting = context.bot.connect();
    const connection = await context.gateway.connection(0);
    await connection.waitFor(GatewayOpcode.Identify);
    connection.dispatch('GUILD_CREATE', rawGuild());
    await connecting;
    const send = async (type: string, data: unknown) => {
      connection.dispatch(type, data);
      await tick(15);
    };
    const guild = context.bot.ctx.cache.guilds.get(GUILD)!;
    return {
      ...context,
      connection,
      send,
      guild,
      cache: context.bot.ctx.cache,
    };
  }

  it('for the server itself', async () => {
    const { send, guild, cache, bot } = await connected();
    await send('GUILD_UPDATE', {
      id: GUILD,
      name: 'Renamed',
      owner_id: ALICE,
      roles: [{ id: GUILD, name: '@everyone', permissions: '0' }],
      emojis: [],
    });
    expect(guild.name).toBe('Renamed');
    expect(guild.channels.size).toBe(1);

    await send('GUILD_DELETE', { id: GUILD, unavailable: true });
    expect(guild.available).toBe(false);
    expect(cache.guilds.has(GUILD)).toBe(true);
    await send('GUILD_CREATE', rawGuild(GUILD, { channels: [] }));
    expect(guild.available).toBe(true);
    // The channel deleted during the outage is gone.
    expect(guild.channels.size).toBe(0);
    expect(cache.channels.has(GENERAL)).toBe(false);

    await send('GUILD_DELETE', { id: GUILD });
    expect(cache.guilds.has(GUILD)).toBe(false);
    await send('GUILD_DELETE', { id: GUILD });
    await bot.close();
  });

  it('for roles, emojis and the bot itself', async () => {
    const { send, guild, cache, bot } = await connected();
    const ROLE = '100000000000000010';
    await send('GUILD_ROLE_CREATE', {
      guild_id: GUILD,
      role: { id: ROLE, name: 'Mod', permissions: '4', position: 1 },
    });
    const role = guild.roles.get(ROLE)!;
    expect(role.permissions.has('BanMembers')).toBe(true);
    await send('GUILD_ROLE_UPDATE', {
      guild_id: GUILD,
      role: { id: ROLE, name: 'Staff', permissions: '2', position: 1 },
    });
    expect(role.name).toBe('Staff');
    await send('GUILD_ROLE_DELETE', { guild_id: GUILD, role_id: ROLE });
    expect(guild.roles.has(ROLE)).toBe(false);

    await send('GUILD_EMOJIS_UPDATE', {
      guild_id: GUILD,
      emojis: [
        { id: '100000000000000040', name: 'a' },
        { id: '100000000000000041', name: 'b' },
      ],
    });
    expect([...guild.emojis.keys()]).toEqual([
      '100000000000000040',
      '100000000000000041',
    ]);
    await send('GUILD_EMOJIS_UPDATE', {
      guild_id: GUILD,
      emojis: [{ id: '100000000000000041', name: 'b2' }],
    });
    expect([...guild.emojis.values()].map(emoji => emoji.name)).toEqual(['b2']);

    await send('USER_UPDATE', {
      id: BOT,
      username: 'renamed-bot',
      discriminator: '0',
    });
    expect(cache.users.get(BOT)?.username).toBe('renamed-bot');
    expect(guild.me?.user.username).toBe('renamed-bot');
    // Events about a server the bot does not know are ignored.
    await send('GUILD_ROLE_DELETE', {
      guild_id: '100000000000000999',
      role_id: ROLE,
    });
    await send('GUILD_EMOJIS_UPDATE', {
      guild_id: '100000000000000999',
      emojis: [],
    });
    await bot.close();
  });

  it('for members, keeping the count', async () => {
    const { send, guild, bot, events } = await connected();
    expect(guild.memberCount).toBe(2);
    await send('GUILD_MEMBER_ADD', { guild_id: GUILD, ...member(ALICE) });
    expect(guild.memberCount).toBe(3);
    const alice = guild.members.get(ALICE)!;
    // Sent twice by Discord: counted once.
    await send('GUILD_MEMBER_ADD', { guild_id: GUILD, ...member(ALICE) });
    expect(guild.memberCount).toBe(3);

    await send('GUILD_MEMBER_UPDATE', {
      guild_id: GUILD,
      user: { id: ALICE, username: 'alice-new', discriminator: '0' },
      roles: [GUILD],
      nick: 'Ali',
      avatar: null,
      banner: null,
      joined_at: '2024-01-01T00:00:00Z',
    });
    expect(guild.members.get(ALICE)).toBe(alice);
    expect(alice.nick).toBe('Ali');
    expect(alice.user.username).toBe('alice-new');
    expect(alice.roleIds).toEqual([GUILD]);
    expect(alice.toJSON()).not.toHaveProperty('guildId');

    await send('GUILD_MEMBERS_CHUNK', {
      guild_id: GUILD,
      members: [member('100000000000000004'), member('100000000000000005')],
      chunk_index: 0,
      chunk_count: 1,
    });
    expect(guild.members.size).toBe(4);
    // A chunk only fills the cache: the server did not grow.
    expect(guild.memberCount).toBe(3);

    await send('GUILD_MEMBER_REMOVE', {
      guild_id: GUILD,
      user: { id: ALICE, username: 'alice-new', discriminator: '0' },
    });
    expect(guild.members.has(ALICE)).toBe(false);
    expect(guild.memberCount).toBe(2);
    expect(events.filter(event => event.type === 'stateError')).toEqual([]);
    await bot.close();
  });

  it('for channels and threads', async () => {
    const { send, guild, cache, bot } = await connected();
    const VOICE = '100000000000000022';
    const THREAD = '100000000000000024';
    const OLD_THREAD = '100000000000000025';
    await send('CHANNEL_CREATE', {
      id: VOICE,
      type: ChannelType.GuildVoice,
      guild_id: GUILD,
      name: 'voice',
    });
    expect(guild.channels.get(VOICE)?.isVoice()).toBe(true);
    await send('CHANNEL_UPDATE', {
      id: VOICE,
      type: ChannelType.GuildVoice,
      guild_id: GUILD,
      name: 'lounge',
    });
    expect(guild.channels.get(VOICE)?.name).toBe('lounge');
    await send('CHANNEL_PINS_UPDATE', {
      guild_id: GUILD,
      channel_id: GENERAL,
      last_pin_timestamp: '2024-06-06T00:00:00Z',
    });
    expect(cache.channels.get(GENERAL)!.toJSON().lastPinTimestamp).toBe(
      '2024-06-06T00:00:00Z'
    );
    await send('CHANNEL_DELETE', {
      id: VOICE,
      type: ChannelType.GuildVoice,
      guild_id: GUILD,
    });
    expect(guild.channels.has(VOICE)).toBe(false);
    expect(cache.channels.has(VOICE)).toBe(false);

    const thread = (id: string, parent = GENERAL) => ({
      id,
      type: ChannelType.PublicThread,
      guild_id: GUILD,
      parent_id: parent,
      name: `t${id.slice(-2)}`,
    });
    await send('THREAD_CREATE', { ...thread(THREAD), newly_created: true });
    await send('THREAD_CREATE', thread(OLD_THREAD));
    expect(guild.channels.get(THREAD)?.isThread()).toBe(true);
    await send('THREAD_UPDATE', { ...thread(THREAD), name: 'renamed' });
    expect(guild.channels.get(THREAD)?.name).toBe('renamed');

    // A sync of another channel leaves these threads alone…
    await send('THREAD_LIST_SYNC', {
      guild_id: GUILD,
      channel_ids: ['100000000000000099'],
      threads: [],
      members: [],
    });
    expect(guild.channels.has(OLD_THREAD)).toBe(true);
    // …a sync of their channel removes the ones that are no longer active…
    await send('THREAD_LIST_SYNC', {
      guild_id: GUILD,
      channel_ids: [GENERAL],
      threads: [
        {
          id: THREAD,
          type: ChannelType.PublicThread,
          parent_id: GENERAL,
          name: 'synced',
        },
      ],
      members: [],
    });
    expect(guild.channels.has(OLD_THREAD)).toBe(false);
    expect(guild.channels.get(THREAD)?.name).toBe('synced');
    // …and a sync of the whole server too.
    await send('THREAD_LIST_SYNC', {
      guild_id: GUILD,
      threads: [],
      members: [],
    });
    expect(guild.channels.has(THREAD)).toBe(false);
    expect(guild.channels.has(GENERAL)).toBe(true);

    await send('THREAD_CREATE', thread(THREAD));
    await send('THREAD_DELETE', {
      id: THREAD,
      guild_id: GUILD,
      parent_id: GENERAL,
      type: ChannelType.PublicThread,
    });
    expect(cache.channels.has(THREAD)).toBe(false);
    await bot.close();
  });

  it('for messages, when the cache keeps some', async () => {
    const { send, guild, bot } = await connected({
      cache: { limits: { messages: 10 } },
    });
    const general = guild.channels.get(GENERAL)!;
    if (!general.isText()) throw new Error('not a text channel');
    const message = (id: string, content: string) => ({
      id,
      channel_id: GENERAL,
      guild_id: GUILD,
      author: { id: ALICE, username: 'alice', discriminator: '0' },
      member: {
        roles: [],
        joined_at: '2024-01-01T00:00:00Z',
        deaf: false,
        mute: false,
        flags: 0,
      },
      content,
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      type: 0,
    });
    await send('MESSAGE_CREATE', message('100000000000000071', 'one'));
    await send('MESSAGE_CREATE', message('100000000000000072', 'two'));
    await send('MESSAGE_CREATE', message('100000000000000073', 'three'));
    expect(general.lastMessageId).toBe('100000000000000073');
    expect(general.messages.size).toBe(3);
    const first = general.messages.get('100000000000000071')!;
    // The author came with the message: no request needed to know them.
    expect(first.member?.id).toBe(ALICE);
    expect(guild.members.has(ALICE)).toBe(true);

    await send('MESSAGE_UPDATE', {
      ...message('100000000000000071', 'edited'),
      edited_timestamp: '2024-01-02T00:00:00Z',
    });
    expect(general.messages.get('100000000000000071')).toBe(first);
    expect(first.content).toBe('edited');
    expect(first.editedAt).not.toBeNull();

    await send('MESSAGE_DELETE', {
      id: '100000000000000071',
      channel_id: GENERAL,
      guild_id: GUILD,
    });
    expect(general.messages.has('100000000000000071')).toBe(false);
    await send('MESSAGE_DELETE_BULK', {
      ids: ['100000000000000072', '100000000000000073', '100000000000000999'],
      channel_id: GENERAL,
      guild_id: GUILD,
    });
    expect(general.messages.size).toBe(0);
    // Messages of a channel the bot does not know change nothing.
    await send('MESSAGE_DELETE', { id: '1', channel_id: '100000000000000998' });
    await send('MESSAGE_DELETE_BULK', {
      ids: ['1'],
      channel_id: '100000000000000998',
    });
    await bot.close();
  });

  it('keeps no message by default, but still knows the last one', async () => {
    const { send, guild, bot } = await connected();
    const general = guild.channels.get(GENERAL)!;
    if (!general.isText()) throw new Error('not a text channel');
    await send('MESSAGE_CREATE', {
      id: '100000000000000071',
      channel_id: GENERAL,
      guild_id: GUILD,
      author: { id: ALICE, username: 'alice', discriminator: '0' },
      content: 'hi',
      timestamp: '2024-01-01T00:00:00Z',
      edited_timestamp: null,
      mentions: [],
      type: 0,
    });
    expect(general.messages.size).toBe(0);
    expect(general.lastMessageId).toBe('100000000000000071');
    await bot.close();
  });

  it('forgets the servers the bot left while it was disconnected', async () => {
    const GONE = '100000000000000100';
    const { gateway, connection, send, cache, bot } = await connected();
    await send('GUILD_CREATE', rawGuild(GONE));
    expect(cache.guilds.size).toBe(2);
    // The session is lost: a new Ready only lists one server.
    connection.close(4009);
    const second = await gateway.connection(1);
    await second.waitFor(GatewayOpcode.Identify);
    await tick();
    expect(cache.guilds.has(GONE)).toBe(false);
    expect(cache.guilds.has(GUILD)).toBe(true);
    await bot.close();
  });

  it('knows which events it tracks', () => {
    expect(tracksState('GUILD_CREATE')).toBe(true);
    expect(tracksState('MESSAGE_CREATE')).toBe(true);
    expect(tracksState('TYPING_START')).toBe(false);
    expect(tracksState('INTERACTION_CREATE')).toBe(false);
  });
});
