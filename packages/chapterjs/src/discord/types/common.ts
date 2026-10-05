/**
 * A Discord id: a 64-bit number serialized as a string.
 * @see https://docs.discord.com/developers/reference#snowflakes
 */
export type Snowflake = string;

/**
 * A date and time as Discord serializes it.
 * @see https://docs.discord.com/developers/reference#iso8601-date/time
 */
export type ISO8601Timestamp = string;

/**
 * An image sent to Discord: a data URI (`data:image/png;base64,...`).
 * @see https://docs.discord.com/developers/reference#image-data
 */
export type ImageData = string;

/**
 * Locales
 * @see https://docs.discord.com/developers/reference#locales
 */
export const Locale = {
  Indonesian: 'id',
  Danish: 'da',
  German: 'de',
  EnglishUK: 'en-GB',
  EnglishUS: 'en-US',
  Spanish: 'es-ES',
  SpanishLATAM: 'es-419',
  French: 'fr',
  Croatian: 'hr',
  Italian: 'it',
  Lithuanian: 'lt',
  Hungarian: 'hu',
  Dutch: 'nl',
  Norwegian: 'no',
  Polish: 'pl',
  PortugueseBrazilian: 'pt-BR',
  Romanian: 'ro',
  Finnish: 'fi',
  Swedish: 'sv-SE',
  Vietnamese: 'vi',
  Turkish: 'tr',
  Czech: 'cs',
  Greek: 'el',
  Bulgarian: 'bg',
  Russian: 'ru',
  Ukrainian: 'uk',
  Hindi: 'hi',
  Thai: 'th',
  ChineseChina: 'zh-CN',
  Japanese: 'ja',
  ChineseTaiwan: 'zh-TW',
  Korean: 'ko',
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
