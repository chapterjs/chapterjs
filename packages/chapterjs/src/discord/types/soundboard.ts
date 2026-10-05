import type { ImageData, Snowflake } from './common.js';
import type { RawUser } from './user.js';

/**
 * Soundboard Sound Structure
 * @see https://docs.discord.com/developers/resources/soundboard#soundboard-sound-object-soundboard-sound-structure
 */
export interface RawSoundboardSound {
  /** the name of this sound */
  name: string;
  /** the id of this sound */
  sound_id: Snowflake;
  /** the volume of this sound, from 0 to 1 */
  volume: number;
  /** the id of this sound's custom emoji */
  emoji_id: Snowflake | null;
  /** the unicode character of this sound's standard emoji */
  emoji_name: string | null;
  /** the id of the guild this sound is in */
  guild_id?: Snowflake;
  /** whether this sound can be used, may be false due to loss of Server Boosts */
  available: boolean;
  /** the user who created this sound */
  user?: RawUser;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/soundboard#send-soundboard-sound-json-params
 */
export interface SendSoundboardSoundJSONParams {
  /** the id of the soundboard sound to play */
  sound_id: Snowflake;
  /** the id of the guild the soundboard sound is from, required to play sounds from different servers */
  source_guild_id?: Snowflake;
}

/**
 * Response Structure
 * @see https://docs.discord.com/developers/resources/soundboard#list-guild-soundboard-sounds-response-structure
 */
export interface ListGuildSoundboardSoundsResponse {
  items: RawSoundboardSound[];
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/soundboard#create-guild-soundboard-sound-json-params
 */
export interface CreateGuildSoundboardSoundJSONParams {
  /** name of the soundboard sound (2-32 characters) */
  name: string;
  /** the mp3 or ogg sound data, base64 encoded, similar to image data */
  sound: ImageData;
  /** the volume of the soundboard sound, from 0 to 1, defaults to 1 */
  volume?: number | null;
  /** the id of the custom emoji for the soundboard sound */
  emoji_id?: Snowflake | null;
  /** the unicode character of a standard emoji for the soundboard sound */
  emoji_name?: string | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/soundboard#modify-guild-soundboard-sound-json-params
 */
export interface ModifyGuildSoundboardSoundJSONParams {
  /** name of the soundboard sound (2-32 characters) */
  name?: string;
  /** the volume of the soundboard sound, from 0 to 1 */
  volume?: number | null;
  /** the id of the custom emoji for the soundboard sound */
  emoji_id?: Snowflake | null;
  /** the unicode character of a standard emoji for the soundboard sound */
  emoji_name?: string | null;
}
