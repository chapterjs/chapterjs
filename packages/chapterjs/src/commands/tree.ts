// Turns the commands of a project into what Discord registers: one
// application command per top-level name, with its subcommands and groups.
// https://docs.discord.com/developers/interactions/application-commands#subcommands-and-subcommand-groups

import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type BulkOverwriteGuildApplicationCommandsJSONParams,
  type RawApplicationCommandOption,
} from '../discord/types/application-command.js';
import { ApplicationIntegrationType } from '../discord/types/application.js';
import { InteractionContextType } from '../discord/types/interaction.js';
import { bySite, siteName } from '../loader/loader.js';
import type { LoadedOption } from './declaration.js';
import type { CommandOption } from './command.js';
import type { Locale } from '../discord/types/common.js';
import type {
  LoadedCommand,
  Localizations,
  OptionLocales,
} from './declaration.js';

/** A command with the file it comes from. */
export interface CommandEntry {
  file: string;
  /** The export it is: `'default'`, or its name. */
  export: string;
  command: LoadedCommand;
}

/** Two declarations that can't both be commands. */
export interface CommandConflict {
  file: string;
  export: string;
  message: string;
}

export type CommandPayload = BulkOverwriteGuildApplicationCommandsJSONParams;

const TYPES: Record<CommandOption['type'], ApplicationCommandOptionType> = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
  number: ApplicationCommandOptionType.Number,
  boolean: ApplicationCommandOptionType.Boolean,
  user: ApplicationCommandOptionType.User,
  channel: ApplicationCommandOptionType.Channel,
  role: ApplicationCommandOptionType.Role,
  mentionable: ApplicationCommandOptionType.Mentionable,
  attachment: ApplicationCommandOptionType.Attachment,
};

/** A dictionary of translations, or nothing when there is none. */
const localized = (
  translations: Localizations | undefined
): Localizations | undefined =>
  translations && Object.keys(translations).length > 0
    ? translations
    : undefined;

/** Adds the translations of a name and a description, when there are some. */
function withLocales<T extends object>(
  target: T,
  names: Localizations | undefined,
  descriptions: Localizations | undefined
): T {
  const nameLocalizations = localized(names);
  const descriptionLocalizations = localized(descriptions);
  return {
    ...target,
    ...(nameLocalizations ? { name_localizations: nameLocalizations } : {}),
    ...(descriptionLocalizations
      ? { description_localizations: descriptionLocalizations }
      : {}),
  };
}

function toOption(
  option: LoadedOption,
  locales: OptionLocales | undefined,
  autocomplete: boolean
): RawApplicationCommandOption {
  const raw: RawApplicationCommandOption = withLocales(
    {
      type: TYPES[option.type],
      name: option.name,
      description: option.description,
    },
    locales?.names,
    locales?.descriptions
  );
  if (option.required) raw.required = true;
  // Discord then asks the bot for suggestions while the person types.
  // https://docs.discord.com/developers/interactions/application-commands#autocomplete
  if (autocomplete) raw.autocomplete = true;
  if ('choices' in option && option.choices) {
    const entries: [string, string | number][] = Array.isArray(option.choices)
      ? option.choices.map((value: string | number) => [String(value), value])
      : Object.entries(option.choices);
    raw.choices = entries.map(([name, value]) => {
      const translations = localized(locales?.choices[name]);
      return {
        name,
        value,
        ...(translations ? { name_localizations: translations } : {}),
      };
    });
  }
  if (option.type === 'string') {
    if (option.minLength !== undefined) raw.min_length = option.minLength;
    if (option.maxLength !== undefined) raw.max_length = option.maxLength;
  } else if (option.type === 'integer' || option.type === 'number') {
    if (option.min !== undefined) raw.min_value = option.min;
    if (option.max !== undefined) raw.max_value = option.max;
  } else if (option.type === 'channel' && option.channelTypes) {
    raw.channel_types = [...option.channelTypes];
  }
  return raw;
}

/** `/mod ban` for `['mod', 'ban']`. */
export const commandName = (path: readonly string[]): string =>
  `/${path.join(' ')}`;

/**
 * A command as messages name it: `/mod ban` for a slash command, `the
 * message menu "Report"` for a menu command.
 */
