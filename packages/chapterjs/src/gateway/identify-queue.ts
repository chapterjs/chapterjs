import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Decides when a shard may identify. Behind an interface because shards of
 * the same bot may run in several processes, which then have to share one
 * gate.
 */
export interface IdentifyGate {
  /** Resolves when the shard may send its Identify. */
  wait(shardId: number): Promise<void>;
}

/**
 * How long Discord counts concurrent identifies for, in milliseconds.
 * @see https://docs.discord.com/developers/events/gateway#rate-limiting
 */
export const IDENTIFY_INTERVAL = 5000;

/**
 * The default gate, for shards of one process. Shards are put in buckets by
 * `shard_id % max_concurrency`; a bucket lets one shard identify every 5
 * seconds, and different buckets don't wait for each other.
 * @see https://docs.discord.com/developers/events/gateway#sharding-max-concurrency
 */
export class IdentifyQueue implements IdentifyGate {
  readonly #maxConcurrency: number;
  readonly #interval: number;
  /** For each bucket: when its last waiting shard will have identified. */
  readonly #tails = new Map<number, Promise<void>>();

  constructor(maxConcurrency: number, interval = IDENTIFY_INTERVAL) {
    this.#maxConcurrency = Math.max(1, Math.floor(maxConcurrency));
    this.#interval = interval;
  }

  wait(shardId: number): Promise<void> {
    const key = shardId % this.#maxConcurrency;
    const turn = this.#tails.get(key) ?? Promise.resolve();
    // The next shard of the bucket goes one interval after this one.
    this.#tails.set(
      key,
      turn.then(() => sleep(this.#interval)).then(() => undefined)
    );
    return turn;
  }
}
