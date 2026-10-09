// `select()`, as the files of `src/components/selects/` import it from
// 'chapterjs': a menu of texts you declare, or of users, roles, channels
// of the server, and what to do with what is picked.
// https://docs.discord.com/developers/components/reference#string-select

import { Limits } from '../discord/api.js';
import type { Snowflake } from '../discord/types/common.js';
import { ChannelType } from '../discord/types/channel.js';
import {
  ComponentType,
  type RawSelectDefaultValue,
  type RawSelectMenu,
  type RawSelectOption,
} from '../discord/types/component.js';
import type { Channel } from '../structures/channel.js';
import type { ComponentInteraction } from '../structures/interaction.js';
import type { Role } from '../structures/role.js';
import type { User } from '../structures/user.js';
import type { TranslationContext } from '../messages/messages.js';
import {
  isDynamic,
  resolveText,
  type DynamicText,
  type TextContext,
} from './component.js';
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
import type { Rendered, SelectComponent } from './instance.js';
import {
  hasDynamicOption,
  resolveOptions,
  readOptions,
  type LoadedOption,
  type OptionValue,
  type SelectOptions,
} from './options.js';

/** The kinds of menus: texts you declare, or things of the server. */
export type SelectType = 'string' | 'user' | 'role' | 'mentionable' | 'channel';

/** The kinds of menus whose options are things of the server. */
export type EntitySelectType = Exclude<SelectType, 'string'>;

export const SELECT_TYPES: Record<SelectType, RawSelectMenu['type']> = {
  string: ComponentType.StringSelect,
  user: ComponentType.UserSelect,
  role: ComponentType.RoleSelect,
  mentionable: ComponentType.MentionableSelect,
  channel: ComponentType.ChannelSelect,
};

/** What `run` receives for one picked thing, by kind of menu. */
interface EntityValues {
  user: User;
  role: Role;
  mentionable: User | Role;
  channel: Channel;
}

/** What a select menu looks like. */
export interface SelectLook<Data extends DataShape = DataShape> {
  /**
   * The text shown when nothing is picked (150 characters at most):
   * written as is, or a function of `t` and the data, run when the
   * message is sent.
   */
  placeholder?: DynamicText<Data>;
  /** Shows the menu greyed out, impossible to use. */
  disabled?: boolean;
}

/** What a message can change when it shows a menu. */
export interface SelectInstanceOptions extends SelectLook {
  /**
   * What is picked when the menu appears: the values of the options for a
   * menu of texts, the ids (or the things themselves) for the others.
   */
  defaults?: readonly (string | { id: Snowflake })[];
}

/** What every select file declares, whatever its kind. */
interface SelectConfigBase<Data extends DataShape, Where extends ComponentWhere>
  extends SelectLook<Data>, InteractiveConfig<Data, Where> {
  /** How many things must be picked at least (0 to 25). 1 by default. */
  min?: number;
  /** How many things can be picked at most (1 to 25). 1 by default. */
  max?: number;
}

/** What `run` receives when something is picked. */
export type SelectContext<
  Picked,
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
> = InteractiveContext<Data> &
  TranslationContext & {
    /** What was picked, in the order of the menu. */
    values: Picked[];
    /** The first thing picked; `undefined` when nothing was (a menu with `min: 0`). */
    value: Picked | undefined;
  } & PlaceOf<Where, ComponentInteraction>;

/** A menu of texts you declare. */
export interface StringSelectConfig<
  Options extends SelectOptions,
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
> extends SelectConfigBase<Data, Where> {
  /** The kind of menu: texts you declare, which is the default. */
  type?: 'string';
  /**
   * The options (25 at most): a list of texts, an object from what is
   * shown to what your code receives, or a list of `RichOption`.
   */
  options: Options;
  /** What to do when something is picked. */
  run: (context: SelectContext<OptionValue<Options>, Data, Where>) => unknown;
}

/** A menu of users, roles, users and roles, or channels of the server. */
export interface EntitySelectConfig<
  Type extends EntitySelectType,
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
> extends SelectConfigBase<Data, Where> {
  /** The kind of menu: what Discord lists. */
  type: Type;
  /** For a menu of channels: the kinds of channels listed. All by default. */
  channelTypes?: readonly ChannelType[];
  /** What to do when something is picked. */
  run: (context: SelectContext<EntityValues[Type], Data, Where>) => unknown;
}

/** What a select file gives to `select()`: a menu of texts, or of things of the server. */
export type SelectConfig<
  Options extends SelectOptions = SelectOptions,
  Type extends EntitySelectType = EntitySelectType,
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
> =
  | StringSelectConfig<Options, Data, Where>
  | EntitySelectConfig<Type, Data, Where>;

