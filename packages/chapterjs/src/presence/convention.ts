// `src/presence.ts`: the one file that says what the bot shows under its
// name. What it declares is checked when it loads and turned into what the
// gateway sends, so a wrong status or type is explained before the bot
// connects.

import type { Convention } from '../loader/loader.js';
import {
  ActivityType,
  type RawBotActivity,
  type RawGatewayPresenceUpdate,
} from '../discord/types/gateway-events.js';
import { isPresenceFile, type PresenceConfig } from './presence.js';

/** The presence file, checked: what the gateway sends. */
export interface LoadedPresence {
  /** The Update Presence payload (also sent with Identify). */
  readonly raw: RawGatewayPresenceUpdate;
  /** What tells one presence from another: the payload, as text. */
  readonly key: string;
}

const fail: (message: string) => never = message => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = ['status', 'activity'];
const ACTIVITY_KEYS = ['type', 'name', 'url'];

/**
 * The statuses a file may give.
 * @see https://docs.discord.com/developers/events/gateway-events#update-presence-status-types
 */
const STATUSES = ['online', 'idle', 'dnd', 'invisible'] as const;

/**
 * The activity types, by the word a file writes.
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-types
 */
const TYPES = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  custom: ActivityType.Custom,
  competing: ActivityType.Competing,
} as const;

/**
 * "The streaming type currently only supports Twitch and YouTube. Only
 * https://twitch.tv/ and https://youtube.com/ urls will work."
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-types
 */
const STREAM_URL = /^https:\/\/(?:www\.)?(?:twitch\.tv|youtube\.com)\//;

const list = (words: readonly string[]): string =>
  words.map(word => `'${word}'`).join(', ');

const EXAMPLE = `presence({ status: 'online', activity: { type: 'watching', name: 'over the server' } })`;

/**
 * What a bot without a presence file shows: online, doing nothing. Sent
 * when the file is removed while the bot runs.
 */
export const DEFAULT_PRESENCE: RawGatewayPresenceUpdate = Object.freeze({
  since: null,
  activities: [],
  status: 'online',
  afk: false,
});

/** Turns a checked config into what the gateway sends. */
function toRaw(config: PresenceConfig): RawGatewayPresenceUpdate {
  const activities: RawBotActivity[] = [];
  if (config.activity) {
    const { type, name, url } = config.activity;
    activities.push(
      type === 'custom'
        ? // A custom status shows its `state`; `name` is not shown but required.
          { name: 'Custom Status', type: TYPES.custom, state: name }
        : { name, type: TYPES[type], ...(url ? { url } : {}) }
    );
  }
  // `since` and `afk` are about a person's client going idle: a bot is
  // never away from its keyboard.
  return {
    since: null,
    activities,
    status: config.status ?? 'online',
    afk: false,
  };
}

/**
 * `src/presence.ts`: the status of the bot and what it is doing. The file
 * exports by default what `presence()` returns:
 *
 * ```ts
 * // src/presence.ts
 * import { presence } from 'chapterjs';
 *
 * export default presence({ activity: { type: 'playing', name: '/help' } });
 * ```
 */
export const presenceConvention: Convention<LoadedPresence> = {
  folder: 'presence',
  single: true,
  one: 'presence',
  many: 'presences',
  read(exports) {
    const file = exports.default;
    const example = `import { presence } from 'chapterjs'; export default ${EXAMPLE}`;
    if (!isPresenceFile(file)) {
      return fail(
        'default' in exports
          ? `The default export of this file must be what presence() returns: ${example}`
          : `This file has no default export. It should look like: ${example}`
      );
    }
    const config = file.config;
    if (!isRecord(config)) {
      return fail(`presence() needs an object: ${EXAMPLE}`);
    }
    for (const key of Object.keys(config)) {
      if (!KEYS.includes(key)) {
        fail(
          `"${key}" is not something a presence has. It can have: ${KEYS.join(', ')}.`
        );
      }
    }
    const { status, activity } = config;
    if (
      status !== undefined &&
      !STATUSES.includes(status as (typeof STATUSES)[number])
    ) {
      fail(
        `"status" is ${JSON.stringify(status)}: it can be ${list(STATUSES)}.`
      );
    }
    if (activity !== undefined) {
      if (!isRecord(activity)) {
        fail(
          `"activity" is what the bot is doing, an object: activity: { type: 'playing', name: '/help' }`
        );
      }
      for (const key of Object.keys(activity)) {
        if (!ACTIVITY_KEYS.includes(key)) {
          fail(
            `"${key}" is not something an activity has. It can have: ${ACTIVITY_KEYS.join(', ')}.`
          );
        }
      }
      const { type, name, url } = activity;
      if (typeof type !== 'string' || !(type in TYPES)) {
        fail(
          `The "type" of the activity is ${JSON.stringify(type)}: it can be ${list(Object.keys(TYPES))}.`
        );
      }
      if (typeof name !== 'string' || name.trim() === '') {
        fail(
          `The "name" of the activity is the text shown under the name of the bot: it can't be empty.`
        );
      }
      if (type === 'streaming') {
        if (typeof url !== 'string' || !STREAM_URL.test(url)) {
          fail(
            `A "streaming" activity needs the "url" of the stream, and Discord only accepts a https://twitch.tv/ or a https://youtube.com/ link${typeof url === 'string' ? ` (got ${JSON.stringify(url)})` : ''}.`
          );
        }
      } else if (url !== undefined) {
        fail(
          `"url" only goes with a "streaming" activity: a ${JSON.stringify(type)} activity has no link.`
        );
      }
    }
    const raw = toRaw(config as PresenceConfig);
    return { raw, key: JSON.stringify(raw) };
  },
};
