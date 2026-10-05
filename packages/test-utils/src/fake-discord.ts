import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { onTestFinished } from 'vitest';

/** A request the code under test sent to the fake Discord. */
export interface FakeDiscordRequest {
  method: string;
  /** The path without the API version: `/guilds/1/members`. */
  path: string;
  /** The query string parameters; repeated ones keep every value. */
  query: Record<string, string[]>;
  headers: IncomingHttpHeaders;
  /**
   * The JSON body. For a multipart request: the content of its
   * `payload_json` part.
   */
  body: unknown;
  /** The files of a multipart request, by form field name. */
  files: Record<string, { name: string; type: string; text: string }>;
}

/** What the fake Discord answers. */
export interface FakeDiscordResponse {
  /** Default: 200, or 204 when there is no body. */
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Milliseconds to wait before answering. */
  delay?: number;
}

type Responder =
  | FakeDiscordResponse
  | ((
      request: FakeDiscordRequest
    ) => FakeDiscordResponse | Promise<FakeDiscordResponse>);

export interface FakeDiscord {
  /** The base URL to give to the code under test, without the version. */
  url: string;
  /** Every request received, in order. */
  requests: FakeDiscordRequest[];
  /**
   * Sets the answer to a route. A list of answers is consumed one request
   * at a time; the last one stays. The path has no version and no query.
   */
  on(method: string, path: string, ...responses: Responder[]): void;
  /** The requests received for one route. */
  requestsTo(method: string, path: string): FakeDiscordRequest[];
}

/**
 * A local HTTP server that plays the REST API of Discord: tests run the
 * real client against it instead of mocking `fetch`. A route that was not
 * set answers 404 with Discord's "Unknown" error shape. Closed when the
 * current test ends.
 */
export async function fakeDiscord(): Promise<FakeDiscord> {
  const routes = new Map<string, Responder[]>();
  const requests: FakeDiscordRequest[] = [];

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/^\/v\d+/, '');
    const query: Record<string, string[]> = {};
    for (const [key, value] of url.searchParams)
      (query[key] ??= []).push(value);

    let body: unknown;
    const files: FakeDiscordRequest['files'] = {};
    const type = req.headers['content-type'] ?? '';
    if (type.startsWith('multipart/form-data')) {
      const form = await new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': type },
        body: raw,
      }).formData();
      for (const [field, value] of form) {
        if (typeof value === 'string') {
          if (field === 'payload_json') body = JSON.parse(value);
        } else {
          files[field] = {
            name: value.name,
            type: value.type,
            text: await value.text(),
          };
        }
      }
    } else if (raw.length > 0) {
      const text = raw.toString('utf8');
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const request: FakeDiscordRequest = {
      method: req.method ?? 'GET',
      path,
      query,
      headers: req.headers,
      body,
      files,
    };
    requests.push(request);

    const queue = routes.get(`${request.method} ${path}`);
    let responder: Responder = {
      status: 404,
      body: { message: '404: Not Found', code: 0 },
    };
    if (queue && queue.length > 0) {
      responder = queue.length > 1 ? queue.shift()! : queue[0]!;
    }
    const response =
      typeof responder === 'function' ? await responder(request) : responder;
    if (response.delay) {
      await new Promise(resolve => setTimeout(resolve, response.delay));
    }
    const hasBody = response.body !== undefined;
    const payload = !hasBody
      ? ''
      : typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body);
    res.writeHead(response.status ?? (hasBody ? 200 : 204), {
      ...(hasBody && typeof response.body !== 'string'
        ? { 'content-type': 'application/json' }
        : {}),
      ...response.headers,
    });
    res.end(payload);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(
    () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    on(method, path, ...responses) {
      routes.set(`${method} ${path}`, responses);
    },
    requestsTo(method, path) {
      return requests.filter(
        request => request.method === method && request.path === path
      );
    },
  };
}
