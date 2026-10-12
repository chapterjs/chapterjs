// What `dev` and `start` share about Redis: the backend made of
// `REDIS_URL`, checked before Discord is reached when a store needs it,
// and the line that says which stores are kept there.

import { RedisClient } from '../redis/client.js';
import type { RedisAddress } from '../redis/url.js';
import { RedisStoreBackend } from '../store/redis-backend.js';
import type { Log } from './log.js';
import type { Project } from './project.js';

/**
 * The backend of the stores kept in Redis. Nothing is connected until a
 * store is used, or `checkRedis()` asks; an outage is said once with `⚠`
 * and its end with `↻`.
 */
export function redisStores(
  address: RedisAddress,
  log: Log,
  options: { prefix?: string } = {}
): RedisStoreBackend {
  const client = new RedisClient(address, {
    // While checkRedis() asks, a failure is what stops the bot, said once
    // by it: "trying again" would not be true.
    onError: message => {
      if (!checking.has(backend)) log.warn(message);
    },
    onReconnect: () => log.reload(`Redis at ${client.where} is back`),
  });
  const backend = new RedisStoreBackend(client, options);
  return backend;
}

/** The backends `checkRedis()` is asking right now. */
const checking = new WeakSet<RedisStoreBackend>();

/** `a`, `a and b`, `a, b and c`. */
const and = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * The `ℹ` line naming the stores and rankings kept in Redis, or `null`
 * without any: "The store sessions and the ranking xp are kept in Redis…".
 */
export function describeRedisStores(
  project: Project,
  backend: RedisStoreBackend | null
): string | null {
  const { stores, rankings } = project.redisStores();
  const total = stores.length + rankings.length;
  if (!backend || total === 0) return null;
  const group = (one: string, many: string, names: string[]): string[] =>
    names.length === 0
      ? []
      : [`the ${names.length === 1 ? one : many} ${and(names)}`];
  const list = and([
    ...group('store', 'stores', stores),
    ...group('ranking', 'rankings', rankings),
  ]);
  return `${list[0]!.toUpperCase()}${list.slice(1)} ${total === 1 ? 'is' : 'are'} kept in Redis at ${backend.client.where}`;
}

/**
 * Makes sure Redis answers before the bot goes online, when a store is
 * kept there: a Redis that can't be reached is an error now, not when
 * someone uses the bot.
 */
export async function checkRedis(
  project: Project,
  backend: RedisStoreBackend | null,
  log: Log
): Promise<boolean> {
  const { stores, rankings } = project.redisStores();
  if (!backend || stores.length + rankings.length === 0) return true;
  checking.add(backend);
  try {
    await backend.client.ping();
    return true;
  } catch (error) {
    log.error(
      `${error instanceof Error ? error.message.replace(/ Trying again in \d+ s\.$/, '') : String(error)}`
    );
    return false;
  } finally {
    checking.delete(backend);
  }
}
