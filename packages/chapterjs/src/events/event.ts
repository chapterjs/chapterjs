// `event()`, as user files import it from 'chapterjs'. Its type here is the
// loose one; in each event folder of a project, the generated types give it
// the one of that event (see `types.ts`).

import type { EventFile } from './registry.js';

const BRAND = Symbol.for('chapterjs.event');

/**
 * Says what to do when an event happens. Export the result as the default
 * export of a file of `src/events/<event>/`: the folder says which event.
 */
export function event(
  handler: (context: never) => unknown,
  options?: unknown
): EventFile {
  if (typeof handler !== 'function') {
    throw new TypeError(
      'event() needs the function to run when the event happens: export default event(({ ... }) => { ... })'
    );
  }
  return Object.freeze({ [BRAND]: true, handler, options });
}

/** Whether a value was made by `event()`. */
export function isEventFile(value: unknown): value is EventFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
