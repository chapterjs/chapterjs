// What a file declares with `ranking()`: scores per member, kept in order,
// per server by default, from one restart to the next. Named by its
// export, like a store: `export const xp = ranking()` is the ranking `xp`.
// Its scores live where its `storage` says, through the rankings of that
// backend (`store/ranking-backend.ts`): sorted sets in Redis, entries of
// the store backend anywhere else.

import type { Guild } from '../structures/guild.js';
import { storeBackend, type StoreStorage } from '../store/backend.js';
import {
  rankingsOf,
  type RankingBackend,
  type RankingOrder,
} from '../store/ranking-backend.js';
import { currentGuildId, guildIdOf, scopeParts } from '../store/scope.js';
import type { StoreScope } from '../store/store.js';

export type { RankingOrder };

/** What a file gives to `ranking()`. */
export interface RankingConfig {
  /**
   * `'guild'` (the default): a ranking per server, and a function that
   * runs in a server reads and writes the ranking of that server, with
   * nothing to say. `'global'`: one ranking for the whole bot.
   */
  scope?: StoreScope;
  /**
   * Where the scores are kept: `'file'` (the default), a file in the
   * `data/` folder of the project, or `'redis'`, the Redis of `REDIS_URL`
   * in `.env`, where a ranking is a sorted set.
   */
  storage?: StoreStorage;
  /**
   * Which end comes first: `'highest'` (the default), the highest score
   * first, or `'lowest'`, the lowest first (a time, a number of tries).
   */
  order?: RankingOrder;
}

/** A member of a ranking, as `top()` lists them. */
export interface RankingEntry {
  /** The id given to `add()` or `set()`: a member, or anything else. */
  id: string;
  score: number;
  /** Where it is, from 1. Equal scores are ordered by id. */
  rank: number;
}

/** A ranking, for one server or for the whole bot. */
export interface ScopedRanking {
  /**
   * Adds `points` (negative to take away) to the score of `id`, starting
   * from 0, in one go: nothing added meanwhile is lost, even by another
   * process. Resolves with the new score.
   */
  add(id: string, points: number): Promise<number>;
  /** Sets the score of `id`, whatever it was. */
  set(id: string, score: number): Promise<void>;
  /** The score of `id`, or `undefined` when it has none. */
  score(id: string): Promise<number | undefined>;
  /** Where `id` is, from 1, or `undefined` when it has no score. */
  rankOf(id: string): Promise<number | undefined>;
  /**
   * The first `count` (10 by default) members, after skipping `skip` (0
   * by default): `top(10, 10)` is the second page.
   */
  top(count?: number, skip?: number): Promise<RankingEntry[]>;
  /** Forgets the score of `id`. `true` when it had one. */
  remove(id: string): Promise<boolean>;
  /** How many members have a score. */
  size(): Promise<number>;
  /** Forgets every score. Resolves with how many there were. */
  clear(): Promise<number>;
}

/** What `ranking()` returns: a declaration the framework finds in the exports of a file. */
export interface Ranking extends ScopedRanking {
  /**
   * The same ranking, for one server: what a task, or a function that
   * runs outside a server, uses to read and write the ranking of that
   * server.
   */
  in(guild: Guild | string): ScopedRanking;
}

/** A ranking as the loader knows it: its config, and once loaded, its name. */
export interface RankingState {
  readonly config: unknown;
  name?: string;
  scope: StoreScope;
  storage: StoreStorage;
  order: RankingOrder;
}

const STATE = Symbol.for('chapterjs.ranking');

export function rankingStateOf(value: unknown): RankingState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<symbol, RankingState | undefined>)[STATE];
}

export const isRankingDeclaration = (value: unknown): boolean =>
  rankingStateOf(value) !== undefined;

