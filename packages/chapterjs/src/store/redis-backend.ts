// The backend of the stores declared with `storage: 'redis'`: each value
// is one Redis key, `<store>:<part>:<part>` (`dev:` in front of it under
// `chapterjs dev`, so a Redis shared with production is never mixed up),
// its JSON as the value and its expiration given to Redis itself, which
// forgets the key alone. Nothing is written that a store did not ask for.
// An update is a transaction: WATCH the key, read it, then MULTI, write,
// EXEC, which Redis refuses when anyone wrote the key in between; it is
// then tried again on what is there now. A transaction needs a connection
// of its own (WATCH and MULTI belong to the connection, and the main one
// carries every other command), so a few are opened when updates need
// them, and lent one update at a time.
// https://redis.io/docs/latest/commands/set/ (PX), /commands/pttl/,
// /commands/scan/ (MATCH, COUNT), /commands/mget/, /commands/del/,
// https://redis.io/docs/latest/develop/interact/transactions/ (WATCH)

import { RedisClient } from '../redis/client.js';
import { RedisRankingBackend } from './redis-ranking.js';
import type { RedisReply } from '../redis/protocol.js';
import { tooBusy, UPDATE_ATTEMPTS } from './ipc-backend.js';
import {
  KeyQueue,
  startsWith,
  type StoreBackend,
  type StoreChange,
  type StoreEntry,
  type StoreKeyParts,
  type StoreListedEntry,
} from './backend.js';

/** The prefix of every key written by `chapterjs dev`. */
export const DEV_PREFIX = 'dev:';

export interface RedisStoreBackendOptions {
  /** Put in front of every key: `dev:` under `chapterjs dev`, nothing in production. */
  prefix?: string;
  /** How many keys SCAN is asked for at a time. */
  scanCount?: number;
  /** How many connections updates may use at once, besides the main one. */
  transactions?: number;
  /** A new connection to the same Redis, for an update. */
  connect?: () => RedisClient;
  now?: () => number;
}

/**
 * What a part of a key may not contain as is: `:` separates the parts,
 * `*`, `?`, `[`, `]` and `\` mean something to SCAN, `%` is the escape.
 */
const ESCAPED = /[%:*?[\]\\]/g;

/** A part of a key, safe between two `:` and in a MATCH pattern. */
export const escapePart = (part: string): string =>
  part.replace(
    ESCAPED,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
  );

/** The parts back from a key, after the prefix and the name of the store. */
export const unescapePart = (text: string): string =>
  text.replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );

/** The data of every store with `storage: 'redis'`, in one Redis. */
export class RedisStoreBackend implements StoreBackend {
  readonly #client: RedisClient;
  readonly #prefix: string;
  readonly #scanCount: number;
  readonly #now: () => number;
  readonly #connect: () => RedisClient;
  readonly #maxLent: number;
  /** Connections for updates that wait for one. */
  readonly #idle: RedisClient[] = [];
  /** Every connection opened for updates, to close them. */
  readonly #opened: RedisClient[] = [];
  /** Updates waiting for a connection, when every one is lent. */
  readonly #queue: ((client: RedisClient) => void)[] = [];
  readonly #updates = new KeyQueue();
  #rankings: RedisRankingBackend | null = null;

  constructor(client: RedisClient, options: RedisStoreBackendOptions = {}) {
    this.#client = client;
    this.#prefix = options.prefix ?? '';
    this.#scanCount = options.scanCount ?? 500;
    this.#now = options.now ?? Date.now;
    this.#maxLent = options.transactions ?? 4;
    this.#connect = options.connect ?? (() => new RedisClient(client.address));
  }

  /** A connection of its own for one update, given back by `release`. */
  async #lend(): Promise<RedisClient> {
    const idle = this.#idle.pop();
    if (idle) return idle;
    if (this.#opened.length < this.#maxLent) {
      const opened = this.#connect();
      this.#opened.push(opened);
      return opened;
    }
    return new Promise(resolve => this.#queue.push(resolve));
  }

