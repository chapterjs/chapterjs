import type { RawApplicationCommand } from './application-command.js';
import type { RawAutoModerationRule } from './auto-moderation.js';
import type { RawChannel } from './channel.js';
import type { Snowflake } from './common.js';
import type { RawIntegration } from './guild.js';
import type { RawGuildScheduledEvent } from './guild-scheduled-event.js';
import type { RawUser } from './user.js';
import type { RawWebhook } from './webhook.js';

/**
 * Audit Log Structure
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-object-audit-log-structure
 */
export interface RawAuditLog {
  /** List of application commands referenced in the audit log */
  application_commands: RawApplicationCommand[];
  /** List of audit log entries, sorted from most to least recent */
  audit_log_entries: RawAuditLogEntry[];
  /** List of auto moderation rules referenced in the audit log */
  auto_moderation_rules: RawAutoModerationRule[];
  /** List of guild scheduled events referenced in the audit log */
  guild_scheduled_events: RawGuildScheduledEvent[];
  /** List of partial integration objects */
  integrations: Partial<RawIntegration>[];
  /** List of threads referenced in the audit log* */
  threads: RawChannel[];
  /** List of users referenced in the audit log */
  users: RawUser[];
  /** List of webhooks referenced in the audit log */
  webhooks: RawWebhook[];
}

/**
 * Audit Log Entry Structure
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-entry-object-audit-log-entry-structure
 */
export interface RawAuditLogEntry {
  /** ID of the affected entity (webhook, user, role, etc.) */
  target_id: string | null;
  /** Changes made to the target_id */
  changes?: RawAuditLogChange[];
  /** User or app that made the changes */
  user_id: Snowflake | null;
  /** ID of the entry */
  id: Snowflake;
  /** Type of action that occurred */
  action_type: AuditLogEvent;
  /** Additional info for certain event types */
  options?: RawOptionalAuditEntryInfo;
  /** Reason for the change (1-512 characters) */
  reason?: string;
}

/**
 * Audit Log Events
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-entry-object-audit-log-events
 */
