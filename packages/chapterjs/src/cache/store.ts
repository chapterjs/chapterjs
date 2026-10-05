/**
 * Where one kind of thing is remembered (the roles of a server, the
 * messages of a channel...). Reading is a plain `ReadonlyMap`, which is what
 * users get; only the framework writes.
 *
 * Stores are synchronous on purpose: they are read on every event, in the
 * process that received it. Sharing data between processes is the job of
 * the layer that coordinates processes, not of the cache.
 */
export interface CacheStore<K, V> extends ReadonlyMap<K, V> {
  set(key: K, value: V): unknown;
  delete(key: K): boolean;
  clear(): void;
}

export interface CacheStoreOptions {
  /**
   * How many entries are kept at most: `0` keeps nothing, `Infinity` (the
   * default) keeps everything. When full, the oldest entry leaves.
   */
  limit?: number;
}

/** Creates the store of one kind of thing. A new backend is one of these. */
export type CacheStoreFactory = <K, V>(
  options?: CacheStoreOptions
) => CacheStore<K, V>;

/** The default store: a `Map` in the memory of the process. */
export class MemoryStore<K, V> extends Map<K, V> implements CacheStore<K, V> {
  readonly #limit: number;

  constructor({ limit = Infinity }: CacheStoreOptions = {}) {
    super();
    if (Number.isNaN(limit) || limit < 0) {
      throw new RangeError(
        `A cache limit is 0 or more (or Infinity), got ${limit}.`
      );
    }
    this.#limit = limit;
  }

  override set(key: K, value: V): this {
    if (this.#limit === 0) return this;
    if (this.size >= this.#limit && !this.has(key)) {
      // A Map iterates in insertion order: the first key is the oldest.
      for (const oldest of this.keys()) {
        this.delete(oldest);
        break;
      }
    }
    return super.set(key, value);
  }
}

export const memoryStore: CacheStoreFactory = options =>
  new MemoryStore(options);
