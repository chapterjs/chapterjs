// What a file declares with `language()`: the texts of the bot in one
// language. What a file declares is checked when it loads, and the
// languages are checked against each other once loaded: every one has the
// texts of the default language, with the same placeholders, so a missing
// text is explained before anyone asks for it.

import { readFile } from 'node:fs/promises';
import { commandName } from '../commands/tree.js';
import type { Locale } from '../discord/types/common.js';
import {
  listSources,
  siteName,
  type Declaration,
  type ExportSite,
  type FailedFile,
} from '../loader/loader.js';
import { isLanguageDeclaration } from './messages.js';
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

/** A language, checked: what the languages are assembled from. */
export interface LoadedLanguage {
  /** The language. */
  readonly locale: Locale;
  /** Whether it says it is the default language. */
  readonly isDefault: boolean;
  /** The texts, compiled. */
  readonly texts: ReadonlyMap<string, Template>;
  /** The phrases of the framework this file translates, compiled. */
  readonly framework: ReadonlyMap<string, Template>;
  /** The `commands` section, by the name of the command, not checked yet. */
  readonly commands: Readonly<Record<string, unknown>> | undefined;
}

const fail: (message: string) => never = message => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEYS = ['locale', 'default', 'texts', 'commands', 'framework'];

const EXAMPLE = `language({ locale: 'en-US', texts: { pong: 'Pong!' } })`;

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

/** The language a declaration says it is, or an error saying which ones exist. */
function readLocale(locale: unknown): Locale {
  if (locale === undefined) {
    fail(
      `This language has no "locale": the language its texts are in, like ${EXAMPLE}. It can be: ${[...LOCALES].join(', ')}.`
    );
  }
  if (typeof locale !== 'string' || !LOCALES.has(locale)) {
    fail(
      `${JSON.stringify(locale) ?? typeof locale} is not a language Discord knows. "locale" can be: ${[...LOCALES].join(', ')}.`
    );
  }
  return locale as Locale;
}

/**
 * A language, declared anywhere in `src/` with `language()`: `locale` says
 * which one, `texts` what the bot says in it.
 */
