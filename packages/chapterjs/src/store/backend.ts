// Where the data of the stores is kept, behind an interface: a file per
// store by default (`file-backend.ts`), the first process of a cluster for
// the others (`ipc-backend.ts`), and later anything else. A backend knows
// nothing of servers: the scope of a store is part of the key it gets.

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

/** What keeps the data of every store. Expired entries are never given. */
export interface StoreBackend {
  get(store: string, key: StoreKeyParts): Promise<StoreEntry | undefined>;
  set(store: string, key: StoreKeyParts, entry: StoreEntry): Promise<void>;
  delete(store: string, key: StoreKeyParts): Promise<boolean>;
  /** The entries whose key starts with `prefix`, in no particular order. */
  entries(store: string, prefix: StoreKeyParts): Promise<StoreListedEntry[]>;
  /** Writes what is pending, if anything. */
  close(): Promise<void>;
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

let current: StoreBackend | null = null;

/** Gives every store its backend: called by the CLI, once per process. */
export function setStoreBackend(backend: StoreBackend | null): void {
  current = backend;
}

/** The backend of the process, or an error that says when stores work. */
export function storeBackend(): StoreBackend {
  if (!current) {
    throw new Error(
      'Stores only work while the bot runs: use a store in the functions of your files (run), not when a file loads.'
    );
  }
  return current;
}
