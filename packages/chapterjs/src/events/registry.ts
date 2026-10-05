// Every event user code can listen to. An event is one entry here: its
// name, the gateway events it comes from, the intents that make Discord
// send them, and how to build what the handler receives. Adding an event is
// adding an entry; the router and the loader never change.

import { GatewayIntent } from '../discord/intents.js';
import type { Snowflake } from '../discord/types/common.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
} from '../discord/types/gateway-events.js';
import type {
  Channel,
  GuildChannel,
  TextBasedChannel,
  ThreadChannel,
} from '../structures/channel.js';
import type { Context } from '../structures/context.js';
import type { Guild } from '../structures/guild.js';
import type { GuildMember } from '../structures/member.js';
import type { Message } from '../structures/message.js';
import type { Role } from '../structures/role.js';
import type { User } from '../structures/user.js';

/** What the handler of each event receives. */
export interface EventContexts {
  /** The bot is connected and knows every server it is in. */
  ready: {
    /** The bot itself. */
    user: User;
    /** The servers the bot is in. */
    guilds: ReadonlyMap<Snowflake, Guild>;
  };
  /** A message was sent, in a server or in private. */
  messageCreate: { message: Message };
  /** A message was edited. */
  messageUpdate: { message: Message };
  /** A message was deleted. */
  messageDelete: {
    messageId: Snowflake;
    channelId: Snowflake;
    /** The id of the server; `null` for a private message. */
    guildId: Snowflake | null;
    /** The channel, when the bot knows it. */
    channel: TextBasedChannel | null;
    /** The message as it was, when the bot remembered it. */
    message: Message | null;
  };
  /** Someone joined a server. */
  memberJoin: { member: GuildMember; guild: Guild };
  /** Someone left a server, or was kicked or banned. */
  memberLeave: {
    user: User;
    guild: Guild;
    /** The member as it was, when the bot knew it. */
    member: GuildMember | null;
  };
  /** A member changed: nickname, roles, timeout, avatar... */
  memberUpdate: { member: GuildMember; guild: Guild };
  /** The bot was added to a server. */
  guildJoin: { guild: Guild };
  /** The bot was removed from a server. */
  guildLeave: { guild: Guild };
  /** A channel was created. */
  channelCreate: { channel: GuildChannel | ThreadChannel | Channel };
  /** A channel changed: name, topic, permissions... */
  channelUpdate: { channel: GuildChannel | ThreadChannel | Channel };
  /** A channel was deleted. */
  channelDelete: { channel: GuildChannel | ThreadChannel | Channel };
  /** A role was created. */
  roleCreate: { role: Role; guild: Guild };
  /** A role changed: name, color, permissions, position... */
  roleUpdate: { role: Role; guild: Guild };
  /** A role was deleted. */
  roleDelete: {
    roleId: Snowflake;
    guild: Guild;
    /** The role as it was, when the bot knew it. */
    role: Role | null;
  };
}

export type EventName = keyof EventContexts;

/**
 * What `event()` returns: the default export of an event file.
 */
export interface EventFile {
  readonly handler: (context: never) => unknown;
  /** What the file passed as second argument, not checked yet. */
  readonly options: unknown;
}

/** Options of the events about messages. */
export interface MessageEventOptions {
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
}

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
  /** The intents that make Discord send this event. */
  intents: number;
  /**
   * The options a file can pass to `event()`, with the type of each. An
   * event without this has no options.
   */
  options?: { [Key in keyof OptionsOf<Name>]-?: 'boolean' };
  /**
   * Whether a file wants this occurrence of the event, given its options.
   * Decided per file: two files of the same folder can differ.
   */
  accepts?: (context: EventContexts[Name], options: OptionsOf<Name>) => boolean;
  sources: {
    [E in GatewayDispatchEventName]: Source<Name, E>;
  }[GatewayDispatchEventName][];
}

const I = GatewayIntent;

const guildOf = (ctx: Context, id: Snowflake): Guild | null =>
  ctx.cache.guilds.get(id) ?? null;

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

/** Bots and webhooks only reach the files that asked for them. */
const fromPersonUnlessAsked = (
  context: { message: Message },
  options: MessageEventOptions
): boolean =>
  options.bots === true ||
  (!context.message.author.bot && context.message.webhookId === null);

const message = (
  on: 'MESSAGE_CREATE' | 'MESSAGE_UPDATE'
): Source<'messageCreate' | 'messageUpdate', typeof on> => ({
  on,
  build: (ctx, data) => ({
    message: ctx.entities.message(data, data.guild_id),
  }),
});

