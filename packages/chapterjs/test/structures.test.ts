import { fakeDiscord } from '@chapterjs/test-utils';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { Cache, type CacheOptions } from '../src/cache/cache.js';
import { ChannelType } from '../src/discord/types/channel.js';
import type { RawChannel } from '../src/discord/types/channel.js';
import type { RawGuild, RawGuildMember } from '../src/discord/types/guild.js';
import type { RawMessage } from '../src/discord/types/message.js';
import { PermissionFlags as P } from '../src/discord/types/permissions.js';
import type { RawRole } from '../src/discord/types/permissions.js';
import type { RawUser } from '../src/discord/types/user.js';
import { RestClient } from '../src/rest/rest.js';
import {
  CategoryChannel,
  Channel,
  DMChannel,
  ForumChannel,
  GuildChannel,
  TextChannel,
  ThreadChannel,
  VoiceChannel,
} from '../src/structures/channel.js';
import { originOf } from '../src/structures/base.js';
import { createContext } from '../src/structures/entities.js';
import { storesOf } from '../src/structures/guild.js';
import { remember } from '../src/structures/known.js';
import { buildMessage } from '../src/structures/payload.js';

// Ids are real-looking snowflakes: some code reads their creation date.
const GUILD = '100000000000000000';
const OWNER = '100000000000000001';
const BOT = '100000000000000002';
const ALICE = '100000000000000003';
const MOD_ROLE = '100000000000000010';
const MUTED_ROLE = '100000000000000011';
const CATEGORY = '100000000000000020';
const GENERAL = '100000000000000021';
const VOICE = '100000000000000022';
const FORUM = '100000000000000023';
const THREAD = '100000000000000024';
const DM = '100000000000000030';

const rawUser = (id: string, extra: Partial<RawUser> = {}): RawUser => ({
  id,
  username: `user${id.slice(-2)}`,
  discriminator: '0',
  global_name: null,
  avatar: null,
  ...extra,
});

const rawRole = (id: string, extra: Partial<RawRole> = {}): RawRole => ({
  id,
  name: `role${id.slice(-2)}`,
  color: 0,
  colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
  hoist: false,
  position: 0,
  permissions: '0',
  managed: false,
  mentionable: false,
  flags: 0,
  ...extra,
});

const rawMember = (
  id: string,
  extra: Partial<RawGuildMember> = {}
): RawGuildMember => ({
  user: rawUser(id),
  roles: [],
  joined_at: '2024-01-01T00:00:00.000000+00:00',
  deaf: false,
  mute: false,
  flags: 0,
  ...extra,
});

const rawChannel = (
  id: string,
  type: ChannelType,
  extra: Partial<RawChannel> = {}
): RawChannel => ({ id, type, name: `channel${id.slice(-2)}`, ...extra });

const rawGuild = (extra: Partial<RawGuild> = {}): RawGuild =>
  ({
    id: GUILD,
    name: 'Test Server',
    icon: null,
    splash: null,
    discovery_splash: null,
    owner_id: OWNER,
    afk_channel_id: null,
    afk_timeout: 300,
    verification_level: 1,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: [
      rawRole(GUILD, {
        name: '@everyone',
        permissions: String(P.ViewChannel | P.SendMessages | P.AttachFiles),
      }),
      rawRole(MOD_ROLE, {
        name: 'Mod',
        position: 2,
        permissions: String(P.KickMembers | P.BanMembers),
      }),
      rawRole(MUTED_ROLE, { name: 'Muted', position: 1 }),
    ],
    emojis: [{ id: '100000000000000040', name: 'lol', animated: true }],
    features: ['COMMUNITY'],
    mfa_level: 0,
    application_id: null,
    system_channel_id: GENERAL,
    system_channel_flags: 0,
    rules_channel_id: null,
    vanity_url_code: null,
    description: null,
    banner: null,
    premium_tier: 0,
    preferred_locale: 'en-US',
    public_updates_channel_id: null,
    nsfw_level: 0,
    premium_progress_bar_enabled: false,
    safety_alerts_channel_id: null,
    incidents_data: null,
    ...extra,
  }) as RawGuild;

const rawMessage = (
  id: string,
  extra: Partial<RawMessage> = {}
): RawMessage => ({
  id,
  channel_id: GENERAL,
  author: rawUser(ALICE),
  content: 'hello',
  timestamp: '2024-01-01T00:00:00.000000+00:00',
  edited_timestamp: null,
  tts: false,
  mention_everyone: false,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  pinned: false,
  type: 0,
  ...extra,
});

/** A server as Guild Create sends it, in a context wired to a fake Discord. */
async function setup(cacheOptions: CacheOptions = {}) {
  const discord = await fakeDiscord();
  const rest = new RestClient({
    token: 't',
    version: '1',
    baseUrl: discord.url,
  });
  const cache = new Cache(cacheOptions);
  const ctx = createContext({ rest, cache });
  ctx.self = { userId: BOT, applicationId: BOT };
  const guild = ctx.entities.guild({
    ...rawGuild(),
    joined_at: '2024-01-01T00:00:00.000000+00:00',
    large: false,
    member_count: 3,
    members: [
      rawMember(OWNER),
      rawMember(BOT, { roles: [MOD_ROLE] }),
      rawMember(ALICE, { nick: 'Ali', roles: [MUTED_ROLE] }),
    ],
    channels: [
      rawChannel(CATEGORY, ChannelType.GuildCategory, { position: 0 }),
      rawChannel(GENERAL, ChannelType.GuildText, {
        parent_id: CATEGORY,
        position: 1,
        topic: 'talk',
        permission_overwrites: [
          { id: MUTED_ROLE, type: 0, allow: '0', deny: String(P.SendMessages) },
        ],
      }),
      rawChannel(VOICE, ChannelType.GuildVoice, {
        parent_id: CATEGORY,
        position: 0,
        bitrate: 64000,
      }),
      rawChannel(FORUM, ChannelType.GuildForum, {
        available_tags: [
          {
            id: '1',
            name: 'help',
            moderated: false,
            emoji_id: null,
            emoji_name: null,
          },
        ],
      }),
    ],
    threads: [
      rawChannel(THREAD, ChannelType.PublicThread, {
        parent_id: GENERAL,
        thread_metadata: {
          archived: false,
          auto_archive_duration: 60,
          archive_timestamp: '2024-01-01T00:00:00.000000+00:00',
          locked: false,
        },
      }),
    ],
    voice_states: [],
    presences: [],
    stage_instances: [],
    guild_scheduled_events: [],
    soundboard_sounds: [],
  });
  const general = guild.channels.get(GENERAL) as TextChannel;
  return { discord, ctx, cache, guild, general };
}