/**
 * What `select()` returns: a declaration the framework finds in the exports
 * of a file. Import it where you send a message, and call it with the data
 * it carries; a menu without data is used as is, or called with what to
 * show.
 */
export type SelectDeclaration<Data extends DataShape = {}> = {
  /** What the file gave to `select()`, not checked yet. */
  readonly config: unknown;
} & ({} extends Data
  ? ((options?: SelectInstanceOptions) => SelectComponent) & SelectComponent
  : {} extends DataInputOf<Data>
    ? ((
        data?: DataInputOf<Data>,
        options?: SelectInstanceOptions
      ) => SelectComponent) &
        SelectComponent
    : (
        data: DataInputOf<Data>,
        options?: SelectInstanceOptions
      ) => SelectComponent);

/**
 * Declares a select menu. Export the result from any file of `src/`: the
 * name of the export is what tells the menu apart, so you never write an
 * id.
 *
 * ```ts
 * import { select } from 'chapterjs';
 *
 * export const color = select({
 *   placeholder: 'Pick a color',
 *   options: { Red: 'red', Blue: 'blue' },
 *   async run({ interaction, value }) {
 *     await interaction.update({ content: `You picked ${value}.`, components: [] });
 *   },
 * });
 * ```
 */
export function select<
  const Options extends SelectOptions,
  const Data extends DataShape = {},
  const Where extends ComponentWhere = 'guild',
>(config: StringSelectConfig<Options, Data, Where>): SelectDeclaration<Data>;
export function select<
  const Type extends EntitySelectType,
  const Data extends DataShape = {},
  const Where extends ComponentWhere = 'guild',
>(config: EntitySelectConfig<Type, Data, Where>): SelectDeclaration<Data>;
export function select(config: unknown): SelectDeclaration<DataShape> {
  return createComponent('select', config, {
    asPiece: true,
    pieceKind: 'select',
  }) as unknown as SelectDeclaration<DataShape>;
}

/** A select menu, checked. */
export interface LoadedSelect {
  readonly kind: 'select';
  /** The name of the export that declares it: its id for Discord. */
  readonly name: string;
  readonly type: SelectType;
  /** The options of a menu of texts, their texts maybe computed when sent. */
  readonly options: readonly LoadedOption[];
  readonly channelTypes: readonly ChannelType[] | undefined;
  readonly look: SelectLook;
  readonly min: number;
  readonly max: number;
  readonly data: DataShape;
  readonly where: ComponentWhere;
  readonly who: 'everyone' | 'author';
  readonly ephemeral: boolean;
  readonly run: (
    context: SelectContext<unknown, DataShape, ComponentWhere>
  ) => unknown;
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

/** Checks `min` and `max` of a menu, a group of checkboxes or a file upload. */
export function readRange(
  what: string,
  given: { min?: unknown; max?: unknown },
  limit: number,
  defaults: { min: number; max: number }
): { min: number; max: number } {
  const read = (key: 'min' | 'max', fallback: number, low: number): number => {
    const value = given[key];
    if (value === undefined) return fallback;
    if (
      !Number.isInteger(value) ||
      (value as number) < low ||
      (value as number) > limit
    ) {
      return fail(
        `"${key}" of ${what} is a whole number between ${low} and ${limit}, got ${JSON.stringify(value) ?? typeof value}.`
      );
    }
    return value as number;
  };
  const min = read('min', defaults.min, 0);
  const max = read('max', defaults.max, 1);
  if (min > max) {
    fail(
      `${what} can never be used: its "min" (${min}) is greater than its "max" (${max}).`
    );
  }
  return { min, max };
}

export function readPlaceholder(
  what: string,
  value: unknown
): DynamicText | undefined {
  if (value === undefined) return undefined;
  // A function is checked when the message is sent.
  if (isDynamic(value)) return value;
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > Limits.SelectPlaceholder
  ) {
    return fail(
      `The placeholder of ${what} is a text of 1 to ${Limits.SelectPlaceholder} characters.`
    );
  }
  return value;
}

export function readChannelTypes(
  what: string,
  value: unknown
): ChannelType[] | undefined {
  if (value === undefined) return undefined;
  const known = Object.values(ChannelType) as unknown[];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(one => known.includes(one))
  ) {
    return fail(
      `"channelTypes" of ${what} is a list of ChannelType values, like [ChannelType.GuildText].`
    );
  }
  return value as ChannelType[];
}

