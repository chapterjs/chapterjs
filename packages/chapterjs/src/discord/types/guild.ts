import type { RawApplication } from './application.js';
import type {
  ChannelType,
  ForumLayoutType,
  ForumSortOrderType,
  RawChannel,
  RawDefaultReaction,
  RawForumTag,
  RawPermissionOverwrite,
  RawThreadMember,
  VideoQualityMode,
} from './channel.js';
import type {
  ISO8601Timestamp,
  ImageData,
  Locale,
  Snowflake,
} from './common.js';
import type { RawEmoji } from './emoji.js';
import type { OAuth2Scope } from './oauth2.js';
import type { RawRole, RawRoleColors } from './permissions.js';
import type { RawSticker } from './sticker.js';
import type {
  RawAvatarDecorationData,
  RawCollectibles,
  RawUser,
} from './user.js';

/**
 * Guild Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-object-guild-structure
 */
export interface RawGuild {
  /** guild id */
  id: Snowflake;
  /** guild name (2-100 characters, excluding trailing and leading whitespace) */
  name: string;
  /** icon hash */
  icon: string | null;
  /** icon hash, returned when in the template object */
  icon_hash?: string | null;
  /** splash hash */
  splash: string | null;
  /** discovery splash hash; only present for guilds with the "DISCOVERABLE" feature */
  discovery_splash: string | null;
  /** true if the user is the owner of the guild */
  owner?: boolean;
  /** id of owner */
  owner_id: Snowflake;
  /** total permissions for the user in the guild (excludes overwrites and implicit permissions) */
  permissions?: string;
  /** voice region id for the guild (deprecated) */
  region?: string | null;
  /** id of afk channel */
  afk_channel_id: Snowflake | null;
  /** afk timeout in seconds */
  afk_timeout: number;
  /** true if the server widget is enabled */
  widget_enabled?: boolean;
  /** the channel id that the widget will generate an invite to, or `null` if set to no invite */
  widget_channel_id?: Snowflake | null;
  /** verification level required for the guild */
  verification_level: VerificationLevel;
  /** default message notifications level */
  default_message_notifications: DefaultMessageNotificationLevel;
  /** explicit content filter level */
  explicit_content_filter: ExplicitContentFilterLevel;
  /** roles in the guild */
  roles: RawRole[];
  /** custom guild emojis */
  emojis: RawEmoji[];
  /** enabled guild features */
  features: GuildFeature[];
  /** required MFA level for the guild */
  mfa_level: MfaLevel;
  /** application id of the guild creator if it is bot-created */
  application_id: Snowflake | null;
  /** the id of the channel where guild notices such as welcome messages and boost events are posted */
  system_channel_id: Snowflake | null;
  /** system channel flags */
  system_channel_flags: number;
  /** the id of the channel where Community guilds can display rules and/or guidelines */
  rules_channel_id: Snowflake | null;
  /** the maximum number of presences for the guild (`null` is always returned, apart from the largest of guilds) */
  max_presences?: number | null;
  /** the maximum number of members for the guild */
  max_members?: number;
  /** the vanity url code for the guild */
  vanity_url_code: string | null;
  /** the description of a guild */
  description: string | null;
  /** banner hash */
  banner: string | null;
  /** premium tier (Server Boost level) */
  premium_tier: PremiumTier;
  /** the number of boosts this guild currently has */
  premium_subscription_count?: number;
  /** the preferred locale of a Community guild; used in server discovery and notices from Discord, and sent in interactions; defaults to "en-US" */
  preferred_locale: Locale;
  /** the id of the channel where admins and moderators of Community guilds receive notices from Discord */
  public_updates_channel_id: Snowflake | null;
  /** the maximum amount of users in a video channel */
  max_video_channel_users?: number;
  /** the maximum amount of users in a stage video channel */
  max_stage_video_channel_users?: number;
  /** approximate number of members in this guild, returned from the `GET /guilds/` and `/users/@me/guilds` endpoints when `with_counts` is `true` */
  approximate_member_count?: number;
  /** approximate number of non-offline members in this guild, returned from the `GET /guilds/` and `/users/@me/guilds`  endpoints when `with_counts` is `true` */
  approximate_presence_count?: number;
  /** the welcome screen of a Community guild, shown to new members, returned in an Invite's guild object */
  welcome_screen?: RawWelcomeScreen;
  /** guild age-restriction level */
  nsfw_level: GuildAgeRestrictionLevel;
  /** custom guild stickers */
  stickers?: RawSticker[];
  /** whether the guild has the boost progress bar enabled */
  premium_progress_bar_enabled: boolean;
  /** the id of the channel where admins and moderators of Community guilds receive safety alerts from Discord */
  safety_alerts_channel_id: Snowflake | null;
  /** the incidents data for this guild */
  incidents_data: RawIncidentsData | null;
}

