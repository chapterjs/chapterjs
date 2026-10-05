import { JSON_ERROR_CODES } from '../discord/codes.js';
import type { HttpMethod } from '../discord/endpoint.js';

/** One problem Discord found in a field of the request. */
export interface DiscordFieldError {
  /** Where the problem is: `embeds[0].title`, or `` for the whole request. */
  path: string;
  /** The kind of problem, as Discord names it (`BASE_TYPE_MAX_LENGTH`). */
  code: string;
  /** What is wrong, in English. */
  message: string;
}

/**
 * Turns the nested `errors` object of an error response into a flat list.
 * A problem is an `_errors` array placed under the key of the field, at any
 * depth; array items are keyed by their index.
 * @see https://docs.discord.com/developers/reference#error-messages
 */
export function flattenFieldErrors(
  errors: unknown,
  path = ''
): DiscordFieldError[] {
  if (typeof errors !== 'object' || errors === null) return [];
  const found: DiscordFieldError[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (key === '_errors') {
      if (!Array.isArray(value)) continue;
      for (const error of value) {
        found.push({
          path,
          code: String(error?.code ?? ''),
          message: String(error?.message ?? ''),
        });
      }
      continue;
    }
    const child = /^\d+$/.test(key)
      ? `${path}[${key}]`
      : path === ''
        ? key
        : `${path}.${key}`;
    found.push(...flattenFieldErrors(value, child));
  }
  return found;
}

/** Discord answered a request with an error. */
export class DiscordApiError extends Error {
  override readonly name = 'DiscordApiError';
  /** The HTTP status of the response (403, 404...). */
  readonly status: number;
  /**
   * The JSON error code of Discord (50013 for "Missing Permissions"...), or
   * 0 when the response had none.
   * @see https://docs.discord.com/developers/topics/opcodes-and-status-codes#json-json-error-codes
   */
  readonly code: number;
  /** The fields of the request Discord refused, when it says which. */
  readonly fieldErrors: readonly DiscordFieldError[];
  /** The HTTP method of the request that failed. */
  readonly method: HttpMethod;
  /** The path of the endpoint as written in the documentation. */
  readonly route: string;

  constructor(input: {
    status: number;
    method: HttpMethod;
    route: string;
    body: unknown;
  }) {
    const body =
      typeof input.body === 'object' && input.body !== null
        ? (input.body as Record<string, unknown>)
        : {};
    const code = typeof body.code === 'number' ? body.code : 0;
    const fieldErrors = flattenFieldErrors(body.errors);
    const reason =
      typeof body.message === 'string' && body.message !== ''
        ? body.message
        : ((typeof body.code === 'number'
            ? JSON_ERROR_CODES[code]
            : undefined) ?? `HTTP ${input.status}`);
    const details = fieldErrors
      .map(error => `\n  ${error.path || 'request'}: ${error.message}`)
      .join('');
    super(
      `Discord refused ${input.method} ${input.route}: ${reason} (${code || input.status})${details}`
    );
    this.status = input.status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.method = input.method;
    this.route = input.route;
  }
}

/** A request could not reach Discord, or Discord kept failing. */
export class DiscordUnavailableError extends Error {
  override readonly name = 'DiscordUnavailableError';
  /** The HTTP method of the request that failed. */
  readonly method: HttpMethod;
  /** The path of the endpoint as written in the documentation. */
  readonly route: string;

  constructor(method: HttpMethod, route: string, cause: unknown) {
    super(
      `Discord could not be reached for ${method} ${route}. Check your internet connection and https://discordstatus.com, then try again.`,
      { cause }
    );
    this.method = method;
    this.route = route;
  }
}

/** The bot token was refused: no request can succeed until it is fixed. */
export class InvalidTokenError extends Error {
  override readonly name = 'InvalidTokenError';

  constructor() {
    super(
      'Discord refused the bot token. Copy it again from the Developer Portal (your application → Bot → Reset Token) into BOT_TOKEN in your .env file.'
    );
  }
}
