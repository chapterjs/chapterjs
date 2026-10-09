// What a file declares with `event()`, checked when it loads: the event
// exists, the options are the ones of that event, `run` is a function. A
// mistake is explained before the bot even connects.

import type { Declaration } from '../loader/loader.js';
import { isEventDeclaration } from './event.js';
import {
  EVENT_NAMES,
  EVENTS,
  isEventName,
  type EventContexts,
  type EventName,
} from './registry.js';

/** One reaction to an event, as a file declares it. */
export interface EventHandler<Name extends EventName = EventName> {
  /** The event. */
  readonly name: Name;
  readonly handler: (context: EventContexts[Name]) => unknown;
  /** The options the file gave to `event()`, checked. */
  readonly options: Readonly<Record<string, unknown>>;
}

const fail: (message: string) => never = message => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Checks the options written next to `name` against what the event accepts. */
function readOptions(
  name: EventName,
  options: Record<string, unknown>
): Readonly<Record<string, unknown>> {
  const allowed: Record<string, 'boolean' | readonly string[]> =
    EVENTS[name].options ?? {};
  const names = Object.keys(allowed);
  const list =
    names.length === 0
      ? `${name} has no options: an event has a name, a run function, and nothing else.`
      : `Options of ${name} are: ${names.join(', ')}.`;
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(allowed, key)) {
      fail(`"${key}" is not an option of ${name}. ${list}`);
    }
    const kind = allowed[key]!;
    const got = JSON.stringify(value) ?? typeof value;
    if (kind === 'boolean') {
      if (typeof value !== 'boolean') {
        fail(`The option ${key} of ${name} is true or false, got ${got}.`);
      }
    } else if (!kind.includes(value as string)) {
      fail(
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

const EXAMPLE = `event({ name: 'messageCreate', run({ message }) { ... } })`;

/**
 * An event, declared anywhere in `src/` with `event()`: its `name` is the
 * event, the rest its options and what to do. A file may declare several,
 * of the same event or not.
 */
export const eventDeclaration: Declaration<EventHandler> = {
  one: 'event',
  many: 'events',
  is: isEventDeclaration,
  list: true,
  read(value) {
    const { config } = value as { config: unknown };
    if (!isRecord(config)) {
      return fail(`event() needs an object: ${EXAMPLE}`);
    }
    const { name, run, ...options } = config;
    if (name === undefined) {
      fail(
        `This event has no "name": the event to react to, like ${EXAMPLE}. Events are: ${EVENT_NAMES.join(', ')}.`
      );
    }
    if (!isEventName(name)) {
      fail(
        `${JSON.stringify(name) ?? typeof name} is not an event.${typeof name === 'string' ? suggest(name) : ''} Events are: ${EVENT_NAMES.join(', ')}.`
      );
    }
    if (typeof run !== 'function') {
      fail(
        `This ${name} event has no "run": the function to run when it happens, like ${EXAMPLE}`
      );
    }
    return Object.freeze({
      name,
      handler: run as EventHandler['handler'],
      options: readOptions(name, options),
    });
  },
};