/** Checks what a message gives to change a menu. */
function readInstanceOptions(
  loaded: LoadedSelect,
  name: string,
  given: unknown
): {
  look: SelectLook;
  defaults: RawSelectDefaultValue[] | string[] | undefined;
} {
  if (given === undefined) return { look: {}, defaults: undefined };
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    fail(
      `The options of ${name} are an object like { placeholder: '...', defaults: [...] }.`
    );
  }
  const options = given as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (!['placeholder', 'disabled', 'defaults'].includes(key)) {
      fail(
        `"${key}" is not something ${name} takes when shown. It can take: placeholder, disabled, defaults.`
      );
    }
  }
  const look: SelectLook = {};
  const placeholder = readPlaceholder(name, options.placeholder);
  if (placeholder !== undefined) look.placeholder = placeholder;
  if (options.disabled !== undefined) {
    if (typeof options.disabled !== 'boolean')
      fail(`"disabled" of ${name} is true or false.`);
    look.disabled = options.disabled as boolean;
  }
  if (options.defaults === undefined) return { look, defaults: undefined };
  if (!Array.isArray(options.defaults)) {
    fail(
      `"defaults" of ${name} is a list of what is picked when the menu appears.`
    );
  }
  const ids = (options.defaults as unknown[]).map(item => {
    const id =
      typeof item === 'string' ? item : (item as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') {
      return fail(
        `A default of ${name} is a text, or something with an id, got ${JSON.stringify(item) ?? typeof item}.`
      );
    }
    return id;
  });
  if (ids.length > loaded.max) {
    fail(
      `${name} has ${ids.length} defaults, but ${loaded.max} can be picked at most.`
    );
  }
  if (loaded.type === 'string') {
    for (const value of ids) {
      if (!loaded.options.some(option => option.value === value)) {
        fail(
          `${JSON.stringify(value)} is not an option of ${name}. Its options are: ${loaded.options.map(option => option.value).join(', ')}.`
        );
      }
    }
    return { look, defaults: ids };
  }
  // Discord wants to know what each default is; a mentionable may be either,
  // and a role id is also a guild id for @everyone: users first.
  const kind = loaded.type === 'mentionable' ? 'user' : loaded.type;
  return { look, defaults: ids.map(id => ({ id, type: kind })) };
}

/** The menu as Discord takes it, for the data and the options given. */
export function renderSelect(
  loaded: LoadedSelect,
  args: readonly unknown[]
): Rendered<'select'> {
  const hasData = Object.keys(loaded.data).length > 0;
  const { name } = loaded;
  if (args.length > (hasData ? 2 : 1)) {
    fail(
      `${name} takes ${hasData ? 'its data, then options' : 'options'} at most.`
    );
  }
  const values = checkData(name, loaded.data, hasData ? args[0] : undefined);
  const { look, defaults } = readInstanceOptions(
    loaded,
    name,
    hasData ? args[1] : args[0]
  );
  const merged = { ...loaded.look, ...look };
  const dynamic =
    isDynamic(merged.placeholder) || hasDynamicOption(loaded.options);
  const make = (context: TextContext): RawSelectMenu => {
    const placeholder = resolveText(
      `The placeholder of ${name}`,
      merged.placeholder,
      context,
      { max: Limits.SelectPlaceholder }
    );
    const base = {
      custom_id: encodeCustomId(loaded.name, loaded.data, values),
      ...(placeholder !== undefined ? { placeholder } : {}),
      ...(loaded.min !== 1 ? { min_values: loaded.min } : {}),
      ...(loaded.max !== 1 ? { max_values: loaded.max } : {}),
      ...(merged.disabled ? { disabled: true } : {}),
    };
    if (loaded.type !== 'string') {
      return {
        type: SELECT_TYPES[loaded.type],
        ...base,
        ...(loaded.channelTypes
          ? { channel_types: [...loaded.channelTypes] }
          : {}),
        ...(defaults
          ? { default_values: defaults as RawSelectDefaultValue[] }
          : {}),
      } as RawSelectMenu;
    }
    const picked = defaults as string[] | undefined;
    return {
      type: ComponentType.StringSelect,
      ...base,
      options: resolveOptions(name, loaded.options, context)
        .map(option =>
          picked
            ? {
                ...option,
                ...(picked.includes(option.value)
                  ? { default: true }
                  : { default: undefined }),
              }
            : option
        )
        .map(option =>
          option.default === undefined
            ? (({ default: _d, ...rest }) => rest)(option)
            : option
        ),
    };
  };
  // Texts computed when the message is sent wait for who will read it.
  return {
    kind: 'select',
    raw: dynamic
      ? t => make({ t, data: values })
      : make({ t: undefined as never, data: values }),
  };
}
