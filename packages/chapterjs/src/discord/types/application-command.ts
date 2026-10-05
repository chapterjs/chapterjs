import type { ApplicationIntegrationType } from './application.js';
import type { ChannelType } from './channel.js';
import type { Locale, Snowflake } from './common.js';
import type { InteractionContextType } from './interaction.js';

/**
 * Application Command Structure
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-structure
 */
export interface RawApplicationCommand {
  /** Unique ID of command */
  id: Snowflake;
  /** Type of command, defaults to `1` */
  type?: ApplicationCommandType;
  /** ID of the parent application */
  application_id: Snowflake;
  /** Guild ID of the command, if not global */
  guild_id?: Snowflake;
  /** Name of command, 1-32 characters */
  name: string;
  /** Localization dictionary for `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** Description for `CHAT_INPUT` and `PRIMARY_ENTRY_POINT` commands, 1-100 characters. Empty string for `USER` and `MESSAGE` commands */
  description: string;
  /** Localization dictionary for `description` field. Values follow the same restrictions as `description` */
  description_localizations?: Partial<Record<Locale, string>> | null;
  /** Parameters for the command, max of 25 */
  options?: RawApplicationCommandOption[];
  /** Set of permissions represented as a bit set */
  default_member_permissions: string | null;
  /** **Deprecated (use `contexts` instead)**; Indicates whether the command is available in DMs with the app, only for globally-scoped commands. By default, commands are visible. */
  dm_permission?: boolean;
  /** Not recommended for use as field will soon be deprecated. Indicates whether the command is enabled by default when the app is added to a guild, defaults to `true` */
  default_permission?: boolean | null;
  /** Indicates whether the command is age-restricted, defaults to `false` */
  nsfw?: boolean;
  /** Installation contexts where the command is available, only for globally-scoped commands. Defaults to your app's configured contexts */
  integration_types?: ApplicationIntegrationType[];
  /** Interaction context(s) where the command can be used, only for globally-scoped commands. */
  contexts?: InteractionContextType[] | null;
  /** Autoincrementing version identifier updated during substantial record changes */
  version: Snowflake;
  /** Determines whether the interaction is handled by the app's interactions handler or by Discord */
  handler?: EntryPointCommandHandlerType;
}

/**
 * Application Command Option Structure
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-option-structure
 */
export interface RawApplicationCommandOption {
  /** Type of option */
  type: ApplicationCommandOptionType;
  /** 1-32 character name */
  name: string;
  /** Localization dictionary for the `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** 1-100 character description */
  description: string;
  /** Localization dictionary for the `description` field. Values follow the same restrictions as `description` */
  description_localizations?: Partial<Record<Locale, string>> | null;
  /** Whether the parameter is required or optional, default `false` */
  required?: boolean;
  /** Choices for the user to pick from, max 25 */
  choices?: RawApplicationCommandOptionChoice[];
  /** If the option is a subcommand or subcommand group type, these nested options will be the parameters or subcommands respectively; up to 25 */
  options?: RawApplicationCommandOption[];
  /** The channels shown will be restricted to these types */
  channel_types?: ChannelType[];
  /** The minimum value permitted */
  min_value?: number;
  /** The maximum value permitted */
  max_value?: number;
  /** The minimum allowed length (minimum of `0`, maximum of `6000`) */
  min_length?: number;
  /** The maximum allowed length (minimum of `1`, maximum of `6000`) */
  max_length?: number;
  /** If autocomplete interactions are enabled for this option */
  autocomplete?: boolean;
  /** File types to filter for; can be `image`, `video`, `audio`, or any dot-prefixed extension such as `.pdf`; max 10 */
  file_types?: string[];
}

/**
 * Application Command Option Type
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-option-type
 */
export const ApplicationCommandOptionType = {
  SubCommand: 1,
  SubCommandGroup: 2,
  String: 3,
  Integer: 4,
  Boolean: 5,
  User: 6,
  Channel: 7,
  Role: 8,
  Mentionable: 9,
  Number: 10,
  Attachment: 11,
} as const;
export type ApplicationCommandOptionType =
  (typeof ApplicationCommandOptionType)[keyof typeof ApplicationCommandOptionType];

/**
 * Application Command Option Choice Structure
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-option-choice-structure
 */
export interface RawApplicationCommandOptionChoice {
  /** 1-100 character choice name */
  name: string;
  /** Localization dictionary for the `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** Value for the choice, up to 100 characters if string */
  value: string | number;
}

/**
 * Entry Point Command Handler Types
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-object-entry-point-command-handler-types
 */
export const EntryPointCommandHandlerType = {
  AppHandler: 1,
  DiscordLaunchActivity: 2,
} as const;
export type EntryPointCommandHandlerType =
  (typeof EntryPointCommandHandlerType)[keyof typeof EntryPointCommandHandlerType];

