// Every event user code can listen to. An event is one entry here: its
// name, the gateway events it comes from, the intents that make Discord
// send them, and how to build what the handler receives. Adding an event is
// adding an entry; the router and the loader never change.

import type { CacheLimits } from '../cache/cache.js';
import { InviteType, type RawInvite } from '../discord/types/invite.js';
import type { RawAuditLogEntry } from '../discord/types/audit-log.js';
import type { RawPartialEmoji } from '../discord/types/emoji.js';
import { dataOf } from '../structures/base.js';
import { storesOf, type VoiceEntry } from '../structures/guild.js';
import { toCamelCase } from '../util/case.js';
import { GetChannel, GetUser } from '../discord/endpoints.js';
import { GatewayIntent } from '../discord/intents.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawGuildMember } from '../discord/types/guild.js';
import type { RawUser } from '../discord/types/user.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
} from '../discord/types/gateway-events.js';
import type {
  Channel,
  DMChannel,
  GuildChannel,
  GuildTextBasedChannel,
  TextBasedChannel,
  ThreadChannel,
  VoiceChannel,
} from '../structures/channel.js';
import type { Context } from '../structures/context.js';
import type { GuildEmoji } from '../structures/emoji.js';
import type {
  AuditLogEntry,
  Guild,
  ScheduledEvent,
  VoiceState,
} from '../structures/guild.js';
import type { Invite } from '../structures/invite.js';
import type { GuildMember } from '../structures/member.js';
import type {
  DmMessage,
  GuildMessage,
  MemberMessage,
  Message,
  PrivateMessage,
  ReactionEmoji,
} from '../structures/message.js';
import type { Role } from '../structures/role.js';
import type { User, UserPresence } from '../structures/user.js';
import type { TranslationContext } from '../messages/messages.js';

/**
 * A message that was deleted: what is known of it. The message itself is
 * only there when the bot remembered it.
 */
export interface DeletedMessage {
  /** The id of the deleted message. */
  id: Snowflake;
  /** The id of the channel the message was in. */
  channelId: Snowflake;
  /** The channel, when the bot knows it. */
  channel: TextBasedChannel | null;
  /** The id of the server; `null` for a private message. */
  guildId: Snowflake | null;
  /** The message as it was, when the bot remembered it. */
  before: Message | null;
}

/** A reaction added to a message, or removed from it. */
export interface UserReaction {
  /** The emoji of the reaction. */
  emoji: ReactionEmoji;
  /** Who reacted. */
  user: User;
  /** Who reacted, as a member of the server: `null` in a private message, or when the bot does not remember them. */
  member: GuildMember | null;
  /** Whether it is a super reaction. */
  burst: boolean;
  /** The id of the message. */
  messageId: Snowflake;
  /** The message, when the bot remembers it. */
  message: Message | null;
  /** The id of the channel of the message. */
  channelId: Snowflake;
  /** The channel of the message, when the bot knows it. */
  channel: TextBasedChannel | null;
  /** The id of the server; `null` in a private message. */
  guildId: Snowflake | null;
}

/** A reaction added to a message: what Discord tells of its message too. */
export interface AddedReaction extends UserReaction {
  /** The id of who wrote the message, when Discord says it. */
  messageAuthorId: Snowflake | null;
}

/** Reactions removed from a message at once: all of them, or every reaction of one emoji. */
export interface ClearedReactions {
  /** The emoji whose reactions were removed; `null` when all were. */
  emoji: ReactionEmoji | null;
  /** The id of the message. */
  messageId: Snowflake;
  /** The message, when the bot remembers it. */
  message: Message | null;
  /** The id of the channel of the message. */
  channelId: Snowflake;
  /** The channel of the message, when the bot knows it. */
  channel: TextBasedChannel | null;
  /** The id of the server; `null` in a private message. */
  guildId: Snowflake | null;
}

/** A vote in a poll, given or taken back. */
export interface PollVote {
  /** The id Discord gave to the answer: today, its position in the poll, `1` for the first answer. */
  answerId: number;
  /** Who voted. */
  user: User;
  /** Who voted, as a member of the server, when the bot remembers it. */
  member: GuildMember | null;
  /** The id of the message of the poll. */
  messageId: Snowflake;
  /** The message of the poll, when the bot remembers it. */
  message: Message | null;
  /** The id of the channel of the poll. */
  channelId: Snowflake;
  /** The channel of the poll, when the bot knows it. */
  channel: TextBasedChannel | null;
  /** The id of the server; `null` in a private message. */
  guildId: Snowflake | null;
}

/** Someone typing in a channel. */
export interface Typing {
  /** Who is typing. */
  user: User;
  /** Who is typing, as a member of the server; `null` in a private message. */
  member: GuildMember | null;
  /** When they started. */
  startedAt: Date;
  /** The id of the channel. */
  channelId: Snowflake;
  /** The channel, when the bot knows it. */
  channel: TextBasedChannel | null;
  /** The id of the server; `null` in a private message. */
  guildId: Snowflake | null;
}

/** An invite that was deleted, or expired: what is left of it. */
export interface DeletedInvite {
  /** The code of the invite (`discord.gg/code`). */
  code: string;
  /** The channel the invite led to. */
  channel: GuildChannel;
}

/** Someone in a voice channel: who, where, and their voice state. */
export interface VoiceActivity {
  /** Who it is. */
  member: GuildMember;
  /** The voice channel. */
  channel: VoiceChannel;
  /** Their voice state: muted, deafened, streaming... */
  state: VoiceState;
}

/** Someone who went from one voice channel to another. */
export interface VoiceMove {
  /** Who moved. */
  member: GuildMember;
  /** The channel they left. */
  from: VoiceChannel;
  /** The channel they are in now. */
  to: VoiceChannel;
  /** Their voice state, as it is now. */
  state: VoiceState;
}

/** Someone in a voice channel whose voice state changed. */
export interface VoiceChange extends VoiceActivity {
  /** Their voice state as it was. */
  before: VoiceState;
}

/** Someone's status or activity, as it is now, and whose it is. */
export interface PresenceChange extends UserPresence {
  /** The id of whose presence changed. */
  userId: Snowflake;
  /** The account of whose presence changed, when the bot knows it. */
  user: User | null;
  /** Whose presence changed, as a member of the server, when the bot remembers it. */
  member: GuildMember | null;
}

/** Someone interested in a scheduled event, or no longer. */
export interface ScheduledEventInterest {
  /** The id of the scheduled event. */
  scheduledEventId: Snowflake;
  /** Who it is. */
  user: User;
  /** Who it is, as a member of the server, when the bot remembers it. */
  member: GuildMember | null;
}

/**
 * What your function receives, for each event: what the event is about,
 * the server it happened in, and `t`. The widest form: the options of a
 * file narrow it (`ContextOf`).
 */
