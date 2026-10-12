// What each event gives its files, built from what Discord dispatches: the
// real cache, entities and router, with requests sent to a fake Discord.
import { fakeDiscord } from '@chapterjs/test-utils';
import { describe, expect, it } from 'vitest';
import { Cache } from '../src/cache/cache.js';
import { GatewayIntent as I } from '../src/discord/intents.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
} from '../src/discord/types/gateway-events.js';
import { MissingForEvent, type EventName } from '../src/events/registry.js';
import { EventRouter, intentsFor } from '../src/events/router.js';
import { applyDispatch } from '../src/gateway/state.js';
import { RestClient } from '../src/rest/rest.js';
import { createContext } from '../src/structures/entities.js';

const GUILD = '100000000000000000';
const OTHER_GUILD = '100000000000000001';
const BOT = '100000000000000002';
const ALICE = '100000000000000003';
const BOB = '100000000000000004';
const GENERAL = '100000000000000009';
const VOICE = '100000000000000010';
const STAGE = '100000000000000011';
const THREAD = '100000000000000012';
const DM = '100000000000000013';
const MESSAGE = '100000000000000020';
const EMOJI = '100000000000000030';

const user = (id: string, name: string, bot = false) => ({
  id,
  username: name,
  discriminator: '0',
  global_name: null,
  avatar: null,
  ...(bot ? { bot: true } : {}),
});
const member = (id: string, name: string, bot = false) => ({
  user: user(id, name, bot),
  roles: [],
  joined_at: '2024-01-01T00:00:00Z',
  deaf: false,
  mute: false,
  flags: 0,
});
const voiceState = (userId: string, channelId: string | null, more = {}) => ({
  channel_id: channelId,
  user_id: userId,
  session_id: 's',
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: false,
  self_video: false,
  suppress: false,
  request_to_speak_timestamp: null,
  ...more,
});

