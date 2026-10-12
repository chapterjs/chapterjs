// What a file declares with `presence()`: what the bot shows under its
// name. It is checked when it loads and turned into what the gateway
// sends, so a wrong status or type is explained before the bot connects.
// The activities a function gives are checked the same way when it runs
// (`readActivities`).

import type { Declaration } from '../loader/loader.js';
import {
  ActivityType,
  type RawBotActivity,
  type RawGatewayPresenceUpdate,
} from '../discord/types/gateway-events.js';
import { DURATION_EXAMPLE, parseDuration } from '../util/duration.js';
import {
  isPresenceDeclaration,
  type ActivityKind,
  type PresenceContext,
  type PresenceStatusName,
} from './presence.js';

/** The text of an activity as a file gives it: a text, or a function. */
export type LoadedText =
  string | ((context: PresenceContext) => string | Promise<string>);

/** An activity, checked. */
export interface LoadedActivity {
  readonly type: ActivityKind | 'streaming';
  readonly name: LoadedText;
  readonly url?: string;
  /** How long it is shown, in milliseconds. */
  readonly for: number;
}

/** The function of a file that gives the activities. */
export type ActivitiesFunction = (
  context: PresenceContext
) => unknown | Promise<unknown>;

/** The presence, checked: what the gateway sends. */
export interface LoadedPresence {
  readonly status: PresenceStatusName;
  /** The activities shown in turn (none, one or several), or the function giving them. */
  readonly activities: readonly LoadedActivity[] | ActivitiesFunction;
  /**
   * What the bot connects with (sent with Identify): the first activity
   * when it is known without running anything, else the status alone.
   */
  readonly raw: RawGatewayPresenceUpdate;
  /**
   * What tells one presence from another: what it sends, and the code of
   * its functions, as text. The same file saved again has the same key.
   */
  readonly key: string;
}

const fail: (message: string) => never = message => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = ['status', 'activity', 'activities'];
const ACTIVITY_KEYS = ['type', 'name', 'url', 'for'];

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

/** How long an activity is shown when the file does not say. */
export const DEFAULT_FOR = 30_000;

/**
 * The shortest time an activity may be shown. "Clients may only update
 * their game status 5 times per 20 seconds": one every 5 seconds is
 * always sent at once.
 * @see https://docs.discord.com/developers/events/gateway-events#update-presence
 */
export const MIN_FOR = 5_000;

/** The most activities a list may have. */
const MAX_ACTIVITIES = 100;

const list = (words: readonly string[]): string =>
  words.map(word => `'${word}'`).join(', ');

const EXAMPLE = `presence({ status: 'online', activity: { type: 'watching', name: 'over the server' } })`;

/**
 * What a bot without a presence shows: online, doing nothing. Sent when
 * the declaration is removed while the bot runs.
 */
export const DEFAULT_PRESENCE: RawGatewayPresenceUpdate = Object.freeze({
  since: null,
  activities: [],
  status: 'online',
  afk: false,
});

/**
 * What the gateway sends for a status and the activity shown, with its
 * text. `since` and `afk` are about a person's client going idle: a bot is
 * never away from its keyboard.
 */
export function toRaw(
  status: PresenceStatusName,
  activity: { type: LoadedActivity['type']; url?: string } | null,
  name: string
): RawGatewayPresenceUpdate {
  const activities: RawBotActivity[] = [];
  if (activity) {
    const { type, url } = activity;
    activities.push(
      type === 'custom'
        ? // A custom status shows its `state`; `name` is not shown but required.
          { name: 'Custom Status', type: TYPES.custom, state: name }
        : { name, type: TYPES[type], ...(url ? { url } : {}) }
    );
  }
  return { since: null, activities, status, afk: false };
}

/** Checks the text of an activity a function gave, when it ran. */
export function checkText(name: unknown): string {
  if (typeof name !== 'string' || name.trim() === '') {
    return fail(
      `The "name" of the activity is the text shown under the name of the bot: it can't be empty${typeof name === 'string' ? '' : ` (got ${JSON.stringify(name) ?? typeof name})`}.`
    );
  }
  return name;
}