/**
 * Default Message Notification Level
 * @see https://docs.discord.com/developers/resources/guild#guild-object-default-message-notification-level
 */
export const DefaultMessageNotificationLevel = {
  /** members will receive notifications for all messages by default */
  AllMessages: 0,
  /** members will receive notifications only for messages that @mention them by default */
  OnlyMentions: 1,
} as const;
export type DefaultMessageNotificationLevel =
  (typeof DefaultMessageNotificationLevel)[keyof typeof DefaultMessageNotificationLevel];

/**
 * Explicit Content Filter Level
 * @see https://docs.discord.com/developers/resources/guild#guild-object-explicit-content-filter-level
 */
export const ExplicitContentFilterLevel = {
  /** media content will not be scanned */
  Disabled: 0,
  /** media content sent by members without roles will be scanned */
  MembersWithoutRoles: 1,
  /** media content sent by all members will be scanned */
  AllMembers: 2,
} as const;
export type ExplicitContentFilterLevel =
  (typeof ExplicitContentFilterLevel)[keyof typeof ExplicitContentFilterLevel];

/**
 * MFA Level
 * @see https://docs.discord.com/developers/resources/guild#guild-object-mfa-level
 */
export const MfaLevel = {
  /** guild has no MFA/2FA requirement for moderation actions */
  None: 0,
  /** guild has a 2FA requirement for moderation actions */
  Elevated: 1,
} as const;
export type MfaLevel = (typeof MfaLevel)[keyof typeof MfaLevel];

/**
 * Verification Level
 * @see https://docs.discord.com/developers/resources/guild#guild-object-verification-level
 */
export const VerificationLevel = {
  /** unrestricted */
  None: 0,
  /** must have verified email on account */
  Low: 1,
  /** must be registered on Discord for longer than 5 minutes */
  Medium: 2,
  /** must be a member of the server for longer than 10 minutes */
  High: 3,
  /** must have a verified phone number */
  VeryHigh: 4,
} as const;
export type VerificationLevel =
  (typeof VerificationLevel)[keyof typeof VerificationLevel];

/**
 * Guild Age-Restriction Level
 * @see https://docs.discord.com/developers/resources/guild#guild-object-guild-nsfw-level
 */
export const GuildAgeRestrictionLevel = {
  Default: 0,
  Explicit: 1,
  Safe: 2,
  AgeRestricted: 3,
} as const;
export type GuildAgeRestrictionLevel =
  (typeof GuildAgeRestrictionLevel)[keyof typeof GuildAgeRestrictionLevel];

/**
 * Premium Tier
 * @see https://docs.discord.com/developers/resources/guild#guild-object-premium-tier
 */
export const PremiumTier = {
  /** guild has not unlocked any Server Boost perks */
  None: 0,
  /** guild has unlocked Server Boost level 1 perks */
  Tier1: 1,
  /** guild has unlocked Server Boost level 2 perks */
  Tier2: 2,
  /** guild has unlocked Server Boost level 3 perks */
  Tier3: 3,
} as const;
export type PremiumTier = (typeof PremiumTier)[keyof typeof PremiumTier];

/**
 * System Channel Flags
 * @see https://docs.discord.com/developers/resources/guild#guild-object-system-channel-flags
 */
export const SystemChannelFlags = {
  /** Suppress member join notifications */
  SuppressJoinNotifications: 1 << 0,
  /** Suppress server boost notifications */
  SuppressPremiumSubscriptions: 1 << 1,
  /** Suppress server setup tips */
  SuppressGuildReminderNotifications: 1 << 2,
  /** Hide member join sticker reply buttons */
  SuppressJoinNotificationReplies: 1 << 3,
  /** Suppress role subscription purchase and renewal notifications */
  SuppressRoleSubscriptionPurchaseNotifications: 1 << 4,
  /** Hide role subscription sticker reply buttons */
  SuppressRoleSubscriptionPurchaseNotificationReplies: 1 << 5,
} as const;
export type SystemChannelFlags =
  (typeof SystemChannelFlags)[keyof typeof SystemChannelFlags];

