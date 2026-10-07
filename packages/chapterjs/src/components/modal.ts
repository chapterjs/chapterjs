// `modal()`, as the files of `src/components/modals/` import it from
// 'chapterjs': a form that opens in Discord, its fields typed in `run`.
// https://docs.discord.com/developers/components/using-modal-components

import { Limits } from '../discord/api.js';
import type { ChannelType } from '../discord/types/channel.js';
import {
  ComponentType,
  TextInputStyle,
  type RawLabel,
  type RawLabelChildComponent,
  type RawSelectOption,
} from '../discord/types/component.js';
import type { RawInteractionCallbackModalData } from '../discord/types/interaction.js';
import type { Channel } from '../structures/channel.js';
import type { ModalInteraction } from '../structures/interaction.js';
import type { Attachment, Message } from '../structures/message.js';
import type { Role } from '../structures/role.js';
import type { User } from '../structures/user.js';
import type { TranslationContext } from '../messages/messages.js';
import {
  isDynamic,
  resolveText,
  type ComponentWhere,
  type DynamicText,
  type PlaceOf,
  type TextContext,
} from './component.js';
import {
  checkData,
  encodeCustomId,
  type DataShape,
  type DataInputOf,
  type DataValuesOf,
} from './custom-id.js';
import { createFile } from './file.js';
import type { ModalComponent, Rendered } from './instance.js';
import {
  hasDynamicOption,
  readOptions,
  resolveOptions,
  type LoadedOption,
  type OptionValue,
  type SelectOptions,
} from './options.js';
import {
  readChannelTypes,
  readPlaceholder,
  readRange,
  SELECT_TYPES,
} from './select.js';

/** What every field of a form has: how it is named for the person. */
interface FieldBase {
  /**
   * The name of the field, above it (45 characters at most): written as
   * is, or a function of `t` and the data, run when the form opens.
   */
  label: DynamicText;
  /** A help text under the label (100 characters at most): a text, or a function of `t` and the data. */
  description?: DynamicText;
}

/** A text the person types. */
export interface TextField extends FieldBase {
  /** The kind of field: a text. */
  type: 'text';
  /** One line (`'short'`, the default) or several (`'paragraph'`). */
  style?: 'short' | 'paragraph';
  /** The text shown while the field is empty (100 characters at most): a text, or a function of `t` and the data. */
  placeholder?: DynamicText;
  /** Whether the person must fill it in. `true` by default. */
  required?: boolean;
  /** The shortest text accepted, in characters (0 to 4000). */
  minLength?: number;
  /** The longest text accepted, in characters (1 to 4000). */
  maxLength?: number;
  /** What the field holds when the form opens (4000 characters at most). */
  value?: string;
}

/** A menu of texts you declare. */
export interface SelectField<
  Options extends SelectOptions = SelectOptions,
> extends FieldBase {
  /** The kind of field: a menu of texts. */
  type: 'select';
  /** The options (25 at most), written like the options of a select menu. */
  options: Options;
  /** The text shown when nothing is picked (150 characters at most): a text, or a function of `t` and the data. */
  placeholder?: DynamicText;
  /** How many options must be picked at least (0 to 25). 1 by default. */
  min?: number;
  /** How many options can be picked at most (1 to 25). 1 by default. */
  max?: number;
  /** Whether something must be picked. `true` by default. */
  required?: boolean;
}

/** A menu of users, roles, users and roles, or channels of the server. */
export interface EntityField extends FieldBase {
  /** The kind of field: what Discord lists. */
  type: 'user' | 'role' | 'mentionable' | 'channel';
  /** The text shown when nothing is picked (150 characters at most): a text, or a function of `t` and the data. */
  placeholder?: DynamicText;
  /** How many things must be picked at least (0 to 25). 1 by default. */
  min?: number;
  /** How many things can be picked at most (1 to 25). 1 by default. */
  max?: number;
  /** Whether something must be picked. `true` by default. */
  required?: boolean;
  /** For a menu of channels: the kinds of channels listed. All by default. */
  channelTypes?: readonly ChannelType[];
}

/** Files the person uploads. */
export interface FilesField extends FieldBase {
  /** The kind of field: files to upload. */
  type: 'files';
  /** How many files must be uploaded at least (0 to 10). 1 by default. */
  min?: number;
  /** How many files can be uploaded at most (1 to 10). 1 by default. */
  max?: number;
  /** Whether files must be uploaded. `true` by default. */
  required?: boolean;
  /** The kinds of files accepted: `'image'`, `'video'`, `'audio'`, or extensions like `'.pdf'` (10 at most). */
  fileTypes?: readonly string[];
}

