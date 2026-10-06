// The `custom_id` of a component is never written by users: it is the path
// of the file of the component (`buttons/ban`), followed by the data the
// component carries, encoded by the framework. Stateless by design: it
// survives a restart, and every process of the bot reads it the same way.
// https://docs.discord.com/developers/components/reference#anatomy-of-a-component-custom-id

import { Limits } from '../discord/api.js';

/** The kinds of values a component can carry in its `data`. */
export type DataKind = 'string' | 'number' | 'boolean';

/** What a component carries: a name for each value, and its kind. */
export type DataShape = Readonly<Record<string, DataKind>>;

/** The values of a `data` declaration, typed from it. */
export type DataValuesOf<Shape extends DataShape> = {
  [Name in keyof Shape]: Shape[Name] extends 'string'
    ? string
    : Shape[Name] extends 'number'
      ? number
      : boolean;
};

export const DATA_KINDS: readonly DataKind[] = ['string', 'number', 'boolean'];

/** Fields are separated by `:`; a `:` or a `\` inside a value is escaped. */
const SEPARATOR = ':';
const escape = (value: string): string =>
  value.replace(/[\\:]/g, char => `\\${char}`);

/**
 * Splits on the separators that are not escaped, and unescapes the rest.
 * Written by hand: a regular expression would need lookbehinds that count.
 */
function split(encoded: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let index = 0; index < encoded.length; index++) {
    const char = encoded[index]!;
    if (char === '\\' && index + 1 < encoded.length) {
      current += encoded[++index];
    } else if (char === SEPARATOR) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  parts.push(current);
  return parts;
}

/** Checks the values a file gives to a component against its `data`. */
export function checkData(
  what: string,
  shape: DataShape,
  values: unknown
): Record<string, string | number | boolean> {
  const names = Object.keys(shape);
  if (names.length === 0) {
    if (values !== undefined) {
      throw new TypeError(
        `${what} carries no data: it is used as is, without arguments.`
      );
    }
    return {};
  }
  const example = `${what}({ ${names.map(name => `${name}: ${shape[name] === 'string' ? "'...'" : shape[name] === 'number' ? '1' : 'true'}`).join(', ')} })`;
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new TypeError(`${what} needs its data: write ${example}.`);
  }
  const given = values as Record<string, unknown>;
  for (const key of Object.keys(given)) {
    if (!Object.hasOwn(shape, key)) {
      throw new TypeError(
        `"${key}" is not in the data of ${what}. Its data is: ${names.join(', ')}.`
      );
    }
  }
  const result: Record<string, string | number | boolean> = {};
  for (const name of names) {
    const value = given[name];
    const kind = shape[name]!;
    const got = JSON.stringify(value) ?? typeof value;
    if (
      typeof value !== kind ||
      (kind === 'number' && !Number.isFinite(value))
    ) {
      throw new TypeError(
        `The data "${name}" of ${what} is a ${kind}, got ${got}.`
      );
    }
    result[name] = value as string | number | boolean;
  }
  return result;
}

/**
 * The `custom_id` of a component: its path, then its values in the order
 * of the declaration. Discord accepts 100 characters: when the data does
 * not fit, the error says by how much.
 */
export function encodeCustomId(
  path: string,
  shape: DataShape,
  values: Record<string, string | number | boolean>
): string {
  const parts = [path];
  for (const name of Object.keys(shape))
    parts.push(escape(String(values[name])));
  const id = parts.join(SEPARATOR);
  if (id.length > Limits.CustomId) {
    throw new RangeError(
      `The data of ${path} is ${id.length - path.length - 1} characters long once encoded, and Discord leaves ${Limits.CustomId - path.length - 1} for it (its id is ${path}, ${path.length} characters, out of ${Limits.CustomId}). Carry less: an id instead of a name, or a shorter file name.`
    );
  }
  return id;
}

/** The path and the encoded values of a `custom_id` the framework wrote. */
export function decodeCustomId(id: string): { path: string; parts: string[] } {
  const [path = '', ...parts] = split(id);
  return { path, parts };
}

/**
 * The values a `custom_id` carries, typed as the component declares them.
 * `null` when they do not match the declaration: the file changed since the
 * message was sent.
 */
export function readData(
  shape: DataShape,
  parts: readonly string[]
): Record<string, string | number | boolean> | null {
  const names = Object.keys(shape);
  if (parts.length !== names.length) return null;
  const values: Record<string, string | number | boolean> = {};
  for (const [index, name] of names.entries()) {
    const part = parts[index]!;
    switch (shape[name]) {
      case 'number': {
        const number = Number(part);
        if (part.trim() === '' || !Number.isFinite(number)) return null;
        values[name] = number;
        break;
      }
      case 'boolean':
        if (part !== 'true' && part !== 'false') return null;
        values[name] = part === 'true';
        break;
      default:
        values[name] = part;
    }
  }
  return values;
}
