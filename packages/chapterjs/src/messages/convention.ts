// `src/messages/`: one file per language, named after it (`fr.ts` is the
// French of the bot). What a file declares is checked when it loads, and
// the languages are checked against each other once loaded: every one has
// the texts of the default language, with the same placeholders, so a
// missing text is explained before anyone asks for it.

import { commandName } from '../commands/tree.js';
import type { Locale } from '../discord/types/common.js';
import {
  logicalPath,
  type Convention,
  type FailedFile,
  type FoundFile,
} from '../loader/loader.js';
import { isLanguageFile } from './messages.js';
import { FRAMEWORK, FRAMEWORK_KEYS } from './phrases.js';
import {
  compile,
  compilePlural,
  LOCALES,
  PLURAL_FORMS,
  type LoadedMessages,
  type PluralForm,
  type Template,
  type TextTemplate,
} from './translate.js';

/** A language file, checked: what the languages are assembled from. */
export interface LoadedLanguage {
  /** The language, from the name of the file. */
  readonly locale: Locale;
  /** Whether the file says it is the default language. */
  readonly isDefault: boolean;
  /** The texts, compiled. */
  readonly texts: ReadonlyMap<string, Template>;
  /** The phrases of the framework this file translates, compiled. */
  readonly framework: ReadonlyMap<string, Template>;
  /** The `commands` section, by the path of the command file, not checked yet. */
  readonly commands: Readonly<Record<string, unknown>> | undefined;
}

const fail: (message: string) => never = message => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEYS = ['default', 'texts', 'commands', 'framework'];

const EXAMPLE = `language({ texts: { pong: 'Pong!' } })`;

/** Placeholders, for a message: `{name}, {count}`, or `none`. */
const showParams = (names: readonly string[]): string =>
  names.length === 0 ? 'none' : names.map(name => `{${name}}`).join(', ');

/** Whether two templates take the same placeholders. */
const samePlaceholders = (a: Template, b: Template): boolean =>
  [...a.params].sort().join('\0') === [...b.params].sort().join('\0');

/** One form of a text, cut around its placeholders, each one checked. */
function readForm(what: string, text: unknown, example: string): TextTemplate {
  if (typeof text !== 'string' || text === '') {
    fail(`${what} must be a text: ${example}`);
  }
  const template = compile(text);
  for (const name of template.params) {
    if (!NAME.test(name)) {
      fail(
        `${what} has a placeholder "{${name}}": a placeholder is a name made of letters, digits and _, like {name}.`
      );
    }
  }
  return template;
}

/**
 * A text of a language file: a string, or a plural (one form per
 * quantity, `other` at least), with an error saying what to write.
 */
function readText(key: string, text: unknown, kind = 'message'): Template {
  const what = `The ${kind} "${key}"`;
  if (isRecord(text)) {
    const forms = new Map<PluralForm, TextTemplate>();
    for (const [form, one] of Object.entries(text)) {
      if (!PLURAL_FORMS.includes(form as PluralForm)) {
        fail(
          `"${form}" is not a form of the plural "${key}". A plural has: ${PLURAL_FORMS.join(', ')} (other at least): ${key}: { one: '{count} member', other: '{count} members' }`
        );
      }
      forms.set(
        form as PluralForm,
        readForm(
          `The form "${form}" of the plural "${key}"`,
          one,
          `${form}: '{count} members'`
        )
      );
    }
    if (!forms.has('other')) {
      fail(
        `The plural "${key}" needs an "other" form, used when no other form fits: ${key}: { one: '{count} member', other: '{count} members' }`
      );
    }
    return compilePlural(forms);
  }
  return readForm(
    what,
    text,
    `${key}: 'Hello {name}!'${kind === 'message' ? `, or a plural: ${key}: { one: '{count} member', other: '{count} members' }` : ''}`
  );
}

/** The language a file is named after, or an error saying which ones exist. */
function localeOf(path: string): Locale {
  const name = path.replace(/\.[^./]+$/, '');
  if (name.includes('/')) {
    fail(
      `A language is a file directly in src/messages/, named after the language: src/messages/${name.split('/').pop()}.ts. It can't be in a subfolder.`
    );
  }
  if (!LOCALES.has(name)) {
    fail(
      `"${name}" is not a language Discord knows: the name of a file of src/messages/ is the language it holds. It can be: ${[...LOCALES].join(', ')}.`
    );
  }
  return name as Locale;
}

/**
 * `src/messages/`: one file per language. Each file exports by default
 * what `language()` returns:
 *
 * ```ts
 * // src/messages/fr.ts
 * import { language } from 'chapterjs';
 *
 * export default language({ texts: { pong: 'Pong !' } });
 * ```
 */
