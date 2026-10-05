import { DISCORD_EPOCH } from './api.js';
import type { Snowflake } from './types/common.js';

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Whether a value looks like a Discord id: used to reject a wrong value
 * (a name, a mention, a number) before it is sent to Discord.
 * @see https://docs.discord.com/developers/reference#snowflakes
 */
export function isSnowflake(value: unknown): value is Snowflake {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}

/**
 * When the thing a snowflake identifies was created, in milliseconds since
 * the Unix epoch: `(snowflake >> 22) + 1420070400000`.
 * @see https://docs.discord.com/developers/reference#snowflake-id-format-structure-left-to-right
 */
export function snowflakeTimestamp(id: Snowflake): number {
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

/**
 * The smallest snowflake created at a given time: lets `before` / `after`
 * pagination start from a date.
 * @see https://docs.discord.com/developers/reference#snowflake-ids-in-pagination
 */
export function snowflakeFromTimestamp(timestamp: number | Date): Snowflake {
  const ms = BigInt(Math.trunc(Number(timestamp)));
  if (ms < DISCORD_EPOCH) {
    throw new RangeError('Discord ids start in 2015: the date is too early.');
  }
  return String((ms - DISCORD_EPOCH) << 22n);
}

/** Sorts ids from the oldest to the newest; as text they would sort wrong. */
export function compareSnowflakes(a: Snowflake, b: Snowflake): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
