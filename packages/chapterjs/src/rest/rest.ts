// The only place that sends HTTP requests to Discord.
// https://docs.discord.com/developers/reference#http-api

import { setTimeout as sleep } from 'node:timers/promises';
import {
  API_BASE_URL,
  API_VERSION,
  AUDIT_LOG_REASON_MAX_LENGTH,
  userAgent,
} from '../discord/api.js';
import { HttpStatus } from '../discord/codes.js';
import {
  fillPath,
  majorParameter,
  type Endpoint,
  type EndpointBody,
  type EndpointQuery,
  type EndpointResult,
  type PathParams,
} from '../discord/endpoint.js';
import {
  DiscordApiError,
  DiscordUnavailableError,
  InvalidTokenError,
} from './errors.js';
import {
  RateLimiter,
  rateLimitHit,
  readRateLimitHeaders,
  type RateLimitHit,
} from './rate-limiter.js';

/** A file to upload with a request. */
export interface RestFile {
  /** The name of the file, with its extension: `chart.png`. */
  name: string;
  data: Blob | Uint8Array | ArrayBuffer | string;
  /** The media type; guessed by Discord from the name when missing. */
  contentType?: string;
  /**
   * The name of the form field. By default `files[n]`, which is what
   * message attachments use.
   * @see https://docs.discord.com/developers/reference#uploading-files
   */
  field?: string;
}

export interface RequestOptions<E extends Endpoint = Endpoint> {
  body?: EndpointBody<E>;
  query?: EndpointQuery<E>;
  /**
   * Why the action is taken, shown in the audit log of the server.
   * @see https://docs.discord.com/developers/resources/audit-log#audit-log-entry-object
   */
  reason?: string;
  files?: readonly RestFile[];
  /**
   * `false` for endpoints authenticated by a token in their path (webhooks,
   * interactions): the bot token is not sent and the global limit is not
   * counted.
   */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface RestOptions {
  token: string;
  /** The version of the framework, sent in the User-Agent header. */
  version: string;
  /** Where Discord is. Only tests change it. */
  baseUrl?: string;
  /** How many times a request is tried again after a 5xx or a network error. Default: 3. */
  retries?: number;
  /** How long to wait for a response, in milliseconds. Default: 15000. */
  timeout?: number;
  /** Requests per second for the whole bot. Default: 50. */
  globalLimit?: number;
  /** Called every time a request has to wait for a rate limit. */
  onRateLimit?: (info: { route: string; ms: number; global: boolean }) => void;
}

/** The interface features use to talk to Discord over HTTP. */
export interface Rest {
  request<E extends Endpoint>(
    endpoint: E,
    params: PathParams<E['path']>,
    options?: RequestOptions<E>
  ): Promise<EndpointResult<E>>;
}

/** A 429 that is still there after this many tries is reported as an error. */
const MAX_RATE_LIMIT_RETRIES = 5;

function toQueryString(query: unknown): string {
  if (typeof query !== 'object' || query === null) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    // Arrays are sent as several instances of the same parameter.
    // https://docs.discord.com/developers/reference#array-query-strings
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

function toBlob(file: RestFile): Blob {
  if (file.data instanceof Blob) {
    return file.contentType
      ? new Blob([file.data], { type: file.contentType })
      : file.data;
  }
  const part =
    typeof file.data === 'string' || file.data instanceof ArrayBuffer
      ? file.data
      : new Uint8Array(file.data);
  return new Blob([part], file.contentType ? { type: file.contentType } : {});
}

function encodeReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed === '') {
    throw new TypeError('The reason is empty: leave it out or write one.');
  }
  if (trimmed.length > AUDIT_LOG_REASON_MAX_LENGTH) {
    throw new RangeError(
      `The reason is ${trimmed.length} characters long: Discord accepts ${AUDIT_LOG_REASON_MAX_LENGTH} at most.`
    );
  }
  return encodeURIComponent(trimmed);
}

export class RestClient implements Rest {
  readonly #token: string;
  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #retries: number;
  readonly #timeout: number;
  readonly #limiter: RateLimiter;
  /** Set after a 401: no further request is sent with a refused token. */
  #tokenRefused = false;

