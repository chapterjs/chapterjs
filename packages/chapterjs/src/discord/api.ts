// Constants of the Discord API that never depend on a bot.

/**
 * The API and gateway version the framework speaks.
 * @see https://docs.discord.com/developers/reference#api-versioning
 */
export const API_VERSION = 10;

/** @see https://docs.discord.com/developers/reference#api-reference */
export const API_BASE_URL = 'https://discord.com/api';

/** @see https://docs.discord.com/developers/reference#image-formatting */
export const CDN_BASE_URL = 'https://cdn.discordapp.com';

/**
 * Sticker GIFs are not served by the CDN base URL.
 * @see https://docs.discord.com/developers/reference#image-formatting
 */
export const MEDIA_BASE_URL = 'https://media.discordapp.net';

/**
 * Milliseconds since the first second of 2015: where snowflake time starts.
 * @see https://docs.discord.com/developers/reference#snowflakes
 */
export const DISCORD_EPOCH = 1_420_070_400_000n;

/**
 * How many requests per second a bot can make in total.
 * @see https://docs.discord.com/developers/topics/rate-limits#global-rate-limit
 */
export const GLOBAL_REQUESTS_PER_SECOND = 50;

/**
 * The longest reason an audit log entry accepts, in characters.
 * @see https://docs.discord.com/developers/resources/audit-log#audit-log-entry-object
 */
export const AUDIT_LOG_REASON_MAX_LENGTH = 512;

/**
 * The value of the `User-Agent` header Discord requires.
 * @see https://docs.discord.com/developers/reference#user-agent
 */
export function userAgent(version: string): string {
  return `DiscordBot (https://github.com/chapterjs/chapterjs, ${version})`;
}

/**
 * Limits Discord enforces on what a bot sends: checked before sending, so
 * the developer gets a clear message instead of an "Invalid Form Body".
 */
export const Limits = {
  /** @see https://docs.discord.com/developers/resources/message#create-message */
  MessageContent: 2000,
  MessageEmbeds: 10,
  MessageStickers: 3,
  /** @see https://docs.discord.com/developers/reference#uploading-files */
  MessageAttachments: 10,
  /** @see https://docs.discord.com/developers/resources/message#embed-object-embed-limits */
  EmbedTitle: 256,
  EmbedDescription: 4096,
  EmbedFields: 25,
  EmbedFieldName: 256,
  EmbedFieldValue: 1024,
  EmbedFooterText: 2048,
  EmbedAuthorName: 256,
  /** The characters of every embed of a message, added up. */
  EmbedTotal: 6000,
  /** @see https://docs.discord.com/developers/resources/message#bulk-delete-messages */
  BulkDeleteMin: 2,
  BulkDeleteMax: 100,
  /** Bulk delete refuses messages older than two weeks, in milliseconds. */
  BulkDeleteMaxAge: 14 * 24 * 60 * 60 * 1000,
  /** @see https://docs.discord.com/developers/resources/guild#list-guild-members */
  ListGuildMembers: 1000,
  /** @see https://docs.discord.com/developers/resources/message#get-channel-messages */
  GetChannelMessages: 100,
  /** @see https://docs.discord.com/developers/resources/guild#bulk-guild-ban */
  BulkBanUsers: 200,
  /** Seconds of messages a ban can delete: 7 days. */
  BanDeleteMessageSeconds: 604_800,
  /** @see https://docs.discord.com/developers/resources/user#usernames-and-nicknames */
  Nickname: 32,
  /** A timeout can't end more than 28 days from now, in milliseconds. */
  TimeoutMaxDuration: 28 * 24 * 60 * 60 * 1000,
} as const;
