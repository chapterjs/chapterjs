// Where the scores of a ranking are kept, behind an interface like the data
// of a store. Any backend of stores keeps rankings with
// `StoreRankingBackend`, one entry per member (`[...scope, id]` → score):
// a file, the first process of a cluster, memory, with nothing to write.
// A backend with a native way to rank gives its own with `rankings()`
// (Redis: sorted sets), and is then used instead.

import type { StoreBackend, StoreKeyParts } from './backend.js';

/** Which end of a ranking comes first. */
export type RankingOrder = 'highest' | 'lowest';

/** A member of a ranking, and its score. */
export interface RankedScore {
  id: string;
  score: number;
}

/** What keeps the scores of every ranking. `scope` is the server, or nothing. */
export interface RankingBackend {
  /** Adds `by` to the score of `id` (from 0), in one go; the new score. */
  add(
    name: string,
    scope: StoreKeyParts,
    id: string,
    by: number
  ): Promise<number>;
  set(
    name: string,
    scope: StoreKeyParts,
    id: string,
    score: number
  ): Promise<void>;
  score(
    name: string,
    scope: StoreKeyParts,
    id: string
  ): Promise<number | undefined>;
  /** Where `id` is, from 0, in `order`; `undefined` when it has no score. */
  rank(
    name: string,
    scope: StoreKeyParts,
    id: string,
    order: RankingOrder
  ): Promise<number | undefined>;
  /** `count` members from position `start` (from 0), in `order`. */
  range(
    name: string,
    scope: StoreKeyParts,
    order: RankingOrder,
    start: number,
    count: number
  ): Promise<RankedScore[]>;
  remove(name: string, scope: StoreKeyParts, id: string): Promise<boolean>;
  size(name: string, scope: StoreKeyParts): Promise<number>;
  /** Forgets every score; how many there were. */
  clear(name: string, scope: StoreKeyParts): Promise<number>;
}

/**
 * The order of a ranking, ties included, as Redis sorts a sorted set: by
 * score, then by the bytes of the id (ZRANGE), both reversed for the
 * highest first (ZREVRANGE). Every backend ranks the same way.
 * https://redis.io/docs/latest/commands/zrange/
 */
export function compareRanked(
  order: RankingOrder
): (a: RankedScore, b: RankedScore) => number {
  const sign = order === 'highest' ? -1 : 1;
  return (a, b) =>
    a.score !== b.score
      ? sign * (a.score - b.score)
      : sign * Buffer.compare(Buffer.from(a.id), Buffer.from(b.id));
}

/** The rankings of a backend of stores: one entry per member. */
export class StoreRankingBackend implements RankingBackend {
  readonly #store: StoreBackend;

  constructor(store: StoreBackend) {
    this.#store = store;
  }

  async #all(
    name: string,
    scope: StoreKeyParts,
    order: RankingOrder
  ): Promise<RankedScore[]> {
    const entries = await this.#store.entries(name, scope);
    return entries
      .filter(
        entry =>
          entry.key.length === scope.length + 1 &&
          typeof entry.value === 'number'
      )
      .map(entry => ({
        id: entry.key[scope.length]!,
        score: entry.value as number,
      }))
      .sort(compareRanked(order));
  }

  async add(
    name: string,
    scope: StoreKeyParts,
    id: string,
    by: number
  ): Promise<number> {
    const kept = await this.#store.update(name, [...scope, id], current => ({
      value: (typeof current?.value === 'number' ? current.value : 0) + by,
      expiresAt: null,
    }));
    return kept!.value as number;
  }

  async set(
    name: string,
    scope: StoreKeyParts,
    id: string,
    score: number
  ): Promise<void> {
    await this.#store.set(name, [...scope, id], {
      value: score,
      expiresAt: null,
    });
  }

  async score(
    name: string,
    scope: StoreKeyParts,
    id: string
  ): Promise<number | undefined> {
    const entry = await this.#store.get(name, [...scope, id]);
    return typeof entry?.value === 'number' ? entry.value : undefined;
  }

  async rank(
    name: string,
    scope: StoreKeyParts,
    id: string,
    order: RankingOrder
  ): Promise<number | undefined> {
    const index = (await this.#all(name, scope, order)).findIndex(
      ranked => ranked.id === id
    );
    return index === -1 ? undefined : index;
  }

  async range(
    name: string,
    scope: StoreKeyParts,
    order: RankingOrder,
    start: number,
    count: number
  ): Promise<RankedScore[]> {
    return (await this.#all(name, scope, order)).slice(start, start + count);
  }

  remove(name: string, scope: StoreKeyParts, id: string): Promise<boolean> {
    return this.#store.delete(name, [...scope, id]);
  }

  async size(name: string, scope: StoreKeyParts): Promise<number> {
    return (await this.#all(name, scope, 'highest')).length;
  }

  clear(name: string, scope: StoreKeyParts): Promise<number> {
    return this.#store.clear(name, scope);
  }
}

const generic = new WeakMap<StoreBackend, RankingBackend>();

/** The rankings of a backend of stores: its own when it has one. */
export function rankingsOf(store: StoreBackend): RankingBackend {
  const own = store.rankings?.();
  if (own) return own;
  let found = generic.get(store);
  if (!found) {
    found = new StoreRankingBackend(store);
    generic.set(store, found);
  }
  return found;
}