/**
 * Guild Preview Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-preview-object-guild-preview-structure
 */
export interface RawGuildPreview {
  /** guild id */
  id: Snowflake;
  /** guild name (2-100 characters) */
  name: string;
  /** icon hash */
  icon: string | null;
  /** splash hash */
  splash: string | null;
  /** discovery splash hash */
  discovery_splash: string | null;
  /** custom guild emojis */
  emojis: RawEmoji[];
  /** enabled guild features */
  features: GuildFeature[];
  /** approximate number of members in this guild */
  approximate_member_count: number;
  /** approximate number of online members in this guild */
  approximate_presence_count: number;
  /** the description for the guild */
  description: string | null;
  /** custom guild stickers */
  stickers: RawSticker[];
}

/**
 * Guild Widget Settings Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-widget-settings-object-guild-widget-settings-structure
 */
export interface RawGuildWidgetSettings {
  /** whether the widget is enabled */
  enabled: boolean;
  /** the widget channel id */
  channel_id: Snowflake | null;
}

/**
 * Guild Widget Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-widget-object-guild-widget-structure
 */
export interface RawGuildWidget {
  /** guild id */
  id: Snowflake;
  /** guild name (2-100 characters) */
  name: string;
  /** instant invite for the guilds specified widget invite channel */
  instant_invite: string | null;
  /** voice and stage channels which are accessible by @everyone */
  channels: Partial<RawChannel>[];
  /** special widget user objects that includes users presence (Limit 100) */
  members: Partial<RawUser>[];
  /** number of online members in this guild */
  presence_count: number;
}

/**
 * Guild Member Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-member-object-guild-member-structure
 */
export interface RawGuildMember {
  /** the user this guild member represents */
  user?: RawUser;
  /** this user's guild nickname */
  nick?: string | null;
  /** the member's guild avatar hash */
  avatar?: string | null;
  /** the member's guild banner hash */
  banner?: string | null;
  /** array of role object ids */
  roles: Snowflake[];
  /** when the user joined the guild */
  joined_at: ISO8601Timestamp | null;
  /** when the user started boosting the guild */
  premium_since?: ISO8601Timestamp | null;
  /** whether the user is deafened in voice channels */
  deaf: boolean;
  /** whether the user is muted in voice channels */
  mute: boolean;
  /** guild member flags represented as a bit set, defaults to `0` */
  flags: number;
  /** whether the user has not yet passed the guild's Membership Screening requirements */
  pending?: boolean;
  /** total permissions of the member in the channel, including overwrites, returned when in the interaction object */
  permissions?: string;
  /** when the user's timeout will expire and the user will be able to communicate in the guild again, null or a time in the past if the user is not timed out */
  communication_disabled_until?: ISO8601Timestamp | null;
  /** data for the member's guild avatar decoration */
  avatar_decoration_data?: RawAvatarDecorationData | null;
  /** data for the member's collectibles */
  collectibles?: RawCollectibles | null;
}

/**
 * Guild Member Flags
 * @see https://docs.discord.com/developers/resources/guild#guild-member-object-guild-member-flags
 */
export const GuildMemberFlags = {
  /** Member has left and rejoined the guild */
  DidRejoin: 1 << 0,
  /** Member has completed onboarding */
  CompletedOnboarding: 1 << 1,
  /** Member is exempt from guild verification requirements */
  BypassesVerification: 1 << 2,
  /** Member has started onboarding */
  StartedOnboarding: 1 << 3,
  /** Member is a guest and can only access the voice channel they were invited to */
  IsGuest: 1 << 4,
  /** Member has started Server Guide new member actions */
  StartedHomeActions: 1 << 5,
  /** Member has completed Server Guide new member actions */
  CompletedHomeActions: 1 << 6,
  /** Member's username, display name, or nickname is blocked by AutoMod */
  AutomodQuarantinedUsername: 1 << 7,
  /** Member has dismissed the DM settings upsell */
  DmSettingsUpsellAcknowledged: 1 << 9,
  /** Member's guild tag is blocked by AutoMod */
  AutomodQuarantinedGuildTag: 1 << 10,
} as const;
export type GuildMemberFlags =
  (typeof GuildMemberFlags)[keyof typeof GuildMemberFlags];

/**
 * Integration Structure
 * @see https://docs.discord.com/developers/resources/guild#integration-object-integration-structure
 */
