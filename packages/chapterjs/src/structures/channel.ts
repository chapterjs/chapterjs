import { Limits } from '../discord/api.js';
import type { CacheStore } from '../cache/store.js';
import {
  AddThreadMember,
  BulkDeleteMessages,
  CreateChannelInvite,
  CreateWebhook,
  DeleteChannelPermission,
  DeleteCloseChannel,
  DeleteMessage,
  EditChannelPermissions,
  FollowAnnouncementChannel,
  GetChannel,
  GetChannelInvites,
  GetChannelMessage,
  GetChannelMessages,
  GetChannelPins,
  GetChannelWebhooks,
  JoinThread,
  LeaveThread,
  ListThreadMembers,
  ModifyChannel,
  RemoveThreadMember,
  SetVoiceChannelStatus,
  StartThreadInForumOrMediaChannel,
  StartThreadWithoutMessage,
  TriggerTypingIndicator,
} from '../discord/endpoints.js';
import { channelMention } from '../discord/formatting.js';
import {
  applyImplicitPermissions,
  applyTimeout,
  computeBasePermissions,
  computeOverwrites,
  Permissions,
  type PermissionResolvable,
} from '../discord/permissions.js';
import { snowflakeTimestamp } from '../discord/snowflake.js';
import {
  ChannelType,
  PermissionOverwriteType,
  type CreateChannelInviteJSONParams,
  type ModifyGuildChannelJSONParams,
  type ModifyThreadJSONParams,
  type RawChannel,
  type RawForumTag,
  type RawThreadMember,
  type StartThreadWithoutMessageJSONParams,
} from '../discord/types/channel.js';
import type { Snowflake } from '../discord/types/common.js';
import type { CreateWebhookJSONParams } from '../discord/types/webhook.js';
import { toCamelCase, toSnakeCase, type Camelize } from '../util/case.js';
import { ctxOf, dataOf, idOf, IdStructure, mixin, toDate } from './base.js';
import type { Guild } from './guild.js';
import { findGuild, guildOf } from './known.js';
import type { Invite } from './invite.js';
import { GuildMember } from './member.js';
import { sendMessage, type Message } from './message.js';
import { buildMessage, type MessageInput } from './payload.js';
import { Role } from './role.js';
import type { User } from './user.js';
import type { Webhook } from './webhook.js';

/** The messages remembered for each channel, when the cache keeps some. */
const messageStores = new WeakMap<Channel, CacheStore<Snowflake, Message>>();

/** Only the framework writes to the messages of a channel. */
export function messagesOf(channel: Channel): CacheStore<Snowflake, Message> {
  let store = messageStores.get(channel);
  if (!store) {
    const { cache } = ctxOf(channel);
    store = cache.createStore({ limit: cache.limits.messages });
    messageStores.set(channel, store);
  }
  return store;
}

const TEXT_BASED: ReadonlySet<ChannelType> = new Set([
  ChannelType.GuildText,
  ChannelType.Dm,
  ChannelType.GuildVoice,
  ChannelType.GroupDm,
  ChannelType.GuildAnnouncement,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildStageVoice,
]);

/**
 * A channel of any kind. Use the `is...()` methods to know which kind it is
 * and get the properties and actions of that kind.
 * @see https://docs.discord.com/developers/resources/channel#channel-object
 */
export class Channel extends IdStructure<RawChannel> {
  /**
   * The kind of channel, as a value of `ChannelType`.
   * @see https://docs.discord.com/developers/resources/channel#channel-object-channel-types
   */
  get type(): ChannelType {
    return dataOf(this).type;
  }

  /** The id of the server of the channel; `null` for a private one. */
  get guildId(): Snowflake | null {
    return dataOf(this).guild_id ?? null;
  }

  /** The server of the channel; `null` for a private one. */
  get guild(): Guild | null {
    return findGuild(this, this.guildId);
  }

  /** Whether messages can be sent in it. */
  isTextBased(): this is TextBasedChannel {
    return TEXT_BASED.has(this.type);
  }

