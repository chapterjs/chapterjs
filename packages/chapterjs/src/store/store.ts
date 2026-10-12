// What a file declares with `store()`: a place to keep data from one
// restart to the next, per server by default, typed by what it holds,
// with an expiration if wanted. Named by its export, like a button:
// `export const warnings = store<Warning[]>()` is the store `warnings`.
// What `store()` returns works once the loader bound it to that name and
// the bot runs; the data itself lives in a backend (`backend.ts`).

import type { Duration } from '../commands/command.js';
import type { Guild } from '../structures/guild.js';
import { parseDuration } from '../util/duration.js';
import {
  storeBackend,
  type StoreBackend,
  type StoreKeyParts,
  type StoreStorage,
} from './backend.js';
import { currentGuildId, guildIdOf, scopeParts } from './scope.js';

/** Where the data of a store is kept apart: per server, or one for the whole bot. */
export type StoreScope = 'guild' | 'global';

export type { StoreStorage };

/** What a file gives to `store()`. */
export interface StoreConfig {
  /**
   * Where the data is kept: `'file'` (the default), a file in the `data/`
   * folder of the project, or `'redis'`, the Redis of `REDIS_URL` in
   * `.env`. Only stores that say `'redis'` write anything there.
   */
  storage?: StoreStorage;
  /**
   * `'guild'` (the default): the data is kept per server, and a function
   * that runs in a server reads and writes the data of that server, with
   * nothing to say. `'global'`: one set of data for the whole bot.
   */
  scope?: StoreScope;
  /**
   * How long a value is kept, unless `set()` says otherwise: a number and
   * a unit, `s`, `m`, `h` or `d`, like `'10m'`, `'1d'` or `'1h30m'`. Kept
   * forever by default.
   */
  expires?: Duration;
}

/**
 * A key of a store: a text, or a list of texts for a key made of several
 * parts (`[channel.id, message.id]`), which `entries()` can then list by
 * prefix.
 */
export type StoreKey = string | readonly string[];

/** What `set()` and `update()` take besides the value. */
export interface StoreSetOptions {
  /**
   * How long the value is kept: a duration like `'10m'`, a `Date`, or
   * `null` to keep it forever. The `expires` of the store by default.
   */
  expires?: Duration | Date | null;
}

/** One entry of a store, as `entries()` lists them. */
export interface StoreEntry<T> {
  /** The key, every part of it (the server left out for a store per server). */
  key: readonly string[];
  value: T;
  /** When the value expires, or `null` when it is kept forever. */
  expires: Date | null;
}

/** A store, read and written for one server or for the whole bot. */
export interface ScopedStore<T> {
  /** The value at `key`, or `undefined` when there is none, or it expired. */
  get(key: StoreKey): Promise<T | undefined>;
  /** Keeps `value` at `key`. The value must be JSON: no `Date`, `Map` or class instance. */
  set(key: StoreKey, value: T, options?: StoreSetOptions): Promise<void>;
  /**
   * Reads the value at `key` and keeps what `change` returns, in one go:
   * nothing written meanwhile is lost, even by another process. `change`
   * receives `undefined` when there is no value yet, and may run again
   * when the value changed in between: keep it a plain computation. The
   * expiration stays what it was, unless `options` say otherwise.
   */
  update(
    key: StoreKey,
    change: (current: T | undefined) => T,
    options?: StoreSetOptions
  ): Promise<T>;
  /**
   * Adds `by` (1 by default, negative to take away) to the number at
   * `key`, starting from 0, in one go like `update()`, and resolves with
   * the new number. Only for a store of numbers.
   */
  increment(
    this: ScopedStore<number>,
    key: StoreKey,
    by?: number,
    options?: StoreSetOptions
  ): Promise<number>;
  /** Forgets the value at `key`. `true` when there was one. */
  delete(key: StoreKey): Promise<boolean>;
  /**
   * The values at several keys at once, in their order: `undefined` for a
   * key that has none.
   */
  getMany(keys: readonly StoreKey[]): Promise<(T | undefined)[]>;
  /**
   * Keeps several values at once, each with the same `options`. Every
   * value is checked before anything is written.
   */
  setMany(
    values: readonly (readonly [key: StoreKey, value: T])[],
    options?: StoreSetOptions
  ): Promise<void>;
  /**
   * Forgets every value whose key starts with `prefix`, or every value of
   * the store (of the server, for a store per server) without one.
   * Resolves with how many there were.
   */
  deleteAll(prefix?: StoreKey): Promise<number>;
  /**
   * Every entry, or the ones whose key starts with `prefix`, in no
   * particular order. Expired ones are left out.
   */
  entries(prefix?: StoreKey): Promise<StoreEntry<T>[]>;
  /**
   * How long the value at `key` is still kept, in milliseconds: `null`
   * when it is kept forever, `undefined` when there is no value.
   */
  ttl(key: StoreKey): Promise<number | null | undefined>;
}

