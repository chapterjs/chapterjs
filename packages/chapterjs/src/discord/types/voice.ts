import type { ISO8601Timestamp, Snowflake } from './common.js';
import type { RawGuildMember } from './guild.js';

/**
 * Voice State Structure
 * @see https://docs.discord.com/developers/resources/voice#voice-state-object-voice-state-structure
 */
export interface RawVoiceState {
  /** the guild id this voice state is for */
  guild_id?: Snowflake;
  /** the channel id this user is connected to */
  channel_id: Snowflake | null;
  /** the user id this voice state is for */
  user_id: Snowflake;
  /** the guild member this voice state is for */
  member?: RawGuildMember;
  /** the session id for this voice state */
  session_id: string;
  /** whether this user is deafened by the server */
  deaf: boolean;
  /** whether this user is muted by the server */
  mute: boolean;
  /** whether this user is locally deafened */
  self_deaf: boolean;
  /** whether this user is locally muted */
  self_mute: boolean;
  /** whether this user is streaming using "Go Live" */
  self_stream?: boolean;
  /** whether this user's camera is enabled */
  self_video: boolean;
  /** whether this user's permission to speak is denied */
  suppress: boolean;
  /** the time at which the user requested to speak */
  request_to_speak_timestamp: ISO8601Timestamp | null;
}

/**
 * Voice Region Structure
 * @see https://docs.discord.com/developers/resources/voice#voice-region-object-voice-region-structure
 */
export interface RawVoiceRegion {
  /** unique ID for the region */
  id: string;
  /** name of the region */
  name: string;
  /** true for a single server that is closest to the current user's client */
  optimal: boolean;
  /** whether this is a deprecated voice region (avoid switching to these) */
  deprecated: boolean;
  /** whether this is a custom voice region (used for events/etc) */
  custom: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/voice#modify-current-user-voice-state-json-params
 */
export interface ModifyCurrentUserVoiceStateJSONParams {
  /** the id of the channel the user is currently in */
  channel_id?: Snowflake;
  /** toggles the user's suppress state */
  suppress?: boolean;
  /** sets the user's request to speak */
  request_to_speak_timestamp?: ISO8601Timestamp | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/voice#modify-user-voice-state-json-params
 */
export interface ModifyUserVoiceStateJSONParams {
  /** the id of the channel the user is currently in */
  channel_id?: Snowflake;
  /** toggles the user's suppress state */
  suppress?: boolean;
}
