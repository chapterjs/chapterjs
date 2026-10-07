// `src/commands/`: the path of a file is the name of a slash command.
// Everything a file declares is checked when it loads, against the limits
// of Discord, so a mistake is explained before Discord refuses it.
// https://docs.discord.com/developers/interactions/application-commands

import { ALL_PERMISSIONS } from '../discord/permissions.js';
import { ChannelType } from '../discord/types/channel.js';
import { Locale } from '../discord/types/common.js';
import { PermissionFlags } from '../discord/types/permissions.js';
import {
  COOLDOWN_SCOPES,
  NO_COOLDOWN,
  type CooldownLimits,
} from '../interactions/cooldown.js';
import type { Convention } from '../loader/loader.js';
import { DURATION_EXAMPLE, parseDuration } from '../util/duration.js';
import {
  isCommandFile,
  type AutocompleteContext,
  type CommandConfig,
  type CommandContext,
  type CommandOption,
  type CommandWhere,
  type Suggestion,
} from './command.js';

/** A name or a description in other languages, as Discord takes them. */
export type Localizations = Readonly<Partial<Record<Locale, string>>>;

/** The translations of one option, checked. */
export interface OptionLocales {
  readonly names: Localizations;
  readonly descriptions: Localizations;
  /** For each choice (by its default name), its name in other languages. */
  readonly choices: Readonly<Record<string, Localizations>>;
}

/** An option, checked, with the description it has so far. */
export type LoadedOption = CommandOption & {
  name: string;
  description: string;
};

/** An `autocomplete` function of a file, as the router runs it. */
export type AutocompleteFunction = (
  context: AutocompleteContext
) => readonly Suggestion[] | Promise<readonly Suggestion[]>;

/** A command file, checked: what the rest of the feature works with. */
export interface LoadedCommand {
  /** The name and description of the command in other languages. */
  readonly names: Localizations;
  readonly descriptions: Localizations;
  /** The translations of the options, by option name. */
  readonly optionLocales: Readonly<Record<string, OptionLocales>>;
  /** `['mod', 'ban']` for `src/commands/mod/ban.ts`: `/mod ban`. */
  readonly path: readonly string[];
  /**
   * Whether the file gives its own texts (`description`, `locales`). When
   * it does not, the language files of `src/messages/` do: `description`
   * and the descriptions of the options are empty until `project.ts`
   * fills them in from the default language.
   */
  readonly described: boolean;
  readonly description: string;
  /** The options, required ones first as Discord wants them. */
  readonly options: readonly LoadedOption[];
  /** The permissions needed, as bits. */
  readonly permissions: bigint;
  /** Where it can be used; in servers when the file does not say. */
  readonly where: CommandWhere;
  readonly nsfw: boolean;
  readonly ephemeral: boolean;
  /** How long each person, channel and server waits between two uses. */
  readonly cooldown: CooldownLimits;
  /** The functions giving suggestions, by the name of their option. */
  readonly autocomplete: Readonly<Record<string, AutocompleteFunction>>;
  readonly run: (context: CommandContext) => unknown;
}

/**
 * The names of commands and options: lowercase letters of any language,
 * digits, `-` and `_`, 32 characters at most.
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-naming
 */
const NAME = /^[-_\u02BC\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
const isName = (name: string): boolean =>
  NAME.test(name) && name === name.toLowerCase();

const MAX_OPTIONS = 25;
const MAX_CHOICES = 25;
const MAX_DESCRIPTION = 100;
const MAX_STRING_LENGTH = 6000;

const OPTION_TYPES = [
  'string',
  'integer',
  'number',
  'boolean',
  'user',
  'role',
  'channel',
  'mentionable',
  'attachment',
] as const;

/** The keys each kind of option accepts, besides the common ones. */
const OPTION_KEYS: Record<string, readonly string[]> = {
  string: ['choices', 'minLength', 'maxLength'],
  integer: ['choices', 'min', 'max'],
  number: ['choices', 'min', 'max'],
  channel: ['channelTypes'],
};
const COMMAND_KEYS = [
  'description',
  'options',
  'locales',
  'permissions',
  'where',
  'nsfw',
  'ephemeral',
  'cooldown',
  'autocomplete',
  'run',
];

/** The kinds of options whose suggestions can come from the bot. */
const SUGGESTABLE_TYPES = ['string', 'integer', 'number'] as const;

const fail = (message: string): never => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkDescription(what: string, description: unknown): string {
  if (typeof description !== 'string' || description.trim() === '') {
    return fail(
      `${what} needs a description: a short text that says what it is for, like description: 'Bans a member'.`
    );
  }
  if (description.length > MAX_DESCRIPTION) {
    return fail(
      `The description of ${what} is ${description.length} characters long: Discord accepts ${MAX_DESCRIPTION} at most.`
    );
  }
  return description;
}

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
  if (typeof value !== 'boolean') {
    return fail(`${what} is true or false, got ${JSON.stringify(value)}.`);
  }
  return value;
}