describe('a server', () => {
  it('reads what Guild Create sent', async () => {
    const { guild } = await setup();
    expect(guild.id).toBe(GUILD);
    expect(guild.name).toBe('Test Server');
    expect(guild.ownerId).toBe(OWNER);
    expect(guild.memberCount).toBe(3);
    expect(guild.features).toEqual(['COMMUNITY']);
    expect(guild.preferredLocale).toBe('en-US');
    expect(guild.available).toBe(true);
    expect(guild.joinedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'));
    expect(guild.iconURL()).toBeNull();
    expect(String(guild)).toBe('Test Server');
    expect(guild.createdAt.getUTCFullYear()).toBe(2015);
  });

  it('owns its roles, members, channels and emojis', async () => {
    const { guild, cache } = await setup();
    expect([...guild.roles.keys()]).toEqual([GUILD, MOD_ROLE, MUTED_ROLE]);
    expect(guild.everyoneRole?.name).toBe('@everyone');
    expect(guild.everyoneRole?.isEveryone).toBe(true);
    expect([...guild.members.keys()]).toEqual([OWNER, BOT, ALICE]);
    expect(guild.me?.id).toBe(BOT);
    expect(guild.channels.size).toBe(5);
    expect(guild.emojis.get('100000000000000040')?.toString()).toBe(
      '<a:lol:100000000000000040>'
    );
    // Channels and users are also reachable without going through the server.
    expect(cache.channels.get(GENERAL)).toBe(guild.channels.get(GENERAL));
    expect(cache.users.get(ALICE)).toBe(guild.members.get(ALICE)?.user);
  });

  it('keeps the same objects when Discord sends the server again', async () => {
    const { guild, ctx } = await setup();
    const role = guild.roles.get(MOD_ROLE);
    const again = ctx.entities.guild(
      rawGuild({
        name: 'Renamed',
        roles: [rawRole(GUILD), rawRole(MOD_ROLE, { name: 'Moderator' })],
      })
    );
    expect(again).toBe(guild);
    expect(guild.name).toBe('Renamed');
    expect(guild.roles.get(MOD_ROLE)).toBe(role);
    expect(role?.name).toBe('Moderator');
    // The role that is no longer listed is forgotten…
    expect(guild.roles.has(MUTED_ROLE)).toBe(false);
    // …and what this payload did not include is kept.
    expect(guild.members.size).toBe(3);
    expect(guild.channels.size).toBe(5);
    expect(guild.memberCount).toBe(3);
  });

  it('is forgotten with everything that belongs to it', async () => {
    const { guild, ctx, cache } = await setup();
    expect(ctx.entities.removeGuild(GUILD)).toBe(guild);
    expect(cache.guilds.size).toBe(0);
    expect(cache.channels.size).toBe(0);
    expect(ctx.entities.removeGuild(GUILD)).toBeUndefined();
  });

  it('shows its data when logged or serialized, never its internals', async () => {
    const { guild } = await setup();
    const json = guild.toJSON();
    expect(json).toMatchObject({
      id: GUILD,
      ownerId: OWNER,
      preferredLocale: 'en-US',
    });
    expect(json).not.toHaveProperty('roles');
    const logged = inspect(guild);
    expect(logged).toMatch(/^Guild \{/);
    expect(logged).toContain("ownerId: '100000000000000001'");
    expect(logged).not.toMatch(/token|rest|Authorization/i);
    expect(Object.keys(guild)).toEqual([]);
    expect(JSON.stringify(guild)).toContain('"systemChannelId"');
  });

  it('fetches a member from the cache first, from Discord otherwise', async () => {
    const { guild, discord } = await setup();
    expect(await guild.fetchMember(ALICE)).toBe(guild.members.get(ALICE));
    expect(discord.requests).toHaveLength(0);

    const NEW = '100000000000000004';
    discord.on('GET', `/guilds/${GUILD}/members/${NEW}`, {
      body: rawMember(NEW),
    });
    const member = await guild.fetchMember(NEW);
    expect(member.id).toBe(NEW);
    expect(guild.members.get(NEW)).toBe(member);

    discord.on('GET', `/guilds/${GUILD}/members/${ALICE}`, {
      body: rawMember(ALICE, { nick: 'Fresh' }),
    });
    const forced = await guild.fetchMember({ id: ALICE }, { force: true });
    expect(forced).toBe(guild.members.get(ALICE));
    expect(forced.nick).toBe('Fresh');
  });

  it('lists members by pages', async () => {
    const { guild, discord } = await setup();
    discord.on('GET', `/guilds/${GUILD}/members`, { body: [rawMember(ALICE)] });
    const members = await guild.fetchMembers({ limit: 10, after: OWNER });
    expect(members.map(member => member.id)).toEqual([ALICE]);
    expect(discord.requests[0]!.query).toEqual({
      limit: ['10'],
      after: [OWNER],
    });
    await guild.fetchMembers();
    expect(discord.requests[1]!.query).toEqual({ limit: ['1000'] });
  });

  it.each([0, 1001, 1.5, NaN])('refuses to list %s members', async limit => {
    const { guild, discord } = await setup();
    await expect(guild.fetchMembers({ limit })).rejects.toThrow(
      /between 1 and 1000/
    );
    expect(discord.requests).toHaveLength(0);
  });

  it('bans, unbans and kicks with the reason in the audit log', async () => {
    const { guild, discord } = await setup();
    discord.on('PUT', `/guilds/${GUILD}/bans/${ALICE}`, {});
    discord.on('DELETE', `/guilds/${GUILD}/bans/${ALICE}`, {});
    discord.on('DELETE', `/guilds/${GUILD}/members/${ALICE}`, {});

    await guild.ban(ALICE, { reason: 'spam', deleteMessageSeconds: 3600 });
    await guild.ban({ id: ALICE });
    await guild.unban(ALICE, 'sorry');
    await guild.kick(ALICE, 'bye');

    const [ban, plainBan, unban, kick] = discord.requests;
    expect(ban!.body).toEqual({ delete_message_seconds: 3600 });
    expect(ban!.headers['x-audit-log-reason']).toBe('spam');
    expect(plainBan!.body).toEqual({});
    expect(plainBan!.headers['x-audit-log-reason']).toBeUndefined();
    expect(unban!.headers['x-audit-log-reason']).toBe('sorry');
    expect(kick!.method).toBe('DELETE');
    expect(kick!.headers['x-audit-log-reason']).toBe('bye');
  });

  it.each([-1, 604801, 1.5])(
    'refuses to delete %s seconds of messages with a ban',
    async deleteMessageSeconds => {
      const { guild, discord } = await setup();
      await expect(guild.ban(ALICE, { deleteMessageSeconds })).rejects.toThrow(
        /between 0 and 604800 \(7 days\)/
      );
      expect(discord.requests).toHaveLength(0);
    }
  );

  it('says whether a user is banned', async () => {
    const { guild, discord } = await setup();
    discord.on('GET', `/guilds/${GUILD}/bans/${ALICE}`, {
      body: { reason: 'spam', user: rawUser(ALICE) },
    });
    discord.on('GET', `/guilds/${GUILD}/bans/${OWNER}`, {
      status: 404,
      body: { code: 10026, message: 'Unknown Ban' },
    });
    discord.on('GET', `/guilds/${GUILD}/bans/${BOT}`, {
      status: 403,
      body: { code: 50013, message: 'Missing Permissions' },
    });
    const ban = await guild.fetchBan(ALICE);
    expect(ban?.reason).toBe('spam');
    expect(ban?.user.id).toBe(ALICE);
    expect(await guild.fetchBan(OWNER)).toBeNull();
    // Any other error is not "not banned".
    await expect(guild.fetchBan(BOT)).rejects.toThrow(/Missing Permissions/);
  });

  it('bans several users at once, within the limit', async () => {
    const { guild, discord } = await setup();
    discord.on('POST', `/guilds/${GUILD}/bulk-ban`, {
      body: { banned_users: [ALICE], failed_users: [OWNER] },
    });
    await expect(guild.bulkBan([ALICE, { id: OWNER }])).resolves.toEqual({
      bannedUsers: [ALICE],
      failedUsers: [OWNER],
    });
    expect(discord.requests[0]!.body).toEqual({ user_ids: [ALICE, OWNER] });
    await expect(guild.bulkBan([])).rejects.toThrow(/between 1 and 200/);
    await expect(guild.bulkBan(Array(201).fill(ALICE))).rejects.toThrow(
      /got 201/
    );
  });

  it('creates roles and channels from camelCase options', async () => {
    const { guild, discord } = await setup();
    const NEW_ROLE = '100000000000000012';
    const NEW_CHANNEL = '100000000000000025';
    discord.on('POST', `/guilds/${GUILD}/roles`, {
      body: rawRole(NEW_ROLE, { name: 'VIP', permissions: '6' }),
    });
    discord.on('POST', `/guilds/${GUILD}/channels`, {
      body: rawChannel(NEW_CHANNEL, ChannelType.GuildText, { guild_id: GUILD }),
    });

    const role = await guild.createRole(
      {
        name: 'VIP',
        permissions: ['KickMembers', 'BanMembers'],
        unicodeEmoji: '⭐',
      },
      'because'
    );
    expect(discord.requests[0]!.body).toEqual({
      name: 'VIP',
      permissions: '6',
      unicode_emoji: '⭐',
    });
    expect(guild.roles.get(NEW_ROLE)).toBe(role);
    expect(role.permissions.has('BanMembers')).toBe(true);

    const channel = await guild.createChannel({
      name: 'new',
      type: ChannelType.GuildText,
      parentId: CATEGORY,
      rateLimitPerUser: 5,
    });
    expect(discord.requests[1]!.body).toEqual({
      name: 'new',
      type: 0,
      parent_id: CATEGORY,
      rate_limit_per_user: 5,
    });
    expect(channel).toBeInstanceOf(TextChannel);
    expect(guild.channels.get(NEW_CHANNEL)).toBe(channel);
  });

  it('returns secondary data as plain camelCase objects', async () => {
    const { guild, discord } = await setup();
    discord.on('GET', `/guilds/${GUILD}/audit-logs`, {
      body: {
        audit_log_entries: [
          { id: '1', action_type: 22, user_id: OWNER, target_id: ALICE },
        ],
        users: [],
      },
    });
    const log = await guild.fetchAuditLog({
      actionType: 22,
      userId: OWNER,
      limit: 5,
    });
    expect(discord.requests[0]!.query).toEqual({
      action_type: ['22'],
      user_id: [OWNER],
      limit: ['5'],
    });
    expect(log.auditLogEntries[0]).toEqual({
      id: '1',
      actionType: 22,
      userId: OWNER,
      targetId: ALICE,
    });
  });

  it('leaves', async () => {
    const { guild, discord } = await setup();
    discord.on('DELETE', `/users/@me/guilds/${GUILD}`, {});
    await guild.leave();
    expect(discord.requests).toHaveLength(1);
  });
});

describe('a member', () => {
  it('reads its data and its user', async () => {
    const { guild } = await setup();
    const alice = guild.members.get(ALICE)!;
    expect(alice.id).toBe(ALICE);
    expect(alice.nick).toBe('Ali');
    expect(alice.displayName).toBe('Ali');
    expect(alice.user.username).toBe('user03');
    expect(alice.guild).toBe(guild);
    expect(alice.joinedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'));
    expect(alice.isOwner).toBe(false);
    expect(guild.members.get(OWNER)!.isOwner).toBe(true);
    expect(guild.members.get(OWNER)!.displayName).toBe('user01');
    expect(String(alice)).toBe(`<@${ALICE}>`);
    expect(alice.avatarURL()).toMatch(/embed\/avatars\/\d\.png$/);
  });

  it('lists its roles from the highest, @everyone included', async () => {
    const { guild } = await setup();
    const bot = guild.me!;
    expect(bot.roles.map(role => role.name)).toEqual(['Mod', '@everyone']);
    expect(bot.highestRole?.id).toBe(MOD_ROLE);
    expect(bot.hasRole(MOD_ROLE)).toBe(true);
    expect(bot.hasRole(GUILD)).toBe(true);
    expect(bot.hasRole(MUTED_ROLE)).toBe(false);
    expect(guild.roles.get(MOD_ROLE)!.members.map(member => member.id)).toEqual(
      [BOT]
    );
  });

  it('computes its permissions in the server and in a channel', async () => {
    const { guild, general } = await setup();
    const owner = guild.members.get(OWNER)!;
    const bot = guild.me!;
    const alice = guild.members.get(ALICE)!;

    expect(owner.permissions.has('ManageGuild')).toBe(true);
    expect(bot.permissions.toArray()).toEqual([
      'KickMembers',
      'BanMembers',
      'ViewChannel',
      'SendMessages',
      'AttachFiles',
    ]);
    expect(alice.permissions.has('SendMessages')).toBe(true);
    // The Muted role is denied SendMessages in #general, and what needs it goes too.
    expect(alice.permissionsIn(general).toArray()).toEqual(['ViewChannel']);
    expect(general.permissionsFor(bot).has('SendMessages')).toBe(true);
    // A thread follows its channel.
    const thread = guild.channels.get(THREAD) as ThreadChannel;
    expect(thread.permissionsFor(alice).has('SendMessages')).toBe(false);
  });

  it('only reads while timed out', async () => {
    const { ctx, guild, general } = await setup();
    const until = new Date(Date.now() + 60_000).toISOString();
    const bot = ctx.entities.member(
      GUILD,
      rawMember(BOT, {
        roles: [MOD_ROLE],
        communication_disabled_until: until,
      })
    );
    expect(bot.isTimedOut).toBe(true);
    expect(bot.timeoutUntil).toEqual(new Date(until));
    expect(bot.permissions.toArray()).toEqual(['ViewChannel']);
    expect(general.permissionsFor(bot).toArray()).toEqual(['ViewChannel']);
    // A timeout in the past is over.
    ctx.entities.member(
      GUILD,
      rawMember(BOT, {
        roles: [MOD_ROLE],
        communication_disabled_until: '2020-01-01T00:00:00.000Z',
      })
    );
    expect(guild.me!.isTimedOut).toBe(false);
    expect(guild.me!.permissions.has('KickMembers')).toBe(true);
  });

  it('compares itself to others in the hierarchy', async () => {
    const { guild } = await setup();
    const owner = guild.members.get(OWNER)!;
    const bot = guild.me!;
    const alice = guild.members.get(ALICE)!;
    expect(bot.isHigherThan(alice)).toBe(true);
    expect(alice.isHigherThan(bot)).toBe(false);
    expect(owner.isHigherThan(bot)).toBe(true);
    expect(bot.isHigherThan(owner)).toBe(false);
    expect(bot.isHigherThan(bot)).toBe(false);
  });

  it('is timed out for a duration, and freed', async () => {
    const { guild, discord } = await setup();
    discord.on('PATCH', `/guilds/${GUILD}/members/${ALICE}`, request => ({
      body: rawMember(ALICE, request.body as Partial<RawGuildMember>),
    }));
    const alice = guild.members.get(ALICE)!;
    const before = Date.now();
    const updated = await alice.timeout(60_000, 'calm down');
    const sent = discord.requests[0]!;
    const until = new Date(
      (sent.body as { communication_disabled_until: string })
        .communication_disabled_until
    ).getTime();
    expect(Object.keys(sent.body as object)).toEqual([
      'communication_disabled_until',
    ]);
    expect(until).toBeGreaterThanOrEqual(before + 60_000);
    expect(until).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(sent.headers['x-audit-log-reason']).toBe('calm%20down');
    expect(updated).toBe(alice);
    expect(alice.isTimedOut).toBe(true);

    await alice.removeTimeout();
    expect(discord.requests[1]!.body).toEqual({
      communication_disabled_until: null,
    });
  });

  it.each([0, -5, NaN, Infinity, 29 * 24 * 60 * 60 * 1000])(
    'refuses a timeout of %s ms',
    async duration => {
      const { guild, discord } = await setup();
      await expect(guild.members.get(ALICE)!.timeout(duration)).rejects.toThrow(
        RangeError
      );
      expect(discord.requests).toHaveLength(0);
    }
  );

  it('is edited: nickname, roles, voice', async () => {
    const { guild, discord } = await setup();
    discord.on('PATCH', `/guilds/${GUILD}/members/${ALICE}`, {
      body: rawMember(ALICE),
    });
    const alice = guild.members.get(ALICE)!;
    await alice.edit({
      nick: null,
      roles: [MOD_ROLE, guild.roles.get(MUTED_ROLE)!],
      mute: true,
      voiceChannel: null,
    });
    expect(discord.requests[0]!.body).toEqual({
      nick: null,
      roles: [MOD_ROLE, MUTED_ROLE],
      mute: true,
      channel_id: null,
    });
    await alice.edit({ voiceChannel: { id: VOICE } });
    expect(discord.requests[1]!.body).toEqual({ channel_id: VOICE });
    await expect(alice.setNick('x'.repeat(33))).rejects.toThrow(
      /32 characters/
    );
  });

  it('renames the bot through the endpoint made for it', async () => {
    const { guild, discord } = await setup();
    discord.on('PATCH', `/guilds/${GUILD}/members/@me`, {
      body: rawMember(BOT, { nick: 'Botty', roles: [MOD_ROLE] }),
    });
    const me = await guild.me!.setNick('Botty');
    expect(me).toBe(guild.me);
    expect(me.nick).toBe('Botty');
    expect(discord.requests[0]!.body).toEqual({ nick: 'Botty' });
  });

  it('gets and loses roles, is kicked and banned', async () => {
    const { guild, discord } = await setup();
    const alice = guild.members.get(ALICE)!;
    discord.on(
      'PUT',
      `/guilds/${GUILD}/members/${ALICE}/roles/${MOD_ROLE}`,
      {}
    );
    discord.on(
      'DELETE',
      `/guilds/${GUILD}/members/${ALICE}/roles/${MUTED_ROLE}`,
      {}
    );
    discord.on('DELETE', `/guilds/${GUILD}/members/${ALICE}`, {});
    discord.on('PUT', `/guilds/${GUILD}/bans/${ALICE}`, {});
    await alice.addRole(guild.roles.get(MOD_ROLE)!, 'promoted');
    await alice.removeRole(MUTED_ROLE);
    await alice.kick('bye');
    await alice.ban({ reason: 'really bye' });
    expect(
      discord.requests.map(
        r => `${r.method} ${r.path.split('/').slice(3).join('/')}`
      )
    ).toEqual([
      `PUT members/${ALICE}/roles/${MOD_ROLE}`,
      `DELETE members/${ALICE}/roles/${MUTED_ROLE}`,
      `DELETE members/${ALICE}`,
      `PUT bans/${ALICE}`,
    ]);
    expect(discord.requests[0]!.headers['x-audit-log-reason']).toBe('promoted');
    expect(discord.requests[3]!.headers['x-audit-log-reason']).toBe(
      'really%20bye'
    );
  });

  it('receives a private message, opening the conversation once', async () => {
    const { guild, discord, cache } = await setup();
    discord.on('POST', '/users/@me/channels', {
      body: rawChannel(DM, ChannelType.Dm, {
        name: undefined,
        recipients: [rawUser(ALICE)],
      }),
    });
    discord.on('POST', `/channels/${DM}/messages`, {
      body: rawMessage('100000000000000050', {
        channel_id: DM,
        author: rawUser(BOT),
      }),
    });
    const alice = guild.members.get(ALICE)!;
    const message = await alice.send('psst');
    await alice.user.send({ content: 'again' });

    expect(discord.requestsTo('POST', '/users/@me/channels')).toHaveLength(1);
    expect(discord.requests[0]!.body).toEqual({ recipient_id: ALICE });
    expect(discord.requestsTo('POST', `/channels/${DM}/messages`)).toHaveLength(
      2
    );
    const dm = cache.channels.get(DM)!;
    expect(dm).toBeInstanceOf(DMChannel);
    expect(dm.isDM() && dm.recipient).toBe(alice.user);
    expect(message.guildId).toBeNull();
    expect(message.url).toBe(
      `https://discord.com/channels/@me/${DM}/100000000000000050`
    );
  });
});

describe('a role', () => {
  it('reads its data', async () => {
    const { guild } = await setup();
    const mod = guild.roles.get(MOD_ROLE)!;
    expect(mod.name).toBe('Mod');
    expect(mod.guild).toBe(guild);
    expect(mod.permissions.toArray()).toEqual(['KickMembers', 'BanMembers']);
    expect(String(mod)).toBe(`<@&${MOD_ROLE}>`);
    expect(String(guild.everyoneRole)).toBe('@everyone');
    expect(mod.isHigherThan(guild.roles.get(MUTED_ROLE)!)).toBe(true);
    expect(guild.everyoneRole!.isHigherThan(mod)).toBe(false);
  });

  it('breaks position ties with age', async () => {
    const { ctx } = await setup();
    const older = ctx.entities.role(
      GUILD,
      rawRole('100000000000000013', { position: 5 })
    );
    const newer = ctx.entities.role(
      GUILD,
      rawRole('100000000000000014', { position: 5 })
    );
    expect(older.isHigherThan(newer)).toBe(true);
    expect(newer.isHigherThan(older)).toBe(false);
  });

  it('is edited and deleted', async () => {
    const { guild, discord } = await setup();
    discord.on('PATCH', `/guilds/${GUILD}/roles/${MOD_ROLE}`, {
      body: rawRole(MOD_ROLE, { name: 'Staff', permissions: '2' }),
    });
    discord.on('DELETE', `/guilds/${GUILD}/roles/${MOD_ROLE}`, {});
    const mod = guild.roles.get(MOD_ROLE)!;
    const edited = await mod.edit({
      name: 'Staff',
      permissions: 'KickMembers',
      unicodeEmoji: '🛡️',
    });
    expect(discord.requests[0]!.body).toEqual({
      name: 'Staff',
      permissions: '2',
      unicode_emoji: '🛡️',
    });
    expect(edited).toBe(mod);
    expect(mod.name).toBe('Staff');
    await mod.delete('cleanup');
    expect(discord.requests[1]!.headers['x-audit-log-reason']).toBe('cleanup');
  });
});

describe('channels', () => {
  it('are of the class of their type', async () => {
    const { guild, ctx } = await setup();
    expect(guild.channels.get(CATEGORY)).toBeInstanceOf(CategoryChannel);
    expect(guild.channels.get(GENERAL)).toBeInstanceOf(TextChannel);
    expect(guild.channels.get(VOICE)).toBeInstanceOf(VoiceChannel);
    expect(guild.channels.get(FORUM)).toBeInstanceOf(ForumChannel);
    expect(guild.channels.get(THREAD)).toBeInstanceOf(ThreadChannel);
    // A type added by Discord after this version is still a channel.
    const unknown = ctx.entities.channel(
      rawChannel('100000000000000026', 99 as ChannelType, { guild_id: GUILD })
    );
    expect(unknown).toBeInstanceOf(GuildChannel);
    const orphan = ctx.entities.channel(
      rawChannel('100000000000000027', 99 as ChannelType)
    );
    expect(orphan.constructor).toBe(Channel);
    expect(orphan.guildId).toBeNull();
    expect(orphan.isTextBased()).toBe(false);
  });

  it.each([
    [GENERAL, { text: true, guild: true, isText: true }],
    [VOICE, { text: true, guild: true, isVoice: true }],
    [CATEGORY, { text: false, guild: true, isCategory: true }],
    [FORUM, { text: false, guild: true, isForum: true }],
    [THREAD, { text: true, guild: false, isThread: true }],
  ])('channel %s answers the kind questions', async (id, kind) => {
    const { guild } = await setup();
    const channel = guild.channels.get(id)!;
    expect(channel.isTextBased()).toBe(kind.text);
    expect(channel.isGuildChannel()).toBe(kind.guild);
    expect(channel.isText()).toBe('isText' in kind);
    expect(channel.isVoice()).toBe('isVoice' in kind);
    expect(channel.isCategory()).toBe('isCategory' in kind);
    expect(channel.isForum()).toBe('isForum' in kind);
    expect(channel.isThread()).toBe('isThread' in kind);
    expect(channel.isDM()).toBe(false);
    expect('send' in channel).toBe(kind.text);
  });

  it('read their data', async () => {
    const { guild, general } = await setup();
    expect(general.name).toBe('channel21');
    expect(general.topic).toBe('talk');
    expect(general.guild).toBe(guild);
    expect(general.parent).toBe(guild.channels.get(CATEGORY));
    expect(general.slowmode).toBe(0);
    expect(general.isAnnouncement).toBe(false);
    expect(String(general)).toBe(`<#${GENERAL}>`);
    expect(general.permissionOverwrites).toHaveLength(1);
    expect(general.permissionOverwrites[0]).toMatchObject({
      id: MUTED_ROLE,
      type: 'role',
    });
    expect(general.permissionOverwrites[0]!.deny.toArray()).toEqual([
      'SendMessages',
    ]);

    const category = guild.channels.get(CATEGORY) as CategoryChannel;
    expect(category.children.map(child => child.id)).toEqual([VOICE, GENERAL]);
    expect((guild.channels.get(VOICE) as VoiceChannel).bitrate).toBe(64000);
    expect(
      (guild.channels.get(FORUM) as ForumChannel).availableTags[0]
    ).toMatchObject({
      name: 'help',
      emojiId: null,
    });
    const thread = guild.channels.get(THREAD) as ThreadChannel;
    expect(thread.parent).toBe(general);
    expect(thread.archived).toBe(false);
    expect(thread.guildId).toBe(GUILD);
  });

  it('send messages', async () => {
    const { general, discord } = await setup();
    discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000051', {
        author: rawUser(BOT),
        content: 'hi',
      }),
    });
    const message = await general.send('hi');
    expect(discord.requests[0]!.body).toEqual({ content: 'hi' });
    expect(message.content).toBe('hi');
    expect(message.guildId).toBe(GUILD);
    expect(message.channel).toBe(general);
    expect(message.author.id).toBe(BOT);

    await general.send({
      content: 'full',
      embeds: [
        { title: 'T', author: { name: 'A', iconUrl: 'https://x/y.png' } },
      ],
      allowedMentions: { parse: [], repliedUser: false },
      silent: true,
      replyTo: message,
      files: [
        { name: 'a.txt', data: 'hello', description: 'a file', spoiler: true },
      ],
    });
    const sent = discord.requests[1]!;
    expect(sent.body).toEqual({
      content: 'full',
      embeds: [
        { title: 'T', author: { name: 'A', icon_url: 'https://x/y.png' } },
      ],
      allowed_mentions: { parse: [], replied_user: false },
      flags: 4096,
      message_reference: { message_id: '100000000000000051' },
      attachments: [
        { id: 0, filename: 'a.txt', description: 'a file', is_spoiler: true },
      ],
    });
    expect(sent.files['files[0]']).toMatchObject({
      name: 'a.txt',
      text: 'hello',
    });
  });

  it('fetch messages, and remember them only when the cache keeps some', async () => {
    const one = rawMessage('100000000000000052');
    for (const messages of [0, 10]) {
      const { general, discord } = await setup({ limits: { messages } });
      discord.on('GET', `/channels/${GENERAL}/messages`, { body: [one] });
      discord.on('GET', `/channels/${GENERAL}/messages/${one.id}`, {
        body: one,
      });
      const [fetched] = await general.fetchMessages({
        limit: 1,
        before: { id: '100000000000000099' },
      });
      expect(discord.requests[0]!.query).toEqual({
        limit: ['1'],
        before: ['100000000000000099'],
      });
      expect(general.messages.size).toBe(messages === 0 ? 0 : 1);
      const again = await general.fetchMessage(one.id);
      expect(again.id).toBe(fetched!.id);
      // With a cache the second read costs nothing and is the same object.
      expect(
        discord.requestsTo('GET', `/channels/${GENERAL}/messages/${one.id}`)
      ).toHaveLength(messages === 0 ? 1 : 0);
      expect(again === fetched).toBe(messages !== 0);
    }
  });

  it.each([0, 101, 2.5])('refuse to fetch %s messages', async limit => {
    const { general } = await setup();
    await expect(general.fetchMessages({ limit })).rejects.toThrow(
      /between 1 and 100/
    );
  });

  it('delete messages in bulk, leaving out what Discord would refuse', async () => {
    const { general, discord } = await setup();
    discord.on('POST', `/channels/${GENERAL}/messages/bulk-delete`, {});
    const now = BigInt(Date.now()) - 1420070400000n;
    const recent = (n: number) =>
      String(((now - BigInt(n * 1000)) << 22n) + BigInt(n));
    const tooOld = String((now - BigInt(15 * 24 * 3600 * 1000)) << 22n);
    const ids = Array.from({ length: 150 }, (_, n) => recent(n));

    const deleted = await general.bulkDelete(
      [...ids, ids[0]!, tooOld, { id: ids[1]! }],
      'cleanup'
    );
    expect(deleted).toBe(150);
    const calls = discord.requestsTo(
      'POST',
      `/channels/${GENERAL}/messages/bulk-delete`
    );
    expect(
      calls.map(call => (call.body as { messages: string[] }).messages.length)
    ).toEqual([100, 50]);
    expect(calls[0]!.headers['x-audit-log-reason']).toBe('cleanup');
    expect(
      calls.flatMap(call => (call.body as { messages: string[] }).messages)
    ).not.toContain(tooOld);
  });

  it('delete a single message with the endpoint that accepts one', async () => {
    const { general, discord } = await setup();
    const id = String((BigInt(Date.now()) - 1420070400000n) << 22n);
    discord.on('DELETE', `/channels/${GENERAL}/messages/${id}`, {});
    expect(await general.bulkDelete([id])).toBe(1);
    expect(await general.bulkDelete([])).toBe(0);
    expect(discord.requests).toHaveLength(1);
    expect(discord.requests[0]!.method).toBe('DELETE');
  });

  it('read every page of pins', async () => {
    const { general, discord } = await setup();
    discord.on(
      'GET',
      `/channels/${GENERAL}/messages/pins`,
      {
        body: {
          items: [
            {
              pinned_at: '2024-02-02T00:00:00Z',
              message: rawMessage('100000000000000053'),
            },
          ],
          has_more: true,
        },
      },
      {
        body: {
          items: [
            {
              pinned_at: '2024-01-01T00:00:00Z',
              message: rawMessage('100000000000000054'),
            },
          ],
          has_more: false,
        },
      }
    );
    const pins = await general.fetchPins();
    expect(pins.map(pin => pin.id)).toEqual([
      '100000000000000053',
      '100000000000000054',
    ]);
    expect(discord.requests[1]!.query.before).toEqual(['2024-02-02T00:00:00Z']);
  });

  it('are edited and deleted', async () => {
    const { general, discord, cache, ctx } = await setup();
    discord.on('PATCH', `/channels/${GENERAL}`, {
      body: rawChannel(GENERAL, ChannelType.GuildText, {
        guild_id: GUILD,
        name: 'chat',
        rate_limit_per_user: 10,
      }),
    });
    discord.on('DELETE', `/channels/${GENERAL}`, {
      body: rawChannel(GENERAL, ChannelType.GuildText),
    });
    const edited = await general.edit(
      { name: 'chat', rateLimitPerUser: 10, parentId: null },
      'rename'
    );
    expect(discord.requests[0]!.body).toEqual({
      name: 'chat',
      rate_limit_per_user: 10,
      parent_id: null,
    });
    expect(edited).toBe(general);
    expect(general.name).toBe('chat');
    expect(general.slowmode).toBe(10);
    // What the response did not include is kept.
    expect(general.topic).toBe('talk');

    await general.delete('gone');
    expect(discord.requests[1]!.headers['x-audit-log-reason']).toBe('gone');
    // The cache changes when Discord confirms it with an event.
    expect(ctx.entities.removeChannel(GENERAL)).toBe(general);
    expect(cache.channels.has(GENERAL)).toBe(false);
    expect(general.guild!.channels.has(GENERAL)).toBe(false);
    expect(ctx.entities.removeChannel(GENERAL)).toBeUndefined();
  });

  it('set and remove permissions of a role or a member', async () => {
    const { general, guild, discord } = await setup();
    discord.on('PUT', `/channels/${GENERAL}/permissions/${MOD_ROLE}`, {});
    discord.on('PUT', `/channels/${GENERAL}/permissions/${ALICE}`, {});
    discord.on('DELETE', `/channels/${GENERAL}/permissions/${ALICE}`, {});
    await general.setPermissions(guild.roles.get(MOD_ROLE)!, {
      allow: ['ManageMessages'],
    });
    await general.setPermissions(guild.members.get(ALICE)!, {
      deny: 'SendMessages',
      allow: 'ViewChannel',
    });
    await general.deletePermissions(ALICE);
    expect(discord.requests[0]!.body).toEqual({
      type: 0,
      allow: String(P.ManageMessages),
      deny: '0',
    });
    expect(discord.requests[1]!.body).toEqual({
      type: 1,
      allow: String(P.ViewChannel),
      deny: String(P.SendMessages),
    });
    expect(discord.requests[2]!.method).toBe('DELETE');
  });

  it('create invites, webhooks, threads and posts', async () => {
    const { general, guild, discord } = await setup();
    discord.on('POST', `/channels/${GENERAL}/invites`, {
      body: {
        type: 0,
        code: 'abc',
        channel: { id: GENERAL },
        guild: { id: GUILD },
        inviter: rawUser(BOT),
        expires_at: null,
        max_uses: 5,
        uses: 0,
      },
    });
    discord.on('POST', `/channels/${GENERAL}/webhooks`, {
      body: {
        id: '100000000000000060',
        type: 1,
        channel_id: GENERAL,
        guild_id: GUILD,
        name: 'Hook',
        avatar: null,
        token: 'tok',
        application_id: null,
      },
    });
    discord.on('POST', '/webhooks/100000000000000060/tok', {
      body: rawMessage('100000000000000055', {
        webhook_id: '100000000000000060',
      }),
    });
    discord.on('POST', `/channels/${GENERAL}/threads`, {
      body: rawChannel('100000000000000028', ChannelType.PrivateThread, {
        guild_id: GUILD,
        parent_id: GENERAL,
      }),
    });
    discord.on('POST', `/channels/${FORUM}/threads`, {
      body: rawChannel('100000000000000029', ChannelType.PublicThread, {
        guild_id: GUILD,
        parent_id: FORUM,
      }),
    });

    const invite = await general.createInvite({ maxUses: 5, maxAge: 0 });
    expect(discord.requests[0]!.body).toEqual({ max_uses: 5, max_age: 0 });
    expect(invite.url).toBe('https://discord.gg/abc');
    expect(String(invite)).toBe('https://discord.gg/abc');
    expect(invite.inviter?.id).toBe(BOT);
    expect(invite.maxUses).toBe(5);
    expect(invite.expiresAt).toBeNull();
    expect(invite.guildId).toBe(GUILD);

    const webhook = await general.createWebhook({ name: 'Hook' });
    expect(webhook.canSend).toBe(true);
    // The token of a webhook is never printed.
    expect(inspect(webhook)).not.toContain('tok');
    expect(JSON.stringify(webhook)).not.toContain('tok');
    const posted = await webhook.send({
      content: 'via hook',
      username: 'Someone',
      avatarURL: 'https://x/a.png',
    });
    const hookRequest = discord.requests[2]!;
    expect(hookRequest.body).toEqual({
      content: 'via hook',
      username: 'Someone',
      avatar_url: 'https://x/a.png',
    });
    expect(hookRequest.query).toEqual({ wait: ['true'] });
    expect(hookRequest.headers.authorization).toBeUndefined();
    expect(posted.webhookId).toBe('100000000000000060');
    expect(posted.isFromUser).toBe(false);

    const thread = await general.startThread({
      name: 'side talk',
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 60,
    });
    expect(discord.requests[3]!.body).toEqual({
      name: 'side talk',
      type: 12,
      auto_archive_duration: 60,
    });
    expect(thread).toBeInstanceOf(ThreadChannel);
    expect(thread.isPrivate).toBe(true);
    expect(guild.channels.get(thread.id)).toBe(thread);

    const forum = guild.channels.get(FORUM) as ForumChannel;
    const post = await forum.createPost({
      name: 'Help!',
      message: 'it is broken',
      appliedTags: ['1'],
    });
    expect(discord.requests[4]!.body).toEqual({
      name: 'Help!',
      message: { content: 'it is broken' },
      applied_tags: ['1'],
    });
    expect(post.parent).toBe(forum);
  });

  it('refuses to post with a webhook the bot did not create', async () => {
    const { ctx, discord } = await setup();
    const webhook = ctx.entities.webhook({
      id: '100000000000000061',
      type: 1,
      channel_id: GENERAL,
      name: 'Other',
      avatar: null,
      application_id: null,
    });
    expect(webhook.canSend).toBe(false);
    await expect(webhook.send('hi')).rejects.toThrow(/not created by the bot/);
    expect(discord.requests).toHaveLength(0);
  });

  it('manage threads', async () => {
    const { guild, discord } = await setup();
    const thread = guild.channels.get(THREAD) as ThreadChannel;
    discord.on('PATCH', `/channels/${THREAD}`, request => ({
      body: rawChannel(THREAD, ChannelType.PublicThread, {
        guild_id: GUILD,
        parent_id: GENERAL,
        thread_metadata: {
          archived: (request.body as { archived: boolean }).archived,
          auto_archive_duration: 60,
          archive_timestamp: '2024-03-03T00:00:00.000Z',
          locked: false,
        },
      }),
    }));
    discord.on('PUT', `/channels/${THREAD}/thread-members/@me`, {});
    discord.on('PUT', `/channels/${THREAD}/thread-members/${ALICE}`, {});
    discord.on('GET', `/channels/${THREAD}/thread-members`, {
      body: [
        {
          id: THREAD,
          user_id: ALICE,
          join_timestamp: '2024-01-01T00:00:00Z',
          flags: 0,
        },
      ],
    });
    await thread.archive('done');
    expect(discord.requests[0]!.body).toEqual({ archived: true });
    expect(thread.archived).toBe(true);
    expect(thread.archivedAt).toEqual(new Date('2024-03-03T00:00:00.000Z'));
    await thread.unarchive();
    expect(thread.archived).toBe(false);
    await thread.join();
    await thread.addMember(guild.members.get(ALICE)!);
    expect(await thread.fetchMembers()).toEqual([
      {
        id: THREAD,
        userId: ALICE,
        joinTimestamp: '2024-01-01T00:00:00Z',
        flags: 0,
      },
    ]);
  });
});

