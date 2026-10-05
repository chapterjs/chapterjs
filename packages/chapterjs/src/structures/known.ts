// What a structure was created with. A property like `member.guild` or
// `message.channel` reads the cache, so it would turn to nothing the moment
// the cache forgets (the bot is removed from the server, the member leaves,
// the session starts over) while code still holds the structure. What the
// structure came with is kept, so that what was there stays there: the
// cache first, then this.
//
// It costs one reference per structure and no allocation for what belongs
// to a server (members, roles, channels: there can be millions), which keep
// their server itself. Only what comes with more (a message, an interaction:
// few, and short-lived) keeps a small object.

import type { Snowflake } from '../discord/types/common.js';
import { ctxOf, originOf, setOrigin, Structure } from './base.js';
import type { Channel } from './channel.js';
import type { Guild } from './guild.js';
import type { GuildMember } from './member.js';

interface Known {
  guild?: Guild | undefined;
  member?: GuildMember | undefined;
  channel?: Channel | undefined;
}

/** A server kept as such is a structure; anything else is a `Known`. */
const isGuild = (origin: object): origin is Guild =>
  origin instanceof Structure;

/** The server a structure came with. */
export function knownGuild(structure: Structure<object>): Guild | undefined {
  const origin = originOf(structure);
  if (!origin) return undefined;
  return isGuild(origin) ? origin : (origin as Known).guild;
}

/** The member a structure came with (the author, who used a command). */
export function knownMember(
  structure: Structure<object>
): GuildMember | undefined {
  const origin = originOf(structure);
  return origin && !isGuild(origin) ? (origin as Known).member : undefined;
}

/** The channel a structure came with. */
export function knownChannel(
  structure: Structure<object>
): Channel | undefined {
  const origin = originOf(structure);
  return origin && !isGuild(origin) ? (origin as Known).channel : undefined;
}

/** Keeps what a structure comes with; what is not given is left as it was. */
export function remember(structure: Structure<object>, seen: Known): void {
  const guild = seen.guild ?? knownGuild(structure);
  const member = seen.member ?? knownMember(structure);
  const channel = seen.channel ?? knownChannel(structure);
  // Only a server: the server itself, nothing allocated.
  setOrigin(structure, member || channel ? { guild, member, channel } : guild);
}

/** The server of something that may have one. */
export function findGuild(
  structure: Structure<object>,
  guildId: Snowflake | null | undefined
): Guild | null {
  if (!guildId) return null;
  return (
    ctxOf(structure).cache.guilds.get(guildId) ?? knownGuild(structure) ?? null
  );
}

/**
 * The server of something that belongs to one (a member, a role, a channel
 * of a server): it is always there. Such a thing only reaches user code
 * from a server the bot is in; anything else is refused loudly rather than
 * answered with a `null` nobody expects.
 */
export function guildOf(
  structure: Structure<object>,
  guildId: Snowflake
): Guild {
  const guild = findGuild(structure, guildId);
  if (!guild) {
    throw new Error(
      `The server ${guildId} is not one the bot is in, so what belongs to it can't be read.`
    );
  }
  return guild;
}