const PLACES: readonly CommandWhere[] = ['guild', 'dm', 'both'];

function checkWhere(value: unknown): CommandWhere {
  if (value === undefined) return 'guild';
  if (!PLACES.includes(value as CommandWhere)) {
    return fail(
      `"where" says where the command can be used: 'guild' (in servers, which is the default), 'dm' (in private messages with the bot) or 'both'. Got ${JSON.stringify(value) ?? typeof value}.`
    );
  }
  return value as CommandWhere;
}

/** The shortest cooldown accepted, in milliseconds. */
const MIN_COOLDOWN = 1000;

function checkCooldown(value: unknown, where: CommandWhere): CooldownLimits {
  if (value === undefined) return NO_COOLDOWN;
  const example = `cooldown: '10s' (${DURATION_EXAMPLE}) for each person, or cooldown: { user: '10s', channel: '5s', guild: '1m' } for each place`;
  const duration = (what: string, text: unknown): number => {
    if (typeof text !== 'string' || text.trim() === '') {
      return fail(
        `${what} is a duration, got ${JSON.stringify(text) ?? typeof text}: ${example}.`
      );
    }
    const ms = parseDuration(text);
    if (ms === null) {
      return fail(
        `${what} is ${JSON.stringify(text)}, which is not a duration: ${example}.`
      );
    }
    if (ms < MIN_COOLDOWN) {
      return fail(
        `${what} is ${JSON.stringify(text)}: a cooldown is 1 second at least. Leave it out for none.`
      );
    }
    return ms;
  };
  if (typeof value === 'string') {
    return Object.freeze({
      ...NO_COOLDOWN,
      user: duration('"cooldown"', value),
    });
  }
  if (!isRecord(value)) {
    return fail(
      `"cooldown" says how long to wait before the command can be used again: ${example}.`
    );
  }
  checkKeys('"cooldown"', value, COOLDOWN_SCOPES);
  const limits = { ...NO_COOLDOWN };
  for (const scope of COOLDOWN_SCOPES) {
    if (value[scope] === undefined) continue;
    limits[scope] = duration(`"${scope}" of "cooldown"`, value[scope]);
  }
  if (limits.user + limits.channel + limits.guild === 0) {
    return fail(`"cooldown" is empty: ${example}. Leave it out for none.`);
  }
  if (where === 'dm' && limits.guild > 0) {
    return fail(
      `"cooldown" has "guild", but this command only works in private messages (where: 'dm'), where there is no server: use "user".`
    );
  }
  return Object.freeze(limits);
}