export interface EventContexts {
  /** The bot is connected and knows every server it is in. */
  ready: {
    /** The bot itself. */
    user: User;
    /** The servers the bot is in. */
    guilds: ReadonlyMap<Snowflake, Guild>;
  };
  /** A message was sent, in a server or in private. */
  messageCreate: {
    /** The message that was sent. */
    message: Message;
    /** The server; `null` for a private message. */
    guild: Guild | null;
  };
  /** A message was edited. */
  messageUpdate: {
    /** The message, as it is now. */
    message: Message;
    /** The server; `null` for a private message. */
    guild: Guild | null;
  };
  /** A message was deleted. */
  messageDelete: {
    /** The message that was deleted. */
    message: DeletedMessage;
    /** The server; `null` for a private message. */
    guild: Guild | null;
  };
  /** Someone joined a server. */
  memberJoin: {
    /** The new member. */
    member: GuildMember;
    /** The server they joined. */
    guild: Guild;
  };
  /** Someone left a server, or was kicked or banned. */
  memberLeave: {
    /** The account of who left. */
    user: User;
    /** The server they left. */
    guild: Guild;
  };
  /** A member changed: nickname, roles, timeout, avatar... */
  memberUpdate: {
    /** The member, as they are now. */
    member: GuildMember;
    /** The server of the member. */
    guild: Guild;
  };
  /** The bot was added to a server. */
  guildJoin: {
    /** The server the bot was added to. */
    guild: Guild;
  };
  /** The bot was removed from a server. */
  guildLeave: {
    /** The server as it was, when the bot was in it. */
    guild: Guild;
  };
  /** A channel was created. */
  channelCreate: {
    /** The new channel or thread. */
    channel: GuildChannel | ThreadChannel | Channel;
    /** The server of the channel; `null` for a private conversation. */
    guild: Guild | null;
  };
  /** A channel changed: name, topic, permissions... */
  channelUpdate: {
    /** The channel or thread, as it is now. */
    channel: GuildChannel | ThreadChannel | Channel;
    /** The server of the channel; `null` for a private conversation. */
    guild: Guild | null;
  };
  /** A channel was deleted. */
  channelDelete: {
    /** The channel or thread as it was. */
    channel: GuildChannel | ThreadChannel | Channel;
    /** The server of the channel; `null` for a private conversation. */
    guild: Guild | null;
  };
  /** A role was created. */
  roleCreate: {
    /** The new role. */
    role: Role;
    /** The server of the role. */
    guild: Guild;
  };
  /** A role changed: name, color, permissions, position... */
  roleUpdate: {
    /** The role, as it is now. */
    role: Role;
    /** The server of the role. */
    guild: Guild;
  };
  /** A role was deleted. */
  roleDelete: {
    /** The role as it was. */
    role: Role;
    /** The server the role was in. */
    guild: Guild;
  };
  /** The server changed: name, icon, settings... */
  guildUpdate: {
    /** The server, as it is now. */
    guild: Guild;
  };
  /** Someone was banned from a server. */
  banAdd: {
    /** The account that was banned. */
    user: User;
    /** The server they were banned from. */
    guild: Guild;
  };
  /** A ban was lifted: the person can join the server again. */
  banRemove: {
    /** The account that is no longer banned. */
    user: User;
    /** The server of the ban. */
    guild: Guild;
  };
  /** An emoji was added to a server. */
  emojiCreate: {
    /** The new emoji. */
    emoji: GuildEmoji;
    /** The server of the emoji. */
    guild: Guild;
  };
  /** An emoji of a server changed: its name, or who can use it. */
  emojiUpdate: {
    /** The emoji, as it is now. */
    emoji: GuildEmoji;
    /** The server of the emoji. */
    guild: Guild;
  };
  /** An emoji was removed from a server. */
  emojiDelete: {
    /** The emoji as it was. */
    emoji: GuildEmoji;
    /** The server the emoji was in. */
    guild: Guild;
  };
  /** An invite to a server was created. */
  inviteCreate: {
    /** The new invite. */
    invite: Invite;
    /** The server the invite leads to. */
    guild: Guild;
  };
  /** An invite was deleted, or expired. */
  inviteDelete: {
    /** The invite that was deleted. */
    invite: DeletedInvite;
    /** The server the invite led to. */
    guild: Guild;
  };
  /** Something was added to the audit log of a server. */
  auditLogEntryCreate: {
    /** What was done, by whom, on what. */
    entry: AuditLogEntry;
    /** The server of the audit log. */
    guild: Guild;
  };
  /** Someone added a reaction to a message. */
  reactionAdd: {
    /** The reaction that was added. */
    reaction: AddedReaction;
    /** The server; `null` in a private message. */
    guild: Guild | null;
  };
  /** Someone removed their reaction from a message. */
  reactionRemove: {
    /** The reaction that was removed. */
    reaction: UserReaction;
    /** The server; `null` in a private message. */
    guild: Guild | null;
  };
  /** The reactions of a message were removed: all of them, or every reaction of one emoji. */
  reactionClear: {
    /** The reactions that were removed. */
    reactions: ClearedReactions;
    /** The server; `null` in a private message. */
    guild: Guild | null;
  };
  /** Someone voted in a poll. */
  pollVoteAdd: {
    /** The vote. */
    vote: PollVote;
    /** The server; `null` in a private message. */
    guild: Guild | null;
  };
  /** Someone took back their vote in a poll. */
  pollVoteRemove: {
    /** The vote taken back. */
    vote: PollVote;
    /** The server; `null` in a private message. */
    guild: Guild | null;
  };
  /** Someone started typing in a channel. */
  typingStart: {
    /** Who is typing, and where. */
    typing: Typing;
    /** The server; `null` in a private message. */
    guild: Guild | null;
  };
  /** Someone was added to a thread, or joined it. */
  threadMemberJoin: {
    /** The thread. */
    thread: ThreadChannel;
    /** Who was added, as a member of the server. */
    member: GuildMember;
    /** The server of the thread. */
    guild: Guild;
  };
  /** Someone was removed from a thread, or left it. */
  threadMemberLeave: {
    /** The thread. */
    thread: ThreadChannel;
    /** The id of who was removed. */
    userId: Snowflake;
    /** Who was removed, as a member of the server, when the bot remembers it. */
    member: GuildMember | null;
    /** The server of the thread. */
    guild: Guild;
  };
  /** Someone joined a voice channel. */
  voiceJoin: {
    /** Who joined, the channel, and their voice state. */
    voice: VoiceActivity;
    /** The server of the channel. */
    guild: Guild;
  };
  /** Someone left a voice channel, or was disconnected. */
  voiceLeave: {
    /** Who left, the channel they left, and their voice state as it was. */
    voice: VoiceActivity;
    /** The server of the channel. */
    guild: Guild;
  };
  /** Someone went from one voice channel to another, or was moved. */
  voiceMove: {
    /** Who moved, from where, to where. */
    voice: VoiceMove;
    /** The server of the channels. */
    guild: Guild;
  };
  /** Someone in a voice channel changed: muted, deafened, started a stream or a camera... */
  voiceUpdate: {
    /** Who changed, their voice state now and before. */
    voice: VoiceChange;
    /** The server of the channel. */
    guild: Guild;
  };
  /** Someone's status or activity changed: online, idle, playing a game... */
  presenceUpdate: {
    /** The presence as it is now, and whose it is. */
    presence: PresenceChange;
    /** The server the change is seen from. */
    guild: Guild;
  };
  /** An event was scheduled in a server. */
  scheduledEventCreate: {
    /** The new scheduled event. */
    scheduledEvent: ScheduledEvent;
    /** The server of the scheduled event. */
    guild: Guild;
  };
  /** A scheduled event changed: its time, its place, or it started or ended. */
  scheduledEventUpdate: {
    /** The scheduled event, as it is now. */
    scheduledEvent: ScheduledEvent;
    /** The server of the scheduled event. */
    guild: Guild;
  };
  /** A scheduled event was deleted. */
  scheduledEventDelete: {
    /** The scheduled event as it was. */
    scheduledEvent: ScheduledEvent;
    /** The server the scheduled event was in. */
    guild: Guild;
  };
  /** Someone said they are interested in a scheduled event. */
  scheduledEventUserAdd: {
    /** Who is interested, in which scheduled event. */
    interest: ScheduledEventInterest;
    /** The server of the scheduled event. */
    guild: Guild;
  };
  /** Someone is no longer interested in a scheduled event. */
  scheduledEventUserRemove: {
    /** Who is no longer interested, in which scheduled event. */
    interest: ScheduledEventInterest;
    /** The server of the scheduled event. */
    guild: Guild;
  };
}

