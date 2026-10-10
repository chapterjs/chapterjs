// The default backend: one JSON file per store in the `data/` folder of
// the project, kept in memory and written back shortly after each change,
// atomically (a temporary file, then a rename), so a crash never leaves a
// half-written file. What is pending when the process exits is written
// then. Expired entries are dropped when a file is read, when they are
// asked for, and by a sweep every minute, so a file never grows forever.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/** The folder of a project where the stores keep their files. */
export const DATA_FOLDER = 'data';

/** How a file looks: the version of the format, then the entries. */
interface StoreFile {
  version: 1;
  entries: [key: string[], value: unknown, expiresAt: number | null][];
}

/** A name a file can be called: what an export is called. */
const FILE_NAME = /^[\w.-]+$/;

export interface FileStoreBackendOptions {
  /** How long a change waits for others before the file is written. */
  writeDelay?: number;
  /** How often expired entries are dropped. */
  sweepEvery?: number;
  now?: () => number;
}

/** The data of every store, one file each, loaded on first use. */
export class FileStoreBackend implements StoreBackend {
  readonly #dir: string;
  readonly #stores = new Map<string, Map<string, StoreEntry>>();
  readonly #dirty = new Set<string>();
  readonly #now: () => number;
  readonly #writeDelay: number;
  #writeTimer: NodeJS.Timeout | null = null;
  readonly #sweeper: NodeJS.Timeout;
  readonly #onExit: () => void;

  constructor(dir: string, options: FileStoreBackendOptions = {}) {
    this.#dir = dir;
    this.#now = options.now ?? Date.now;
    this.#writeDelay = options.writeDelay ?? 100;
    this.#sweeper = setInterval(
      () => this.#sweep(),
      options.sweepEvery ?? 60_000
    );
    this.#sweeper.unref();
    // What was changed in the last moments is not lost with the process.
    this.#onExit = () => this.#flush();
    process.on('exit', this.#onExit);
  }

  /** The file of a store. */
  file(store: string): string {
    return join(this.#dir, `${store}.json`);
  }

  #load(store: string): Map<string, StoreEntry> {
    let entries = this.#stores.get(store);
    if (entries) return entries;
    if (!FILE_NAME.test(store)) {
      throw new TypeError(
        `"${store}" can't name a store: its name is the name of its export, made of letters, digits, _ . and -.`
      );
    }
    entries = new Map();
    let text: string | null = null;
    try {
      text = readFileSync(this.file(store), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (text !== null) {
      let parsed: StoreFile;
      try {
        parsed = JSON.parse(text) as StoreFile;
        if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
          throw new Error('not a store file');
        }
      } catch {
        throw new Error(
          `${this.file(store)} is not a file ChapterJS wrote: fix it, or delete it to start the store empty.`
        );
      }
      const now = this.#now();
      for (const [key, value, expiresAt] of parsed.entries) {
        const entry = { value, expiresAt };
        if (alive(entry, now)) entries.set(encodeKey(key), entry);
      }
    }
    this.#stores.set(store, entries);
    return entries;
  }

  #changed(store: string): void {
    this.#dirty.add(store);
    if (this.#writeTimer) return;
    this.#writeTimer = setTimeout(() => this.#flush(), this.#writeDelay);
    this.#writeTimer.unref();
  }

  /** Writes every store that changed. */
  #flush(): void {
    if (this.#writeTimer) {
      clearTimeout(this.#writeTimer);
      this.#writeTimer = null;
    }
    if (this.#dirty.size === 0) return;
    mkdirSync(this.#dir, { recursive: true });
    for (const store of this.#dirty) {
      const entries = this.#stores.get(store);
      if (!entries) continue;
      const file: StoreFile = {
        version: 1,
        entries: [...entries].map(([key, { value, expiresAt }]) => [
          decodeKey(key),
          value,
          expiresAt,
        ]),
      };
      const path = this.file(store);
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify(file)}\n`);
      renameSync(temporary, path);
    }
    this.#dirty.clear();
  }

  #sweep(): void {
    const now = this.#now();
    for (const [store, entries] of this.#stores) {
      let dropped = false;
      for (const [key, entry] of entries) {
        if (!alive(entry, now)) {
          entries.delete(key);
          dropped = true;
        }
      }
      if (dropped) this.#changed(store);
    }
  }

  async get(
    store: string,
    key: StoreKeyParts
  ): Promise<StoreEntry | undefined> {
    const entries = this.#load(store);
    const encoded = encodeKey(key);
    const entry = entries.get(encoded);
    if (!entry) return undefined;
    if (alive(entry, this.#now())) return entry;
    entries.delete(encoded);
    this.#changed(store);
    return undefined;
  }

  async set(
    store: string,
    key: StoreKeyParts,
    entry: StoreEntry
  ): Promise<void> {
    this.#load(store).set(encodeKey(key), entry);
    this.#changed(store);
  }

  async delete(store: string, key: StoreKeyParts): Promise<boolean> {
    const entries = this.#load(store);
    const encoded = encodeKey(key);
    const entry = entries.get(encoded);
    if (!entry) return false;
    entries.delete(encoded);
    this.#changed(store);
    return alive(entry, this.#now());
  }

  async entries(
    store: string,
    prefix: StoreKeyParts
  ): Promise<StoreListedEntry[]> {
    const entries = this.#load(store);
    const now = this.#now();
    const listed: StoreListedEntry[] = [];
    for (const [encoded, entry] of entries) {
      const key = decodeKey(encoded);
      if (!startsWith(key, prefix)) continue;
      if (alive(entry, now)) listed.push({ key, ...entry });
      else {
        entries.delete(encoded);
        this.#changed(store);
      }
    }
    return listed;
  }

  async close(): Promise<void> {
    clearInterval(this.#sweeper);
    process.off('exit', this.#onExit);
    this.#flush();
  }
}