  /** Whether it belongs to a server and is not a thread. */
  isGuildChannel(): this is GuildChannel {
    return this instanceof GuildChannel;
  }

  /** A text or announcement channel of a server. */
  isText(): this is TextChannel {
    return this instanceof TextChannel;
  }

  /** A voice or stage channel. */
  isVoice(): this is VoiceChannel {
    return this instanceof VoiceChannel;
  }

  /** A category, which groups channels. */
  isCategory(): this is CategoryChannel {
    return this instanceof CategoryChannel;
  }

  /** A forum or media channel, made of posts. */
  isForum(): this is ForumChannel {
    return this instanceof ForumChannel;
  }

  /** A thread, or a post of a forum. */
  isThread(): this is ThreadChannel {
    return this instanceof ThreadChannel;
  }

  /** A private conversation. */
  isDM(): this is DMChannel {
    return this instanceof DMChannel;
  }

  /** Asks Discord for the latest data of the channel. */
  async fetch(): Promise<Channel> {
    const { rest, entities } = ctxOf(this);
    return entities.channel(await rest.request(GetChannel, [this.id]));
  }

  /**
   * Deletes the channel (closes it, for a private conversation).
   * @see https://docs.discord.com/developers/resources/channel#deleteclose-channel
   */
  async delete(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(DeleteCloseChannel, [this.id], { reason });
  }

  /** `<#id>`: links the channel when put in a message. */
  toString(): string {
    return channelMention(this.id);
  }
}

// ---------------------------------------------------------------------------
// What every channel with messages can do
// ---------------------------------------------------------------------------

export interface FetchMessagesOptions {
  /** How many messages, from 1 to 100. Default: 50. */
  limit?: number;
  /** Only messages before this one. */
  before?: Snowflake | { id: Snowflake };
  /** Only messages after this one. */
  after?: Snowflake | { id: Snowflake };
  /** Messages around this one. */
  around?: Snowflake | { id: Snowflake };
}

export interface TextBasedMethods {
  /** The messages of the channel the bot remembers. */
  readonly messages: ReadonlyMap<Snowflake, Message>;
  /** The id of the last message sent in the channel, when known. */
  readonly lastMessageId: Snowflake | null;
  /**
   * Sends a message in the channel.
   * @see https://docs.discord.com/developers/resources/message#create-message
   */
  send(message: MessageInput): Promise<Message>;
  /**
   * A message of the channel: from the cache, or else from Discord.
   * @see https://docs.discord.com/developers/resources/message#get-channel-message
   */
  fetchMessage(id: Snowflake, options?: { force?: boolean }): Promise<Message>;
  /**
   * The latest messages of the channel, newest first.
   * @see https://docs.discord.com/developers/resources/message#get-channel-messages
   */
  fetchMessages(options?: FetchMessagesOptions): Promise<Message[]>;
  /**
   * Deletes several messages at once. Messages older than two weeks can't
   * be deleted in bulk: they are left out, and their number is not counted
   * in the result.
   * @returns how many messages were deleted
   * @see https://docs.discord.com/developers/resources/message#bulk-delete-messages
   */
  bulkDelete(
    messages: readonly (Snowflake | { id: Snowflake })[],
    reason?: string
  ): Promise<number>;
  /**
   * Shows "the bot is typing…" for 10 seconds, or until it sends a message.
   * @see https://docs.discord.com/developers/resources/channel#trigger-typing-indicator
   */
  sendTyping(): Promise<void>;
  /**
   * The pinned messages of the channel, latest pin first.
   * @see https://docs.discord.com/developers/resources/message#get-channel-pins
   */
  fetchPins(): Promise<Message[]>;
}

