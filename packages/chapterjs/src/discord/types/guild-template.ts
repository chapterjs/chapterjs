import type { ISO8601Timestamp, Snowflake } from './common.js';
import type { RawGuild } from './guild.js';
import type { RawUser } from './user.js';

/**
 * Guild Template Structure
 * @see https://docs.discord.com/developers/resources/guild-template#guild-template-object-guild-template-structure
 */
export interface RawGuildTemplate {
  /** the template code (unique ID) */
  code: string;
  /** template name */
  name: string;
  /** the description for the template */
  description: string | null;
  /** number of times this template has been used */
  usage_count: number;
  /** the ID of the user who created the template */
  creator_id: Snowflake;
  /** the user who created the template */
  creator: RawUser;
  /** when this template was created */
  created_at: ISO8601Timestamp;
  /** when this template was last synced to the source guild */
  updated_at: ISO8601Timestamp;
  /** the ID of the guild this template is based on */
  source_guild_id: Snowflake;
  /** the guild snapshot this template contains; placeholder IDs are given as integers */
  serialized_source_guild: Partial<RawGuild>;
  /** whether the template has unsynced changes */
  is_dirty: boolean | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild-template#create-guild-template-json-params
 */
export interface CreateGuildTemplateJSONParams {
  /** name of the template (1-100 characters) */
  name: string;
  /** description for the template (0-120 characters) */
  description?: string | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/guild-template#modify-guild-template-json-params
 */
export interface ModifyGuildTemplateJSONParams {
  /** name of the template (1-100 characters) */
  name?: string;
  /** description for the template (0-120 characters) */
  description?: string | null;
}
