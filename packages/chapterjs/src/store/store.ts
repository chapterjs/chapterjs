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
} from './backend.js';
import { currentGuildId } from './scope.js';

/** Where the data of a store is kept apart: per server, or one for the whole bot. */
export type StoreScope = 'guild' | 'global';

/** What a file gives to `store()`. */
export interface StoreConfig {
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
   * Reads the value at `key` and keeps what `change` returns, in one go.
   * `change` receives `undefined` when there is no value yet. The
   * expiration stays what it was, unless `options` say otherwise.
   */
  update(
    key: StoreKey,
    change: (current: T | undefined) => T,
    options?: StoreSetOptions
  ): Promise<T>;
  /** Forgets the value at `key`. `true` when there was one. */
  delete(key: StoreKey): Promise<boolean>;
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
  bound: { name: string; scope: StoreScope; expires: number | null }
): void {
  const state = storeStateOf(declared);
  if (!state) throw new TypeError('Not a store.');
  state.name = bound.name;
  state.scope = bound.scope;
  state.expires = bound.expires;
}

const parts = (key: StoreKey): string[] => {
  const list = typeof key === 'string' ? [key] : [...key];
  if (list.length === 0) {
    throw new TypeError(
      'A key of a store is a text, or a list of texts with at least one.'
    );
  }
  for (const part of list) {
    if (typeof part !== 'string') {
      throw new TypeError(
        `A key of a store is made of texts, got ${JSON.stringify(part) ?? typeof part}. Write an id as a text: member.id, not a number.`
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
    const backend = storeBackend();
    if (state.scope === 'global') {
      return { backend, name: state.name, prefix: [] };
    }
    const guildId = guildOf();
    if (!guildId) {
      throw new Error(
        `${state.name} is a store per server, and this code does not run in one: use ${state.name}.in(guild) to say which server, or declare the store with scope: 'global'.`
      );
    }
    return { backend, name: state.name, prefix: [guildId] };
  };
  const full = (prefix: string[], key: StoreKey): StoreKeyParts => [
    ...prefix,
    ...parts(key),
  ];
  const set = async (
    key: StoreKey,
    value: T,
    options: StoreSetOptions | undefined,
    keep: number | null | undefined
  ): Promise<void> => {
    const { backend, name, prefix } = ready();
    checkJson(value);
    const now = Date.now();
    const at =
      keep !== undefined && (!options || options.expires === undefined)
        ? keep
        : expiresAt(options, state.expires, now);
    await backend.set(name, full(prefix, key), { value, expiresAt: at });
  };
  return {
    async get(key) {
      const { backend, name, prefix } = ready();
      const entry = await backend.get(name, full(prefix, key));
      return entry?.value as T | undefined;
    },
    set: (key, value, options) => set(key, value, options, undefined),
    async update(key, change, options) {
      const { backend, name, prefix } = ready();
      const entry = await backend.get(name, full(prefix, key));
      const next = change(entry?.value as T | undefined);
      await set(key, next, options, entry ? entry.expiresAt : undefined);
      return next;
    },
    async delete(key) {
      const { backend, name, prefix } = ready();
      return backend.delete(name, full(prefix, key));
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
 * name of the export is the name of the store, and its file in `data/`.
 * Per server unless `scope: 'global'` is given, with an expiration if
 * `expires` is.
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
  const state: StoreState = { config, scope: 'guild', expires: null };
  const guildIdOf = (guild: Guild | string): string => {
    const id = typeof guild === 'string' ? guild : guild?.id;
    if (typeof id !== 'string' || id === '') {
      throw new TypeError(
        'in() takes a server (a Guild) or its id, like warnings.in(guild) or warnings.in(guild.id).'
      );
    }
    return id;
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