function checkOption(
  name: string,
  option: unknown,
  described: boolean
): LoadedOption {
  const what = `the option "${name}"`;
  if (!isName(name)) {
    fail(
      `"${name}" can't be the name of an option: use lowercase letters, digits, - and _ only, 32 characters at most.`
    );
  }
  if (!isRecord(option)) {
    return fail(
      `${what} must be an object like { type: 'string', description: '...' }.`
    );
  }
  const type = option.type;
  if (!OPTION_TYPES.includes(type as (typeof OPTION_TYPES)[number])) {
    return fail(
      `The type of ${what} is ${JSON.stringify(type)}, which does not exist. Types are: ${OPTION_TYPES.join(', ')}.`
    );
  }
  checkKeys(what, option, [
    'type',
    'description',
    'required',
    ...(OPTION_KEYS[type as string] ?? []),
  ]);
  // Described in the file with the command, or in the default language.
  if (described || option.description !== undefined) {
    checkDescription(what, option.description);
  }
  checkBoolean(`"required" of ${what}`, option.required);

  const isText = type === 'string';
  if (option.choices !== undefined) {
    const values = Array.isArray(option.choices)
      ? option.choices
      : isRecord(option.choices)
        ? Object.values(option.choices)
        : fail(
            `The choices of ${what} are a list like ['a', 'b'] or an object like { 'Shown name': 'value' }.`
          );
    const labels = Array.isArray(option.choices)
      ? values.map(String)
      : Object.keys(option.choices as object);
    if (values.length === 0 || values.length > MAX_CHOICES) {
      fail(
        `${what} has ${values.length} choices: Discord accepts between 1 and ${MAX_CHOICES}.`
      );
    }
    for (const [index, value] of values.entries()) {
      if (typeof value !== (isText ? 'string' : 'number')) {
        fail(
          `The choices of ${what} must be ${isText ? 'texts' : 'numbers'}, since its type is ${String(type)}: got ${JSON.stringify(value)}.`
        );
      }
      if (type === 'integer' && !Number.isInteger(value)) {
        fail(`The choice ${String(value)} of ${what} is not a whole number.`);
      }
      const label = labels[index]!;
      if (label.length < 1 || label.length > MAX_DESCRIPTION) {
        fail(
          `A choice of ${what} is ${label.length} characters long: Discord accepts between 1 and ${MAX_DESCRIPTION}.`
        );
      }
    }
    if (new Set(labels).size !== labels.length) {
      fail(`${what} has the same choice twice.`);
    }
  }
  const range = (
    low: 'min' | 'minLength',
    high: 'max' | 'maxLength',
    limit?: number
  ): void => {
    for (const key of [low, high]) {
      const value = option[key];
      if (value === undefined) continue;
      if (typeof value !== 'number' || Number.isNaN(value)) {
        fail(`"${key}" of ${what} is a number, got ${JSON.stringify(value)}.`);
      }
      if (
        (limit !== undefined || type === 'integer') &&
        !Number.isInteger(value)
      ) {
        fail(`"${key}" of ${what} is a whole number, got ${String(value)}.`);
      }
      if (
        limit !== undefined &&
        ((value as number) < 0 || (value as number) > limit)
      ) {
        fail(
          `"${key}" of ${what} is between 0 and ${limit}, got ${String(value)}.`
        );
      }
    }
    if (
      typeof option[low] === 'number' &&
      typeof option[high] === 'number' &&
      option[low] > option[high]
    ) {
      fail(
        `${what} can never be filled in: its "${low}" (${option[low]}) is greater than its "${high}" (${option[high]}).`
      );
    }
  };
  if (isText) range('minLength', 'maxLength', MAX_STRING_LENGTH);
  else range('min', 'max');
  if (option.channelTypes !== undefined) {
    const known = Object.values(ChannelType) as unknown[];
    if (
      !Array.isArray(option.channelTypes) ||
      !option.channelTypes.every(one => known.includes(one))
    ) {
      fail(
        `"channelTypes" of ${what} is a list of ChannelType values, like [ChannelType.GuildText].`
      );
    }
  }
  return {
    ...(option as unknown as CommandOption),
    name,
    description: (option.description as string | undefined) ?? '',
  };
}

const LOCALES = Object.values(Locale) as string[];