/**
 * Guild Application Command Permissions Structure
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-permissions-object-guild-application-command-permissions-structure
 */
export interface RawGuildApplicationCommandPermissions {
  /** ID of the command or the application ID */
  id: Snowflake;
  /** ID of the application the command belongs to */
  application_id: Snowflake;
  /** ID of the guild */
  guild_id: Snowflake;
  /** Permissions for the command in the guild, max of 100 */
  permissions: RawApplicationCommandPermissions[];
}

/**
 * Application Command Permissions Structure
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-permissions-object-application-command-permissions-structure
 */
export interface RawApplicationCommandPermissions {
  /** ID of the role, user, or channel. It can also be a permission constant */
  id: Snowflake;
  /** role (`1`), user (`2`), or channel (`3`) */
  type: ApplicationCommandPermissionType;
  /** `true` to allow, `false`, to disallow */
  permission: boolean;
}

/**
 * Application Command Permission Type
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-permissions-object-application-command-permission-type
 */
export const ApplicationCommandPermissionType = {
  Role: 1,
  User: 2,
  Channel: 3,
} as const;
export type ApplicationCommandPermissionType =
  (typeof ApplicationCommandPermissionType)[keyof typeof ApplicationCommandPermissionType];

/**
 * Query String Params
 * @see https://docs.discord.com/developers/interactions/application-commands#get-global-application-commands-query-string-params
 */