const textBasedMethods: TextBasedMethods &
  ThisType<Channel & TextBasedMethods> = {
  get messages() {
    return messagesOf(this);
  },

  get lastMessageId() {
    return dataOf(this).last_message_id ?? null;
  },

  send(message) {
    return sendMessage(
      ctxOf(this),
      this.id,
      message,
      this.guildId ?? undefined
    );
  },

  async fetchMessage(id, { force = false } = {}) {
    const { rest, entities } = ctxOf(this);
    const cached = force ? undefined : messagesOf(this).get(id);
    if (cached) return cached;
    const raw = await rest.request(GetChannelMessage, [this.id, id]);
    return entities.message(raw, this.guildId ?? undefined);
  },

  async fetchMessages(options = {}) {
    const { rest, entities } = ctxOf(this);
    const { limit } = options;
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) ||
        limit < 1 ||
        limit > Limits.GetChannelMessages)
    ) {
      throw new RangeError(
        `limit is a whole number between 1 and ${Limits.GetChannelMessages}, got ${limit}.`
      );
    }
    const raw = await rest.request(GetChannelMessages, [this.id], {
      query: {
        limit,
        before: options.before && idOf(options.before),
        after: options.after && idOf(options.after),
        around: options.around && idOf(options.around),
      },
    });
    return raw.map(message =>
      entities.message(message, this.guildId ?? undefined)
    );
  },

  async bulkDelete(messages, reason) {
    const { rest } = ctxOf(this);
    const oldest = Date.now() - Limits.BulkDeleteMaxAge;
    const ids = [...new Set(messages.map(idOf))].filter(
      id => snowflakeTimestamp(id) > oldest
    );
    // The endpoint takes 2 to 100 messages at a time.
    for (let start = 0; start < ids.length; start += Limits.BulkDeleteMax) {
      const chunk = ids.slice(start, start + Limits.BulkDeleteMax);
      if (chunk.length < Limits.BulkDeleteMin) {
        await rest.request(DeleteMessage, [this.id, chunk[0]!], { reason });
      } else {
        await rest.request(BulkDeleteMessages, [this.id], {
          body: { messages: chunk },
          reason,
        });
      }
    }
    return ids.length;
  },

  async sendTyping() {
    await ctxOf(this).rest.request(TriggerTypingIndicator, [this.id]);
  },

  async fetchPins() {
    const { rest, entities } = ctxOf(this);
    const messages: Message[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await rest.request(GetChannelPins, [this.id], {
        query: { limit: 50, before },
      });
      for (const pin of page.items) {
        messages.push(entities.message(pin.message, this.guildId ?? undefined));
      }
      const last = page.items.at(-1);
      if (!page.has_more || !last) return messages;
      before = last.pinned_at;
    }
  },
};

// ---------------------------------------------------------------------------
// Channels of a server
// ---------------------------------------------------------------------------

/** What a role or a member is allowed or denied in one channel. */
export interface PermissionOverwrite {
  /** The id of the role or of the member. */
  id: Snowflake;
  type: 'role' | 'member';
  /** What is allowed, whatever the server says. */
  allow: Permissions;
  /** What is denied, whatever the server says. */
  deny: Permissions;
}

export type GuildChannelEditOptions = Camelize<ModifyGuildChannelJSONParams>;
export type InviteCreateOptions = Camelize<CreateChannelInviteJSONParams>;

/**
 * A channel of a server (not a thread).
 * @see https://docs.discord.com/developers/resources/channel#channel-object
 */
export class GuildChannel extends Channel {
  /** The id of the server of the channel. */
  override get guildId(): Snowflake {
    return dataOf(this).guild_id!;
  }

  /** The server of the channel. */
  override get guild(): Guild {
    return guildOf(this, this.guildId);
  }

  /** The name of the channel. */
  get name(): string {
    return dataOf(this).name ?? '';
  }

  /** Where the channel is in the list. */
  get position(): number {
    return dataOf(this).position ?? 0;
  }

  /** The id of the category of the channel, when it is in one. */
  get parentId(): Snowflake | null {
    return dataOf(this).parent_id ?? null;
  }

  /** The category of the channel, when it is in one and it is known. */
  get parent(): CategoryChannel | null {
    const id = this.parentId;
    const parent = id ? ctxOf(this).cache.channels.get(id) : undefined;
    return parent?.isCategory() ? parent : null;
  }

