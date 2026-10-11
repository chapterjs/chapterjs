// A backend that keeps the data of the stores in memory and nowhere else:
// what `chapterjs test` gives a bot under test, so a test never touches
// the `data/` folder of the project and starts from nothing every time.

import {
  alive,
  decodeKey,
  encodeKey,
  startsWith,
  type StoreBackend,
  type StoreEntry,
  type StoreKeyParts,
  type StoreListedEntry,
} from './backend.js';

/** The data of every store, in memory, forgotten with the process. */
export class MemoryStoreBackend implements StoreBackend {
  readonly #stores = new Map<string, Map<string, StoreEntry>>();
  readonly #now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
  }

  #store(name: string): Map<string, StoreEntry> {
    let store = this.#stores.get(name);
    if (!store) {
      store = new Map();
      this.#stores.set(name, store);
    }
    return store;
  }

  async get(
    store: string,
    key: StoreKeyParts
  ): Promise<StoreEntry | undefined> {
    const entry = this.#store(store).get(encodeKey(key));
    if (!entry) return undefined;
    if (!alive(entry, this.#now())) {
      this.#store(store).delete(encodeKey(key));
      return undefined;
    }
    return entry;
  }

  async set(
    store: string,
    key: StoreKeyParts,
    entry: StoreEntry
  ): Promise<void> {
    this.#store(store).set(encodeKey(key), entry);
  }

  async delete(store: string, key: StoreKeyParts): Promise<boolean> {
    return this.#store(store).delete(encodeKey(key));
  }

  async entries(
    store: string,
    prefix: StoreKeyParts
  ): Promise<StoreListedEntry[]> {
    const now = this.#now();
    const result: StoreListedEntry[] = [];
    for (const [encoded, entry] of this.#store(store)) {
      const key = decodeKey(encoded);
      if (!startsWith(key, prefix)) continue;
      if (!alive(entry, now)) {
        this.#store(store).delete(encoded);
        continue;
      }
      result.push({ key, ...entry });
    }
    return result;
  }

  /** Forgets everything: what a test does with its stores stays in it. */
  clear(): void {
    this.#stores.clear();
  }

  async close(): Promise<void> {}
}
