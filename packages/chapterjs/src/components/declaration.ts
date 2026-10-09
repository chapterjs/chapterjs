// What a file declares with `button()`, `select()`, `modal()` and
// `embed()`, checked when it loads against the limits of Discord, so a
// mistake is explained before Discord refuses it; the component is then
// bound to the name of its export, which is its id and what makes its
// instances.

import { Limits } from '../discord/api.js';
import type { Declaration, ExportSite } from '../loader/loader.js';
import { checkEmbed, type Embed } from '../structures/payload.js';
import { isDynamic } from './component.js';
import {
  BUTTON_STYLES,
  readLook,
  renderButton,
  type LoadedButton,
} from './button.js';
import type { ComponentWhere, ComponentWho } from './component.js';
import { DATA_KINDS, type DataShape } from './custom-id.js';
import { isEmbedDeclaration } from './embed.js';
import {
  bindComponent,
  componentStateOf,
  type ComponentKind,
} from './declared.js';
import { readField, renderModal, type LoadedModal } from './modal.js';
import { readOptions } from './options.js';
import {
  readChannelTypes,
  readPlaceholder,
  readRange,
  renderSelect,
  SELECT_TYPES,
  type LoadedSelect,
} from './select.js';

/** An embed, checked (when it is static). */
export interface LoadedEmbed {
  readonly kind: 'embed';
  /** The name of the export that declares it. */
  readonly name: string;
}

/** A component, checked: what the router works with. */
export type LoadedComponent =
  LoadedButton | LoadedSelect | LoadedModal | LoadedEmbed;

const fail = (message: string): never => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What the name of a component can hold: the name of an export (or of a
 * file, for a default export), as long as a custom_id can carry it beside
 * the data: no `:` (what separates the data), and room left for the data.
 */
const NAME = /^[^:\s]+$/;

function checkKeys(
  what: string,
  value: Record<string, unknown>,
  allowed: readonly string[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      fail(
        `"${key}" is not something ${what} has. It can have: ${allowed.join(', ')}.`
      );
    }
  }
}

function checkBoolean(what: string, value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean')
    return fail(
      `${what} is true or false, got ${JSON.stringify(value) ?? typeof value}.`
    );
  return value;
}

const PLACES: readonly ComponentWhere[] = ['guild', 'dm', 'both'];
function checkWhere(what: string, value: unknown): ComponentWhere {
  if (value === undefined) return 'guild';
  if (!PLACES.includes(value as ComponentWhere)) {
    return fail(
      `"where" says where ${what} can be used: 'guild' (in servers, which is the default), 'dm' (in private messages with the bot) or 'both'. Got ${JSON.stringify(value) ?? typeof value}.`
    );
  }
  return value as ComponentWhere;
}

function checkWho(what: string, value: unknown): ComponentWho {
  if (value === undefined) return 'everyone';
  if (value !== 'everyone' && value !== 'author') {
    return fail(
      `"who" says who may use ${what}: 'everyone' (the default) or 'author' (only who used the command the message answers). Got ${JSON.stringify(value) ?? typeof value}.`
    );
  }
  return value;
}

function checkDataShape(what: string, value: unknown): DataShape {
  if (value === undefined) return Object.freeze({});
  if (!isRecord(value)) {
    return fail(
      `"data" of ${what} is an object from a name to a kind: data: { userId: 'string', page: 'number' }.`
    );
  }
  const kinds = DATA_KINDS.map(one => `'${one}'`).join(', ');
  for (const [name, field] of Object.entries(value)) {
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
      fail(
        `"${name}" can't be the name of a data of ${what}: it is how your code reads it (data.${name}), so use letters, digits and _ only.`
      );
    }
    // A kind, or a kind with a default value.
    if (isRecord(field)) {
      for (const key of Object.keys(field)) {
        if (key !== 'type' && key !== 'default') {
          fail(
            `"${key}" is not something the data "${name}" of ${what} has. It can have: type, default.`
          );
        }
      }
      if (!DATA_KINDS.includes(field.type as never)) {
        fail(
          `The data "${name}" of ${what} has the type ${JSON.stringify(field.type) ?? typeof field.type}, which does not exist. Kinds are: ${kinds}.`
        );
      }
      if (
        field.default !== undefined &&
        (typeof field.default !== field.type ||
          (field.type === 'number' && !Number.isFinite(field.default)))
      ) {
        fail(
          `The default value of the data "${name}" of ${what} must be a ${field.type as string}, got ${JSON.stringify(field.default) ?? typeof field.default}.`
        );
      }
      continue;
    }
    if (!DATA_KINDS.includes(field as never)) {
      fail(
        `The data "${name}" of ${what} has the kind ${JSON.stringify(field) ?? typeof field}, which does not exist. Kinds are: ${kinds}, or { type: 'number', default: 1 } for a value with a default.`
      );
    }
  }
  return Object.freeze({ ...value }) as DataShape;
}