async function world() {
  const discord = await fakeDiscord();
  const rest = new RestClient({
    token: 't',
    version: '10',
    baseUrl: discord.url,
  });
  const ctx = createContext({ rest, cache: new Cache() });
  ctx.self = { userId: BOT, applicationId: BOT };
  ctx.entities.guild({
    id: GUILD,
    name: 'Dev Server',
    owner_id: BOT,
    roles: [{ id: GUILD, name: '@everyone', permissions: '0', position: 0 }],
    emojis: [
      { id: EMOJI, name: 'party', roles: [], animated: false },
      { id: `${EMOJI.slice(0, -1)}1`, name: 'gone', roles: [] },
    ],
    features: [],
    members: [member(BOT, 'bot', true)],
    channels: [
      { id: GENERAL, type: 0, name: 'general' },
      { id: VOICE, type: 2, name: 'Voice' },
      { id: STAGE, type: 13, name: 'Stage' },
      { id: THREAD, type: 11, name: 'thread', parent_id: GENERAL },
    ],
    voice_states: [voiceState(BOB, VOICE)],
  } as never);
  ctx.entities.channel({
    id: DM,
    type: 1,
    recipients: [user(ALICE, 'alice')],
  } as never);

  const received: { name: EventName; context: Record<string, unknown> }[] = [];
  const errors: unknown[] = [];
  const skipped: [EventName, unknown][] = [];
  const router = new EventRouter(
    (_file, error) => errors.push(error),
    (name, error) => skipped.push([name, error])
  );
  const files: Parameters<EventRouter['set']>[0] extends Iterable<infer F>
    ? F[]
    : never = [];

  return {
    discord,
    ctx,
    received,
    errors,
    skipped,
    /** A file of `src/events/<name>/` with these options. */
    listen(name: EventName, options: Record<string, unknown> = {}) {
      files.push({
        file: `src/events/${name}/x.ts`,
        export: 'default',
        event: {
          name,
          handler: (context: Record<string, unknown>) =>
            received.push({ name, context }),
          options,
        } as never,
      });
      router.set(files);
    },
    /** What Discord dispatches, as the bot applies it. */
    send<E extends GatewayDispatchEventName>(
      event: E,
      data: GatewayDispatchEvents[E] | Record<string, unknown>
    ) {
      const payload = data as GatewayDispatchEvents[E];
      const before = router.before(ctx, event, payload);
      applyDispatch(ctx, event, payload, { shardId: 0, shardCount: 1 });
      router.dispatch(ctx, event, payload, { joined: false, before });
    },
    /** What the files of an event received, once it was delivered. */
    async of(name: EventName, count = 1) {
      const deadline = Date.now() + 2000;
      const got = () => received.filter(entry => entry.name === name);
      while (got().length < count && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      await new Promise(resolve => setTimeout(resolve, 20));
      return got().map(entry => entry.context);
    },
  };
}

describe('what a function receives', () => {
  it.each<
    [EventName, GatewayDispatchEventName, Record<string, unknown>, string[]]
  >([
    [
      'messageCreate',
      'MESSAGE_CREATE',
      {
        id: MESSAGE,
        channel_id: GENERAL,
        guild_id: GUILD,
        author: user(ALICE, 'alice'),
        member: member(ALICE, 'alice'),
        content: 'hi',
        timestamp: '2024-01-01T00:00:00Z',
        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        pinned: false,
        type: 0,
      },
      ['guild', 'message'],
    ],
    [
      'memberLeave',
      'GUILD_MEMBER_REMOVE',
      { guild_id: GUILD, user: user(ALICE, 'alice') },
      ['guild', 'user'],
    ],
    [
      'channelCreate',
      'CHANNEL_CREATE',
      { id: '100000000000000040', type: 0, name: 'new', guild_id: GUILD },
      ['channel', 'guild'],
    ],
    [
      'roleCreate',
      'GUILD_ROLE_CREATE',
      {
        guild_id: GUILD,
        role: {
          id: '100000000000000041',
          name: 'Mod',
          permissions: '0',
          position: 1,
        },
      },
      ['guild', 'role'],
    ],
  ])(
    'for %s: what it is about and the server, nothing more',
    async (name, event, data, keys) => {
      const w = await world();
      w.listen(name);
      w.send(event, data);
      const [context] = await w.of(name);
      expect(Object.keys(context!).sort()).toEqual(keys);
      expect((context!.guild as { id: string }).id).toBe(GUILD);
    }
  );

  it('only gives the channels of a server, as the types promise', async () => {
    const w = await world();
    w.listen('channelUpdate');
    // Discord sends channel events with the Guilds intent only: a private
    // conversation that came anyway is not given as one of a server.
    w.send('CHANNEL_UPDATE', {
      id: DM,
      type: 1,
      recipients: [user(ALICE, 'alice')],
    });
    w.send('CHANNEL_UPDATE', {
      id: '100000000000000040',
      type: 0,
      name: 'renamed',
      guild_id: GUILD,
    });
    const contexts = await w.of('channelUpdate');
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ guild: { id: GUILD } });
  });
});

