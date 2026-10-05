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
      folder: `src/events/${name}`,
      declarations: `import type { EventContexts, EventFile${hasOptions ? ', EventOptions' : ''} } from '#chapterjs';

/**
 * Says what to do when \`${name}\` happens. Export the result as the default
 * export of a file of src/events/${name}/.
 */
export declare function event(
  handler: (context: EventContexts['${name}']) => unknown${hasOptions ? `,\n  options?: EventOptions['${name}']` : ''}
): EventFile;
`,
    };
  });
}