function checkRun(what: string, value: unknown, example: string): void {
  if (typeof value !== 'function') {
    fail(
      `${what} has no "run": the function to run when someone uses it, like ${example}`
    );
  }
}

function readButton(name: string, config: unknown): LoadedButton {
  if (!isRecord(config)) {
    return fail(
      `button() needs an object: button({ label: '...', run({ interaction }) { ... } })`
    );
  }
  const what = 'this button';
  checkKeys('a button', config, [
    'label',
    'emoji',
    'style',
    'disabled',
    'data',
    'where',
    'who',
    'ephemeral',
    'run',
  ]);
  const look = readLook(what, {
    ...(config.label !== undefined ? { label: config.label } : {}),
    ...(config.emoji !== undefined ? { emoji: config.emoji } : {}),
    ...(config.style !== undefined ? { style: config.style } : {}),
    ...(config.disabled !== undefined ? { disabled: config.disabled } : {}),
  });
  if (look.label === undefined && look.emoji === undefined) {
    fail('A button needs a label or an emoji.');
  }
  checkRun(
    what,
    config.run,
    `async run({ interaction }) { await interaction.update('Done!'); }`
  );
  return Object.freeze({
    kind: 'button',
    name,
    look: {
      style: look.style ?? ('primary' as const),
      disabled: look.disabled ?? false,
      ...(look.label !== undefined ? { label: look.label } : {}),
      ...(look.emoji !== undefined ? { emoji: look.emoji } : {}),
    },
    data: checkDataShape(what, config.data),
    where: checkWhere(what, config.where),
    who: checkWho(what, config.who),
    ephemeral: checkBoolean('"ephemeral"', config.ephemeral),
    run: config.run as LoadedButton['run'],
  });
}

function readSelect(name: string, config: unknown): LoadedSelect {
  if (!isRecord(config)) {
    return fail(
      `select() needs an object: select({ options: ['a', 'b'], run({ interaction, value }) { ... } })`
    );
  }
  const what = 'this select menu';
  const type = (config.type ?? 'string') as string;
  if (!Object.hasOwn(SELECT_TYPES, type)) {
    fail(
      `The type of ${what} is ${JSON.stringify(config.type)}, which does not exist. Types are: ${Object.keys(
        SELECT_TYPES
      )
        .map(one => `'${one}'`)
        .join(', ')}.`
    );
  }
  checkKeys('a select menu', config, [
    'type',
    'options',
    'placeholder',
    'min',
    'max',
    'disabled',
    'channelTypes',
    'data',
    'where',
    'who',
    'ephemeral',
    'run',
  ]);
  if (type !== 'string' && config.options !== undefined) {
    fail(`${what} lists ${type}s: Discord fills it, so it takes no "options".`);
  }
  if (type !== 'channel' && config.channelTypes !== undefined) {
    fail(`"channelTypes" is only for a menu of channels (type: 'channel').`);
  }
  const options = type === 'string' ? readOptions(what, config.options) : [];
  const placeholder = readPlaceholder(what, config.placeholder);
  checkRun(what, config.run, `async run({ interaction, values }) { ... }`);
  return Object.freeze({
    kind: 'select',
    name,
    type: type as LoadedSelect['type'],
    options: Object.freeze(options),
    channelTypes: readChannelTypes(what, config.channelTypes),
    look: {
      ...(placeholder !== undefined ? { placeholder } : {}),
      ...(checkBoolean('"disabled"', config.disabled)
        ? { disabled: true }
        : {}),
    },
    ...readRange(what, config, Limits.SelectValues, { min: 1, max: 1 }),
    data: checkDataShape(what, config.data),
    where: checkWhere(what, config.where),
    who: checkWho(what, config.who),
    ephemeral: checkBoolean('"ephemeral"', config.ephemeral),
    run: config.run as LoadedSelect['run'],
  });
}

function readModal(name: string, config: unknown): LoadedModal {
  if (!isRecord(config)) {
    return fail(
      `modal() needs an object: modal({ title: '...', fields: { ... }, run({ interaction, fields }) { ... } })`
    );
  }
  const what = 'this form';
  checkKeys('a form', config, [
    'title',
    'fields',
    'data',
    'where',
    'ephemeral',
    'run',
  ]);
  if (
    !isDynamic(config.title) &&
    (typeof config.title !== 'string' ||
      config.title.trim() === '' ||
      config.title.length > Limits.ModalTitle)
  ) {
    fail(
      `The title of ${what} is a text of 1 to ${Limits.ModalTitle} characters.`
    );
  }
  if (!isRecord(config.fields)) {
    fail(
      `"fields" of ${what} is an object whose keys are the names of the fields: fields: { reason: { type: 'text', label: 'Reason' } }`
    );
  }
  const fields = Object.entries(config.fields as Record<string, unknown>).map(
    ([name, field]) => readField(name, field)
  );
  const inputs = fields.filter(field => field.field.type !== 'note');
  if (fields.length === 0 || fields.length > Limits.ModalFields) {
    fail(
      `${what} has ${fields.length} fields: Discord accepts between 1 and ${Limits.ModalFields}.`
    );
  }
  if (inputs.length === 0) {
    fail(
      `${what} has nothing to fill in: add a field like { type: 'text', label: '...' }.`
    );
  }
  checkRun(what, config.run, `async run({ interaction, fields }) { ... }`);
  return Object.freeze({
    kind: 'modal',
    name,
    title: config.title as string,
    fields: Object.freeze(fields),
    data: checkDataShape(what, config.data),
    where: checkWhere(what, config.where),
    ephemeral: checkBoolean('"ephemeral"', config.ephemeral),
    run: config.run as LoadedModal['run'],
  });
}