  /** Whether the channel is age-restricted. */
  get nsfw(): boolean {
    return dataOf(this).nsfw ?? false;
  }

  /** What roles and members are allowed or denied in this channel. */
  get permissionOverwrites(): PermissionOverwrite[] {
    return (dataOf(this).permission_overwrites ?? []).map(overwrite => ({
      id: overwrite.id,
      type: overwrite.type === PermissionOverwriteType.Role ? 'role' : 'member',
      allow: new Permissions(overwrite.allow),
      deny: new Permissions(overwrite.deny),
    }));
  }

  /**
   * What a member can do in this channel: their permissions in the server,
   * changed by the overwrites of the channel.
   * @see https://docs.discord.com/developers/topics/permissions#permission-overwrites
   */
  permissionsFor(member: GuildMember): Permissions {
    const guild = this.guild;
    if (!guild) {
      throw new Error(
        'The permissions in this channel are unknown: its server is not in the cache.'
      );
    }
    const base = computeBasePermissions({
      guildId: this.guildId,
      ownerId: guild.ownerId,
      userId: member.id,
      memberRoleIds: member.roleIds,
      roles: [...guild.roles.values()].map(role => ({
        id: role.id,
        permissions: role.permissions.bits,
      })),
    });
    let permissions = computeOverwrites(base, {
      guildId: this.guildId,
      userId: member.id,
      memberRoleIds: member.roleIds,
      overwrites: (dataOf(this).permission_overwrites ?? []).map(overwrite => ({
        id: overwrite.id,
        allow: BigInt(overwrite.allow),
        deny: BigInt(overwrite.deny),
      })),
    });
    if (member.isTimedOut) permissions = applyTimeout(permissions);
    return new Permissions(applyImplicitPermissions(permissions));
  }

  /**
   * Changes the channel.
   * @see https://docs.discord.com/developers/resources/channel#modify-channel
   */
  async edit(options: GuildChannelEditOptions, reason?: string): Promise<this> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(ModifyChannel, [this.id], {
      body: toSnakeCase<ModifyGuildChannelJSONParams>(options),
      reason,
    });
    return entities.channel(raw) as this;
  }

  /**
   * Allows or denies permissions to a role or a member in this channel.
   * Permissions that are in neither list follow the server.
   * @see https://docs.discord.com/developers/resources/channel#edit-channel-permissions
   */
  async setPermissions(
    target: Role | GuildMember | User,
    permissions: { allow?: PermissionResolvable; deny?: PermissionResolvable },
    reason?: string
  ): Promise<void> {
    await ctxOf(this).rest.request(
      EditChannelPermissions,
      [this.id, target.id],
      {
        body: {
          type:
            target instanceof Role
              ? PermissionOverwriteType.Role
              : PermissionOverwriteType.Member,
          allow: new Permissions(permissions.allow).toString(),
          deny: new Permissions(permissions.deny).toString(),
        },
        reason,
      }
    );
  }

  /**
   * Removes what was set for a role or a member in this channel.
   * @see https://docs.discord.com/developers/resources/channel#delete-channel-permission
   */
  async deletePermissions(
    target: Snowflake | { id: Snowflake },
    reason?: string
  ): Promise<void> {
    await ctxOf(this).rest.request(
      DeleteChannelPermission,
      [this.id, idOf(target)],
      { reason }
    );
  }

  /**
   * Creates an invite to this channel.
   * @see https://docs.discord.com/developers/resources/channel#create-channel-invite
   */
  async createInvite(
    options: InviteCreateOptions = {},
    reason?: string
  ): Promise<Invite> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(CreateChannelInvite, [this.id], {
      body: toSnakeCase<CreateChannelInviteJSONParams>(options),
      reason,
    });
    return entities.invite(raw);
  }

  /**
   * The invites that lead to this channel.
   * @see https://docs.discord.com/developers/resources/channel#get-channel-invites
   */
  async fetchInvites(): Promise<Invite[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetChannelInvites, [this.id]);
    return raw.map(invite => entities.invite(invite));
  }

  /**
   * Creates a webhook that posts in this channel.
   * @see https://docs.discord.com/developers/resources/webhook#create-webhook
   */
  async createWebhook(
    options: Camelize<CreateWebhookJSONParams>,
    reason?: string
  ): Promise<Webhook> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(CreateWebhook, [this.id], {
      body: toSnakeCase<CreateWebhookJSONParams>(options),
      reason,
    });
    return entities.webhook(raw);
  }

  /**
   * The webhooks that post in this channel.
   * @see https://docs.discord.com/developers/resources/webhook#get-channel-webhooks
   */
  async fetchWebhooks(): Promise<Webhook[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetChannelWebhooks, [this.id]);
    return raw.map(webhook => entities.webhook(webhook));
  }
}

