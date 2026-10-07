// Every event user code can listen to. An event is one entry here: its
// name, the gateway events it comes from, the intents that make Discord
// send them, and how to build what the handler receives. Adding an event is
// adding an entry; the router and the loader never change.

import type { CacheLimits } from '../cache/cache.js';
import { GetChannel } from '../discord/endpoints.js';
import { GatewayIntent } from '../discord/intents.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawGuildMember } from '../discord/types/guild.js';
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
} from '../structures/channel.js';
import type { Context } from '../structures/context.js';
import type { Guild } from '../structures/guild.js';
import type { GuildMember } from '../structures/member.js';
import type {
  DmMessage,
  GuildMessage,
  MemberMessage,
  Message,
  PrivateMessage,
} from '../structures/message.js';
import type { Role } from '../structures/role.js';
import type { User } from '../structures/user.js';
import type { TranslationContext } from '../messages/messages.js';

/** What your function receives, for each event. */
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
  };
  /** A message was edited. */
  messageUpdate: {
    /** The message, as it is now. */
    message: Message;
  };
  /** A message was deleted. */
  messageDelete: {
    /** The id of the deleted message. */
    messageId: Snowflake;
    /** The id of the channel the message was in. */
    channelId: Snowflake;
    /** The id of the server; `null` for a private message. */
    guildId: Snowflake | null;
    /** The server; `null` for a private message. */
    guild: Guild | null;
    /** The channel, when the bot knows it. */
    channel: TextBasedChannel | null;
    /** The message as it was, when the bot remembered it. */
    message: Message | null;
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
    /** The member as it was, when the bot knew it. */
    member: GuildMember | null;
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
  };
  /** A channel changed: name, topic, permissions... */
  channelUpdate: {
    /** The channel or thread, as it is now. */
    channel: GuildChannel | ThreadChannel | Channel;
  };
  /** A channel was deleted. */
  channelDelete: {
    /** The channel or thread as it was. */
    channel: GuildChannel | ThreadChannel | Channel;
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
    /** The id of the deleted role. */
    roleId: Snowflake;
    /** The server the role was in. */
    guild: Guild;
    /** The role as it was. */
    role: Role;
  };
}

/** The name of an event: the name of a folder of `src/events/`. */
export type EventName = keyof EventContexts;

/**
 * What `event()` returns: the default export of an event file.
 */
export interface EventFile {
  /** The function to run when the event happens. */
  readonly handler: (context: never) => unknown;
  /** What the file passed as second argument, not checked yet. */
  readonly options: unknown;
}

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
export interface EventOptions {
  messageCreate: MessageEventOptions;
  messageUpdate: MessageEventOptions;
  messageDelete: WhereEventOptions;
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

/** A message of a server: its author is a member unless bots are let in. */
type ServerMessage<Options> =
  IsOn<Options, 'bots'> extends true ? GuildMessage : MemberMessage;

/** The message a file receives: what its options let through. */
type MessageFor<Options, Where = WhereOf<Options>> = Where extends 'guild'
  ? ServerMessage<Options>
  : Where extends 'dm'
    ? DmMessage
    : ServerMessage<Options> | PrivateMessage;

type Deleted = Omit<
  EventContexts['messageDelete'],
  'guildId' | 'guild' | 'channel' | 'message'
>;

/** A message deleted in a server. */
interface DeletedInGuild extends Deleted {
  /** The id of the server. */
  guildId: Snowflake;
  /** The server the message was in. */
  guild: Guild;
  /** The channel the message was in. */
  channel: GuildTextBasedChannel;
  /** The message as it was, when the bot remembered it. */
  message: GuildMessage | null;
}

/** A private message deleted, for a file that receives both kinds. */
interface DeletedInPrivate extends Deleted {
  /** No server: the message was private. */
  guildId: null;
  /** No server: the message was private. */
  guild: null;
  /** The private conversation, when the bot knows it. */
  channel: DMChannel | null;
  /** The message as it was, when the bot remembered it. */
  message: PrivateMessage | null;
}

/** A private message deleted, for a file that only receives those. */
interface DeletedInDm extends Deleted {
  /** The private conversation, when the bot knows it. */
  channel: DMChannel | null;
  /** The message as it was, when the bot remembered it. */
  message: DmMessage | null;
}

type DeletedFor<Where> = Where extends 'guild'
  ? DeletedInGuild
  : Where extends 'dm'
    ? DeletedInDm
    : DeletedInGuild | DeletedInPrivate;

/**
 * The events whose handler receives something more precise than
 * `EventContexts`, following where its file listens.
 */
interface NarrowedContexts<Options> {
  messageCreate: { message: MessageFor<Options> };
  messageUpdate: { message: MessageFor<Options> };
  messageDelete: DeletedFor<WhereOf<Options>>;
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
  : Record<string, never>;

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
   * in sending its data is not a server it joined, for example).
   */
  build: (
    ctx: Context,
    data: GatewayDispatchEvents[E],
    extra: { joined: boolean; before: unknown }
  ) => EventContexts[Name] | null;
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
    return found ? { channel: found } : null;
  },
});