export const languagesConvention: Convention<LoadedLanguage> = {
  folder: 'messages',
  one: 'language',
  many: 'languages',
  check(path) {
    localeOf(path);
  },
  read(exports, path) {
    const locale = localeOf(path);
    const file = exports.default;
    const example = `import { language } from 'chapterjs'; export default ${EXAMPLE}`;
    if (!isLanguageFile(file)) {
      return fail(
        'default' in exports
          ? `The default export of this file must be what language() returns: ${example}`
          : `This file has no default export. It should look like: ${example}`
      );
    }
    const config = file.config as unknown;
    if (!isRecord(config)) {
      return fail(`language() needs an object: ${EXAMPLE}`);
    }
    for (const key of Object.keys(config)) {
      if (!KEYS.includes(key)) {
        fail(
          `"${key}" is not something a language has. It can have: ${KEYS.join(', ')}.`
        );
      }
    }
    if (config.default !== undefined && typeof config.default !== 'boolean') {
      fail(
        `"default" is true or false, got ${JSON.stringify(config.default)}.`
      );
    }
    if (!isRecord(config.texts)) {
      fail(
        `"texts" is an object, one text per key: texts: { pong: 'Pong!', welcome: 'Welcome {name}!' }`
      );
    }
    const texts = new Map<string, Template>();
    for (const [key, text] of Object.entries(config.texts)) {
      texts.set(key, readText(key, text));
    }
    const framework = new Map<string, Template>();
    if (config.framework !== undefined) {
      if (!isRecord(config.framework)) {
        fail(
          `"framework" is an object, one phrase per key: framework: { guildOnly: '...' }. It can have: ${FRAMEWORK_KEYS.join(', ')}.`
        );
      }
      for (const [key, text] of Object.entries(config.framework)) {
        const expected = FRAMEWORK.get(key as never);
        if (!expected) {
          fail(
            `"${key}" is not a phrase of the framework. It can be: ${FRAMEWORK_KEYS.join(', ')}.`
          );
        }
        const template = readText(key, text, 'phrase');
        if (!samePlaceholders(template, expected)) {
          fail(
            `The phrase "${key}" does not have the placeholders of the framework: it has ${showParams(template.params)}, the framework has ${showParams(expected.params)}.`
          );
        }
        framework.set(key, template);
      }
    }
    if (config.commands !== undefined) {
      if (!isRecord(config.commands)) {
        fail(
          `"commands" is an object whose keys are the paths of your command files: commands: { ping: { description: '...' }, 'mod/ban': { name: '...' } }`
        );
      }
      for (const [path, translation] of Object.entries(config.commands)) {
        if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+){0,2}$/.test(path)) {
          fail(
            `"${path}" in "commands" is not the path of a command file: write it as the file is named, like 'ping' or 'mod/ban'.`
          );
        }
        if (!isRecord(translation)) {
          fail(
            `The texts of the command ${commandName(path.split('/'))} must be an object like { name: '...', description: '...' }.`
          );
        }
      }
    }
    return {
      locale,
      isDefault: config.default === true,
      texts,
      framework,
      commands: config.commands as
        Readonly<Record<string, unknown>> | undefined,
    };
  },
};

/** A language file as the project loaded it. */
export interface LanguageEntry {
  readonly file: string;
  readonly language: LoadedLanguage;
}

/**
 * Puts the languages together: one default, which `t` is typed from and
 * gives a text to the languages that do not have it, and every other
 * language with texts the default has, the same placeholders included. A
 * language that does not match is left out and reported on its file: the
 * others still work. `null` when there is no language at all.
 */