/** Binds a declared ranking to the name of its export. */
export function bindRanking(
  declared: unknown,
  bound: {
    name: string;
    scope: StoreScope;
    storage: StoreStorage;
    order: RankingOrder;
  }
): void {
  const state = rankingStateOf(declared);
  if (!state) throw new TypeError('Not a ranking.');
  Object.assign(state, bound);
}

const checkId = (id: unknown): string => {
  if (typeof id !== 'string' || id === '') {
    throw new TypeError(
      `The id of a member of a ranking is a text that is not empty, got ${JSON.stringify(id) ?? typeof id}. Write an id as a text: member.id, not a number.`
    );
  }
  return id;
};

const checkScore = (value: unknown, what: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(
      `${what} is a number, got ${JSON.stringify(value) ?? typeof value}.`
    );
  }
  return value;
};

const checkCount = (value: unknown, what: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(
      `${what} is a whole number, 0 or more, got ${JSON.stringify(value) ?? typeof value}.`
    );
  }
  return value as number;
};

/** The ranking as its functions see it: the backend, the name, the scope. */
function scoped(
  state: RankingState,
  guildOf: () => string | null
): ScopedRanking {
  const ready = (): {
    backend: RankingBackend;
    name: string;
    scope: string[];
  } => {
    if (!state.name) {
      throw new Error(
        'This ranking was not loaded by ChapterJS: a ranking is exported from a file of src/ (export const name = ranking()), and used once the bot started.'
      );
    }
    return {
      backend: rankingsOf(storeBackend(state.storage, state.name)),
      name: state.name,
      scope: scopeParts('ranking', state.name, state.scope, guildOf),
    };
  };
  return {
    async add(id, points) {
      const { backend, name, scope } = ready();
      return backend.add(
        name,
        scope,
        checkId(id),
        checkScore(points, 'What add() adds')
      );
    },
    async set(id, score) {
      const { backend, name, scope } = ready();
      await backend.set(
        name,
        scope,
        checkId(id),
        checkScore(score, 'The score set()')
      );
    },
    async score(id) {
      const { backend, name, scope } = ready();
      return backend.score(name, scope, checkId(id));
    },
    async rankOf(id) {
      const { backend, name, scope } = ready();
      const rank = await backend.rank(name, scope, checkId(id), state.order);
      return rank === undefined ? undefined : rank + 1;
    },
    async top(count = 10, skip = 0) {
      const { backend, name, scope } = ready();
      checkCount(count, 'How many top() lists');
      checkCount(skip, 'How many top() skips');
      const ranked = await backend.range(name, scope, state.order, skip, count);
      return ranked.map((entry, index) => ({
        id: entry.id,
        score: entry.score,
        rank: skip + index + 1,
      }));
    },
    async remove(id) {
      const { backend, name, scope } = ready();
      return backend.remove(name, scope, checkId(id));
    },
    async size() {
      const { backend, name, scope } = ready();
      return backend.size(name, scope);
    },
    async clear() {
      const { backend, name, scope } = ready();
      return backend.clear(name, scope);
    },
  };
}

/**
 * Declares a ranking: a score per member, kept in order from one restart
 * to the next. Export the result from any file of `src/`: the name of the
 * export is the name of the ranking. Per server unless `scope: 'global'`
 * is given, the highest score first unless `order: 'lowest'` is.
 *
 * ```ts
 * import { ranking } from 'chapterjs';
 *
 * export const xp = ranking();
 *
 * // In an event of a message, in a server:
 * await xp.add(message.author.id, 10);
 * const best = await xp.top(10);
 * ```
 */
export function ranking(config: RankingConfig = {}): Ranking {
  const state: RankingState = {
    config,
    scope: 'guild',
    storage: 'file',
    order: 'highest',
  };
  const declared: Ranking = {
    ...scoped(state, () => currentGuildId() ?? null),
    in: guild => {
      const id = guildIdOf(guild);
      return scoped(state, () => id);
    },
  };
  Object.defineProperty(declared, STATE, { value: state });
  return declared;
}