/** Checks one activity: `where` says which one, in messages. */
function readActivity(activity: unknown, where: string): LoadedActivity {
  if (!isRecord(activity)) {
    return fail(
      `${where} is what the bot is doing, an object: { type: 'playing', name: '/help' }`
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
      `The "type" of ${where} is ${JSON.stringify(type)}: it can be ${list(Object.keys(TYPES))}.`
    );
  }
  if (typeof name !== 'function') checkText(name);
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
  let ms = DEFAULT_FOR;
  if (activity.for !== undefined) {
    const parsed =
      typeof activity.for === 'string' ? parseDuration(activity.for) : null;
    if (parsed === null) {
      fail(
        `"for" of ${where} is how long it is shown, a duration (${DURATION_EXAMPLE}): got ${JSON.stringify(activity.for) ?? typeof activity.for}.`
      );
    }
    if (parsed! < MIN_FOR) {
      fail(
        `"for" of ${where} is ${JSON.stringify(activity.for)}: an activity is shown 5 seconds at least, since Discord takes 5 changes of presence per 20 seconds.`
      );
    }
    ms = parsed!;
  }
  return Object.freeze({
    type: type as LoadedActivity['type'],
    name: name as LoadedText,
    ...(url === undefined ? {} : { url: url as string }),
    for: ms,
  });
}

/**
 * Checks a list of activities: the one of a file, or what its function
 * gave when it ran.
 */
export function readActivities(value: unknown): LoadedActivity[] {
  if (!Array.isArray(value)) {
    return fail(
      `"activities" is a list of activities, like [{ type: 'playing', name: '/help', for: '30s' }]: got ${JSON.stringify(value) ?? typeof value}.`
    );
  }
  if (value.length > MAX_ACTIVITIES) {
    fail(
      `"activities" has ${value.length} activities: ${MAX_ACTIVITIES} at most.`
    );
  }
  return value.map((activity, index) =>
    readActivity(activity, `activity ${index + 1} of "activities"`)
  );
}

/** A function as text, so that the same code saved again is not a change. */
const codeOf = (value: unknown): unknown =>
  typeof value === 'function' ? `ƒ ${String(value)}` : value;

/**
 * The presence of the bot, declared once anywhere in `src/` with
 * `presence()` and exported.
 */
export const presenceDeclaration: Declaration<LoadedPresence> = {
  one: 'presence',
  many: 'presences',
  is: isPresenceDeclaration,
  list: false,
  read(value) {
    const config = (value as { config: unknown }).config;
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
    const { status = 'online', activity } = config;
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
      fail(
        `"status" is ${JSON.stringify(status)}: it can be ${list(STATUSES)}.`
      );
    }
    if (activity !== undefined && config.activities !== undefined) {
      fail(
        `A presence has "activity" (one) or "activities" (several, shown in turn), not both.`
      );
    }
    let activities: LoadedPresence['activities'] = [];
    if (activity !== undefined) {
      if (!isRecord(activity)) {
        fail(
          `"activity" is what the bot is doing, an object: activity: { type: 'playing', name: '/help' }`
        );
      }
      activities = [readActivity(activity, 'the activity')];
    } else if (typeof config.activities === 'function') {
      activities = config.activities as ActivitiesFunction;
    } else if (config.activities !== undefined) {
      activities = readActivities(config.activities);
      if (activities.length === 0) {
        fail(
          `"activities" is empty: give it the activities to show in turn, or leave it out.`
        );
      }
    }
    const first = Array.isArray(activities) ? activities[0] : undefined;
    const raw = toRaw(
      status as PresenceStatusName,
      first && typeof first.name === 'string' ? first : null,
      first && typeof first.name === 'string' ? first.name : ''
    );
    const shape = Array.isArray(activities)
      ? activities.map(one => ({ ...one, name: codeOf(one.name) }))
      : codeOf(activities);
    return {
      status: status as PresenceStatusName,
      activities,
      raw,
      // One activity whose text is known: told apart by what it sends, so
      // a presence written another way but sending the same is no change.
      key:
        Array.isArray(activities) &&
        activities.length <= 1 &&
        activities.every(
          one => typeof one.name === 'string' && one.for === DEFAULT_FOR
        )
          ? JSON.stringify(raw)
          : JSON.stringify({ status, activities: shape }),
    };
  },
};