describe('a message', () => {
  const ID = '100000000000000070';

  async function withMessage(extra: Partial<RawMessage> = {}) {
    const context = await setup({ limits: { messages: 10 } });
    const message = context.ctx.entities.message(
      {
        ...rawMessage(ID, extra),
        member: { roles: [MUTED_ROLE], nick: 'Ali' } as never,
      },
      GUILD
    );
    return { ...context, message };
  }

  it('reads its data', async () => {
    const { message, guild, general } = await withMessage({
      content: 'look <@1>',
      mentions: [rawUser(OWNER)],
      mention_roles: [MOD_ROLE],
      edited_timestamp: '2024-01-02T00:00:00.000Z',
      flags: 4 | 4096,
      embeds: [{ title: 'T', footer: { text: 'f', icon_url: 'u' } }],
      attachments: [
        {
          id: '1',
          filename: 'a.png',
          size: 3,
          url: 'u',
          proxy_url: 'p',
          content_type: 'image/png',
        },
      ],
      reactions: [
        {
          count: 2,
          count_details: { burst: 0, normal: 2 },
          me: true,
          me_burst: false,
          emoji: { id: null, name: '👍' },
          burst_colors: [],
        },
      ],
      message_reference: { message_id: '100000000000000069' },
    });
    expect(message.content).toBe('look <@1>');
    expect(message.author).toBe(guild.members.get(ALICE)!.user);
    expect(message.member).toBe(guild.members.get(ALICE));
    expect(message.guild).toBe(guild);
    expect(message.channel).toBe(general);
    expect(message.mentions.map(user => user.id)).toEqual([OWNER]);
    expect(message.mentionedRoleIds).toEqual([MOD_ROLE]);
    expect(message.editedAt).toEqual(new Date('2024-01-02T00:00:00.000Z'));
    expect(message.flags).toEqual(['SuppressEmbeds', 'SuppressNotifications']);
    expect(message.embeds).toEqual([
      { title: 'T', footer: { text: 'f', iconUrl: 'u' } },
    ]);
    expect(message.attachments[0]).toMatchObject({
      filename: 'a.png',
      proxyUrl: 'p',
      contentType: 'image/png',
    });
    expect(message.reactions[0]).toMatchObject({
      count: 2,
      countDetails: { normal: 2 },
      meBurst: false,
    });
    expect(message.repliedMessageId).toBe('100000000000000069');
    expect(message.isFromUser).toBe(true);
    expect(message.url).toBe(
      `https://discord.com/channels/${GUILD}/${GENERAL}/${ID}`
    );
    expect(general.messages.get(ID)).toBe(message);
  });

  it.each([
    [{ author: rawUser(BOT, { bot: true }) }, false],
    [{ author: rawUser(ALICE, { system: true }) }, false],
    [{ webhook_id: '5' }, false],
    [{ type: 7 as const }, false],
    [{ type: 19 as const }, true],
    [{}, true],
  ])('with %j is from a person: %s', async (fields, expected) => {
    const extra: Partial<RawMessage> = fields;
    const { ctx } = await setup();
    // Other ids: the user cache would otherwise remember the first author.
    const message = ctx.entities.message(
      rawMessage(ID, {
        ...extra,
        author: {
          ...rawUser('100000000000000008'),
          ...extra.author,
          id: '100000000000000008',
        },
      })
    );
    expect(message.isFromUser).toBe(expected);
  });

  it('replies, is edited, deleted and pinned', async () => {
    const { message, discord } = await withMessage();
    discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000071'),
    });
    discord.on('PATCH', `/channels/${GENERAL}/messages/${ID}`, {
      body: rawMessage(ID, {
        content: 'edited',
        edited_timestamp: '2024-05-05T00:00:00Z',
      }),
    });
    discord.on('DELETE', `/channels/${GENERAL}/messages/${ID}`, {});
    discord.on('PUT', `/channels/${GENERAL}/messages/pins/${ID}`, {});
    discord.on('DELETE', `/channels/${GENERAL}/messages/pins/${ID}`, {});

    const reply = await message.reply({
      content: 'pong',
      allowedMentions: { repliedUser: false },
    });
    expect(discord.requests[0]!.body).toEqual({
      content: 'pong',
      allowed_mentions: { replied_user: false },
      message_reference: { message_id: ID },
    });
    expect(reply.guildId).toBe(GUILD);

    const edited = await message.edit('edited');
    expect(discord.requests[1]!.body).toEqual({ content: 'edited' });
    expect(edited).toBe(message);
    expect(message.content).toBe('edited');
    expect(message.editedAt).not.toBeNull();

    // An edit may remove everything but what it sets.
    await message.edit({ embeds: [], suppressEmbeds: false });
    expect(discord.requests[2]!.body).toEqual({ embeds: [], flags: 0 });

    await message.pin('important');
    await message.unpin();
    await message.delete('spam');
    expect(discord.requests.slice(3).map(request => request.method)).toEqual([
      'PUT',
      'DELETE',
      'DELETE',
    ]);
    expect(discord.requests[3]!.headers['x-audit-log-reason']).toBe(
      'important'
    );
    expect(discord.requests[5]!.headers['x-audit-log-reason']).toBe('spam');
  });

  it('is reacted to with any way of writing an emoji', async () => {
    const { message, discord } = await withMessage();
    const base = `/channels/${GENERAL}/messages/${ID}/reactions`;
    const thumb = encodeURIComponent('👍');
    discord.on('PUT', `${base}/${thumb}/@me`, {});
    discord.on('PUT', `${base}/lol%3A5/@me`, {});
    discord.on('DELETE', `${base}/${thumb}/@me`, {});
    discord.on('DELETE', `${base}/${thumb}/${ALICE}`, {});
    discord.on('DELETE', `${base}/${thumb}`, {});
    discord.on('DELETE', base, {});
    discord.on('GET', `${base}/${thumb}`, { body: [rawUser(ALICE)] });

    await message.react('👍');
    await message.react(' 👍 ');
    await message.react('<:lol:5>');
    await message.react('<a:lol:5>');
    await message.react({ id: '5', name: 'lol' });
    await message.removeReaction('👍');
    await message.removeReaction('👍', { id: ALICE });
    await message.clearReactions('👍');
    await message.clearReactions();
    const users = await message.fetchReactionUsers('👍', { limit: 5 });

    // Every request found its route: none fell back to the 404 of the fake.
    expect(discord.requestsTo('PUT', `${base}/${thumb}/@me`)).toHaveLength(2);
    expect(discord.requestsTo('PUT', `${base}/lol%3A5/@me`)).toHaveLength(3);
    expect(users.map(user => user.id)).toEqual([ALICE]);
    expect(discord.requests.at(-1)!.query).toEqual({ limit: ['5'] });
    await expect(message.react('  ')).rejects.toThrow(/emoji is empty/);
    await expect(message.react({})).rejects.toThrow(/name or an id/);
  });

  it('starts a thread', async () => {
    const { message, discord, guild } = await withMessage();
    discord.on('POST', `/channels/${GENERAL}/messages/${ID}/threads`, {
      body: rawChannel(ID, ChannelType.PublicThread, {
        guild_id: GUILD,
        parent_id: GENERAL,
        name: 'topic',
      }),
    });
    const thread = await message.startThread(
      { name: 'topic', autoArchiveDuration: 1440 },
      'split'
    );
    expect(discord.requests[0]!.body).toEqual({
      name: 'topic',
      auto_archive_duration: 1440,
    });
    expect(thread.name).toBe('topic');
    expect(guild.channels.get(ID)).toBe(thread);
  });
});

