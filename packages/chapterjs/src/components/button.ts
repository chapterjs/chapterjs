// `button()`, as user files import it from 'chapterjs': what the button
// looks like, what it carries, and what to do when it is clicked.
// https://docs.discord.com/developers/components/reference#button

import { Limits } from '../discord/api.js';
import {
  ButtonStyle,
  ComponentType,
  type RawButton,
} from '../discord/types/component.js';
import type { TranslationContext } from '../messages/messages.js';
import type { ComponentInteraction } from '../structures/interaction.js';
import type { EmojiInput } from '../structures/message.js';
import { isDynamic, resolveText, type DynamicText } from './component.js';
import type {
  ComponentWhere,
  InteractiveConfig,
  InteractiveContext,
  PlaceOf,
} from './component.js';
import {
  checkData,
  encodeCustomId,
  type DataShape,
  type DataInputOf,
  type DataValuesOf,
} from './custom-id.js';
import { createComponent } from './declared.js';
import { emojiOf, type ButtonComponent, type Rendered } from './instance.js';

/**
 * The color of a button: `'primary'` (blurple), `'secondary'` (grey),
 * `'success'` (green) or `'danger'` (red).
 * @see https://docs.discord.com/developers/components/reference#button-button-styles
 */
export type ButtonStyleName = 'primary' | 'secondary' | 'success' | 'danger';

export const BUTTON_STYLES: Record<ButtonStyleName, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

/** What a button looks like. Everything is optional when it is put in a message: what the file says is the default. */
export interface ButtonLook<Data extends DataShape = DataShape> {
  /**
   * The text on the button (80 characters at most): written as is, or a
   * function of `t` and the data, run when the message is sent.
   */
  label?: DynamicText<Data>;
  /** An emoji on the button, before the label. */
  emoji?: EmojiInput;
  /** The color of the button. `'primary'` by default. */
  style?: ButtonStyleName;
  /** Shows the button greyed out, impossible to click. */
  disabled?: boolean;
}

/** What `run` receives when the button is clicked. */
export type ButtonContext<
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
> = InteractiveContext<Data> &
  TranslationContext &
  PlaceOf<Where, ComponentInteraction>;

/** What a file gives to `button()`. */
export interface ButtonConfig<
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
>
  extends ButtonLook<Data>, InteractiveConfig<Data, Where> {
  /** What to do when someone clicks the button. */
  run: (context: ButtonContext<Data, Where>) => unknown;
}

/**
 * What `button()` returns: a declaration the framework finds in the exports
 * of a file. Import it where you send a message, and call it with the data
 * the button carries (`ban({ userId })`); a button without data is used as
 * is (`confirm`), or called with a look (`confirm({ disabled: true })`).
 */
export type ButtonDeclaration<Data extends DataShape = {}> = {
  /** What the file gave to `button()`, not checked yet. */
  readonly config: unknown;
} & ({} extends Data
  ? ((look?: ButtonLook) => ButtonComponent) & ButtonComponent
  : {} extends DataInputOf<Data>
    ? ((data?: DataInputOf<Data>, look?: ButtonLook) => ButtonComponent) &
        ButtonComponent
    : (data: DataInputOf<Data>, look?: ButtonLook) => ButtonComponent);

/**
 * Declares a button. Export the result from any file of `src/`: the name
 * of the export is what tells the button apart, so you never write an id.
 *
 * ```ts
 * import { button } from 'chapterjs';
 *
 * export const confirm = button({
 *   label: 'Confirm',
 *   style: 'success',
 *   async run({ interaction }) {
 *     await interaction.update({ content: 'Confirmed!', components: [] });
 *   },
 * });
 * ```
 */
export function button<
  const Data extends DataShape = {},
  const Where extends ComponentWhere = 'guild',
>(config: ButtonConfig<Data, Where>): ButtonDeclaration<Data> {
  return createComponent('button', config, {
    asPiece: true,
    pieceKind: 'button',
  }) as unknown as ButtonDeclaration<Data>;
}

/** A button, checked. */
export interface LoadedButton {
  readonly kind: 'button';
  /** The name of the export that declares it: its id for Discord. */
  readonly name: string;
  readonly look: Required<Pick<ButtonLook, 'style' | 'disabled'>> &
    Pick<ButtonLook, 'label' | 'emoji'>;
  readonly data: DataShape;
  readonly where: ComponentWhere;
  readonly who: 'everyone' | 'author';
  readonly ephemeral: boolean;
  readonly run: (context: ButtonContext<DataShape, ComponentWhere>) => unknown;
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

/** Checks what a message gives to change the look of a button. */
export function readLook(what: string, look: unknown): ButtonLook {
  if (look === undefined) return {};
  if (typeof look !== 'object' || look === null || Array.isArray(look)) {
    fail(`The look of ${what} is an object like { disabled: true }.`);
  }
  const given = look as Record<string, unknown>;
  for (const key of Object.keys(given)) {
    if (!['label', 'emoji', 'style', 'disabled'].includes(key)) {
      fail(
        `"${key}" is not something the look of ${what} has. It can have: label, emoji, style, disabled.`
      );
    }
  }
  if (given.label !== undefined && !isDynamic(given.label)) {
    if (
      typeof given.label !== 'string' ||
      given.label.trim() === '' ||
      given.label.length > Limits.ButtonLabel
    ) {
      fail(
        `The label of ${what} is a text of 1 to ${Limits.ButtonLabel} characters.`
      );
    }
  }
  if (
    given.style !== undefined &&
    !Object.hasOwn(BUTTON_STYLES, given.style as string)
  ) {
    fail(
      `The style of ${what} is 'primary', 'secondary', 'success' or 'danger', got ${JSON.stringify(given.style)}.`
    );
  }
  if (given.disabled !== undefined && typeof given.disabled !== 'boolean') {
    fail(`"disabled" of ${what} is true or false.`);
  }
  if (given.emoji !== undefined) emojiOf(given.emoji as EmojiInput, what);
  return given as ButtonLook;
}

/** The button as Discord takes it, for the data and the look given. */
export function renderButton(
  loaded: LoadedButton,
  args: readonly unknown[]
): Rendered<'button'> {
  const hasData = Object.keys(loaded.data).length > 0;
  const { name } = loaded;
  if (args.length > (hasData ? 2 : 1)) {
    fail(
      `${name} takes ${hasData ? 'its data, then a look' : 'a look'} at most: ${hasData ? `${name}({ ... }, { disabled: true })` : `${name}({ disabled: true })`}.`
    );
  }
  const values = checkData(name, loaded.data, hasData ? args[0] : undefined);
  const look = {
    ...loaded.look,
    ...readLook(name, hasData ? args[1] : args[0]),
  };
  const base: RawButton = {
    type: ComponentType.Button,
    style: BUTTON_STYLES[look.style],
    custom_id: encodeCustomId(loaded.name, loaded.data, values),
  };
  if (look.emoji !== undefined) base.emoji = emojiOf(look.emoji, name);
  if (look.disabled) base.disabled = true;
  const { label } = look;
  if (label === undefined) return { kind: 'button', raw: base };
  if (!isDynamic(label)) return { kind: 'button', raw: { ...base, label } };
  // The label is computed when the message is sent, for who will read it.
  return {
    kind: 'button',
    raw: t => ({
      ...base,
      label: resolveText(
        `The label of ${name}`,
        label,
        { t, data: values },
        { max: Limits.ButtonLabel }
      )!,
    }),
  };
}
