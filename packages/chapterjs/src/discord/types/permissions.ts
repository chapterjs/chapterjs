import type { Snowflake } from './common.js';

/**
 * Bitwise Permission Flags
 * @see https://docs.discord.com/developers/topics/permissions#permissions-bitwise-permission-flags
 */
export const PermissionFlags = {
  /** Allows creation of instant invites */
  CreateInstantInvite: 1n << 0n,
  /** Allows kicking members */
  KickMembers: 1n << 1n,
  /** Allows banning members */
  BanMembers: 1n << 2n,
  /** Allows all permissions and bypasses channel permission overwrites */
  Administrator: 1n << 3n,
  /** Allows management and editing of channels */
  ManageChannels: 1n << 4n,
  /** Allows management and editing of the guild */
  ManageGuild: 1n << 5n,
  /** Allows for adding new reactions to messages. This permission does not apply to reacting with an existing reaction on a message. */
  AddReactions: 1n << 6n,
  /** Allows for viewing of audit logs */
  ViewAuditLog: 1n << 7n,
  /** Allows for using priority speaker in a voice channel */
  PrioritySpeaker: 1n << 8n,
  /** Allows the user to go live */
  Stream: 1n << 9n,
  /** Allows guild members to view a channel, which includes reading messages in text channels and joining voice channels */
  ViewChannel: 1n << 10n,
  /** Allows for sending messages in a channel and creating threads in a forum (does not allow sending messages in threads) */
  SendMessages: 1n << 11n,
  /** Allows for sending of `/tts` messages */
  SendTtsMessages: 1n << 12n,
  /** Allows for deletion of other users messages */
  ManageMessages: 1n << 13n,
  /** Links sent by users with this permission will be auto-embedded */
  EmbedLinks: 1n << 14n,
  /** Allows for uploading images and files */
  AttachFiles: 1n << 15n,
  /** Allows for reading of message history */
  ReadMessageHistory: 1n << 16n,
  /** Allows for using the `@everyone` tag to notify all users in a channel, and the `@here` tag to notify all online users in a channel */
  MentionEveryone: 1n << 17n,
  /** Allows the usage of custom emojis from other servers */
  UseExternalEmojis: 1n << 18n,
  /** Allows for viewing guild insights */
  ViewGuildInsights: 1n << 19n,
  /** Allows for joining of a voice channel */
  Connect: 1n << 20n,
  /** Allows for speaking in a voice channel */
  Speak: 1n << 21n,
  /** Allows for muting members in a voice channel */
  MuteMembers: 1n << 22n,
  /** Allows for deafening of members in a voice channel */
  DeafenMembers: 1n << 23n,
  /** Allows for moving of members between voice channels */
  MoveMembers: 1n << 24n,
  /** Allows for using voice-activity-detection in a voice channel */
  UseVad: 1n << 25n,
  /** Allows for modification of own nickname */
  ChangeNickname: 1n << 26n,
  /** Allows for modification of other users nicknames */
  ManageNicknames: 1n << 27n,
  /** Allows management and editing of roles */
  ManageRoles: 1n << 28n,
  /** Allows management and editing of webhooks */
  ManageWebhooks: 1n << 29n,
  /** Allows for editing and deleting emojis, stickers, and soundboard sounds created by all users */
  ManageGuildExpressions: 1n << 30n,
  /** Allows members to use application commands, including slash commands and context menu commands. */
  UseApplicationCommands: 1n << 31n,
  /** Allows for requesting to speak in stage channels */
  RequestToSpeak: 1n << 32n,
  /** Allows for editing and deleting scheduled events created by all users */
  ManageEvents: 1n << 33n,
  /** Allows for deleting and archiving threads, and viewing all private threads */
  ManageThreads: 1n << 34n,
  /** Allows for creating public and announcement threads */
  CreatePublicThreads: 1n << 35n,
  /** Allows for creating private threads */
  CreatePrivateThreads: 1n << 36n,
  /** Allows the usage of custom stickers from other servers */
  UseExternalStickers: 1n << 37n,
  /** Allows for sending messages in threads */
  SendMessagesInThreads: 1n << 38n,
  /** Allows for using Activities (applications with the `EMBEDDED` flag) */
  UseEmbeddedActivities: 1n << 39n,
  /** Allows for timing out users to prevent them from sending or reacting to messages in chat and threads, and from speaking in voice and stage channels */
  ModerateMembers: 1n << 40n,
  /** Allows for viewing role subscription insights */
  ViewCreatorMonetizationAnalytics: 1n << 41n,
  /** Allows for using soundboard in a voice channel */
  UseSoundboard: 1n << 42n,
  /** Allows for creating emojis, stickers, and soundboard sounds, and editing and deleting those created by the current user. */
  CreateGuildExpressions: 1n << 43n,
  /** Allows for creating scheduled events, and editing and deleting those created by the current user. */
  CreateEvents: 1n << 44n,
  /** Allows the usage of custom soundboard sounds from other servers */
  UseExternalSounds: 1n << 45n,
  /** Allows sending voice messages */
  SendVoiceMessages: 1n << 46n,
  /** Allows setting voice channel status */
  SetVoiceChannelStatus: 1n << 48n,
  /** Allows sending polls */
  SendPolls: 1n << 49n,
  /** Allows user-installed apps to send public responses. When disabled, users will still be allowed to use their apps but the responses will be ephemeral. This only applies to apps not also installed to the server. */
  UseExternalApps: 1n << 50n,
  /** Allows pinning and unpinning messages */
  PinMessages: 1n << 51n,
  /** Allows bypassing slowmode restrictions */
  BypassSlowmode: 1n << 52n,
} as const;
export type PermissionFlags =
  (typeof PermissionFlags)[keyof typeof PermissionFlags];