export interface GetGlobalApplicationCommandsQuery {
  /** Whether to include full localization dictionaries (`name_localizations` and `description_localizations`) in the returned objects, instead of the `name_localized` and `description_localized` fields. Default `false`. */
  with_localizations?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/interactions/application-commands#create-global-application-command-json-params
 */
export interface CreateGlobalApplicationCommandJSONParams {
  /** Name of command, 1-32 characters */
  name: string;
  /** Localization dictionary for the `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** 1-100 character description for `CHAT_INPUT` and `PRIMARY_ENTRY_POINT` commands */
  description?: string;
  /** Localization dictionary for the `description` field. Values follow the same restrictions as `description` */
  description_localizations?: Partial<Record<Locale, string>> | null;
  /** Parameters for the command, max of 25. Only for `CHAT_INPUT` commands */
  options?: RawApplicationCommandOption[];
  /** Set of permissions represented as a bit set */
  default_member_permissions?: string | null;
  /** **Deprecated (use `contexts` instead)**; Indicates whether the command is available in DMs with the app, only for globally-scoped commands. By default, commands are visible. */
  dm_permission?: boolean | null;
  /** Replaced by `default_member_permissions` and will be deprecated in the future. Indicates whether the command is enabled by default when the app is added to a guild. Defaults to `true` */
  default_permission?: boolean;
  /** Installation context(s) where the command is available */
  integration_types?: ApplicationIntegrationType[];
  /** Interaction context(s) where the command can be used */
  contexts?: InteractionContextType[];
  /** Type of command, defaults `1` if not set */
  type?: ApplicationCommandType;
  /** Indicates whether the command is age-restricted */
  nsfw?: boolean;
  /** Determines whether the interaction is handled by the app's interactions handler or by Discord. Only for `PRIMARY_ENTRY_POINT` commands */
  handler?: EntryPointCommandHandlerType;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/interactions/application-commands#edit-global-application-command-json-params
 */
export interface EditGlobalApplicationCommandJSONParams {
  /** Name of command, 1-32 characters */
  name?: string;
  /** Localization dictionary for the `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** 1-100 character description */
  description?: string;
  /** Localization dictionary for the `description` field. Values follow the same restrictions as `description` */
  description_localizations?: Partial<Record<Locale, string>> | null;
  /** Parameters for the command, max of 25. Only for `CHAT_INPUT` commands */
  options?: RawApplicationCommandOption[];
  /** Set of permissions represented as a bit set */
  default_member_permissions?: string | null;
  /** **Deprecated (use `contexts` instead)**; Indicates whether the command is available in DMs with the app, only for globally-scoped commands. By default, commands are visible. */
  dm_permission?: boolean | null;
  /** Replaced by `default_member_permissions` and will be deprecated in the future. Indicates whether the command is enabled by default when the app is added to a guild. Defaults to `true` */
  default_permission?: boolean;
  /** Installation context(s) where the command is available */
  integration_types?: ApplicationIntegrationType[];
  /** Interaction context(s) where the command can be used */
  contexts?: InteractionContextType[];
  /** Indicates whether the command is age-restricted */
  nsfw?: boolean;
  /** Determines whether the interaction is handled by the app's interactions handler or by Discord. Only for `PRIMARY_ENTRY_POINT` commands */
  handler?: EntryPointCommandHandlerType;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/interactions/application-commands#get-guild-application-commands-query-string-params
 */
export interface GetGuildApplicationCommandsQuery {
  /** Whether to include full localization dictionaries (`name_localizations` and `description_localizations`) in the returned objects, instead of the `name_localized` and `description_localized` fields. Default `false`. */
  with_localizations?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/interactions/application-commands#create-guild-application-command-json-params
 */
export interface CreateGuildApplicationCommandJSONParams {
  /** Name of command, 1-32 characters */
  name: string;
  /** Localization dictionary for the `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** 1-100 character description for `CHAT_INPUT` commands */
  description?: string;
  /** Localization dictionary for the `description` field. Values follow the same restrictions as `description` */
  description_localizations?: Partial<Record<Locale, string>> | null;
  /** Parameters for the command, max of 25. Only for `CHAT_INPUT` commands */
  options?: RawApplicationCommandOption[];
  /** Set of permissions represented as a bit set */
  default_member_permissions?: string | null;
  /** Replaced by `default_member_permissions` and will be deprecated in the future. Indicates whether the command is enabled by default when the app is added to a guild. Defaults to `true` */
  default_permission?: boolean;
  /** Type of command, defaults `1` if not set */
  type?: ApplicationCommandType;
  /** Indicates whether the command is age-restricted */
  nsfw?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/interactions/application-commands#edit-guild-application-command-json-params
 */
export interface EditGuildApplicationCommandJSONParams {
  /** Name of command, 1-32 characters */
  name?: string;
  /** Localization dictionary for the `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** 1-100 character description */
  description?: string;
  /** Localization dictionary for the `description` field. Values follow the same restrictions as `description` */
  description_localizations?: Partial<Record<Locale, string>> | null;
  /** Parameters for the command, max of 25. Only for `CHAT_INPUT` commands */
  options?: RawApplicationCommandOption[];
  /** Set of permissions represented as a bit set */
  default_member_permissions?: string | null;
  /** Replaced by `default_member_permissions` and will be deprecated in the future. Indicates whether the command is enabled by default when the app is added to a guild. Defaults to `true` */
  default_permission?: boolean;
  /** Indicates whether the command is age-restricted */
  nsfw?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-guild-application-commands-json-params
 */
export interface BulkOverwriteGuildApplicationCommandsJSONParams {
  /** ID of the command, if known */
  id?: Snowflake;
  /** Name of command, 1-32 characters */
  name: string;
  /** Localization dictionary for the `name` field. Values follow the same restrictions as `name` */
  name_localizations?: Partial<Record<Locale, string>> | null;
  /** 1-100 character description */
  description: string;
  /** Localization dictionary for the `description` field. Values follow the same restrictions as `description` */
  description_localizations?: Partial<Record<Locale, string>> | null;
  /** Parameters for the command */
  options?: RawApplicationCommandOption[];
  /** Set of permissions represented as a bit set */
  default_member_permissions?: string | null;
  /** **Deprecated (use `contexts` instead)**; Indicates whether the command is available in DMs with the app, only for globally-scoped commands. By default, commands are visible. */
  dm_permission?: boolean | null;
  /** Replaced by `default_member_permissions` and will be deprecated in the future. Indicates whether the command is enabled by default when the app is added to a guild. Defaults to `true` */
  default_permission?: boolean;
  /** Installation context(s) where the command is available, defaults to `GUILD_INSTALL` (`[0]`) */
  integration_types: ApplicationIntegrationType[];
  /** Interaction context(s) where the command can be used, defaults to all contexts `[0,1,2]` */
  contexts: InteractionContextType[];
  /** Type of command, defaults `1` if not set */
  type?: ApplicationCommandType;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/interactions/application-commands#edit-application-command-permissions-json-params
 */
export interface EditApplicationCommandPermissionsJSONParams {
  /** Permissions for the command in the guild */
  permissions: RawApplicationCommandPermissions[];
}

/**
 * Application Command Types
 * @see https://docs.discord.com/developers/interactions/application-commands#application-command-object-application-command-types
 */
export const ApplicationCommandType = {
  /** Slash commands; a text-based command that shows up when a user types `/` */
  ChatInput: 1,
  /** A UI-based command that shows up when you right click or tap on a user */
  User: 2,
  /** A UI-based command that shows up when you right click or tap on a message */
  Message: 3,
  /** A UI-based command that represents the primary way to invoke an app's Activity */
  PrimaryEntryPoint: 4,
} as const;
export type ApplicationCommandType =
  (typeof ApplicationCommandType)[keyof typeof ApplicationCommandType];