describe('a user', () => {
  it('reads its data and builds its images', async () => {
    const { ctx } = await setup();
    const user = ctx.entities.user(
      rawUser('100000000000000009', {
        global_name: 'Display',
        avatar: 'a_hash',
        banner: 'bhash',
        bot: true,
        public_flags: (1 << 16) | (1 << 0),
        accent_color: 0xff0000,
      })
    );
    expect(user.displayName).toBe('Display');
    expect(user.bot).toBe(true);
    expect(user.system).toBe(false);
    expect(user.flags).toEqual(['Staff', 'VerifiedBot']);
    expect(user.accentColor).toBe(0xff0000);
    expect(user.avatarURL({ size: 128 })).toBe(
      'https://cdn.discordapp.com/avatars/100000000000000009/a_hash.webp?size=128&animated=true'
    );
    expect(user.bannerURL()).toBe(
      'https://cdn.discordapp.com/banners/100000000000000009/bhash.webp'
    );
    expect(String(user)).toBe('<@100000000000000009>');
    expect(user.toJSON()).toMatchObject({
      globalName: 'Display',
      publicFlags: 65537,
    });
  });

  it('is the same object everywhere and follows updates', async () => {
    const { ctx, guild, discord } = await setup();
    const alice = guild.members.get(ALICE)!.user;
    discord.on('GET', `/users/${ALICE}`, {
      body: rawUser(ALICE, { global_name: 'Alice!' }),
    });
    const fetched = await alice.fetch();
    expect(fetched).toBe(alice);
    expect(alice.globalName).toBe('Alice!');
    // A partial update keeps what it does not mention.
    ctx.entities.user({ id: ALICE, avatar: 'h' } as RawUser);
    expect(alice.globalName).toBe('Alice!');
    expect(alice.avatar).toBe('h');
  });

  it('is forgotten first when the cache is full', async () => {
    const { ctx, cache } = await setup({ limits: { users: 3 } });
    ctx.entities.user(rawUser('100000000000000090'));
    expect(cache.users.size).toBe(3);
    expect(cache.users.has(OWNER)).toBe(false);
    expect(cache.users.has('100000000000000090')).toBe(true);
  });
});

