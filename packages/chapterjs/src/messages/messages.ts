// `language()`, as the files of `src/messages/` import it from 'chapterjs':
// every text the bot answers with in one language, and `t`, which handlers
// receive to pick the right one.
// https://docs.discord.com/developers/reference#locales

import type { CommandTranslation } from '../commands/command.js';
import type { Locale } from '../discord/types/common.js';

/**
 * A text with several forms, one per quantity: `t('members', { count })`
 * picks the form of the language for that number (`one` for 1 in
 * English, `other` for the rest; French, Russian or Arabic have others).
 * `other` is always there; the forms a language does not use are left
 * out. `{count}` in a form is the number itself.
 */
export interface PluralText {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/**
 * One text of a language: a string, with its `{placeholders}`, or a text
 * with several forms, picked by `count`.
 */
export type MessageText = string | PluralText;

/** The texts of one language, by key. */
export type MessageTexts = Record<string, MessageText>;

/**
 * What the bot answers by itself, when it can't run what was asked: where
 * a command or a component can't be used, a button of an old message, a
 * `run` that failed... Every phrase has an English version; a language
 * file gives its own in `framework`, the ones it wants. `{what}` is the
 * word for what was used: `command`, `button`, `menu` or `form`, given
 * here too.
 */
export interface FrameworkTexts {
  /** The word for a command: "command". */
  command: string;
  /** The word for a button: "button". */
  button: string;
  /** The word for a select menu: "menu". */
  menu: string;
  /** The word for a form: "form". */
  form: string;
  /** "This {what} can only be used in a server." */
  guildOnly: string;
  /** "This {what} can only be used in a private message with me." */
  dmOnly: string;
  /** "This {what} can not be used here." */
  notHere: string;
  /** "This command is not available right now." (its file is gone or broken) */
  unavailable: string;
  /** "This {what} is not available any more." (an old message, its file is gone) */
  gone: string;
  /** "This {what} is out of date." (an old message, its `data` changed) */
  outdated: string;
  /** "Only the person who used the command can use this {what}." */
  authorOnly: string;
  /** "Something went wrong while running this {what}." */
  failed: string;
  /** "I don't have the permission to do that here." */
  missingPermission: string;
  /**
   * "You need the {permissions} permission to use this command." A plural
   * of `count`, how many permissions are missing; `{permissions}` is their
   * names, separated by commas.
   */
  needsPermissions: MessageText;
}

/**
 * The commands of the project, as the editor sees them: the path of each
 * command file, `true` when the language files describe it, `false` when
 * the file has its own `description`. Filled in by the `.chapterjs/`
 * folder of the project, so that the `commands` of a language file offers
 * the ones it may translate. The options and choices are checked when the
 * files load.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProjectCommands {}

/** The paths of the commands the language files describe. */
type TranslatableCommand = {
  [Path in keyof ProjectCommands]: ProjectCommands[Path] extends true
    ? Path
    : never;
}[keyof ProjectCommands];

/**
 * What Discord shows of the commands in one language: by the path of the
 * command file (`'ping'`, `'mod/ban'`), its name, description, options and
 * choices in that language, as the `locales` of a command file take them.
 * The editor offers the commands of the project that have no `description`
 * in their file (one that has owns its texts, `locales` included); their
 * options and choices are checked when the files load.
 */
export type CommandsTranslations = [keyof ProjectCommands] extends [never]
  ? Readonly<Record<string, CommandTranslation>>
  : [TranslatableCommand] extends [never]
    ? Readonly<Record<string, never>>
    : { readonly [Path in TranslatableCommand]?: CommandTranslation };

/** What a file of `src/messages/` gives to `language()`. */
export interface LanguageConfig<T extends MessageTexts = MessageTexts> {
  /**
   * Whether this is the language used when the one of a person or of a
   * server is not in `src/messages/`. Exactly one file says so; with one
   * file, it goes without saying.
   */
  default?: boolean;
  /** The texts of the bot in this language, by key. */
  texts: T;
  /** What Discord shows of the commands in this language. */
  commands?: CommandsTranslations;
  /**
   * What the bot answers by itself in this language, when it can't run
   * what was asked: the phrases of `FrameworkTexts`, the ones this file
   * wants to translate. The others stay in English.
   */
  framework?: Partial<FrameworkTexts>;
}

/** The text of a key, when it is one. */
type TextOf<M, K extends keyof M> = M[K] extends MessageText ? M[K] : string;

/**
 * The placeholders found in a string, read from left to right like the
 * bot does: `{{` is a `{` written as is, and a `{` with another `{` before
 * its `}` is one too.
 */
type Found<S extends string> = S extends `${string}{${infer After}`
  ? After extends `{${infer Rest}`
    ? Found<Rest>
    : After extends `${infer Name}}${infer Rest}`
      ? Name extends `${string}{${string}`
        ? Found<After>
        : Name | Found<Rest>
      : never
  : never;

/**
 * The placeholders of a text: `'Hello {name}'` has `'name'`. Written
 * between braces, a placeholder is a name made of letters, digits and `_`;
 * `{{` and `}}` are braces written as is. A plural has `count`, and the
 * placeholders of its forms.
 */
export type Placeholders<T extends MessageText> = T extends string
  ? Found<T>
  : T extends PluralText
    ? 'count' | Found<Extract<T[keyof T], string>>
    : never;

/**
 * What `t` takes for a text: one value per placeholder, or nothing when
 * the text has none. A number is written the way the language writes
 * numbers (`1,234` in English, `1 234` in French): give a text to keep it
 * as is. The `count` of a plural is a number.
 */
export type ParamsOf<T extends MessageText> = {
  [Name in Placeholders<T>]: Name extends 'count'
    ? T extends PluralText
      ? number
      : string | number
    : string | number;
};

/** The arguments of `t` after the key: the params, only when there are some. */
export type ParamsArgs<T extends MessageText> = string extends T
  ? [params?: Record<string, string | number>]
  : [Placeholders<T>] extends [never]
    ? []
    : [params: ParamsOf<T>];

/**
 * `t`, as handlers receive it: gives a text of `src/messages/` in the
 * language of who will read the message, with its placeholders filled in.
 * `M` is the texts of the default language, which types the keys and the
 * params: a text another language does not have is taken from it.
 */
export interface Translator<M extends object = ProjectMessages> {
  <K extends keyof M & string>(
    key: K,
    ...params: ParamsArgs<TextOf<M, K>>
  ): string;
  /** The language the texts come from: the one asked, or the closest one declared. */
  readonly locale: Locale;
  /** The same, for another language: `t.in('fr')('welcome', { name })`. */
  in(locale: Locale): Translator<M>;
}

/**
 * The texts of `src/messages/`, as the editor sees them: the keys `t`
 * accepts and the placeholders of each. Filled in by the `.chapterjs/`
 * folder of the project when the folder has a language, empty otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProjectMessages {}

/** What `t` is typed from, for a language file: its texts. */
export type MessagesOf<F> = F extends LanguageFile<infer T> ? T : never;

/**
 * What every handler receives when the project has a language in
 * `src/messages/`: `t`. Nothing otherwise.
 */
export type TranslationContext = [keyof ProjectMessages] extends [never]
  ? {}
  : {
      /** The texts of `src/messages/`, in the right language. */ t: Translator;
    };

/** What `language()` returns: the default export of a file of `src/messages/`. */
export interface LanguageFile<T extends MessageTexts = MessageTexts> {
  /** What the file gave to `language()`, not checked yet. */
  readonly config: LanguageConfig<T>;
}

const BRAND = Symbol.for('chapterjs.language');

/**
 * Declares one language of the bot. Export the result as the default
 * export of a file of `src/messages/` named after the language
 * (`en-US.ts`, `fr.ts`...): every handler then receives `t`, which gives a
 * text in the language of who will read the message, with its
 * `{placeholders}` filled in.
 *
 * ```ts
 * // src/messages/fr.ts
 * import { language } from 'chapterjs';
 *
 * export default language({
 *   texts: { pong: 'Pong !', welcome: 'Bienvenue {name} !' },
 * });
 * ```
 */
export function language<const T extends MessageTexts>(
  config: LanguageConfig<T>
): LanguageFile<T> {
  return Object.freeze({ [BRAND]: true, config });
}

/** Whether a value was made by `language()`. */
export function isLanguageFile(value: unknown): value is LanguageFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
