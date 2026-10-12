// What a structure waits for: the options of `channel.waitForMessage()`,
// `channel.collectMessages()`, `message.waitForClick()` and
// `message.waitForReaction()`, checked, and turned into the test a wait of
// `waiting/` runs on what the bot offers it.

import type { Snowflake } from '../discord/types/common.js';
import type { Duration } from '../commands/command.js';
import type { ButtonDeclaration } from '../components/button.js';
import type { SelectDeclaration } from '../components/select.js';
import { DURATION_EXAMPLE, parseDuration } from '../util/duration.js';
import type { WaitKind } from '../waiting/waiters.js';
import { ctxOf } from './base.js';
import type { Context } from './context.js';
import type { ComponentInteraction } from './interaction.js';
import type { GuildMember } from './member.js';
import type { Message, ReactionEmoji } from './message.js';
import type { User } from './user.js';

/** A person, as a wait takes it: a user, a member, or an id. */
export type PersonInput = User | GuildMember | Snowflake;

/** What `channel.waitForMessage()` takes. */
export interface WaitForMessageOptions {
  /** Only a message of this person. Anyone but a bot by default. */
  from?: PersonInput;
  /**
   * Only a message that says this: a text (the same, whatever the capitals
   * and the spaces around), a regular expression, or a function of the
   * message.
   */
  matches?: string | RegExp | ((message: Message) => boolean);
  /**
   * How long to wait: `'30s'`, `'2m'`. One minute by default, a second at
   * least, a day at most.
   */
  within?: Duration;
}

/** What `channel.collectMessages()` takes. */
export interface CollectMessagesOptions extends WaitForMessageOptions {
  /** Stops once this many messages came. No limit by default: until `within`. */
  max?: number;
}

/** What `message.waitForClick()` takes. */
export interface WaitForClickOptions {
  /** Only a click of this person. Anyone by default. */
  from?: PersonInput;
  /** How long to wait: `'30s'`, `'2m'`. One minute by default. */
  within?: Duration;
}

/** What `message.waitForReaction()` takes. */
export interface WaitForReactionOptions {
  /** Only a reaction of this person. Anyone but a bot by default. */
  from?: PersonInput;
  /**
   * Only this emoji: a standard one (`'👍'`), or a custom one by its name,
   * its id or as Discord writes it (`'<:party:123>'`).
   */
  emoji?: string;
  /** How long to wait: `'30s'`, `'2m'`. One minute by default. */
  within?: Duration;
}

/** A click on a button or a menu of a message, as `waitForClick()` gives it. */
export interface Click {
  /**
   * The click itself: answer it as in the `run` of a button, with
   * `update()`, `reply()` or `deferUpdate()`. Without an answer within 2
   * seconds, the bot changes nothing on screen for you (`deferUpdate()`).
   */
  readonly interaction: ComponentInteraction;
  /** Who clicked. */
  readonly user: User;
  /** Who clicked, as a member of the server; `null` in a private message. */
  readonly member: GuildMember | null;
  /** The name of the button or menu: the name of its export. */
  readonly name: string;
  /** The data the button or menu carries. */
  readonly data: Readonly<Record<string, string | number | boolean>>;
  /**
   * What was picked in a menu: the values of a menu of texts, the ids of
   * the people, roles or channels of the others. Empty for a button.
   */
  readonly values: readonly string[];
  /** Whether it is this button or this menu. */
  is(component: ButtonDeclaration<never> | SelectDeclaration<never>): boolean;
}

/** A reaction added to a message, as `waitForReaction()` gives it. */
export interface WaitedReaction {
  /** The emoji. */
  readonly emoji: ReactionEmoji;
  /** Who reacted. */
  readonly user: User;
  /** Who reacted, as a member of the server; `null` in a private message. */
  readonly member: GuildMember | null;
}

/** What the bot offers the waits for a click: `components/router.ts` builds it. */
export interface OfferedClick extends Click {
  readonly messageId: Snowflake;
}

/** What the bot offers the waits for a reaction: `core/bot.ts` builds it. */
export interface OfferedReaction extends WaitedReaction {
  readonly messageId: Snowflake;
}

/** One minute: how long a wait lasts when the file does not say. */
const DEFAULT_WITHIN = 60_000;
const MIN_WITHIN = 1_000;
/** A day: longer would be lost by any restart anyway. */
const MAX_WITHIN = 86_400_000;

/** The milliseconds of `within`, checked. */
export function readWithin(within: unknown): number {
  if (within === undefined) return DEFAULT_WITHIN;
  const ms = typeof within === 'string' ? parseDuration(within) : null;
  if (ms === null) {
    throw new TypeError(
      `"within" is how long to wait, a duration (${DURATION_EXAMPLE}): got ${JSON.stringify(within) ?? typeof within}.`
    );
  }
  if (ms < MIN_WITHIN || ms > MAX_WITHIN) {
    throw new RangeError(
      `"within" is ${JSON.stringify(within)}: a wait lasts between 1 second and 1 day.`
    );
  }
  return ms;
}

/** The id of a person a wait is given, checked. */
export function personId(from: unknown): Snowflake | undefined {
  if (from === undefined) return undefined;
  if (typeof from === 'string' && /^\d+$/.test(from)) return from;
  if (
    typeof from === 'object' &&
    from !== null &&
    typeof (from as { id?: unknown }).id === 'string'
  ) {
    return (from as { id: string }).id;
  }
  throw new TypeError(
    `"from" is the person to wait for: a user, a member or their id, got ${JSON.stringify(from) ?? typeof from}.`
  );
}

/** Whether a message says what `matches` asks. */
export function readMatches(matches: unknown): (message: Message) => boolean {
  if (matches === undefined) return () => true;
  if (typeof matches === 'string') {
    const wanted = matches.trim().toLowerCase();
    return message => message.content.trim().toLowerCase() === wanted;
  }
  if (matches instanceof RegExp) {
    // A global or sticky expression keeps where it stopped: test from the start.
    return message => {
      matches.lastIndex = 0;
      return matches.test(message.content);
    };
  }
  if (typeof matches === 'function') {
    return message =>
      (matches as (message: Message) => unknown)(message) === true;
  }
  throw new TypeError(
    `"matches" is a text, a regular expression or a function of the message, like matches: 'paris' or matches: /^paris$/i.`
  );
}

/** Whether an emoji is the one `emoji` names. */
export function readEmoji(emoji: unknown): (given: ReactionEmoji) => boolean {
  if (emoji === undefined) return () => true;
  if (typeof emoji !== 'string' || emoji.trim() === '') {
    throw new TypeError(
      `"emoji" is the emoji to wait for: '👍', or a custom one by its name, its id or as '<:name:id>'.`
    );
  }
  const custom = /^<a?:(\w+):(\d+)>$/.exec(emoji.trim());
  const wanted = custom ? custom[2]! : emoji.trim();
  return given => given.id === wanted || given.name === wanted;
}

/** The waits of the bot, or why there are none. */
export function waitersOf(structure: object): NonNullable<Context['waiters']> {
  const { waiters } = ctxOf(structure as never);
  if (!waiters) {
    throw new Error(
      'Waiting for what comes next only works in a running bot: in a command, an event, a component or a task.'
    );
  }
  return waiters;
}

/** Waits for what fits, `max` at most: what was taken, in order. */
export function waitFor<T>(
  structure: object,
  kind: WaitKind,
  match: (offered: T) => boolean,
  within: number,
  max = 1
): Promise<T[]> {
  return waitersOf(structure).wait<T>({
    kind,
    match: offered => match(offered as T),
    max,
    within,
  });
}