const member = (
  on: 'GUILD_MEMBER_ADD' | 'GUILD_MEMBER_UPDATE'
): Source<'memberJoin' | 'memberUpdate', typeof on> => ({
  on,
  build: (ctx, data) => {
    const guild = guildOf(ctx, data.guild_id);
    const found = guild?.members.get(data.user!.id);
    return guild && found ? { member: found, guild } : null;
  },
});

const role = (
  on: 'GUILD_ROLE_CREATE' | 'GUILD_ROLE_UPDATE'
): Source<'roleCreate' | 'roleUpdate', typeof on> => ({
  on,
  build: (ctx, data) => {
    const guild = guildOf(ctx, data.guild_id);
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
    // Without Message Content, the messages of others come empty.
    intents: I.GuildMessages | I.DirectMessages | I.MessageContent,
    options: { bots: 'boolean' },
    accepts: fromPersonUnlessAsked,
    sources: [message('MESSAGE_CREATE')],
  },
  messageUpdate: {
    intents: I.GuildMessages | I.DirectMessages | I.MessageContent,
    options: { bots: 'boolean' },
    accepts: fromPersonUnlessAsked,
    sources: [message('MESSAGE_UPDATE')],
  },
  messageDelete: {
    intents: I.GuildMessages | I.DirectMessages,
    sources: [
      {
        on: 'MESSAGE_DELETE',
        before: (ctx, data) => {
          const found = ctx.cache.channels.get(data.channel_id);
          return found?.isTextBased()
            ? (found.messages.get(data.id) ?? null)
            : null;
        },
        build: (ctx, data, { before }) => {
          const found = ctx.cache.channels.get(data.channel_id);
          return {
            messageId: data.id,
            channelId: data.channel_id,
            guildId: data.guild_id ?? found?.guildId ?? null,
            channel: found?.isTextBased() ? found : null,
            message: before as Message | null,
          };
        },
      },
    ],
  },

  memberJoin: {
    intents: I.GuildMembers,
    sources: [member('GUILD_MEMBER_ADD')],
  },
  memberUpdate: {
    intents: I.GuildMembers,
    sources: [member('GUILD_MEMBER_UPDATE')],
  },
  memberLeave: {
    intents: I.GuildMembers,
    sources: [
      {
        on: 'GUILD_MEMBER_REMOVE',
        before: (ctx, data) =>
          guildOf(ctx, data.guild_id)?.members.get(data.user.id) ?? null,
        build: (ctx, data, { before }) => {
          const guild = guildOf(ctx, data.guild_id);
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
    intents: I.Guilds,
    sources: [
      {
        on: 'GUILD_CREATE',
        build: (ctx, data, { joined }) => {
          const guild = joined ? guildOf(ctx, data.id) : null;
          return guild ? { guild } : null;
        },
      },
    ],
  },
  guildLeave: {
    intents: I.Guilds,
    sources: [
      {
        on: 'GUILD_DELETE',
        before: (ctx, data) => guildOf(ctx, data.id),
        // With `unavailable`, an outage: the bot is still in the server.
        build: (_ctx, data, { before }) =>
          before && !data.unavailable ? { guild: before as Guild } : null,
      },
    ],
  },

  channelCreate: {
    intents: I.Guilds,
    sources: [channel('CHANNEL_CREATE'), channel('THREAD_CREATE')],
  },
  channelUpdate: {
    intents: I.Guilds,
    sources: [channel('CHANNEL_UPDATE'), channel('THREAD_UPDATE')],
  },
  channelDelete: {
    intents: I.Guilds,
    sources: [
      deletedChannel('CHANNEL_DELETE'),
      deletedChannel('THREAD_DELETE'),
    ],
  },

  roleCreate: { intents: I.Guilds, sources: [role('GUILD_ROLE_CREATE')] },
  roleUpdate: { intents: I.Guilds, sources: [role('GUILD_ROLE_UPDATE')] },
  roleDelete: {
    intents: I.Guilds,
    sources: [
      {
        on: 'GUILD_ROLE_DELETE',
        before: (ctx, data) =>
          guildOf(ctx, data.guild_id)?.roles.get(data.role_id) ?? null,
        build: (ctx, data, { before }) => {
          const guild = guildOf(ctx, data.guild_id);
          if (!guild) return null;
          return {
            roleId: data.role_id,
            guild,
            role: before as Role | null,
          };
        },
      },
    ],
  },
};

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && Object.hasOwn(EVENTS, name);
}