const deletedChannel = (
  on: 'CHANNEL_DELETE' | 'THREAD_DELETE'
): Source<'channelDelete', typeof on> => ({
  on,
  before: (ctx, data) => ctx.cache.channels.get(data.id) ?? null,
  build: (_ctx, _data, { before }) =>
    before ? { channel: before as Channel } : null,
});

/** The channels being asked to Discord, for each bot. */
const asking = new WeakMap<Context, Map<Snowflake, Promise<unknown>>>();

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
  let pending = asking.get(ctx);
  if (!pending) asking.set(ctx, (pending = new Map()));
  const running = pending.get(id);
  if (running) return running;
  const answer = ctx.rest
    .request(GetChannel, [id])
    .then(raw => ctx.entities.channel(raw, guildId))
    .finally(() => pending.delete(id));
  pending.set(id, answer);
  return answer;
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
  build: (ctx, data) => ({
    message: ctx.entities.message(data, data.guild_id),
  }),
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

/**
 * The events, by name. `ready` has no source: it is not a gateway event but
 * the moment the bot has finished connecting.
 */
export const EVENTS: { [Name in EventName]: EventDefinition<Name> } = {
  ready: { intents: 0, sources: [] },

  messageCreate: {
    guildOf: ({ message }) => message.guild,
    // Without Message Content, the messages of others come empty.
    intents: ({ where }) => messagesIn(where) | I.MessageContent,
    options: { bots: 'boolean', where: PLACES },
    accepts: wantedMessage,
    sources: [message('MESSAGE_CREATE')],
  },
  messageUpdate: {
    guildOf: ({ message }) => message.guild,
    intents: ({ where }) => messagesIn(where) | I.MessageContent,
    options: { bots: 'boolean', where: PLACES },
    accepts: wantedMessage,
    sources: [message('MESSAGE_UPDATE')],
  },
  messageDelete: {
    guildOf: ofGuild,
    intents: ({ where }) => messagesIn(where),
    options: { where: PLACES },
    accepts: ({ guildId, guild, channel }, options) =>
      listensThere(options.where, guildId !== null) &&
      // In a server, the server and the channel are promised.
      (guildId === null || (guild !== null && channel !== null)),
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
          const found = ctx.cache.channels.get(data.channel_id);
          const guildId = data.guild_id ?? found?.guildId ?? null;
          return {
            messageId: data.id,
            channelId: data.channel_id,
            guildId,
            guild: guildId ? (ctx.cache.guilds.get(guildId) ?? null) : null,
            channel: found?.isTextBased() ? found : null,
            message: before as Message | null,
          };
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
    // "The member as it was" is a member the bot remembered.
    remembers: { members: 1000 },
    sources: [
      {
        on: 'GUILD_MEMBER_REMOVE',
        before: (ctx, data) =>
          findGuild(ctx, data.guild_id)?.members.get(data.user.id) ?? null,
        build: (ctx, data, { before }) => {
          const guild = findGuild(ctx, data.guild_id);
          if (!guild) return null;
          return {
            user: ctx.entities.user(data.user),
            guild,
            member: before as GuildMember | null,
          };
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
    guildOf: ({ channel }) => channel.guild,
    intents: I.Guilds,
    sources: [channel('CHANNEL_CREATE'), channel('THREAD_CREATE')],
  },
  channelUpdate: {
    guildOf: ({ channel }) => channel.guild,
    intents: I.Guilds,
    sources: [channel('CHANNEL_UPDATE'), channel('THREAD_UPDATE')],
  },
  channelDelete: {
    guildOf: ({ channel }) => channel.guild,
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
          return { roleId: data.role_id, guild, role: before as Role };
        },
      },
    ],
  },
};

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && Object.hasOwn(EVENTS, name);
}
