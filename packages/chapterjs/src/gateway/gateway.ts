// Every connection of the bot to the Discord gateway: how many shards,
// when each one may identify, and one place to listen to them all.
// https://docs.discord.com/developers/events/gateway#sharding

import { GetGatewayBot } from '../discord/endpoints.js';
import type { GatewayOpcode } from '../discord/codes.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawGatewayPresenceUpdate } from '../discord/types/gateway-events.js';
import type { Rest } from '../rest/rest.js';
import { SessionLimitError } from './errors.js';
import { IdentifyQueue, type IdentifyGate } from './identify-queue.js';
import { Shard, type ShardEvent, type ShardOptions } from './shard.js';

export interface GatewayOptions {
  rest: Rest;
  token: string;
  intents: number;
  presence?: RawGatewayPresenceUpdate | undefined;
  /**
   * Which shards this process runs, out of how many. By default: all of
   * them, as many as Discord recommends. A layer that spreads shards over
   * several processes gives each process its share.
   */
  shards?: { ids: readonly number[]; count: number };
  /**
   * Decides when a shard may identify. By default: a queue for the shards
   * of this process. Processes sharing a bot must share one gate.
   */
  identifyGate?: IdentifyGate;
  onDispatch: ShardOptions['onDispatch'];
  onEvent?: (event: ShardEvent) => void;
  /** Only tests change these. */
  backoff?: ShardOptions['backoff'];
  identifyInterval?: number;
}

/**
 * The shard that receives the events of a server:
 * `(guild_id >> 22) % num_shards`.
 * @see https://docs.discord.com/developers/events/gateway#sharding-sharding-formula
 */
export function shardIdFor(guildId: Snowflake, shardCount: number): number {
  return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}

export class Gateway {
  readonly #options: GatewayOptions;
  readonly #shards = new Map<number, Shard>();
  #shardCount = 0;
  #started = false;
  /** The presence every session starts with. */
  #presence: RawGatewayPresenceUpdate | undefined;

  constructor(options: GatewayOptions) {
    this.#options = options;
    this.#presence = options.presence;
  }

  /** How many shards the bot is split into, across every process. */
  get shardCount(): number {
    return this.#shardCount;
  }

  /** The shards this process runs. */
  get shards(): ReadonlyMap<number, Shard> {
    return this.#shards;
  }

  /** The average heartbeat latency of the shards, in ms; `null` at first. */
  get ping(): number | null {
    const pings = [...this.#shards.values()]
      .map(shard => shard.ping)
      .filter(ping => ping !== null);
    if (pings.length === 0) return null;
    return Math.round(
      pings.reduce((sum, ping) => sum + ping, 0) / pings.length
    );
  }

  /**
   * Connects every shard of this process, and resolves once they are all
   * ready. Rejects (and closes them all) if Discord refuses the connection.
   */
  async connect(): Promise<void> {
    if (this.#started) throw new Error('The gateway was already started.');
    this.#started = true;
    const options = this.#options;
    // Not cached: the recommended number of shards changes as the bot grows.
    const info = await options.rest.request(GetGatewayBot, []);
    const count = options.shards?.count ?? info.shards;
    const ids =
      options.shards?.ids ?? Array.from({ length: count }, (_, id) => id);
    for (const id of ids) {
      if (!Number.isInteger(id) || id < 0 || id >= count) {
        throw new RangeError(
          `Shard ${id} does not exist: with ${count} shard(s), ids go from 0 to ${count - 1}.`
        );
      }
    }
    const limit = info.session_start_limit;
    if (limit.remaining < ids.length) {
      throw new SessionLimitError(
        ids.length,
        limit.remaining,
        limit.reset_after
      );
    }
    this.#shardCount = count;
    const identifyGate =
      options.identifyGate ??
      new IdentifyQueue(limit.max_concurrency, options.identifyInterval);

    for (const id of ids) {
      this.#shards.set(
        id,
        new Shard({
          id,
          count,
          token: options.token,
          intents: options.intents,
          url: info.url,
          presence: this.#presence,
          identifyGate,
          onDispatch: options.onDispatch,
          onEvent: options.onEvent,
          backoff: options.backoff,
        })
      );
    }
    try {
      await Promise.all(
        [...this.#shards.values()].map(shard => shard.connect())
      );
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  /**
   * Changes the presence of the bot on every shard of this process: sent
   * now when Discord's limit allows it, and carried by every session
   * started later.
   */
  setPresence(presence: RawGatewayPresenceUpdate): void {
    this.#presence = presence;
    for (const shard of this.#shards.values()) shard.setPresence(presence);
  }

  /** The shard of this process that handles a server, if it runs here. */
  shardFor(guildId: Snowflake): Shard | undefined {
    return this.#shards.get(shardIdFor(guildId, this.#shardCount));
  }

  /** Sends an event to Discord through one shard. */
  async send(shardId: number, op: GatewayOpcode, data: unknown): Promise<void> {
    const shard = this.#shards.get(shardId);
    if (!shard) {
      throw new RangeError(`Shard ${shardId} does not run in this process.`);
    }
    await shard.send(op, data);
  }

  /** Closes every connection: the bot goes offline right away. */
  async close(): Promise<void> {
    await Promise.all([...this.#shards.values()].map(shard => shard.close()));
  }
}
