// Shows the activities of the presence in turn, each for its `for`, and
// runs the functions of the file when their activity comes: the text of an
// activity, or the list itself.
//
// Which activity is shown is read from the clock: the list is a cycle
// starting at the epoch, so every process of a large bot shows the same
// activity at the same time, with nothing to coordinate.

import type { RawGatewayPresenceUpdate } from '../discord/types/gateway-events.js';
import {
  checkText,
  DEFAULT_FOR,
  DEFAULT_PRESENCE,
  readActivities,
  toRaw,
  type LoadedActivity,
  type LoadedPresence,
} from './declaration.js';
import type { PresenceContext } from './presence.js';

export interface RotationOptions {
  /** Sends a presence to the bot of the moment. */
  apply(raw: RawGatewayPresenceUpdate): void;
  /** What the functions receive, or `null` while there is no bot to show it. */
  context(): PresenceContext | null;
  /** A function of the file threw, or gave something wrong. Said once until it changes. */
  onError(error: unknown): void;
  /** The clock, in milliseconds (tests). */
  now?: () => number;
}

/** How long to wait for a bot before trying again. */
const NO_BOT_RETRY = 1_000;

/**
 * Which activity of a list the clock says to show, and how long until the
 * next one.
 */
export function activityAt(
  activities: readonly LoadedActivity[],
  now: number
): { index: number; left: number } {
  const cycle = activities.reduce((sum, one) => sum + one.for, 0);
  let position = now % cycle;
  for (const [index, activity] of activities.entries()) {
    if (position < activity.for) {
      return { index, left: activity.for - position };
    }
    position -= activity.for;
  }
  // Not reached: the position is below the cycle.
  return { index: 0, left: activities[0]!.for };
}

/** The presence of the project, shown in turn while it is started. */
export class PresenceRotation {
  readonly #options: RotationOptions;
  readonly #now: () => number;
  #presence: LoadedPresence | null = null;
  #started = false;
  #timer: NodeJS.Timeout | undefined;
  /** Each tick has its number: one started since then makes it give up. */
  #generation = 0;
  /** The list a function gave last, and until when it is used. */
  #list: readonly LoadedActivity[] | null = null;
  #listUntil = 0;
  /** The last text of each activity a function gave, by its place. */
  #texts = new Map<number, string>();
  /** What was said last of each function (`list`, or the place of an activity). */
  #problems = new Map<string, string>();

  constructor(options: RotationOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  /** Changes the presence (a load, a reload): shown at once when started. */
  set(presence: LoadedPresence | null): void {
    this.#presence = presence;
    this.#list = null;
    this.#texts.clear();
    this.#problems.clear();
    if (this.#started) void this.#tick();
  }

  /** Starts showing the presence. */
  start(): void {
    this.#started = true;
    void this.#tick();
  }

  /** Stops: nothing runs after this. */
  stop(): void {
    this.#started = false;
    this.#generation++;
    clearTimeout(this.#timer);
  }

  /** What is shown right now, as the gateway sends it: one step of the cycle. */
  async #tick(): Promise<void> {
    const generation = ++this.#generation;
    clearTimeout(this.#timer);
    const current = (): boolean =>
      this.#started && generation === this.#generation;
    const presence = this.#presence;
    if (!presence) {
      this.#options.apply(DEFAULT_PRESENCE);
      return;
    }
    const context = this.#options.context();
    if (!context) {
      this.#later(NO_BOT_RETRY);
      return;
    }
    let activities: readonly LoadedActivity[];
    if (typeof presence.activities === 'function') {
      if (this.#list === null || this.#now() >= this.#listUntil) {
        try {
          const given = await presence.activities(context);
          if (!current()) return;
          this.#list = readActivities(given);
          this.#texts.clear();
          this.#problems.delete('list');
        } catch (error) {
          if (!current()) return;
          this.#problem('list', error);
          // The last good list stays; none at all shows the status alone.
          this.#list ??= [];
        }
        const cycle = this.#list.reduce((sum, one) => sum + one.for, 0);
        this.#listUntil = this.#now() + (cycle || DEFAULT_FOR);
      }
      activities = this.#list;
    } else {
      activities = presence.activities;
    }

    if (activities.length === 0) {
      this.#options.apply(toRaw(presence.status, null, ''));
      // A function may give activities later.
      if (typeof presence.activities === 'function') {
        this.#later(this.#listUntil - this.#now());
      }
      return;
    }

    const { index, left } = activityAt(activities, this.#now());
    const activity = activities[index]!;
    let text: string | undefined;
    if (typeof activity.name === 'function') {
      try {
        text = checkText(await activity.name(context));
        if (!current()) return;
        this.#texts.set(index, text);
        this.#problems.delete(`name ${index}`);
      } catch (error) {
        if (!current()) return;
        this.#problem(`name ${index}`, error);
        text = this.#texts.get(index);
      }
    } else {
      text = activity.name;
    }
    if (text !== undefined) {
      this.#options.apply(toRaw(presence.status, activity, text));
    }
    const moves =
      activities.length > 1 ||
      typeof activity.name === 'function' ||
      typeof presence.activities === 'function';
    if (moves) {
      // A list that ends before this activity does is asked again then.
      const until =
        typeof presence.activities === 'function'
          ? Math.min(left, Math.max(0, this.#listUntil - this.#now()))
          : left;
      this.#later(until);
    }
  }

  #later(ms: number): void {
    if (!this.#started) return;
    // At least 1 ms: a list asked again on the very boundary.
    this.#timer = setTimeout(() => void this.#tick(), Math.max(1, ms));
    // Nothing of the bot waits for it: the gateway keeps the process up.
    this.#timer.unref();
  }

  /** Says what went wrong with a function, once until it changes. */
  #problem(what: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.#problems.get(what) === message) return;
    this.#problems.set(what, message);
    this.#options.onError(error);
  }
}