export const describeCommand = (
  command: Pick<LoadedCommand, 'type' | 'path'>
): string =>
  command.type === 'slash'
    ? commandName(command.path)
    : `the ${command.type} menu "${command.path[0]}"`;

/** The same text, starting with a capital: the start of a sentence. */
export const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/**
 * What tells one command from another: its path for a slash command, its
 * type and name for a menu command (Discord lets a slash command, a
 * message menu and a user menu share a name).
 */
export const commandKey = (
  command: Pick<LoadedCommand, 'type' | 'path'>
): string =>
  command.type === 'slash'
    ? command.path.join(' ')
    : `${command.type}:${command.path[0]}`;

/**
 * How many menu commands of each type Discord accepts, for everyone and
 * in each server.
 * @see https://docs.discord.com/developers/interactions/application-commands#registering-a-command
 */
export const MAX_MENUS = 15;

const MENU_TYPES = {
  user: ApplicationCommandType.User,
  message: ApplicationCommandType.Message,
} as const;

/**
 * Finds the declarations that can't be commands together, and leaves them
 * out:
 * - two commands with the same name (and type);
 * - a command that also has subcommands: Discord only lets people use the
 *   subcommands;
 * - a menu command beyond the 15 of its type Discord accepts.
 */
export function findConflicts(
  entries: readonly CommandEntry[],
  running?: ReadonlySet<string>
): {
  valid: CommandEntry[];
  conflicts: CommandConflict[];
} {
  const conflicts: CommandConflict[] = [];
  const seen = new Map<string, CommandEntry>();
  const unique = bySite(entries, running).filter(entry => {
    const key = commandKey(entry.command);
    const first = seen.get(key);
    if (!first) {
      seen.set(key, entry);
      return true;
    }
    conflicts.push({
      file: entry.file,
      export: entry.export,
      message: `${capitalize(describeCommand(entry.command))} is already declared in ${siteName(first)}: two ${entry.command.type === 'slash' ? 'commands' : `${entry.command.type} menu commands`} can't have the same name.`,
    });
    return false;
  });
  const menus = { user: 0, message: 0 };
  const valid = unique.filter(entry => {
    const { path, type } = entry.command;
    if (type !== 'slash') {
      if (++menus[type] <= MAX_MENUS) return true;
      conflicts.push({
        file: entry.file,
        export: entry.export,
        message: `${capitalize(describeCommand(entry.command))} is one ${type} menu command too many: Discord accepts ${MAX_MENUS} at most. Remove one, or make it a slash command (no "type").`,
      });
      return false;
    }
    const child = unique.find(
      other =>
        other !== entry &&
        other.command.type === 'slash' &&
        other.command.path.length > path.length &&
        path.every((part, index) => other.command.path[index] === part)
    );
    if (!child) return true;
    conflicts.push({
      file: entry.file,
      export: entry.export,
      message: `${commandName(path)} can't be a command and have subcommands (${siteName(child)} is ${commandName(child.command.path)}): Discord only lets people use the subcommands. Make this one a subcommand too, for example name: '${[...path, 'run'].join(' ')}'.`,
    });
    return false;
  });
  return { valid, conflicts };
}

/**
 * The commands that only work in private messages. Discord does not offer
 * the commands of one server there, so they can't be used with those.
 * @see https://docs.discord.com/developers/interactions/application-commands#permissions
 */
export const privateOnly = (entries: readonly CommandEntry[]): CommandEntry[] =>
  entries.filter(entry => entry.command.where === 'dm');

/**
 * What to register for a set of commands: the slash commands, then the
 * menu commands. `guild` is for commands of one
 * server (dev), where Discord takes no contexts: the commands that only
 * work in private messages are left out, they could never run there.
 *
 * A folder has no file: Discord asks for its description but never shows
 * it, so it is generated, and it is shown under the name of the folder in
 * every language.
 */
