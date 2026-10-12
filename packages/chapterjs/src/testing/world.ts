// A Discord in memory, for `chapterjs test`: one server with its roles,
// channels, members and messages, kept as the raw payloads Discord sends,
// behind the fake REST API and the fake gateway. The real framework runs
// against it, so what a test sees is what production would do.
//
// The routes the framework and the files of a project use answer with
// meaning: creating a message keeps it in its channel and sends it back,
// answering an interaction records the answer, banning someone bans them.
// A change the world does not model succeeds and is recorded; asking for
// something it does not have answers 404, as Discord would; a route the
// documentation does not have answers 404 too. Nothing is made up.

import { Limits } from '../discord/api.js';
import {
  pathParamNames,
  type Endpoint,
  type HttpMethod,
} from '../discord/endpoint.js';
import * as E from '../discord/endpoints.js';
import {
  ALL_PERMISSIONS,
  computeBasePermissions,
} from '../discord/permissions.js';
import type { RawApplication } from '../discord/types/application.js';
import type { RawApplicationCommand } from '../discord/types/application-command.js';
import {
  ChannelType,
  type RawChannel,
  type RawPermissionOverwrite,
  type RawThreadMember,
} from '../discord/types/channel.js';
import type { Locale, Snowflake } from '../discord/types/common.js';
import type { RawGuild, RawGuildMember } from '../discord/types/guild.js';
import {
  InteractionCallbackType,
  InteractionType,
  type RawInteraction,
  type RawInteractionCallbackAutocompleteData,
  type RawInteractionCallbackMessageData,
  type RawInteractionCallbackModalData,
  type RawInteractionResponse,
} from '../discord/types/interaction.js';
import {
  MessageFlags,
  MessageType,
  type RawAttachment,
  type RawMessage,
} from '../discord/types/message.js';
import { PermissionFlags, type RawRole } from '../discord/types/permissions.js';
import type { RawUser } from '../discord/types/user.js';
import {
  fakeDiscord,
  NOT_FOUND,
  type FakeDiscord,
  type FakeDiscordRequest,
  type FakeDiscordResponse,
} from './fake-discord.js';
import { fakeGateway, type FakeGateway } from './fake-gateway.js';

/** Application flags of a bot with every privileged intent enabled. */
const ALL_PRIVILEGED = (1 << 13) | (1 << 15) | (1 << 19);

/** What everyone can do in the server, unless a role says more. */
const EVERYONE_PERMISSIONS: bigint = [
  PermissionFlags.ViewChannel,
  PermissionFlags.SendMessages,
  PermissionFlags.SendMessagesInThreads,
  PermissionFlags.CreatePublicThreads,
  PermissionFlags.ReadMessageHistory,
  PermissionFlags.AddReactions,
  PermissionFlags.EmbedLinks,
  PermissionFlags.AttachFiles,
  PermissionFlags.UseExternalEmojis,
  PermissionFlags.ChangeNickname,
  PermissionFlags.Connect,
  PermissionFlags.Speak,
  PermissionFlags.UseVad,
  PermissionFlags.UseApplicationCommands,
].reduce((all, flag) => all | flag, 0n);

/** The Discord epoch, for snowflakes. */
const EPOCH = 1_420_070_400_000;
/**
 * Ids are dated from when the process started, one millisecond apart: what
 * they are about looks recent, as Discord needs it to (a message older than
 * two weeks can not be deleted in bulk).
 */
const FIRST_ID_AT = Date.now();
/**
 * Ids given so far by every world of the process: two worlds never give
 * the same id, so what waits for an interaction of one never takes one of
 * the other for it.
 */
let counter = 0;

const now = (): string => new Date().toISOString();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Discord's error for something that does not exist. */
const unknown = (what: string, code: number): FakeDiscordResponse => ({
  status: 404,
  body: { message: `Unknown ${what}`, code },
});

/** What Discord answers an action the bot is not high enough for. */
const MISSING_PERMISSIONS: FakeDiscordResponse = {
  status: 403,
  body: { message: 'Missing Permissions', code: 50013 },
};

/** An interaction someone made, and everything the bot answered to it. */
export interface InteractionRecord {
  readonly id: Snowflake;
  readonly token: string;
  readonly raw: RawInteraction;
  /** The message the component was on, for a component or a form it opened. */
  message: RawMessage | null;
  /** Every callback sent to `/callback`, in order (Discord takes one). */
  readonly callbacks: RawInteractionResponse[];
  /** The first answer, as a message: sent, deferred, or the updated one. */
  original: RawMessage | null;
  /** The messages sent after the first answer. */
  readonly followUps: RawMessage[];
  /** The form opened, when the answer was one. */
  modal: RawInteractionCallbackModalData | null;
  /** The suggestions given, for an autocomplete. */
  suggestions: RawInteractionCallbackAutocompleteData['choices'] | null;
  /** Whether the first answer was "thinking…" (deferred). */
  deferred: boolean;
  /** Whether the answer changed the message of the component. */
  updated: boolean;
}

export interface WorldOptions {
  /** The name of the server. Default: "Test Server". */
  guildName?: string;
  /** The name of the bot. Default: "Test Bot". */
  botName?: string;
}

export interface WorldUserOptions {
  bot?: boolean;
  locale?: Locale;
}

export interface WorldMemberOptions {
  roles?: readonly Snowflake[];
  nick?: string | null;
}

export interface WorldRoleOptions {
  permissions?: bigint;
  position?: number;
  color?: number;
}

export interface WorldChannelOptions {
  type?: ChannelType;
  parentId?: Snowflake | null;
  topic?: string | null;
}

type Params = readonly string[];
type Handler = (
  params: Params,
  request: FakeDiscordRequest
) => FakeDiscordResponse;

interface Route {
  endpoint: Endpoint;
  pattern: RegExp;
  /** Literal characters of the path: the most specific route wins. */
  weight: number;
  handler: Handler;
}

/** The regular expression matching a documented path, placeholders filled. */
function patternOf(path: string): RegExp {
  const source = path
    .split(/\{[^}]+\}/)
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('([^/]+)');
  return new RegExp(`^${source}$`);
}

/** How specific a path is: its literal characters, placeholders left out. */
const weightOf = (path: string): number =>
  path.replace(/\{[^}]+\}/g, '').length;

/** Every documented endpoint, with how to recognise its path. */
const DOCUMENTED = (Object.values(E) as unknown[])
  .filter(
    (value): value is Endpoint =>
      typeof value === 'object' &&
      value !== null &&
      'method' in value &&
      'path' in value
  )
  .map(endpoint => ({
    endpoint,
    pattern: patternOf(endpoint.path),
    weight: weightOf(endpoint.path),
  }));

/**
 * The Discord of a test: one server, the bot in it, people who come and go,
 * and everything the bot does kept where a test can read it.
 */
