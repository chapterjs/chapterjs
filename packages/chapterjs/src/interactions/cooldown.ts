// Cooldowns: refusing something to a person, a channel or a server that
// used it a moment ago. Written once for every interaction that can have
// one (a command today). Where the last uses are kept is behind
// `CooldownStore`, with a store in memory as default: one shared between
// processes or machines is another implementation, and nothing else.

/** What a cooldown applies to: the person, the channel or the server. */
export type CooldownScope = 'user' | 'channel' | 'guild';

export const COOLDOWN_SCOPES: readonly CooldownScope[] = [
  'user',
  'channel',
  'guild',
];

/** How long each scope waits, in milliseconds; `0` when it does not. */
export type CooldownLimits = Readonly<Record<CooldownScope, number>>;

/** No cooldown at all. */
export const NO_COOLDOWN: CooldownLimits = Object.freeze({
  user: 0,
  channel: 0,
  guild: 0,
});

/** Where the last uses are kept. */
export interface CooldownStore {
  /** When `key` may be used again, as a timestamp; `0` when it may now. */
  until(key: string, now: number): number;
  /** Remembers that `key` may not be used again before `until`. */
  set(key: string, until: number): void;
}

/**
 * The default store: a `Map` in the memory of the process. It forgets
 * what expired on its own, so it never grows with the uses of the past.
 */
export class MemoryCooldowns implements CooldownStore {
  readonly #until = new Map<string, number>();
  #sweepAt = 1000;

  until(key: string, now: number): number {
    const until = this.#until.get(key);
    if (until === undefined) return 0;
    if (until <= now) {
      this.#until.delete(key);
      return 0;
    }
    return until;
  }

  set(key: string, until: number): void {
    this.#until.set(key, until);
    if (this.#until.size >= this.#sweepAt) this.#sweep(Date.now());
  }

  /** How many keys are remembered. */
  get size(): number {
    return this.#until.size;
  }

  /** Forgets what expired, and sweeps again when the rest doubled. */
  #sweep(now: number): void {
    for (const [key, until] of this.#until) {
      if (until <= now) this.#until.delete(key);
    }
    this.#sweepAt = Math.max(1000, this.#until.size * 2);
  }
}

/** The ids a use is counted against, when they exist. */
export type CooldownIds = Readonly<Partial<Record<CooldownScope, string>>>;

/**
 * Whether `name` may be used now by these ids, given its limits. Returns
 * `0` and counts the use, or the time it may be used again (the latest
 * of the scopes still waiting) and counts nothing.
 */
export function checkCooldown(
  store: CooldownStore,
  name: string,
  limits: CooldownLimits,
  ids: CooldownIds,
  now = Date.now()
): number {
  const keys: [string, number][] = [];
  let until = 0;
  for (const scope of COOLDOWN_SCOPES) {
    const limit = limits[scope];
    const id = ids[scope];
    if (limit <= 0 || id === undefined) continue;
    const key = `${name}\0${scope}\0${id}`;
    until = Math.max(until, store.until(key, now));
    keys.push([key, now + limit]);
  }
  if (until > 0) return until;
  for (const [key, expires] of keys) store.set(key, expires);
  return 0;
}