/** Checks `locales` and returns it as the dictionaries Discord takes. */
export function checkLocales(
  locales: unknown,
  options: readonly LoadedOption[]
): {
  names: Localizations;
  descriptions: Localizations;
  optionLocales: Record<string, OptionLocales>;
} {
  const names: Record<string, string> = {};
  const descriptions: Record<string, string> = {};
  const optionLocales: Record<
    string,
    {
      names: Record<string, string>;
      descriptions: Record<string, string>;
      choices: Record<string, Record<string, string>>;
    }
  > = {};
  if (locales === undefined) {
    return { names, descriptions, optionLocales };
  }
  if (!isRecord(locales)) {
    return fail(
      `"locales" is an object whose keys are languages: locales: { fr: { description: '...' } }`
    );
  }
  for (const [locale, translation] of Object.entries(locales)) {
    const where = `the "${locale}" translation`;
    if (!LOCALES.includes(locale)) {
      fail(
        `"${locale}" is not a language Discord knows. Languages are: ${LOCALES.join(', ')}.`
      );
    }
    if (!isRecord(translation)) {
      fail(
        `${where} must be an object like { name: '...', description: '...' }.`
      );
    }
    const fields = translation as Record<string, unknown>;
    checkKeys(where, fields, ['name', 'description', 'options']);
    const readName = (what: string, name: unknown): string | undefined => {
      if (name === undefined) return undefined;
      if (typeof name !== 'string' || !isName(name)) {
        return fail(
          `${JSON.stringify(name)} can't be the name of ${what} in ${where}: use lowercase letters, digits, - and _ only, 32 characters at most.`
        );
      }
      return name;
    };
    const readDescription = (
      what: string,
      text: unknown
    ): string | undefined =>
      text === undefined
        ? undefined
        : checkDescription(`${what} in ${where}`, text);

    const name = readName('this command', fields.name);
    if (name !== undefined) names[locale] = name;
    const description = readDescription('this command', fields.description);
    if (description !== undefined) descriptions[locale] = description;
    if (fields.options === undefined) continue;
    if (!isRecord(fields.options)) {
      fail(
        `"options" of ${where} is an object whose keys are the names of the options.`
      );
    }
    for (const [optionName, optionTranslation] of Object.entries(
      fields.options as Record<string, unknown>
    )) {
      const option = options.find(one => one.name === optionName);
      if (!option) {
        fail(
          `${where} translates an option "${optionName}" that this command does not have.${options.length > 0 ? ` Its options are: ${options.map(one => one.name).join(', ')}.` : ''}`
        );
      }
      const what = `the option "${optionName}"`;
      if (!isRecord(optionTranslation)) {
        fail(
          `${what} of ${where} must be an object like { name: '...', description: '...' }.`
        );
      }
      const translated = optionTranslation as Record<string, unknown>;
      checkKeys(`${what} of ${where}`, translated, [
        'name',
        'description',
        'choices',
      ]);
      const target = (optionLocales[optionName] ??= {
        names: {},
        descriptions: {},
        choices: {},
      });
      const translatedName = readName(what, translated.name);
      if (translatedName !== undefined) target.names[locale] = translatedName;
      const translatedDescription = readDescription(
        what,
        translated.description
      );
      if (translatedDescription !== undefined) {
        target.descriptions[locale] = translatedDescription;
      }
      if (translated.choices === undefined) continue;
      const declared = choiceLabels(option!);
      if (!isRecord(translated.choices) || declared.length === 0) {
        fail(
          declared.length === 0
            ? `${where} translates choices of ${what}, which has no choices.`
            : `"choices" of ${what} in ${where} is an object like { ${JSON.stringify(declared[0])}: '...' }.`
        );
      }
      for (const [label, text] of Object.entries(
        translated.choices as Record<string, unknown>
      )) {
        if (!declared.includes(label)) {
          fail(
            `${where} translates a choice "${label}" that ${what} does not have. Its choices are: ${declared.join(', ')}.`
          );
        }
        if (
          typeof text !== 'string' ||
          text.length < 1 ||
          text.length > MAX_DESCRIPTION
        ) {
          fail(
            `The choice "${label}" of ${what} in ${where} must be a text of 1 to ${MAX_DESCRIPTION} characters.`
          );
        }
        (target.choices[label] ??= {})[locale] = text as string;
      }
    }
    // A translated option name must not be the name of another option, in
    // that language or by default.
    const taken = new Map<string, string>();
    for (const option of options) {
      const shown = optionLocales[option.name]?.names[locale] ?? option.name;
      const other = taken.get(shown);
      if (other !== undefined) {
        fail(
          `In ${where}, the options "${other}" and "${option.name}" would both be called "${shown}".`
        );
      }
      taken.set(shown, option.name);
      if (shown !== option.name && options.some(one => one.name === shown)) {
        fail(
          `In ${where}, the option "${option.name}" is called "${shown}", which is the name of another option.`
        );
      }
    }
  }
  return { names, descriptions, optionLocales };
}

/** The choices of an option, as they are named by default. */
function choiceLabels(option: CommandOption): string[] {
  if (!('choices' in option) || !option.choices) return [];
  return Array.isArray(option.choices)
    ? option.choices.map(String)
    : Object.keys(option.choices);
}

/**
 * Checks `autocomplete`: one function per option, for an option that can
 * have suggestions (a text or a number, without choices).
 * @see https://docs.discord.com/developers/interactions/application-commands#autocomplete
 */
function checkAutocomplete(
  value: unknown,
  options: readonly LoadedOption[]
): Readonly<Record<string, AutocompleteFunction>> {
  if (value === undefined) return Object.freeze({});
  const example = `autocomplete: { ${options[0]?.name ?? 'name'}: ({ value }) => [...] }`;
  if (!isRecord(value)) {
    return fail(
      `"autocomplete" is an object whose keys are the names of the options to suggest for, each a function returning the suggestions: ${example}`
    );
  }
  const functions: Record<string, AutocompleteFunction> = {};
  for (const [name, fn] of Object.entries(value)) {
    const option = options.find(one => one.name === name);
    const what = `"${name}" of "autocomplete"`;
    if (!option) {
      fail(
        `${what} is not an option of this command.${options.length > 0 ? ` Its options are: ${options.map(one => one.name).join(', ')}.` : ' Declare it in "options" first.'}`
      );
    }
    if (
      !SUGGESTABLE_TYPES.includes(
        option!.type as (typeof SUGGESTABLE_TYPES)[number]
      )
    ) {
      fail(
        `${what} can't have suggestions: the option "${name}" is a ${option!.type}. Only a ${SUGGESTABLE_TYPES.join(', ')} option can.`
      );
    }
    if ('choices' in option! && option!.choices) {
      fail(
        `${what} can't have suggestions: the option "${name}" has "choices", and Discord takes one or the other. Remove its choices to suggest them from here, or take it out of "autocomplete".`
      );
    }
    if (typeof fn !== 'function') {
      fail(
        `${what} is a function that returns the suggestions, like ${name}: ({ value }) => [...]: got ${JSON.stringify(fn) ?? typeof fn}.`
      );
    }
    functions[name] = fn as AutocompleteFunction;
  }
  return Object.freeze(functions);
}

