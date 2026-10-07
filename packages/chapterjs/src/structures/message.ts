import {
  CreateMessage,
  CreateReaction,
  CrosspostMessage,
  DeleteAllReactions,
  DeleteAllReactionsForEmoji,
  DeleteMessage,
  DeleteOwnReaction,
  DeleteUserReaction,
  EditMessage,
  GetChannelMessage,
  GetReactions,
  PinMessage,
  StartThreadFromMessage,
  UnpinMessage,
} from '../discord/endpoints.js';
import { reactionEmoji } from '../discord/formatting.js';
import type { StartThreadFromMessageJSONParams } from '../discord/types/channel.js';
import type { Snowflake } from '../discord/types/common.js';
import {
  MessageFlags,
  MessageType,
  type RawAttachment,
  type RawMessage,
  type RawReaction,
} from '../discord/types/message.js';
import { toCamelCase, toSnakeCase, type Camelize } from '../util/case.js';
import { ctxOf, dataOf, idOf, IdStructure, toDate } from './base.js';
import type {
  DMChannel,
  GuildTextBasedChannel,
  TextBasedChannel,
  ThreadChannel,
} from './channel.js';
import type { Context } from './context.js';
import { findGuild, knownChannel, knownMember } from './known.js';
import type { Guild } from './guild.js';
import type { GuildMember } from './member.js';
import {
  buildMessage,
  type Embed,
  type MessageEditOptions,
  type MessageInput,
} from './payload.js';
import { translatorOf } from '../messages/translate.js';
import type { User } from './user.js';

/** What the message stores: users are kept as structures, not copies. */
export type MessageData = Omit<RawMessage, 'author' | 'mentions'> & {
  guild_id?: Snowflake;
};

/** The name of a flag of a message: a key of `MessageFlags`. */
export type MessageFlagName = keyof typeof MessageFlags;
/** A file attached to a message. */
export type Attachment = Camelize<RawAttachment>;
/** The reactions of one emoji on a message. */
export type Reaction = Camelize<RawReaction>;

/** An emoji to react with: a standard one (`"👍"`), or a custom one. */
export type EmojiInput =
  string | { id?: Snowflake | null; name?: string | null };

function emojiPath(emoji: EmojiInput): string {
  if (typeof emoji !== 'string') return reactionEmoji(emoji);
  // Accepts what users copy from Discord: `<:name:id>` and `<a:name:id>`.
  const custom = /^<a?:(\w+):(\d+)>$/.exec(emoji.trim());
  if (custom) return `${custom[1]}:${custom[2]}`;
  if (emoji.trim() === '') {
    throw new TypeError('The emoji is empty: pass one like "👍".');
  }
  return emoji.trim();
}

/**
 * A message sent in a channel.
 * @see https://docs.discord.com/developers/resources/message#message-object
 */
export class Message extends IdStructure<MessageData> {
  /** Who wrote the message. */
  readonly author: User;
  /** The users mentioned in the message. */
  readonly mentions: readonly User[];

  constructor(
    ctx: Context,
    data: MessageData,
    author: User,
    mentions: readonly User[]
  ) {
    super(ctx, data);
    this.author = author;
    this.mentions = mentions;
  }

  /** The id of the channel of the message. */
  get channelId(): Snowflake {
    return dataOf(this).channel_id;
  }

  /** The id of the server; `null` for a private message. */
  get guildId(): Snowflake | null {
    return (
      dataOf(this).guild_id ??
      ctxOf(this).cache.channels.get(this.channelId)?.guildId ??
      null
    );
  }

  /** The channel of the message, when it is known. */
  get channel(): TextBasedChannel | null {
    const channel =
      ctxOf(this).cache.channels.get(this.channelId) ?? knownChannel(this);
    return channel?.isTextBased() ? channel : null;
  }

  /** The server of the message; `null` for a private message. */
  get guild(): Guild | null {
    return findGuild(this, this.guildId);
  }

  /** The author as a member of the server, when it is known. */
  get member(): GuildMember | null {
    return this.guild?.members.get(this.author.id) ?? knownMember(this) ?? null;
  }

  /**
   * The text of the message. Empty when the bot is not allowed to read it:
   * reading the messages of others needs the Message Content intent.
   */
  get content(): string {
    return dataOf(this).content ?? '';
  }

  /** The kind of message, as a value of `MessageType` (a regular one, a reply, a join notice...). */
  get type(): MessageType {
    return dataOf(this).type;
  }