/** What `store()` returns: a declaration the framework finds in the exports of a file. */
export interface Store<T> extends ScopedStore<T> {
  /**
   * The same store, for one server: what a task, or a function that runs
   * outside a server, uses to read and write the data of that server.
   */
  in(guild: Guild | string): ScopedStore<T>;
}

/** A store as the loader knows it: its config, and once loaded, its name. */
export interface StoreState {
  readonly config: unknown;
  /** The name of the export that declares it, once bound by the loader. */
  name?: string;
  /** What `read` found in the config. */
  scope: StoreScope;
  storage: StoreStorage;
  /** The default expiration, in ms, or `null` for never. */
  expires: number | null;
}

const STATE = Symbol.for('chapterjs.store');

/** The state of a declared store, if the value is one. */
export function storeStateOf(value: unknown): StoreState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<symbol, StoreState | undefined>)[STATE];
}

export const isStoreDeclaration = (value: unknown): boolean =>
  storeStateOf(value) !== undefined;

/** Binds a declared store to the name of its export. */
export function bindStore(
  declared: unknown,
  bound: {
    name: string;
    scope: StoreScope;
    storage: StoreStorage;
    expires: number | null;
  }
): void {
  const state = storeStateOf(declared);
  if (!state) throw new TypeError('Not a store.');
  state.name = bound.name;
  state.scope = bound.scope;
  state.storage = bound.storage;
  state.expires = bound.expires;
}

const parts = (key: StoreKey): string[] => {
  const list = typeof key === 'string' ? [key] : [...key];
  if (list.length === 0) {
    throw new TypeError(
      'A key of a store is a text that is not empty, or a list of such texts with at least one.'
    );
  }
  for (const part of list) {
    if (typeof part !== 'string') {
      throw new TypeError(
        `A key of a store is made of texts, got ${JSON.stringify(part) ?? typeof part}. Write an id as a text: member.id, not a number.`
      );
    }
    if (part === '') {
      throw new TypeError(
        'A key of a store is a text that is not empty, or a list of such texts with at least one.'
      );
    }
  }
  return list;
};

/**
 * Refuses what would not survive a trip through JSON: a `Date` would come
 * back as a text, a `Map` as `{}`, a class instance as a plain object.
 */
export function checkJson(value: unknown, path = 'the value'): void {
  if (value === undefined) {
    throw new TypeError(
      `${path} is undefined: a store keeps JSON. To forget a value, use delete().`
    );
  }
  if (value === null) return;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `${path} is ${value}, which JSON can't hold: a store keeps JSON.`
        );
      }
      return;
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new TypeError(
        `${path} is a ${typeof value}, which JSON can't hold: a store keeps JSON (texts, numbers, booleans, lists and plain objects).`
      );
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkJson(item, `${path}[${index}]`));
    return;
  }
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== null && proto !== Object.prototype) {
    const name =
      (value as { constructor?: { name?: string } }).constructor?.name ??
      'an object of a class';
    throw new TypeError(
      `${path} is a ${name}, which JSON can't hold: a store keeps JSON (texts, numbers, booleans, lists and plain objects). Keep what you need of it: an id, a text, a number.`
    );
  }
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) checkJson(item, `${path}.${key}`);
  }
}

/** When a value set now expires, from what was asked. */
function expiresAt(
  options: StoreSetOptions | undefined,
  fallback: number | null,
  now: number
): number | null {
  if (!options || options.expires === undefined) {
    return fallback === null ? null : now + fallback;
  }
  const { expires } = options;
  if (expires === null) return null;
  if (expires instanceof Date) {
    const ms = expires.getTime();
    if (!Number.isFinite(ms)) {
      throw new TypeError('"expires" is a Date that is not a valid date.');
    }
    return ms;
  }
  const ms = typeof expires === 'string' ? parseDuration(expires) : null;
  if (ms === null || ms < 1000) {
    throw new TypeError(
      `"expires" is a duration (a number and a unit: s, m, h or d, like '10m' or '1d', 1 s at least), a Date, or null to keep the value forever. Got ${JSON.stringify(expires)}.`
    );
  }
  return now + ms;
}