export class World {
  readonly botId: Snowflake;
  readonly applicationId: Snowflake;
  readonly guildId: Snowflake;
  readonly ownerId: Snowflake;
  guildName: string;
  readonly users = new Map<Snowflake, RawUser>();
  /** The members of the server, by user id. */
  readonly members = new Map<Snowflake, RawGuildMember>();
  readonly roles = new Map<Snowflake, RawRole>();
  /** The channels of the server, its threads and the private channels. */
  readonly channels = new Map<Snowflake, RawChannel>();
  /** The messages of each channel, oldest first. */
  readonly messages = new Map<Snowflake, RawMessage[]>();
  readonly bans = new Map<
    Snowflake,
    { user: RawUser; reason: string | null }
  >();
  /** Who is in each thread. */
  readonly threadMembers = new Map<Snowflake, Set<Snowflake>>();
  /** Every interaction made, by id and by token. */
  readonly interactions = new Map<string, InteractionRecord>();
  /** The commands registered, for the server and for everyone. */
  guildCommands: RawApplicationCommand[] = [];
  globalCommands: RawApplicationCommand[] = [];
  /** Every gateway event the world sent to the bot, in order. */
  readonly sent: { type: string; data: unknown }[] = [];
  discord!: FakeDiscord;
  gateway!: FakeGateway;
  readonly #options: WorldOptions;
  readonly #routes: Route[] = [];
  readonly #byMethod = new Map<HttpMethod, Route[]>();

  constructor(options: WorldOptions = {}) {
    this.#options = options;
    this.botId = this.snowflake();
    this.applicationId = this.botId;
    this.guildId = this.snowflake();
    this.guildName = options.guildName ?? 'Test Server';
    this.users.set(this.botId, {
      id: this.botId,
      username: options.botName ?? 'Test Bot',
      discriminator: '0',
      global_name: options.botName ?? 'Test Bot',
      avatar: null,
      bot: true,
    });
    // @everyone has the id of the server.
    this.roles.set(this.guildId, {
      id: this.guildId,
      name: '@everyone',
      color: 0,
      colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
      hoist: false,
      position: 0,
      permissions: EVERYONE_PERMISSIONS.toString(),
      managed: false,
      mentionable: false,
      flags: 0,
    });
    const botRole = this.addRole(options.botName ?? 'Test Bot', {
      permissions: PermissionFlags.Administrator,
      position: 1,
    });
    botRole.managed = true;
    botRole.tags = { bot_id: this.botId };
    this.addMember(this.botId, { roles: [botRole.id] });
    const owner = this.addUser('owner');
    this.ownerId = owner.id;
    this.addMember(owner.id);
    this.addChannel('general');
    this.#defineRoutes();
  }

  /** The environment that points the CLI at this Discord. */
  get env(): Record<string, string> {
    return { CHAPTERJS_API_URL: this.discord.url };
  }

  /** The user of the bot. */
  get bot(): RawUser {
    return this.users.get(this.botId)!;
  }

  /** Starts the fake REST API and gateway. */
  async start(): Promise<void> {
    this.discord = await fakeDiscord({
      fallback: request => this.#answer(request),
    });
    this.gateway = await fakeGateway();
    this.gateway.behavior.onIdentify = connection => {
      connection.dispatch('READY', {
        v: 10,
        user: this.bot,
        guilds: [{ id: this.guildId, unavailable: true }],
        session_id: `session-${this.gateway.connections.length}`,
        resume_gateway_url: this.gateway.url,
        application: { id: this.applicationId, flags: ALL_PRIVILEGED },
      });
      connection.dispatch('GUILD_CREATE', this.guildPayload());
    };
  }

  async close(): Promise<void> {
    await Promise.all([this.gateway?.close(), this.discord?.close()]);
  }

  /** A new id, later than every id given before, in this world or another. */
  snowflake(): Snowflake {
    counter++;
    return (
      (BigInt(FIRST_ID_AT - EPOCH + counter) << 22n) |
      BigInt(counter % 4096)
    ).toString();
  }

  // ── State ──────────────────────────────────────────────────────────

  addUser(name: string, options: WorldUserOptions = {}): RawUser {
    const user: RawUser = {
      id: this.snowflake(),
      username: name,
      discriminator: '0',
      global_name: name.charAt(0).toUpperCase() + name.slice(1),
      avatar: null,
      ...(options.bot ? { bot: true } : {}),
      ...(options.locale ? { locale: options.locale } : {}),
    };
    this.users.set(user.id, user);
    return user;
  }

  /** The user named so, if any. */
  findUser(name: string): RawUser | undefined {
    for (const user of this.users.values()) {
      if (user.username === name) return user;
    }
    return undefined;
  }

  addMember(
    userId: Snowflake,
    options: WorldMemberOptions = {}
  ): RawGuildMember {
    const user = this.users.get(userId);
    if (!user) throw new Error(`No user ${userId} in this world.`);
    const member: RawGuildMember = {
      user,
      nick: options.nick ?? null,
      avatar: null,
      roles: [...(options.roles ?? [])],
      joined_at: now(),
      deaf: false,
      mute: false,
      flags: 0,
    };
    this.members.set(userId, member);
    return member;
  }

  addRole(name: string, options: WorldRoleOptions = {}): RawRole {
    const role: RawRole = {
      id: this.snowflake(),
      name,
      color: options.color ?? 0,
      colors: {
        primary_color: options.color ?? 0,
        secondary_color: null,
        tertiary_color: null,
      },
      hoist: false,
      position: options.position ?? 1,
      permissions: (options.permissions ?? 0n).toString(),
      managed: false,
      mentionable: false,
      flags: 0,
    };
    // A new role goes at the bottom, just above @everyone, as Discord
    // places it: the ones from there up move up one.
    for (const other of this.roles.values()) {
      if (other.position >= role.position && other.id !== this.guildId)
        other.position += 1;
    }
    this.roles.set(role.id, role);
    return role;
  }

