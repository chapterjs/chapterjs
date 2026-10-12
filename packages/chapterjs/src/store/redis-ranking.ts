// The rankings kept in Redis, as sorted sets: one key per ranking and per
// server (`xp:<server id>`, `xp` for a global one, `dev:` in front under
// `chapterjs dev`), the ids as members and the scores as scores, so Redis
// itself keeps them in order and adds to a score in one go.
// https://redis.io/docs/latest/commands/zincrby/, /commands/zadd/,
// /commands/zscore/, /commands/zrevrank/, /commands/zrevrange/,
// /commands/zrange/, /commands/zrem/, /commands/zcard/

import type { RedisClient } from '../redis/client.js';
import type { RedisReply } from '../redis/protocol.js';
import type { StoreKeyParts } from './backend.js';
import type {
  RankedScore,
  RankingBackend,
  RankingOrder,
} from './ranking-backend.js';

/** A score as Redis writes it: `"10"`, `"1.5"`, `"inf"`. */
const scoreOf = (reply: RedisReply): number => {
  const text = String(reply);
  if (text === 'inf' || text === '+inf') return Infinity;
  if (text === '-inf') return -Infinity;
  return Number(text);
};

export class RedisRankingBackend implements RankingBackend {
  readonly #client: RedisClient;
  readonly #key: (name: string, scope: StoreKeyParts) => string;

  constructor(
    client: RedisClient,
    key: (name: string, scope: StoreKeyParts) => string
  ) {
    this.#client = client;
    this.#key = key;
  }

  async add(
    name: string,
    scope: StoreKeyParts,
    id: string,
    by: number
  ): Promise<number> {
    return scoreOf(
      await this.#client.send('ZINCRBY', this.#key(name, scope), by, id)
    );
  }

  async set(
    name: string,
    scope: StoreKeyParts,
    id: string,
    score: number
  ): Promise<void> {
    await this.#client.send('ZADD', this.#key(name, scope), score, id);
  }

  async score(
    name: string,
    scope: StoreKeyParts,
    id: string
  ): Promise<number | undefined> {
    const reply = await this.#client.send('ZSCORE', this.#key(name, scope), id);
    return reply === null ? undefined : scoreOf(reply);
  }

  async rank(
    name: string,
    scope: StoreKeyParts,
    id: string,
    order: RankingOrder
  ): Promise<number | undefined> {
    const reply = await this.#client.send(
      order === 'highest' ? 'ZREVRANK' : 'ZRANK',
      this.#key(name, scope),
      id
    );
    return typeof reply === 'number' ? reply : undefined;
  }

  async range(
    name: string,
    scope: StoreKeyParts,
    order: RankingOrder,
    start: number,
    count: number
  ): Promise<RankedScore[]> {
    if (count === 0) return [];
    const reply = await this.#client.send(
      order === 'highest' ? 'ZREVRANGE' : 'ZRANGE',
      this.#key(name, scope),
      start,
      start + count - 1,
      'WITHSCORES'
    );
    if (!Array.isArray(reply)) return [];
    const ranked: RankedScore[] = [];
    for (let index = 0; index + 1 < reply.length; index += 2) {
      ranked.push({
        id: String(reply[index]),
        score: scoreOf(reply[index + 1] ?? null),
      });
    }
    return ranked;
  }

  async remove(
    name: string,
    scope: StoreKeyParts,
    id: string
  ): Promise<boolean> {
    return (await this.#client.send('ZREM', this.#key(name, scope), id)) === 1;
  }

  async size(name: string, scope: StoreKeyParts): Promise<number> {
    const reply = await this.#client.send('ZCARD', this.#key(name, scope));
    return typeof reply === 'number' ? reply : 0;
  }

  async clear(name: string, scope: StoreKeyParts): Promise<number> {
    const key = this.#key(name, scope);
    // Sent one after the other on one connection: counted, then removed.
    const [count] = await Promise.all([
      this.#client.send('ZCARD', key),
      this.#client.send('DEL', key),
    ]);
    return typeof count === 'number' ? count : 0;
  }
}