  constructor(options: RestOptions) {
    if (typeof options.token !== 'string' || options.token.trim() === '') {
      throw new InvalidTokenError();
    }
    this.#token = options.token.trim().replace(/^Bot\s+/i, '');
    this.#baseUrl = `${(options.baseUrl ?? API_BASE_URL).replace(/\/+$/, '')}/v${API_VERSION}`;
    this.#userAgent = userAgent(options.version);
    this.#retries = options.retries ?? 3;
    this.#timeout = options.timeout ?? 15_000;
    this.#limiter = new RateLimiter({
      globalLimit: options.globalLimit,
      onWait: options.onRateLimit,
    });
  }

  async request<E extends Endpoint>(
    endpoint: E,
    params: PathParams<E['path']>,
    options: RequestOptions<E> = {}
  ): Promise<EndpointResult<E>> {
    const auth = options.auth ?? true;
    if (auth && this.#tokenRefused) throw new InvalidTokenError();
    const { method, path } = endpoint;
    const url =
      this.#baseUrl + fillPath(path, params) + toQueryString(options.query);

    const headers: Record<string, string> = { 'User-Agent': this.#userAgent };
    if (auth) headers.Authorization = `Bot ${this.#token}`;
    if (options.reason !== undefined) {
      headers['X-Audit-Log-Reason'] = encodeReason(options.reason);
    }

    // Built once: a retry sends the same thing.
    let body: string | (() => FormData) | undefined;
    if (options.files && options.files.length > 0) {
      const files = options.files;
      const json =
        options.body === undefined ? undefined : JSON.stringify(options.body);
      body = () => {
        const form = new FormData();
        if (json !== undefined) form.set('payload_json', json);
        files.forEach((file, index) => {
          form.set(file.field ?? `files[${index}]`, toBlob(file), file.name);
        });
        return form;
      };
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }

    const route = `${method} ${path}`;
    let failures = 0;
    let rateLimits = 0;
    return this.#limiter.run(
      { route, major: majorParameter(path, params), countsForGlobal: auth },
      async update => {
        for (;;) {
          let response: Response;
          try {
            response = await fetch(url, {
              method,
              headers,
              body: typeof body === 'function' ? body() : body,
              signal: options.signal
                ? AbortSignal.any([
                    options.signal,
                    AbortSignal.timeout(this.#timeout),
                  ])
                : AbortSignal.timeout(this.#timeout),
            });
          } catch (error) {
            if (options.signal?.aborted) throw options.signal.reason;
            if (failures++ >= this.#retries) {
              throw new DiscordUnavailableError(method, path, error);
            }
            await sleep(250 * 2 ** (failures - 1));
            continue;
          }

          update(readRateLimitHeaders(response.headers));

          if (response.status === HttpStatus.TooManyRequests) {
            const data = await readBody(response);
            const retryAfter =
              typeof (data as { retry_after?: unknown })?.retry_after ===
              'number'
                ? (data as { retry_after: number }).retry_after
                : Number(response.headers.get('retry-after') ?? 1);
            if (rateLimits++ >= MAX_RATE_LIMIT_RETRIES) {
              throw new DiscordApiError({
                status: response.status,
                method,
                route: path,
                body: data,
              });
            }
            return rateLimitHit({
              retryAfter: Number.isFinite(retryAfter) ? retryAfter : 1,
              scope: response.headers.get('x-ratelimit-scope'),
              global:
                response.headers.get('x-ratelimit-global') === 'true' ||
                (data as { global?: unknown })?.global === true,
            } satisfies RateLimitHit);
          }

          if (response.status >= 500) {
            if (failures++ >= this.#retries) {
              throw new DiscordUnavailableError(
                method,
                path,
                new Error(`HTTP ${response.status}`)
              );
            }
            await response.body?.cancel();
            await sleep(250 * 2 ** (failures - 1));
            continue;
          }

          const data = await readBody(response);
          if (response.ok) return data as EndpointResult<E>;
          if (response.status === HttpStatus.Unauthorized && auth) {
            this.#tokenRefused = true;
            throw new InvalidTokenError();
          }
          throw new DiscordApiError({
            status: response.status,
            method,
            route: path,
            body: data,
          });
        }
      }
    );
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === HttpStatus.NoContent) return undefined;
  const text = await response.text();
  if (text === '') return undefined;
  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}
