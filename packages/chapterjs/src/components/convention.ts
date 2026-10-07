// `src/components/`: the folder is the kind of component, the path of the
// file is its id. Everything a file declares is checked when it loads,
// against the limits of Discord, so a mistake is explained before Discord
// refuses it; the file is then bound to its path, which is what makes its
// instances.

import { Limits } from '../discord/api.js';
import type { Convention } from '../loader/loader.js';
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
import { isEmbedFile } from './embed.js';
import {
  bindFile,
  COMPONENT_FOLDERS,
  fileStateOf,
  type ComponentKind,
} from './file.js';
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

/** An embed file, checked (when it is static). */
export interface LoadedEmbed {
  readonly kind: 'embed';
  readonly path: string;
}

/** A component file, checked: what the router works with. */
export type LoadedComponent =
  LoadedButton | LoadedSelect | LoadedModal | LoadedEmbed;

const fail = (message: string): never => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The names of the folders and files: what a path and an id can hold. */
const NAME = /^[A-Za-z0-9_-]+$/;

const FOLDERS = Object.keys(COMPONENT_FOLDERS);

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

function readButton(path: string, config: unknown): LoadedButton {
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
    path,
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

function readSelect(path: string, config: unknown): LoadedSelect {
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
    path,
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

function readModal(path: string, config: unknown): LoadedModal {
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
    path,
    title: config.title as string,
    fields: Object.freeze(fields),
    data: checkDataShape(what, config.data),
    where: checkWhere(what, config.where),
    ephemeral: checkBoolean('"ephemeral"', config.ephemeral),
    run: config.run as LoadedModal['run'],
  });
}

/** A file of `src/components/`, by the kind its folder says. */
function readOne(
  kind: ComponentKind,
  path: string,
  exports: Record<string, unknown>
): LoadedComponent {
  const file = exports.default;
  const state = fileStateOf(file);
  const example = `import { ${kind} } from 'chapterjs'; export default ${kind}({ ... })`;
  if (!state) {
    return fail(
      'default' in exports
        ? `The default export of this file must be what ${kind}() returns: ${example}`
        : `This file has no default export. It should look like: ${example}`
    );
  }
  if (state.kind !== kind) {
    const folder = FOLDERS.find(one => COMPONENT_FOLDERS[one] === state.kind)!;
    return fail(
      `This file exports a ${state.kind}, but it is in src/components/${FOLDERS.find(one => COMPONENT_FOLDERS[one] === kind)}/. Move it to src/components/${folder}/.`
    );
  }
  switch (kind) {
    case 'button': {
      const loaded = readButton(path, state.config);
      bindFile(file, { path, render: args => renderButton(loaded, args) });
      return loaded;
    }
    case 'select': {
      const loaded = readSelect(path, state.config);
      bindFile(file, { path, render: args => renderSelect(loaded, args) });
      return loaded;
    }
    case 'modal': {
      const loaded = readModal(path, state.config);
      bindFile(file, { path, render: args => renderModal(loaded, args) });
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
      bindFile(file, {
        path,
        render: args => {
          if (typeof config === 'function')
            return (config as (...given: unknown[]) => Embed)(...args);
          if (args.length > 0)
            fail(
              `${path.split('/').pop()} always looks the same: it takes no arguments.`
            );
          return config as Embed;
        },
      });
      return Object.freeze({ kind: 'embed', path });
    }
  }
}

/**
 * `src/components/`: one folder per kind of component (`buttons/`,
 * `selects/`, `modals/`, `embeds/`), and in it one file per component,
 * whose path is its id. The file exports by default what `button()`,
 * `select()`, `modal()` or `embed()` returns.
 */
export const componentsConvention: Convention<LoadedComponent> = {
  folder: 'components',
  one: 'component',
  many: 'components',
  check(path) {
    const parts = path.replace(/\.[^./]+$/, '').split('/');
    if (parts.length < 2) {
      fail(
        `This file is directly in src/components/. Put it in the folder of its kind: ${FOLDERS.map(one => `src/components/${one}/`).join(', ')}.`
      );
    }
    const folder = parts[0]!;
    if (!Object.hasOwn(COMPONENT_FOLDERS, folder)) {
      fail(
        `The folder src/components/${folder} is not a kind of component. Kinds are: ${FOLDERS.join(', ')}.`
      );
    }
    for (const part of parts) {
      if (!NAME.test(part)) {
        fail(
          `"${part}" can't be in the path of a component: use letters, digits, - and _ only. The path of the file is the id of the component.`
        );
      }
    }
    if (path.replace(/\.[^./]+$/, '').length > Limits.CustomId - 20) {
      fail(
        `The path of this file is ${path.length} characters long: Discord gives ${Limits.CustomId} characters to the id of a component and its data together. Shorten the names.`
      );
    }
  },
  read(exports, path) {
    const id = path.replace(/\.[^./]+$/, '');
    const kind = COMPONENT_FOLDERS[id.split('/')[0]!]!;
    return readOne(kind, id, exports);
  },
};

/** The files that are the same component (through `(group)` folders): the later one is left out. */
export function findDuplicates<
  T extends { file: string; component: { path: string } },
>(
  entries: readonly T[]
): { valid: T[]; conflicts: { file: string; message: string }[] } {
  const seen = new Map<string, T>();
  const conflicts: { file: string; message: string }[] = [];
  const valid = [...entries]
    .sort((a, b) => (a.file < b.file ? -1 : 1))
    .filter(entry => {
      const first = seen.get(entry.component.path);
      if (!first) {
        seen.set(entry.component.path, entry);
        return true;
      }
      conflicts.push({
        file: entry.file,
        message: `${entry.component.path} is already ${first.file}: two files can't be the same component. A folder in parentheses only groups files, it is not part of the id.`,
      });
      return false;
    });
  return { valid, conflicts };
}

/** Whether a file holds an embed: nothing to route. */
export const isEmbedLoaded = (
  component: LoadedComponent
): component is LoadedEmbed => component.kind === 'embed';

export { isEmbedFile };
