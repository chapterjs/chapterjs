// The `commands` of the language files: what Discord shows of each command
// in each language. A command has its texts in one place: in
// its file (`description`, `locales`), or in the language files, where the
// default language gives what Discord shows to everyone and the others
// their translations. Which one is decided by `description` in the file.

import {
  checkLocales,
  type LoadedCommand,
  type LoadedOption,
} from '../commands/declaration.js';
import { commandName } from '../commands/tree.js';
import type { Locale } from '../discord/types/common.js';
import type { FailedFile } from '../loader/loader.js';
import type { LoadedMessages } from './translate.js';

/** A command given its texts by the language files. */
export interface TranslatedCommand {
  /** The command, described; `null` when it can't be, said in `failed`. */
  readonly command: LoadedCommand | null;
  /** What is wrong, on the file it is wrong in. */
  readonly failed: readonly FailedFile[];
}

/** The names the languages translate that no command has, by file. */
export function unknownCommands(
  messages: LoadedMessages,
  known: ReadonlySet<string>
): { file: string; path: string }[] {
  const unknown: { file: string; path: string }[] = [];
  for (const [locale, section] of messages.commands) {
    for (const path of Object.keys(section)) {
      if (!known.has(path)) {
        unknown.push({ file: messages.files.get(locale)!, path });
      }
    }
  }
  return unknown;
}

/** Where the default language file is, or would be. */
export const defaultLanguageFile = (messages: LoadedMessages | null): string =>
  messages?.files.get(messages.default) ?? 'the default language file';

/**
 * Gives a command its texts from the languages, when its file does not
 * describe it; refuses the languages that describe a command its file
 * already does. What is wrong is reported on the file it is wrong in.
 */
export function translateCommand(
  file: string,
  command: LoadedCommand,
  messages: LoadedMessages | null
): TranslatedCommand {
  const path = command.path.join(' ');
  const name = commandName(command.path);
  const failed: FailedFile[] = [];
  const languages = [...(messages?.commands ?? [])].filter(
    ([, section]) => path in section
  );

  if (command.described) {
    for (const [locale] of languages) {
      failed.push({
        file: messages!.files.get(locale)!,
        error: new TypeError(
          `${name} is described in ${file}: remove its description there to translate it here, or remove it here.`
        ),
      });
    }
    return { command, failed };
  }

  const where = defaultLanguageFile(messages);
  const example = (inside: string): string =>
    `${where} (commands: { ${JSON.stringify(path)}: { ${inside} } })`;
  // Each language is checked on its own, so an error names its file.
  const given = new Map<Locale, ReturnType<typeof checkLocales>>();
  for (const [locale, section] of languages) {
    try {
      given.set(
        locale,
        checkLocales({ [locale]: section[path] }, command.options)
      );
    } catch (error) {
      failed.push({
        file: messages!.files.get(locale)!,
        error: new TypeError(
          `In "commands", for ${name}: ${error instanceof Error ? error.message : String(error)}`
        ),
      });
    }
  }
  // The default language describes the command; when it does not, the
  // first language that does (en-US first) is what Discord shows to all.
  const order = messages
    ? [...given.keys()].sort((a, b) =>
        a === messages.default
          ? -1
          : b === messages.default
            ? 1
            : a === 'en-US'
              ? -1
              : b === 'en-US'
                ? 1
                : a < b
                  ? -1
                  : 1
      )
    : [];
  const mainLocale =
    order.find(locale => given.get(locale)!.descriptions[locale]) ??
    messages?.default;
  const main = mainLocale ? given.get(mainLocale) : undefined;
  const description = mainLocale ? main?.descriptions[mainLocale] : undefined;
  if (description === undefined) {
    failed.push({
      file,
      error: new TypeError(
        `This command has no description: write it in ${example("description: '...'")}, or in the file (description: '...').`
      ),
    });
    return { command: null, failed };
  }
  const options: LoadedOption[] = [];
  for (const option of command.options) {
    const text =
      option.description ||
      (mainLocale
        ? main?.optionLocales[option.name]?.descriptions[mainLocale]
        : undefined);
    if (!text) {
      failed.push({
        file,
        error: new TypeError(
          `The option "${option.name}" of ${name} has no description: write it in ${example(`options: { ${option.name}: { description: '...' } }`)}, or in the file.`
        ),
      });
      return { command: null, failed };
    }
    options.push({ ...option, description: text });
  }

  // The other languages are translations; the default one is what Discord
  // shows to everyone, and needs none.
  const names: Partial<Record<Locale, string>> = {};
  const descriptions: Partial<Record<Locale, string>> = {};
  const optionLocales: Record<
    string,
    {
      names: Partial<Record<Locale, string>>;
      descriptions: Partial<Record<Locale, string>>;
      choices: Record<string, Partial<Record<Locale, string>>>;
    }
  > = {};
  for (const [locale, texts] of given) {
    if (locale === mainLocale) continue;
    const text = texts.names[locale];
    if (text !== undefined) names[locale] = text;
    const about = texts.descriptions[locale];
    if (about !== undefined) descriptions[locale] = about;
    for (const [option, theirs] of Object.entries(texts.optionLocales)) {
      const target = (optionLocales[option] ??= {
        names: {},
        descriptions: {},
        choices: {},
      });
      const optionName = theirs.names[locale];
      if (optionName !== undefined) target.names[locale] = optionName;
      const optionAbout = theirs.descriptions[locale];
      if (optionAbout !== undefined) target.descriptions[locale] = optionAbout;
      for (const [choice, choiceTexts] of Object.entries(theirs.choices)) {
        const choiceText = choiceTexts[locale];
        if (choiceText !== undefined) {
          (target.choices[choice] ??= {})[locale] = choiceText;
        }
      }
    }
  }
  return {
    command: {
      ...command,
      description,
      options: Object.freeze(options),
      names,
      descriptions,
      optionLocales,
    },
    failed,
  };
}