/** The name of an event: the name of a folder of `src/events/`. */
export type EventName = keyof EventContexts;

/**
 * Where something happens: in servers (`'guild'`), in private messages with
 * the bot (`'dm'`), or in both.
 */
export type EventWhere = 'guild' | 'dm' | 'both';

/** The option of the events that also happen in private messages. */
export interface WhereEventOptions {
  /**
   * Where the file listens: `'guild'` (in servers, the default), `'dm'` (in
   * private messages with the bot) or `'both'`. What the function receives
   * follows it: a server that is always there, never there, or to check.
   */
  where?: EventWhere;
}

/** Options of the events about messages. */
export interface MessageEventOptions extends WhereEventOptions {
  /**
   * Also run for messages written by bots (this one included) and by
   * webhooks. By default they are ignored: a bot that answers bots can end
   * up answering itself, or another bot, forever.
   */
  bots?: boolean;
}

/**
 * The options a file can give to `event()` as its second argument, for the
 * events that have some.
 */
/** Options of the events about reactions added or removed. */
export interface ReactionEventOptions extends WhereEventOptions {
  /**
   * Also run for the reactions of bots, this one included. By default they
   * are ignored: a bot that reacts to reactions can end up answering its
   * own, forever.
   */
  bots?: boolean;
}

export interface EventOptions {
  messageCreate: MessageEventOptions;
  messageUpdate: MessageEventOptions;
  messageDelete: WhereEventOptions;
  reactionAdd: ReactionEventOptions;
  reactionRemove: ReactionEventOptions;
  reactionClear: WhereEventOptions;
  pollVoteAdd: WhereEventOptions;
  pollVoteRemove: WhereEventOptions;
  typingStart: WhereEventOptions;
}

/**
 * Whether a file turned an option on, from the type of what it passed. An
 * option that is only known to be a boolean counts: it may be on.
 */
type IsOn<Options, Key extends string> = Key extends keyof Options
  ? Exclude<Options[Key], undefined> extends false
    ? false
    : true
  : false;

/**
 * Where a file listens, from the type of what it passed: in servers when
 * it says nothing, every place it may be when it is only known to be one.
 */
type WhereOf<Options> = 'where' extends keyof Options
  ? [Exclude<Options['where'], undefined>] extends [never]
    ? 'guild'
    : Exclude<Options['where'], undefined>
  : 'guild';

/**
 * Something about a message, told apart by where it happened: in a server
 * the server is there and the channel is one of the server; in private,
 * the conversation, when the bot knows it.
 */
interface InServer {
  /** The id of the server. */
  guildId: Snowflake;
  /** The channel. */
  channel: GuildTextBasedChannel;
}

/** In private, for a file that receives both kinds. */
interface InPrivate {
  /** No server: it happened in private. */
  guildId: null;
  /** The private conversation, when the bot knows it. */
  channel: DMChannel | null;
}

/** In private, for a file that only receives that. */
interface InDm {
  /** The private conversation, when the bot knows it. */
  channel: DMChannel | null;
}

/** The fields of an object that its place narrows. */
type PlaceKeys = 'guildId' | 'channel' | 'message' | 'member' | 'before';

/** `T` without what its place narrows: the rest is the same everywhere. */
type Unplaced<T> = Omit<T, PlaceKeys>;

/**
 * What a file receives for an event of servers and private messages,
 * following where it listens: the object of the event under `Key`, and
 * the server when there is one. With `'both'`, a union told apart by
 * `guild`.
 */
type Placed<
  Where,
  Key extends string,
  InGuild,
  Private,
  Dm,
> = Where extends 'guild'
  ? { [K in Key]: InGuild } & { guild: Guild }
  : Where extends 'dm'
    ? { [K in Key]: Dm }
    : | ({ [K in Key]: InGuild } & { guild: Guild })
      | ({ [K in Key]: Private } & { guild: null });

/** A message the bot remembers, in each place. */
interface ServerMessagePart {
  /** The message, when the bot remembers it. */
  message: GuildMessage | null;
}
interface PrivateMessagePart {
  /** The message, when the bot remembers it. */
  message: PrivateMessage | null;
}
interface DmMessagePart {
  /** The message, when the bot remembers it. */
  message: DmMessage | null;
}

/** No member in private: who did it is `user`. */
interface NoMember {
  /** No member: it happened in private. */
  member: null;
}

/** The member who did it, sent with the event. */
interface SentMember {
  /** Who did it, as a member of the server. */
  member: GuildMember;
}

/** The member who did it, when the bot remembers it. */
interface KnownMember {
  /** Who did it, as a member of the server, when the bot remembers it. */
  member: GuildMember | null;
}

/** An object about a message (a reaction, a vote), narrowed by where. */
type AboutMessage<Where, Key extends string, T, Member> = Placed<
  Where,
  Key,
  Unplaced<T> & InServer & ServerMessagePart & Member,
  Unplaced<T> &
    InPrivate &
    PrivateMessagePart &
    ([keyof Member] extends [never] ? object : NoMember),
  Unplaced<T> & InDm & DmMessagePart
>;

/** A message of a server: its author is a member unless bots are let in. */
type ServerMessage<Options> =
  IsOn<Options, 'bots'> extends true ? GuildMessage : MemberMessage;

/** A message deleted in a server. */
interface DeletedInGuild extends Unplaced<DeletedMessage>, InServer {
  /** The message as it was, when the bot remembered it. */
  before: GuildMessage | null;
}

/** A private message deleted, for a file that receives both kinds. */
interface DeletedInPrivate extends Unplaced<DeletedMessage>, InPrivate {
  /** The message as it was, when the bot remembered it. */
  before: PrivateMessage | null;
}

/** A private message deleted, for a file that only receives those. */
interface DeletedInDm extends Unplaced<DeletedMessage>, InDm {
  /** The message as it was, when the bot remembered it. */
  before: DmMessage | null;
}

/**
 * The events whose handler receives something more precise than
 * `EventContexts`, following where its file listens.
 */
