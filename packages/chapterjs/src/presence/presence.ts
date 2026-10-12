// `presence()`, as user files import it from 'chapterjs': what the bot
// shows under its name, its status and what it is doing.
// https://docs.discord.com/developers/events/gateway-events#update-presence

import type { Duration } from '../commands/command.js';
import type { TranslationContext } from '../messages/messages.js';

/**
 * The status of the bot: `'online'` (green), `'idle'` (orange), `'dnd'`
 * (red, "do not disturb") or `'invisible'` (shown as offline).
 */
export type PresenceStatusName = 'online' | 'idle' | 'dnd' | 'invisible';

/**
 * What the bot is doing, as Discord shows it: "Playing {name}",
 * "Listening to {name}", "Watching {name}", "Competing in {name}", or
 * the text itself with `'custom'`.
 */
export type ActivityKind =
  'playing' | 'listening' | 'watching' | 'competing' | 'custom';

/**
 * What a presence function receives, each time it runs: how many servers
 * the bot is in, and the texts of the language files in the default
 * language.
 */
export type PresenceContext = {
  /** How many servers the bot is in, all processes together. */
  guilds: number;
} & TranslationContext;

/**
 * The text of an activity: a text, or a function that gives it (maybe
 * after a promise), run each time the activity is shown.
 */
export type ActivityText =
  string | ((context: PresenceContext) => string | Promise<string>);

interface ActivityBase {
  /**
   * How long the activity is shown before the next one, at least 5
   * seconds: `'30s'`, `'2m'`. 30 seconds by default. Alone, it is how
   * often a `name` that is a function runs again.
   */
  for?: Duration;
}

/** An activity that is not a stream. */
export interface PlainActivity extends ActivityBase {
  type: ActivityKind;
  /** What is shown after the type (or alone with `'custom'`). */
  name: ActivityText;
  url?: never;
}

/** A stream: "Streaming {name}", with a link to it. */
export interface StreamingActivity extends ActivityBase {
  type: 'streaming';
  /** What is shown after "Streaming". */
  name: ActivityText;
  /** The stream: Discord only accepts a `https://twitch.tv/` or a `https://youtube.com/` link. */
  url: string;
}

/** What the bot is doing. */
export type Activity = PlainActivity | StreamingActivity;

/**
 * The activities shown in turn: a list, or a function that gives it (maybe
 * after a promise, from a store for example), run again each time the
 * list has been shown in full.
 */
export type Activities =
  | readonly Activity[]
  | ((
      context: PresenceContext
    ) => readonly Activity[] | Promise<readonly Activity[]>);

interface PresenceBase {
  /** The status of the bot. `'online'` by default. */
  status?: PresenceStatusName;
}

/** A presence with one activity, or none. */
export interface SinglePresenceConfig extends PresenceBase {
  /** What the bot is doing. Nothing by default. */
  activity?: Activity;
  activities?: never;
}

/** A presence whose activities are shown in turn. */
export interface RotatingPresenceConfig extends PresenceBase {
  activity?: never;
  /**
   * Several activities, shown one after the other, each for its `for`: a
   * list, or a function that gives it.
   */
  activities: Activities;
}

/**
 * What a file gives to `presence()`: `activity` for one, or `activities`
 * for several shown in turn.
 */
export type PresenceConfig = SinglePresenceConfig | RotatingPresenceConfig;

/** What `presence()` returns: a declaration the framework finds in the exports of a file. */
export interface PresenceDeclaration {
  /** What the file gave to `presence()`, not checked yet. */
  readonly config: unknown;
}

const BRAND = Symbol.for('chapterjs.presence');

/**
 * Declares the presence of the bot: its status and what it is doing, shown
 * under its name. Export the result from any file of `src/`, once; the bot
 * has it as soon as it is connected.
 *
 * ```ts
 * import { presence } from 'chapterjs';
 *
 * export default presence({
 *   status: 'online',
 *   activity: { type: 'watching', name: 'over the server' },
 * });
 * ```
 *
 * Several activities, shown in turn, each for its own time:
 *
 * ```ts
 * export default presence({
 *   activities: [
 *     { type: 'watching', name: 'the tickets', for: '30s' },
 *     { type: 'playing', name: ({ guilds }) => `on ${guilds} servers`, for: '1m' },
 *   ],
 * });
 * ```
 */
export function presence(config: PresenceConfig): PresenceDeclaration {
  return Object.freeze({ [BRAND]: true, config });
}

/** Whether a value was made by `presence()`. */
export function isPresenceDeclaration(
  value: unknown
): value is PresenceDeclaration {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