export type ThreadCreateOptions = Camelize<StartThreadWithoutMessageJSONParams>;

/** A text or announcement channel of a server. */
export class TextChannel extends GuildChannel {
  /** The topic shown at the top of the channel. */
  get topic(): string | null {
    return dataOf(this).topic ?? null;
  }

  /** How many seconds a member waits between two messages (slowmode). */
  get slowmode(): number {
    return dataOf(this).rate_limit_per_user ?? 0;
  }

  /** Whether it is an announcement channel, which servers can follow. */
  get isAnnouncement(): boolean {
    return this.type === ChannelType.GuildAnnouncement;
  }

  /**
   * Starts a thread that is not attached to a message. To start one from a
   * message, use `message.startThread()`.
   * @see https://docs.discord.com/developers/resources/channel#start-thread-without-message
   */
  async startThread(
    options: ThreadCreateOptions,
    reason?: string
  ): Promise<ThreadChannel> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(StartThreadWithoutMessage, [this.id], {
      body: toSnakeCase<StartThreadWithoutMessageJSONParams>(options),
      reason,
    });
    return entities.channel(raw) as ThreadChannel;
  }

  /**
   * Makes another channel receive what is published in this announcement
   * channel.
   * @see https://docs.discord.com/developers/resources/channel#follow-announcement-channel
   */
  async follow(
    target: Snowflake | { id: Snowflake },
    reason?: string
  ): Promise<void> {
    await ctxOf(this).rest.request(FollowAnnouncementChannel, [this.id], {
      body: { webhook_channel_id: idOf(target) },
      reason,
    });
  }
}
export interface TextChannel extends TextBasedMethods {}
mixin(TextChannel, textBasedMethods);

/** A voice or stage channel: people talk in it, and can write too. */
export class VoiceChannel extends GuildChannel {
  /** The audio quality, in bits per second. */
  get bitrate(): number {
    return dataOf(this).bitrate ?? 0;
  }

  /** How many people can join; `0` means no limit. */
  get userLimit(): number {
    return dataOf(this).user_limit ?? 0;
  }

  /** The voice region of the channel; `null` when Discord picks it. */
  get rtcRegion(): string | null {
    return dataOf(this).rtc_region ?? null;
  }

  /** Whether it is a stage channel, where a few speak and the others listen. */
  get isStage(): boolean {
    return this.type === ChannelType.GuildStageVoice;
  }

  /**
   * Sets the status shown under the name of the voice channel; `null`
   * removes it.
   * @see https://docs.discord.com/developers/resources/channel#set-voice-channel-status
   */
  async setStatus(status: string | null, reason?: string): Promise<void> {
    await ctxOf(this).rest.request(SetVoiceChannelStatus, [this.id], {
      body: { status },
      reason,
    });
  }
}
export interface VoiceChannel extends TextBasedMethods {}
mixin(VoiceChannel, textBasedMethods);

/** A category: it groups channels. */
export class CategoryChannel extends GuildChannel {
  /** The channels of the category the bot knows, in order. */
  get children(): GuildChannel[] {
    const guild = this.guild;
    if (!guild) return [];
    return [...guild.channels.values()]
      .filter(
        (channel): channel is GuildChannel =>
          channel.isGuildChannel() && channel.parentId === this.id
      )
      .sort((a, b) => a.position - b.position);
  }
}

