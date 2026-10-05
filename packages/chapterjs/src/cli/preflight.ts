// What is checked before connecting: each problem is explained with how to
// fix it, and when a person is there, the CLI waits for the fix instead of
// making them start it again.

import { setTimeout as sleep } from 'node:timers/promises';
import { GetCurrentApplication, GetGuild } from '../discord/endpoints.js';
import {
  intentNames,
  PRIVILEGED_INTENTS,
  type GatewayIntentName,
} from '../discord/intents.js';
import {
  ApplicationFlags,
  type RawApplication,
} from '../discord/types/application.js';
import type { RawGuild } from '../discord/types/guild.js';
import { PermissionFlags } from '../discord/types/permissions.js';
import { DiscordApiError } from '../rest/errors.js';
import type { Rest } from '../rest/rest.js';
import type { Log } from './log.js';

export interface PreflightOptions {
  rest: Rest;
  log: Log;
  /** Whether a person is watching: problems are then waited out. */
  interactive: boolean;
  /** How often a fix is looked for while waiting, in milliseconds. */
  pollInterval: number;
  /** Stops waiting (the user pressed Ctrl+C). */
  signal: AbortSignal;
}

/** A problem that was explained and that stops the command. */
export class PreflightFailure extends Error {}

/**
 * The flags an application has when a privileged intent is enabled for it:
 * the plain one once Discord approved it for a verified bot, the "limited"
 * one for a bot in fewer than 100 servers.
 * @see https://docs.discord.com/developers/resources/application#application-object-application-flags
 */
const INTENT_FLAGS: Record<string, number> = {
  GuildPresences:
    ApplicationFlags.GatewayPresence | ApplicationFlags.GatewayPresenceLimited,
  GuildMembers:
    ApplicationFlags.GatewayGuildMembers |
    ApplicationFlags.GatewayGuildMembersLimited,
  MessageContent:
    ApplicationFlags.GatewayMessageContent |
    ApplicationFlags.GatewayMessageContentLimited,
};

/** What the Developer Portal calls each privileged intent. */
const PORTAL_NAMES: Record<string, string> = {
  GuildPresences: 'Presence Intent',
  GuildMembers: 'Server Members Intent',
  MessageContent: 'Message Content Intent',
};

/** The privileged intents among `intents` that the application lacks. */
export function missingPrivilegedIntents(
  intents: number,
  application: Pick<RawApplication, 'flags'>
): GatewayIntentName[] {
  const flags = application.flags ?? 0;
  return intentNames(intents).filter(
    name =>
      PRIVILEGED_INTENTS.includes(name) && (flags & INTENT_FLAGS[name]!) === 0
  );
}

/**
 * The link that adds the bot to one server.
 * @see https://docs.discord.com/developers/topics/oauth2#bot-authorization-flow
 */
export function inviteUrl(applicationId: string, guildId: string): string {
  const query = new URLSearchParams({
    client_id: applicationId,
    scope: 'bot applications.commands',
    // A dev server is a playground: the bot can do everything there.
    permissions: PermissionFlags.Administrator.toString(),
    guild_id: guildId,
    disable_guild_select: 'true',
  });
  return `https://discord.com/oauth2/authorize?${query}`;
}

/** Checks the token and returns the application of the bot. */
export function fetchApplication(rest: Rest): Promise<RawApplication> {
  return rest.request(GetCurrentApplication, []);
}

async function waitFor<T>(
  options: PreflightOptions,
  check: () => Promise<T | null>
): Promise<T> {
  for (;;) {
    await sleep(options.pollInterval, undefined, { signal: options.signal });
    const result = await check();
    if (result !== null) return result;
  }
}

/** Makes sure the bot is in the dev server, and returns that server. */
export async function ensureInDevGuild(
  options: PreflightOptions,
  applicationId: string,
  guildId: string
): Promise<RawGuild> {
  const fetch = async (): Promise<RawGuild | null> => {
    try {
      return await options.rest.request(GetGuild, [guildId]);
    } catch (error) {
      // 10004 Unknown Guild, 50001 Missing Access: the bot is not in it.
      if (
        error instanceof DiscordApiError &&
        (error.code === 10004 || error.code === 50001)
      ) {
        return null;
      }
      throw error;
    }
  };
  const guild = await fetch();
  if (guild) return guild;
  const explanation = `Your bot is not in your dev server yet (DEV_GUILD_ID=${guildId}).\nOpen this link to add it:\n${inviteUrl(applicationId, guildId)}\nIf the link shows another server, DEV_GUILD_ID is not the ID of a server you manage.`;
  if (!options.interactive) {
    options.log.error(explanation);
    throw new PreflightFailure();
  }
  options.log.warn(`${explanation}\nWaiting for the bot to be added...`);
  const joined = await waitFor(options, fetch);
  options.log.success(`The bot joined ${joined.name}`);
  return joined;
}

/**
 * Makes sure the privileged intents the project needs are enabled.
 * `filesByIntent` says which files need each intent.
 */
export async function ensurePrivilegedIntents(
  options: PreflightOptions,
  application: RawApplication,
  intents: number,
  filesByIntent: (intent: GatewayIntentName) => string[]
): Promise<void> {
  let missing = missingPrivilegedIntents(intents, application);
  if (missing.length === 0) return;
  const list = missing
    .map(
      name =>
        `- ${PORTAL_NAMES[name]}, needed by ${filesByIntent(name).join(', ')}`
    )
    .join('\n');
  const explanation = `Your files need ${missing.length === 1 ? 'an option that is' : 'options that are'} not enabled for your bot:\n${list}\nEnable ${missing.length === 1 ? 'it' : 'them'} under "Privileged Gateway Intents", then save:\nhttps://discord.com/developers/applications/${application.id}/bot`;
  if (!options.interactive) {
    options.log.error(explanation);
    throw new PreflightFailure();
  }
  options.log.warn(
    `${explanation}\nWaiting for you to enable ${missing.length === 1 ? 'it' : 'them'}...`
  );
  await waitFor(options, async () => {
    missing = missingPrivilegedIntents(
      intents,
      await fetchApplication(options.rest)
    );
    return missing.length === 0 ? true : null;
  });
  options.log.success('Privileged intents enabled');
}

/** The intents a number contains, as the docs name them, for messages. */
export function describeIntents(intents: number): string {
  return intentNames(intents)
    .map(name =>
      name
        .replace(/[A-Z]/g, (letter, index: number) =>
          index === 0 ? letter : `_${letter}`
        )
        .toUpperCase()
    )
    .join(', ');
}
