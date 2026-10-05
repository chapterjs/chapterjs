// Keeps the memory of the bot under control by itself. What the cache keeps
// is bounded per server, but not in total: a bot in many servers can still
// fill the memory of its process. Before that happens, the bot remembers
// less: it lowers its own limits, and raises them back when memory is fine
// again. It only asks for something when it has nothing left to give up.

import { getHeapStatistics } from 'node:v8';
import type { Cache, CacheLimits } from '../cache/cache.js';
import { storesOf } from '../structures/guild.js';

/** How much memory the process uses, and how much it can use, in bytes. */
export interface MemoryReading {
  used: number;
  limit: number;
}

/** What Node says of its own memory. */
export const readMemory = (): MemoryReading => ({
  used: process.memoryUsage().heapUsed,
  limit: getHeapStatistics().heap_size_limit,
});

/** What the bot remembers after its limits changed. */
export interface MemoryLimits {
  /** Members remembered per server, at most. */
  members: number;
  /** Users remembered, at most. */
  users: number;
}

/** Applies limits to what exists, and to what will. Returns what left. */
function apply(cache: Cache, limits: MemoryLimits): number {
  cache.setLimits(limits);
  let forgotten = cache.users.resize(limits.users);
  for (const guild of cache.guilds.values()) {
    forgotten += storesOf(guild).members.resize(limits.members);
  }
  return forgotten;
}

/**
 * Sets what the bot remembers when memory is not a concern, for the files
 * of the project as they are now. What exists follows at once.
 */
export function configure(cache: Cache, limits: Partial<CacheLimits>): void {
  cache.configure(limits);
  apply(cache, { members: cache.limits.members, users: cache.limits.users });
}

/**
 * Makes the bot remember half as much: half as many members per server,
 * half as many users. The ones seen the longest ago leave. Servers,
 * channels and roles stay: they are what keeps everything else true.
 * Returns `null` when nothing is left to give up.
 */
export function tighten(
  cache: Cache
): (MemoryLimits & { forgotten: number }) | null {
  const { members, users } = cache.limits;
  // Users have no limit of their own: half of the ones known today.
  const limits: MemoryLimits = {
    members: Math.floor(members / 2),
    users: Math.floor(Math.min(users, cache.users.size) / 2),
  };
  if (limits.members === members && limits.users === users) return null;
  return { ...limits, forgotten: apply(cache, limits) };
}

/**
 * Lets the bot remember more again, after memory was short: twice as many
 * members per server, up to what was configured, and users as configured.
 * Returns `null` when it already remembers all it may.
 */
export function relax(cache: Cache): MemoryLimits | null {
  const { members, users } = cache.limits;
  const limits: MemoryLimits = {
    members: Math.min(cache.configured.members, Math.max(1, members * 2)),
    users: cache.configured.users,
  };
  if (limits.members === members && limits.users === users) return null;
  apply(cache, limits);
  return limits;
}

export interface MemoryWatchOptions {
  /** The cache of the running bot, if there is one right now. */
  cache: () => Cache | undefined;
  /** The bot remembers less, to free memory. */
  onTightened: (
    now: MemoryLimits & { forgotten: number },
    reading: MemoryReading
  ) => void;
  /** Memory is fine again and the bot remembers all it may again. */
  onRestored: (now: MemoryLimits) => void;
  /**
   * Memory is nearly full and nothing is left to give up. `freed` is what
   * remembering less gave back, in bytes: little means the memory is not
   * used by what the bot remembers.
   */
  onFull: (reading: MemoryReading, freed: number) => void;
  /** How full memory must be to remember less, from 0 to 1. */
  high?: number;
  /** How empty memory must be to remember more again, from 0 to 1. */
  low?: number;
  /** How often memory is looked at, in milliseconds. */
  every?: number;
  read?: () => MemoryReading;
}

/**
 * Looks at the memory of the process from time to time. `check()` looks
 * right now; `stop()` ends it.
 */
export function watchMemory(options: MemoryWatchOptions): {
  check(): void;
  stop(): void;
} {
  const { high = 0.8, low = 0.5, every = 30_000, read = readMemory } = options;
  let highs = 0;
  let lows = 0;
  let said = false;
  /** What was used when the bot started to remember less. */
  let before: number | undefined;
  const check = (): void => {
    const reading = read();
    const cache = options.cache();
    if (reading.used >= reading.limit * high) {
      lows = 0;
      // Node frees memory by itself when it gets full: only a level that
      // stays high means something has to go.
      if (++highs < 2) return;
      const now = cache ? tighten(cache) : null;
      if (now) {
        before ??= reading.used;
        options.onTightened(now, reading);
      } else if (!said) {
        // Said once, until memory is no longer full.
        said = true;
        options.onFull(
          reading,
          before === undefined ? 0 : Math.max(0, before - reading.used)
        );
      }
      return;
    }
    highs = 0;
    said = false;
    before = undefined;
    // Between the two levels nothing moves: limits don't go up and down.
    if (reading.used >= reading.limit * low) {
      lows = 0;
      return;
    }
    if (++lows < 2 || !cache) return;
    const now = relax(cache);
    // Said when everything is back, not at every step up.
    if (now && now.members === cache.configured.members) {
      options.onRestored(now);
    }
  };
  const timer = setInterval(check, every);
  // Never what keeps the process alive.
  timer.unref();
  return { check, stop: () => clearInterval(timer) };
}