  /**
   * Whether the bot may act on someone: kick, ban, change their nickname,
   * roles or timeout. Never on the owner of the server, and only on members
   * whose highest role is lower than the bot's.
   * @see https://docs.discord.com/developers/topics/permissions#permission-hierarchy
   */
  #outranks(userId: Snowflake): boolean {
    if (userId === this.ownerId) return false;
    if (userId === this.botId) return true;
    const member = this.members.get(userId);
    return !member || this.#highest(this.botId) > this.#highest(userId);
  }

  /**
   * Whether the bot may give or take this role from someone: a role lower
   * than its highest, on someone it outranks (itself included).
   */
  #givable(userId: Snowflake, roleId: Snowflake): boolean {
    const role = this.roles.get(roleId);
    return (
      this.#outranks(userId) &&
      (role?.position ?? 0) < this.#highest(this.botId)
    );
  }

  /** The position of someone's highest role (0: @everyone only). */
  #highest(userId: Snowflake): number {
    const member = this.members.get(userId);
    return Math.max(
      0,
      ...(member?.roles ?? []).map(id => this.roles.get(id)?.position ?? 0)
    );
  }

  addChannel(name: string, options: WorldChannelOptions = {}): RawChannel {
    const channel: RawChannel = {
      id: this.snowflake(),
      type: options.type ?? ChannelType.GuildText,
      guild_id: this.guildId,
      name,
      position: [...this.channels.values()].filter(one => one.guild_id).length,
      permission_overwrites: [],
      parent_id: options.parentId ?? null,
      topic: options.topic ?? null,
      nsfw: false,
      last_message_id: null,
      rate_limit_per_user: 0,
    };
    this.channels.set(channel.id, channel);
    this.messages.set(channel.id, []);
    return channel;
  }

  /** The channel of the server named so, if any. */
  findChannel(name: string): RawChannel | undefined {
    for (const channel of this.channels.values()) {
      if (channel.guild_id && channel.name === name) return channel;
    }
    return undefined;
  }

  /** The private channel with a user, made the first time it is asked. */
  dm(userId: Snowflake): RawChannel {
    for (const channel of this.channels.values()) {
      if (
        channel.type === ChannelType.Dm &&
        channel.recipients?.some(user => user.id === userId)
      ) {
        return channel;
      }
    }
    const channel: RawChannel = {
      id: this.snowflake(),
      type: ChannelType.Dm,
      recipients: [this.users.get(userId)!],
      last_message_id: null,
    };
    this.channels.set(channel.id, channel);
    this.messages.set(channel.id, []);
    return channel;
  }

  /** The permissions of a member in the server (channel overwrites left aside). */
  permissionsOf(userId: Snowflake): bigint {
    const member = this.members.get(userId);
    if (!member) return 0n;
    return computeBasePermissions({
      guildId: this.guildId,
      ownerId: this.ownerId,
      userId,
      memberRoleIds: member.roles,
      roles: [...this.roles.values()].map(role => ({
        id: role.id,
        permissions: BigInt(role.permissions),
      })),
    });
  }

  /** The server as Discord sends it in Guild Create. */
  guildPayload(): RawGuild & Record<string, unknown> {
    const guildChannels = [...this.channels.values()].filter(
      channel => channel.guild_id === this.guildId
    );
    return {
      ...this.guildFields(),
      joined_at: '2024-01-01T00:00:00Z',
      large: false,
      unavailable: false,
      member_count: this.members.size,
      members: [...this.members.values()],
      channels: guildChannels.filter(channel => !this.isThread(channel)),
      threads: guildChannels.filter(channel => this.isThread(channel)),
      voice_states: [],
      presences: [],
      stage_instances: [],
      guild_scheduled_events: [],
      soundboard_sounds: [],
    };
  }

  /** The server as Get Guild returns it. */
  guildFields(): RawGuild {
    return {
      id: this.guildId,
      name: this.guildName,
      icon: null,
      splash: null,
      discovery_splash: null,
      owner_id: this.ownerId,
      afk_channel_id: null,
      afk_timeout: 300,
      verification_level: 0,
      default_message_notifications: 0,
      explicit_content_filter: 0,
      roles: [...this.roles.values()],
      emojis: [],
      features: [],
      mfa_level: 0,
      application_id: null,
      system_channel_id: this.findChannel('general')?.id ?? null,
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
      approximate_member_count: this.members.size,
      approximate_presence_count: this.members.size,
    };
  }

  isThread(channel: RawChannel): boolean {
    return (
      channel.type === ChannelType.PublicThread ||
      channel.type === ChannelType.PrivateThread ||
      channel.type === ChannelType.AnnouncementThread
    );
  }

  // ── Gateway ────────────────────────────────────────────────────────

  /** The connection of the bot, once it identified. */
  get connection() {
    const connection = this.gateway.connections.at(-1);
    if (!connection || connection.closed) {
      throw new Error('The bot is not connected to the simulated Discord.');
    }
    return connection;
  }

  /** Sends a gateway event to the bot. */
  dispatch(type: string, data: unknown): void {
    this.sent.push({ type, data });
    this.connection.dispatch(type, data);
  }

  /** Makes an interaction happen: records it and sends it to the bot. */
  interaction(raw: RawInteraction): InteractionRecord {
    const record: InteractionRecord = {
      id: raw.id,
      token: raw.token,
      raw,
      // The message of the world itself: what an update changes.
      message: raw.message
        ? (this.findMessage(raw.message.id) ?? raw.message)
        : null,
      callbacks: [],
      original: null,
      followUps: [],
      modal: null,
      suggestions: null,
      deferred: false,
      updated: false,
    };
    this.interactions.set(raw.id, record);
    this.interactions.set(raw.token, record);
    this.dispatch('INTERACTION_CREATE', raw);
    return record;
  }

  // ── Messages ───────────────────────────────────────────────────────

  /** Puts a message in its channel and tells the bot, as Discord does. */
  createMessage(
    channelId: Snowflake,
    author: RawUser,
    data: Record<string, unknown>,
    files: FakeDiscordRequest['files'] = {},
    extra: Partial<RawMessage> = {}
  ): RawMessage {
    const channel = this.channels.get(channelId);
    const list = this.messages.get(channelId);
    if (!channel || !list) throw new Error(`No channel ${channelId}.`);
    const attachments: RawAttachment[] = Object.values(files).map(file => ({
      id: this.snowflake(),
      filename: file.name,
      content_type: file.type,
      size: Buffer.byteLength(file.text),
      url: `https://cdn.discordapp.test/${file.name}`,
      proxy_url: `https://media.discordapp.test/${file.name}`,
    }));
    const reference = isRecord(data.message_reference)
      ? (data.message_reference as { message_id?: string })
      : undefined;
    const referenced = reference?.message_id
      ? (list.find(message => message.id === reference.message_id) ?? null)
      : undefined;
    const message: RawMessage = {
      id: this.snowflake(),
      channel_id: channelId,
      ...(channel.guild_id ? { guild_id: channel.guild_id } : {}),
      author,
      ...(channel.guild_id && this.members.get(author.id)
        ? { member: this.members.get(author.id) }
        : {}),
      content: typeof data.content === 'string' ? data.content : '',
      timestamp: now(),
      edited_timestamp: null,
      tts: data.tts === true,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments,
      embeds: Array.isArray(data.embeds) ? (data.embeds as never) : [],
      pinned: false,
      type: referenced ? MessageType.Reply : MessageType.Default,
      flags: typeof data.flags === 'number' ? data.flags : 0,
      ...(Array.isArray(data.components)
        ? { components: data.components as never }
        : {}),
      ...(isRecord(data.poll) ? { poll: data.poll as never } : {}),
      ...(reference ? { message_reference: reference as never } : {}),
      ...(referenced !== undefined ? { referenced_message: referenced } : {}),
      ...extra,
    } as RawMessage;
    list.push(message);
    channel.last_message_id = message.id;
    this.#dispatchIfConnected('MESSAGE_CREATE', message);
    return message;
  }

  /** The message with this id, wherever it is. */
  findMessage(id: Snowflake): RawMessage | undefined {
    for (const list of this.messages.values()) {
      const found = list.find(message => message.id === id);
      if (found) return found;
    }
    return undefined;
  }

  editMessage(message: RawMessage, data: Record<string, unknown>): RawMessage {
    if (typeof data.content === 'string' || data.content === null) {
      message.content = data.content ?? '';
    }
    if (Array.isArray(data.embeds)) message.embeds = data.embeds as never;
    if (Array.isArray(data.components)) {
      message.components = data.components as never;
    }
    if (typeof data.flags === 'number') {
      // Editing never changes the flags Discord set itself.
      const kept = (message.flags ?? 0) & MessageFlags.Ephemeral;
      message.flags = (data.flags & ~MessageFlags.Loading) | kept;
    } else {
      message.flags = (message.flags ?? 0) & ~MessageFlags.Loading;
    }
    message.edited_timestamp = now();
    this.#dispatchIfConnected('MESSAGE_UPDATE', message);
    return message;
  }

  deleteMessage(message: RawMessage): void {
    const list = this.messages.get(message.channel_id);
    if (list) list.splice(list.indexOf(message), 1);
    const guildId = this.channels.get(message.channel_id)?.guild_id;
    this.#dispatchIfConnected('MESSAGE_DELETE', {
      id: message.id,
      channel_id: message.channel_id,
      ...(guildId ? { guild_id: guildId } : {}),
    });
  }

  #dispatchIfConnected(type: string, data: unknown): void {
    const connection = this.gateway?.connections.at(-1);
    if (connection && !connection.closed) this.dispatch(type, data);
  }

  // ── Members ────────────────────────────────────────────────────────

  removeMember(userId: Snowflake): void {
    const member = this.members.get(userId);
    if (!member) return;
    this.members.delete(userId);
    for (const inside of this.threadMembers.values()) inside.delete(userId);
    this.#dispatchIfConnected('GUILD_MEMBER_REMOVE', {
      guild_id: this.guildId,
      user: member.user,
    });
  }

  memberUpdated(member: RawGuildMember): void {
    this.#dispatchIfConnected('GUILD_MEMBER_UPDATE', {
      guild_id: this.guildId,
      roles: member.roles,
      user: member.user,
      nick: member.nick,
      avatar: member.avatar ?? null,
      banner: member.banner ?? null,
      joined_at: member.joined_at,
      deaf: member.deaf,
      mute: member.mute,
      flags: member.flags,
      communication_disabled_until: member.communication_disabled_until ?? null,
    });
  }

  // ── REST ───────────────────────────────────────────────────────────

  #route(endpoint: Endpoint, handler: Handler): void {
    const route: Route = {
      endpoint,
      pattern: patternOf(endpoint.path),
      weight: weightOf(endpoint.path),
      handler,
    };
    this.#routes.push(route);
    const list = this.#byMethod.get(endpoint.method) ?? [];
    list.push(route);
    list.sort((a, b) => b.weight - a.weight);
    this.#byMethod.set(endpoint.method, list);
  }

  /**
   * Answers a request: the route of the world, else what Discord would say.
   * The most specific documented path wins (`/messages/pins` is not the
   * message "pins"), whether the world models it or not.
   */
  #answer(request: FakeDiscordRequest): FakeDiscordResponse {
    const method = request.method as HttpMethod;
    let best: { weight: number; route?: Route; endpoint: Endpoint } | null =
      null;
    for (const route of this.#byMethod.get(method) ?? []) {
      if (
        route.pattern.test(request.path) &&
        (best?.weight ?? -1) < route.weight
      ) {
        best = { weight: route.weight, route, endpoint: route.endpoint };
      }
    }
    for (const { endpoint, pattern, weight } of DOCUMENTED) {
      if (
        endpoint.method === method &&
        pattern.test(request.path) &&
        (best?.weight ?? -1) < weight
      ) {
        best = { weight, endpoint };
      }
    }
    if (!best) return NOT_FOUND;
    if (best.route) {
      const match = best.route.pattern.exec(request.path)!;
      return best.route.handler(
        match.slice(1).map(decodeURIComponent),
        request
      );
    }
    return this.#generic(best.endpoint, request);
  }

  /** What a documented route the world does not model answers. */
  #generic(
    endpoint: Endpoint,
    request: FakeDiscordRequest
  ): FakeDiscordResponse {
    switch (endpoint.method) {
      case 'GET':
        return {
          status: 404,
          body: {
            message: `The simulated Discord of chapterjs test has nothing for ${endpoint.method} ${endpoint.path} yet.`,
            code: 0,
          },
        };
      case 'POST':
        return {
          body: {
            id: this.snowflake(),
            ...(isRecord(request.body) ? request.body : {}),
          },
        };
      case 'PATCH': {
        const names = pathParamNames(endpoint.path);
        const values = patternOf(endpoint.path).exec(request.path)!.slice(1);
        const id = values[names.length - 1];
        return {
          body: {
            ...(id ? { id } : {}),
            ...(isRecord(request.body) ? request.body : {}),
          },
        };
      }
      default:
        return {};
    }
  }

  #defineRoutes(): void {
    const body = (request: FakeDiscordRequest): Record<string, unknown> =>
      isRecord(request.body) ? request.body : {};

    // The application and the gateway.
    this.#route(E.GetCurrentApplication, () => ({
      body: {
        id: this.applicationId,
        name: this.bot.username,
        icon: null,
        description: '',
        bot_public: true,
        bot_require_code_grant: false,
        bot: this.bot,
        verify_key: '',
        team: null,
        flags: ALL_PRIVILEGED,
      } satisfies RawApplication,
    }));
    this.#route(E.GetCurrentUser, () => ({ body: this.bot }));
    this.#route(E.GetGatewayBot, () => ({
      body: {
        url: this.gateway.url,
        shards: 1,
        session_start_limit: {
          total: 1000,
          remaining: 999,
          reset_after: 0,
          max_concurrency: 1,
        },
      },
    }));

    // Commands.
    const registered = (
      commands: unknown,
      guildId?: Snowflake
    ): RawApplicationCommand[] =>
      (Array.isArray(commands) ? commands : []).map(
        (command: Record<string, unknown>) =>
          ({
            id: this.snowflake(),
            application_id: this.applicationId,
            ...(guildId ? { guild_id: guildId } : {}),
            version: this.snowflake(),
            type: 1,
            default_member_permissions: null,
            ...command,
          }) as RawApplicationCommand
      );
    this.#route(E.GetGlobalApplicationCommands, () => ({
      body: this.globalCommands,
    }));
    this.#route(E.BulkOverwriteGlobalApplicationCommands, (_, request) => {
      this.globalCommands = registered(request.body);
      return { body: this.globalCommands };
    });
    this.#route(E.GetGuildApplicationCommands, () => ({
      body: this.guildCommands,
    }));
    this.#route(
      E.BulkOverwriteGuildApplicationCommands,
      ([, guildId], request) => {
        this.guildCommands = registered(request.body, guildId);
        return { body: this.guildCommands };
      }
    );

    // The server.
    const guildOr404 = (id: string): FakeDiscordResponse | null =>
      id === this.guildId ? null : unknown('Guild', 10004);
    this.#route(
      E.GetGuild,
      ([id]) => guildOr404(id!) ?? { body: this.guildFields() }
    );
    this.#route(E.ModifyGuild, ([id], request) => {
      const refused = guildOr404(id!);
      if (refused) return refused;
      const changes = body(request);
      if (typeof changes.name === 'string') this.guildName = changes.name;
      this.#dispatchIfConnected('GUILD_UPDATE', this.guildFields());
      return { body: this.guildFields() };
    });
    this.#route(
      E.GetGuildChannels,
      ([id]) =>
        guildOr404(id!) ?? {
          body: [...this.channels.values()].filter(
            channel =>
              channel.guild_id === this.guildId && !this.isThread(channel)
          ),
        }
    );
    this.#route(E.CreateGuildChannel, ([id], request) => {
      const refused = guildOr404(id!);
      if (refused) return refused;
      const given = body(request);
      const channel = this.addChannel(String(given.name ?? 'channel'), {
        type:
          typeof given.type === 'number'
            ? (given.type as ChannelType)
            : undefined,
        parentId: typeof given.parent_id === 'string' ? given.parent_id : null,
        topic: typeof given.topic === 'string' ? given.topic : null,
      });
      if (Array.isArray(given.permission_overwrites)) {
        channel.permission_overwrites =
          given.permission_overwrites as RawPermissionOverwrite[];
      }
      this.#dispatchIfConnected('CHANNEL_CREATE', channel);
      return { body: channel };
    });
    this.#route(
      E.GetGuildAuditLog,
      ([id]) =>
        guildOr404(id!) ?? {
          body: {
            application_commands: [],
            audit_log_entries: [],
            auto_moderation_rules: [],
            guild_scheduled_events: [],
            integrations: [],
            threads: [],
            users: [],
            webhooks: [],
          },
        }
    );

    // Members.
    const memberOr404 = (
      guildId: string,
      userId: string
    ): { member: RawGuildMember } | { refused: FakeDiscordResponse } => {
      const refused = guildOr404(guildId);
      if (refused) return { refused };
      const member = this.members.get(userId);
      return member ? { member } : { refused: unknown('Member', 10007) };
    };
    this.#route(E.GetGuildMember, ([guildId, userId]) => {
      const found = memberOr404(guildId!, userId!);
      return 'refused' in found ? found.refused : { body: found.member };
    });
    this.#route(E.ListGuildMembers, ([guildId], request) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const limit = Number(request.query.limit?.[0] ?? 1);
      const after = request.query.after?.[0];
      const members = [...this.members.values()]
        .filter(member => !after || BigInt(member.user!.id) > BigInt(after))
        .sort((a, b) => (BigInt(a.user!.id) < BigInt(b.user!.id) ? -1 : 1));
      return {
        body: members.slice(0, Math.min(limit, Limits.ListGuildMembers)),
      };
    });
    this.#route(E.SearchGuildMembers, ([guildId], request) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const query = (request.query.query?.[0] ?? '').toLowerCase();
      return {
        body: [...this.members.values()].filter(
          member =>
            member.user!.username.toLowerCase().startsWith(query) ||
            member.nick?.toLowerCase().startsWith(query)
        ),
      };
    });
    this.#route(E.ModifyGuildMember, ([guildId, userId], request) => {
      const found = memberOr404(guildId!, userId!);
      if ('refused' in found) return found.refused;
      const { member } = found;
      const changes = body(request);
      if (!this.#outranks(userId!)) return MISSING_PERMISSIONS;
      if ('nick' in changes)
        member.nick = (changes.nick as string | null) ?? null;
      if (Array.isArray(changes.roles))
        member.roles = changes.roles as Snowflake[];
      if (typeof changes.mute === 'boolean') member.mute = changes.mute;
      if (typeof changes.deaf === 'boolean') member.deaf = changes.deaf;
      if ('communication_disabled_until' in changes) {
        member.communication_disabled_until =
          (changes.communication_disabled_until as string | null) ?? null;
      }
      if (typeof changes.flags === 'number') member.flags = changes.flags;
      this.memberUpdated(member);
      return { body: member };
    });
    this.#route(E.ModifyCurrentMember, ([guildId], request) => {
      const found = memberOr404(guildId!, this.botId);
      if ('refused' in found) return found.refused;
      const changes = body(request);
      if ('nick' in changes)
        found.member.nick = (changes.nick as string | null) ?? null;
      this.memberUpdated(found.member);
      return { body: found.member };
    });
    this.#route(E.AddGuildMemberRole, ([guildId, userId, roleId]) => {
      const found = memberOr404(guildId!, userId!);
      if ('refused' in found) return found.refused;
      if (!this.roles.has(roleId!)) return unknown('Role', 10011);
      if (!this.#givable(userId!, roleId!)) return MISSING_PERMISSIONS;
      if (!found.member.roles.includes(roleId!))
        found.member.roles.push(roleId!);
      this.memberUpdated(found.member);
      return {};
    });
    this.#route(E.RemoveGuildMemberRole, ([guildId, userId, roleId]) => {
      const found = memberOr404(guildId!, userId!);
      if ('refused' in found) return found.refused;
      if (!this.roles.has(roleId!)) return unknown('Role', 10011);
      if (!this.#givable(userId!, roleId!)) return MISSING_PERMISSIONS;
      found.member.roles = found.member.roles.filter(id => id !== roleId);
      this.memberUpdated(found.member);
      return {};
    });
    this.#route(E.RemoveGuildMember, ([guildId, userId]) => {
      const found = memberOr404(guildId!, userId!);
      if ('refused' in found) return found.refused;
      if (!this.#outranks(userId!)) return MISSING_PERMISSIONS;
      this.removeMember(userId!);
      return {};
    });

    // Bans.
    this.#route(
      E.GetGuildBans,
      ([guildId]) =>
        guildOr404(guildId!) ?? {
          body: [...this.bans.values()].map(ban => ({
            reason: ban.reason,
            user: ban.user,
          })),
        }
    );
    this.#route(E.GetGuildBan, ([guildId, userId]) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const ban = this.bans.get(userId!);
      return ban
        ? { body: { reason: ban.reason, user: ban.user } }
        : unknown('Ban', 10026);
    });
    this.#route(E.CreateGuildBan, ([guildId, userId], request) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const user = this.users.get(userId!);
      if (!user) return unknown('User', 10013);
      if (!this.#outranks(userId!)) return MISSING_PERMISSIONS;
      const reason = request.headers['x-audit-log-reason'];
      this.bans.set(userId!, {
        user,
        reason: typeof reason === 'string' ? decodeURIComponent(reason) : null,
      });
      this.removeMember(userId!);
      this.#dispatchIfConnected('GUILD_BAN_ADD', {
        guild_id: this.guildId,
        user,
      });
      return {};
    });
    this.#route(E.RemoveGuildBan, ([guildId, userId]) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const ban = this.bans.get(userId!);
      if (!ban) return unknown('Ban', 10026);
      this.bans.delete(userId!);
      this.#dispatchIfConnected('GUILD_BAN_REMOVE', {
        guild_id: this.guildId,
        user: ban.user,
      });
      return {};
    });
    this.#route(E.BulkGuildBan, ([guildId], request) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const ids = (body(request).user_ids as string[] | undefined) ?? [];
      const banned: string[] = [];
      const failed: string[] = [];
      for (const id of ids) {
        const user = this.users.get(id);
        if (!user || this.bans.has(id) || !this.#outranks(id)) {
          failed.push(id);
          continue;
        }
        this.bans.set(id, { user, reason: null });
        this.removeMember(id);
        this.#dispatchIfConnected('GUILD_BAN_ADD', {
          guild_id: this.guildId,
          user,
        });
        banned.push(id);
      }
      return { body: { banned_users: banned, failed_users: failed } };
    });

    // Roles.
    this.#route(
      E.GetGuildRoles,
      ([guildId]) => guildOr404(guildId!) ?? { body: [...this.roles.values()] }
    );
    this.#route(E.GetGuildRole, ([guildId, roleId]) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const role = this.roles.get(roleId!);
      return role ? { body: role } : unknown('Role', 10011);
    });
    this.#route(E.CreateGuildRole, ([guildId], request) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const given = body(request);
      const role = this.addRole(String(given.name ?? 'new role'), {
        permissions:
          typeof given.permissions === 'string'
            ? BigInt(given.permissions)
            : 0n,
        color: typeof given.color === 'number' ? given.color : 0,
      });
      if (typeof given.hoist === 'boolean') role.hoist = given.hoist;
      if (typeof given.mentionable === 'boolean')
        role.mentionable = given.mentionable;
      this.#dispatchIfConnected('GUILD_ROLE_CREATE', {
        guild_id: this.guildId,
        role,
      });
      return { body: role };
    });
    this.#route(E.ModifyGuildRole, ([guildId, roleId], request) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      const role = this.roles.get(roleId!);
      if (!role) return unknown('Role', 10011);
      const given = body(request);
      if (typeof given.name === 'string') role.name = given.name;
      if (typeof given.permissions === 'string')
        role.permissions = given.permissions;
      if (typeof given.color === 'number') role.color = given.color;
      if (typeof given.hoist === 'boolean') role.hoist = given.hoist;
      if (typeof given.mentionable === 'boolean')
        role.mentionable = given.mentionable;
      this.#dispatchIfConnected('GUILD_ROLE_UPDATE', {
        guild_id: this.guildId,
        role,
      });
      return { body: role };
    });
    this.#route(E.DeleteGuildRole, ([guildId, roleId]) => {
      const refused = guildOr404(guildId!);
      if (refused) return refused;
      if (!this.roles.has(roleId!)) return unknown('Role', 10011);
      this.roles.delete(roleId!);
      for (const member of this.members.values()) {
        member.roles = member.roles.filter(id => id !== roleId);
      }
      this.#dispatchIfConnected('GUILD_ROLE_DELETE', {
        guild_id: this.guildId,
        role_id: roleId,
      });
      return {};
    });

    // Channels and threads.
    const channelOr404 = (
      id: string
    ): { channel: RawChannel } | { refused: FakeDiscordResponse } => {
      const channel = this.channels.get(id);
      return channel ? { channel } : { refused: unknown('Channel', 10003) };
    };
    this.#route(E.GetChannel, ([id]) => {
      const found = channelOr404(id!);
      return 'refused' in found ? found.refused : { body: found.channel };
    });
    this.#route(E.ModifyChannel, ([id], request) => {
      const found = channelOr404(id!);
      if ('refused' in found) return found.refused;
      const { channel } = found;
      const given = body(request);
      if (typeof given.name === 'string') channel.name = given.name;
      if ('topic' in given)
        channel.topic = (given.topic as string | null) ?? null;
      if (typeof given.nsfw === 'boolean') channel.nsfw = given.nsfw;
      if (typeof given.rate_limit_per_user === 'number') {
        channel.rate_limit_per_user = given.rate_limit_per_user;
      }
      if ('parent_id' in given)
        channel.parent_id = (given.parent_id as string | null) ?? null;
      if (Array.isArray(given.permission_overwrites)) {
        channel.permission_overwrites =
          given.permission_overwrites as RawPermissionOverwrite[];
      }
      if (this.isThread(channel) && channel.thread_metadata) {
        if (typeof given.archived === 'boolean') {
          channel.thread_metadata.archived = given.archived;
          channel.thread_metadata.archive_timestamp = now();
        }
        if (typeof given.locked === 'boolean')
          channel.thread_metadata.locked = given.locked;
        if (typeof given.auto_archive_duration === 'number') {
          channel.thread_metadata.auto_archive_duration =
            given.auto_archive_duration;
        }
        if (typeof given.invitable === 'boolean') {
          channel.thread_metadata.invitable = given.invitable;
        }
        this.#dispatchIfConnected('THREAD_UPDATE', channel);
      } else {
        this.#dispatchIfConnected('CHANNEL_UPDATE', channel);
      }
      return { body: channel };
    });
    this.#route(E.DeleteCloseChannel, ([id]) => {
      const found = channelOr404(id!);
      if ('refused' in found) return found.refused;
      const { channel } = found;
      this.channels.delete(channel.id);
      this.messages.delete(channel.id);
      if (this.isThread(channel)) {
        this.threadMembers.delete(channel.id);
        this.#dispatchIfConnected('THREAD_DELETE', {
          id: channel.id,
          guild_id: channel.guild_id,
          parent_id: channel.parent_id,
          type: channel.type,
        });
      } else if (channel.guild_id) {
        this.#dispatchIfConnected('CHANNEL_DELETE', channel);
      }
      return { body: channel };
    });
    this.#route(E.EditChannelPermissions, ([id, overwriteId], request) => {
      const found = channelOr404(id!);
      if ('refused' in found) return found.refused;
      const given = body(request);
      const overwrites = (found.channel.permission_overwrites ??= []).filter(
        one => one.id !== overwriteId
      );
      overwrites.push({
        id: overwriteId!,
        type: (given.type as 0 | 1) ?? 0,
        allow: typeof given.allow === 'string' ? given.allow : '0',
        deny: typeof given.deny === 'string' ? given.deny : '0',
      });
      found.channel.permission_overwrites = overwrites;
      this.#dispatchIfConnected('CHANNEL_UPDATE', found.channel);
      return {};
    });
    this.#route(E.DeleteChannelPermission, ([id, overwriteId]) => {
      const found = channelOr404(id!);
      if ('refused' in found) return found.refused;
      found.channel.permission_overwrites = (
        found.channel.permission_overwrites ?? []
      ).filter(one => one.id !== overwriteId);
      this.#dispatchIfConnected('CHANNEL_UPDATE', found.channel);
      return {};
    });
    this.#route(E.TriggerTypingIndicator, ([id]) => {
      const found = channelOr404(id!);
      return 'refused' in found ? found.refused : {};
    });
    this.#route(E.CreateDm, (_, request) => {
      const recipient = body(request).recipient_id;
      const user =
        typeof recipient === 'string' ? this.users.get(recipient) : undefined;
      if (!user) return unknown('User', 10013);
      return { body: this.dm(user.id) };
    });
    this.#route(E.GetUser, ([id]) => {
      const user = this.users.get(id!);
      return user ? { body: user } : unknown('User', 10013);
    });

    const startThread = (
      parent: RawChannel,
      given: Record<string, unknown>,
      type: ChannelType,
      message?: RawMessage
    ): RawChannel => {
      const thread: RawChannel = {
        id: message?.id ?? this.snowflake(),
        type,
        guild_id: parent.guild_id,
        name: String(given.name ?? 'thread'),
        parent_id: parent.id,
        owner_id: this.botId,
        last_message_id: null,
        message_count: 0,
        member_count: 1,
        rate_limit_per_user: 0,
        thread_metadata: {
          archived: false,
          auto_archive_duration:
            typeof given.auto_archive_duration === 'number'
              ? given.auto_archive_duration
              : 4320,
          archive_timestamp: now(),
          locked: false,
          invitable:
            typeof given.invitable === 'boolean' ? given.invitable : true,
          create_timestamp: now(),
        },
        total_message_sent: 0,
        flags: 0,
      };
      this.channels.set(thread.id, thread);
      this.messages.set(thread.id, []);
      this.threadMembers.set(thread.id, new Set([this.botId]));
      if (message)
        message.flags = (message.flags ?? 0) | MessageFlags.HasThread;
      this.#dispatchIfConnected('THREAD_CREATE', {
        ...thread,
        newly_created: true,
      });
      return thread;
    };
    this.#route(E.StartThreadFromMessage, ([channelId, messageId], request) => {
      const found = channelOr404(channelId!);
      if ('refused' in found) return found.refused;
      const message = this.messages
        .get(channelId!)
        ?.find(one => one.id === messageId);
      if (!message) return unknown('Message', 10008);
      const type =
        found.channel.type === ChannelType.GuildAnnouncement
          ? ChannelType.AnnouncementThread
          : ChannelType.PublicThread;
      return { body: startThread(found.channel, body(request), type, message) };
    });
    this.#route(E.StartThreadWithoutMessage, ([channelId], request) => {
      const found = channelOr404(channelId!);
      if ('refused' in found) return found.refused;
      const given = body(request);
      const type =
        typeof given.type === 'number'
          ? (given.type as ChannelType)
          : ChannelType.PrivateThread;
      return { body: startThread(found.channel, given, type) };
    });
    this.#route(E.StartThreadInForumOrMediaChannel, ([channelId], request) => {
      const found = channelOr404(channelId!);
      if ('refused' in found) return found.refused;
      const given = body(request);
      const thread = startThread(
        found.channel,
        given,
        ChannelType.PublicThread
      );
      const message = this.createMessage(
        thread.id,
        this.bot,
        isRecord(given.message) ? given.message : {},
        request.files
      );
      return { body: { ...thread, message } };
    });
    const threadMembersUpdate = (
      thread: RawChannel,
      added: Snowflake[],
      removed: Snowflake[]
    ): void => {
      const inside = this.threadMembers.get(thread.id) ?? new Set();
      for (const id of added) inside.add(id);
      for (const id of removed) inside.delete(id);
      this.threadMembers.set(thread.id, inside);
      thread.member_count = inside.size;
      const members: RawThreadMember[] = added.map(id => ({
        id: thread.id,
        user_id: id,
        join_timestamp: now(),
        flags: 0,
        ...(this.members.get(id) ? { member: this.members.get(id) } : {}),
      }));
      this.#dispatchIfConnected('THREAD_MEMBERS_UPDATE', {
        id: thread.id,
        guild_id: thread.guild_id,
        member_count: inside.size,
        ...(members.length > 0 ? { added_members: members } : {}),
        ...(removed.length > 0 ? { removed_member_ids: removed } : {}),
      });
    };
    const threadOr404 = (
      id: string
    ): { thread: RawChannel } | { refused: FakeDiscordResponse } => {
      const found = channelOr404(id);
      if ('refused' in found) return found;
      return this.isThread(found.channel)
        ? { thread: found.channel }
        : { refused: unknown('Channel', 10003) };
    };
    this.#route(E.JoinThread, ([id]) => {
      const found = threadOr404(id!);
      if ('refused' in found) return found.refused;
      threadMembersUpdate(found.thread, [this.botId], []);
      return {};
    });
    this.#route(E.LeaveThread, ([id]) => {
      const found = threadOr404(id!);
      if ('refused' in found) return found.refused;
      threadMembersUpdate(found.thread, [], [this.botId]);
      return {};
    });
    this.#route(E.AddThreadMember, ([id, userId]) => {
      const found = threadOr404(id!);
      if ('refused' in found) return found.refused;
      if (!this.members.has(userId!)) return unknown('Member', 10007);
      threadMembersUpdate(found.thread, [userId!], []);
      return {};
    });
    this.#route(E.RemoveThreadMember, ([id, userId]) => {
      const found = threadOr404(id!);
      if ('refused' in found) return found.refused;
      threadMembersUpdate(found.thread, [], [userId!]);
      return {};
    });
    this.#route(E.ListThreadMembers, ([id]) => {
      const found = threadOr404(id!);
      if ('refused' in found) return found.refused;
      return {
        body: [...(this.threadMembers.get(id!) ?? [])].map(userId => ({
          id,
          user_id: userId,
          join_timestamp: now(),
          flags: 0,
          ...(this.members.get(userId)
            ? { member: this.members.get(userId) }
            : {}),
        })),
      };
    });

    // Messages.
    const messageOr404 = (
      channelId: string,
      messageId: string
    ):
      | { channel: RawChannel; message: RawMessage }
      | { refused: FakeDiscordResponse } => {
      const found = channelOr404(channelId);
      if ('refused' in found) return found;
      const message = this.messages
        .get(channelId)
        ?.find(one => one.id === messageId);
      return message
        ? { channel: found.channel, message }
        : { refused: unknown('Message', 10008) };
    };
    this.#route(E.GetChannelMessages, ([channelId], request) => {
      const found = channelOr404(channelId!);
      if ('refused' in found) return found.refused;
      const limit = Math.min(
        Number(request.query.limit?.[0] ?? 50),
        Limits.GetChannelMessages
      );
      // What only one person saw is not in the history of the channel.
      let list = (this.messages.get(channelId!) ?? []).filter(
        message => ((message.flags ?? 0) & MessageFlags.Ephemeral) === 0
      );
      const before = request.query.before?.[0];
      const after = request.query.after?.[0];
      if (before)
        list = list.filter(message => BigInt(message.id) < BigInt(before));
      if (after)
        list = list.filter(message => BigInt(message.id) > BigInt(after));
      // Newest first, as Discord returns them.
      return { body: list.reverse().slice(0, limit) };
    });
    this.#route(E.GetChannelMessage, ([channelId, messageId]) => {
      const found = messageOr404(channelId!, messageId!);
      return 'refused' in found ? found.refused : { body: found.message };
    });
    this.#route(E.CreateMessage, ([channelId], request) => {
      const found = channelOr404(channelId!);
      if ('refused' in found) return found.refused;
      return {
        body: this.createMessage(
          channelId!,
          this.bot,
          body(request),
          request.files
        ),
      };
    });
    this.#route(E.EditMessage, ([channelId, messageId], request) => {
      const found = messageOr404(channelId!, messageId!);
      if ('refused' in found) return found.refused;
      return { body: this.editMessage(found.message, body(request)) };
    });
    this.#route(E.DeleteMessage, ([channelId, messageId]) => {
      const found = messageOr404(channelId!, messageId!);
      if ('refused' in found) return found.refused;
      this.deleteMessage(found.message);
      return {};
    });
    this.#route(E.BulkDeleteMessages, ([channelId], request) => {
      const found = channelOr404(channelId!);
      if ('refused' in found) return found.refused;
      const ids = (body(request).messages as string[] | undefined) ?? [];
      const list = this.messages.get(channelId!)!;
      const deleted = ids.filter(id => list.some(message => message.id === id));
      this.messages.set(
        channelId!,
        list.filter(message => !deleted.includes(message.id))
      );
      this.#dispatchIfConnected('MESSAGE_DELETE_BULK', {
        ids: deleted,
        channel_id: channelId,
        ...(found.channel.guild_id ? { guild_id: found.channel.guild_id } : {}),
      });
      return {};
    });
    this.#route(E.PinMessage, ([channelId, messageId]) => {
      const found = messageOr404(channelId!, messageId!);
      if ('refused' in found) return found.refused;
      found.message.pinned = true;
      return {};
    });
    this.#route(E.UnpinMessage, ([channelId, messageId]) => {
      const found = messageOr404(channelId!, messageId!);
      if ('refused' in found) return found.refused;
      found.message.pinned = false;
      return {};
    });
    this.#route(E.CreateReaction, ([channelId, messageId, emoji]) => {
      const found = messageOr404(channelId!, messageId!);
      if ('refused' in found) return found.refused;
      const [name, id] = emoji!.split(':');
      this.#dispatchIfConnected('MESSAGE_REACTION_ADD', {
        user_id: this.botId,
        channel_id: channelId,
        message_id: messageId,
        ...(found.channel.guild_id
          ? {
              guild_id: found.channel.guild_id,
              member: this.members.get(this.botId),
            }
          : {}),
        emoji: { id: id ?? null, name },
        burst: false,
        type: 0,
      });
      return {};
    });
    for (const endpoint of [
      E.DeleteOwnReaction,
      E.DeleteUserReaction,
      E.DeleteAllReactions,
      E.DeleteAllReactionsForEmoji,
    ]) {
      this.#route(endpoint, ([channelId, messageId]) => {
        const found = messageOr404(channelId!, messageId!);
        return 'refused' in found ? found.refused : {};
      });
    }
    this.#route(E.GetReactions, ([channelId, messageId]) => {
      const found = messageOr404(channelId!, messageId!);
      return 'refused' in found ? found.refused : { body: [] };
    });

    // Interactions: the answers of the bot.
    const recordOr404 = (
      key: string
    ): { record: InteractionRecord } | { refused: FakeDiscordResponse } => {
      const record = this.interactions.get(key);
      return record ? { record } : { refused: unknown('Interaction', 10062) };
    };
    this.#route(E.CreateInteractionResponse, ([id, token], request) => {
      const found = recordOr404(id!);
      if ('refused' in found || found.record.token !== token) {
        return unknown('Interaction', 10062);
      }
      const { record } = found;
      if (record.callbacks.length > 0) {
        return {
          status: 400,
          body: {
            message: 'Interaction has already been acknowledged.',
            code: 40060,
          },
        };
      }
      const response = body(request) as unknown as RawInteractionResponse;
      record.callbacks.push(response);
      const channelId = record.raw.channel_id!;
      const withResponse = request.query.with_response?.[0] === 'true';
      const metadata = {
        id: record.id,
        type: record.raw.type,
        user: record.raw.member?.user ?? record.raw.user!,
        authorizing_integration_owners: {},
      };
      const data = (response.data ?? {}) as RawInteractionCallbackMessageData;
      switch (response.type) {
        case InteractionCallbackType.ChannelMessageWithSource:
          record.original = this.createMessage(
            channelId,
            this.bot,
            data as Record<string, unknown>,
            request.files,
            { interaction_metadata: metadata as never }
          );
          break;
        case InteractionCallbackType.DeferredChannelMessageWithSource:
          record.deferred = true;
          record.original = this.createMessage(
            channelId,
            this.bot,
            { flags: (data.flags ?? 0) | MessageFlags.Loading },
            {},
            { interaction_metadata: metadata as never }
          );
          break;
        case InteractionCallbackType.DeferredUpdateMessage:
          record.deferred = true;
          record.updated = true;
          record.original = record.message;
          break;
        case InteractionCallbackType.UpdateMessage:
          record.updated = true;
          if (record.message) {
            record.original = this.editMessage(
              record.message,
              data as Record<string, unknown>
            );
          }
          break;
        case InteractionCallbackType.ApplicationCommandAutocompleteResult:
          record.suggestions =
            (response.data as RawInteractionCallbackAutocompleteData).choices ??
            [];
          return {};
        case InteractionCallbackType.Modal:
          record.modal = response.data as RawInteractionCallbackModalData;
          return {};
        default:
          return {
            status: 400,
            body: {
              message: 'Invalid interaction response type.',
              code: 50035,
            },
          };
      }
      if (!withResponse) return {};
      return {
        body: {
          interaction: {
            id: record.id,
            type: record.raw.type,
            ...(record.original
              ? { response_message_id: record.original.id }
              : {}),
            response_message_loading: record.deferred,
            response_message_ephemeral:
              ((record.original?.flags ?? 0) & MessageFlags.Ephemeral) !== 0,
          },
          ...(record.original
            ? { resource: { type: response.type, message: record.original } }
            : {}),
        },
      };
    });
    this.#route(E.GetOriginalInteractionResponse, ([, token]) => {
      const found = recordOr404(token!);
      if ('refused' in found) return found.refused;
      return found.record.original
        ? { body: found.record.original }
        : unknown('Message', 10008);
    });
    this.#route(E.EditOriginalInteractionResponse, ([, token], request) => {
      const found = recordOr404(token!);
      if ('refused' in found) return found.refused;
      const { record } = found;
      if (!record.original) return unknown('Message', 10008);
      return { body: this.editMessage(record.original, body(request)) };
    });
    this.#route(E.DeleteOriginalInteractionResponse, ([, token]) => {
      const found = recordOr404(token!);
      if ('refused' in found) return found.refused;
      if (!found.record.original) return unknown('Message', 10008);
      this.deleteMessage(found.record.original);
      found.record.original = null;
      return {};
    });
    this.#route(E.CreateFollowupMessage, ([, token], request) => {
      const found = recordOr404(token!);
      if ('refused' in found) return found.refused;
      const { record } = found;
      const message = this.createMessage(
        record.raw.channel_id!,
        this.bot,
        body(request),
        request.files
      );
      record.followUps.push(message);
      return { body: message };
    });
    const followUpOr404 = (
      token: string,
      messageId: string
    ):
      | { record: InteractionRecord; message: RawMessage }
      | { refused: FakeDiscordResponse } => {
      const found = recordOr404(token);
      if ('refused' in found) return found;
      const message = found.record.followUps.find(one => one.id === messageId);
      return message
        ? { record: found.record, message }
        : { refused: unknown('Message', 10008) };
    };
    this.#route(E.GetFollowupMessage, ([, token, messageId]) => {
      const found = followUpOr404(token!, messageId!);
      return 'refused' in found ? found.refused : { body: found.message };
    });
    this.#route(E.EditFollowupMessage, ([, token, messageId], request) => {
      const found = followUpOr404(token!, messageId!);
      if ('refused' in found) return found.refused;
      return { body: this.editMessage(found.message, body(request)) };
    });
    this.#route(E.DeleteFollowupMessage, ([, token, messageId]) => {
      const found = followUpOr404(token!, messageId!);
      if ('refused' in found) return found.refused;
      this.deleteMessage(found.message);
      found.record.followUps.splice(
        found.record.followUps.indexOf(found.message),
        1
      );
      return {};
    });
  }
}

/** The raw interaction type of a kind of thing someone does. */
export const INTERACTION_TYPES = InteractionType;
/** Every permission, for the roles of tests. */
export const EVERY_PERMISSION = ALL_PERMISSIONS;
