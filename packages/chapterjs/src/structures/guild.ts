import { Limits } from '../discord/api.js';
import type { CacheStore } from '../cache/store.js';
import { cdn, type ImageOptions } from '../discord/cdn.js';
import {
  BulkGuildBan,
  CreateGuildChannel,
  CreateGuildEmoji,
  CreateGuildRole,
  CreateGuildScheduledEvent,
  GetGuild,
  GetGuildAuditLog,
  GetGuildBan,
  GetGuildBans,
  GetGuildChannels,
  GetGuildInvites,
  GetGuildMember,
  GetGuildRoles,
  GetGuildWebhooks,
  LeaveGuild,
  ListActiveGuildThreads,
  ListAutoModerationRulesForGuild,
  ListGuildEmojis,
  ListGuildMembers,
  ListGuildStickers,
  ListScheduledEventsForGuild,
  ModifyGuild,
  RemoveGuildBan,
  RemoveGuildMember,
  SearchGuildMembers,
} from '../discord/endpoints.js';
import { Permissions } from '../discord/permissions.js';
import type {
  GetGuildAuditLogQuery,
  RawAuditLog,
  RawAuditLogEntry,
} from '../discord/types/audit-log.js';
import type { RawAutoModerationRule } from '../discord/types/auto-moderation.js';
import type { Locale, Snowflake } from '../discord/types/common.js';
import type { RawGuildCreateExtra } from '../discord/types/gateway-events.js';
import type {
  CreateGuildScheduledEventJSONParams,
  RawGuildScheduledEvent,
} from '../discord/types/guild-scheduled-event.js';
import type {
  CreateGuildChannelJSONParams,
  CreateGuildRoleJSONParams,
  GuildFeature,
  ModifyGuildJSONParams,
  PremiumTier,
  RawGuild,
  VerificationLevel,
} from '../discord/types/guild.js';
import type { RawSticker } from '../discord/types/sticker.js';
import type { RawVoiceState } from '../discord/types/voice.js';
import { toCamelCase, toSnakeCase, type Camelize } from '../util/case.js';
import { ctxOf, dataOf, idOf, IdStructure } from './base.js';
import type { GuildChannel, ThreadChannel, VoiceChannel } from './channel.js';
import type { Context } from './context.js';
import { knownMember } from './known.js';
import type { GuildEmoji } from './emoji.js';
import type { Invite } from './invite.js';
import { banUser, type BanOptions, type GuildMember } from './member.js';
import type { Role } from './role.js';
import type { User } from './user.js';
import type { Webhook } from './webhook.js';

/** What a server stores itself; its roles, emojis... live in its stores. */
export type GuildData = Omit<RawGuild, 'roles' | 'emojis' | 'stickers'> &
  Partial<Pick<RawGuildCreateExtra, 'joined_at' | 'large' | 'member_count'>> & {
    unavailable?: boolean;
  };

/** What belongs to a server: forgotten with it. */
export interface GuildStores {
  roles: CacheStore<Snowflake, Role>;
  members: CacheStore<Snowflake, GuildMember>;
  channels: CacheStore<Snowflake, GuildChannel | ThreadChannel>;
  emojis: CacheStore<Snowflake, GuildEmoji>;
  /**
   * Who is in a voice channel, by user id: what the voice events compare
   * with. Only filled when Discord sends voice states, which is when a
   * file listens to them.
   */
  voiceStates: CacheStore<Snowflake, VoiceEntry>;
}

/** What the voice state of one person holds, without its member. */
export type VoiceStateData = Omit<RawVoiceState, 'member' | 'guild_id'>;

/** Someone in a voice channel: their state, and the channel they are in. */
export interface VoiceEntry {
  state: VoiceStateData;
  /** Kept with the state, so a channel deleted meanwhile is still known. */
  channel: VoiceChannel;
}

/**
 * Where someone is in voice, and how: muted, deafened, streaming...
 * @see https://docs.discord.com/developers/resources/voice#voice-state-object
 */