interface NarrowedContexts<Options> {
  messageCreate: Placed<
    WhereOf<Options>,
    'message',
    ServerMessage<Options>,
    PrivateMessage,
    DmMessage
  >;
  messageUpdate: Placed<
    WhereOf<Options>,
    'message',
    ServerMessage<Options>,
    PrivateMessage,
    DmMessage
  >;
  messageDelete: Placed<
    WhereOf<Options>,
    'message',
    DeletedInGuild,
    DeletedInPrivate,
    DeletedInDm
  >;
  reactionAdd: AboutMessage<
    WhereOf<Options>,
    'reaction',
    AddedReaction,
    SentMember
  >;
  reactionRemove: AboutMessage<
    WhereOf<Options>,
    'reaction',
    UserReaction,
    KnownMember
  >;
  reactionClear: AboutMessage<
    WhereOf<Options>,
    'reactions',
    ClearedReactions,
    object
  >;
  pollVoteAdd: AboutMessage<WhereOf<Options>, 'vote', PollVote, KnownMember>;
  pollVoteRemove: AboutMessage<WhereOf<Options>, 'vote', PollVote, KnownMember>;
  typingStart: Placed<
    WhereOf<Options>,
    'typing',
    Unplaced<Typing> & InServer & SentMember,
    Unplaced<Typing> & InPrivate & NoMember,
    Unplaced<Typing> & InDm
  >;
}

/**
 * What your function receives for an event, given the options its file passed
 * to `event()`. `EventContexts` is the widest form: every option on.
 */
export type ContextOf<
  Name extends EventName,
  Options = object,
> = (Name extends keyof NarrowedContexts<Options>
  ? NarrowedContexts<Options>[Name]
  : EventContexts[Name]) &
  TranslationContext;

/** The options of an event; nothing for an event without options. */
export type OptionsOf<Name extends EventName> = Name extends keyof EventOptions
  ? EventOptions[Name]
  : {};

/** One gateway event an event comes from. */
interface Source<Name extends EventName, E extends GatewayDispatchEventName> {
  on: E;
  /**
   * Reads what the event removes from the cache, before it is removed (the
   * message, member or role "as it was").
   */
  before?: (ctx: Context, data: GatewayDispatchEvents[E]) => unknown;
  /**
   * Gets from Discord what the handlers are promised and the bot does not
   * know yet, before they run. Returns nothing when there is nothing to
   * get, which is nearly always: the event is then delivered at once.
   */
  prepare?: (
    ctx: Context,
    data: GatewayDispatchEvents[E]
  ) => Promise<unknown> | undefined;
  /**
   * Builds what the handler receives, once the cache reflects the event.
   * `null` means the event does not happen (a server the bot was already
   * in sending its data is not a server it joined, for example); a list
   * means it happened several times at once (messages deleted together).
   * `prepared` is what `prepare` resolved to.
   */
  build: (
    ctx: Context,
    data: GatewayDispatchEvents[E],
    extra: { joined: boolean; before: unknown; prepared: unknown }
  ) => EventContexts[Name] | readonly EventContexts[Name][] | null;
}

export interface EventDefinition<Name extends EventName = EventName> {
  /**
   * The intents that make Discord send this event; from the options of a
   * file when they depend on them, so that nothing is asked to Discord for
   * what no file wants.
   */
  intents: number | ((options: OptionsOf<Name>) => number);
  /**
   * What the bot must remember for this event to give all it can, when it
   * is more than the default: nothing is kept for what no file uses.
   */
  remembers?: Partial<CacheLimits>;
  /**
   * The options a file can pass to `event()`, with the type of each. An
   * event without this has no options.
   */
  options?: {
    [Key in keyof OptionsOf<Name>]-?: 'boolean' | readonly string[];
  };
  /**
   * Whether a file wants this occurrence of the event, given its options.
   * Decided per file: two files of the same folder can differ.
   */
  accepts?: (context: EventContexts[Name], options: OptionsOf<Name>) => boolean;
  /**
   * The server the event happened in, read from what the handler receives:
   * the language `t` speaks. Left out for what happens outside servers.
   */
  guildOf?: (context: EventContexts[Name]) => Guild | null;
  sources: {
    [E in GatewayDispatchEventName]: Source<Name, E>;
  }[GatewayDispatchEventName][];
}

const I = GatewayIntent;

const findGuild = (ctx: Context, id: Snowflake): Guild | null =>
  ctx.cache.guilds.get(id) ?? null;

/** The server of a context that has it. */
const ofGuild = ({ guild }: { guild: Guild | null }): Guild | null => guild;

const channel = (
  on: 'CHANNEL_CREATE' | 'CHANNEL_UPDATE' | 'THREAD_CREATE' | 'THREAD_UPDATE'
): Source<'channelCreate' | 'channelUpdate', typeof on> => ({
  on,
  build: (ctx, data) => {
    const found = ctx.cache.channels.get(data.id);
    return found ? { channel: found, guild: found.guild } : null;
  },
});

const deletedChannel = (
  on: 'CHANNEL_DELETE' | 'THREAD_DELETE'
): Source<'channelDelete', typeof on> => ({
  on,
  before: (ctx, data) => ctx.cache.channels.get(data.id) ?? null,
  build: (_ctx, _data, { before }) =>
    before
      ? { channel: before as Channel, guild: (before as Channel).guild }
      : null,
});

/**
 * Discord refused what an event needs before it can be given to its files:
 * the channel it happened in, or the user who did it.
 */
export class MissingForEvent extends Error {
  constructor(
    readonly what: 'channel' | 'user',
    override readonly cause: unknown
  ) {
    super(`Discord refused the ${what} of an event.`);
  }
}

/** What is being asked to Discord, for each bot, by `channel:id` or `user:id`. */
const asking = new WeakMap<Context, Map<string, Promise<unknown>>>();

/** Asks Discord once for something several events may wait for. */
function askOnce<T>(
  ctx: Context,
  key: string,
  ask: () => Promise<T>
): Promise<T> {
  let pending = asking.get(ctx);
  if (!pending) asking.set(ctx, (pending = new Map()));
  const running = pending.get(key);
  if (running) return running as Promise<T>;
  const answer = ask().finally(() => pending.delete(key));
  pending.set(key, answer);
  return answer;
}

/**
 * The channel of what happened in a server, asked to Discord when the bot
 * does not know it (a thread it never saw, for example): one request, then
 * it is remembered.
 *
 * Everything that happens in that channel meanwhile waits for the same
 * answer, so it costs one request and is delivered in the order it
 * happened: a message is never deleted before it was sent.
 */
const channelOf = (
  ctx: Context,
  data: { channel_id: Snowflake; guild_id?: Snowflake }
): Promise<unknown> | undefined => {
  const guildId = data.guild_id;
  const id = data.channel_id;
  if (!guildId || ctx.cache.channels.has(id)) return undefined;
  return askOnce(ctx, `channel:${id}`, () =>
    ctx.rest
      .request(GetChannel, [id])
      .then(raw => ctx.entities.channel(raw, guildId))
      .catch((error: unknown) => {
        throw new MissingForEvent('channel', error);
      })
  );
};

/** A user the bot does not know, asked to Discord once, then remembered. */
const fetchUser = (ctx: Context, id: Snowflake): Promise<User> =>
  askOnce(ctx, `user:${id}`, () =>
    ctx.rest
      .request(GetUser, [id])
      .then(raw => ctx.entities.user(raw))
      .catch((error: unknown) => {
        throw new MissingForEvent('user', error);
      })
  );

