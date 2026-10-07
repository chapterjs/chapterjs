// The options of a select menu, a radio group or a checkbox group, as files
// declare them: a list of texts, an object from what is shown to what the
// code receives, or a list of objects with a description and an emoji.
// Written once for the three.

import { Limits } from '../discord/api.js';
import type { RawSelectOption } from '../discord/types/component.js';
import type { EmojiInput } from '../structures/message.js';
import { emojiOf } from './instance.js';
import type { DataShape } from './custom-id.js';
import {
  isDynamic,
  resolveText,
  type DynamicText,
  type TextContext,
} from './component.js';

/** One option of a menu, with everything Discord shows for it. */
export interface RichOption<Data extends DataShape = DataShape> {
  /** What the person sees (100 characters at most): a text, or a function of `t` and the data. */
  label: DynamicText<Data>;
  /** What your code receives (100 characters at most). */
  value: string;
  /** A second line under the label (100 characters at most): a text, or a function of `t` and the data. */
  description?: DynamicText<Data>;
  /** An emoji before the label. */
  emoji?: EmojiInput;
  /** Shows the option as picked when the menu appears. */
  default?: boolean;
}

/**
 * The options of a menu: a list of texts (each is shown and received as
 * is), an object whose keys are what is shown and values what your code
 * receives, or a list of `RichOption` for descriptions and emojis.
 */
export type SelectOptions<Data extends DataShape = DataShape> =
  | readonly string[]
  | Readonly<Record<string, string>>
  | readonly RichOption<Data>[];

/** An option as a file declared it, its texts maybe computed when sent. */
export type LoadedOption = Omit<RawSelectOption, 'label' | 'description'> & {
  label: DynamicText;
  description?: DynamicText;
};

/** The options as Discord takes them, their texts computed for who reads. */
export function resolveOptions(
  what: string,
  options: readonly LoadedOption[],
  context: TextContext
): RawSelectOption[] {
  return options.map((option, index) => {
    const { label, description, ...rest } = option;
    const resolved = resolveText(
      `The label of option ${index + 1} of ${what}`,
      label,
      context,
      { max: Limits.SelectOptionText }
    )!;
    const second = resolveText(
      `The description of option ${index + 1} of ${what}`,
      description,
      context,
      { max: Limits.SelectOptionText }
    );
    return {
      ...rest,
      label: resolved,
      ...(second !== undefined ? { description: second } : {}),
    };
  });
}

/** Whether a text of an option is computed when the message is sent. */
export const hasDynamicOption = (options: readonly LoadedOption[]): boolean =>
  options.some(
    option => isDynamic(option.label) || isDynamic(option.description)
  );

/** What `run` receives for one picked option, typed from the declaration. */
export type OptionValue<Options extends SelectOptions> =
  Options extends readonly (infer Item)[]
    ? Item extends string
      ? Item
      : Item extends { value: infer Value extends string }
        ? Value
        : never
    : Options extends Readonly<Record<string, infer Value extends string>>
      ? Value
      : never;

const fail = (message: string): never => {
  throw new TypeError(message);
};

/** Checks the options of a menu and returns them as Discord takes them. */
export function readOptions(
  what: string,
  options: unknown,
  { min = 1, max = Limits.SelectOptions }: { min?: number; max?: number } = {}
): LoadedOption[] {
  const example = `options: ['Pizza', 'Pasta'], options: { 'Shown text': 'value' } or options: [{ label: '...', value: '...', description: '...' }]`;
  let list: LoadedOption[];
  if (Array.isArray(options)) {
    list = options.map((item: unknown, index) => {
      if (typeof item === 'string') return { label: item, value: item };
      if (typeof item !== 'object' || item === null) {
        return fail(
          `Option ${index + 1} of ${what} is a text or an object like { label: '...', value: '...' }, got ${item === null ? 'null' : typeof item}.`
        );
      }
      const rich = item as Record<string, unknown>;
      for (const key of Object.keys(rich)) {
        if (
          !['label', 'value', 'description', 'emoji', 'default'].includes(key)
        ) {
          fail(
            `"${key}" is not something an option of ${what} has. It can have: label, value, description, emoji, default.`
          );
        }
      }
      if (
        (typeof rich.label !== 'string' && !isDynamic(rich.label)) ||
        typeof rich.value !== 'string'
      ) {
        fail(
          `Option ${index + 1} of ${what} needs a label and a value, both texts.`
        );
      }
      const option: LoadedOption = {
        label: rich.label as DynamicText,
        value: rich.value as string,
      };
      if (rich.description !== undefined) {
        if (
          typeof rich.description !== 'string' &&
          !isDynamic(rich.description)
        )
          fail(`The description of option ${index + 1} of ${what} is a text.`);
        option.description = rich.description as DynamicText;
      }
      if (rich.emoji !== undefined)
        option.emoji = emojiOf(
          rich.emoji as EmojiInput,
          `option ${index + 1} of ${what}`
        );
      if (rich.default !== undefined) {
        if (typeof rich.default !== 'boolean')
          fail(`"default" of option ${index + 1} of ${what} is true or false.`);
        if (rich.default) option.default = true;
      }
      return option;
    });
  } else if (typeof options === 'object' && options !== null) {
    list = Object.entries(options).map(([label, value]) => {
      if (typeof value !== 'string') {
        return fail(
          `The option ${JSON.stringify(label)} of ${what} must be a text (what your code receives), got ${JSON.stringify(value) ?? typeof value}.`
        );
      }
      return { label, value };
    });
  } else {
    return fail(`${what} needs its options: ${example}.`);
  }
  if (list.length < min || list.length > max) {
    fail(
      `${what} has ${list.length} options: Discord accepts between ${min} and ${max}.`
    );
  }
  const values = new Set<string>();
  for (const option of list) {
    for (const [field, text] of [
      ['label', option.label],
      ['value', option.value],
      ['description', option.description],
    ] as const) {
      // A function is checked when the message is sent.
      if (text === undefined || isDynamic(text)) continue;
      if (text.trim() === '' || text.length > Limits.SelectOptionText) {
        fail(
          `The ${field} of an option of ${what} is ${text.length} characters long: Discord accepts between 1 and ${Limits.SelectOptionText}.`
        );
      }
    }
    if (values.has(option.value))
      fail(`${what} has the value ${JSON.stringify(option.value)} twice.`);
    values.add(option.value);
  }
  return list;
}