/** One component, by the kind it was declared with. */
function readOne(
  state: ReturnType<typeof componentStateOf> & object,
  declared: unknown,
  { name, file, export: exported }: ExportSite
): LoadedComponent {
  const what = `the ${WHAT[state.kind]} ${name}`;
  if (!NAME.test(name)) {
    fail(
      `"${name}" can't be the name of a ${WHAT[state.kind]}: the name of the export is its id, and an id has no space and no ":". Rename the export.`
    );
  }
  if (name.length > Limits.CustomId - 20) {
    fail(
      `The name of ${what} is ${name.length} characters long: Discord gives ${Limits.CustomId} characters to the id of a component and its data together. Rename the export${exported === 'default' ? ` or the file ${file}` : ''} with something shorter.`
    );
  }
  switch (state.kind) {
    case 'button': {
      const loaded = readButton(name, state.config);
      bindComponent(declared, {
        name,
        render: args => renderButton(loaded, args),
      });
      return loaded;
    }
    case 'select': {
      const loaded = readSelect(name, state.config);
      bindComponent(declared, {
        name,
        render: args => renderSelect(loaded, args),
      });
      return loaded;
    }
    case 'modal': {
      const loaded = readModal(name, state.config);
      bindComponent(declared, {
        name,
        render: args => renderModal(loaded, args),
      });
      return loaded;
    }
    default: {
      const { config } = state;
      if (typeof config !== 'function') {
        if (!isRecord(config)) {
          fail(
            `embed() takes the embed itself ({ title: '...' }) or a function that returns one.`
          );
        }
        checkEmbed(config as Embed, 'this embed');
      }
      bindComponent(declared, {
        name,
        render: args => {
          if (typeof config === 'function')
            return (config as (...given: unknown[]) => Embed)(...args);
          if (args.length > 0)
            fail(`${name} always looks the same: it takes no arguments.`);
          return config as Embed;
        },
      });
      return Object.freeze({ kind: 'embed', name });
    }
  }
}

/** What each kind is called in messages. */
export const WHAT: Record<ComponentKind, string> = {
  button: 'button',
  select: 'select menu',
  modal: 'form',
  embed: 'embed',
};

/**
 * A component (a button, a select menu, a form or an embed), declared
 * anywhere in `src/` with `button()`, `select()`, `modal()` or `embed()`,
 * and exported: the name of the export is its id, so a file may declare
 * several, each under its own export.
 */
export const componentDeclaration: Declaration<LoadedComponent> = {
  one: 'component',
  many: 'components',
  is: value => componentStateOf(value) !== undefined,
  list: false,
  read(value, site) {
    return readOne(componentStateOf(value)!, value, site);
  },
};

/** Two components of the same kind with the same name: the later one is left out. */
export function findDuplicates<
  T extends {
    file: string;
    export: string;
    component: { kind: ComponentKind; name: string };
  },
>(
  entries: readonly T[]
): {
  valid: T[];
  conflicts: { file: string; export: string; message: string }[];
} {
  const seen = new Map<string, T>();
  const conflicts: { file: string; export: string; message: string }[] = [];
  const valid = [...entries]
    .sort((a, b) =>
      a.file === b.file
        ? a.export < b.export
          ? -1
          : 1
        : a.file < b.file
          ? -1
          : 1
    )
    .filter(entry => {
      const key = `${entry.component.kind}:${entry.component.name}`;
      const first = seen.get(key);
      if (!first) {
        seen.set(key, entry);
        return true;
      }
      conflicts.push({
        file: entry.file,
        export: entry.export,
        message: `There is already a ${WHAT[entry.component.kind]} named ${entry.component.name}, in ${first.file}: the name of the export is what tells a ${WHAT[entry.component.kind]} apart, so rename one of them.`,
      });
      return false;
    });
  return { valid, conflicts };
}

/** Whether a declaration is an embed: nothing to route. */
export const isEmbedLoaded = (
  component: LoadedComponent
): component is LoadedEmbed => component.kind === 'embed';

export { isEmbedDeclaration };
