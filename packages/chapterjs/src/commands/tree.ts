// Turns the command files of a project into what Discord registers: one
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
import type { LoadedOption } from './convention.js';
import type { CommandOption } from './command.js';
import type { Locale } from '../discord/types/common.js';
import type {
  LoadedCommand,
  Localizations,
  OptionLocales,
} from './convention.js';

/** A command with the file it comes from. */
export interface CommandEntry {
  file: string;
  command: LoadedCommand;
}

/** Two files that can't both be commands. */
export interface CommandConflict {
  file: string;
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
  locales: OptionLocales | undefined
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
 * Finds the files that can't be commands together, and leaves them out:
 * - two files with the same name (in different `(group)` folders);
 * - a command that also has subcommands: Discord only lets people use the
 *   subcommands.
 */
export function findConflicts(entries: readonly CommandEntry[]): {
  valid: CommandEntry[];
  conflicts: CommandConflict[];
} {
  const conflicts: CommandConflict[] = [];
  const seen = new Map<string, CommandEntry>();
  const unique = [...entries]
    .sort((a, b) => (a.file < b.file ? -1 : 1))
    .filter(entry => {
      const key = entry.command.path.join(' ');
      const first = seen.get(key);
      if (!first) {
        seen.set(key, entry);
        return true;
      }
      conflicts.push({
        file: entry.file,
        message: `${commandName(entry.command.path)} is already ${first.file}: two files can't be the same command. A folder in parentheses only groups files, it is not part of the name.`,
      });
      return false;
    });
  const valid = unique.filter(entry => {
    const { path } = entry.command;
    const child = unique.find(
      other =>
        other !== entry &&
        other.command.path.length > path.length &&
        path.every((part, index) => other.command.path[index] === part)
    );
    if (!child) return true;
    conflicts.push({
      file: entry.file,
      message: `${commandName(path)} can't be a command and have subcommands (${child.file} is ${commandName(child.command.path)}): Discord only lets people use the subcommands. Move this file into the folder, for example as ${[...path, 'run'].join('/')}.ts.`,
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
 * What to register for a set of commands. `guild` is for commands of one
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
      toOption(option, command.optionLocales[option.name])
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
  for (const { command } of entries) {
    if (guild && command.where === 'dm') continue;
    const list = roots.get(command.path[0]!) ?? [];
    list.push(command);
    roots.set(command.path[0]!, list);
  }
  return [...roots]
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
                contexts: [
                  ...(commands.some(command => command.where !== 'dm')
                    ? [InteractionContextType.Guild]
                    : []),
                  ...(commands.some(command => command.where !== 'guild')
                    ? [InteractionContextType.BotDm]
                    : []),
                ],
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
}