describe('reactions', () => {
  const add = (more: Record<string, unknown> = {}) => ({
    user_id: ALICE,
    channel_id: GENERAL,
    message_id: MESSAGE,
    guild_id: GUILD,
    member: member(ALICE, 'alice'),
    emoji: { id: null, name: '👍' },
    message_author_id: BOT,
    burst: false,
    type: 0,
    ...more,
  });

  it('give who reacted, where and with what, in a server', async () => {
    const w = await world();
    w.listen('reactionAdd');
    w.send('MESSAGE_REACTION_ADD', add());
    const [context] = await w.of('reactionAdd');
    // The reaction, the server, and nothing else.
    expect(Object.keys(context!).sort()).toEqual(['guild', 'reaction']);
    expect(context!.reaction).toMatchObject({
      emoji: { id: null, name: '👍' },
      burst: false,
      messageId: MESSAGE,
      message: null,
      messageAuthorId: BOT,
      channelId: GENERAL,
      guildId: GUILD,
    });
    const { guild } = context as never as { guild: { name: string } };
    const {
      user,
      member: who,
      channel,
    } = context!.reaction as never as {
      user: { username: string };
      member: { displayName: string; guild: unknown };
      channel: { id: string };
    };
    expect(user.username).toBe('alice');
    expect(who.displayName).toBe('alice');
    expect(guild.name).toBe('Dev Server');
    expect(channel.id).toBe(GENERAL);
    // Who reacted came with the event: nothing was asked.
    expect(w.discord.requests).toHaveLength(0);
  });

  it('ignore bots unless the file lets them in', async () => {
    const w = await world();
    w.listen('reactionAdd');
    w.listen('reactionAdd', { bots: true });
    w.send(
      'MESSAGE_REACTION_ADD',
      add({ user_id: BOT, member: member(BOT, 'bot', true) })
    );
    expect(await w.of('reactionAdd')).toHaveLength(1);
  });

  it('in private, ask Discord once who reacted, and only reach the files that listen there', async () => {
    const w = await world();
    w.discord.on('GET', `/users/${BOB}`, { body: user(BOB, 'bob'), delay: 20 });
    w.listen('reactionAdd');
    w.listen('reactionAdd', { where: 'dm' });
    w.listen('reactionAdd', { where: 'both' });
    const inDm = add({
      guild_id: undefined,
      member: undefined,
      user_id: BOB,
      channel_id: DM,
    });
    w.send('MESSAGE_REACTION_ADD', inDm);
    w.send('MESSAGE_REACTION_ADD', inDm);
    const got = await w.of('reactionAdd', 4);
    expect(got).toHaveLength(4);
    for (const context of got) {
      expect(context).toMatchObject({
        guild: null,
        reaction: { guildId: null, member: null },
      });
      const reaction = context.reaction as {
        user: { username: string };
        channel: { id: string };
      };
      expect(reaction.user.username).toBe('bob');
      expect(reaction.channel.id).toBe(DM);
    }
    expect(w.discord.requestsTo('GET', `/users/${BOB}`)).toHaveLength(1);
  });

  it('say when Discord refuses who reacted, and deliver nothing', async () => {
    const w = await world();
    w.listen('reactionRemove');
    w.send('MESSAGE_REACTION_REMOVE', {
      user_id: BOB,
      channel_id: GENERAL,
      message_id: MESSAGE,
      guild_id: GUILD,
      emoji: { id: EMOJI, name: 'party' },
      burst: false,
      type: 0,
    });
    // Discord's refusal takes a request: waited for, however long it takes.
    const deadline = Date.now() + 5000;
    while (w.skipped.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(w.received).toHaveLength(0);
    expect(w.skipped.map(([name]) => name)).toEqual(['reactionRemove']);
    const [[, error]] = w.skipped as [[EventName, MissingForEvent]];
    expect(error).toBeInstanceOf(MissingForEvent);
    expect(error.what).toBe('user');
  });

  it('removed give the member only when remembered', async () => {
    const w = await world();
    w.listen('reactionRemove');
    const remove = (userId: string) => ({
      user_id: userId,
      channel_id: GENERAL,
      message_id: MESSAGE,
      guild_id: GUILD,
      emoji: { id: EMOJI, name: 'party' },
      burst: true,
      type: 1,
    });
    w.ctx.entities.member(GUILD, member(ALICE, 'alice') as never);
    w.discord.on('GET', `/users/${BOB}`, { body: user(BOB, 'bob') });
    w.send('MESSAGE_REACTION_REMOVE', remove(ALICE));
    w.send('MESSAGE_REACTION_REMOVE', remove(BOB));
    const [alice, bob] = (await w.of('reactionRemove', 2)).map(
      context =>
        context.reaction as {
          member: { id: string } | null;
          user: { username: string };
        }
    );
    expect(alice!.member!.id).toBe(ALICE);
    expect(alice).toMatchObject({
      emoji: { id: EMOJI, name: 'party' },
      burst: true,
    });
    expect(bob!.member).toBeNull();
    expect(bob!.user.username).toBe('bob');
    // Alice was known: only Bob was asked.
    expect(w.discord.requests.map(request => request.path)).toEqual([
      `/users/${BOB}`,
    ]);
  });

  it.each([
    ['MESSAGE_REACTION_REMOVE_ALL', {}, null],
    [
      'MESSAGE_REACTION_REMOVE_EMOJI',
      { emoji: { id: null, name: '👍' } },
      { id: null, name: '👍' },
    ],
  ] as const)(
    'cleared by %s give the emoji or null',
    async (event, more, emoji) => {
      const w = await world();
      w.listen('reactionClear');
      w.send(event, {
        channel_id: GENERAL,
        message_id: MESSAGE,
        guild_id: GUILD,
        ...more,
      });
      const [context] = await w.of('reactionClear');
      expect(context).toMatchObject({
        reactions: { emoji, messageId: MESSAGE, guildId: GUILD },
      });
      expect((context!.guild as { id: string }).id).toBe(GUILD);
    }
  );

  it('fetch the thread they happen in when the bot never saw it', async () => {
    const w = await world();
    const unknown = '100000000000000099';
    w.discord.on('GET', `/channels/${unknown}`, {
      body: {
        id: unknown,
        type: 11,
        name: 'new',
        guild_id: GUILD,
        parent_id: GENERAL,
      },
    });
    w.listen('reactionClear');
    w.send('MESSAGE_REACTION_REMOVE_ALL', {
      channel_id: unknown,
      message_id: MESSAGE,
      guild_id: GUILD,
    });
    const [context] = await w.of('reactionClear');
    expect(
      (context!.reactions as { channel: { name: string } }).channel.name
    ).toBe('new');
  });
});

describe('polls', () => {
  it.each([
    ['MESSAGE_POLL_VOTE_ADD', 'pollVoteAdd'],
    ['MESSAGE_POLL_VOTE_REMOVE', 'pollVoteRemove'],
  ] as const)('%s gives the answer and who voted', async (event, name) => {
    const w = await world();
    w.ctx.entities.user(user(ALICE, 'alice'));
    w.listen(name);
    w.send(event, {
      user_id: ALICE,
      channel_id: GENERAL,
      message_id: MESSAGE,
      guild_id: GUILD,
      answer_id: 2,
    });
    const [context] = await w.of(name);
    expect(Object.keys(context!).sort()).toEqual(['guild', 'vote']);
    expect(context!.vote).toMatchObject({
      answerId: 2,
      messageId: MESSAGE,
      member: null,
    });
    expect((context!.vote as { user: { id: string } }).user.id).toBe(ALICE);
  });
});

describe('typing', () => {
  it('gives who types and since when', async () => {
    const w = await world();
    w.listen('typingStart');
    w.send('TYPING_START', {
      channel_id: GENERAL,
      guild_id: GUILD,
      user_id: ALICE,
      timestamp: 1_700_000_000,
      member: member(ALICE, 'alice'),
    });
    const [context] = await w.of('typingStart');
    expect(Object.keys(context!).sort()).toEqual(['guild', 'typing']);
    const typing = context!.typing as {
      startedAt: Date;
      member: { id: string };
    };
    expect(typing.startedAt).toEqual(new Date(1_700_000_000_000));
    expect(typing.member.id).toBe(ALICE);
  });
});

describe('the server', () => {
  it('changed', async () => {
    const w = await world();
    w.listen('guildUpdate');
    w.send('GUILD_UPDATE', {
      id: GUILD,
      name: 'Renamed',
      owner_id: BOT,
      features: [],
    });
    const [context] = await w.of('guildUpdate');
    expect((context!.guild as { name: string }).name).toBe('Renamed');
  });

  it.each([
    ['GUILD_BAN_ADD', 'banAdd'],
    ['GUILD_BAN_REMOVE', 'banRemove'],
  ] as const)('%s gives who and where', async (event, name) => {
    const w = await world();
    w.listen(name);
    w.send(event, { guild_id: GUILD, user: user(ALICE, 'alice') });
    w.send(event, { guild_id: OTHER_GUILD, user: user(ALICE, 'alice') });
    const got = await w.of(name);
    expect(got).toHaveLength(1);
    expect((got[0]!.user as { username: string }).username).toBe('alice');
  });

  it('tells each emoji created, changed and deleted from one list', async () => {
    const w = await world();
    w.listen('emojiCreate');
    w.listen('emojiUpdate');
    w.listen('emojiDelete');
    const created = '100000000000000039';
    w.send('GUILD_EMOJIS_UPDATE', {
      guild_id: GUILD,
      emojis: [
        { id: EMOJI, name: 'renamed', roles: [], animated: false },
        { id: created, name: 'new', roles: [] },
      ],
    });
    const names = (name: EventName) =>
      w.received
        .filter(entry => entry.name === name)
        .map(entry => (entry.context.emoji as { name: string }).name);
    await w.of('emojiDelete');
    expect(names('emojiCreate')).toEqual(['new']);
    expect(names('emojiUpdate')).toEqual(['renamed']);
    expect(names('emojiDelete')).toEqual(['gone']);
    // The same list again changes nothing.
    w.received.length = 0;
    w.send('GUILD_EMOJIS_UPDATE', {
      guild_id: GUILD,
      emojis: [
        { id: EMOJI, name: 'renamed', roles: [], animated: false },
        { id: created, name: 'new', roles: [] },
      ],
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(w.received).toHaveLength(0);
  });

  it('gives invites created and deleted', async () => {
    const w = await world();
    w.listen('inviteCreate');
    w.listen('inviteDelete');
    w.send('INVITE_CREATE', {
      channel_id: GENERAL,
      code: 'abc',
      created_at: '2024-01-01T00:00:00Z',
      guild_id: GUILD,
      inviter: user(ALICE, 'alice'),
      max_age: 3600,
      max_uses: 5,
      temporary: false,
      uses: 0,
      expires_at: '2024-01-01T01:00:00Z',
    });
    w.send('INVITE_DELETE', {
      channel_id: GENERAL,
      guild_id: GUILD,
      code: 'abc',
    });
    const [created] = await w.of('inviteCreate');
    const invite = created!.invite as {
      url: string;
      guildId: string;
      channelId: string;
      maxUses: number;
      inviter: { username: string };
      expiresAt: Date;
    };
    expect(invite.url).toBe('https://discord.gg/abc');
    expect(invite).toMatchObject({
      guildId: GUILD,
      channelId: GENERAL,
      maxUses: 5,
    });
    expect(invite.inviter.username).toBe('alice');
    expect(invite.expiresAt).toEqual(new Date('2024-01-01T01:00:00Z'));
    // The channel is read from what the bot knows.
    expect((created!.invite as { channel: { id: string } }).channel.id).toBe(
      GENERAL
    );
    expect(Object.keys(created!).sort()).toEqual(['guild', 'invite']);
    const [deleted] = await w.of('inviteDelete');
    const gone = deleted!.invite as { code: string; channel: { id: string } };
    expect(gone.code).toBe('abc');
    expect(gone.channel.id).toBe(GENERAL);
  });

  it('gives what was added to the audit log, in camelCase', async () => {
    const w = await world();
    w.listen('auditLogEntryCreate');
    w.send('GUILD_AUDIT_LOG_ENTRY_CREATE', {
      guild_id: GUILD,
      id: '100000000000000050',
      action_type: 20,
      user_id: ALICE,
      target_id: BOB,
      reason: 'spam',
    });
    const [context] = await w.of('auditLogEntryCreate');
    expect(context!.entry).toEqual({
      id: '100000000000000050',
      actionType: 20,
      userId: ALICE,
      targetId: BOB,
      reason: 'spam',
    });
  });

  it('gives presences, with the user when Discord sends it whole', async () => {
    const w = await world();
    w.listen('presenceUpdate');
    w.send('PRESENCE_UPDATE', {
      user: { id: BOB },
      guild_id: GUILD,
      status: 'idle',
      activities: [],
      client_status: { desktop: 'idle' },
    });
    w.send('PRESENCE_UPDATE', {
      user: user(ALICE, 'alice'),
      guild_id: GUILD,
      status: 'online',
      activities: [{ name: 'Chess', type: 0, created_at: 1 }],
      client_status: { mobile: 'online' },
    });
    const [bob, alice] = await w.of('presenceUpdate', 2);
    expect(Object.keys(bob!).sort()).toEqual(['guild', 'presence']);
    expect(bob!.presence).toMatchObject({
      userId: BOB,
      user: null,
      member: null,
      status: 'idle',
      activities: [],
      clientStatus: { desktop: 'idle' },
    });
    expect(
      (alice!.presence as { user: { username: string } }).user.username
    ).toBe('alice');
    expect(alice!.presence).toMatchObject({
      activities: [{ name: 'Chess', type: 0, createdAt: 1 }],
    });
  });
});

describe('threads', () => {
  it('give each member added and removed', async () => {
    const w = await world();
    w.ctx.entities.member(GUILD, member(BOB, 'bob') as never);
    w.listen('threadMemberJoin');
    w.listen('threadMemberLeave');
    w.send('THREAD_MEMBERS_UPDATE', {
      id: THREAD,
      guild_id: GUILD,
      member_count: 2,
      added_members: [
        {
          id: THREAD,
          user_id: ALICE,
          join_timestamp: '2024-01-01T00:00:00Z',
          flags: 0,
          member: member(ALICE, 'alice'),
        },
      ],
      removed_member_ids: [BOB, '100000000000000077'],
    });
    const [joined] = await w.of('threadMemberJoin');
    expect((joined!.member as { displayName: string }).displayName).toBe(
      'alice'
    );
    expect((joined!.thread as { id: string }).id).toBe(THREAD);
    const left = await w.of('threadMemberLeave', 2);
    expect(left.map(context => context.userId)).toEqual([
      BOB,
      '100000000000000077',
    ]);
    expect((left[0]!.member as { id: string }).id).toBe(BOB);
    expect(left[1]).toMatchObject({ member: null });
    expect(Object.keys(joined!).sort()).toEqual(['guild', 'member', 'thread']);
    expect(Object.keys(left[1]!).sort()).toEqual([
      'guild',
      'member',
      'thread',
      'userId',
    ]);
  });
});

describe('voice', () => {
  const update = (userId: string, channelId: string | null, more = {}) => ({
    guild_id: GUILD,
    member: member(userId, userId === ALICE ? 'alice' : 'bob'),
    ...voiceState(userId, channelId, more),
  });

  it('tells joins, moves, changes and leaves apart', async () => {
    const w = await world();
    for (const name of [
      'voiceJoin',
      'voiceMove',
      'voiceUpdate',
      'voiceLeave',
    ] as const) {
      w.listen(name);
    }
    w.send('VOICE_STATE_UPDATE', update(ALICE, VOICE));
    w.send('VOICE_STATE_UPDATE', update(ALICE, VOICE, { self_mute: true }));
    w.send('VOICE_STATE_UPDATE', update(ALICE, STAGE, { self_mute: true }));
    // Nothing changed: no event.
    w.send('VOICE_STATE_UPDATE', update(ALICE, STAGE, { self_mute: true }));
    w.send('VOICE_STATE_UPDATE', update(ALICE, null));
    await w.of('voiceLeave');
    expect(w.received.map(entry => entry.name)).toEqual([
      'voiceJoin',
      'voiceUpdate',
      'voiceMove',
      'voiceLeave',
    ]);
    type Voice = {
      channel: { id: string };
      from: { id: string };
      to: { id: string };
      member: { displayName: string };
      state: unknown;
      before: unknown;
    };
    const [join, change, move, leave] = w.received.map(entry => {
      expect(Object.keys(entry.context).sort()).toEqual(['guild', 'voice']);
      return entry.context.voice as Voice;
    });
    expect(join!.channel.id).toBe(VOICE);
    expect(join!.state).toMatchObject({
      channelId: VOICE,
      userId: ALICE,
      selfMute: false,
    });
    expect(change!.before).toMatchObject({ selfMute: false });
    expect(change!.state).toMatchObject({ selfMute: true });
    expect(move!.from.id).toBe(VOICE);
    expect(move!.to.id).toBe(STAGE);
    expect(leave!.channel.id).toBe(STAGE);
    expect(leave!.state).toMatchObject({ channelId: STAGE, selfMute: true });
    expect(leave!.member.displayName).toBe('alice');
  });

  it('knows who was in voice when the server was sent, even in a channel deleted since', async () => {
    const w = await world();
    w.listen('voiceLeave');
    w.listen('voiceJoin');
    w.send('CHANNEL_DELETE', { id: VOICE, type: 2, guild_id: GUILD });
    w.send('VOICE_STATE_UPDATE', update(BOB, null));
    const [leave] = await w.of('voiceLeave');
    expect((leave!.voice as { channel: { name: string } }).channel.name).toBe(
      'Voice'
    );
    expect(w.received.map(entry => entry.name)).toEqual(['voiceLeave']);
  });

  it('forgets who left the server', async () => {
    const w = await world();
    w.listen('voiceJoin');
    w.send('GUILD_MEMBER_REMOVE', { guild_id: GUILD, user: user(BOB, 'bob') });
    w.send('VOICE_STATE_UPDATE', update(BOB, VOICE));
    expect(await w.of('voiceJoin')).toHaveLength(1);
  });
});

describe('scheduled events', () => {
  const scheduled = {
    id: '100000000000000060',
    guild_id: GUILD,
    channel_id: null,
    creator_id: ALICE,
    creator: user(ALICE, 'alice'),
    name: 'Game night',
    scheduled_start_time: '2024-01-01T20:00:00Z',
    scheduled_end_time: null,
    privacy_level: 2,
    status: 1,
    entity_type: 3,
    entity_id: null,
    entity_metadata: { location: 'Online' },
  };

  it.each([
    ['GUILD_SCHEDULED_EVENT_CREATE', 'scheduledEventCreate'],
    ['GUILD_SCHEDULED_EVENT_UPDATE', 'scheduledEventUpdate'],
    ['GUILD_SCHEDULED_EVENT_DELETE', 'scheduledEventDelete'],
  ] as const)('%s gives it in camelCase', async (event, name) => {
    const w = await world();
    w.listen(name);
    w.send(event, scheduled);
    const [context] = await w.of(name);
    expect(context!.scheduledEvent).toMatchObject({
      name: 'Game night',
      scheduledStartTime: '2024-01-01T20:00:00Z',
      entityMetadata: { location: 'Online' },
    });
  });

  it.each([
    ['GUILD_SCHEDULED_EVENT_USER_ADD', 'scheduledEventUserAdd'],
    ['GUILD_SCHEDULED_EVENT_USER_REMOVE', 'scheduledEventUserRemove'],
  ] as const)(
    '%s gives who, asking Discord when unknown',
    async (event, name) => {
      const w = await world();
      w.discord.on('GET', `/users/${BOB}`, { body: user(BOB, 'bob') });
      w.listen(name);
      w.send(event, {
        guild_scheduled_event_id: scheduled.id,
        user_id: BOB,
        guild_id: GUILD,
      });
      const [context] = await w.of(name);
      expect(Object.keys(context!).sort()).toEqual(['guild', 'interest']);
      const interest = context!.interest as {
        scheduledEventId: string;
        user: { username: string };
      };
      expect(interest.scheduledEventId).toBe(scheduled.id);
      expect(interest.user.username).toBe('bob');
    }
  );
});

describe('messages deleted together', () => {
  it('are one messageDelete each', async () => {
    const w = await world();
    w.listen('messageDelete');
    w.send('MESSAGE_DELETE_BULK', {
      ids: ['1', '2', '3'],
      channel_id: GENERAL,
      guild_id: GUILD,
    });
    const got = await w.of('messageDelete', 3);
    expect(got.map(context => (context.message as { id: string }).id)).toEqual([
      '1',
      '2',
      '3',
    ]);
    for (const context of got) {
      expect(Object.keys(context).sort()).toEqual(['guild', 'message']);
      expect(context.message).toMatchObject({
        channelId: GENERAL,
        guildId: GUILD,
        before: null,
      });
    }
  });
});

describe('the intents of the new events', () => {
  const file = (name: EventName, options: Record<string, unknown> = {}) => ({
    file: `src/events/${name}/x.ts`,
    export: 'default',
    event: { name, handler: () => {}, options } as never,
  });
  it.each<[EventName, Record<string, unknown>, number]>([
    ['reactionAdd', {}, I.GuildMessageReactions],
    ['reactionRemove', { where: 'dm' }, I.DirectMessageReactions],
    [
      'reactionClear',
      { where: 'both' },
      I.GuildMessageReactions | I.DirectMessageReactions,
    ],
    ['pollVoteAdd', {}, I.GuildMessagePolls],
    ['pollVoteRemove', { where: 'dm' }, I.DirectMessagePolls],
    [
      'typingStart',
      { where: 'both' },
      I.GuildMessageTyping | I.DirectMessageTyping,
    ],
    ['threadMemberJoin', {}, I.GuildMembers],
    ['voiceJoin', {}, I.GuildVoiceStates],
    ['banAdd', {}, I.GuildModeration],
    ['auditLogEntryCreate', {}, I.GuildModeration],
    ['emojiDelete', {}, I.GuildExpressions],
    ['inviteCreate', {}, I.GuildInvites],
    ['presenceUpdate', {}, I.GuildPresences],
    ['scheduledEventUserAdd', {}, I.GuildScheduledEvents],
    ['guildUpdate', {}, 0],
  ])('%s %j asks for what it needs', (name, options, intents) => {
    expect(intentsFor([file(name, options)])).toBe(I.Guilds | intents);
  });
});