/**
 * The channel of what happened, and who did it when Discord only gives
 * their id and the bot does not know them: one request, then remembered.
 * Resolves to the user, which `build` receives as `prepared`, so it is
 * there even when the bot can remember no user right now.
 */
const placeAndUser = (
  ctx: Context,
  data: { channel_id: Snowflake; guild_id?: Snowflake },
  userId: Snowflake | null
): Promise<unknown> | undefined => {
  const channel = channelOf(ctx, data);
  const known = userId ? ctx.cache.users.get(userId) : undefined;
  const user = userId && !known ? fetchUser(ctx, userId) : undefined;
  if (!channel && !user) return undefined;
  return Promise.all([channel, user]).then(([, fetched]) => fetched ?? known);
};

/** Who did it: what `prepare` got, or else what the bot knows. */
const userFrom = (
  ctx: Context,
  prepared: unknown,
  id: Snowflake
): User | null =>
  (prepared as User | undefined) ?? ctx.cache.users.get(id) ?? null;

/**
 * Where something happened in a server or in private, as the bot knows
 * it: `at` goes in the object of the event, `guild` next to it.
 */
const placeOf = (
  ctx: Context,
  data: { channel_id: Snowflake; guild_id?: Snowflake }
): {
  at: {
    channelId: Snowflake;
    channel: TextBasedChannel | null;
    guildId: Snowflake | null;
  };
  guild: Guild | null;
} => {
  const found = ctx.cache.channels.get(data.channel_id);
  const guildId = data.guild_id ?? found?.guildId ?? null;
  return {
    at: {
      channelId: data.channel_id,
      channel: found?.isTextBased() ? found : null,
      guildId,
    },
    guild: guildId ? (ctx.cache.guilds.get(guildId) ?? null) : null,
  };
};

/** A message the bot remembers. */
const rememberedMessage = (
  channel: TextBasedChannel | null,
  id: Snowflake
): Message | null => channel?.messages.get(id) ?? null;

/** A member the bot remembers. */
const rememberedMember = (
  guild: Guild | null,
  userId: Snowflake
): GuildMember | null => guild?.members.get(userId) ?? null;

/**
 * Whether a file wants something that happened in a server or in private:
 * it listens there, and in a server what it is promised is there.
 */
const wantedPlace = (
  about: {
    guildId: Snowflake | null;
    channel: unknown;
    member?: GuildMember | null;
  },
  guild: Guild | null,
  where: EventWhere | undefined,
  needsMember = false
): boolean => {
  const inGuild = about.guildId !== null;
  if (!listensThere(where, inGuild)) return false;
  if (!inGuild) return true;
  return (
    guild !== null &&
    about.channel !== null &&
    (!needsMember || about.member != null)
  );
};

/**
 * Private messages, bots and webhooks only reach the files that asked for
 * them. This is also what makes the types true: in a server, the server
 * and the channel are there, and without `bots` so is the member who wrote.
 */
/** Whether a file listens where something happened. */
const listensThere = (
  where: EventWhere | undefined,
  inGuild: boolean
): boolean => (inGuild ? where !== 'dm' : where === 'dm' || where === 'both');

/** The intents of messages, for where a file listens. */
const messagesIn = (where: EventWhere | undefined): number =>
  (where === 'dm' ? 0 : I.GuildMessages) |
  (where === 'dm' || where === 'both' ? I.DirectMessages : 0);

const PLACES = ['guild', 'dm', 'both'] as const;

const wantedMessage = (
  { message }: { message: Message },
  options: MessageEventOptions
): boolean => {
  const inGuild = message.guildId !== null;
  if (!listensThere(options.where, inGuild)) return false;
  // In a server, the server and the channel are promised.
  if (inGuild && (message.guild === null || message.channel === null)) {
    return false;
  }
  if (options.bots === true) return true;
  if (message.author.bot || message.webhookId !== null) return false;
  return !inGuild || message.member !== null;
};

const message = (
  on: 'MESSAGE_CREATE' | 'MESSAGE_UPDATE'
): Source<'messageCreate' | 'messageUpdate', typeof on> => ({
  on,
  prepare: channelOf,
  build: (ctx, data) => {
    const message = ctx.entities.message(data, data.guild_id);
    return { message, guild: message.guild };
  },
});

const member = (
  on: 'GUILD_MEMBER_ADD' | 'GUILD_MEMBER_UPDATE'
): Source<'memberJoin' | 'memberUpdate', typeof on> => ({
  on,
  build: (ctx, data) => {
    const guild = findGuild(ctx, data.guild_id);
    if (!guild) return null;
    const { guild_id: guildId, ...raw } = data;
    // The member comes with the event: it is there whatever the bot
    // remembers of the members of the server.
    const member =
      guild.members.get(data.user!.id) ??
      ctx.entities.member(guildId, raw as RawGuildMember);
    return { member, guild };
  },
});

const role = (
  on: 'GUILD_ROLE_CREATE' | 'GUILD_ROLE_UPDATE'
): Source<'roleCreate' | 'roleUpdate', typeof on> => ({
  on,
  build: (ctx, data) => {
    const guild = findGuild(ctx, data.guild_id);
    const found = guild?.roles.get(data.role.id);
    return guild && found ? { role: found, guild } : null;
  },
});

const ban = (
  on: 'GUILD_BAN_ADD' | 'GUILD_BAN_REMOVE'
): Source<'banAdd' | 'banRemove', typeof on> => ({
  on,
  build: (ctx, data) => {
    const guild = findGuild(ctx, data.guild_id);
    return guild ? { user: ctx.entities.user(data.user), guild } : null;
  },
});

/**
 * The emojis of a server that changed, from the list Discord sends: the
 * emojis before (read by `before`) and after are compared one by one.
 */
const emojis = (
  pick: (
    now: GuildEmoji | undefined,
    old: GuildEmoji | undefined
  ) => GuildEmoji | null | undefined
): Source<
  'emojiCreate' | 'emojiUpdate' | 'emojiDelete',
  'GUILD_EMOJIS_UPDATE'
> => ({
  on: 'GUILD_EMOJIS_UPDATE',
  before: (ctx, data) => new Map(findGuild(ctx, data.guild_id)?.emojis ?? []),
  build: (ctx, data, { before }) => {
    const guild = findGuild(ctx, data.guild_id);
    if (!guild) return null;
    const old = before as Map<Snowflake, GuildEmoji>;
    const ids = new Set([...old.keys(), ...guild.emojis.keys()]);
    const changed = [];
    for (const id of ids) {
      const emoji = pick(guild.emojis.get(id), old.get(id));
      if (emoji) changed.push({ emoji, guild });
    }
    return changed;
  },
});

/** The server and the channel of an invite; `null` outside servers. */
const inviteChannel = (
  ctx: Context,
  data: { channel_id: Snowflake; guild_id?: Snowflake }
): { guild: Guild; channel: GuildChannel } | null => {
  const guild = data.guild_id ? findGuild(ctx, data.guild_id) : null;
  const channel = guild?.channels.get(data.channel_id);
  // An invite leads to a channel, never to a thread.
  if (!guild || !channel || channel.isThread()) return null;
  return { guild, channel };
};

