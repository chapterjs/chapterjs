// Where the data of the stores is kept, behind an interface: a file per
// store by default (`file-backend.ts`), Redis when a store asks for it
// (`redis-backend.ts`), the first process of a cluster for the others
// (`ipc-backend.ts`), and later anything else. A backend knows nothing of
// servers: the scope of a store is part of the key it gets. Each kind of
// storage a store may name has one backend per process.

/** Where a store keeps its data: what `storage` of its config names. */
export type StoreStorage = 'file' | 'redis';

export const STORAGES: readonly StoreStorage[] = ['file', 'redis'];

/** One value of a store, with when it expires. */
export interface StoreEntry {
  value: unknown;
  /** When the value expires, in ms since the epoch, or `null` for never. */
  expiresAt: number | null;
}

/** A key as the backend sees it: every part, the scope included. */
export type StoreKeyParts = readonly string[];

/** An entry with its key, as `entries()` lists them. */
export interface StoreListedEntry extends StoreEntry {
  key: StoreKeyParts;
}

import type { RankingBackend } from './ranking-backend.js';

/** What keeps the data of every store. Expired entries are never given. */
export interface StoreBackend {
  get(store: string, key: StoreKeyParts): Promise<StoreEntry | undefined>;
  set(store: string, key: StoreKeyParts, entry: StoreEntry): Promise<void>;
  delete(store: string, key: StoreKeyParts): Promise<boolean>;
  /** The entries whose key starts with `prefix`, in no particular order. */
  entries(store: string, prefix: StoreKeyParts): Promise<StoreListedEntry[]>;
  /**
   * Reads the entry at `key` and keeps what `change` returns, with nothing
   * written there by anyone in between: two updates never lose one
   * another, in one process or in several. `change` may run more than
   * once, when the entry changed meanwhile; `undefined` writes nothing.
   * Resolves with the entry kept.
   */
  update(
    store: string,
    key: StoreKeyParts,
    change: StoreChange
  ): Promise<StoreEntry | undefined>;
  /** Forgets every entry whose key starts with `prefix`; how many there were. */
  clear(store: string, prefix: StoreKeyParts): Promise<number>;
  /**
   * A native way to keep rankings, when the backend has one. Without it,
   * rankings are kept as entries of the backend (`StoreRankingBackend`).
   */
  rankings?(): RankingBackend;
  /** Writes what is pending, if anything. */
  close(): Promise<void>;
}

/** What `update()` makes of the current entry: the next one, or `undefined` for none. */
export type StoreChange = (
  current: StoreEntry | undefined
) => StoreEntry | undefined;

/**
 * Runs what is given for one key one after the other, in this process:
 * updates of one key here never compete with each other, only with the
 * other processes. Keys that are not busy cost nothing.
 */
export class KeyQueue {
  readonly #tails = new Map<string, Promise<unknown>>();

  // Chained with await, not .then: an error keeps the line of the file
  // that asked (see Interaction).
  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const before = this.#tails.get(id);
    let done!: () => void;
    const tail = new Promise<void>(resolve => (done = resolve));
    this.#tails.set(id, tail);
    try {
      if (before) await before;
      return await fn();
    } finally {
      done();
      if (this.#tails.get(id) === tail) this.#tails.delete(id);
    }
  }
}

/** The map key of a key: unambiguous whatever the parts hold. */
export const encodeKey = (key: StoreKeyParts): string => JSON.stringify(key);

export const decodeKey = (encoded: string): string[] =>
  JSON.parse(encoded) as string[];

/** Whether `key` starts with every part of `prefix`. */
export function startsWith(key: StoreKeyParts, prefix: StoreKeyParts): boolean {
  if (prefix.length > key.length) return false;
  return prefix.every((part, index) => key[index] === part);
}

/** Whether an entry is still good at `now`. */
export const alive = (entry: StoreEntry, now = Date.now()): boolean =>
  entry.expiresAt === null || entry.expiresAt > now;

const current = new Map<StoreStorage, StoreBackend>();

/**
 * Gives every store of one storage its backend: called by the CLI, once
 * per process and per storage the project has a backend for; `null`
 * takes it away.
 */
export function setStoreBackend(
  storage: StoreStorage,
  backend: StoreBackend | null
): void {
  if (backend) current.set(storage, backend);
  else current.delete(storage);
}

/** The backends of the process, by storage. */
export const storeBackends = (): ReadonlyMap<StoreStorage, StoreBackend> =>
  current;

/** A store of a storage the process has no backend for: nothing to fix in the file. */
export class NowhereToKeepError extends TypeError {
  override name = 'NowhereToKeepError';
}

/** Why a store of `storage` can't be used: the process has no backend for it. */
export function nowhereToKeep(
  storage: StoreStorage,
  name: string,
  what = 'store'
): string {
  if (storage === 'redis') {
    return `${name} is kept in Redis (storage: 'redis'), but REDIS_URL is not set: add it to .env (like redis://localhost:6379) and start again, or remove storage: 'redis' to keep its ${what === 'store' ? 'data' : 'scores'} in data/.`;
  }
  return `Nothing keeps the data of ${name} (storage: '${storage}').`;
}

/**
 * The backend of a storage, or an error that says when stores work: for
 * Redis, that the project gave no address.
 */
export function storeBackend(
  storage: StoreStorage,
  name = 'This store'
): StoreBackend {
  const backend = current.get(storage);
  if (backend) return backend;
  if (current.size === 0) {
    throw new Error(
      'Stores only work while the bot runs: use a store in the functions of your files (run), not when a file loads.'
    );
  }
  throw new NowhereToKeepError(nowhereToKeep(storage, name));
}