export type VoiceState = Camelize<VoiceStateData>;

/** Only the framework writes to the stores of a server. */
export let storesOf: (guild: Guild) => GuildStores;

/**
 * What `edit()` takes on a server: only what is passed changes. Images are
 * data URIs (`data:image/png;base64,...`).
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-json-params
 */
export type GuildEditOptions = Camelize<ModifyGuildJSONParams>;
/**
 * What `createChannel()` takes: a name, a type, and the settings of that
 * kind of channel.
 * @see https://docs.discord.com/developers/resources/guild#create-guild-channel-json-params
 */
export type ChannelCreateOptions = Camelize<CreateGuildChannelJSONParams>;
/**
 * What `createRole()` takes. Permissions are given by name, as a list of
 * names or as a `Permissions` set.
 * @see https://docs.discord.com/developers/resources/guild#create-guild-role-json-params
 */
export type RoleCreateOptions = Camelize<
  Omit<CreateGuildRoleJSONParams, 'permissions'>
> & {
  permissions?: Permissions | ConstructorParameters<typeof Permissions>[0];
};

/** A ban of a server. */
export interface Ban {
  /** Who is banned. */
  user: User;
  /** Why, when a reason was given. */
  reason: string | null;
}

/**
 * What moderators and bots did in a server: its entries, newest first, and
 * what they refer to.
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-object-audit-log-structure
 */
export type AuditLog = Camelize<RawAuditLog>;
/**
 * One thing a moderator or a bot did in a server: what, by whom, on what,
 * and what changed.
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-entry-object-audit-log-entry-structure
 */
export type AuditLogEntry = Camelize<RawAuditLogEntry>;
/**
 * An event scheduled in a server: when it happens, where, and how often.
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#guild-scheduled-event-object-guild-scheduled-event-structure
 */
export type ScheduledEvent = Camelize<RawGuildScheduledEvent>;
/**
 * A rule Discord applies by itself to the messages of a server: what
 * triggers it, and what it does then.
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-rule-object-auto-moderation-rule-structure
 */
export type AutoModerationRule = Camelize<RawAutoModerationRule>;
/**
 * A sticker: one of a server, or a standard one from a pack.
 * @see https://docs.discord.com/developers/resources/sticker#sticker-object-sticker-structure
 */
export type Sticker = Camelize<RawSticker>;

/**
 * A server ("guild" is the name Discord gives servers in its API).
 * @see https://docs.discord.com/developers/resources/guild#guild-object
 */
export class Guild extends IdStructure<GuildData> {
  readonly #stores: GuildStores;

  static {
    storesOf = guild => guild.#stores;
  }

