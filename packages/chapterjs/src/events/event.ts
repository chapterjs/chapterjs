// `event()`, as user files import it from 'chapterjs': what to do when
// something happens on Discord. The `name` of the event types the rest: what
// `run` receives, and the options the event has.

import type { ContextOf, EventName, OptionsOf } from './registry.js';

/** The options written next to `name` and `run`, as written. */
type OptionsWritten<Options> = {
  [
    Key in keyof Options as Key extends 'name' | 'run' ? never : Key
  ]: Options[Key];
};

/**
 * What a file gives to `event()`: the event, its options when it has
 * some, and what to do. What `run` receives follows the options: what an
 * option lets through is only there to handle when the option is on.
 */
export type EventConfig<
  Name extends EventName = EventName,
  Options extends object = {},
> = {
  /** The event to react to: `'messageCreate'`, `'memberJoin'`... */
  name: Name;
  /** What to do when the event happens. */
  run: (context: ContextOf<Name, OptionsWritten<Options>>) => unknown;
} & Partial<OptionsOf<Name>> & {
    // What the file wrote, key by key: `name` and `run` are typed above,
    // an option is kept as written (so it narrows what `run` receives),
    // and anything else is refused.
    [Key in keyof Options]: Key extends 'name' | 'run'
      ? unknown
      : Key extends keyof OptionsOf<Name>
        ? Options[Key]
        : never;
  };

/** What `event()` returns: a declaration the framework finds in the exports of a file. */
export interface EventDeclaration<Name extends EventName = EventName> {
  /** What the file gave to `event()`, not checked yet. */
  readonly config: EventConfig<Name, never>;
}

const BRAND = Symbol.for('chapterjs.event');

/**
 * Declares what to do when an event happens. Export the result from any
 * file of `src/`; `name` says which event, and types what `run` receives:
 *
 * ```ts
 * import { event } from 'chapterjs';
 *
 * export const welcome = event({
 *   name: 'memberJoin',
 *   async run({ member, guild }) {
 *     await member.send(`Welcome to ${guild.name}!`);
 *   },
 * });
 * ```
 *
 * Some events have options, written next to `name` (`bots: true`, `where:
 * 'dm'`): what `run` receives follows them.
 */
export function event<
  Name extends EventName,
  const Options extends Partial<OptionsOf<Name>> & object = {},
>(config: EventConfig<Name, Options>): EventDeclaration<Name> {
  return Object.freeze({
    [BRAND]: true,
    config,
  }) as unknown as EventDeclaration<Name>;
}

/** Whether a value was made by `event()`. */
export function isEventDeclaration(value: unknown): value is EventDeclaration {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