/** One choice among a few, shown as radio buttons. */
export interface RadioField<
  Options extends SelectOptions = SelectOptions,
> extends FieldBase {
  /** The kind of field: one choice among 2 to 10. */
  type: 'radio';
  /** The choices (2 to 10), written like the options of a select menu. */
  options: Options;
  /** Whether a choice must be made. `true` by default. */
  required?: boolean;
}

/** Several choices among a few, shown as checkboxes. */
export interface CheckboxesField<
  Options extends SelectOptions = SelectOptions,
> extends FieldBase {
  /** The kind of field: several choices among 1 to 10. */
  type: 'checkboxes';
  /** The choices (1 to 10), written like the options of a select menu. */
  options: Options;
  /** How many must be checked at least (0 to 10). 1 by default. */
  min?: number;
  /** How many can be checked at most (1 to 10). All by default. */
  max?: number;
  /** Whether something must be checked. `true` by default. */
  required?: boolean;
}

/** One checkbox: yes or no. */
export interface CheckboxField extends FieldBase {
  /** The kind of field: one checkbox. */
  type: 'checkbox';
  /** Whether it is checked when the form opens. */
  default?: boolean;
}

/** A text shown in the form, which nobody fills in. */
export interface NoteField {
  /** The kind of field: a text to read. */
  type: 'note';
  /** The text, with Markdown: written as is, or a function of `t` and the data. */
  content: DynamicText;
}

/** One field of a form. */
export type ModalField =
  | TextField
  | SelectField
  | EntityField
  | FilesField
  | RadioField
  | CheckboxesField
  | CheckboxField
  | NoteField;

/** The fields of a form, by name (5 at most). */
export type ModalFields = Readonly<Record<string, ModalField>>;

/** What `run` receives for one picked thing of a menu of the server. */
interface EntityValues {
  user: User;
  role: Role;
  mentionable: User | Role;
  channel: Channel;
}

/** What `run` receives for a field, from its declaration. */
export type FieldValue<Field extends ModalField> = Field extends TextField
  ? Field extends { required: false }
    ? string | undefined
    : string
  : Field extends SelectField<infer Options>
    ? OptionValue<Options>[]
    : Field extends EntityField
      ? EntityValues[Field['type']][]
      : Field extends FilesField
        ? Attachment[]
        : Field extends RadioField<infer Options>
          ? Field extends { required: false }
            ? OptionValue<Options> | undefined
            : OptionValue<Options>
          : Field extends CheckboxesField<infer Options>
            ? OptionValue<Options>[]
            : Field extends CheckboxField
              ? boolean
              : never;

/** What the person filled in, typed field by field. Notes are not there. */
export type FieldValuesOf<Fields extends ModalFields> = {
  [
    Name in keyof Fields as Fields[Name] extends NoteField ? never : Name
  ]: FieldValue<Fields[Name]>;
};

/** What a form can hold when it opens: a value for some of its fields. */
export type ModalPrefill<Fields extends ModalFields> = {
  readonly [
    Name in keyof Fields as Fields[Name] extends
      TextField | SelectField | RadioField | CheckboxesField | CheckboxField
      ? Name
      : never
  ]?: Fields[Name] extends TextField
    ? string
    : Fields[Name] extends
          SelectField<infer Options> | CheckboxesField<infer Options>
      ? readonly OptionValue<Options>[]
      : Fields[Name] extends RadioField<infer Options>
        ? OptionValue<Options>
        : boolean;
};

/** What `run` receives when the form is sent. */
export type ModalContext<
  Fields extends ModalFields = ModalFields,
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
> = {
  /** Who sent the form. */
  user: User;
  /** What the person filled in. */
  fields: FieldValuesOf<Fields>;
  /** What the form carries, as declared in `data`. */
  data: DataValuesOf<Data>;
  /** The message whose button or menu opened the form; `null` when a command did. */
  message: Message | null;
} & TranslationContext &
  PlaceOf<Where, ModalInteraction>;

/** What a modal file gives to `modal()`. */
export interface ModalConfig<
  Fields extends ModalFields = ModalFields,
  Data extends DataShape = {},
  Where extends ComponentWhere = 'guild',