export const languageDeclaration: Declaration<LoadedLanguage> = {
  one: 'language',
  many: 'languages',
  is: isLanguageDeclaration,
  list: true,
  read(value) {
    const config = (value as { config: unknown }).config;
    if (!isRecord(config)) {
      return fail(`language() needs an object: ${EXAMPLE}`);
    }
    const locale = readLocale(config.locale);
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
      for (const [name, translation] of Object.entries(config.commands)) {
        if (!/^[^\s]+(?: [^\s]+){0,2}$/.test(name)) {
          fail(
            `"${name}" in "commands" is not the name of a command: write it as the command declares it, like 'ping' or 'mod ban'.`
          );
        }
        if (!isRecord(translation)) {
          fail(
            `The texts of the command ${commandName(name.split(' '))} must be an object like { name: '...', description: '...' }.`
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

/** A language as the project loaded it, with where it is declared. */
export interface LanguageEntry extends ExportSite {
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
  // A language may be declared in several places (the texts of one feature
  // next to it): what says default: true decides for the whole language.
  const byLocale = new Map<Locale, LanguageEntry[]>();
  for (const entry of entries) {
    const list = byLocale.get(entry.language.locale) ?? [];
    list.push(entry);
    byLocale.set(entry.language.locale, list);
  }
  const defaults = [...byLocale.keys()].filter(locale =>
    byLocale.get(locale)!.some(({ language }) => language.isDefault)
  );
  let defaultLocale: Locale;
  if (byLocale.size === 1) {
    defaultLocale = entries[0]!.language.locale;
  } else if (defaults.length === 1) {
    defaultLocale = defaults[0]!;
  } else if (defaults.length === 0) {
    // No default: nothing can be assembled.
    return {
      messages: null,
      failed: entries.map(({ file, export: exported }) => ({
        file,
        export: exported,
        error: new TypeError(
          `None of the ${byLocale.size} languages is the default one, used when the language of a person or of a server is not there. Add default: true in one of them.`
        ),
      })),
    };
  } else {
    const saying = entries.filter(({ language }) => language.isDefault);
    return {
      messages: null,
      failed: saying.map(entry => ({
        file: entry.file,
        export: entry.export,
        error: new TypeError(
          `${defaults.length} languages say default: true (${saying.map(one => `${one.language.locale} in ${siteName(one)}`).join(', ')}): only one can be the default.`
        ),
      })),
    };
  }

  /** The texts of one language, from every place it is declared. */
  const merge = (
    locale: Locale,
    what: 'texts' | 'framework',
    kind: string,
    onConflict: (entry: LanguageEntry, error: unknown) => void
  ): Map<string, Template> => {
    const merged = new Map<string, Template>();
    const from = new Map<string, LanguageEntry>();
    for (const entry of byLocale.get(locale)!) {
      for (const [key, template] of entry.language[what]) {
        const first = from.get(key);
        if (first) {
          onConflict(
            entry,
            new TypeError(
              `The ${kind} "${key}" is already in ${siteName(first)}: the ${locale} language has it twice.`
            )
          );
          continue;
        }
        from.set(key, entry);
        merged.set(key, template);
      }
    }
    return merged;
  };
  const report = (entry: LanguageEntry, error: unknown): void => {
    failed.push({ file: entry.file, export: entry.export, error });
  };
  const referenceTexts = merge(defaultLocale, 'texts', 'message', report);
  const referenceSites = byLocale.get(defaultLocale)!;
  const name = `the default language (${referenceSites.map(siteName).join(', ')})`;
  // A text the default language does not have is taken from the language
  // that has it (en-US first, then the others in order): the texts of a
  // module written in other languages than the project's default still
  // work, and `t` offers them. Where each such text comes from decides
  // the placeholders every language must then follow.
  const fallbackOrder = [...byLocale.keys()]
    .filter(locale => locale !== defaultLocale)
    .sort((a, b) => (a === 'en-US' ? -1 : b === 'en-US' ? 1 : a < b ? -1 : 1));
  const fallbackFrom = new Map<string, LanguageEntry>();
  for (const locale of fallbackOrder) {
    for (const entry of byLocale.get(locale)!) {
      for (const [key, template] of entry.language.texts) {
        if (referenceTexts.has(key)) continue;
        referenceTexts.set(key, template);
        fallbackFrom.set(key, entry);
      }
    }
  }
  const referenceName = (key: string): string => {
    const from = fallbackFrom.get(key);
    return from
      ? `${from.language.locale} (${siteName(from)}), the language this message comes from`
      : name;
  };

  const locales = new Map<Locale, ReadonlyMap<string, Template>>();
  const framework = new Map<Locale, ReadonlyMap<string, Template>>();
  const commands = new Map<Locale, Readonly<Record<string, unknown>>>();
  const files = new Map<Locale, string>();
  for (const [locale, group] of byLocale) {
    // A text a language does not have is taken from the default one (or
    // from the language the text comes from): every language that has it
    // must take the same placeholders.
    const kept: LanguageEntry[] = [];
    for (const entry of group) {
      try {
        if (locale !== defaultLocale) {
          for (const [key, template] of entry.language.texts) {
            const expected = referenceTexts.get(key)!;
            if (
              expected !== template &&
              !samePlaceholders(template, expected)
            ) {
              fail(
                `The message "${key}" does not have the placeholders of ${referenceName(key)}: it has ${showParams([...template.params].sort())}, that one has ${showParams([...expected.params].sort())}.`
              );
            }
          }
        }
        kept.push(entry);
      } catch (error) {
        report(entry, error);
      }
    }
    if (kept.length === 0) continue;
    const texts =
      locale === defaultLocale
        ? referenceTexts
        : new Map(kept.flatMap(({ language }) => [...language.texts]));
    if (locale !== defaultLocale) {
      // The same message twice in a language that is not the default.
      const from = new Map<string, LanguageEntry>();
      for (const entry of kept) {
        for (const key of entry.language.texts.keys()) {
          const first = from.get(key);
          if (first) {
            report(
              entry,
              new TypeError(
                `The message "${key}" is already in ${siteName(first)}: the ${locale} language has it twice.`
              )
            );
          } else from.set(key, entry);
        }
      }
    }
    locales.set(locale, texts);
    const phrases = merge(locale, 'framework', 'phrase', report);
    if (phrases.size > 0) framework.set(locale, phrases);
    files.set(locale, kept[0]!.file);
    const sections = kept.filter(({ language }) => language.commands);
    if (sections.length > 0) {
      const translated: Record<string, unknown> = {};
      const from = new Map<string, LanguageEntry>();
      for (const entry of sections) {
        for (const [command, section] of Object.entries(
          entry.language.commands!
        )) {
          const first = from.get(command);
          if (first) {
            report(
              entry,
              new TypeError(
                `The command "${command}" is already translated in ${siteName(first)}: the ${locale} language translates it twice.`
              )
            );
            continue;
          }
          from.set(command, entry);
          translated[command] = section;
        }
      }
      commands.set(locale, translated);
    }
  }
  return {
    messages: { default: defaultLocale, locales, framework, commands, files },
    failed,
  };
}

/** A language, where it is declared. */
export interface DeclaredLanguage extends ExportSite {
  readonly locale: Locale;
}

/**
 * The augmentation that types `t` from the files themselves: the editor
 * reads every declaration of the default language directly, so the keys
 * and placeholders follow every keystroke; the other languages take the
 * texts they do not have from it. `languages` is every language declared,
 * `defaultLocale` the one `t` is typed from (the first one when it is not
 * known yet: `sync`, which runs nothing). Nothing when the project has no
 * language.
 */
export function messagesDeclarations(
  languages: readonly DeclaredLanguage[],
  defaultLocale?: Locale
): string {
  const bySite = (a: DeclaredLanguage, b: DeclaredLanguage): number =>
    a.file === b.file
      ? a.export < b.export
        ? -1
        : 1
      : a.file < b.file
        ? -1
        : 1;
  const sorted = [...languages].sort(bySite);
  const first =
    sorted.find(({ locale }) => locale === defaultLocale) ?? sorted[0];
  if (!first) return '';
  // Every declaration, the default language first, then en-US, then the
  // others: `t` knows the texts of each, the first one winning for a key
  // several have, as the bot does.
  const rank = (locale: Locale): number =>
    locale === first.locale ? 0 : locale === 'en-US' ? 1 : 2;
  const ordered = [...sorted].sort(
    (a, b) =>
      rank(a.locale) - rank(b.locale) ||
      (a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0) ||
      bySite(a, b)
  );
  const parts = ordered.map(one => {
    const path = one.file.replace(/^src\//, '').replace(/\.[^./]+$/, '');
    const member =
      one.export === 'default'
        ? '.default'
        : /^[A-Za-z_$][\w$]*$/.test(one.export)
          ? `.${one.export}`
          : `[${JSON.stringify(one.export)}]`;
    return `MessagesOf<typeof import('../../src/${path}')${member}>`;
  });
  const where = ordered
    .filter(({ locale }) => locale === first.locale)
    .map(siteName)
    .join(', ');
  const locales = [...new Set(sorted.map(({ locale }) => locale))]
    .map(locale => `    ${JSON.stringify(locale)}: true;`)
    .sort()
    .join('\n');
  return `import type { MergedMessages, MessagesOf } from '#chapterjs';

declare module 'chapterjs' {
  /** The texts of the bot, as ${where} ${where.includes(',') ? 'write' : 'writes'} them (the ${first.locale} language), then what the other languages add: what \`t\` accepts. */
  export interface ProjectMessages
    extends MergedMessages<
      [
        ${parts.join(',\n        ')},
      ]
    > {}
  /** The languages of the project: what \`t.in()\` offers. */
  export interface ProjectLocales {
${locales}
  }
}
`;
}

/**
 * The augmentation that underlines a second default language in the
 * editor: when more than one language says `default: true` (`defaults`,
 * the ones that do, known once the files ran), `language()` refuses
 * `default: true` for each of them, so they are both underlined and not
 * only reported in the console. Nothing when at most one says it.
 */
export function languageDefaultsDeclaration(
  defaults: readonly Locale[]
): string {
  const unique = [...new Set(defaults)].sort();
  if (unique.length < 2) return '';
  return `export {};

declare module 'chapterjs' {
  /** The languages that say \`default: true\`: only one can be the default, so \`default: true\` is refused in each of them until one gives it up. */
  export interface ProjectLanguageDefaults {
${unique.map(locale => `    ${JSON.stringify(locale)}: true;`).join('\n')}
  }
}
`;
}

/** `export default language(` or `export const fr = language(`, with the config that follows. */
const DECLARED =
  /export\s+(?:default|const\s+([A-Za-z_$][\w$]*)\s*=)\s*language\s*\(\s*\{([^]*?)\}\s*\)/g;

/**
 * The languages of a project, found without running its files: a text
 * search for `language({ locale: '...' })` in the exports of each file.
 * Approximate on purpose, for `sync`, which runs nothing: `dev` and
 * `build` then write the exact ones. Returns the languages with the one
 * that says `default: true`, when one does.
 */
export async function scanLanguages(
  cwd: string
): Promise<{ languages: DeclaredLanguage[]; defaultLocale?: Locale }> {
  const languages: DeclaredLanguage[] = [];
  let defaultLocale: Locale | undefined;
  for (const { file, path } of await listSources(cwd)) {
    const code = await readFile(path, 'utf8').catch(() => '');
    if (!code.includes('language(')) continue;
    for (const match of code.matchAll(DECLARED)) {
      const config = match[2] ?? '';
      const locale = /\blocale\s*:\s*['"`]([\w-]+)['"`]/.exec(config)?.[1];
      if (!locale || !LOCALES.has(locale)) continue;
      const exported = match[1] ?? 'default';
      languages.push({
        file,
        export: exported,
        name: exported === 'default' ? baseName(file) : exported,
        locale: locale as Locale,
      });
      if (/\bdefault\s*:\s*true\b/.test(config)) {
        defaultLocale ??= locale as Locale;
      }
    }
  }
  return defaultLocale === undefined
    ? { languages }
    : { languages, defaultLocale };
}

const baseName = (file: string): string =>
  file
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '');

/** A command, and whether it has its own `description`. */
export interface DeclaredCommand {
  /** `'ping'`, `'mod ban'` */
  readonly name: string;
  /**
   * Whether the command gives its own texts; `false` when it is not
   * known, like before the files ran: the language files may then
   * describe it.
   */
  readonly described: boolean;
}

/**
 * The augmentation that offers the commands of the project in the
 * `commands` of a language: the name of each command, `true` when the
 * language files describe it and `false` when the command has its own
 * `description`, so that the editor only offers the first ones. Both come
 * from running the files (`dev` and `build` know them, `sync` does not and
 * offers any name). Nothing when the project has no command.
 */
export function commandsDeclarations(
  commands: readonly DeclaredCommand[]
): string {
  const entries = commands
    .map(({ name, described }) => `    ${JSON.stringify(name)}: ${!described};`)
    .sort();
  if (entries.length === 0) return '';
  // A module (`export {}`), so that this augments 'chapterjs' instead of
  // declaring it anew.
  return `export {};

declare module 'chapterjs' {
  /** The commands of the project, by name: true when the language files describe it, false when the command has its own description. */
  export interface ProjectCommands {
${entries.join('\n')}
  }
}
`;
}
