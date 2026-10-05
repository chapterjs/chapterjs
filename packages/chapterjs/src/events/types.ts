import type { TypedFolder } from '../loader/generated.js';
import { EVENT_NAMES, EVENTS } from './registry.js';

/**
 * One typed folder per event: in `src/events/<event>/`, the `event()`
 * imported from 'chapterjs' gives its handler what that event gives.
 * Written for every event, so a new folder is typed as soon as it exists.
 */
export function eventTypedFolders(): TypedFolder[] {
  return EVENT_NAMES.map(name => {
    const hasOptions = EVENTS[name].options !== undefined;
    return {
      id: `events.${name}`,
      // At any depth: the event folder may be inside `(group)` folders.
      folder: `src/events/**/${name}`,
      declarations: hasOptions
        ? `import type { ContextOf, EventFile, EventOptions } from '#chapterjs';

/**
 * Says what to do when \`${name}\` happens. Export the result as the default
 * export of a file of src/events/${name}/.
 *
 * What the function receives follows the options: what an option lets
 * through is only there to handle in the files that turn it on.
 */
export declare function event<
  const Options extends EventOptions['${name}'] = {},
>(
  handler: (context: ContextOf<'${name}', Options>) => unknown,
  // The options of the event come first so editors offer them; the rest
  // makes a misspelled option an error instead of something ignored.
  options?: EventOptions['${name}'] &
    Options & {
      [Key in Exclude<keyof Options, keyof EventOptions['${name}']>]: never;
    }
): EventFile;
`
        : `import type { EventContexts, EventFile } from '#chapterjs';

/**
 * Says what to do when \`${name}\` happens. Export the result as the default
 * export of a file of src/events/${name}/.
 */
export declare function event(
  handler: (context: EventContexts['${name}']) => unknown
): EventFile;
`,
    };
  });
}
