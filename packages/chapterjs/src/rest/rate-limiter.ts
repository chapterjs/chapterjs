// Waits before each request so Discord's rate limits are never exceeded.
// Limits are never hard coded: they are read from the headers of each
// response, as the documentation asks.
// https://docs.discord.com/developers/topics/rate-limits

import { setTimeout as sleep } from 'node:timers/promises';
import { GLOBAL_REQUESTS_PER_SECOND } from '../discord/api.js';

/** What the headers of a response say about the rate limit of its route. */
export interface RateLimitHeaders {
  /** `X-RateLimit-Bucket`: routes sharing a limit share this value. */
  bucket: string | null;
  /** `X-RateLimit-Remaining` */
  remaining: number | null;
  /** `X-RateLimit-Reset-After`, in seconds. */
  resetAfter: number | null;
}

/** A 429 response. */
export interface RateLimitHit {
  /** `Retry-After` / `retry_after`, in seconds. */
  retryAfter: number;
  /** `X-RateLimit-Scope`: `user`, `global` or `shared`. */
  scope: string | null;
  /** `X-RateLimit-Global` */
  global: boolean;
}

export function readRateLimitHeaders(headers: Headers): RateLimitHeaders {
  const number = (name: string): number | null => {
    const value = headers.get(name);
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    bucket: headers.get('x-ratelimit-bucket'),
    remaining: number('x-ratelimit-remaining'),
    resetAfter: number('x-ratelimit-reset-after'),
  };
}

/** The state of one bucket for one top-level resource. */
class Bucket {
  remaining = 1;
  /** When `remaining` goes back to its maximum (ms since epoch). */
  resetAt = 0;
  /** Requests of this bucket run one at a time, in order. */
  tail: Promise<void> = Promise.resolve();
  pending = 0;
}

export interface RateLimiterOptions {
  /** Requests per second for the whole bot. Default: 50. */
  globalLimit?: number;
  /** Called every time a request has to wait. */
  onWait?: (info: { route: string; ms: number; global: boolean }) => void;
}

export class RateLimiter {
  /** `METHOD /path/template` → the bucket Discord said it belongs to. */
  readonly #bucketOfRoute = new Map<string, string>();
  /** `bucket:majorParameter` → its state. */
  readonly #buckets = new Map<string, Bucket>();
  readonly #globalLimit: number;
  readonly #onWait: RateLimiterOptions['onWait'];
  /** Start of the current one-second window of the global limit. */
  #windowStart = 0;
  #windowCount = 0;
  /** Until when every request is paused after a global 429. */
  #globalBlockedUntil = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.#globalLimit = options.globalLimit ?? GLOBAL_REQUESTS_PER_SECOND;
    this.#onWait = options.onWait;
  }

  #bucket(route: string, major: string): Bucket {
    // Until Discord names the bucket of a route, the route is its own bucket.
    const key = `${this.#bucketOfRoute.get(route) ?? route}:${major}`;
    let bucket = this.#buckets.get(key);
    if (!bucket) {
      bucket = new Bucket();
      this.#buckets.set(key, bucket);
    }
    return bucket;
  }

  async #wait(route: string, ms: number, global: boolean): Promise<void> {
    if (ms <= 0) return;
    this.#onWait?.({ route, ms, global });
    await sleep(ms);
  }

  /** Waits for a slot in the global limit, then takes it. */
  async #takeGlobalSlot(route: string): Promise<void> {
    for (;;) {
      const now = Date.now();
      if (now < this.#globalBlockedUntil) {
        await this.#wait(route, this.#globalBlockedUntil - now, true);
        continue;
      }
      if (now - this.#windowStart >= 1000) {
        this.#windowStart = now;
        this.#windowCount = 0;
      }
      if (this.#windowCount < this.#globalLimit) {
        this.#windowCount++;
        return;
      }
      await this.#wait(route, this.#windowStart + 1000 - now, true);
    }
  }

  /**
   * Runs `send` when the limits allow it. Requests of the same bucket run
   * one after the other; different buckets run in parallel. `send` reports
   * what the response said through `update` and returns its result, or a
   * `RateLimitHit` to be run again after the delay Discord asked for.
   */
  async run<T>(
    input: {
      route: string;
      major: string;
      /** Interaction endpoints are not bound to the global rate limit. */
      countsForGlobal: boolean;
    },
    send: (
      update: (headers: RateLimitHeaders) => void
    ) => Promise<T | RateLimitHit>
  ): Promise<T> {
    const { route, major } = input;
    const bucket = this.#bucket(route, major);
    const previous = bucket.tail;
    let release!: () => void;
    bucket.tail = new Promise<void>(resolve => (release = resolve));
    bucket.pending++;
    await previous;
    try {
      for (;;) {
        // The bucket may have been renamed by an earlier response.
        const current = this.#bucket(route, major);
        const now = Date.now();
        if (current.remaining <= 0 && now < current.resetAt) {
          await this.#wait(route, current.resetAt - now, false);
        }
        if (input.countsForGlobal) await this.#takeGlobalSlot(route);
        const result = await send(headers => {
          if (headers.bucket !== null) {
            this.#bucketOfRoute.set(route, headers.bucket);
          }
          const target = this.#bucket(route, major);
          if (headers.remaining !== null) target.remaining = headers.remaining;
          if (headers.resetAfter !== null) {
            target.resetAt = Date.now() + headers.resetAfter * 1000;
          }
        });
        if (!isRateLimitHit(result)) return result;
        const ms = Math.ceil(result.retryAfter * 1000);
        if (result.global || result.scope === 'global') {
          this.#globalBlockedUntil = Date.now() + ms;
        } else {
          const target = this.#bucket(route, major);
          target.remaining = 0;
          target.resetAt = Date.now() + ms;
        }
      }
    } finally {
      bucket.pending--;
      release();
      this.#sweep();
    }
  }

  /** Forgets buckets that are idle and reset, so memory doesn't grow. */
  #sweep(): void {
    if (this.#buckets.size < 1000) return;
    const now = Date.now();
    for (const [key, bucket] of this.#buckets) {
      if (bucket.pending === 0 && bucket.resetAt <= now) {
        this.#buckets.delete(key);
      }
    }
  }
}

const HIT = Symbol('rate limit hit');

export function rateLimitHit(hit: RateLimitHit): RateLimitHit {
  return Object.assign(hit, { [HIT]: true });
}

function isRateLimitHit(value: unknown): value is RateLimitHit {
  return typeof value === 'object' && value !== null && HIT in value;
}