export function assembleMessages(entries: readonly LanguageEntry[]): {
  messages: LoadedMessages | null;
  failed: FailedFile[];
} {
  if (entries.length === 0) return { messages: null, failed: [] };
  const failed: FailedFile[] = [];
  const defaults = entries.filter(({ language }) => language.isDefault);
  let reference: LanguageEntry;
  if (entries.length === 1) {
    reference = entries[0]!;
  } else if (defaults.length === 1) {
    reference = defaults[0]!;
  } else if (defaults.length === 0) {
    // No default: nothing can be assembled.
    return {
      messages: null,
      failed: entries.map(({ file }) => ({
        file,
        error: new TypeError(
          `None of the ${entries.length} languages of src/messages/ is the default one, used when the language of a person or of a server is not there. Add default: true in one of them.`
        ),
      })),
    };
  } else {
    return {
      messages: null,
      failed: defaults.map(({ file }) => ({
        file,
        error: new TypeError(
          `${defaults.length} languages say default: true (${defaults.map(({ file }) => file).join(', ')}): only one can be the default.`
        ),
      })),
    };
  }
  const locales = new Map<Locale, ReadonlyMap<string, Template>>();
  const framework = new Map<Locale, ReadonlyMap<string, Template>>();
  const commands = new Map<Locale, Readonly<Record<string, unknown>>>();
  const files = new Map<Locale, string>();
  const name = reference.file.split('/').pop()!;
  for (const entry of entries) {
    const { file, language } = entry;
    try {
      // A text a language does not have is taken from the default one;
      // one the default does not have is dead: `t` offers the default's.
      if (entry !== reference) {
        for (const [key, template] of language.texts) {
          const expected = reference.language.texts.get(key);
          if (!expected) {
            fail(
              `The message "${key}" is not in ${name}: add it there, or remove it here.`
            );
          }
          if (!samePlaceholders(template, expected)) {
            fail(
              `The message "${key}" does not have the placeholders of ${name}: it has ${showParams([...template.params].sort())}, ${name} has ${showParams([...expected.params].sort())}.`
            );
          }
        }
      }
      locales.set(language.locale, language.texts);
      if (language.framework.size > 0) {
        framework.set(language.locale, language.framework);
      }
      files.set(language.locale, file);
      if (language.commands) commands.set(language.locale, language.commands);
    } catch (error) {
      failed.push({ file, error });
    }
  }
  return {
    messages: {
      default: reference.language.locale,
      locales,
      framework,
      commands,
      files,
    },
    failed,
  };
}

/**
 * The augmentation that types `t` from the files themselves: the editor
 * reads the default language of `src/messages/` directly, so the keys
 * and placeholders follow every keystroke; the other languages take the
 * texts they do not have from it. Which file is the default is known
 * once the files ran (`defaultFile`, from the loaded messages): until
 * then (`sync`), the first file is taken. Nothing when the folder has no
 * language.
 */
export function messagesDeclarations(
  files: readonly FoundFile[],
  defaultFile?: string
): string {
  const named = files.filter(({ file }) => {
    try {
      localeOf(file.slice('src/messages/'.length));
      return true;
    } catch {
      return false;
    }
  });
  const first = named.find(({ file }) => file === defaultFile) ?? named[0];
  if (!first) return '';
  const path = first.file.replace(/^src\//, '').replace(/\.[^./]+$/, '');
  const locales = named
    .map(
      ({ file }) =>
        `    ${JSON.stringify(localeOf(file.slice('src/messages/'.length)))}: true;`
    )
    .sort()
    .join('\n');
  return `import type { MessagesOf } from '#chapterjs';

declare module 'chapterjs' {
  /** The texts of src/messages/, as ${first.file} writes them: what \`t\` accepts. */
  export interface ProjectMessages
    extends MessagesOf<typeof import('../../src/${path}').default> {}
  /** The languages of src/messages/: what \`t.in()\` offers. */
  export interface ProjectLocales {
${locales}
  }
}
`;
}

/** A command file, and whether it has its own `description`. */
export interface DeclaredCommand {
  /** `src/commands/(mod)/mod/ban.ts` */
  readonly file: string;
  /**
   * Whether the file gives its own texts; `false` when it is not known,
   * like before the file ran: the language files may then describe it.
   */
  readonly described: boolean;
}

/**
 * The augmentation that offers the commands of the project in the
 * `commands` of a language file: the path of each command file, `true`
 * when the language files describe it and `false` when the file has its
 * own `description`, so that the editor only offers the first ones. The
 * path comes from the file name; whether it is described comes from
 * running the file (`dev` and `build` know it, `sync` does not). The
 * command files themselves are never referred to: their `t` is typed from
 * the languages, which would be a circle. Nothing when the project has no
 * command.
 */
export function commandsDeclarations(
  commands: readonly DeclaredCommand[]
): string {
  const entries = commands
    .map(({ file, described }) => {
      const inside = file.slice('src/commands/'.length);
      const path = logicalPath(inside).replace(/\.[^./]+$/, '');
      return `    ${JSON.stringify(path)}: ${!described};`;
    })
    .sort();
  if (entries.length === 0) return '';
  // A module (`export {}`), so that this augments 'chapterjs' instead of
  // declaring it anew.
  return `export {};

declare module 'chapterjs' {
  /** The commands of src/commands/, by the path of their file: true when the language files describe it, false when the file has its own description. */
  export interface ProjectCommands {
${entries.join('\n')}
  }
}
`;
}
