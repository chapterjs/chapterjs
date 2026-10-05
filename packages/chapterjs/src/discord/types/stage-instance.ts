import type { Snowflake } from './common.js';

/**
 * Stage Instance Structure
 * @see https://docs.discord.com/developers/resources/stage-instance#stage-instance-object-stage-instance-structure
 */
export interface RawStageInstance {
  /** The id of this Stage instance */
  id: Snowflake;
  /** The guild id of the associated Stage channel */
  guild_id: Snowflake;
  /** The id of the associated Stage channel */
  channel_id: Snowflake;
  /** The topic of the Stage instance (1-120 characters) */
  topic: string;
  /** The privacy level of the Stage instance */
  privacy_level: StageInstancePrivacyLevel;
  /** Whether or not Stage Discovery is disabled (deprecated) */
  discoverable_disabled: boolean;
  /** The id of the scheduled event for this Stage instance */
  guild_scheduled_event_id: Snowflake | null;
}

/**
 * Privacy Level
 * @see https://docs.discord.com/developers/resources/stage-instance#stage-instance-object-privacy-level
 */
export const StageInstancePrivacyLevel = {
  /** The Stage instance is visible publicly. (deprecated) */
  Public: 1,
  /** The Stage instance is visible to only guild members. */
  GuildOnly: 2,
} as const;
export type StageInstancePrivacyLevel =
  (typeof StageInstancePrivacyLevel)[keyof typeof StageInstancePrivacyLevel];

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/stage-instance#create-stage-instance-json-params
 */
export interface CreateStageInstanceJSONParams {
  /** The id of the Stage channel */
  channel_id: Snowflake;
  /** The topic of the Stage instance (1-120 characters) */
  topic: string;
  /** The privacy level of the Stage instance (default GUILD_ONLY) */
  privacy_level?: StageInstancePrivacyLevel;
  /** Notify @everyone that a Stage instance has started */
  send_start_notification?: boolean;
  /** The guild scheduled event associated with this Stage instance */
  guild_scheduled_event_id?: Snowflake;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/stage-instance#modify-stage-instance-json-params
 */
export interface ModifyStageInstanceJSONParams {
  /** The topic of the Stage instance (1-120 characters) */
  topic?: string;
  /** The privacy level of the Stage instance */
  privacy_level?: StageInstancePrivacyLevel;
}