export const AuditLogEvent = {
  /** Server settings were updated */
  GuildUpdate: 1,
  /** Channel was created */
  ChannelCreate: 10,
  /** Channel settings were updated */
  ChannelUpdate: 11,
  /** Channel was deleted */
  ChannelDelete: 12,
  /** Permission overwrite was added to a channel */
  ChannelOverwriteCreate: 13,
  /** Permission overwrite was updated for a channel */
  ChannelOverwriteUpdate: 14,
  /** Permission overwrite was deleted from a channel */
  ChannelOverwriteDelete: 15,
  /** Member was removed from server */
  MemberKick: 20,
  /** Members were pruned from server */
  MemberPrune: 21,
  /** Member was banned from server */
  MemberBanAdd: 22,
  /** Server ban was lifted for a member */
  MemberBanRemove: 23,
  /** Member was updated in server */
  MemberUpdate: 24,
  /** Member was added or removed from a role */
  MemberRoleUpdate: 25,
  /** Member was moved to a different voice channel */
  MemberMove: 26,
  /** Member was disconnected from a voice channel */
  MemberDisconnect: 27,
  /** Bot user was added to server */
  BotAdd: 28,
  /** Role was created */
  RoleCreate: 30,
  /** Role was edited */
  RoleUpdate: 31,
  /** Role was deleted */
  RoleDelete: 32,
  /** Server invite was created */
  InviteCreate: 40,
  /** Server invite was updated */
  InviteUpdate: 41,
  /** Server invite was deleted */
  InviteDelete: 42,
  /** Webhook was created */
  WebhookCreate: 50,
  /** Webhook properties or channel were updated */
  WebhookUpdate: 51,
  /** Webhook was deleted */
  WebhookDelete: 52,
  /** Emoji was created */
  EmojiCreate: 60,
  /** Emoji name was updated */
  EmojiUpdate: 61,
  /** Emoji was deleted */
  EmojiDelete: 62,
  /** Single message was deleted */
  MessageDelete: 72,
  /** Multiple messages were deleted */
  MessageBulkDelete: 73,
  /** Message was pinned to a channel */
  MessagePin: 74,
  /** Message was unpinned from a channel */
  MessageUnpin: 75,
  /** App was added to server */
  IntegrationCreate: 80,
  /** App was updated (as an example, its scopes were updated) */
  IntegrationUpdate: 81,
  /** App was removed from server */
  IntegrationDelete: 82,
  /** Stage instance was created (stage channel becomes live) */
  StageInstanceCreate: 83,
  /** Stage instance details were updated */
  StageInstanceUpdate: 84,
  /** Stage instance was deleted (stage channel no longer live) */
  StageInstanceDelete: 85,
  /** Sticker was created */
  StickerCreate: 90,
  /** Sticker details were updated */
  StickerUpdate: 91,
  /** Sticker was deleted */
  StickerDelete: 92,
  /** Event was created */
  GuildScheduledEventCreate: 100,
  /** Event was updated */
  GuildScheduledEventUpdate: 101,
  /** Event was cancelled */
  GuildScheduledEventDelete: 102,
  /** Thread was created in a channel */
  ThreadCreate: 110,
  /** Thread was updated */
  ThreadUpdate: 111,
  /** Thread was deleted */
  ThreadDelete: 112,
  /** Permissions were updated for a command */
  ApplicationCommandPermissionUpdate: 121,
  /** Soundboard sound was created */
  SoundboardSoundCreate: 130,
  /** Soundboard sound was updated */
  SoundboardSoundUpdate: 131,
  /** Soundboard sound was deleted */
  SoundboardSoundDelete: 132,
  /** Auto Moderation rule was created */
  AutoModerationRuleCreate: 140,
  /** Auto Moderation rule was updated */
  AutoModerationRuleUpdate: 141,
  /** Auto Moderation rule was deleted */
  AutoModerationRuleDelete: 142,
  /** Message was blocked by Auto Moderation */
  AutoModerationBlockMessage: 143,
  /** Message was flagged by Auto Moderation */
  AutoModerationFlagToChannel: 144,
  /** Member was timed out by Auto Moderation */
  AutoModerationUserCommunicationDisabled: 145,
  /** Member was quarantined by Auto Moderation */
  AutoModerationQuarantineUser: 146,
  /** Creator monetization request was created */
  CreatorMonetizationRequestCreated: 150,
  /** Creator monetization terms were accepted */
  CreatorMonetizationTermsAccepted: 151,
  /** Guild Onboarding Question was created */
  OnboardingPromptCreate: 163,
  /** Guild Onboarding Question was updated */
  OnboardingPromptUpdate: 164,
  /** Guild Onboarding Question was deleted */
  OnboardingPromptDelete: 165,
  /** Guild Onboarding was created */
  OnboardingCreate: 166,
  /** Guild Onboarding was updated */
  OnboardingUpdate: 167,
  /** Guild Server Guide was created */
  HomeSettingsCreate: 190,
  /** Guild Server Guide was updated */
  HomeSettingsUpdate: 191,
  /** A voice channel status was set by a user */
  VoiceChannelStatusCreate: 192,
  /** A voice channel status was deleted by a user */
  VoiceChannelStatusDelete: 193,
} as const;
export type AuditLogEvent = (typeof AuditLogEvent)[keyof typeof AuditLogEvent];

/**
 * Optional Audit Entry Info
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-entry-object-optional-audit-entry-info
 */
export interface RawOptionalAuditEntryInfo {
  /** ID of the app whose permissions were targeted */
  application_id?: Snowflake;
  /** Name of the Auto Moderation rule that was triggered */
  auto_moderation_rule_name?: string;
  /** Trigger type of the Auto Moderation rule that was triggered */
  auto_moderation_rule_trigger_type?: string;
  /** Channel in which the entities were targeted */
  channel_id?: Snowflake;
  /** Number of entities that were targeted */
  count?: string;
  /** Number of days after which inactive members were kicked */
  delete_member_days?: string;
  /** ID of the overwritten entity */
  id?: Snowflake;
  /** Number of members removed by the prune */
  members_removed?: string;
  /** ID of the message that was targeted */
  message_id?: Snowflake;
  /** Name of the role if type is `"0"` (not present if type is `"1"`) */
  role_name?: string;
  /** Type of overwritten entity - role (`"0"`) or member (`"1"`) */
  type?: string;
  /** The type of integration which performed the action */
  integration_type?: string;
  /** The new voice channel status */
  status?: string;
}

/**
 * Audit Log Change Structure
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-change-object-audit-log-change-structure
 */
export interface RawAuditLogChange {
  /** New value of the key */
  new_value?: unknown;
  /** Old value of the key */
  old_value?: unknown;
  /** Name of the changed entity, with a few exceptions */
  key: string;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/audit-log#get-guild-audit-log-query-string-params
 */
export interface GetGuildAuditLogQuery {
  /** Entries from a specific user ID */
  user_id?: Snowflake;
  /** Entries for a specific audit log event */
  action_type?: AuditLogEvent;
  /** Entries with ID less than a specific audit log entry ID */
  before?: Snowflake;
  /** Entries with ID greater than a specific audit log entry ID */
  after?: Snowflake;
  /** Maximum number of entries (between 1-100) to return, defaults to 50 */
  limit?: number;
}