  /** When the message was last edited; `null` when it never was. */
  get editedAt(): Date | null {
    return toDate(dataOf(this).edited_timestamp);
  }

  /** Whether the message is pinned. */
  get pinned(): boolean {
    return dataOf(this).pinned ?? false;
  }

  /** Whether the message was read aloud. */
  get tts(): boolean {
    return dataOf(this).tts ?? false;
  }

  /** The embeds of the message. */
  get embeds(): Embed[] {
    return toCamelCase(dataOf(this).embeds ?? []);
  }

  /** The files attached to the message. */
  get attachments(): Attachment[] {
    return toCamelCase(dataOf(this).attachments ?? []);
  }

  /** The reactions on the message, one entry per emoji. */
  get reactions(): Reaction[] {
    return toCamelCase(dataOf(this).reactions ?? []);
  }

  /** Whether the message mentions @everyone or @here. */
  get mentionsEveryone(): boolean {
    return dataOf(this).mention_everyone ?? false;
  }

  /** The ids of the roles mentioned in the message. */
  get mentionedRoleIds(): readonly Snowflake[] {
    return dataOf(this).mention_roles ?? [];
  }

  /** The flags of the message, by name (`Ephemeral`, `SuppressEmbeds`...). */
  get flags(): MessageFlagName[] {
    const bits = dataOf(this).flags ?? 0;
    return (Object.keys(MessageFlags) as MessageFlagName[]).filter(
      name => (bits & MessageFlags[name]) !== 0
    );
  }

  /** The id of the webhook that sent the message, when one did. */
  get webhookId(): Snowflake | null {
    return dataOf(this).webhook_id ?? null;
  }

  /** The id of the message this one replies to, when it is a reply. */
  get repliedMessageId(): Snowflake | null {
    return dataOf(this).message_reference?.message_id ?? null;
  }

  /** Whether a person wrote it: not a bot, a webhook or Discord itself. */
  get isFromUser(): boolean {
    return (
      !this.author.bot &&
      !this.author.system &&
      this.webhookId === null &&
      (this.type === MessageType.Default || this.type === MessageType.Reply)
    );
  }

  /** The link that opens the message in Discord. */
  get url(): string {
    return `https://discord.com/channels/${this.guildId ?? '@me'}/${this.channelId}/${this.id}`;
  }

