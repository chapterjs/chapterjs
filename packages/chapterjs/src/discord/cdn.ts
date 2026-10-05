// Image URLs, built from the ids and hashes Discord sends.
// https://docs.discord.com/developers/reference#image-formatting

import { CDN_BASE_URL, MEDIA_BASE_URL } from './api.js';
import type { Snowflake } from './types/common.js';
import { StickerFormatType } from './types/sticker.js';

/** @see https://docs.discord.com/developers/reference#image-formatting-image-formats */
export type ImageFormat = 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif';

/** Image size can be any power of two between 16 and 4096. */
export type ImageSize = 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096;

export interface ImageOptions {
  /**
   * The file format. By default: WebP, which Discord recommends since it
   * works for still and animated images, whatever was uploaded.
   */
  format?: ImageFormat;
  /** The size in pixels: a power of two between 16 and 4096. */
  size?: ImageSize;
  /**
   * `false` to get the first frame of an animated image. By default an
   * animated image stays animated.
   */
  animated?: boolean;
}

const FORMATS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
]);

function isSize(size: unknown): size is ImageSize {
  return (
    typeof size === 'number' &&
    Number.isInteger(size) &&
    size >= 16 &&
    size <= 4096 &&
    (size & (size - 1)) === 0
  );
}

/**
 * Builds the URL of an image. In the case of endpoints that support GIFs,
 * the hash begins with `a_` when the image is animated: those are requested
 * as animated WebP with `?animated=true`.
 */
function image(
  path: string,
  hash: string | null,
  { format = 'webp', size, animated = true }: ImageOptions = {},
  supportsGif = true
): string {
  if (!FORMATS.has(format)) {
    throw new RangeError(
      `"${format}" is not an image format. Use png, jpg, webp or gif.`
    );
  }
  if (size !== undefined && !isSize(size)) {
    throw new RangeError(
      `${size} is not an image size. Use a power of two between 16 and 4096 (64, 128, 256...).`
    );
  }
  const isAnimated = supportsGif && hash !== null && hash.startsWith('a_');
  if (format === 'gif' && !isAnimated) format = 'png';
  const query = new URLSearchParams();
  if (size !== undefined) query.set('size', String(size));
  if (isAnimated && animated && format === 'webp')
    query.set('animated', 'true');
  const search = query.size > 0 ? `?${query}` : '';
  return `${CDN_BASE_URL}/${path}.${format}${search}`;
}

/** @see https://docs.discord.com/developers/reference#image-formatting-cdn-endpoints */
export const cdn = {
  /** Custom Emoji */
  emoji: (emojiId: Snowflake, animated: boolean, options?: ImageOptions) =>
    image(`emojis/${emojiId}`, animated ? 'a_' : '', options),
  /** Guild Icon */
  guildIcon: (guildId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`icons/${guildId}/${hash}`, hash, options),
  /** Guild Splash */
  guildSplash: (guildId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`splashes/${guildId}/${hash}`, hash, options, false),
  /** Guild Discovery Splash */
  guildDiscoverySplash: (
    guildId: Snowflake,
    hash: string,
    options?: ImageOptions
  ) => image(`discovery-splashes/${guildId}/${hash}`, hash, options, false),
  /** Guild Banner */
  guildBanner: (guildId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`banners/${guildId}/${hash}`, hash, options),
  /** User Banner */
  userBanner: (userId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`banners/${userId}/${hash}`, hash, options),
  /**
   * Default User Avatar: always a PNG of a fixed size. The index is
   * `(user_id >> 22) % 6` for users on the new username system and
   * `discriminator % 5` for the others.
   */
  defaultUserAvatar: (userId: Snowflake, discriminator: string): string => {
    const legacy = discriminator !== '0' && discriminator !== '';
    const index = legacy
      ? Number(discriminator) % 5
      : Number((BigInt(userId) >> 22n) % 6n);
    return `${CDN_BASE_URL}/embed/avatars/${index}.png`;
  },
  /** User Avatar */
  userAvatar: (userId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`avatars/${userId}/${hash}`, hash, options),
  /** Guild Member Avatar */
  memberAvatar: (
    guildId: Snowflake,
    userId: Snowflake,
    hash: string,
    options?: ImageOptions
  ) =>
    image(`guilds/${guildId}/users/${userId}/avatars/${hash}`, hash, options),
  /** Guild Member Banner */
  memberBanner: (
    guildId: Snowflake,
    userId: Snowflake,
    hash: string,
    options?: ImageOptions
  ) =>
    image(`guilds/${guildId}/users/${userId}/banners/${hash}`, hash, options),
  /** Avatar Decoration: always a PNG. */
  avatarDecoration: (asset: string): string =>
    `${CDN_BASE_URL}/avatar-decoration-presets/${asset}.png`,
  /** Application Icon */
  applicationIcon: (
    applicationId: Snowflake,
    hash: string,
    options?: ImageOptions
  ) => image(`app-icons/${applicationId}/${hash}`, hash, options, false),
  /** Application Cover */
  applicationCover: (
    applicationId: Snowflake,
    hash: string,
    options?: ImageOptions
  ) => image(`app-icons/${applicationId}/${hash}`, hash, options, false),
  /** Team Icon */
  teamIcon: (teamId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`team-icons/${teamId}/${hash}`, hash, options, false),
  /**
   * Sticker: a PNG if its format is PNG or APNG, a Lottie file (`.json`) if
   * it is LOTTIE, and a GIF served by another host if it is GIF. The size
   * is fixed.
   */
  sticker: (stickerId: Snowflake, format: StickerFormatType): string => {
    if (format === StickerFormatType.Gif) {
      return `${MEDIA_BASE_URL}/stickers/${stickerId}.gif`;
    }
    const extension = format === StickerFormatType.Lottie ? 'json' : 'png';
    return `${CDN_BASE_URL}/stickers/${stickerId}.${extension}`;
  },
  /** Role Icon */
  roleIcon: (roleId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`role-icons/${roleId}/${hash}`, hash, options, false),
  /** Guild Scheduled Event Cover */
  scheduledEventCover: (
    eventId: Snowflake,
    hash: string,
    options?: ImageOptions
  ) => image(`guild-events/${eventId}/${hash}`, hash, options, false),
  /** Guild Tag Badge */
  guildTagBadge: (guildId: Snowflake, hash: string, options?: ImageOptions) =>
    image(`guild-tag-badges/${guildId}/${hash}`, hash, options, false),
} as const;