export type ForumTag = Camelize<RawForumTag>;

export interface ForumPostOptions {
  /** The title of the post. */
  name: string;
  /** The first message of the post. */
  message: MessageInput;
  /** The ids of the tags of the post. */
  appliedTags?: Snowflake[];
  /** After how many minutes without activity the post is archived. */
  autoArchiveDuration?: 60 | 1440 | 4320 | 10080;
  /** Slowmode of the post, in seconds. */
  slowmode?: number;
}

/** A forum or media channel: it only contains posts, which are threads. */
export class ForumChannel extends GuildChannel {
  /** The guidelines of the forum. */
  get topic(): string | null {
    return dataOf(this).topic ?? null;
  }

  /** The tags posts of this forum can have. */
  get availableTags(): ForumTag[] {
    return toCamelCase(dataOf(this).available_tags ?? []);
  }

  /**
   * Creates a post in the forum.
   * @see https://docs.discord.com/developers/resources/channel#start-thread-in-forum-or-media-channel
   */
  async createPost(
    options: ForumPostOptions,
    reason?: string
  ): Promise<ThreadChannel> {
    const { rest, entities } = ctxOf(this);
    const { body, files } = buildMessage(options.message);
    const raw = await rest.request(
      StartThreadInForumOrMediaChannel,
      [this.id],
      {
        body: {
          name: options.name,
          message: body,
          applied_tags: options.appliedTags,
          auto_archive_duration: options.autoArchiveDuration,
          rate_limit_per_user: options.slowmode,
        },
        files,
        reason,
      }
    );
    return entities.channel(raw) as ThreadChannel;
  }
}

// ---------------------------------------------------------------------------
// Threads and private conversations
// ---------------------------------------------------------------------------

export type ThreadEditOptions = Camelize<ModifyThreadJSONParams>;
export type ThreadMember = Camelize<Omit<RawThreadMember, 'member'>>;

/**
 * A thread, or a post of a forum.
 * @see https://docs.discord.com/developers/topics/threads
 */
export class ThreadChannel extends Channel {
  /** The id of the server of the thread. */
  override get guildId(): Snowflake {
    return dataOf(this).guild_id!;
  }

  /** The server of the thread. */
  override get guild(): Guild {
    return guildOf(this, this.guildId);
  }

  /** The name of the thread. */
  get name(): string {
    return dataOf(this).name ?? '';
  }

  /** The id of the channel the thread was created in. */
  get parentId(): Snowflake {
    return dataOf(this).parent_id!;
  }

  /**
   * The channel the thread was created in; `null` when it is of a kind
   * this version does not know.
   */
  get parent(): TextChannel | ForumChannel | null {
    const parent = ctxOf(this).cache.channels.get(this.parentId);
    return parent?.isText() || parent?.isForum() ? parent : null;
  }

  /** The id of the user who created the thread. */
  get ownerId(): Snowflake | null {
    return dataOf(this).owner_id ?? null;
  }

  /** Whether the thread is archived. */
  get archived(): boolean {
    return dataOf(this).thread_metadata?.archived ?? false;
  }

  /** Whether only moderators can unarchive it. */
  get locked(): boolean {
    return dataOf(this).thread_metadata?.locked ?? false;
  }

  /** Whether only invited members and moderators can see it. */
  get isPrivate(): boolean {
    return this.type === ChannelType.PrivateThread;
  }

  /** When the thread was archived or unarchived for the last time. */
  get archivedAt(): Date | null {
    return toDate(dataOf(this).thread_metadata?.archive_timestamp);
  }

  /** An approximate count of the members of the thread (stops at 50). */
  get memberCount(): number {
    return dataOf(this).member_count ?? 0;
  }

  /** The ids of the tags of the post, in a forum. */
  get appliedTags(): readonly Snowflake[] {
    return dataOf(this).applied_tags ?? [];
  }