  #release(client: RedisClient): void {
    const next = this.#queue.shift();
    if (next) next(client);
    else this.#idle.push(client);
  }

  /** Rankings as sorted sets: the key of a ranking is the key of its scope. */
  rankings(): RedisRankingBackend {
    this.#rankings ??= new RedisRankingBackend(this.#client, (name, scope) =>
      this.key(name, scope)
    );
    return this.#rankings;
  }

  /** The client, for the preflight check of the CLI. */
  get client(): RedisClient {
    return this.#client;
  }

  /** The Redis key of a store and parts. */
  key(store: string, parts: StoreKeyParts): string {
    return [this.#prefix + store, ...parts.map(escapePart)].join(':');
  }

  /** The parts of a Redis key of `store`, or `null` for another key. */
  #parts(store: string, key: string): string[] | null {
    const head = `${this.#prefix}${store}:`;
    if (!key.startsWith(head)) return null;
    return key.slice(head.length).split(':').map(unescapePart);
  }

  #entry(value: RedisReply, pttl: RedisReply): StoreEntry | undefined {
    if (typeof value !== 'string') return undefined;
    // -2: the key is gone since; -1: no expiration.
    if (pttl === -2) return undefined;
    return {
      value: JSON.parse(value) as unknown,
      expiresAt:
        typeof pttl === 'number' && pttl >= 0 ? this.#now() + pttl : null,
    };
  }

  async get(
    store: string,
    key: StoreKeyParts
  ): Promise<StoreEntry | undefined> {
    const name = this.key(store, key);
    const [value, pttl] = await Promise.all([
      this.#client.send('GET', name),
      this.#client.send('PTTL', name),
    ]);
    return this.#entry(value, pttl);
  }

  async set(
    store: string,
    key: StoreKeyParts,
    entry: StoreEntry
  ): Promise<void> {
    const name = this.key(store, key);
    const json = JSON.stringify(entry.value);
    if (entry.expiresAt === null) {
      await this.#client.send('SET', name, json);
      return;
    }
    const ms = entry.expiresAt - this.#now();
    // Already expired: there is nothing to keep, and nothing to leave.
    if (ms <= 0) {
      await this.#client.send('DEL', name);
      return;
    }
    await this.#client.send('SET', name, json, 'PX', ms);
  }

  update(
    store: string,
    key: StoreKeyParts,
    change: StoreChange
  ): Promise<StoreEntry | undefined> {
    const name = this.key(store, key);
    return this.#updates.run(name, () => this.#update(store, name, change));
  }

  async #update(
    store: string,
    name: string,
    change: StoreChange
  ): Promise<StoreEntry | undefined> {
    const client = await this.#lend();
    try {
      for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt++) {
        await client.send('WATCH', name);
        const [value, pttl] = await Promise.all([
          client.send('GET', name),
          client.send('PTTL', name),
        ]);
        const current = this.#entry(value, pttl);
        let next: StoreEntry | undefined;
        try {
          next = change(current);
        } catch (error) {
          await client.send('UNWATCH');
          throw error;
        }
        if (next === undefined) {
          await client.send('UNWATCH');
          return current;
        }
        const ms =
          next.expiresAt === null ? null : next.expiresAt - this.#now();
        const write =
          ms === null
            ? ['SET', name, JSON.stringify(next.value)]
            : ms <= 0
              ? ['DEL', name]
              : ['SET', name, JSON.stringify(next.value), 'PX', ms];
        const [, , done] = await Promise.all([
          client.send('MULTI'),
          client.send(...write),
          client.send('EXEC'),
        ]);
        // `null`: someone wrote the key since WATCH, nothing was written.
        if (done !== null) return next;
      }
      throw new Error(tooBusy(store));
    } finally {
      this.#release(client);
    }
  }

  async clear(store: string, prefix: StoreKeyParts): Promise<number> {
    let count = 0;
    for (const keys of await this.#scan(store, prefix)) {
      if (keys.length === 0) continue;
      const removed = await this.#client.send(
        'DEL',
        ...keys.map(item => item.key)
      );
      if (typeof removed === 'number') count += removed;
    }
    return count;
  }

  async delete(store: string, key: StoreKeyParts): Promise<boolean> {
    return (await this.#client.send('DEL', this.key(store, key))) === 1;
  }

  async entries(
    store: string,
    prefix: StoreKeyParts
  ): Promise<StoreListedEntry[]> {
    const listed: StoreListedEntry[] = [];
    for (const batch of await this.#scan(store, prefix)) {
      if (batch.length === 0) continue;
      const [values, ...ttls] = await Promise.all([
        this.#client.send('MGET', ...batch.map(item => item.key)),
        ...batch.map(item => this.#client.send('PTTL', item.key)),
      ]);
      if (!Array.isArray(values)) continue;
      batch.forEach((item, index) => {
        const entry = this.#entry(values[index] ?? null, ttls[index] ?? -2);
        if (entry) listed.push({ key: item.parts, ...entry });
      });
    }
    return listed;
  }

  /**
   * The keys of `store` that start with `prefix`, part by part, in batches
   * of `scanCount`.
   */
  async #scan(
    store: string,
    prefix: StoreKeyParts
  ): Promise<{ key: string; parts: string[] }[][]> {
    // Every key of the store, or the ones whose text starts like the
    // prefix: `a:b*` also matches `a:bc`, so the parts are checked after.
    const pattern = `${this.key(store, prefix)}${prefix.length === 0 ? ':' : ''}*`;
    const keys: string[] = [];
    let cursor = '0';
    do {
      const reply = await this.#client.send(
        'SCAN',
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        this.#scanCount
      );
      if (!Array.isArray(reply) || reply.length !== 2) {
        throw new Error(`Redis answered SCAN with something unexpected.`);
      }
      cursor = String(reply[0]);
      for (const key of reply[1] as RedisReply[]) {
        if (typeof key === 'string') keys.push(key);
      }
    } while (cursor !== '0');
    const batches: { key: string; parts: string[] }[][] = [];
    // A key SCAN gave twice (it may, while keys are written) counts once.
    const unique = [...new Set(keys)];
    for (let at = 0; at < unique.length; at += this.#scanCount) {
      batches.push(
        unique
          .slice(at, at + this.#scanCount)
          .map(key => ({ key, parts: this.#parts(store, key) }))
          .filter(
            (item): item is { key: string; parts: string[] } =>
              item.parts !== null && startsWith(item.parts, prefix)
          )
      );
    }
    return batches;
  }

  async close(): Promise<void> {
    await Promise.all([
      this.#client.close(),
      ...this.#opened.map(client => client.close()),
    ]);
  }
}
