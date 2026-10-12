// What a file declares with `ranking()`, checked when it loads, so a wrong
// scope, storage or order is explained before any score is kept; the
// ranking is then bound to the name of its export.

import type { Declaration } from '../loader/loader.js';
import { STORAGES, type StoreStorage } from '../store/backend.js';
import type { StoreScope } from '../store/store.js';
import {
  bindRanking,
  isRankingDeclaration,
  rankingStateOf,
  type RankingConfig,
  type RankingOrder,
} from './ranking.js';

/** A ranking, checked: what the project keeps of it. */
export interface LoadedRanking {
  readonly name: string;
  readonly scope: StoreScope;
  readonly storage: StoreStorage;
  readonly order: RankingOrder;
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = ['scope', 'storage', 'order'];
const SCOPES: readonly StoreScope[] = ['guild', 'global'];
const ORDERS: readonly RankingOrder[] = ['highest', 'lowest'];

/** A name can name a file in `data/`, like a store's. */
const NAME = /^[\w.-]+$/;

export const rankingDeclaration: Declaration<LoadedRanking> = {
  one: 'ranking',
  many: 'rankings',
  is: isRankingDeclaration,
  list: false,
  read(value, { name }) {
    const config = rankingStateOf(value)?.config as RankingConfig;
    if (!isRecord(config)) {
      return fail(
        "ranking() takes an object, or nothing: ranking({ order: 'lowest' })."
      );
    }
    for (const key of Object.keys(config)) {
      if (!KEYS.includes(key)) {
        fail(
          `"${key}" is not something a ranking has. It can have: ${KEYS.join(', ')}.`
        );
      }
    }
    if (!NAME.test(name)) {
      fail(
        `"${name}" can't name a ranking: the name of the export is the name of the ranking and of its file in data/, made of letters, digits, _ . and -.`
      );
    }
    const scope = (config.scope ?? 'guild') as StoreScope;
    if (!SCOPES.includes(scope)) {
      fail(
        `"scope" is 'guild' (a ranking per server, the default) or 'global' (one ranking for the whole bot), got ${JSON.stringify(config.scope)}.`
      );
    }
    const storage = (config.storage ?? 'file') as StoreStorage;
    if (!STORAGES.includes(storage)) {
      fail(
        `"storage" is 'file' (a file in data/, the default) or 'redis' (the Redis of REDIS_URL in .env), got ${JSON.stringify(config.storage)}.`
      );
    }
    const order = (config.order ?? 'highest') as RankingOrder;
    if (!ORDERS.includes(order)) {
      fail(
        `"order" is 'highest' (the highest score first, the default) or 'lowest' (the lowest first), got ${JSON.stringify(config.order)}.`
      );
    }
    bindRanking(value, { name, scope, storage, order });
    return Object.freeze({ name, scope, storage, order });
  },
};