export interface RawIntegration {
  /** integration id */
  id: Snowflake;
  /** integration name */
  name: string;
  /** integration type (twitch, youtube, discord, or guild_subscription) */
  type: string;
  /** is this integration enabled */
  enabled: boolean;
  /** is this integration syncing */
  syncing?: boolean;
  /** id that this integration uses for "subscribers" */
  role_id?: Snowflake;
  /** whether emoticons should be synced for this integration (twitch only currently) */
  enable_emoticons?: boolean;
  /** the behavior of expiring subscribers */
  expire_behavior?: IntegrationExpireBehavior;
  /** the grace period (in days) before expiring subscribers */
  expire_grace_period?: number;
  /** user for this integration */
  user?: RawUser;
  /** integration account information */
  account: RawIntegrationAccount;
  /** when this integration was last synced */
  synced_at?: ISO8601Timestamp;
  /** how many subscribers this integration has */
  subscriber_count?: number;
  /** has this integration been revoked */
  revoked?: boolean;
  /** The bot/OAuth2 application for discord integrations */
  application?: RawApplication;
  /** the scopes the application has been authorized for */
  scopes?: OAuth2Scope[];
}

/**
 * Integration Expire Behaviors
 * @see https://docs.discord.com/developers/resources/guild#integration-object-integration-expire-behaviors
 */
export const IntegrationExpireBehavior = {
  RemoveRole: 0,
  Kick: 1,
} as const;
export type IntegrationExpireBehavior =
  (typeof IntegrationExpireBehavior)[keyof typeof IntegrationExpireBehavior];

/**
 * Integration Account Structure
 * @see https://docs.discord.com/developers/resources/guild#integration-account-object-integration-account-structure
 */
export interface RawIntegrationAccount {
  /** id of the account */
  id: string;
  /** name of the account */
  name: string;
}

/**
 * Integration Application Structure
 * @see https://docs.discord.com/developers/resources/guild#integration-application-object-integration-application-structure
 */
export interface RawIntegrationApplication {
  /** the id of the app */
  id: Snowflake;
  /** the name of the app */
  name: string;
  /** the icon hash of the app */
  icon: string | null;
  /** the description of the app */
  description: string;
  /** the bot associated with this application */
  bot?: RawUser;
}

/**
 * Ban Structure
 * @see https://docs.discord.com/developers/resources/guild#ban-object-ban-structure
 */
export interface RawBan {
  /** the reason for the ban */
  reason: string | null;
  /** the banned user */
  user: RawUser;
}

/**
 * Welcome Screen Structure
 * @see https://docs.discord.com/developers/resources/guild#welcome-screen-object-welcome-screen-structure
 */
export interface RawWelcomeScreen {
  /** the server description shown in the welcome screen */
  description: string | null;
  /** the channels shown in the welcome screen, up to 5 */
  welcome_channels: RawWelcomeScreenChannel[];
}

/**
 * Welcome Screen Channel Structure
 * @see https://docs.discord.com/developers/resources/guild#welcome-screen-object-welcome-screen-channel-structure
 */
export interface RawWelcomeScreenChannel {
  /** the channel's id */
  channel_id: Snowflake;
  /** the description shown for the channel */
  description: string;
  /** the emoji id, if the emoji is custom */
  emoji_id: Snowflake | null;
  /** the emoji name if custom, the unicode character if standard, or `null` if no emoji is set */
  emoji_name: string | null;
}

/**
 * Guild Onboarding Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-onboarding-object-guild-onboarding-structure
 */
export interface RawGuildOnboarding {
  /** ID of the guild this onboarding is part of */
  guild_id: Snowflake;
  /** Prompts shown during onboarding and in customize community */
  prompts: RawOnboardingPrompt[];
  /** Channel IDs that members get opted into automatically */
  default_channel_ids: Snowflake[];
  /** Whether onboarding is enabled in the guild */
  enabled: boolean;
  /** Current mode of onboarding */
  mode: OnboardingMode;
}

/**
 * Onboarding Prompt Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-onboarding-object-onboarding-prompt-structure
 */
export interface RawOnboardingPrompt {
  /** ID of the prompt */
  id: Snowflake;
  /** Type of prompt */
  type: OnboardingPromptType;
  /** Options available within the prompt */
  options: RawOnboardingPromptOption[];
  /** Title of the prompt */
  title: string;
  /** Indicates whether users are limited to selecting one option for the prompt */
  single_select: boolean;
  /** Indicates whether the prompt is required before a user completes the onboarding flow */
  required: boolean;
  /** Indicates whether the prompt is present in the onboarding flow. If `false`, the prompt will only appear in the Channels & Roles tab */
  in_onboarding: boolean;
}