/** The intents of reactions, for where a file listens. */
const reactionsIn = (where: EventWhere | undefined): number =>
  (where === 'dm' ? 0 : I.GuildMessageReactions) |
  (where === 'dm' || where === 'both' ? I.DirectMessageReactions : 0);

/** The intents of polls, for where a file listens. */
const pollsIn = (where: EventWhere | undefined): number =>
  (where === 'dm' ? 0 : I.GuildMessagePolls) |
  (where === 'dm' || where === 'both' ? I.DirectMessagePolls : 0);

const cleared = (
  on: 'MESSAGE_REACTION_REMOVE_ALL' | 'MESSAGE_REACTION_REMOVE_EMOJI'
): Source<'reactionClear', typeof on> => ({
  on,
  prepare: channelOf,
  build: (ctx, data) => {
    const { at, guild } = placeOf(ctx, data);
    return {
      reactions: {
        emoji:
          'emoji' in data ? toCamelCase(data.emoji as RawPartialEmoji) : null,
        messageId: data.message_id,
        message: rememberedMessage(at.channel, data.message_id),
        ...at,
      },
      guild,
    };
  },
});

const vote = (
  on: 'MESSAGE_POLL_VOTE_ADD' | 'MESSAGE_POLL_VOTE_REMOVE'
): Source<'pollVoteAdd' | 'pollVoteRemove', typeof on> => ({
  on,
  prepare: (ctx, data) => placeAndUser(ctx, data, data.user_id),
  build: (ctx, data, { prepared }) => {
    const { at, guild } = placeOf(ctx, data);
    const user = userFrom(ctx, prepared, data.user_id);
    if (!user) return null;
    return {
      vote: {
        answerId: data.answer_id,
        user,
        member: rememberedMember(guild, data.user_id),
        messageId: data.message_id,
        message: rememberedMessage(at.channel, data.message_id),
        ...at,
      },
      guild,
    };
  },
});

/** A thread and its server; `null` when the bot does not know it. */
const threadOf = (
  ctx: Context,
  data: { id: Snowflake; guild_id: Snowflake }
): { thread: ThreadChannel; guild: Guild } | null => {
  const guild = findGuild(ctx, data.guild_id);
  const thread = ctx.cache.channels.get(data.id);
  return guild && thread?.isThread() ? { thread, guild } : null;
};

/** A voice state as handlers read it. */
const stateOf = (entry: VoiceEntry): VoiceState => toCamelCase(entry.state);

/**
 * The voice events, from what someone's voice state was (read by `before`)
 * and is now: each event picks the change it is about.
 */
const voice = <
  Name extends 'voiceJoin' | 'voiceLeave' | 'voiceMove' | 'voiceUpdate',
>(
  pick: (
    was: VoiceEntry | undefined,
    now: VoiceEntry | undefined
  ) => Omit<EventContexts[Name]['voice'], 'member'> | null
): Source<Name, 'VOICE_STATE_UPDATE'> => ({
  on: 'VOICE_STATE_UPDATE',
  before: (ctx, data) => {
    const guild = data.guild_id ? findGuild(ctx, data.guild_id) : null;
    return guild ? storesOf(guild).voiceStates.get(data.user_id) : undefined;
  },
  build: (ctx, data, { before }) => {
    const guild = data.guild_id ? findGuild(ctx, data.guild_id) : null;
    if (!guild) return null;
    const now = storesOf(guild).voiceStates.get(data.user_id);
    const picked = pick(before as VoiceEntry | undefined, now);
    // In a server, the member comes with the event.
    const member = data.member
      ? ctx.entities.member(guild.id, data.member)
      : guild.members.get(data.user_id);
    if (!picked || !member) return null;
    return { voice: { ...picked, member }, guild } as EventContexts[Name];
  },
});

const scheduled = (
  on:
    | 'GUILD_SCHEDULED_EVENT_CREATE'
    | 'GUILD_SCHEDULED_EVENT_UPDATE'
    | 'GUILD_SCHEDULED_EVENT_DELETE'
): Source<
  'scheduledEventCreate' | 'scheduledEventUpdate' | 'scheduledEventDelete',
  typeof on
> => ({
  on,
  build: (ctx, data) => {
    const guild = findGuild(ctx, data.guild_id);
    if (!guild) return null;
    if (data.creator) ctx.entities.user(data.creator);
    return { scheduledEvent: toCamelCase(data), guild };
  },
});

const interested = (
  on: 'GUILD_SCHEDULED_EVENT_USER_ADD' | 'GUILD_SCHEDULED_EVENT_USER_REMOVE'
): Source<'scheduledEventUserAdd' | 'scheduledEventUserRemove', typeof on> => ({
  on,
  prepare: (ctx, data) =>
    ctx.cache.users.has(data.user_id)
      ? undefined
      : fetchUser(ctx, data.user_id),
  build: (ctx, data, { prepared }) => {
    const guild = findGuild(ctx, data.guild_id);
    const user = userFrom(ctx, prepared, data.user_id);
    if (!guild || !user) return null;
    return {
      interest: {
        scheduledEventId: data.guild_scheduled_event_id,
        user,
        member: rememberedMember(guild, data.user_id),
      },
      guild,
    };
  },
});

/**
 * The events, by name. `ready` has no source: it is not a gateway event but
 * the moment the bot has finished connecting.
 */
