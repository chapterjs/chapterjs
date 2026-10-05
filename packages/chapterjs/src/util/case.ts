// Discord names fields in snake_case, JavaScript in camelCase. Users only
// ever write and read camelCase: these two conversions are the single place
// where names are translated, for every feature.

type CamelKey<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<CamelKey<Tail>>}`
  : S;

/** A Discord payload type with every field name turned into camelCase. */
export type Camelize<T> = T extends readonly (infer Item)[]
  ? Camelize<Item>[]
  : T extends object
    ? { [K in keyof T as K extends string ? CamelKey<K> : K]: Camelize<T[K]> }
    : T;

// Only real field names are converted: ids (`"123"`) and locales (`"en-US"`),
// used as keys of some objects, must stay as they are.
const CAMEL = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+$/;
const SNAKE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function convert(value: unknown, rename: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map(item => convert(item, rename));
  if (!isPlainObject(value)) {
    // Something that knows how to become JSON (a set of permissions...).
    if (
      typeof value === 'object' &&
      value !== null &&
      'toJSON' in value &&
      typeof value.toJSON === 'function' &&
      !(value instanceof Date)
    ) {
      return value.toJSON();
    }
    if (value instanceof Date) return value.toISOString();
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    result[rename(key)] = convert(item, rename);
  }
  return result;
}

const toSnakeKey = (key: string): string =>
  CAMEL.test(key)
    ? key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    : key;

const toCamelKey = (key: string): string =>
  SNAKE.test(key)
    ? key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
    : key;

/**
 * What users write → what Discord expects. Dates become ISO8601 text,
 * `undefined` fields are dropped.
 */
export function toSnakeCase<T>(value: Camelize<T>): T {
  return convert(value, toSnakeKey) as T;
}

/** What Discord sends → what users read. */
export function toCamelCase<T>(value: T): Camelize<T> {
  return convert(value, toCamelKey) as Camelize<T>;
}
