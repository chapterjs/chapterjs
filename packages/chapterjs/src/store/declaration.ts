// What a file declares with `store()`, checked when it loads, so a wrong
// scope or expiration is explained before anything is kept; the store is
// then bound to the name of its export, which names its data.

import type { Declaration } from '../loader/loader.js';
import { DURATION_EXAMPLE, parseDuration } from '../util/duration.js';
import {
  bindStore,
  isStoreDeclaration,
  storeStateOf,
  type StoreConfig,
  type StoreScope,
} from './store.js';

/** A store, checked: what the project keeps of it. */
export interface LoadedStore {
  /** The name of the store: the name of the export that declares it. */
  readonly name: string;
  readonly scope: StoreScope;
  /** The default expiration, in ms, or `null` for never. */
  readonly expires: number | null;
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = ['scope', 'expires'];
const SCOPES: readonly StoreScope[] = ['guild', 'global'];

/** What a name can be: a file in `data/` is called after it. */
const NAME = /^[\w.-]+$/;

/**
 * A store, declared anywhere in `src/` with `store()` and exported: the
 * name of the export is the name of the store.
 */
export const storeDeclaration: Declaration<LoadedStore> = {
  one: 'store',
  many: 'stores',
  is: isStoreDeclaration,
  list: false,
  read(value, { name }) {
    const config = storeStateOf(value)?.config as StoreConfig;
    if (!isRecord(config)) {
      return fail(
        `store() takes an object, or nothing: store<Warning[]>({ expires: '30d' }).`
      );
    }
    for (const key of Object.keys(config)) {
      if (!KEYS.includes(key)) {
        fail(
          `"${key}" is not something a store has. It can have: ${KEYS.join(', ')}.`
        );
      }
    }
    if (!NAME.test(name)) {
      fail(
        `"${name}" can't name a store: the name of the export is the name of the store and of its file in data/, made of letters, digits, _ . and -.`
      );
    }
    const scope = (config.scope ?? 'guild') as StoreScope;
    if (!SCOPES.includes(scope)) {
      fail(
        `"scope" is 'guild' (the data is kept per server, the default) or 'global' (one set of data for the whole bot), got ${JSON.stringify(config.scope)}.`
      );
    }
    let expires: number | null = null;
    if (config.expires !== undefined) {
      const ms =
        typeof config.expires === 'string'
          ? parseDuration(config.expires)
          : null;
      if (ms === null || ms < 1000) {
        fail(
          `"expires" is how long a value is kept: ${DURATION_EXAMPLE}, 1 s at least. Got ${JSON.stringify(config.expires)}.`
        );
      }
      expires = ms;
    }
    bindStore(value, { name, scope, expires });
    return Object.freeze({ name, scope, expires });
  },
};
