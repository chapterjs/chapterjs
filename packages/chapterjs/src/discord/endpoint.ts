import type { Snowflake } from './types/common.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What an endpoint takes and returns; a missing key means "nothing". */
export interface EndpointTypes {
  /** The JSON body of the request. */
  body?: unknown;
  /** The query string parameters. */
  query?: unknown;
  /** The JSON body of the response. */
  result?: unknown;
}

/**
 * One REST endpoint: its method and its path as written in the official
 * documentation (`/guilds/{guild.id}/members/{user.id}`). The types of its
 * body, query and result only exist for the compiler.
 */
export interface Endpoint<
  Path extends string = string,
  Types extends EndpointTypes = EndpointTypes,
> {
  readonly method: HttpMethod;
  readonly path: Path;
  /** Never set: only carries the types of the endpoint. */
  readonly types?: Types;
}

/**
 * The values that fill the `{placeholders}` of a path, in order:
 * `'/guilds/{guild.id}/members/{user.id}'` takes `[guildId, userId]`.
 */
export type PathParams<Path extends string> =
  Path extends `${string}{${string}}${infer Rest}`
    ? [Snowflake, ...PathParams<Rest>]
    : [];

export type EndpointBody<E extends Endpoint> =
  NonNullable<E['types']> extends { body: infer Body } ? Body : undefined;
export type EndpointQuery<E extends Endpoint> =
  NonNullable<E['types']> extends { query: infer Query } ? Query : undefined;
export type EndpointResult<E extends Endpoint> =
  NonNullable<E['types']> extends { result: infer Result } ? Result : void;

/**
 * Declares an endpoint. Called in two steps so the types are given by hand
 * while the path keeps its literal type:
 * `endpoint<{ result: RawUser }>()('GET', '/users/{user.id}')`.
 */
export function endpoint<Types extends EndpointTypes>() {
  return <Path extends string>(
    method: HttpMethod,
    path: Path
  ): Endpoint<Path, Types> => Object.freeze({ method, path });
}

const PLACEHOLDER = /\{([^}]+)\}/g;

/** The names of the `{placeholders}` of a path, in order. */
export function pathParamNames(path: string): string[] {
  return Array.from(path.matchAll(PLACEHOLDER), match => match[1]!);
}

/**
 * Replaces the `{placeholders}` of a path with the given values, URL-encoded
 * (an emoji in a reaction path, for example, is not URL-safe).
 */
export function fillPath(path: string, params: readonly string[]): string {
  const names = pathParamNames(path);
  if (names.length !== params.length) {
    throw new TypeError(
      `"${path}" takes ${names.length} value(s) (${names.join(', ') || 'none'}), got ${params.length}.`
    );
  }
  let index = 0;
  return path.replace(PLACEHOLDER, (_, name: string) => {
    const value = params[index++];
    if (typeof value !== 'string' || value === '') {
      throw new TypeError(
        `"${path}" needs a non-empty text for {${name}}, got ${JSON.stringify(value)}.`
      );
    }
    return encodeURIComponent(value);
  });
}

/**
 * The part of a request that Discord counts rate limits by, besides the
 * endpoint itself: the top-level resource of the path (a channel, a guild,
 * or a webhook with its token).
 * @see https://docs.discord.com/developers/topics/rate-limits#rate-limits
 */
export function majorParameter(
  path: string,
  params: readonly string[]
): string {
  const names = pathParamNames(path);
  const first = names[0];
  if (first === 'channel.id' || first === 'guild.id') return params[0]!;
  if (first === 'webhook.id') {
    return names[1] === 'webhook.token'
      ? `${params[0]}/${params[1]}`
      : params[0]!;
  }
  // Interaction endpoints are webhooks named after the application.
  if (first === 'application.id' && names[1] === 'interaction.token') {
    return `${params[0]}/${params[1]}`;
  }
  return '';
}