export const EVENTS: { [Name in EventName]: EventDefinition<Name> } = {
  ready: { intents: 0, sources: [] },

  messageCreate: {
    guildOf: ofGuild,
    // Without Message Content, the messages of others come empty.
    intents: ({ where }) => messagesIn(where) | I.MessageContent,
    options: { bots: 'boolean', where: PLACES },
    accepts: wantedMessage,
    sources: [message('MESSAGE_CREATE')],
  },
  messageUpdate: {
    guildOf: ofGuild,
    intents: ({ where }) => messagesIn(where) | I.MessageContent,
    options: { bots: 'boolean', where: PLACES },
    accepts: wantedMessage,
    sources: [message('MESSAGE_UPDATE')],
  },
  messageDelete: {
    guildOf: ofGuild,
    intents: ({ where }) => messagesIn(where),
    options: { where: PLACES },
    accepts: ({ message, guild }, options) =>
      wantedPlace(message, guild, options.where),
    sources: [
      {
        on: 'MESSAGE_DELETE',
        prepare: channelOf,
        before: (ctx, data) => {
          const found = ctx.cache.channels.get(data.channel_id);
          return found?.isTextBased()
            ? (found.messages.get(data.id) ?? null)
            : null;
        },
        build: (ctx, data, { before }) => {
          const { at, guild } = placeOf(ctx, data);
          return {
            message: { id: data.id, ...at, before: before as Message | null },
            guild,
          };
        },
      },
      {
        // Messages deleted together: one occurrence each.
        on: 'MESSAGE_DELETE_BULK',
        prepare: channelOf,
        before: (ctx, data) => {
          const found = ctx.cache.channels.get(data.channel_id);
          return data.ids.map(id =>
            found?.isTextBased() ? (found.messages.get(id) ?? null) : null
          );
        },
        build: (ctx, data, { before }) => {
          const { at, guild } = placeOf(ctx, data);
          const messages = before as (Message | null)[];
          return data.ids.map((id, index) => ({
            message: { id, ...at, before: messages[index] ?? null },
            guild,
          }));
        },
      },
    ],
  },

  memberJoin: {
    guildOf: ofGuild,
    intents: I.GuildMembers,
    sources: [member('GUILD_MEMBER_ADD')],
  },
  memberUpdate: {
    guildOf: ofGuild,
    intents: I.GuildMembers,
    sources: [member('GUILD_MEMBER_UPDATE')],
  },
  memberLeave: {
    guildOf: ofGuild,
    intents: I.GuildMembers,
    sources: [
      {
        on: 'GUILD_MEMBER_REMOVE',
        build: (ctx, data) => {
          const guild = findGuild(ctx, data.guild_id);
          if (!guild) return null;
          return { user: ctx.entities.user(data.user), guild };
        },
      },
    ],
  },

  guildJoin: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [
      {
        on: 'GUILD_CREATE',
        build: (ctx, data, { joined }) => {
          const guild = joined ? findGuild(ctx, data.id) : null;
          return guild ? { guild } : null;
        },
      },
    ],
  },
  guildLeave: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [
      {
        on: 'GUILD_DELETE',
        before: (ctx, data) => findGuild(ctx, data.id),
        // With `unavailable`, an outage: the bot is still in the server.
        build: (_ctx, data, { before }) =>
          before && !data.unavailable ? { guild: before as Guild } : null,
      },
    ],
  },

  channelCreate: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [channel('CHANNEL_CREATE'), channel('THREAD_CREATE')],
  },
  channelUpdate: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [channel('CHANNEL_UPDATE'), channel('THREAD_UPDATE')],
  },
  channelDelete: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [
      deletedChannel('CHANNEL_DELETE'),
      deletedChannel('THREAD_DELETE'),
    ],
  },

  roleCreate: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [role('GUILD_ROLE_CREATE')],
  },
  roleUpdate: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [role('GUILD_ROLE_UPDATE')],
  },
  roleDelete: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [
      {
        on: 'GUILD_ROLE_DELETE',
        before: (ctx, data) =>
          findGuild(ctx, data.guild_id)?.roles.get(data.role_id) ?? null,
        build: (ctx, data, { before }) => {
          const guild = findGuild(ctx, data.guild_id);
          // Every role of a server is known: one that is not never was.
          if (!guild || !before) return null;
          return { role: before as Role, guild };
        },
      },
    ],
  },

  guildUpdate: {
    guildOf: ofGuild,
    intents: I.Guilds,
    sources: [
      {
        on: 'GUILD_UPDATE',
        build: (ctx, data) => {
          const guild = findGuild(ctx, data.id);
          return guild ? { guild } : null;
        },
      },
    ],
  },

  banAdd: {
    guildOf: ofGuild,
    intents: I.GuildModeration,
    sources: [ban('GUILD_BAN_ADD')],
  },
  banRemove: {
    guildOf: ofGuild,
    intents: I.GuildModeration,
    sources: [ban('GUILD_BAN_REMOVE')],
  },

  emojiCreate: {
    guildOf: ofGuild,
    intents: I.GuildExpressions,
    sources: [emojis((now, old) => (old ? null : now))],
  },
  emojiUpdate: {
    guildOf: ofGuild,
    intents: I.GuildExpressions,
    sources: [
      emojis((now, old) =>
        old &&
        now &&
        JSON.stringify(dataOf(old)) !== JSON.stringify(dataOf(now))
          ? now
          : null
      ),
    ],
  },
  emojiDelete: {
    guildOf: ofGuild,
    intents: I.GuildExpressions,
    sources: [emojis((now, old) => (now ? null : old))],
  },

  inviteCreate: {
    guildOf: ofGuild,
    intents: I.GuildInvites,
    sources: [
      {
        on: 'INVITE_CREATE',
        prepare: channelOf,
        build: (ctx, data) => {
          const place = inviteChannel(ctx, data);
          if (!place) return null;
          const {
            inviter,
            channel_id: channelId,
            guild_id: guildId,
            ...rest
          } = data;
          const invite = ctx.entities.invite({
            ...rest,
            type: InviteType.Guild,
            guild: { id: guildId },
            channel: { id: channelId },
            ...(inviter ? { inviter } : {}),
          } as RawInvite);
          return { invite, guild: place.guild };
        },
      },
    ],
  },
  inviteDelete: {
    guildOf: ofGuild,
    intents: I.GuildInvites,
    sources: [
      {
        on: 'INVITE_DELETE',
        prepare: channelOf,
        build: (ctx, data) => {
          const place = inviteChannel(ctx, data);
          return place
            ? {
                invite: { code: data.code, channel: place.channel },
                guild: place.guild,
              }
            : null;
        },
      },
    ],
  },

  auditLogEntryCreate: {
    guildOf: ofGuild,
    intents: I.GuildModeration,
    sources: [
      {
        on: 'GUILD_AUDIT_LOG_ENTRY_CREATE',
        build: (ctx, data) => {
          const guild = findGuild(ctx, data.guild_id);
          if (!guild) return null;
          const { guild_id: _guildId, ...entry } = data;
          return { entry: toCamelCase(entry as RawAuditLogEntry), guild };
        },
      },
    ],
  },

  reactionAdd: {
    guildOf: ofGuild,
    intents: ({ where }) => reactionsIn(where),
    options: { bots: 'boolean', where: PLACES },
    accepts: ({ reaction, guild }, options) =>
      wantedPlace(reaction, guild, options.where, true) &&
      (options.bots === true || !reaction.user.bot),
    sources: [
      {
        on: 'MESSAGE_REACTION_ADD',
        // In a server, who reacted comes with the event.
        prepare: (ctx, data) =>
          placeAndUser(ctx, data, data.member?.user ? null : data.user_id),
        build: (ctx, data, { prepared }) => {
          const { at, guild } = placeOf(ctx, data);
          const member =
            data.member && data.guild_id
              ? ctx.entities.member(data.guild_id, data.member)
              : null;
          const user = member?.user ?? userFrom(ctx, prepared, data.user_id);
          if (!user) return null;
          return {
            reaction: {
              emoji: toCamelCase(data.emoji),
              user,
              member,
              burst: data.burst,
              messageId: data.message_id,
              message: rememberedMessage(at.channel, data.message_id),
              messageAuthorId: data.message_author_id ?? null,
              ...at,
            },
            guild,
          };
        },
      },
    ],
  },
  reactionRemove: {
    guildOf: ofGuild,
    intents: ({ where }) => reactionsIn(where),
    options: { bots: 'boolean', where: PLACES },
    accepts: ({ reaction, guild }, options) =>
      wantedPlace(reaction, guild, options.where) &&
      (options.bots === true || !reaction.user.bot),
    sources: [
      {
        on: 'MESSAGE_REACTION_REMOVE',
        prepare: (ctx, data) => placeAndUser(ctx, data, data.user_id),
        build: (ctx, data, { prepared }) => {
          const { at, guild } = placeOf(ctx, data);
          const user = userFrom(ctx, prepared, data.user_id);
          if (!user) return null;
          return {
            reaction: {
              emoji: toCamelCase(data.emoji),
              user,
              member: rememberedMember(guild, data.user_id),
              burst: data.burst,
              messageId: data.message_id,
              message: rememberedMessage(at.channel, data.message_id),
              ...at,
            },
            guild,
          };
        },
      },
    ],
  },
  reactionClear: {
    guildOf: ofGuild,
    intents: ({ where }) => reactionsIn(where),
    options: { where: PLACES },
    accepts: ({ reactions, guild }, options) =>
      wantedPlace(reactions, guild, options.where),
    sources: [
      cleared('MESSAGE_REACTION_REMOVE_ALL'),
      cleared('MESSAGE_REACTION_REMOVE_EMOJI'),
    ],
  },

  pollVoteAdd: {
    guildOf: ofGuild,
    intents: ({ where }) => pollsIn(where),
    options: { where: PLACES },
    accepts: ({ vote, guild }, options) =>
      wantedPlace(vote, guild, options.where),
    sources: [vote('MESSAGE_POLL_VOTE_ADD')],
  },
  pollVoteRemove: {
    guildOf: ofGuild,
    intents: ({ where }) => pollsIn(where),
    options: { where: PLACES },
    accepts: ({ vote, guild }, options) =>
      wantedPlace(vote, guild, options.where),
    sources: [vote('MESSAGE_POLL_VOTE_REMOVE')],
  },

  typingStart: {
    guildOf: ofGuild,
    intents: ({ where }) =>
      (where === 'dm' ? 0 : I.GuildMessageTyping) |
      (where === 'dm' || where === 'both' ? I.DirectMessageTyping : 0),
    options: { where: PLACES },
    accepts: ({ typing, guild }, options) =>
      wantedPlace(typing, guild, options.where, true),
    sources: [
      {
        on: 'TYPING_START',
        prepare: (ctx, data) =>
          placeAndUser(ctx, data, data.member?.user ? null : data.user_id),
        build: (ctx, data, { prepared }) => {
          const member =
            data.member && data.guild_id
              ? ctx.entities.member(data.guild_id, data.member)
              : null;
          const user = member?.user ?? userFrom(ctx, prepared, data.user_id);
          if (!user) return null;
          const { at, guild } = placeOf(ctx, data);
          return {
            typing: {
              user,
              member,
              startedAt: new Date(data.timestamp * 1000),
              ...at,
            },
            guild,
          };
        },
      },
    ],
  },

  threadMemberJoin: {
    guildOf: ofGuild,
    // Without it, Discord only says when the bot itself joins a thread.
    intents: I.GuildMembers,
    sources: [
      {
        on: 'THREAD_MEMBERS_UPDATE',
        prepare: (ctx, data) =>
          data.added_members?.length
            ? channelOf(ctx, { channel_id: data.id, guild_id: data.guild_id })
            : undefined,
        build: (ctx, data) => {
          const place = threadOf(ctx, data);
          if (!place) return null;
          const joined = [];
          for (const added of data.added_members ?? []) {
            // Each one comes with its member in this event.
            if (!added.member?.user) continue;
            const member = ctx.entities.member(data.guild_id, added.member);
            joined.push({ thread: place.thread, member, guild: place.guild });
          }
          return joined;
        },
      },
    ],
  },
  threadMemberLeave: {
    guildOf: ofGuild,
    intents: I.GuildMembers,
    sources: [
      {
        on: 'THREAD_MEMBERS_UPDATE',
        prepare: (ctx, data) =>
          data.removed_member_ids?.length
            ? channelOf(ctx, { channel_id: data.id, guild_id: data.guild_id })
            : undefined,
        build: (ctx, data) => {
          const place = threadOf(ctx, data);
          if (!place) return null;
          return (data.removed_member_ids ?? []).map(userId => ({
            thread: place.thread,
            userId,
            member: rememberedMember(place.guild, userId),
            guild: place.guild,
          }));
        },
      },
    ],
  },

  voiceJoin: {
    guildOf: ofGuild,
    intents: I.GuildVoiceStates,
    sources: [
      voice<'voiceJoin'>((was, now) =>
        !was && now ? { channel: now.channel, state: stateOf(now) } : null
      ),
    ],
  },
  voiceLeave: {
    guildOf: ofGuild,
    intents: I.GuildVoiceStates,
    sources: [
      voice<'voiceLeave'>((was, now) =>
        was && !now ? { channel: was.channel, state: stateOf(was) } : null
      ),
    ],
  },
  voiceMove: {
    guildOf: ofGuild,
    intents: I.GuildVoiceStates,
    sources: [
      voice<'voiceMove'>((was, now) =>
        was && now && was.channel.id !== now.channel.id
          ? { from: was.channel, to: now.channel, state: stateOf(now) }
          : null
      ),
    ],
  },
  voiceUpdate: {
    guildOf: ofGuild,
    intents: I.GuildVoiceStates,
    sources: [
      voice<'voiceUpdate'>((was, now) =>
        was &&
        now &&
        was.channel.id === now.channel.id &&
        JSON.stringify(was.state) !== JSON.stringify(now.state)
          ? {
              channel: now.channel,
              state: stateOf(now),
              before: stateOf(was),
            }
          : null
      ),
    ],
  },

  presenceUpdate: {
    guildOf: ofGuild,
    intents: I.GuildPresences,
    sources: [
      {
        on: 'PRESENCE_UPDATE',
        build: (ctx, data) => {
          const guild = findGuild(ctx, data.guild_id);
          if (!guild) return null;
          const { user: sent, guild_id: _guildId, ...presence } = data;
          // Discord may only send the id of the user.
          const raw = sent as Partial<RawUser> & { id: Snowflake };
          const user =
            raw.username !== undefined
              ? ctx.entities.user(raw as RawUser)
              : (ctx.cache.users.get(raw.id) ?? null);
          return {
            presence: {
              ...toCamelCase(presence),
              userId: raw.id,
              user,
              member: rememberedMember(guild, raw.id),
            },
            guild,
          };
        },
      },
    ],
  },

  scheduledEventCreate: {
    guildOf: ofGuild,
    intents: I.GuildScheduledEvents,
    sources: [scheduled('GUILD_SCHEDULED_EVENT_CREATE')],
  },
  scheduledEventUpdate: {
    guildOf: ofGuild,
    intents: I.GuildScheduledEvents,
    sources: [scheduled('GUILD_SCHEDULED_EVENT_UPDATE')],
  },
  scheduledEventDelete: {
    guildOf: ofGuild,
    intents: I.GuildScheduledEvents,
    sources: [scheduled('GUILD_SCHEDULED_EVENT_DELETE')],
  },
  scheduledEventUserAdd: {
    guildOf: ofGuild,
    intents: I.GuildScheduledEvents,
    sources: [interested('GUILD_SCHEDULED_EVENT_USER_ADD')],
  },
  scheduledEventUserRemove: {
    guildOf: ofGuild,
    intents: I.GuildScheduledEvents,
    sources: [interested('GUILD_SCHEDULED_EVENT_USER_REMOVE')],
  },
};

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && Object.hasOwn(EVENTS, name);
}