/**
 * Prompt Option Structure
 * @see https://docs.discord.com/developers/resources/guild#guild-onboarding-object-prompt-option-structure
 */
export interface RawOnboardingPromptOption {
  /** ID of the prompt option */
  id: Snowflake;
  /** IDs for channels a member is added to when the option is selected */
  channel_ids: Snowflake[];
  /** IDs for roles assigned to a member when the option is selected */
  role_ids: Snowflake[];
  /** Emoji of the option (see below) */
  emoji?: RawEmoji;
  /** Emoji ID of the option (see below) */
  emoji_id?: Snowflake;
  /** Emoji name of the option (see below) */
  emoji_name?: string;
  /** Whether the emoji is animated (see below) */
  emoji_animated?: boolean;
  /** Title of the option */
  title: string;
  /** Description of the option */
  description: string | null;
}

/**
 * Onboarding Mode
 * @see https://docs.discord.com/developers/resources/guild#guild-onboarding-object-onboarding-mode
 */
export const OnboardingMode = {
  /** Counts only Default Channels towards constraints */
  OnboardingDefault: 0,
  /** Counts Default Channels and Questions towards constraints */
  OnboardingAdvanced: 1,
} as const;
export type OnboardingMode =
  (typeof OnboardingMode)[keyof typeof OnboardingMode];

/**
 * Prompt Types
 * @see https://docs.discord.com/developers/resources/guild#guild-onboarding-object-prompt-types
 */
export const OnboardingPromptType = {
  MultipleChoice: 0,
  Dropdown: 1,
} as const;
export type OnboardingPromptType =
  (typeof OnboardingPromptType)[keyof typeof OnboardingPromptType];

/**
 * Incidents Data Structure
 * @see https://docs.discord.com/developers/resources/guild#incidents-data-object-incidents-data-structure
 */
