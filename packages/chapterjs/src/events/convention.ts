import type { Convention } from '../loader/loader.js';
import { isEventFile } from './event.js';
import {
  EVENT_NAMES,
  EVENTS,
  isEventName,
  type EventContexts,
  type EventName,
} from './registry.js';

/** One reaction to an event: a file of `src/events/<event>/`. */
export interface EventHandler<Name extends EventName = EventName> {
  /** The event, which is the name of the folder the file is in. */
  readonly name: Name;
  readonly handler: (context: EventContexts[Name]) => unknown;
  /** The options the file gave to `event()`, checked. */
  readonly options: Readonly<Record<string, unknown>>;
}

/** Checks the second argument of `event()` against what the event accepts. */
function readOptions(
  name: EventName,
  options: unknown
): Readonly<Record<string, unknown>> {
  if (options === undefined) return Object.freeze({});
  const allowed: Record<string, 'boolean' | readonly string[]> =
    EVENTS[name].options ?? {};
  const names = Object.keys(allowed);
  const first = names[0];
  const kind = first === undefined ? undefined : allowed[first];
  const example =
    first === undefined
      ? 'option: true'
      : `${first}: ${kind === 'boolean' || !kind ? 'true' : `'${kind.at(-1)}'`}`;
  const list =
    names.length === 0
      ? `${name} has no options: remove the second argument of event().`
      : `Options of ${name} are: ${names.join(', ')}.`;
  if (
    typeof options !== 'object' ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new TypeError(
      `The second argument of event() is its options, like { ${example} }. ${list}`
    );
  }
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(allowed, key)) {
      throw new TypeError(`"${key}" is not an option of ${name}. ${list}`);
    }
    const kind = allowed[key]!;
    const got = JSON.stringify(value) ?? typeof value;
    if (kind === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new TypeError(
          `The option ${key} of ${name} is true or false, got ${got}.`
        );
      }
    } else if (!kind.includes(value as string)) {
      throw new TypeError(
        `The option ${key} of ${name} is ${kind
          .map(word => `'${word}'`)
          .join(', ')
          .replace(/, ([^,]*)$/, ' or $1')}, got ${got}.`
      );
    }
  }
  return Object.freeze({ ...options });
}

/** " Did you mean "x"?" when a name is close to a real one. */
function suggest(name: string): string {
  const wanted = name.toLowerCase().replace(/[^a-z]/g, '');
  if (wanted === '') return '';
  const close = EVENT_NAMES.find(event => {
    const real = event.toLowerCase();
    return real === wanted || real.includes(wanted) || wanted.includes(real);
  });
  return close ? ` Did you mean "${close}"?` : '';
}

/**
 * `src/events/`: one folder per event, named after it, and in it one file
 * per reaction. The name of a file is free; it exports by default what
 * `event()` returns:
 *
 * ```ts
 * // src/events/memberJoin/welcome.ts
 * import { event } from 'chapterjs';
 *
 * export default event(async ({ member, guild }) => {
 *   await member.send(`Welcome to ${guild.name}!`);
 * });
 * ```
 */
export const eventsConvention: Convention<EventHandler> = {
  folder: 'events',
  one: 'event',
  many: 'events',
  /** The event of a file, from its path: known without running the file. */
  check(path) {
    const parts = path.split('/');
    if (parts.length < 2) {
      throw new TypeError(
        `This file is directly in src/events/. Put it in a folder named after the event it reacts to, like src/events/messageCreate/${path}. Events are: ${EVENT_NAMES.join(', ')}.`
      );
    }
    const name = parts[0]!;
    if (!isEventName(name)) {
      throw new TypeError(
        `The folder src/events/${name} is not named after an event.${suggest(name)} Events are: ${EVENT_NAMES.join(', ')}.`
      );
    }
  },
  read(exports, path) {
    const name = path.split('/')[0] as EventName;
    const file = exports.default;
    if (!isEventFile(file)) {
      const example = `import { event } from 'chapterjs'; export default event(({ ... }) => { ... })`;
      throw new TypeError(
        'default' in exports
          ? `The default export of this file must be what event() returns: ${example}`
          : `This file has no default export. It should look like: ${example}`
      );
    }
    return Object.freeze({
      name,
      handler: file.handler as EventHandler['handler'],
      options: readOptions(name, file.options),
    });
  },
};
