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
  /** Members, per server. */
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
  members: Infinity,
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
  readonly limits: Readonly<CacheLimits>;
  readonly createStore: CacheStoreFactory;
  readonly users: CacheStore<Snowflake, User>;
  readonly guilds: CacheStore<Snowflake, Guild>;
  /** Every channel the bot knows: of servers, threads and private ones. */
  readonly channels: CacheStore<Snowflake, Channel>;

  constructor(options: CacheOptions = {}) {
    this.limits = Object.freeze({ ...DEFAULT_CACHE_LIMITS, ...options.limits });
    this.createStore = options.store ?? memoryStore;
    this.users = this.createStore({ limit: this.limits.users });
    this.guilds = this.createStore();
    this.channels = this.createStore();
  }

  /** Forgets everything (the session was lost and starts over). */
  clear(): void {
    this.users.clear();
    this.guilds.clear();
    this.channels.clear();
  }
}