export interface RawIncidentsData {
  /** when invites get enabled again */
  invites_disabled_until: ISO8601Timestamp | null;
  /** when direct messages get enabled again */
  dms_disabled_until: ISO8601Timestamp | null;
  /** when the dm spam was detected */
  dm_spam_detected_at?: ISO8601Timestamp | null;
  /** when the raid was detected */
  raid_detected_at?: ISO8601Timestamp | null;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild#get-guild-query-string-params
 */
export interface GetGuildQuery {
  /** when `true`, will return approximate member and presence counts for the guild */
  with_counts?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-json-params
 */
export interface ModifyGuildJSONParams {
  /** guild name */
  name?: string;
  /** guild voice region id (deprecated) */
  region?: string | null;
  /** verification level */
  verification_level?: VerificationLevel | null;
  /** default message notification level */
  default_message_notifications?: DefaultMessageNotificationLevel | null;
  /** explicit content filter level */
  explicit_content_filter?: ExplicitContentFilterLevel | null;
  /** id for afk channel */
  afk_channel_id?: Snowflake | null;
  /** afk timeout in seconds, can be set to: 60, 300, 900, 1800, 3600 */
  afk_timeout?: number;
  /** base64 1024x1024 png/jpeg/gif image for the guild icon (can be animated gif when the server has the `ANIMATED_ICON` feature) */
  icon?: ImageData | null;
  /** base64 16:9 png/jpeg image for the guild splash (when the server has the `INVITE_SPLASH` feature) */
  splash?: ImageData | null;
  /** base64 16:9 png/jpeg image for the guild discovery splash (when the server has the `DISCOVERABLE` feature) */
  discovery_splash?: ImageData | null;
  /** base64 16:9 png/jpeg image for the guild banner (when the server has the `BANNER` feature; can be animated gif when the server has the `ANIMATED_BANNER` feature) */
  banner?: ImageData | null;
  /** the id of the channel where guild notices such as welcome messages and boost events are posted */
  system_channel_id?: Snowflake | null;
  /** system channel flags */
  system_channel_flags?: number;
  /** the id of the channel where Community guilds display rules and/or guidelines */
  rules_channel_id?: Snowflake | null;
  /** the id of the channel where admins and moderators of Community guilds receive notices from Discord */
  public_updates_channel_id?: Snowflake | null;
  /** the preferred locale of a Community guild used in server discovery and notices from Discord; defaults to "en-US" */
  preferred_locale?: Locale | null;
  /** enabled guild features */
  features?: GuildFeature[];
  /** the description for the guild */
  description?: string | null;
  /** whether the guild's boost progress bar should be enabled */
  premium_progress_bar_enabled?: boolean;
  /** the id of the channel where admins and moderators of Community guilds receive safety alerts from Discord */
  safety_alerts_channel_id?: Snowflake | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#create-guild-channel-json-params
 */
export interface CreateGuildChannelJSONParams {
  /** channel name (1-100 characters) */
  name: string;
  /** the type of channel */
  type?: ChannelType | null;
  /** channel topic (0-1024 characters) */
  topic?: string | null;
  /** the bitrate (in bits per second) of the voice or stage channel; min 8000 */
  bitrate?: number | null;
  /** the user limit of the voice channel */
  user_limit?: number | null;
  /** amount of seconds a user has to wait before sending another message (0-21600); bots, as well as users with the permission `BYPASS_SLOWMODE`, are unaffected */
  rate_limit_per_user?: number | null;
  /** sorting position of the channel (channels with the same position are sorted by id) */
  position?: number | null;
  /** the channel's permission overwrites */
  permission_overwrites?: Partial<RawPermissionOverwrite>[] | null;
  /** id of the parent category for a channel */
  parent_id?: Snowflake | null;
  /** whether the channel is age-restricted */
  nsfw?: boolean | null;
  /** channel voice region id of the voice or stage channel, automatic when set to null */
  rtc_region?: string | null;
  /** the camera video quality mode of the voice channel */
  video_quality_mode?: VideoQualityMode | null;
  /** the default duration that the clients use (not the API) for newly created threads in the channel, in minutes, to automatically archive the thread after recent activity */
  default_auto_archive_duration?: number | null;
  /** emoji to show in the add reaction button on a thread in a `GUILD_FORUM` or a `GUILD_MEDIA` channel */
  default_reaction_emoji?: RawDefaultReaction | null;
  /** set of tags that can be used in a `GUILD_FORUM` or a `GUILD_MEDIA` channel */
  available_tags?: RawForumTag[] | null;
  /** the default sort order type used to order posts in `GUILD_FORUM` and `GUILD_MEDIA` channels */
  default_sort_order?: ForumSortOrderType | null;
  /** the default forum layout view used to display posts in `GUILD_FORUM` channels */
  default_forum_layout?: ForumLayoutType | null;
  /** the initial `rate_limit_per_user` to set on newly created threads in a channel. this field is copied to the thread at creation time and does not live update. */
  default_thread_rate_limit_per_user?: number | null;
  /** channel flags combined as a bitfield. */
  flags?: number | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-channel-positions-json-params
 */
export interface ModifyGuildChannelPositionsJSONParams {
  /** channel id */
  id?: Snowflake;
  /** sorting position of the channel (channels with the same position are sorted by id) */
  position?: number | null;
  /** syncs the permission overwrites with the new parent, if moving to a new category */
  lock_permissions?: boolean | null;
  /** the new parent ID for the channel that is moved */
  parent_id?: Snowflake | null;
  /** channel flags combined as a bitfield. */
  flags?: number | null;
}

/**
 * Response Body
 * @see https://docs.discord.com/developers/resources/guild#list-active-guild-threads-response-body
 */
export interface ListActiveGuildThreadsResponse {
  /** the active threads */
  threads: RawChannel[];
  /** a thread member object for each returned thread the current user has joined */
  members: RawThreadMember[];
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild#list-guild-members-query-string-params
 */
export interface ListGuildMembersQuery {
  /** max number of members to return (1-1000) */
  limit?: number;
  /** the highest user id in the previous page */
  after?: Snowflake;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild#search-guild-members-query-string-params
 */
export interface SearchGuildMembersQuery {
  /** Query string to match username(s) and nickname(s) against. */
  query?: string;
  /** max number of members to return (1-1000) */
  limit?: number;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#add-guild-member-json-params
 */
export interface AddGuildMemberJSONParams {
  /** an oauth2 access token granted with the `guilds.join` to the bot's application for the user you want to add to the guild */
  access_token: string;
  /** value to set user's nickname to */
  nick?: string;
  /** array of role ids the member is assigned */
  roles?: Snowflake[];
  /** whether the user is muted in voice channels */
  mute?: boolean;
  /** whether the user is deafened in voice channels */
  deaf?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-member-json-params
 */
export interface ModifyGuildMemberJSONParams {
  /** value to set user's nickname to */
  nick?: string;
  /** array of role ids the member is assigned */
  roles?: Snowflake[];
  /** whether the user is muted in voice channels. Will throw a 400 error if the user is not in a voice channel */
  mute?: boolean;
  /** whether the user is deafened in voice channels. Will throw a 400 error if the user is not in a voice channel */
  deaf?: boolean;
  /** id of channel to move user to (if they are connected to voice) */
  channel_id?: Snowflake;
  /** when the user's timeout will expire and the user will be able to communicate in the guild again (up to 28 days in the future), set to null to remove timeout. Will throw a 403 error if the user has the ADMINISTRATOR permission or is the owner of the guild */
  communication_disabled_until?: ISO8601Timestamp;
  /** guild member flags */
  flags?: number;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-current-member-json-params
 */
export interface ModifyCurrentMemberJSONParams {
  /** value to set user's nickname to */
  nick?: string | null;
  /** data URI base64 encoded banner image */
  banner?: string | null;
  /** data URI base64 encoded avatar image */
  avatar?: string | null;
  /** guild member bio */
  bio?: string | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-current-user-nick-json-params
 */
export interface ModifyCurrentUserNickJSONParams {
  /** value to set user's nickname to */
  nick?: string | null;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild#get-guild-bans-query-string-params
 */
export interface GetGuildBansQuery {
  /** number of users to return (up to maximum 1000) */
  limit?: number;
  /** consider only users before given user id */
  before?: Snowflake;
  /** consider only users after given user id */
  after?: Snowflake;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#create-guild-ban-json-params
 */
export interface CreateGuildBanJSONParams {
  /** number of days to delete messages for (0-7) (deprecated) */
  delete_message_days?: number;
  /** number of seconds to delete messages for, between 0 and 604800 (7 days) */
  delete_message_seconds?: number;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#bulk-guild-ban-json-params
 */
export interface BulkGuildBanJSONParams {
  /** list of user ids to ban (max 200) */
  user_ids: Snowflake[];
  /** number of seconds to delete messages for, between 0 and 604800 (7 days) */
  delete_message_seconds?: number;
}

/**
 * Bulk Ban Response
 * @see https://docs.discord.com/developers/resources/guild#bulk-guild-ban-bulk-ban-response
 */
export interface RawBulkBanResponse {
  /** list of user ids, that were successfully banned */
  banned_users: Snowflake[];
  /** list of user ids, that were not banned */
  failed_users: Snowflake[];
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#create-guild-role-json-params
 */
export interface CreateGuildRoleJSONParams {
  /** name of the role, max 100 characters */
  name?: string;
  /** bitwise value of the enabled/disabled permissions */
  permissions?: string;
  /** **Deprecated** RGB color value */
  color?: number;
  /** the role's colors */
  colors?: RawRoleColors;
  /** whether the role should be displayed separately in the sidebar */
  hoist?: boolean;
  /** the role's icon image (if the guild has the `ROLE_ICONS` feature) */
  icon?: ImageData | null;
  /** the role's unicode emoji as a standard emoji (if the guild has the `ROLE_ICONS` feature) */
  unicode_emoji?: string | null;
  /** whether the role should be mentionable */
  mentionable?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-role-positions-json-params
 */
export interface ModifyGuildRolePositionsJSONParams {
  /** role */
  id?: Snowflake;
  /** sorting position of the role (roles with the same position are sorted by id) */
  position?: number | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-role-json-params
 */
export interface ModifyGuildRoleJSONParams {
  /** name of the role, max 100 characters */
  name?: string;
  /** bitwise value of the enabled/disabled permissions */
  permissions?: string;
  /** **Deprecated** RGB color value */
  color?: number;
  /** the role's colors */
  colors?: RawRoleColors;
  /** whether the role should be displayed separately in the sidebar */
  hoist?: boolean;
  /** the role's icon image (if the guild has the `ROLE_ICONS` feature) */
  icon?: ImageData;
  /** the role's unicode emoji as a standard emoji (if the guild has the `ROLE_ICONS` feature) */
  unicode_emoji?: string;
  /** whether the role should be mentionable */
  mentionable?: boolean;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild#get-guild-prune-count-query-string-params
 */
export interface GetGuildPruneCountQuery {
  /** number of days to count prune for (1-30) */
  days?: number;
  /** role(s) to include */
  include_roles?: string;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#begin-guild-prune-json-params
 */
export interface BeginGuildPruneJSONParams {
  /** number of days to prune (1-30) */
  days?: number;
  /** whether `pruned` is returned, discouraged for large guilds */
  compute_prune_count?: boolean;
  /** role(s) to include */
  include_roles?: Snowflake[];
  /** reason for the prune (deprecated) */
  reason?: string;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/guild#get-guild-widget-image-query-string-params
 */
export interface GetGuildWidgetImageQuery {
  /** style of the widget image returned (see below) */
  style?: GuildWidgetStyle;
}

/**
 * Widget Style Options
 * @see https://docs.discord.com/developers/resources/guild#get-guild-widget-image-widget-style-options
 */
export const GuildWidgetStyle = {
  Shield: 'shield',
  Banner1: 'banner1',
  Banner2: 'banner2',
  Banner3: 'banner3',
  Banner4: 'banner4',
} as const;
export type GuildWidgetStyle =
  (typeof GuildWidgetStyle)[keyof typeof GuildWidgetStyle];

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-welcome-screen-json-params
 */
export interface ModifyGuildWelcomeScreenJSONParams {
  /** whether the welcome screen is enabled */
  enabled?: boolean;
  /** channels linked in the welcome screen and their display options */
  welcome_channels?: RawWelcomeScreenChannel[];
  /** the server description to show in the welcome screen */
  description?: string;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-onboarding-json-params
 */
export interface ModifyGuildOnboardingJSONParams {
  /** Prompts shown during onboarding and in customize community */
  prompts?: RawOnboardingPrompt[];
  /** Channel IDs that members get opted into automatically */
  default_channel_ids?: Snowflake[];
  /** Whether onboarding is enabled in the guild */
  enabled?: boolean;
  /** Current mode of onboarding */
  mode?: OnboardingMode;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-incident-actions-json-params
 */
export interface ModifyGuildIncidentActionsJSONParams {
  /** when invites will be enabled again */
  invites_disabled_until?: ISO8601Timestamp | null;
  /** when direct messages will be enabled again */
  dms_disabled_until?: ISO8601Timestamp | null;
}

/**
 * Guild Features
 * @see https://docs.discord.com/developers/resources/guild#guild-object-guild-features
 */
export type GuildFeature =
  | 'ANIMATED_BANNER'
  | 'ANIMATED_ICON'
  | 'APPLICATION_COMMAND_PERMISSIONS_V2'
  | 'AUTO_MODERATION'
  | 'BANNER'
  | 'COMMUNITY'
  | 'CREATOR_MONETIZABLE_PROVISIONAL'
  | 'CREATOR_STORE_PAGE'
  | 'DEVELOPER_SUPPORT_SERVER'
  | 'DISCOVERABLE'
  | 'ENHANCED_ROLE_COLORS'
  | 'FEATURABLE'
  | 'GUILD_TAGS'
  | 'GUESTS_ENABLED'
  | 'INVITES_DISABLED'
  | 'INVITE_SPLASH'
  | 'MEMBER_VERIFICATION_GATE_ENABLED'
  | 'MORE_SOUNDBOARD'
  | 'MORE_STICKERS'
  | 'NEWS'
  | 'PARTNERED'
  | 'PREVIEW_ENABLED'
  | 'PRUNE_REQUIRES_ADMIN'
  | 'RAID_ALERTS_DISABLED'
  | 'ROLE_ICONS'
  | 'ROLE_SUBSCRIPTIONS_AVAILABLE_FOR_PURCHASE'
  | 'ROLE_SUBSCRIPTIONS_ENABLED'
  | 'SOUNDBOARD'
  | 'TICKETED_EVENTS_ENABLED'
  | 'VANITY_URL'
  | 'VERIFIED'
  | 'VIP_REGIONS'
  | 'WELCOME_SCREEN_ENABLED'
  // Discord adds features over time: an unknown one must not break typing.
  | (string & {});

/**
 * Unavailable Guild Object: a guild that is offline, or not sent yet.
 * @see https://docs.discord.com/developers/resources/guild#unavailable-guild-object
 */
export interface RawUnavailableGuild {
  id: Snowflake;
  unavailable?: boolean;
}
