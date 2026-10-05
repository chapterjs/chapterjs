import { inspect } from 'node:util';
import { snowflakeTimestamp } from '../discord/snowflake.js';
import type { Snowflake } from '../discord/types/common.js';
import { toCamelCase, type Camelize } from '../util/case.js';
import type { Context } from './context.js';

/** Only the framework reads the context and the data of a structure. */
export let ctxOf: (structure: Structure<object>) => Context;
export let dataOf: <Raw extends object>(structure: Structure<Raw>) => Raw;
/** What a structure was created with: see `known.ts`, which owns it. */
export let originOf: (structure: Structure<object>) => object | undefined;
export let setOrigin: (
  structure: Structure<object>,
  origin: object | undefined
) => void;

/**
 * Something of Discord (a server, a member, a message...) as user code sees
 * it: the data Discord sent, read through camelCase properties, and the
 * actions that can be done on it. Structures are only created by the
 * framework.
 */
export abstract class Structure<Raw extends object> {
  readonly #ctx: Context;
  readonly #data: Raw;
  // One reference, in the structure itself: nothing is allocated to keep it.
  #origin: object | undefined = undefined;

  static {
    originOf = structure => structure.#origin;
    setOrigin = (structure, origin) => {
      structure.#origin = origin;
    };
    ctxOf = structure => structure.#ctx;
    dataOf = <R extends object>(structure: Structure<R>) =>
      structure.#data as R;
  }

  constructor(ctx: Context, data: Raw) {
    this.#ctx = ctx;
    this.#data = data;
  }

  /** The data of Discord as a plain object, with camelCase names. */
  toJSON(): Camelize<Raw> {
    return toCamelCase(this.#data);
  }

  [inspect.custom](
    _depth: number,
    options: Parameters<typeof inspect>[1]
  ): string {
    return `${this.constructor.name} ${inspect(this.toJSON(), options)}`;
  }
}

/** A structure Discord identifies with an id. */
export abstract class IdStructure<
  Raw extends { id: Snowflake },
> extends Structure<Raw> {
  get id(): Snowflake {
    return dataOf(this).id;
  }

  /** When it was created: a Discord id contains its creation date. */
  get createdAt(): Date {
    return new Date(snowflakeTimestamp(this.id));
  }
}

/**
 * Updates the data of a structure with what Discord just sent. Fields
 * Discord left out keep their value.
 */
export function patch<Raw extends object>(
  structure: Structure<Raw>,
  data: Partial<Raw>
): void {
  const target = dataOf(structure) as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) target[key] = value;
  }
}

/** Copies shared methods onto a class (see `TextBasedChannel`). */
export function mixin(target: { prototype: object }, methods: object): void {
  for (const [name, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(methods)
  )) {
    Object.defineProperty(target.prototype, name, {
      ...descriptor,
      enumerable: false,
    });
  }
}

/** Parses a date of Discord, which may be missing. */
export function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

/** The id of something given as an id or as a structure. */
export function idOf(value: Snowflake | { id: Snowflake }): Snowflake {
  const id = typeof value === 'string' ? value : value?.id;
  if (typeof id !== 'string' || id === '') {
    throw new TypeError(
      `Expected an id or something with an id, got ${value === null ? 'null' : typeof value}.`
    );
  }
  return id;
}