> {
  /**
   * The title of the form (45 characters at most): written as is, or a
   * function of `t` and the data, run when the form opens.
   */
  title: DynamicText;
  /** The fields, by name (1 to 5). `run` receives them under the same names. */
  fields: Fields;
  /**
   * What the form carries from the code that opens it to the code that
   * runs when it is sent: a name and a kind for each value. Given when the
   * form is opened, received typed in `run`.
   */
  data?: Data;
  /**
   * Where the form can be sent from: `'guild'` (servers, the default),
   * `'dm'` (private messages with the bot) or `'both'`. What `run`
   * receives follows it.
   */
  where?: Where;
  /**
   * Make the answers of the form only visible to who sent it. When a
   * component of a message only the person sees opened it, they already are.
   */
  ephemeral?: boolean;
  /** What to do when someone sends the form. */
  run: (context: ModalContext<Fields, Data, Where>) => unknown;
}

/** What a form is opened with: its data, and what some fields hold. */
export interface ModalInstanceOptions<
  Fields extends ModalFields = ModalFields,
> {
  /** What some fields hold when the form opens. */
  values?: ModalPrefill<Fields>;
}

/**
 * What `modal()` returns: the default export of a modal file. Import it
 * where someone uses a command or a component, and open it:
 * `interaction.showModal(report({ userId }))`, or
 * `interaction.showModal(feedback)` for a form without data.
 */
export type ModalFile<
  Fields extends ModalFields = ModalFields,
  Data extends DataShape = {},
> = {
  /** What the file gave to `modal()`, not checked yet. */
  readonly config: unknown;
} & ({} extends Data
  ? ((options?: ModalInstanceOptions<Fields>) => ModalComponent) &
      ModalComponent
  : {} extends DataInputOf<Data>
    ? ((
        data?: DataInputOf<Data>,
        options?: ModalInstanceOptions<Fields>
      ) => ModalComponent) &
        ModalComponent
    : (
        data: DataInputOf<Data>,
        options?: ModalInstanceOptions<Fields>
      ) => ModalComponent);

/**
 * Declares a form. Export the result as the default export of a file of
 * `src/components/modals/`: the path of the file is what tells the form
 * apart, so you never write an id.
 *
 * ```ts
 * import { modal } from 'chapterjs';
 *
 * export default modal({
 *   title: 'Feedback',
 *   fields: {
 *     text: { type: 'text', label: 'What do you think?', style: 'paragraph' },
 *   },
 *   async run({ interaction, fields }) {
 *     await interaction.reply({ content: `Thanks! You wrote: ${fields.text}`, ephemeral: true });
 *   },
 * });
 * ```
 */
export function modal<
  const Fields extends ModalFields,
  const Data extends DataShape = {},
  const Where extends ComponentWhere = 'guild',
>(config: ModalConfig<Fields, Data, Where>): ModalFile<Fields, Data> {
  return createFile('modal', config, {
    asPiece: true,
    pieceKind: 'modal',
  }) as unknown as ModalFile<Fields, Data>;
}

/** A field of a form, checked, with how it is sent. */
export interface LoadedField {
  readonly name: string;
  readonly field: ModalField;
  /** The options of a menu, radio or checkboxes, their texts maybe computed when sent. */
  readonly options: readonly LoadedOption[];
  readonly required: boolean;
  readonly min: number;
  readonly max: number;
}

