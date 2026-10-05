import type { Snowflake } from './common.js';

/**
 * Auto Moderation Rule Structure
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-rule-object-auto-moderation-rule-structure
 */
export interface RawAutoModerationRule {
  /** the id of this rule */
  id: Snowflake;
  /** the id of the guild which this rule belongs to */
  guild_id: Snowflake;
  /** the rule name */
  name: string;
  /** the user which first created this rule */
  creator_id: Snowflake;
  /** the rule event type */
  event_type: AutoModerationEventType;
  /** the rule trigger type */
  trigger_type: AutoModerationTriggerType;
  /** the rule trigger metadata */
  trigger_metadata: RawAutoModerationTriggerMetadata;
  /** the actions which will execute when the rule is triggered */
  actions: RawAutoModerationAction[];
  /** whether the rule is enabled */
  enabled: boolean;
  /** the role ids that should not be affected by the rule (Maximum of 20) */
  exempt_roles: Snowflake[];
  /** the channel ids that should not be affected by the rule (Maximum of 50) */
  exempt_channels: Snowflake[];
}

/**
 * Trigger Types
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-rule-object-trigger-types
 */
export const AutoModerationTriggerType = {
  /** check if content contains words from a user defined list of keywords */
  Keyword: 1,
  /** check if content represents generic spam */
  Spam: 3,
  /** check if content contains words from internal pre-defined wordsets */
  KeywordPreset: 4,
  /** check if content contains more unique mentions than allowed */
  MentionSpam: 5,
  /** check if member profile contains words from a user defined list of keywords */
  MemberProfile: 6,
} as const;
export type AutoModerationTriggerType =
  (typeof AutoModerationTriggerType)[keyof typeof AutoModerationTriggerType];

/**
 * Trigger Metadata
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-rule-object-trigger-metadata
 */
export interface RawAutoModerationTriggerMetadata {
  /** substrings which will be searched for in content (Maximum of 1000) */
  keyword_filter?: string[];
  /** regular expression patterns which will be matched against content (Maximum of 10) */
  regex_patterns?: string[];
  /** the internally pre-defined wordsets which will be searched for in content */
  presets?: AutoModerationKeywordPresetType[];
  /** substrings which should not trigger the rule (Maximum of 100 or 1000) */
  allow_list?: string[];
  /** total number of unique role and user mentions allowed per message (Maximum of 50) */
  mention_total_limit?: number;
  /** whether to automatically detect mention raids */
  mention_raid_protection_enabled?: boolean;
}

/**
 * Keyword Preset Types
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-rule-object-keyword-preset-types
 */
export const AutoModerationKeywordPresetType = {
  /** words that may be considered forms of swearing or cursing */
  Profanity: 1,
  /** words that refer to sexually explicit behavior or activity */
  SexualContent: 2,
  /** personal insults or words that may be considered hate speech */
  Slurs: 3,
} as const;
export type AutoModerationKeywordPresetType =
  (typeof AutoModerationKeywordPresetType)[keyof typeof AutoModerationKeywordPresetType];

/**
 * Event Types
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-rule-object-event-types
 */
export const AutoModerationEventType = {
  /** when a member sends or edits a message in the guild */
  MessageSend: 1,
  /** when a member edits their profile */
  MemberUpdate: 2,
} as const;
export type AutoModerationEventType =
  (typeof AutoModerationEventType)[keyof typeof AutoModerationEventType];

/**
 * Auto Moderation Action Structure
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-action-object-auto-moderation-action-structure
 */
export interface RawAutoModerationAction {
  /** the type of action */
  type: AutoModerationActionType;
  /** additional metadata needed during execution for this specific action type */
  metadata?: RawAutoModerationActionMetadata;
}

/**
 * Action Types
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-action-object-action-types
 */
export const AutoModerationActionType = {
  /** blocks a member's message and prevents it from being posted. A custom explanation can be specified and shown to members whenever their message is blocked. */
  BlockMessage: 1,
  /** logs user content to a specified channel */
  SendAlertMessage: 2,
  /** timeout user for a specified duration * */
  Timeout: 3,
  /** prevents a member from using text, voice, or other interactions */
  BlockMemberInteraction: 4,
} as const;
export type AutoModerationActionType =
  (typeof AutoModerationActionType)[keyof typeof AutoModerationActionType];

/**
 * Action Metadata
 * @see https://docs.discord.com/developers/resources/auto-moderation#auto-moderation-action-object-action-metadata
 */
export interface RawAutoModerationActionMetadata {
  /** channel to which user content should be logged */
  channel_id?: Snowflake;
  /** timeout duration in seconds */
  duration_seconds?: number;
  /** additional explanation that will be shown to members whenever their message is blocked */
  custom_message?: string | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/auto-moderation#create-auto-moderation-rule-json-params
 */
export interface CreateAutoModerationRuleJSONParams {
  /** the rule name */
  name: string;
  /** the event type */
  event_type: AutoModerationEventType;
  /** the trigger type */
  trigger_type: AutoModerationTriggerType;
  /** the trigger metadata */
  trigger_metadata?: RawAutoModerationTriggerMetadata;
  /** the actions which will execute when the rule is triggered */
  actions: RawAutoModerationAction[];
  /** whether the rule is enabled (False by default) */
  enabled?: boolean;
  /** the role ids that should not be affected by the rule (Maximum of 20) */
  exempt_roles?: Snowflake[];
  /** the channel ids that should not be affected by the rule (Maximum of 50) */
  exempt_channels?: Snowflake[];
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/auto-moderation#modify-auto-moderation-rule-json-params
 */
export interface ModifyAutoModerationRuleJSONParams {
  /** the rule name */
  name?: string;
  /** the event type */
  event_type?: AutoModerationEventType;
  /** the trigger metadata */
  trigger_metadata?: RawAutoModerationTriggerMetadata;
  /** the actions which will execute when the rule is triggered */
  actions?: RawAutoModerationAction[];
  /** whether the rule is enabled */
  enabled?: boolean;
  /** the role ids that should not be affected by the rule (Maximum of 20) */
  exempt_roles?: Snowflake[];
  /** the channel ids that should not be affected by the rule (Maximum of 50) */
  exempt_channels?: Snowflake[];
}