/**
 * Role Structure
 * @see https://docs.discord.com/developers/topics/permissions#role-object-role-structure
 */
export interface RawRole {
  /** role id */
  id: Snowflake;
  /** role name */
  name: string;
  /** **Deprecated** integer representation of hexadecimal color code */
  color: number;
  /** the role's colors */
  colors: RawRoleColors;
  /** if this role is pinned in the user listing */
  hoist: boolean;
  /** role icon hash */
  icon?: string | null;
  /** role unicode emoji */
  unicode_emoji?: string | null;
  /** position of this role (roles with the same position are sorted by id) */
  position: number;
  /** permission bit set */
  permissions: string;
  /** whether this role is managed by an integration */
  managed: boolean;
  /** whether this role is mentionable */
  mentionable: boolean;
  /** the tags this role has */
  tags?: RawRoleTags;
  /** role flags combined as a bitfield */
  flags: number;
}

/**
 * Role Tags Structure
 * @see https://docs.discord.com/developers/topics/permissions#role-object-role-tags-structure
 */
export interface RawRoleTags {
  /** the id of the bot this role belongs to */
  bot_id?: Snowflake;
  /** the id of the integration this role belongs to */
  integration_id?: Snowflake;
  /** whether this is the guild's Booster role */
  premium_subscriber?: null;
  /** the id of this role's subscription sku and listing */
  subscription_listing_id?: Snowflake;
  /** whether this role is available for purchase */
  available_for_purchase?: null;
  /** whether this role is a guild's linked role */
  guild_connections?: null;
}

/**
 * Role Colors Object
 * @see https://docs.discord.com/developers/topics/permissions#role-object-role-colors-object
 */
export interface RawRoleColors {
  /** the primary color for the role */
  primary_color: number;
  /** the secondary color for the role, this will make the role a gradient between the other provided colors */
  secondary_color: number | null;
  /** the tertiary color for the role, this will turn the gradient into a holographic style */
  tertiary_color: number | null;
}

/**
 * The colors of a role as a request gives them: only the primary color is
 * needed, the two others make a gradient when given.
 * @see https://docs.discord.com/developers/topics/permissions#role-object-role-colors-object
 */
export type RawRoleColorsInput = Pick<RawRoleColors, 'primary_color'> &
  Partial<Omit<RawRoleColors, 'primary_color'>>;

/**
 * Role Flags
 * @see https://docs.discord.com/developers/topics/permissions#role-object-role-flags
 */
export const RoleFlags = {
  /** role can be selected by members in an onboarding prompt */
  InPrompt: 1 << 0,
} as const;
export type RoleFlags = (typeof RoleFlags)[keyof typeof RoleFlags];