  constructor(ctx: Context, data: GuildData) {
    super(ctx, data);
    const { createStore, limits } = ctx.cache;
    this.#stores = {
      roles: createStore(),
      members: createStore({ limit: limits.members }),
      channels: createStore(),
      emojis: createStore(),
      voiceStates: createStore(),
    };
  }

  /** The name of the server. */
  get name(): string {
    return dataOf(this).name;
  }

  /** The description of the server, when it has one. */
  get description(): string | null {
    return dataOf(this).description ?? null;
  }

  /** The id of the user who owns the server. */
  get ownerId(): Snowflake {
    return dataOf(this).owner_id;
  }

  /** `false` during an outage of Discord: the data may be out of date. */
  get available(): boolean {
    return !dataOf(this).unavailable;
  }

  /**
   * How many members the server has. Exact when the bot receives member
   * events, approximate otherwise; `null` when Discord never said it.
   */
  get memberCount(): number | null {
    const data = dataOf(this);
    return data.member_count ?? data.approximate_member_count ?? null;
  }

  /**
   * What the server has enabled or unlocked (`COMMUNITY`, `VANITY_URL`...).
   * @see https://docs.discord.com/developers/resources/guild#guild-object-guild-features
   */
  get features(): readonly GuildFeature[] {
    return dataOf(this).features ?? [];
  }

  /** What Discord asks of new members before they can write. */
  get verificationLevel(): VerificationLevel {
    return dataOf(this).verification_level;
  }

  /** The boost level of the server. */
  get premiumTier(): PremiumTier {
    return dataOf(this).premium_tier;
  }

  /** How many boosts the server has. */
  get boostCount(): number {
    return dataOf(this).premium_subscription_count ?? 0;
  }

  /** The language of the server, used for what Discord sends to it. */
  get preferredLocale(): Locale {
    return dataOf(this).preferred_locale;
  }

  /** The code of the custom invite link of the server, when it has one. */
  get vanityUrlCode(): string | null {
    return dataOf(this).vanity_url_code ?? null;
  }

  /** The id of the channel where Discord posts welcome messages. */
  get systemChannelId(): Snowflake | null {
    return dataOf(this).system_channel_id ?? null;
  }

  /** The id of the channel that shows the rules, in a community server. */
  get rulesChannelId(): Snowflake | null {
    return dataOf(this).rules_channel_id ?? null;
  }

  /** The id of the voice channel inactive members are moved to. */
  get afkChannelId(): Snowflake | null {
    return dataOf(this).afk_channel_id ?? null;
  }

  /** When the bot joined the server, when Discord said it. */
  get joinedAt(): Date | null {
    const joined = dataOf(this).joined_at;
    return joined ? new Date(joined) : null;
  }

  /** The roles of the server, @everyone included. */
  get roles(): ReadonlyMap<Snowflake, Role> {
    return this.#stores.roles;
  }

  /**
   * The members of the server the bot knows: the ones seen the most
   * recently, not all of them.
   */
  get members(): ReadonlyMap<Snowflake, GuildMember> {
    return this.#stores.members;
  }

  /** The channels and active threads of the server. */
  get channels(): ReadonlyMap<Snowflake, GuildChannel | ThreadChannel> {
    return this.#stores.channels;
  }

  /** The custom emojis of the server. */
  get emojis(): ReadonlyMap<Snowflake, GuildEmoji> {
    return this.#stores.emojis;
  }

  /** The @everyone role, which every member has. */
  get everyoneRole(): Role {
    const role = this.#stores.roles.get(this.id);
    if (!role) throw this.#notReceived('roles');
    return role;
  }

  /** The bot as a member of this server. */
  get me(): GuildMember {
    const self = ctxOf(this).self;
    // Kept apart too: a limit on how many members are remembered must
    // never make the bot forget itself.
    const member =
      (self ? this.#stores.members.get(self.userId) : undefined) ??
      knownMember(this);
    if (!member) throw this.#notReceived('members');
    return member;
  }

  /**
   * Discord sends the roles of a server and the bot as one of its members
   * with the server itself: they are only missing while it is unavailable.
   */
  #notReceived(what: string): Error {
    return new Error(
      `Discord has not sent the ${what} of the server ${this.id}${this.available ? '' : ', which is unavailable (an outage on their side)'}.`
    );
  }

  /** The URL of the icon of the server, when it has one. */
  iconURL(options?: ImageOptions): string | null {
    const icon = dataOf(this).icon;
    return icon ? cdn.guildIcon(this.id, icon, options) : null;
  }

  /** The URL of the banner of the server, when it has one. */
  bannerURL(options?: ImageOptions): string | null {
    const banner = dataOf(this).banner;
    return banner ? cdn.guildBanner(this.id, banner, options) : null;
  }

  /** The URL of the invite background of the server, when it has one. */
  splashURL(options?: ImageOptions): string | null {
    const splash = dataOf(this).splash;
    return splash ? cdn.guildSplash(this.id, splash, options) : null;
  }

  /**
   * Asks Discord for the latest data of the server.
   * @see https://docs.discord.com/developers/resources/guild#get-guild
   */
  async fetch(): Promise<Guild> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetGuild, [this.id], {
      query: { with_counts: true },
    });
    return entities.guild(raw);
  }

  /**
   * Changes the settings of the server.
   * @see https://docs.discord.com/developers/resources/guild#modify-guild
   */
  async edit(options: GuildEditOptions, reason?: string): Promise<Guild> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(ModifyGuild, [this.id], {
      body: toSnakeCase<ModifyGuildJSONParams>(options),
      reason,
    });
    return entities.guild(raw);
  }

  /**
   * Makes the bot leave the server.
   * @see https://docs.discord.com/developers/resources/user#leave-guild
   */
  async leave(): Promise<void> {
    await ctxOf(this).rest.request(LeaveGuild, [this.id]);
  }

  // -- Members ---------------------------------------------------------------

  /**
   * A member of the server: from what the bot remembers, or else from Discord.
   * @see https://docs.discord.com/developers/resources/guild#get-guild-member
   */
  async fetchMember(
    user: Snowflake | { id: Snowflake },
    { force = false }: { force?: boolean } = {}
  ): Promise<GuildMember> {
    const { rest, entities } = ctxOf(this);
    const id = idOf(user);
    const cached = force ? undefined : this.#stores.members.get(id);
    if (cached) return cached;
    return entities.member(
      this.id,
      await rest.request(GetGuildMember, [this.id, id])
    );
  }

  /**
   * Members of the server, by pages of 1000 at most, ordered by id. Needs
   * the Server Members intent to be enabled for the bot.
   * @see https://docs.discord.com/developers/resources/guild#list-guild-members
   */
  async fetchMembers(
    options: { limit?: number; after?: Snowflake | { id: Snowflake } } = {}
  ): Promise<GuildMember[]> {
    const { rest, entities } = ctxOf(this);
    const limit = options.limit ?? Limits.ListGuildMembers;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > Limits.ListGuildMembers
    ) {
      throw new RangeError(
        `limit is a whole number between 1 and ${Limits.ListGuildMembers}, got ${limit}.`
      );
    }
    const raw = await rest.request(ListGuildMembers, [this.id], {
      query: { limit, after: options.after && idOf(options.after) },
    });
    return raw.map(member => entities.member(this.id, member));
  }

  /**
   * Members whose username or nickname starts with the given text.
   * @see https://docs.discord.com/developers/resources/guild#search-guild-members
   */
  async searchMembers(query: string, limit = 1): Promise<GuildMember[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(SearchGuildMembers, [this.id], {
      query: { query, limit },
    });
    return raw.map(member => entities.member(this.id, member));
  }

  /** The member who owns the server. */
  async fetchOwner(): Promise<GuildMember> {
    return this.fetchMember(this.ownerId);
  }

  /**
   * Removes a member from the server; they can come back with an invite.
   * @see https://docs.discord.com/developers/resources/guild#remove-guild-member
   */
  async kick(
    user: Snowflake | { id: Snowflake },
    reason?: string
  ): Promise<void> {
    await ctxOf(this).rest.request(RemoveGuildMember, [this.id, idOf(user)], {
      reason,
    });
  }

  // -- Bans ------------------------------------------------------------------

  /**
   * Bans a user from the server, member or not.
   * @see https://docs.discord.com/developers/resources/guild#create-guild-ban
   */
  async ban(
    user: Snowflake | { id: Snowflake },
    options: BanOptions = {}
  ): Promise<void> {
    await banUser(ctxOf(this), this.id, idOf(user), options);
  }

  /**
   * Bans up to 200 users at once.
   * @returns the ids of the users that were banned, and of those that could not be
   * @see https://docs.discord.com/developers/resources/guild#bulk-guild-ban
   */
  async bulkBan(
    users: readonly (Snowflake | { id: Snowflake })[],
    options: BanOptions = {}
  ): Promise<{ bannedUsers: Snowflake[]; failedUsers: Snowflake[] }> {
    if (users.length === 0 || users.length > Limits.BulkBanUsers) {
      throw new RangeError(
        `bulkBan() takes between 1 and ${Limits.BulkBanUsers} users, got ${users.length}.`
      );
    }
    const raw = await ctxOf(this).rest.request(BulkGuildBan, [this.id], {
      body: {
        user_ids: users.map(idOf),
        delete_message_seconds: options.deleteMessageSeconds,
      },
      reason: options.reason,
    });
    return toCamelCase(raw);
  }

  /**
   * Lifts the ban of a user.
   * @see https://docs.discord.com/developers/resources/guild#remove-guild-ban
   */
  async unban(
    user: Snowflake | { id: Snowflake },
    reason?: string
  ): Promise<void> {
    await ctxOf(this).rest.request(RemoveGuildBan, [this.id, idOf(user)], {
      reason,
    });
  }

  /**
   * The ban of a user; `null` when they are not banned.
   * @see https://docs.discord.com/developers/resources/guild#get-guild-ban
   */
  async fetchBan(user: Snowflake | { id: Snowflake }): Promise<Ban | null> {
    const { rest, entities } = ctxOf(this);
    try {
      const raw = await rest.request(GetGuildBan, [this.id, idOf(user)]);
      return { user: entities.user(raw.user), reason: raw.reason };
    } catch (error) {
      // 10026: Unknown ban.
      if ((error as { code?: unknown })?.code === 10026) return null;
      throw error;
    }
  }

  /**
   * The bans of the server, by pages of 1000 at most.
   * @see https://docs.discord.com/developers/resources/guild#get-guild-bans
   */
  async fetchBans(
    options: { limit?: number; before?: Snowflake; after?: Snowflake } = {}
  ): Promise<Ban[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetGuildBans, [this.id], { query: options });
    return raw.map(ban => ({
      user: entities.user(ban.user),
      reason: ban.reason,
    }));
  }

  // -- Roles -----------------------------------------------------------------

  /**
   * Asks Discord for the roles of the server.
   * @see https://docs.discord.com/developers/resources/guild#get-guild-roles
   */
  async fetchRoles(): Promise<Role[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetGuildRoles, [this.id]);
    return raw.map(role => entities.role(this.id, role));
  }

  /**
   * Creates a role.
   * @see https://docs.discord.com/developers/resources/guild#create-guild-role
   */
  async createRole(
    options: RoleCreateOptions = {},
    reason?: string
  ): Promise<Role> {
    const { rest, entities } = ctxOf(this);
    const { permissions, ...others } = options;
    const body = toSnakeCase<CreateGuildRoleJSONParams>(others);
    if (permissions !== undefined) {
      body.permissions = new Permissions(permissions).toString();
    }
    const raw = await rest.request(CreateGuildRole, [this.id], {
      body,
      reason,
    });
    return entities.role(this.id, raw);
  }

  // -- Channels --------------------------------------------------------------

  /**
   * The channels of the server (threads are not included).
   * @see https://docs.discord.com/developers/resources/guild#get-guild-channels
   */
  async fetchChannels(): Promise<GuildChannel[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetGuildChannels, [this.id]);
    return raw.map(
      channel => entities.channel(channel, this.id) as GuildChannel
    );
  }

  /**
   * Creates a channel.
   * @see https://docs.discord.com/developers/resources/guild#create-guild-channel
   */
  async createChannel(
    options: ChannelCreateOptions,
    reason?: string
  ): Promise<GuildChannel> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(CreateGuildChannel, [this.id], {
      body: toSnakeCase<CreateGuildChannelJSONParams>(options),
      reason,
    });
    return entities.channel(raw, this.id) as GuildChannel;
  }

  /**
   * The threads of the server that are not archived.
   * @see https://docs.discord.com/developers/resources/guild#list-active-guild-threads
   */
  async fetchActiveThreads(): Promise<ThreadChannel[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(ListActiveGuildThreads, [this.id]);
    return raw.threads.map(
      thread => entities.channel(thread, this.id) as ThreadChannel
    );
  }

  // -- Everything else -------------------------------------------------------

  /**
   * Asks Discord for the custom emojis of the server.
   * @see https://docs.discord.com/developers/resources/emoji#list-guild-emojis
   */
  async fetchEmojis(): Promise<GuildEmoji[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(ListGuildEmojis, [this.id]);
    return raw.map(emoji => entities.emoji(this.id, emoji));
  }

  /**
   * Adds a custom emoji to the server.
   * @param options.image the image as a data URI (`data:image/png;base64,...`)
   * @see https://docs.discord.com/developers/resources/emoji#create-guild-emoji
   */
  async createEmoji(
    options: {
      name: string;
      image: string;
      roles?: (Snowflake | { id: Snowflake })[];
    },
    reason?: string
  ): Promise<GuildEmoji> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(CreateGuildEmoji, [this.id], {
      body: {
        name: options.name,
        image: options.image,
        roles: options.roles?.map(idOf) ?? [],
      },
      reason,
    });
    return entities.emoji(this.id, raw);
  }

  /**
   * The invites of the server, with how many times each was used.
   * @see https://docs.discord.com/developers/resources/guild#get-guild-invites
   */
  async fetchInvites(): Promise<Invite[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetGuildInvites, [this.id]);
    return raw.map(invite => entities.invite(invite));
  }

  /**
   * The webhooks of every channel of the server.
   * @see https://docs.discord.com/developers/resources/webhook#get-guild-webhooks
   */
  async fetchWebhooks(): Promise<Webhook[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetGuildWebhooks, [this.id]);
    return raw.map(webhook => entities.webhook(webhook));
  }

  /**
   * What moderators and bots did in the server.
   * @see https://docs.discord.com/developers/resources/audit-log#get-guild-audit-log
   */
  async fetchAuditLog(
    options: Camelize<GetGuildAuditLogQuery> = {}
  ): Promise<AuditLog> {
    const raw = await ctxOf(this).rest.request(GetGuildAuditLog, [this.id], {
      query: toSnakeCase<GetGuildAuditLogQuery>(options),
    });
    return toCamelCase(raw);
  }

  /**
   * The scheduled events of the server.
   * @see https://docs.discord.com/developers/resources/guild-scheduled-event#list-scheduled-events-for-guild
   */
  async fetchScheduledEvents(): Promise<ScheduledEvent[]> {
    const raw = await ctxOf(this).rest.request(
      ListScheduledEventsForGuild,
      [this.id],
      { query: { with_user_count: true } }
    );
    return toCamelCase(raw);
  }

  /**
   * Schedules an event in the server.
   * @see https://docs.discord.com/developers/resources/guild-scheduled-event#create-guild-scheduled-event
   */
  async createScheduledEvent(
    options: Camelize<CreateGuildScheduledEventJSONParams>,
    reason?: string
  ): Promise<ScheduledEvent> {
    const raw = await ctxOf(this).rest.request(
      CreateGuildScheduledEvent,
      [this.id],
      {
        body: toSnakeCase<CreateGuildScheduledEventJSONParams>(options),
        reason,
      }
    );
    return toCamelCase(raw);
  }

  /**
   * The auto moderation rules of the server.
   * @see https://docs.discord.com/developers/resources/auto-moderation#list-auto-moderation-rules-for-guild
   */
  async fetchAutoModerationRules(): Promise<AutoModerationRule[]> {
    const raw = await ctxOf(this).rest.request(
      ListAutoModerationRulesForGuild,
      [this.id]
    );
    return toCamelCase(raw);
  }

  /**
   * The custom stickers of the server.
   * @see https://docs.discord.com/developers/resources/sticker#list-guild-stickers
   */
  async fetchStickers(): Promise<Sticker[]> {
    const raw = await ctxOf(this).rest.request(ListGuildStickers, [this.id]);
    return toCamelCase(raw);
  }

  /** The name of the server. */
  toString(): string {
    return this.name;
  }
}
