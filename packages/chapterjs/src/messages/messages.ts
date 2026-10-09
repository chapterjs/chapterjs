// `language()`, as user files import it from 'chapterjs': every text the
// bot answers with in one language, and `t`, which handlers receive to pick
// the right one.
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
   * "You can use this {what} again {when}." (a `cooldown` not over yet);
   * `{when}` is a Discord timestamp, shown as "in 5 seconds" (or a date
   * and time past 15 minutes) in the language of the person.
   */
  cooldown: string;
  /**
   * "You need the {permissions} permission to use this command." A plural
   * of `count`, how many permissions are missing; `{permissions}` is their
   * names, separated by commas.
   */
  needsPermissions: MessageText;
}

/**
 * The commands of the project, as the editor sees them: the name of each
 * command, `true` when the language files describe it, `false` when the
 * command has its own `description`. Filled in by the `.chapterjs/` folder
 * of the project, so that the `commands` of a language file offers the
 * ones it may translate. The options and choices are checked when the
 * files load.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProjectCommands {}

/** The names of the commands the language files describe. */
type TranslatableCommand = {
  [Path in keyof ProjectCommands]: ProjectCommands[Path] extends true
    ? Path
    : never;
}[keyof ProjectCommands];

/**
 * What Discord shows of the commands in one language: by the name of the
 * command (`'ping'`, `'mod ban'`), its name, description, options and
 * choices in that language, as the `locales` of a command take them. The
 * editor offers the commands of the project that have no `description`
 * (one that has owns its texts, `locales` included); their options and
 * choices are checked when the files load.
 */
export type CommandsTranslations = [keyof ProjectCommands] extends [never]
  ? Readonly<Record<string, CommandTranslation>>
  : [TranslatableCommand] extends [never]
    ? Readonly<Record<string, never>>
    : { readonly [Path in TranslatableCommand]?: CommandTranslation };

/**
 * The languages that say `default: true` when more than one does, as the
 * editor sees them: one key per language. Filled in by the `.chapterjs/`
 * folder of the project, so that each of them is underlined; empty when at
 * most one language says it.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProjectLanguageDefaults {}

/** What a file gives to `language()`. */
export interface LanguageConfig<
  T extends MessageTexts = MessageTexts,
  L extends Locale = Locale,
> {
  /** The language these texts are in: `'en-US'`, `'fr'`... */
  locale: L;
  /**
   * Whether this is the language used when the one of a person or of a
   * server is not declared. Exactly one language says so; with one
   * language, it goes without saying. When another language already says
   * it, this is refused: only one can be the default.
   */
  default?: L extends keyof ProjectLanguageDefaults ? false : boolean;
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
 * The languages of the project, as the editor sees them: one key per
 * language declared. Filled in by the `.chapterjs/` folder of the project,
 * empty when the project has no language.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProjectLocales {}

/** A language of the project: `'en-US'`, `'fr'`... */
export type ProjectLocale = keyof ProjectLocales & string;

/**
 * A language given to `t.in()`: the editor offers the ones of the
 * project, and any language of Discord is accepted (the one of a
 * person, of a server), `t` then taking the closest one declared. A word
 * that is no language of Discord is underlined, with the ones of the
 * project.
 */
export type LocaleGiven<L extends string> = L extends Locale
  ? L
  : ProjectLocale;

/**
 * `t`, as handlers receive it: gives a text of the language files in the
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
  /**
   * A text in another language: `t.in('fr', 'welcome', { name })`, or
   * `t.in(owner.locale, 'pong')`. The language of the person who will read
   * it, when it is not the one `t` speaks.
   */
  in<L extends ProjectLocale | (string & {}), K extends keyof M & string>(
    locale: LocaleGiven<L>,
    key: K,
    ...params: ParamsArgs<TextOf<M, K>>
  ): string;
  /** The same `t` for another language, to write several texts: `t.in('fr')('welcome', { name })`. */
  in<L extends ProjectLocale | (string & {})>(
    locale: LocaleGiven<L>
  ): Translator<M>;
}

/**
 * The texts of the project, as the editor sees them: the keys `t` accepts
 * and the placeholders of each. Filled in by the `.chapterjs/` folder of
 * the project when it has a language, empty otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProjectMessages {}

/** What `t` is typed from, for a language: its texts. */
export type MessagesOf<F> = F extends LanguageDeclaration<infer T> ? T : never;

/**
 * The texts of several declarations, the first one winning for a key
 * several have: what `t` is typed from when a project has several
 * languages, the default one first, then the others (a text the default
 * language does not have is taken from the language that has it).
 */
export type MergedMessages<T extends readonly object[]> = T extends readonly [
  infer First extends object,
  ...infer Rest extends readonly object[],
]
  ? // A declaration the editor can't type (a mistake in it leaves its texts
    // as any record) must not open `t` to every key: it is left out.
    string extends keyof First
    ? MergedMessages<Rest>
    : First & Omit<MergedMessages<Rest>, keyof First>
  : {};

/**
 * What every handler receives when the project has a language: `t`.
 * Nothing otherwise.
 */
export type TranslationContext = [keyof ProjectMessages] extends [never]
  ? {}
  : {
      /** The texts of the language files, in the right language. */ t: Translator;
    };

/** What `language()` returns: a declaration the framework finds in the exports of a file. */
export interface LanguageDeclaration<
  T extends MessageTexts = MessageTexts,
  L extends Locale = Locale,
> {
  /** What the file gave to `language()`, not checked yet. */
  readonly config: LanguageConfig<T, L>;
}

const BRAND = Symbol.for('chapterjs.language');

/**
 * Declares one language of the bot, or more texts of it. Export the result
 * from any file of `src/`; `locale` says which language: every handler
 * then receives `t`, which gives a text in the language of who will read
 * the message, with its `{placeholders}` filled in. A language may be
 * declared in several places: the texts of a feature next to it, with the
 * same `locale`, add to the others.
 *
 * ```ts
 * import { language } from 'chapterjs';
 *
 * export default language({
 *   locale: 'fr',
 *   texts: { pong: 'Pong !', welcome: 'Bienvenue {name} !' },
 * });
 * ```
 */
export function language<const T extends MessageTexts, L extends Locale>(
  config: LanguageConfig<T, L>
): LanguageDeclaration<T, L> {
  return Object.freeze({ [BRAND]: true, config });
}

/** Whether a value was made by `language()`. */
export function isLanguageDeclaration(
  value: unknown
): value is LanguageDeclaration {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