function checkPermissions(permissions: unknown): bigint {
  if (permissions === undefined) return 0n;
  if (!Array.isArray(permissions)) {
    return fail(
      `"permissions" is a list of permission names, like ['BanMembers'].`
    );
  }
  let bits = 0n;
  for (const name of permissions) {
    const flag = (PermissionFlags as Record<string, bigint>)[name as string];
    if (typeof name !== 'string' || flag === undefined) {
      return fail(
        `${JSON.stringify(name)} is not a permission. Permissions are: ${Object.keys(PermissionFlags).join(', ')}.`
      );
    }
    bits |= flag;
  }
  return bits & ALL_PERMISSIONS;
}

/**
 * `src/commands/`: each file is a slash command, named after its path.
 * One folder makes a command with subcommands (`mod/ban.ts` is `/mod ban`),
 * two make a group (`mod/roles/add.ts` is `/mod roles add`): Discord allows
 * nothing deeper.
 */
export const commandsConvention: Convention<LoadedCommand> = {
  folder: 'commands',
  one: 'command',
  many: 'commands',
  check(path) {
    const parts = path.replace(/\.[^./]+$/, '').split('/');
    if (parts.length > 3) {
      fail(
        `This file is ${parts.length - 1} folders deep: Discord allows a command, a group and a subcommand, so 2 folders at most (src/commands/mod/roles/add.ts is /mod roles add).`
      );
    }
    for (const part of parts) {
      if (!isName(part)) {
        fail(
          `"${part}" can't be in the name of a command: use lowercase letters, digits, - and _ only, 32 characters at most. The path of the file is the name of the command.`
        );
      }
    }
  },
  read(exports, path) {
    const file = exports.default;
    const parts = path.replace(/\.[^./]+$/, '').split('/');
    if (!isCommandFile(file)) {
      const example = `import { command } from 'chapterjs'; export default command({ description: '...', run({ interaction }) { ... } })`;
      return fail(
        'default' in exports
          ? `The default export of this file must be what command() returns: ${example}`
          : `This file has no default export. It should look like: ${example}`
      );
    }
    const config = file.config as CommandConfig;
    if (!isRecord(config)) {
      return fail(
        `command() needs an object: command({ description: '...', run({ interaction }) { ... } })`
      );
    }
    checkKeys('a command', config, COMMAND_KEYS);
    // No description: the language files describe the command, options
    // included, and hold its translations.
    const described = config.description !== undefined;
    const description = described
      ? checkDescription('this command', config.description)
      : '';
    if (!described && config.locales !== undefined) {
      fail(
        `This command has no "description", so its texts come from the language files of src/messages/: put its "locales" there too (commands: { ... }), or give it a description here.`
      );
    }
    if (typeof config.run !== 'function') {
      fail(
        `This command has no "run": the function to run when someone uses it, like async run({ interaction }) { await interaction.reply('Pong!'); }`
      );
    }
    const rawOptions = config.options ?? {};
    if (!isRecord(rawOptions)) {
      fail(
        `"options" is an object whose keys are the names of the options: options: { name: { type: 'string', description: '...' } }`
      );
    }
    const options = Object.entries(rawOptions).map(([name, option]) =>
      checkOption(name, option, described)
    );
    if (options.length > MAX_OPTIONS) {
      fail(
        `This command has ${options.length} options: Discord accepts ${MAX_OPTIONS} at most.`
      );
    }
    // Required options must be listed before optional options.
    options.sort(
      (a, b) => Number(b.required === true) - Number(a.required === true)
    );
    const where = checkWhere(config.where);
    return Object.freeze({
      ...checkLocales(config.locales, options),
      path: Object.freeze(parts),
      described,
      description,
      options: Object.freeze(options),
      permissions: checkPermissions(config.permissions),
      where,
      nsfw: checkBoolean('"nsfw"', config.nsfw),
      ephemeral: checkBoolean('"ephemeral"', config.ephemeral),
      cooldown: checkCooldown(config.cooldown, where),
      autocomplete: checkAutocomplete(config.autocomplete, options),
      run: config.run as LoadedCommand['run'],
    });
  },
};
