// The text formats Discord turns into mentions, emojis and dates.
// https://docs.discord.com/developers/reference#message-formatting

import type { Snowflake } from './types/common.js';

/** `<@USER_ID>`: mentions a user. */
export function userMention(userId: Snowflake): `<@${string}>` {
  return `<@${userId}>`;
}

/** `<#CHANNEL_ID>`: links a channel. */
export function channelMention(channelId: Snowflake): `<#${string}>` {
  return `<#${channelId}>`;
}

/** `<@&ROLE_ID>`: mentions a role. */
export function roleMention(roleId: Snowflake): `<@&${string}>` {
  return `<@&${roleId}>`;
}

/**
 * `</NAME:COMMAND_ID>`: a clickable slash command. The name includes the
 * subcommand group and subcommand when there are some (`"foo group bar"`).
 */
export function commandMention(
  name: string,
  commandId: Snowflake
): `</${string}:${string}>` {
  return `</${name}:${commandId}>`;
}

/** `<:NAME:ID>` or `<a:NAME:ID>`: a custom emoji. */
export function emojiMention(
  name: string,
  emojiId: Snowflake,
  animated = false
): string {
  return `<${animated ? 'a' : ''}:${name}:${emojiId}>`;
}

/**
 * Timestamp Styles
 * @see https://docs.discord.com/developers/reference#message-formatting-timestamp-styles
 */
export const TimestampStyle = {
  /** 16:20 */
  ShortTime: 't',
  /** 16:20:30 */
  MediumTime: 'T',
  /** 20/04/2021 */
  ShortDate: 'd',
  /** April 20, 2021 */
  LongDate: 'D',
  /** April 20, 2021 at 16:20 (default) */
  LongDateShortTime: 'f',
  /** Tuesday, April 20, 2021 at 16:20 */
  FullDateShortTime: 'F',
  /** 20/04/2021, 16:20 */
  ShortDateShortTime: 's',
  /** 20/04/2021, 16:20:30 */
  ShortDateMediumTime: 'S',
  /** 4 years ago */
  Relative: 'R',
} as const;
export type TimestampStyle =
  (typeof TimestampStyle)[keyof typeof TimestampStyle];

/**
 * `<t:TIMESTAMP>` or `<t:TIMESTAMP:STYLE>`: a date shown to each reader in
 * their own timezone and language. Timestamps are expressed in seconds.
 */
export function timestamp(date: Date | number, style?: TimestampStyle): string {
  const ms = Number(date);
  if (!Number.isFinite(ms)) {
    throw new TypeError('timestamp() needs a valid date.');
  }
  const seconds = Math.floor(ms / 1000);
  return style ? `<t:${seconds}:${style}>` : `<t:${seconds}>`;
}

/**
 * Guild Navigation Types: links to a tab of the current server.
 * @see https://docs.discord.com/developers/reference#message-formatting-guild-navigation-types
 */
export const GuildNavigation = {
  /** Channel & Roles tab with Onboarding prompts */
  Customize: '<id:customize>',
  /** Browse Channels tab */
  Browse: '<id:browse>',
  /** Server Guide tab */
  Guide: '<id:guide>',
  /** Linked Roles tab */
  LinkedRoles: '<id:linked-roles>',
} as const;

/**
 * The emoji of a reaction as REST paths expect it: the emoji itself for a
 * standard one, `name:id` for a custom one.
 * @see https://docs.discord.com/developers/resources/message#create-reaction
 */
export function reactionEmoji(emoji: {
  id?: Snowflake | null;
  name?: string | null;
}): string {
  if (emoji.id) return `${emoji.name ?? '_'}:${emoji.id}`;
  if (!emoji.name) throw new TypeError('An emoji needs a name or an id.');
  return emoji.name;
}