describe('building a message', () => {
  it.each([
    [{}, /message is empty/],
    ['', /message is empty/],
    ['   ', /message is empty/],
    [{ content: '', embeds: [] }, /message is empty/],
    ['x'.repeat(2001), /2001 characters long: Discord accepts 2000/],
    [{ content: 5 }, /content of a message is a text, got number/],
    [null, /text or an object.*got null/],
    [42, /got number/],
    [{ embeds: Array(11).fill({ title: 'a' }) }, /10 embeds at most, got 11/],
    [
      { embeds: [{ title: 'x'.repeat(257) }] },
      /title of embed 1 is 257 characters long: Discord accepts 256/,
    ],
    [{ embeds: [{ description: 'x'.repeat(4097) }] }, /description of embed 1/],
    [
      { embeds: [{ title: 'a' }, { footer: { text: 'x'.repeat(2049) } }] },
      /footer text of embed 2/,
    ],
    [
      { embeds: [{ author: { name: 'x'.repeat(257) } }] },
      /author name of embed 1/,
    ],
    [
      { embeds: [{ fields: Array(26).fill({ name: 'n', value: 'v' }) }] },
      /26 fields: Discord accepts 25/,
    ],
    [
      { embeds: [{ fields: [{ name: 'x'.repeat(257), value: 'v' }] }] },
      /name of field 1 of embed 1/,
    ],
    [
      { embeds: [{ fields: [{ name: 'n', value: 'x'.repeat(1025) }] }] },
      /value of field 1 of embed 1/,
    ],
    [
      {
        embeds: [
          { description: 'x'.repeat(4000) },
          { description: 'x'.repeat(2001) },
        ],
      },
      /6001 characters in total: Discord accepts 6000/,
    ],
    [
      { content: 'a', stickers: ['1', '2', '3', '4'] },
      /3 stickers at most, got 4/,
    ],
    [
      { files: Array(11).fill({ name: 'a.txt', data: '' }) },
      /10 files at most, got 11/,
    ],
    [{ files: [{ name: ' ', data: '' }] }, /needs a name with its extension/],
  ])('refuses %j', (input, message) => {
    expect(() => buildMessage(input as never)).toThrow(message);
  });

  it.each([
    ['x'.repeat(2000)],
    [{ embeds: [{ title: 'x'.repeat(256), description: 'x'.repeat(4096) }] }],
    [
      {
        embeds: [
          { description: 'x'.repeat(4000) },
          { description: 'x'.repeat(2000) },
        ],
      },
    ],
    [{ embeds: [{ fields: Array(25).fill({ name: 'n', value: 'v' }) }] }],
    [{ stickers: ['1', '2', '3'] }],
    [{ files: [{ name: 'a.txt', data: '' }] }],
    [{ poll: { question: { text: 'q' }, answers: [] } }],
    [{ components: [{ type: 10, content: 'text' }] }],
  ])('accepts a message at the limit', input => {
    expect(() => buildMessage(input as never)).not.toThrow();
  });

  it('does not count surrounding spaces of embeds, as Discord trims them', () => {
    expect(() =>
      buildMessage({ embeds: [{ title: ` ${'x'.repeat(256)} ` }] })
    ).not.toThrow();
  });

  it('lets an edit carry nothing but what changes', () => {
    expect(buildMessage({ content: '' }, { edit: true }).body).toEqual({
      content: '',
    });
    expect(buildMessage({}, { edit: true })).toEqual({
      body: {},
      files: undefined,
    });
  });

  it('sets flags only when asked', () => {
    expect(buildMessage('a').body.flags).toBeUndefined();
    expect(
      buildMessage({ content: 'a', silent: true, suppressEmbeds: true }).body
        .flags
    ).toBe(4096 | 4);
    expect(buildMessage({ content: 'a', tts: true }).body.tts).toBe(true);
  });
});

