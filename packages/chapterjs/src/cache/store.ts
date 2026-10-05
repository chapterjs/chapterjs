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
  /** How many entries it keeps at most right now. */
  readonly limit: number;
  /**
   * Changes how many entries it keeps. Lowered, the entries written the
   * longest ago leave at once; returns how many did.
   */
  resize(limit: number): number;
  set(key: K, value: V): unknown;
  delete(key: K): boolean;
  clear(): void;
}

export interface CacheStoreOptions {
  /**
   * How many entries are kept at most: `0` keeps nothing, `Infinity` (the
   * default) keeps everything. When full, the entry that was written the
   * longest ago leaves: writing an entry again makes it the most recent.
   */
  limit?: number;
}

/** Creates the store of one kind of thing. A new backend is one of these. */
export type CacheStoreFactory = <K, V>(
  options?: CacheStoreOptions
) => CacheStore<K, V>;

function checkLimit(limit: number): number {
  if (Number.isNaN(limit) || limit < 0) {
    throw new RangeError(
      `A cache limit is 0 or more (or Infinity), got ${limit}.`
    );
  }
  return limit;
}

/** The default store: a `Map` in the memory of the process. */
export class MemoryStore<K, V> extends Map<K, V> implements CacheStore<K, V> {
  #limit: number;

  constructor({ limit = Infinity }: CacheStoreOptions = {}) {
    super();
    this.#limit = checkLimit(limit);
  }

  get limit(): number {
    return this.#limit;
  }

  resize(limit: number): number {
    this.#limit = checkLimit(limit);
    return trimStore(this, limit);
  }

  override set(key: K, value: V): this {
    if (this.#limit === 0) return this;
    if (this.#limit !== Infinity) {
      // A Map iterates in insertion order: written again, an entry goes to
      // the end, so the first key is always the one seen the longest ago.
      if (!super.delete(key) && this.size >= this.#limit) {
        for (const oldest of this.keys()) {
          this.delete(oldest);
          break;
        }
      }
    }
    return super.set(key, value);
  }
}

/**
 * Makes a store forget its oldest entries until `keep` are left. Returns
 * how many it forgot.
 */
export function trimStore<K>(
  store: CacheStore<K, unknown>,
  keep: number
): number {
  let extra = store.size - Math.max(0, keep);
  if (extra <= 0) return 0;
  const forgotten = extra;
  for (const key of [...store.keys()]) {
    if (extra-- <= 0) break;
    store.delete(key);
  }
  return forgotten;
}

export const memoryStore: CacheStoreFactory = options =>
  new MemoryStore(options);
