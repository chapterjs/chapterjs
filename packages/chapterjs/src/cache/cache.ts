import type { Snowflake } from '../discord/types/common.js';
import type { Channel } from '../structures/channel.js';
import type { Guild } from '../structures/guild.js';
import type { User } from '../structures/user.js';
import {
  memoryStore,
  type CacheStore,
  type CacheStoreFactory,
} from './store.js';

/**
 * How many of each kind of thing are remembered. `0` disables a kind,
 * `Infinity` keeps everything Discord sends.
 */
export interface CacheLimits {
  /** Users, across every server. */
  users: number;
  /**
   * Members, per server: the ones seen the most recently. The bot itself
   * is always kept, apart from this.
   */
  members: number;
  /** Messages, per channel. */
  messages: number;
}

/**
 * Messages are not kept by default: they are by far what a bot receives the
 * most, and most bots never read an old one. A feature that needs them
 * raises the limit.
 */
export const DEFAULT_CACHE_LIMITS: CacheLimits = {
  users: Infinity,
  // A server can have millions of members, and Discord recommends keeping
  // only what the app needs: what an event comes with (the author of a
  // message, who used a command) is kept by the event itself, whatever this
  // limit. A feature that needs more members remembered asks for it (see
  // `remembers` in the events).
  // https://docs.discord.com/developers/events/gateway#tracking-state
  members: 100,
  messages: 0,
};

export interface CacheOptions {
  limits?: Partial<CacheLimits>;
  /** Where data is stored. Default: the memory of the process. */
  store?: CacheStoreFactory;
}

/**
 * What the bot currently knows about Discord, kept up to date by events so
 * that reading it never costs a request. Servers own what belongs to them
 * (roles, members, emojis...): forgetting a server forgets it all.
 */
export class Cache {
  #configured: Readonly<CacheLimits>;
  #limits: CacheLimits;
  readonly createStore: CacheStoreFactory;
  readonly users: CacheStore<Snowflake, User>;
  readonly guilds: CacheStore<Snowflake, Guild>;
  /** Every channel the bot knows: of servers, threads and private ones. */
  readonly channels: CacheStore<Snowflake, Channel>;

  constructor(options: CacheOptions = {}) {
    this.#configured = Object.freeze({
      ...DEFAULT_CACHE_LIMITS,
      ...options.limits,
    });
    this.#limits = { ...this.#configured };
    this.createStore = options.store ?? memoryStore;
    this.users = this.createStore({ limit: this.limits.users });
    this.guilds = this.createStore();
    this.channels = this.createStore();
  }

  /** How many of each kind are kept when memory is not a concern. */
  get configured(): Readonly<CacheLimits> {
    return this.#configured;
  }

  /**
   * Changes what is kept when memory is not a concern (the files of the
   * project changed and need more, or less). What holds right now follows,
   * except what memory made lower: that stays as low as it is.
   */
  configure(limits: Partial<CacheLimits>): void {
    const next = Object.freeze({ ...this.#configured, ...limits });
    const now = { ...this.#limits };
    for (const kind of Object.keys(next) as (keyof CacheLimits)[]) {
      now[kind] =
        this.#limits[kind] === this.#configured[kind]
          ? next[kind]
          : Math.min(this.#limits[kind], next[kind]);
    }
    this.#configured = next;
    this.#limits = now;
  }

  /**
   * How many of each kind are kept right now: what was configured, or less
   * while memory is short (see `core/memory.ts`). New stores follow it.
   */
  get limits(): Readonly<CacheLimits> {
    return this.#limits;
  }

  /** Changes the limits new stores follow; existing ones are resized apart. */
  setLimits(limits: Partial<CacheLimits>): void {
    this.#limits = { ...this.#limits, ...limits };
  }

  /** Forgets everything (the session was lost and starts over). */
  clear(): void {
    this.users.clear();
    this.guilds.clear();
    this.channels.clear();
  }
}
