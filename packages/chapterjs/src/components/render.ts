// Turns the `components` of a message into what Discord receives: rows made
// by themselves, the whole checked against the limits of a message, and
// whether the message is built with components only (Components V2).

import { Limits } from '../discord/api.js';
import {
  ComponentType,
  type RawComponent,
} from '../discord/types/component.js';
import { renderedOf, type Rendered } from './instance.js';
import { autoRows } from './layout.js';

export interface RenderedComponents {
  raw: RawComponent[];
  /** Whether the message needs the IS_COMPONENTS_V2 flag. */
  v2: boolean;
}

/** Every component of a tree, the nested ones included. */
function count(components: readonly RawComponent[]): number {
  let total = 0;
  for (const component of components) {
    total += 1;
    if ('components' in component && Array.isArray(component.components)) {
      total += count(component.components as RawComponent[]);
    }
    if ('accessory' in component) total += 1;
  }
  return total;
}

/** The characters of every text of a tree. */
function textLength(components: readonly RawComponent[]): number {
  let total = 0;
  for (const component of components) {
    if (component.type === ComponentType.TextDisplay) {
      total += component.content.length;
    } else if (
      'components' in component &&
      Array.isArray(component.components)
    ) {
      total += textLength(component.components as RawComponent[]);
    }
  }
  return total;
}

/**
 * The components of a message, as Discord takes them.
 * @see https://docs.discord.com/developers/components/reference#component-object
 */
export function renderComponents(
  components: readonly unknown[]
): RenderedComponents {
  if (!Array.isArray(components)) {
    throw new TypeError(
      `The components of a message are a list, got ${typeof components}.`
    );
  }
  const pieces: Rendered[] = components.map((component, index) =>
    renderedOf(component, `Component ${index + 1} of the message`)
  );
  const rows = autoRows(pieces, 'a message');
  const v2 = rows.some(one => one.kind !== 'row');
  const raw = rows.map(one => one.raw as RawComponent);
  const total = count(raw);
  if (total > Limits.MessageComponents) {
    throw new RangeError(
      `The message has ${total} components once its rows are made: Discord accepts ${Limits.MessageComponents} at most.`
    );
  }
  const characters = textLength(raw);
  if (characters > Limits.TextDisplayTotal) {
    throw new RangeError(
      `The texts of the components of the message add up to ${characters} characters: Discord accepts ${Limits.TextDisplayTotal} at most.`
    );
  }
  return { raw, v2 };
}