describe('what can not be missing in a server', () => {
  it('is always there: the server of a member, a role and a channel', async () => {
    const { ctx, guild, general } = await setup();
    const alice = guild.members.get(ALICE)!;
    const mod = guild.roles.get(MOD_ROLE)!;
    const thread = guild.channels.get(THREAD) as ThreadChannel;
    expect(alice.guild).toBe(guild);
    expect(mod.guild).toBe(guild);
    expect(general.guild).toBe(guild);
    expect(thread.guild).toBe(guild);
    expect(thread.parentId).toBe(GENERAL);
    expect(thread.parent).toBe(general);
    expect(guild.everyoneRole.name).toBe('@everyone');
    expect(guild.me.id).toBe(BOT);
    expect(guild.memberCount).toBe(3);

    // The bot is removed from the server while code still holds them: what
    // was there stays there.
    ctx.entities.removeGuild(GUILD);
    expect(ctx.cache.guilds.get(GUILD)).toBeUndefined();
    expect(alice.guild).toBe(guild);
    expect(mod.guild).toBe(guild);
    expect(general.guild).toBe(guild);
    expect(thread.guild).toBe(guild);
    expect(alice.roles.map(role => role.name)).toEqual(['Muted', '@everyone']);

    // So does everything after the session started over.
    ctx.cache.clear();
    expect(alice.guild).toBe(guild);
    expect(alice.highestRole.name).toBe('Muted');
  });

  it('costs one reference: what belongs to a server keeps the server itself', async () => {
    const { ctx, guild, general } = await setup();
    // Members, roles and channels can be millions: nothing is allocated.
    expect(originOf(guild.members.get(ALICE)!)).toBe(guild);
    expect(originOf(guild.roles.get(MOD_ROLE)!)).toBe(guild);
    expect(originOf(general)).toBe(guild);
    // What needs no server keeps nothing at all.
    expect(originOf(guild.members.get(ALICE)!.user)).toBeUndefined();
    // A server keeps the bot itself, whatever the cache keeps of members.
    expect(originOf(guild)).toEqual({ member: guild.me });
    // A message comes with more: its server, its author, its channel.
    const message = ctx.entities.message(
      {
        ...rawMessage('100000000000000063'),
        member: { ...rawMember(ALICE), user: undefined } as never,
      },
      GUILD
    );
    expect(originOf(message)).toEqual({
      guild,
      member: guild.members.get(ALICE),
      channel: general,
    });
    // Updating a member again keeps its server, and adds nothing.
    ctx.entities.member(GUILD, rawMember(ALICE, { nick: 'A' }));
    expect(originOf(guild.members.get(ALICE)!)).toBe(guild);
    // What is not given again is left as it was.
    remember(guild.members.get(ALICE)!, {});
    expect(originOf(guild.members.get(ALICE)!)).toBe(guild);
    remember(message, { channel: general });
    expect(originOf(message)).toEqual({
      guild,
      member: guild.members.get(ALICE),
      channel: general,
    });
  });

  it('never forgets the bot itself, even when few members are remembered', async () => {
    const { guild } = await setup({ limits: { members: 1 } });
    // Only the last member is kept: the bot came before.
    expect([...guild.members.keys()]).toEqual([ALICE]);
    expect(guild.me.id).toBe(BOT);
    expect(guild.me.roles.map(role => role.name)).toEqual(['Mod', '@everyone']);
    expect(guild.me.guild).toBe(guild);
  });

  it('gives a member without role @everyone as highest role', async () => {
    const { guild } = await setup();
    const owner = guild.members.get(OWNER)!;
    expect(owner.roleIds).toEqual([]);
    expect(owner.highestRole).toBe(guild.everyoneRole);
  });

  it('keeps the server, the member and the channel a message came with', async () => {
    const { ctx, guild, general } = await setup();
    const message = ctx.entities.message(
      {
        ...rawMessage('100000000000000060'),
        member: { ...rawMember(ALICE), user: undefined } as never,
      },
      GUILD
    );
    const alice = guild.members.get(ALICE)!;
    expect(message.guild).toBe(guild);
    expect(message.member).toBe(alice);
    expect(message.channel).toBe(general);

    // The member leaves: who wrote the message is still who wrote it.
    storesOf(guild).members.delete(ALICE);
    expect(guild.members.get(ALICE)).toBeUndefined();
    expect(message.member).toBe(alice);
    // The channel is deleted, the bot is removed.
    ctx.entities.removeChannel(GENERAL);
    ctx.entities.removeGuild(GUILD);
    expect(message.guild).toBe(guild);
    expect(message.member).toBe(alice);
    expect(message.channel).toBe(general);
  });

  it('prefers what the bot knows now to what it remembered', async () => {
    const { ctx, guild } = await setup();
    const message = ctx.entities.message(
      rawMessage('100000000000000061'),
      GUILD
    );
    // Nothing came with it, but the cache knows the author.
    expect(message.member).toBe(guild.members.get(ALICE));
    const private_ = ctx.entities.message({
      ...rawMessage('100000000000000062'),
      channel_id: DM,
    });
    expect(private_.guild).toBeNull();
    expect(private_.member).toBeNull();
    expect(private_.channel).toBeNull();
  });

  it('refuses loudly what belongs to a server the bot is not in', async () => {
    const { ctx } = await setup();
    const stranger = ctx.entities.role('100000000000000900', rawRole('1'));
    expect(() => stranger.guild).toThrow(
      "The server 100000000000000900 is not one the bot is in, so what belongs to it can't be read."
    );
    const member = ctx.entities.member('100000000000000900', rawMember(ALICE));
    expect(() => member.guild).toThrow(
      /100000000000000900 is not one the bot is in/
    );
  });

  it('says what Discord has not sent, instead of answering null', async () => {
    const { ctx } = await setup();
    const bare = ctx.entities.guild({
      ...rawGuild({ id: '100000000000000901' }),
      roles: [],
    });
    expect(() => bare.everyoneRole).toThrow(
      'Discord has not sent the roles of the server 100000000000000901.'
    );
    expect(() => bare.me).toThrow(
      'Discord has not sent the members of the server 100000000000000901.'
    );
    // Not said by Discord: nothing is made up.
    expect(bare.memberCount).toBeNull();
    const down = ctx.entities.guild({
      ...rawGuild({ id: '100000000000000902' }),
      roles: [],
      unavailable: true,
    } as never);
    expect(() => down.me).toThrow(
      'Discord has not sent the members of the server 100000000000000902, which is unavailable (an outage on their side).'
    );
  });
});