  /** Asks Discord for the latest version of the message. */
  async fetch(): Promise<Message> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(GetChannelMessage, [
      this.channelId,
      this.id,
    ]);
    return entities.message(raw, this.guildId ?? undefined);
  }

  /**
   * Answers the message, in the same channel.
   * @see https://docs.discord.com/developers/resources/message#create-message
   */
  async reply(message: MessageInput): Promise<Message> {
    const options =
      typeof message === 'string' ? { content: message } : message;
    return sendMessage(
      ctxOf(this),
      this.channelId,
      { ...options, replyTo: this.id },
      this.guildId ?? undefined
    );
  }

  /**
   * Changes the message. Only the content, embeds, components and files of
   * a message the bot wrote can change.
   * @see https://docs.discord.com/developers/resources/message#edit-message
   */
  async edit(message: string | MessageEditOptions): Promise<Message> {
    const { rest, entities } = ctxOf(this);
    const { body, files } = buildMessage(message, {
      edit: true,
      t: translatorOf(ctxOf(this), { guild: this.guild }),
    });
    const raw = await rest.request(EditMessage, [this.channelId, this.id], {
      body,
      files,
    });
    return entities.message(raw, this.guildId ?? undefined);
  }

  /**
   * Deletes the message.
   * @see https://docs.discord.com/developers/resources/message#delete-message
   */
  async delete(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(DeleteMessage, [this.channelId, this.id], {
      reason,
    });
  }

  /**
   * Adds a reaction of the bot to the message.
   * @see https://docs.discord.com/developers/resources/message#create-reaction
   */
  async react(emoji: EmojiInput): Promise<void> {
    await ctxOf(this).rest.request(CreateReaction, [
      this.channelId,
      this.id,
      emojiPath(emoji),
    ]);
  }

  /**
   * Removes a reaction: of the bot, or of the given user.
   * @see https://docs.discord.com/developers/resources/message#delete-user-reaction
   */
  async removeReaction(
    emoji: EmojiInput,
    user?: Snowflake | { id: Snowflake }
  ): Promise<void> {
    const { rest } = ctxOf(this);
    const path = [this.channelId, this.id, emojiPath(emoji)] as const;
    if (user === undefined) await rest.request(DeleteOwnReaction, [...path]);
    else await rest.request(DeleteUserReaction, [...path, idOf(user)]);
  }

  /**
   * Removes every reaction of the message, or every reaction of one emoji.
   * @see https://docs.discord.com/developers/resources/message#delete-all-reactions
   */
  async clearReactions(emoji?: EmojiInput): Promise<void> {
    const { rest } = ctxOf(this);
    if (emoji === undefined) {
      await rest.request(DeleteAllReactions, [this.channelId, this.id]);
    } else {
      await rest.request(DeleteAllReactionsForEmoji, [
        this.channelId,
        this.id,
        emojiPath(emoji),
      ]);
    }
  }

  /**
   * The users who reacted with an emoji (100 at most per call).
   * @see https://docs.discord.com/developers/resources/message#get-reactions
   */
  async fetchReactionUsers(
    emoji: EmojiInput,
    options: { limit?: number; after?: Snowflake } = {}
  ): Promise<User[]> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(
      GetReactions,
      [this.channelId, this.id, emojiPath(emoji)],
      { query: options }
    );
    return raw.map(user => entities.user(user));
  }

  /**
   * Pins the message in its channel.
   * @see https://docs.discord.com/developers/resources/message#pin-message
   */
  async pin(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(PinMessage, [this.channelId, this.id], {
      reason,
    });
  }

  /**
   * Unpins the message.
   * @see https://docs.discord.com/developers/resources/message#unpin-message
   */
  async unpin(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(UnpinMessage, [this.channelId, this.id], {
      reason,
    });
  }

  /**
   * Publishes a message of an announcement channel to the servers that
   * follow it.
   * @see https://docs.discord.com/developers/resources/message#crosspost-message
   */
  async crosspost(): Promise<Message> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(CrosspostMessage, [this.channelId, this.id]);
    return entities.message(raw, this.guildId ?? undefined);
  }

  /**
   * Starts a thread from the message.
   * @see https://docs.discord.com/developers/resources/channel#start-thread-from-message
   */
  async startThread(
    options: Camelize<StartThreadFromMessageJSONParams>,
    reason?: string
  ): Promise<ThreadChannel> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(
      StartThreadFromMessage,
      [this.channelId, this.id],
      { body: toSnakeCase<StartThreadFromMessageJSONParams>(options), reason }
    );
    return entities.channel(raw) as ThreadChannel;
  }
}

/** One mechanism to send a message, used by channels, replies and users. */
export async function sendMessage(
  ctx: Context,
  channelId: Snowflake,
  message: MessageInput,
  guildId?: Snowflake
): Promise<Message> {
  const { body, files } = buildMessage(message, {
    // What the server reads, or the default language in private messages.
    t: translatorOf(ctx, {
      guild: guildId ? ctx.cache.guilds.get(guildId) : null,
    }),
  });
  const raw = await ctx.rest.request(CreateMessage, [channelId], {
    body,
    files,
  });
  return ctx.entities.message(raw, guildId);
}

/**
 * A message of a server: its server is known. It is what the events about
 * messages give for what happens in a server.
 */
export interface GuildMessage extends Message {
  /** The id of the server. */
  readonly guildId: Snowflake;
  /** The server of the message. */
  readonly guild: Guild;
  /** The channel of the message. */
  readonly channel: GuildTextBasedChannel;
}

/**
 * A message written in a server by one of its members: neither a private
 * message nor the message of a webhook. It is what the events about
 * messages give by default.
 */
export interface MemberMessage extends GuildMessage {
  /** The author as a member of the server. */
  readonly member: GuildMember;
}

/**
 * A private message, for a file that receives both kinds
 * (`{ where: 'both' }`): there is no server, which is how it is told apart
 * from a `GuildMessage`.
 */
export interface PrivateMessage extends Message {
  /** No server: it is a private message. */
  readonly guildId: null;
  /** No server: it is a private message. */
  readonly guild: null;
  /** No member: the author is `author`. */
  readonly member: null;
  /** The private conversation, when the bot knows it. */
  readonly channel: DMChannel | null;
}

/**
 * A private message, for a file that only receives those
 * (`{ where: 'dm' }`): nothing about a server exists on it.
 */
export interface DmMessage extends Omit<
  Message,
  'guildId' | 'guild' | 'member' | 'channel'
> {
  /** The private conversation, when the bot knows it. */
  readonly channel: DMChannel | null;
}
