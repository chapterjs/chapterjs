import type { ImageData, Snowflake } from './common.js';
import type { RawUser } from './user.js';

/**
 * Emoji Structure
 * @see https://docs.discord.com/developers/resources/emoji#emoji-object-emoji-structure
 */
export interface RawEmoji {
  /** emoji id */
  id: Snowflake | null;
  /** emoji name */
  name: string | null;
  /** roles allowed to use this emoji */
  roles?: Snowflake[];
  /** user that created this emoji */
  user?: RawUser;
  /** whether this emoji must be wrapped in colons */
  require_colons?: boolean;
  /** whether this emoji is managed */
  managed?: boolean;
  /** whether this emoji is animated */
  animated?: boolean;
  /** whether this emoji can be used, may be false due to loss of Server Boosts */
  available?: boolean;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/emoji#create-guild-emoji-json-params
 */
export interface CreateGuildEmojiJSONParams {
  /** name of the emoji */
  name: string;
  /** the 128x128 emoji image */
  image: ImageData;
  /** roles allowed to use this emoji */
  roles: Snowflake[];
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/emoji#modify-guild-emoji-json-params
 */
export interface ModifyGuildEmojiJSONParams {
  /** name of the emoji */
  name?: string;
  /** roles allowed to use this emoji */
  roles?: Snowflake[] | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/emoji#create-application-emoji-json-params
 */
export interface CreateApplicationEmojiJSONParams {
  /** name of the emoji */
  name: string;
  /** the 128x128 emoji image */
  image: ImageData;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/emoji#modify-application-emoji-json-params
 */
export interface ModifyApplicationEmojiJSONParams {
  /** name of the emoji */
  name?: string;
}

/**
 * An emoji reduced to what identifies it: `id` is null for a standard
 * (unicode) emoji, whose `name` is then the emoji itself.
 * @see https://docs.discord.com/developers/resources/emoji#emoji-object
 */
export interface RawPartialEmoji {
  id: Snowflake | null;
  name: string | null;
  animated?: boolean;
}
