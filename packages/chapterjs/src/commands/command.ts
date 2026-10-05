// `command()`, as user files import it from 'chapterjs', and the types that
// make the options a command declares typed in its `run` function.

import type { PermissionName } from '../discord/permissions.js';
import type { ChannelType } from '../discord/types/channel.js';
import type { Locale } from '../discord/types/common.js';
import type { Channel } from '../structures/channel.js';
import type { Guild } from '../structures/guild.js';
import type { CommandInteraction } from '../structures/interaction.js';
import type { GuildMember } from '../structures/member.js';
import type { Attachment } from '../structures/message.js';
import type { Role } from '../structures/role.js';
import type { User } from '../structures/user.js';

interface OptionBase {
  /** What the option is for, shown under its name (1-100 characters). */
  description: string;
  /** Whether the user must fill it in. By default it is optional. */
  required?: boolean;
}

/** A text the user types, or picks among `choices`. */
export interface StringOption extends OptionBase {
  type: 'string';
  /**
   * The only values the user can pick (25 at most): a list, or an object
   * whose keys are what the user sees and values what your code receives.
   */
  choices?: readonly string[] | Readonly<Record<string, string>>;
  minLength?: number;
  maxLength?: number;
}

/** A whole number (`integer`) or any number (`number`). */
export interface NumberOption extends OptionBase {
  type: 'integer' | 'number';
  choices?: readonly number[] | Readonly<Record<string, number>>;
  /** The smallest value accepted. */
  min?: number;
  /** The largest value accepted. */
  max?: number;
}

/** A channel the user picks. */
export interface ChannelOption extends OptionBase {
  type: 'channel';
  /** The kinds of channels that can be picked. By default, all of them. */
  channelTypes?: readonly ChannelType[];
}

/** True or false, a user, a role, a user or a role, or a file. */
export interface SimpleOption extends OptionBase {
  type: 'boolean' | 'user' | 'role' | 'mentionable' | 'attachment';
}

/** One option of a command. */
export type CommandOption =
  StringOption | NumberOption | ChannelOption | SimpleOption;

/** The options of a command, by name. */
export type CommandOptions = Readonly<Record<string, CommandOption>>;

/** What `run` receives for an option of each type. */
interface OptionValues {
  string: string;
  integer: number;
  number: number;
  boolean: boolean;
  user: User;
  role: Role;
  channel: Channel;
  mentionable: User | Role;
  attachment: Attachment;
}

type ValueOf<Option extends CommandOption> = Option extends {
  choices: readonly (infer Choice)[];
}
  ? Choice
  : Option extends { choices: Readonly<Record<string, infer Choice>> }
    ? Choice
    : OptionValues[Option['type']];

/**
 * The values of the options, typed from their declaration: a required
 * option is always there, an optional one may be `undefined`.
 */
export type OptionValuesOf<Options extends CommandOptions> = {
  [Name in keyof Options]: Options[Name] extends { required: true }
    ? ValueOf<Options[Name]>
    : ValueOf<Options[Name]> | undefined;
};

/** What a choice of an option is called in translations. */
type ChoiceKeys<Option extends CommandOption> = Option extends {
  choices: readonly (infer Choice extends string | number)[];
}
  ? `${Choice}`
  : Option extends { choices: Readonly<Record<infer Label, unknown>> }
    ? Label & string
    : never;

/** The translation of one option. Everything is optional. */
export interface OptionTranslation<
  Option extends CommandOption = CommandOption,
> {
  /** The name of the option in that language (same rules as a name). */
  name?: string;
  description?: string;
  /**
   * What each choice is called in that language. The keys are the choices
   * as declared: the values of a list, or the keys of an object.
   */
  choices?: { readonly [Choice in ChoiceKeys<Option>]?: string };
}

/**
 * The translation of a command in one language. Everything is optional:
 * what is not translated is shown as declared.
 */
export interface CommandTranslation<
  Options extends CommandOptions = CommandOptions,
> {
  /** The name of the command in that language (same rules as a name). */
  name?: string;
  description?: string;
  options?: {
    readonly [Name in keyof Options]?: OptionTranslation<Options[Name]>;
  };
}

/** The translations of a command, by language. */
export type CommandLocales<Options extends CommandOptions = CommandOptions> = {
  readonly [Language in Locale]?: CommandTranslation<Options>;
};

/** What the `run` function of a command receives. */
export interface CommandContext<
  Options extends CommandOptions = CommandOptions,
  Dm extends boolean = false,
> {
  /** The use of the command: what to answer with. */
  interaction: CommandInteraction;
  /** What the user filled in. */
  options: OptionValuesOf<Options>;
  /** Who used the command. */
  user: User;
  /** The server the command was used in. `null` in a private message. */
  guild: Dm extends true ? Guild | null : Guild;
  /** Who used the command, as a member of the server. */
  member: Dm extends true ? GuildMember | null : GuildMember;
  /** The channel the command was used in, when the bot knows it. */
  channel: Channel | null;
}

export interface CommandConfig<
  Options extends CommandOptions = CommandOptions,
  Dm extends boolean = false,
> {
  /** What the command does, shown under its name (1-100 characters). */
  description: string;
  /** What the user can fill in (25 options at most). */
  options?: Options;
  /**
   * The command in other languages: Discord shows each person the names
   * and descriptions of their language. Your code always receives the
   * names declared above, whatever the language.
   * @see https://docs.discord.com/developers/interactions/application-commands#localization
   */
  locales?: CommandLocales<NoInfer<Options>>;
  /**
   * The permissions a member needs to use the command. Server admins can
   * change who sees it in the server settings.
   */
  permissions?: readonly PermissionName[];
  /** Also offer the command in private messages with the bot. */
  dm?: Dm;
  /** Only show the command in age-restricted channels. */
  nsfw?: boolean;
  /** Make the answers of the command only visible to who used it. */
  ephemeral?: boolean;
  /** What to do when someone uses the command. */
  run: (context: CommandContext<Options, Dm>) => unknown;
}

/** What `command()` returns: the default export of a command file. */
export interface CommandFile {
  /** What the file gave to `command()`, not checked yet. */
  readonly config: unknown;
}

const BRAND = Symbol.for('chapterjs.command');

/**
 * Declares a slash command. Export the result as the default export of a
 * file of `src/commands/`: the path of the file is the name of the command
 * (`src/commands/mod/ban.ts` is `/mod ban`).
 *
 * ```ts
 * import { command } from 'chapterjs';
 *
 * export default command({
 *   description: 'Replies with Pong!',
 *   async run({ interaction }) {
 *     await interaction.reply('Pong!');
 *   },
 * });
 * ```
 */
export function command<
  const Options extends CommandOptions = {},
  const Dm extends boolean = false,
>(config: CommandConfig<Options, Dm>): CommandFile {
  return Object.freeze({ [BRAND]: true, config });
}

/** Whether a value was made by `command()`. */
export function isCommandFile(value: unknown): value is CommandFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
