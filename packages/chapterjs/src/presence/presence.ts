// `presence()`, as `src/presence.ts` imports it from 'chapterjs': what the
// bot shows under its name, its status and what it is doing.
// https://docs.discord.com/developers/events/gateway-events#update-presence

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

/** An activity that is not a stream. */
export interface PlainActivity {
  type: ActivityKind;
  /** What is shown after the type (or alone with `'custom'`). */
  name: string;
  url?: never;
}

/** A stream: "Streaming {name}", with a link to it. */
export interface StreamingActivity {
  type: 'streaming';
  /** What is shown after "Streaming". */
  name: string;
  /** The stream: Discord only accepts a `https://twitch.tv/` or a `https://youtube.com/` link. */
  url: string;
}

/** What the bot is doing. */
export type Activity = PlainActivity | StreamingActivity;

/** What `src/presence.ts` gives to `presence()`. */
export interface PresenceConfig {
  /** The status of the bot. `'online'` by default. */
  status?: PresenceStatusName;
  /** What the bot is doing. Nothing by default. */
  activity?: Activity;
}

/** What `presence()` returns: the default export of `src/presence.ts`. */
export interface PresenceFile {
  /** What the file gave to `presence()`, not checked yet. */
  readonly config: unknown;
}

const BRAND = Symbol.for('chapterjs.presence');

/**
 * Declares the presence of the bot: its status and what it is doing, shown
 * under its name. Export the result as the default export of
 * `src/presence.ts`; the bot has it as soon as it is connected.
 *
 * ```ts
 * import { presence } from 'chapterjs';
 *
 * export default presence({
 *   status: 'online',
 *   activity: { type: 'watching', name: 'over the server' },
 * });
 * ```
 */
export function presence(config: PresenceConfig): PresenceFile {
  return Object.freeze({ [BRAND]: true, config });
}

/** Whether a value was made by `presence()`. */
export function isPresenceFile(value: unknown): value is PresenceFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