/** The store as its functions see it: the backend, the name, the scope prefix. */
function scoped<T>(
  state: StoreState,
  guildOf: () => string | null
): ScopedStore<T> {
  const ready = (): {
    backend: StoreBackend;
    name: string;
    prefix: string[];
  } => {
    if (!state.name) {
      throw new Error(
        'This store was not loaded by ChapterJS: a store is exported from a file of src/ (export const name = store()), and used once the bot started.'
      );
    }
    const backend = storeBackend(state.storage, state.name);
    return {
      backend,
      name: state.name,
      prefix: scopeParts('store', state.name, state.scope, guildOf),
    };
  };
  const full = (prefix: string[], key: StoreKey): StoreKeyParts => [
    ...prefix,
    ...parts(key),
  ];
  const set = async (
    key: StoreKey,
    value: T,
    options: StoreSetOptions | undefined
  ): Promise<void> => {
    const { backend, name, prefix } = ready();
    checkJson(value);
    const at = expiresAt(options, state.expires, Date.now());
    await backend.set(name, full(prefix, key), { value, expiresAt: at });
  };
  const update = async <V extends T>(
    key: StoreKey,
    change: (current: T | undefined) => V,
    options: StoreSetOptions | undefined
  ): Promise<V> => {
    const { backend, name, prefix } = ready();
    let kept!: V;
    // Read and kept by the backend with nothing written in between; run
    // again when the value changed meanwhile.
    await backend.update(name, full(prefix, key), current => {
      const value = change(current?.value as T | undefined);
      checkJson(value);
      kept = value;
      return {
        value,
        expiresAt:
          current && (!options || options.expires === undefined)
            ? current.expiresAt
            : expiresAt(options, state.expires, Date.now()),
      };
    });
    return kept;
  };
  return {
    async get(key) {
      const { backend, name, prefix } = ready();
      const entry = await backend.get(name, full(prefix, key));
      return entry?.value as T | undefined;
    },
    set: (key, value, options) => set(key, value, options),
    update: (key, change, options) => update(key, change, options),
    increment(key, by = 1, options) {
      if (typeof by !== 'number' || !Number.isFinite(by)) {
        return Promise.reject(
          new TypeError(
            `increment() adds a number, got ${JSON.stringify(by) ?? typeof by}.`
          )
        );
      }
      return update(
        key,
        current => {
          if (current !== undefined && typeof current !== 'number') {
            throw new TypeError(
              `increment() adds to a number, and the value at ${JSON.stringify(parts(key))} is ${Array.isArray(current) ? 'a list' : current === null ? 'null' : `a ${typeof current}`}: use update() to change it.`
            );
          }
          return (((current as number | undefined) ?? 0) + by) as T;
        },
        options
      ) as Promise<unknown> as Promise<number>;
    },
    async delete(key) {
      const { backend, name, prefix } = ready();
      return backend.delete(name, full(prefix, key));
    },
    async getMany(keys) {
      const { backend, name, prefix } = ready();
      if (!Array.isArray(keys)) {
        throw new TypeError(
          'getMany() takes a list of keys, like warnings.getMany([a.id, b.id]).'
        );
      }
      // Every key checked before anything is asked.
      const all = keys.map(key => full(prefix, key));
      const entries = await Promise.all(all.map(key => backend.get(name, key)));
      return entries.map(entry => entry?.value as T | undefined);
    },
    async setMany(values, options) {
      const { backend, name, prefix } = ready();
      if (!Array.isArray(values)) {
        throw new TypeError(
          "setMany() takes a list of [key, value] pairs, like scores.setMany([['a', 1], ['b', 2]])."
        );
      }
      const now = Date.now();
      const at = expiresAt(options, state.expires, now);
      const checked = values.map((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2) {
          throw new TypeError(
            `setMany() takes a list of [key, value] pairs, and item ${index} is not one.`
          );
        }
        const [key, value] = pair as unknown as readonly [StoreKey, T];
        checkJson(value, `the value of item ${index}`);
        return { key: full(prefix, key), value };
      });
      await Promise.all(
        checked.map(({ key, value }) =>
          backend.set(name, key, { value, expiresAt: at })
        )
      );
    },
    async deleteAll(prefixKey) {
      const { backend, name, prefix } = ready();
      return backend.clear(
        name,
        prefixKey === undefined ? prefix : full(prefix, prefixKey)
      );
    },
    async entries(prefixKey) {
      const { backend, name, prefix } = ready();
      const listed = await backend.entries(
        name,
        prefixKey === undefined ? prefix : full(prefix, prefixKey)
      );
      return listed.map(entry => ({
        key: entry.key.slice(prefix.length),
        value: entry.value as T,
        expires: entry.expiresAt === null ? null : new Date(entry.expiresAt),
      }));
    },
    async ttl(key) {
      const { backend, name, prefix } = ready();
      const entry = await backend.get(name, full(prefix, key));
      if (!entry) return undefined;
      return entry.expiresAt === null
        ? null
        : Math.max(0, entry.expiresAt - Date.now());
    },
  };
}

/**
 * Declares a store: data the bot keeps from one restart to the next,
 * typed by what it holds. Export the result from any file of `src/`: the
 * name of the export is the name of the store, and its file in `data/`
 * (or its keys in Redis, with `storage: 'redis'`). Per server unless
 * `scope: 'global'` is given, with an expiration if `expires` is.
 *
 * ```ts
 * import { store } from 'chapterjs';
 *
 * export const warnings = store<Warning[]>({ expires: '30d' });
 *
 * // In a command, in a server:
 * await warnings.update(member.id, (list = []) => [...list, warning]);
 * ```
 */
export function store<T>(config: StoreConfig = {}): Store<T> {
  const state: StoreState = {
    config,
    scope: 'guild',
    storage: 'file',
    expires: null,
  };
  const declared: Store<T> = {
    ...scoped<T>(state, () => currentGuildId() ?? null),
    in: guild => {
      const id = guildIdOf(guild);
      return scoped<T>(state, () => id);
    },
  };
  Object.defineProperty(declared, STATE, { value: state });
  return declared;
}