  /** Threads inherit the permissions of the channel they are in. */
  permissionsFor(member: GuildMember): Permissions {
    const parent = this.parent;
    if (!parent) {
      throw new Error(
        'The permissions in this thread are unknown: its channel is not in the cache.'
      );
    }
    return parent.permissionsFor(member);
  }

  /**
   * Changes the thread: name, archive, lock, slowmode, tags.
   * @see https://docs.discord.com/developers/resources/channel#modify-channel
   */
  async edit(options: ThreadEditOptions, reason?: string): Promise<this> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(ModifyChannel, [this.id], {
      body: toSnakeCase<ModifyThreadJSONParams>(options),
      reason,
    });
    return entities.channel(raw) as this;
  }

  /** Archives the thread: it leaves the channel list but can come back. */
  async archive(reason?: string): Promise<this> {
    return this.edit({ archived: true }, reason);
  }

  /** Brings an archived thread back. */
  async unarchive(reason?: string): Promise<this> {
    return this.edit({ archived: false }, reason);
  }

  /** Makes the bot join the thread. */
  async join(): Promise<void> {
    await ctxOf(this).rest.request(JoinThread, [this.id]);
  }

  /** Makes the bot leave the thread. */
  async leave(): Promise<void> {
    await ctxOf(this).rest.request(LeaveThread, [this.id]);
  }

  /**
   * Adds a member to the thread.
   * @see https://docs.discord.com/developers/resources/channel#add-thread-member
   */
  async addMember(user: Snowflake | { id: Snowflake }): Promise<void> {
    await ctxOf(this).rest.request(AddThreadMember, [this.id, idOf(user)]);
  }

  /**
   * Removes a member from the thread.
   * @see https://docs.discord.com/developers/resources/channel#remove-thread-member
   */
  async removeMember(user: Snowflake | { id: Snowflake }): Promise<void> {
    await ctxOf(this).rest.request(RemoveThreadMember, [this.id, idOf(user)]);
  }

  /**
   * Who is in the thread (100 at most per call).
   * @see https://docs.discord.com/developers/resources/channel#list-thread-members
   */
  async fetchMembers(
    options: { limit?: number; after?: Snowflake } = {}
  ): Promise<ThreadMember[]> {
    const raw = await ctxOf(this).rest.request(ListThreadMembers, [this.id], {
      query: options,
    });
    return raw.map(({ member: _member, ...member }) => toCamelCase(member));
  }
}
export interface ThreadChannel extends TextBasedMethods {}
mixin(ThreadChannel, textBasedMethods);

/** A private conversation between the bot and a user. */
export class DMChannel extends Channel {
  /** The id of the user the bot talks to. */
  get recipientId(): Snowflake | null {
    return dataOf(this).recipients?.[0]?.id ?? null;
  }

  /** The user the bot talks to, when it is known. */
  get recipient(): User | null {
    const id = this.recipientId;
    return id ? (ctxOf(this).cache.users.get(id) ?? null) : null;
  }
}
export interface DMChannel extends TextBasedMethods {}
mixin(DMChannel, textBasedMethods);

/** Any channel of a server messages can be sent in. */
export type GuildTextBasedChannel = TextChannel | VoiceChannel | ThreadChannel;

/** Any channel messages can be sent in. */
export type TextBasedChannel = GuildTextBasedChannel | DMChannel;

/** The class that represents a channel of a given type. */
export function channelClass(data: RawChannel): typeof Channel {
  switch (data.type) {
    case ChannelType.GuildText:
    case ChannelType.GuildAnnouncement:
      return TextChannel;
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      return VoiceChannel;
    case ChannelType.GuildCategory:
      return CategoryChannel;
    case ChannelType.GuildForum:
    case ChannelType.GuildMedia:
      return ForumChannel;
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      return ThreadChannel;
    case ChannelType.Dm:
    case ChannelType.GroupDm:
      return DMChannel;
    default:
      // A type Discord added after this version: still usable as a channel.
      return data.guild_id ? GuildChannel : Channel;
  }
}
