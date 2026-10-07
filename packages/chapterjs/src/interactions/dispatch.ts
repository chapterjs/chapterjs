// What every interaction shares, whatever runs for it (a command, a
// button, a menu, a form): who did it and where, whether it is allowed
// there, and how its function is run so that the person always gets an
// answer and the developer always gets the error. Written once here;
// `commands/router.ts` and `components/router.ts` add what is theirs.

import { setTimeout as sleep } from 'node:timers/promises';
import type { RawChannel } from '../discord/types/channel.js';
import type { RawGuildMember } from '../discord/types/guild.js';
import type { RawInteraction } from '../discord/types/interaction.js';
import type { RawUser } from '../discord/types/user.js';
import { phrase, type FrameworkKey, type What } from '../messages/phrases.js';
import { DiscordApiError } from '../rest/errors.js';
import { ctxOf } from '../structures/base.js';
import type { TextBasedChannel } from '../structures/channel.js';
import type { Context } from '../structures/context.js';
import type { Guild } from '../structures/guild.js';
import { isUpdating, type Interaction } from '../structures/interaction.js';
import type { GuildMember } from '../structures/member.js';
import type { User } from '../structures/user.js';

/** Where something can be used: the same word for commands and components. */
export type Where = 'guild' | 'dm' | 'both';

/** What the developer is told. */
export interface Reporter {
  /** A `run` threw: reported with the file it comes from. */
  onError: (file: string, error: unknown) => void;
  /** Something the developer should know, that is not an error of theirs. */
  onWarning: (file: string, message: string) => void;
  /**
   * After how long without an answer the framework defers, in milliseconds.
   * Discord gives 3 seconds: the default leaves room for the request.
   */
  deferAfter?: number;
}

/** Who did it, as Discord sent it: the member in a server, the user elsewhere. */
export function authorOf(
  raw: RawInteraction
): { user: RawUser; member: RawGuildMember | undefined } | null {
  const user = raw.member?.user ?? raw.user;
  return user ? { user, member: raw.member } : null;
}

/** Where an interaction happened, as its `run` receives it. */
export interface Place {
  user: User;
  guild: Guild | null;
  member: GuildMember | null;
  channel: TextBasedChannel;
  /** In a server the bot is in, with the member. */
  inGuild: boolean;
}

export type Placed =
  | { place: Place; refusal?: undefined }
  | { place?: undefined; refusal: 'guildOnly' | 'dmOnly' | 'notHere' };

/**
 * Where the interaction was used, checked against where `what` works.
 * Returns the place, or what to tell the person when it can't run there.
 */
export function resolvePlace(
  ctx: Context,
  raw: RawInteraction,
  user: User,
  rawMember: RawGuildMember | undefined,
  where: Where,
  warn: (message: string) => void
): Placed {
  // In a server Discord sends the member, in a private message the user.
  const guild = raw.guild_id
    ? (ctx.cache.guilds.get(raw.guild_id) ?? null)
    : null;
  const member =
    raw.guild_id && rawMember
      ? ctx.entities.member(raw.guild_id, rawMember)
      : null;
  const inGuild = guild !== null && member !== null;
  if (where === 'guild' && !inGuild) {
    return { refusal: 'guildOnly' };
  }
  if (where === 'dm' && raw.guild_id) {
    return { refusal: 'dmOnly' };
  }
  if (raw.guild_id && !inGuild) {
    // A server the bot is not in: nothing of it is known.
    return { refusal: 'notHere' };
  }
  // Discord sends the channel with the interaction: known without asking.
  const channel =
    (raw.channel_id ? ctx.cache.channels.get(raw.channel_id) : undefined) ??
    (raw.channel?.id
      ? ctx.entities.channel(raw.channel as RawChannel, raw.guild_id)
      : undefined);
  if (!channel?.isTextBased() || (!inGuild && !channel.isDM())) {
    warn(
      `was used in a channel the bot can't answer in (${channel ? `type ${channel.type}` : 'Discord did not say which'}): it did not run.`
    );
    return { refusal: 'notHere' };
  }
  return { place: { user, guild, member, channel, inGuild } };
}

/** What `run` receives about the place, following `where`. */
export function placeContext(
  place: Place,
  where: Where
): Record<string, unknown> {
  // What a `run` receives follows where it works: nothing about a server
  // exists for what only works in private messages.
  return {
    channel: place.channel,
    ...(where === 'dm' ? {} : { guild: place.guild, member: place.member }),
  };
}

/** A phrase of the framework, in the language of the person. */
export function says(
  interaction: Interaction,
  key: FrameworkKey,
  params?: { what?: What; permissions?: string; count?: number }
): string {
  return phrase(ctxOf(interaction), interaction.locale, key, params);
}

/**
 * Answers with a private message, in the language of the person, and
 * never fails.
 */
export function refuse(
  interaction: Interaction,
  key: FrameworkKey,
  params?: { what?: What; permissions?: string; count?: number }
): void {
  interaction
    .reply({ content: says(interaction, key, params), ephemeral: true })
    .catch(() => {});
}

export interface RunOptions {
  interaction: Interaction;
  /** The file the function comes from. */
  file: string;
  /** How the thing is named in messages to the developer: `/ping`, `buttons/ban`. */
  name: string;
  /** What it is, for the person: "command", "button", "menu", "form". */
  what: What;
  reporter: Reporter;
  /** What to tell Discord when the answer takes long. */
  defer: () => Promise<void>;
  /** What to tell the developer when `run` finishes without answering. */
  unanswered: string;
  run: () => unknown;
}

/**
 * Runs the function of an interaction. Discord wants an answer within 3
 * seconds: when `run` takes longer, the framework says the answer is
 * coming. When `run` throws, the person gets a plain answer and the
 * developer the error with its file and line.
 */
export function runInteraction(options: RunOptions): void {
  const { interaction, file, name, reporter } = options;
  const stop = new AbortController();
  sleep(reporter.deferAfter ?? 2000, undefined, { signal: stop.signal })
    .then(() => options.defer())
    .catch(() => {});

  new Promise(resolve => resolve(options.run()))
    .then(() => {
      if (!interaction.answered) {
        reporter.onWarning(file, `${name} ${options.unanswered}`);
      }
    })
    .catch((error: unknown) => {
      reporter.onError(file, error);
      // The person gets a plain answer, never the technical details.
      const missingPermission =
        error instanceof DiscordApiError &&
        (error.code === 50013 || error.code === 50001);
      const content = missingPermission
        ? says(interaction, 'missingPermission')
        : says(interaction, 'failed', { what: options.what });
      const tell = isUpdating(interaction)
        ? // The pending answer is a change of a message: the bad news must
          // not replace that message.
          interaction.followUp({ content, ephemeral: true })
        : interaction.deferred
          ? interaction.edit(content)
          : interaction.answered
            ? interaction.followUp({ content, ephemeral: true })
            : interaction.reply({ content, ephemeral: true });
      tell.catch(() => {});
    })
    .finally(() => stop.abort());
}