/** A modal file, checked. */
export interface LoadedModal {
  readonly kind: 'modal';
  readonly path: string;
  /** The title (45 characters at most): a text, or computed when the form opens. */
  readonly title: DynamicText;
  readonly fields: readonly LoadedField[];
  readonly data: DataShape;
  readonly where: ComponentWhere;
  readonly ephemeral: boolean;
  readonly run: (
    context: ModalContext<ModalFields, DataShape, ComponentWhere>
  ) => unknown;
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

const FIELD_TYPES = [
  'text',
  'select',
  'user',
  'role',
  'mentionable',
  'channel',
  'files',
  'radio',
  'checkboxes',
  'checkbox',
  'note',
] as const;

/** The keys each kind of field accepts. */
const FIELD_KEYS: Record<ModalField['type'], readonly string[]> = {
  text: ['style', 'placeholder', 'required', 'minLength', 'maxLength', 'value'],
  select: ['options', 'placeholder', 'min', 'max', 'required'],
  user: ['placeholder', 'min', 'max', 'required'],
  role: ['placeholder', 'min', 'max', 'required'],
  mentionable: ['placeholder', 'min', 'max', 'required'],
  channel: ['placeholder', 'min', 'max', 'required', 'channelTypes'],
  files: ['min', 'max', 'required', 'fileTypes'],
  radio: ['options', 'required'],
  checkboxes: ['options', 'min', 'max', 'required'],
  checkbox: ['default'],
  note: ['content'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkText(
  what: string,
  value: unknown,
  max: number,
  { required = true, min = 1 } = {}
): string | undefined {
  if (value === undefined)
    return required ? fail(`${what} is missing.`) : undefined;
  // A function is checked when the form opens.
  if (isDynamic(value)) return undefined;
  if (typeof value !== 'string')
    return fail(`${what} is a text, got ${typeof value}.`);
  if (value.length < min || value.length > max) {
    return fail(
      `${what} is ${value.length} characters long: Discord accepts between ${min} and ${max}.`
    );
  }
  return value;
}

function checkBoolean(
  what: string,
  value: unknown,
  fallback: boolean
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean')
    return fail(
      `${what} is true or false, got ${JSON.stringify(value) ?? typeof value}.`
    );
  return value;
}

/** Checks one field of a form. */
export function readField(name: string, given: unknown): LoadedField {
  const what = `the field "${name}"`;
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
    fail(
      `"${name}" can't be the name of a field: it is how your code reads it (fields.${name}), so use letters, digits and _ only.`
    );
  }
  if (!isRecord(given)) {
    return fail(
      `${what} must be an object like { type: 'text', label: '...' }.`
    );
  }
  const type = given.type as ModalField['type'];
  if (!FIELD_TYPES.includes(type)) {
    fail(
      `The type of ${what} is ${JSON.stringify(given.type)}, which does not exist. Types are: ${FIELD_TYPES.join(', ')}.`
    );
  }
  for (const key of Object.keys(given)) {
    const allowed = [
      'type',
      ...(type === 'note' ? [] : ['label', 'description']),
      ...FIELD_KEYS[type],
    ];
    if (!allowed.includes(key)) {
      fail(
        `"${key}" is not something ${what} has (a ${type}). It can have: ${allowed.join(', ')}.`
      );
    }
  }
  if (type === 'note') {
    checkText(`The content of ${what}`, given.content, Limits.TextDisplayTotal);
    return {
      name,
      field: given as unknown as NoteField,
      options: [],
      required: false,
      min: 0,
      max: 0,
    };
  }
  checkText(`The label of ${what}`, given.label, Limits.LabelText);
  checkText(
    `The description of ${what}`,
    given.description,
    Limits.LabelDescription,
    { required: false }
  );
  const required = checkBoolean(`"required" of ${what}`, given.required, true);
  let options: LoadedOption[] = [];
  let range = { min: 1, max: 1 };
  switch (type) {
    case 'text': {
      if (
        given.style !== undefined &&
        given.style !== 'short' &&
        given.style !== 'paragraph'
      ) {
        fail(
          `The style of ${what} is 'short' or 'paragraph', got ${JSON.stringify(given.style)}.`
        );
      }
      checkText(
        `The placeholder of ${what}`,
        given.placeholder,
        Limits.TextInputPlaceholder,
        { required: false }
      );
      checkText(`The value of ${what}`, given.value, Limits.TextInputLength, {
        required: false,
        min: 0,
      });
      range = readRange(
        what,
        { min: given.minLength, max: given.maxLength },
        Limits.TextInputLength,
        { min: 0, max: Limits.TextInputLength }
      );
      break;
    }
    case 'select':
      options = readOptions(what, given.options);
      readPlaceholder(what, given.placeholder);
      range = readRange(what, given, Limits.SelectValues, { min: 1, max: 1 });
      break;
    case 'user':
    case 'role':
    case 'mentionable':
    case 'channel':
      readPlaceholder(what, given.placeholder);
      range = readRange(what, given, Limits.SelectValues, { min: 1, max: 1 });
      if (type === 'channel') readChannelTypes(what, given.channelTypes);
      break;
    case 'files':
      range = readRange(what, given, Limits.FileUploadMax, { min: 1, max: 1 });
      if (given.fileTypes !== undefined) {
        const types = given.fileTypes;
        if (
          !Array.isArray(types) ||
          types.length === 0 ||
          types.length > Limits.FileUploadTypes ||
          !types.every(
            one =>
              typeof one === 'string' &&
              /^(image|video|audio|\.[\w-]+)$/.test(one)
          )
        ) {
          fail(
            `"fileTypes" of ${what} is a list of 'image', 'video', 'audio' or extensions like '.pdf' (${Limits.FileUploadTypes} at most).`
          );
        }
      }
      break;
    case 'radio':
      options = readOptions(what, given.options, {
        min: Limits.RadioOptionsMin,
        max: Limits.RadioOptions,
      });
      break;
    case 'checkboxes':
      options = readOptions(what, given.options, {
        min: 1,
        max: Limits.CheckboxOptions,
      });
      range = readRange(what, given, Limits.CheckboxOptions, {
        min: 1,
        max: options.length,
      });
      if (range.max > options.length) {
        fail(
          `"max" of ${what} is ${range.max}, but it only has ${options.length} options.`
        );
      }
      break;
    case 'checkbox':
      checkBoolean(`"default" of ${what}`, given.default, false);
      break;
  }
  return {
    name,
    field: given as unknown as ModalField,
    options,
    required,
    ...range,
  };
}

/** The label and the input of one field, as Discord takes them. */
function renderField(
  loaded: LoadedField,
  prefill: unknown,
  context: TextContext
): RawLabel | { type: typeof ComponentType.TextDisplay; content: string } {
  const { name, field, required, min, max } = loaded;
  const what = `the field "${name}"`;
  if (field.type === 'note') {
    return {
      type: ComponentType.TextDisplay,
      content: resolveText(`The content of ${what}`, field.content, context, {
        max: Limits.TextDisplayTotal,
      })!,
    };
  }
  const placeholder =
    'placeholder' in field
      ? resolveText(`The placeholder of ${what}`, field.placeholder, context, {
          max:
            field.type === 'text'
              ? Limits.TextInputPlaceholder
              : Limits.SelectPlaceholder,
        })
      : undefined;
  const options = resolveOptions(what, loaded.options, context);
  const base = { custom_id: name };
  const picked = Array.isArray(prefill)
    ? (prefill as string[])
    : prefill !== undefined
      ? [prefill as string]
      : undefined;
  const withDefaults = (
    options: readonly RawSelectOption[]
  ): RawSelectOption[] =>
    options.map(option => {
      const { default: initial, ...rest } = option;
      const isDefault = picked ? picked.includes(option.value) : initial;
      return isDefault ? { ...rest, default: true } : rest;
    });
  let component: RawLabelChildComponent;
  switch (field.type) {
    case 'text':
      component = {
        type: ComponentType.TextInput,
        ...base,
        style:
          field.style === 'paragraph'
            ? TextInputStyle.Paragraph
            : TextInputStyle.Short,
        ...(min !== 0 ? { min_length: min } : {}),
        ...(max !== Limits.TextInputLength ? { max_length: max } : {}),
        ...(required ? {} : { required: false }),
        ...(placeholder !== undefined ? { placeholder } : {}),
        ...((prefill ?? field.value) !== undefined
          ? { value: (prefill ?? field.value) as string }
          : {}),
      };
      break;
    case 'select':
      component = {
        type: ComponentType.StringSelect,
        ...base,
        options: withDefaults(options),
        ...(placeholder !== undefined ? { placeholder } : {}),
        ...(min !== 1 ? { min_values: min } : {}),
        ...(max !== 1 ? { max_values: max } : {}),
        ...(required ? {} : { required: false }),
      };
      break;
    case 'user':
    case 'role':
    case 'mentionable':
    case 'channel':
      component = {
        type: SELECT_TYPES[field.type],
        ...base,
        ...(placeholder !== undefined ? { placeholder } : {}),
        ...(min !== 1 ? { min_values: min } : {}),
        ...(max !== 1 ? { max_values: max } : {}),
        ...(required ? {} : { required: false }),
        ...(field.type === 'channel' && field.channelTypes
          ? { channel_types: [...field.channelTypes] }
          : {}),
      } as RawLabelChildComponent;
      break;
    case 'files':
      component = {
        type: ComponentType.FileUpload,
        ...base,
        ...(min !== 1 ? { min_values: min } : {}),
        ...(max !== 1 ? { max_values: max } : {}),
        ...(required ? {} : { required: false }),
        ...(field.fileTypes ? { file_types: [...field.fileTypes] } : {}),
      };
      break;
    case 'radio':
      component = {
        type: ComponentType.RadioGroup,
        ...base,
        options: withDefaults(options),
        ...(required ? {} : { required: false }),
      };
      break;
    case 'checkboxes':
      component = {
        type: ComponentType.CheckboxGroup,
        ...base,
        options: withDefaults(options),
        ...(min !== 1 ? { min_values: min } : {}),
        ...(max !== loaded.options.length ? { max_values: max } : {}),
        ...(required ? {} : { required: false }),
      };
      break;
    case 'checkbox': {
      const checked =
        prefill !== undefined ? prefill === true : field.default === true;
      component = {
        type: ComponentType.Checkbox,
        ...base,
        ...(checked ? { default: true } : {}),
      };
      break;
    }
  }
  const description = resolveText(
    `The description of ${what}`,
    field.description,
    context,
    { max: Limits.LabelDescription }
  );
  return {
    type: ComponentType.Label,
    label: resolveText(`The label of ${what}`, field.label, context, {
      max: Limits.LabelText,
    })!,
    ...(description !== undefined ? { description } : {}),
    component,
  };
}

/** Checks what a form is opened with. */
function readPrefill(
  loaded: LoadedModal,
  name: string,
  given: unknown
): Record<string, unknown> {
  if (given === undefined) return {};
  if (!isRecord(given))
    fail(`The options of ${name} are an object like { values: { ... } }.`);
  const options = given as Record<string, unknown>;
  for (const key of Object.keys(options)) {
    if (key !== 'values')
      fail(
        `"${key}" is not something ${name} takes when opened. It can take: values.`
      );
  }
  if (options.values === undefined) return {};
  if (!isRecord(options.values))
    fail(
      `"values" of ${name} is an object whose keys are the names of its fields.`
    );
  const values = options.values as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) {
    const field = loaded.fields.find(one => one.name === key);
    if (!field)
      fail(
        `"${key}" is not a field of ${name}. Its fields are: ${loaded.fields.map(one => one.name).join(', ')}.`
      );
    const { type } = field!.field;
    const bad = (expected: string): never =>
      fail(
        `The value given for the field "${key}" of ${name} is ${expected}, got ${JSON.stringify(value) ?? typeof value}.`
      );
    const known = (picked: unknown): void => {
      if (!field!.options.some(option => option.value === picked)) {
        fail(
          `${JSON.stringify(picked)} is not an option of the field "${key}" of ${name}. Its options are: ${field!.options.map(option => option.value).join(', ')}.`
        );
      }
    };
    switch (type) {
      case 'text':
        if (typeof value !== 'string' || value.length > Limits.TextInputLength)
          bad(`a text of ${Limits.TextInputLength} characters at most`);
        break;
      case 'select':
      case 'checkboxes':
        if (!Array.isArray(value)) bad('a list of its options');
        (value as unknown[]).forEach(known);
        break;
      case 'radio':
        known(value);
        break;
      case 'checkbox':
        if (typeof value !== 'boolean') bad('true or false');
        break;
      default:
        fail(
          `The field "${key}" of ${name} is a ${type}: it can't be given a value when the form opens.`
        );
    }
  }
  return values;
}

/** The form as Discord takes it, for the data and the values given. */
export function renderModal(
  loaded: LoadedModal,
  args: readonly unknown[]
): Rendered<'modal'> {
  const hasData = Object.keys(loaded.data).length > 0;
  const name = loaded.path.split('/').pop()!;
  if (args.length > (hasData ? 2 : 1)) {
    fail(
      `${name} takes ${hasData ? 'its data, then options' : 'options'} at most.`
    );
  }
  const values = checkData(name, loaded.data, hasData ? args[0] : undefined);
  const prefill = readPrefill(loaded, name, hasData ? args[1] : args[0]);
  const make = (context: TextContext): RawInteractionCallbackModalData => ({
    custom_id: encodeCustomId(loaded.path, loaded.data, values),
    title: resolveText(`The title of ${name}`, loaded.title, context, {
      max: Limits.ModalTitle,
    })!,
    components: loaded.fields.map(field =>
      renderField(field, prefill[field.name], context)
    ),
  });
  // Texts computed when the form opens wait for the language of the person.
  const dynamic =
    isDynamic(loaded.title) ||
    loaded.fields.some(
      ({ field, options }) =>
        Object.values(field).some(isDynamic) || hasDynamicOption(options)
    );
  return {
    kind: 'modal',
    raw: dynamic
      ? t => make({ t, data: values })
      : make({ t: undefined as never, data: values }),
  };
}
