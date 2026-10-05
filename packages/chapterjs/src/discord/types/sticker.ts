import type { Snowflake } from './common.js';
import type { RawUser } from './user.js';

/**
 * Sticker Structure
 * @see https://docs.discord.com/developers/resources/sticker#sticker-object-sticker-structure
 */
export interface RawSticker {
  /** id of the sticker */
  id: Snowflake;
  /** for standard stickers, id of the pack the sticker is from */
  pack_id?: Snowflake;
  /** name of the sticker */
  name: string;
  /** description of the sticker */
  description: string | null;
  /** autocomplete/suggestion tags for the sticker (max 200 characters) */
  tags: string;
  /** type of sticker */
  type: StickerType;
  /** type of sticker format */
  format_type: StickerFormatType;
  /** whether this guild sticker can be used, may be false due to loss of Server Boosts */
  available?: boolean;
  /** id of the guild that owns this sticker */
  guild_id?: Snowflake;
  /** the user that uploaded the guild sticker */
  user?: RawUser;
  /** the standard sticker's sort order within its pack */
  sort_value?: number;
}

/**
 * Sticker Types
 * @see https://docs.discord.com/developers/resources/sticker#sticker-object-sticker-types
 */
export const StickerType = {
  /** an official sticker in a pack */
  Standard: 1,
  /** a sticker uploaded to a guild for the guild's members */
  Guild: 2,
} as const;
export type StickerType = (typeof StickerType)[keyof typeof StickerType];

/**
 * Sticker Format Types
 * @see https://docs.discord.com/developers/resources/sticker#sticker-object-sticker-format-types
 */
export const StickerFormatType = {
  Png: 1,
  Apng: 2,
  Lottie: 3,
  Gif: 4,
} as const;
export type StickerFormatType =
  (typeof StickerFormatType)[keyof typeof StickerFormatType];

/**
 * Sticker Item Structure
 * @see https://docs.discord.com/developers/resources/sticker#sticker-item-object-sticker-item-structure
 */
export interface RawStickerItem {
  /** id of the sticker */
  id: Snowflake;
  /** name of the sticker */
  name: string;
  /** type of sticker format */
  format_type: StickerFormatType;
}

/**
 * Sticker Pack Structure
 * @see https://docs.discord.com/developers/resources/sticker#sticker-pack-object-sticker-pack-structure
 */
export interface RawStickerPack {
  /** id of the sticker pack */
  id: Snowflake;
  /** the stickers in the pack */
  stickers: RawSticker[];
  /** name of the sticker pack */
  name: string;
  /** id of the pack's SKU */
  sku_id: Snowflake;
  /** id of a sticker in the pack which is shown as the pack's icon */
  cover_sticker_id?: Snowflake;
  /** description of the sticker pack */
  description: string;
  /** id of the sticker pack's banner image */
  banner_asset_id?: Snowflake;
}

/**
 * Response Structure
 * @see https://docs.discord.com/developers/resources/sticker#list-sticker-packs-response-structure
 */
export interface ListStickerPacksResponse {
  sticker_packs: RawStickerPack[];
}

/**
 * Form Params
 * @see https://docs.discord.com/developers/resources/sticker#create-guild-sticker-form-params
 */
export interface CreateGuildStickerJSONParams {
  /** name of the sticker (2-30 characters) */
  name: string;
  /** description of the sticker (empty or 2-100 characters) */
  description: string;
  /** autocomplete/suggestion tags for the sticker (max 200 characters) */
  tags: string;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/sticker#modify-guild-sticker-json-params
 */
export interface ModifyGuildStickerJSONParams {
  /** name of the sticker (2-30 characters) */
  name?: string;
  /** description of the sticker (2-100 characters) */
  description?: string | null;
  /** autocomplete/suggestion tags for the sticker (max 200 characters) */
  tags?: string;
}
