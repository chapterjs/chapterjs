// What every interactive component of `src/components/` shares: where it
// works, who may use it, what it carries, and what its `run` receives
// about the place it was used in.

import type {
  DMChannel,
  GuildTextBasedChannel,
} from '../structures/channel.js';
import type { Guild } from '../structures/guild.js';
import type { Interaction } from '../structures/interaction.js';
import type { GuildMember } from '../structures/member.js';
import type { Message } from '../structures/message.js';
import type { User } from '../structures/user.js';
import type { DataShape, DataValuesOf } from './custom-id.js';

/**
 * Where a component can be used: in messages of servers (`'guild'`), in
 * private messages with the bot (`'dm'`), or in both. A component is where
 * the message that holds it is: this says where your code expects it.
 */
export type ComponentWhere = 'guild' | 'dm' | 'both';

/**
 * Who may use a component: `'everyone'` who sees the message (the
 * default), or only the `'author'`, the person who used the command the
 * message answers. Anyone else gets a private refusal.
 */
export type ComponentWho = 'everyone' | 'author';

/** What every interactive component declares, besides what it looks like. */
export interface InteractiveConfig<
  Data extends DataShape,
  Where extends ComponentWhere,
> {
  /**
   * What the component carries from the message that shows it to the code
   * that runs when it is used: a name and a kind for each value
   * (`{ userId: 'string', page: 'number' }`). Given when the component is
   * put in a message, received typed in `run`. Discord keeps it in the
   * component itself, so it survives restarts.
   */
  data?: Data;
  /**
   * Where the component can be used: `'guild'` (in servers, the default),
   * `'dm'` (in private messages with the bot) or `'both'`. What `run`
   * receives follows it.
   */
  where?: Where;
  /**
   * Who may use it: `'everyone'` (the default) or only the `'author'` of
   * the command the message answers.
   */
  who?: ComponentWho;
  /** Make the answers of the component only visible to who used it. */
  ephemeral?: boolean;
}

/** A server, as an interaction used in one sees it. */
export type InGuild<I extends Interaction> = I & {
  readonly guildId: string;
  readonly guild: Guild;
  readonly member: GuildMember;
  readonly channel: GuildTextBasedChannel;
};

/** A private message, for something that also works in servers. */
export type InPrivate<I extends Interaction> = I & {
  readonly guildId: null;
  readonly guild: null;
  readonly member: null;
  readonly channel: DMChannel;
};

/** A private message, for something that only works there: no server at all. */
export type InDm<I extends Interaction> = Omit<
  I,
  'guildId' | 'guild' | 'member' | 'channel'
> & {
  readonly channel: DMChannel;
};

/** What `run` receives about the place, in a server. */
export interface PlaceInGuild<I extends Interaction> {
  interaction: InGuild<I>;
  /** The server it was used in. */
  guild: Guild;
  /** Who used it, as a member of the server. */
  member: GuildMember;
  /** The channel it was used in. */
  channel: GuildTextBasedChannel;
}

/** What `run` receives about the place, in a private message, when it also works in servers. */
export interface PlaceInPrivate<I extends Interaction> {
  interaction: InPrivate<I>;
  /** No server: it was used in a private message. */
  guild: null;
  /** No member: the person is `user`. */
  member: null;
  /** The private conversation it was used in. */
  channel: DMChannel;
}

/** What `run` receives about the place, when it only works in private messages. */
export interface PlaceInDm<I extends Interaction> {
  interaction: InDm<I>;
  /** The private conversation it was used in. */
  channel: DMChannel;
}

/** What `run` receives about where it was used, following `where`. */
export type PlaceOf<
  Where extends ComponentWhere,
  I extends Interaction,
> = Where extends 'guild'
  ? PlaceInGuild<I>
  : Where extends 'dm'
    ? PlaceInDm<I>
    : PlaceInGuild<I> | PlaceInPrivate<I>;

/** What every interactive component gives to its `run`, besides the place. */
export interface InteractiveContext<Data extends DataShape> {
  /** Who used it. */
  user: User;
  /** The message the component is on. */
  message: Message;
  /** What the component carries, as declared in `data`. */
  data: DataValuesOf<Data>;
}