export function buildCommands(
  entries: readonly CommandEntry[],
  { guild }: { guild: boolean }
): CommandPayload[] {
  const optionsOf = (command: LoadedCommand): RawApplicationCommandOption[] =>
    command.options.map(option =>
      toOption(
        option,
        command.optionLocales[option.name],
        option.name in command.autocomplete
      )
    );
  const sub = (command: LoadedCommand): RawApplicationCommandOption =>
    withLocales(
      {
        type: ApplicationCommandOptionType.SubCommand,
        name: command.path.at(-1)!,
        description: command.description,
        ...(command.options.length > 0 ? { options: optionsOf(command) } : {}),
      },
      command.names,
      command.descriptions
    );

  const roots = new Map<string, LoadedCommand[]>();
  const menus: LoadedCommand[] = [];
  for (const { command } of entries) {
    if (guild && command.where === 'dm') continue;
    if (command.type !== 'slash') {
      menus.push(command);
      continue;
    }
    const list = roots.get(command.path[0]!) ?? [];
    list.push(command);
    roots.set(command.path[0]!, list);
  }
  const slash = [...roots]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, commands]) => {
      const [first] = commands;
      const leaf =
        commands.length === 1 && first!.path.length === 1 ? first! : null;
      // What the server shows the command to by default: what every one of
      // its subcommands asks for. Each subcommand checks its own on use.
      const permissions = commands.reduce(
        (bits, command) => bits & command.permissions,
        commands[0]!.permissions
      );
      const payload: CommandPayload = withLocales(
        {
          type: ApplicationCommandType.ChatInput,
          name,
          description: leaf?.description ?? `${name} commands`,
          default_member_permissions:
            permissions === 0n ? null : String(permissions),
          // Only for globally-scoped commands.
          ...(guild
            ? {}
            : {
                integration_types: [ApplicationIntegrationType.GuildInstall],
                // A command is offered wherever one of its subcommands
                // works; each one refuses the place it does not work in.
                contexts: contextsOf(commands),
              }),
          ...(commands.some(command => command.nsfw) ? { nsfw: true } : {}),
        } as CommandPayload,
        leaf?.names,
        leaf?.descriptions
      );
      if (leaf) {
        if (leaf.options.length > 0) payload.options = optionsOf(leaf);
        return payload;
      }
      const inGroups = new Map<string, LoadedCommand[]>();
      const options: RawApplicationCommandOption[] = [];
      for (const command of [...commands].sort((a, b) =>
        a.path.join('/') < b.path.join('/') ? -1 : 1
      )) {
        if (command.path.length === 2) options.push(sub(command));
        else {
          const list = inGroups.get(command.path[1]!) ?? [];
          list.push(command);
          inGroups.set(command.path[1]!, list);
        }
      }
      for (const [group, members] of inGroups) {
        options.push({
          type: ApplicationCommandOptionType.SubCommandGroup,
          name: group,
          description: `${group} commands`,
          options: members.map(sub),
        });
      }
      payload.options = options;
      return payload;
    });
  return [
    ...slash,
    ...menus.sort(byTypeAndName).map(menu => toMenu(menu, guild)),
  ];
}

/** Menu commands in a stable order: by type, then by name. */
const byTypeAndName = (a: LoadedCommand, b: LoadedCommand): number =>
  commandKey(a) < commandKey(b) ? -1 : 1;

/**
 * What Discord registers for a menu command: a name and no description
 * ("The `description` field is not allowed when creating user commands"),
 * nor options.
 * @see https://docs.discord.com/developers/interactions/application-commands#user-commands
 * @see https://docs.discord.com/developers/interactions/application-commands#message-commands
 */
function toMenu(command: LoadedCommand, guild: boolean): CommandPayload {
  const names = localized(command.names);
  return {
    type: MENU_TYPES[command.type as keyof typeof MENU_TYPES],
    name: command.path[0]!,
    ...(names ? { name_localizations: names } : {}),
    default_member_permissions:
      command.permissions === 0n ? null : String(command.permissions),
    ...(guild
      ? {}
      : {
          integration_types: [ApplicationIntegrationType.GuildInstall],
          contexts: contextsOf([command]),
        }),
    ...(command.nsfw ? { nsfw: true } : {}),
  } as CommandPayload;
}

/** Where Discord offers a command: wherever one of these works. */
const contextsOf = (
  commands: readonly LoadedCommand[]
): InteractionContextType[] => [
  ...(commands.some(command => command.where !== 'dm')
    ? [InteractionContextType.Guild]
    : []),
  ...(commands.some(command => command.where !== 'guild')
    ? [InteractionContextType.BotDm]
    : []),
];
