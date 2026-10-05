import { fakeDiscord, type FakeDiscord } from '@chapterjs/test-utils';
import { describe, expect, it } from 'vitest';
import * as Endpoints from '../src/discord/endpoints.js';
import {
  DiscordApiError,
  DiscordUnavailableError,
  flattenFieldErrors,
  InvalidTokenError,
} from '../src/rest/errors.js';
import { RestClient, type RestOptions } from '../src/rest/rest.js';

function client(discord: FakeDiscord, options: Partial<RestOptions> = {}) {
  return new RestClient({
    token: 'test-token',
    version: '9.9.9',
    baseUrl: discord.url,
    ...options,
  });
}

const user = { id: '1', username: 'bob', discriminator: '0' };

describe('a request', () => {
  it('goes to the versioned URL with the headers Discord requires', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/users/1', { body: user });
    const result = await client(discord).request(Endpoints.GetUser, ['1']);

    expect(result).toEqual(user);
    expect(discord.requests).toHaveLength(1);
    const [request] = discord.requests;
    expect(request!.headers.authorization).toBe('Bot test-token');
    expect(request!.headers['user-agent']).toMatch(
      /^DiscordBot \(\S+, 9\.9\.9\)$/
    );
    expect(request!.headers['content-type']).toBeUndefined();
    expect(request!.body).toBeUndefined();
  });

  it('accepts a token pasted with its "Bot " prefix or with spaces', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/users/1', { body: user });
    await client(discord, { token: '  Bot  abc ' }).request(Endpoints.GetUser, [
      '1',
    ]);
    expect(discord.requests[0]!.headers.authorization).toBe('Bot abc');
  });

  it.each(['', '   ', undefined, null, 42])(
    'refuses the token %j before any request',
    token => {
      expect(
        () => new RestClient({ token: token as string, version: '1' })
      ).toThrow(InvalidTokenError);
    }
  );

  it('sends the body as JSON', async () => {
    const discord = await fakeDiscord();
    discord.on('POST', '/channels/5/messages', { body: { id: '9' } });
    await client(discord).request(Endpoints.CreateMessage, ['5'], {
      body: { content: 'héllo 👋' },
    });
    const [request] = discord.requests;
    expect(request!.headers['content-type']).toBe('application/json');
    expect(request!.body).toEqual({ content: 'héllo 👋' });
  });

  it('writes query strings as Discord reads them', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/guilds/1/messages/search', { body: {} });
    await client(discord).request(Endpoints.SearchGuildMessages, ['1'], {
      query: {
        limit: 5,
        pinned: false,
        author_id: ['1', '2'],
        content: 'a b&c',
        max_id: undefined,
      },
    });
    expect(discord.requests[0]!.query).toEqual({
      limit: ['5'],
      pinned: ['false'],
      author_id: ['1', '2'],
      content: ['a b&c'],
    });
  });

  it('returns nothing for a 204', async () => {
    const discord = await fakeDiscord();
    discord.on('DELETE', '/channels/5/messages/9', {});
    await expect(
      client(discord).request(Endpoints.DeleteMessage, ['5', '9'])
    ).resolves.toBeUndefined();
  });

  it('returns text when the response is not JSON', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/invites/abc/target-users', { body: 'user_id\n1\n2' });
    await expect(
      client(discord).request(Endpoints.GetTargetUsers, ['abc'])
    ).resolves.toBe('user_id\n1\n2');
  });

  it('sends the reason URL-encoded in the audit log header', async () => {
    const discord = await fakeDiscord();
    discord.on('DELETE', '/guilds/1/members/2', {});
    await client(discord).request(Endpoints.RemoveGuildMember, ['1', '2'], {
      reason: '  spam: été 🔥\nline ',
    });
    expect(discord.requests[0]!.headers['x-audit-log-reason']).toBe(
      encodeURIComponent('spam: été 🔥\nline')
    );
  });

  it.each([
    ['', /reason is empty/],
    ['   ', /reason is empty/],
    ['x'.repeat(513), /513 characters long: Discord accepts 512/],
  ])(
    'refuses the reason %j without sending anything',
    async (reason, message) => {
      const discord = await fakeDiscord();
      await expect(
        client(discord).request(Endpoints.RemoveGuildMember, ['1', '2'], {
          reason,
        })
      ).rejects.toThrow(message);
      expect(discord.requests).toHaveLength(0);
    }
  );

  it('accepts a reason of exactly 512 characters', async () => {
    const discord = await fakeDiscord();
    discord.on('DELETE', '/guilds/1/members/2', {});
    await client(discord).request(Endpoints.RemoveGuildMember, ['1', '2'], {
      reason: 'é'.repeat(512),
    });
    expect(discord.requests).toHaveLength(1);
  });

  it('uploads files as multipart, next to the JSON payload', async () => {
    const discord = await fakeDiscord();
    discord.on('POST', '/channels/5/messages', { body: { id: '9' } });
    await client(discord).request(Endpoints.CreateMessage, ['5'], {
      body: { content: 'look', attachments: [{ id: 0, filename: 'a.txt' }] },
      files: [
        { name: 'a.txt', data: 'hello', contentType: 'text/plain' },
        { name: 'b.bin', data: new Uint8Array([104, 105]) },
      ],
    });
    const [request] = discord.requests;
    expect(request!.headers['content-type']).toMatch(
      /^multipart\/form-data; boundary=/
    );
    expect(request!.body).toEqual({
      content: 'look',
      attachments: [{ id: 0, filename: 'a.txt' }],
    });
    expect(request!.files['files[0]']).toMatchObject({
      name: 'a.txt',
      type: 'text/plain',
      text: 'hello',
    });
    expect(request!.files['files[1]']).toMatchObject({
      name: 'b.bin',
      text: 'hi',
    });
  });

  it('uploads a file under the field an endpoint asks for', async () => {
    const discord = await fakeDiscord();
    discord.on('POST', '/guilds/1/stickers', { body: { id: '3' } });
    await client(discord).request(Endpoints.CreateGuildSticker, ['1'], {
      files: [{ name: 's.png', data: new Blob(['png']), field: 'file' }],
    });
    expect(Object.keys(discord.requests[0]!.files)).toEqual(['file']);
    expect(discord.requests[0]!.body).toBeUndefined();
  });

  it('leaves the bot token out when the path authenticates the request', async () => {
    const discord = await fakeDiscord();
    discord.on('POST', '/webhooks/3/tok', { body: { id: '9' } });
    await client(discord).request(Endpoints.ExecuteWebhook, ['3', 'tok'], {
      body: { content: 'hi' },
      auth: false,
    });
    expect(discord.requests[0]!.headers.authorization).toBeUndefined();
  });

  it('refuses wrong path values before sending', async () => {
    const discord = await fakeDiscord();
    await expect(
      client(discord).request(Endpoints.GetUser, [''] as [string])
    ).rejects.toThrow(/non-empty text for \{user\.id\}/);
    expect(discord.requests).toHaveLength(0);
  });
});

describe('an error of Discord', () => {
  it('says what was refused, with the code and the fields', async () => {
    const discord = await fakeDiscord();
    discord.on('POST', '/channels/5/messages', {
      status: 400,
      body: {
        code: 50035,
        message: 'Invalid Form Body',
        errors: {
          embeds: {
            0: {
              title: {
                _errors: [
                  {
                    code: 'BASE_TYPE_MAX_LENGTH',
                    message: 'Must be 256 or fewer in length.',
                  },
                ],
              },
            },
          },
        },
      },
    });
    const error = await client(discord)
      .request(Endpoints.CreateMessage, ['5'], { body: {} })
      .catch(error => error);

    expect(error).toBeInstanceOf(DiscordApiError);
    expect(error).toMatchObject({
      name: 'DiscordApiError',
      status: 400,
      code: 50035,
      method: 'POST',
      route: '/channels/{channel.id}/messages',
      fieldErrors: [
        {
          path: 'embeds[0].title',
          code: 'BASE_TYPE_MAX_LENGTH',
          message: 'Must be 256 or fewer in length.',
        },
      ],
    });
    expect(error.message).toBe(
      'Discord refused POST /channels/{channel.id}/messages: Invalid Form Body (50035)\n  embeds[0].title: Must be 256 or fewer in length.'
    );
    // One try: a 4xx is never sent again.
    expect(discord.requests).toHaveLength(1);
  });

  it.each([
    [
      403,
      { code: 50013, message: 'Missing Permissions' },
      50013,
      /Missing Permissions \(50013\)/,
    ],
    [404, { code: 10003 }, 10003, /Unknown channel \(10003\)/],
    [404, 'not json', 0, /HTTP 404 \(404\)/],
    [400, { message: '' }, 0, /HTTP 400 \(400\)/],
    [400, { code: 0 }, 0, /General error.*\(400\)/],
  ])('reports a %s', async (status, body, code, message) => {
    const discord = await fakeDiscord();
    discord.on('GET', '/channels/5', { status, body });
    const error = await client(discord)
      .request(Endpoints.GetChannel, ['5'])
      .catch(error => error);
    expect(error).toBeInstanceOf(DiscordApiError);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(message);
  });

  it('flattens every shape of field error', () => {
    expect(
      flattenFieldErrors({
        _errors: [{ code: 'A', message: 'whole request' }],
        access_token: { _errors: [{ code: 'B', message: 'object' }] },
        activities: {
          0: {
            platform: {
              _errors: [
                { code: 'C', message: 'array' },
                { code: 'D', message: 'second' },
              ],
            },
          },
        },
      })
    ).toEqual([
      { path: '', code: 'A', message: 'whole request' },
      { path: 'access_token', code: 'B', message: 'object' },
      { path: 'activities[0].platform', code: 'C', message: 'array' },
      { path: 'activities[0].platform', code: 'D', message: 'second' },
    ]);
    expect(flattenFieldErrors(undefined)).toEqual([]);
    expect(flattenFieldErrors('nope')).toEqual([]);
    expect(flattenFieldErrors({ a: { _errors: 'nope' } })).toEqual([]);
  });

  it('stops sending requests once the token was refused', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/users/1', {
      status: 401,
      body: { code: 0, message: '401: Unauthorized' },
    });
    const rest = client(discord);
    await expect(rest.request(Endpoints.GetUser, ['1'])).rejects.toThrow(
      InvalidTokenError
    );
    await expect(rest.request(Endpoints.GetUser, ['1'])).rejects.toThrow(
      /BOT_TOKEN/
    );
    expect(discord.requests).toHaveLength(1);
  });

  it('does not blame the bot token for a 401 on a webhook token', async () => {
    const discord = await fakeDiscord();
    discord.on('POST', '/webhooks/3/bad', {
      status: 401,
      body: { code: 50027 },
    });
    discord.on('GET', '/users/1', { body: user });
    const rest = client(discord);
    await expect(
      rest.request(Endpoints.ExecuteWebhook, ['3', 'bad'], {
        body: {},
        auth: false,
      })
    ).rejects.toThrow(DiscordApiError);
    await expect(rest.request(Endpoints.GetUser, ['1'])).resolves.toEqual(user);
  });
});

describe('when Discord has trouble', () => {
  it('tries again after a 5xx', async () => {
    const discord = await fakeDiscord();
    discord.on(
      'GET',
      '/users/1',
      { status: 502, body: 'bad gateway' },
      { status: 500 },
      { body: user }
    );
    await expect(
      client(discord).request(Endpoints.GetUser, ['1'])
    ).resolves.toEqual(user);
    expect(discord.requests).toHaveLength(3);
  });

  it('gives up after the allowed number of retries', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/users/1', { status: 503 });
    const error = await client(discord, { retries: 1 })
      .request(Endpoints.GetUser, ['1'])
      .catch(error => error);
    expect(error).toBeInstanceOf(DiscordUnavailableError);
    expect(error.message).toMatch(
      /could not be reached for GET \/users\/\{user\.id\}/
    );
    expect(error.message).toMatch(/discordstatus\.com/);
    expect(discord.requests).toHaveLength(2);
  });

  it('reports a server that cannot be reached', async () => {
    const error = await new RestClient({
      token: 't',
      version: '1',
      baseUrl: 'http://127.0.0.1:1',
      retries: 0,
    })
      .request(Endpoints.GetUser, ['1'])
      .catch(error => error);
    expect(error).toBeInstanceOf(DiscordUnavailableError);
    expect(error.cause).toBeDefined();
  });

  it('gives up on a response that takes too long', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/users/1', { body: user, delay: 300 });
    await expect(
      client(discord, { timeout: 50, retries: 0 }).request(Endpoints.GetUser, [
        '1',
      ])
    ).rejects.toThrow(DiscordUnavailableError);
  });

  it('stops when the caller cancels', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/users/1', { body: user, delay: 300 });
    const controller = new AbortController();
    const pending = client(discord).request(Endpoints.GetUser, ['1'], {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new Error('cancelled by the test')), 30);
    await expect(pending).rejects.toThrow('cancelled by the test');
    expect(discord.requests).toHaveLength(1);
  });
});

describe('rate limits', () => {
  const limited = (retryAfter: number, extra: Record<string, string> = {}) => ({
    status: 429,
    body: {
      message: 'You are being rate limited.',
      retry_after: retryAfter,
      global: false,
    },
    headers: { 'retry-after': String(retryAfter), ...extra },
  });

  it('waits and sends again after a 429', async () => {
    const discord = await fakeDiscord();
    discord.on(
      'GET',
      '/users/1',
      limited(0.08, { 'x-ratelimit-scope': 'user' }),
      { body: user }
    );
    const waits: { route: string; ms: number; global: boolean }[] = [];
    const started = Date.now();
    const result = await client(discord, {
      onRateLimit: info => waits.push(info),
    }).request(Endpoints.GetUser, ['1']);
    expect(result).toEqual(user);
    expect(Date.now() - started).toBeGreaterThanOrEqual(75);
    expect(discord.requests).toHaveLength(2);
    expect(waits).toEqual([
      { route: 'GET /users/{user.id}', ms: 80, global: false },
    ]);
  });

  it('pauses every request after a global 429', async () => {
    const discord = await fakeDiscord();
    discord.on(
      'GET',
      '/users/1',
      {
        status: 429,
        body: { message: 'global', retry_after: 0.1, global: true },
        headers: {
          'x-ratelimit-global': 'true',
          'x-ratelimit-scope': 'global',
        },
      },
      { body: user }
    );
    discord.on('GET', '/channels/5', { body: { id: '5', type: 0 } });
    const waits: { global: boolean }[] = [];
    const rest = client(discord, { onRateLimit: info => waits.push(info) });
    const first = rest.request(Endpoints.GetUser, ['1']);
    await new Promise(resolve => setTimeout(resolve, 40));
    // Another route, another bucket: still has to wait for the global limit.
    const started = Date.now();
    await rest.request(Endpoints.GetChannel, ['5']);
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    await first;
    expect(waits.every(wait => wait.global)).toBe(true);
    expect(waits.length).toBeGreaterThanOrEqual(2);
  });

  it('gives up when the limit never lifts', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/users/1', limited(0.001));
    const error = await client(discord)
      .request(Endpoints.GetUser, ['1'])
      .catch(error => error);
    expect(error).toBeInstanceOf(DiscordApiError);
    expect(error.status).toBe(429);
    expect(discord.requests).toHaveLength(6);
  });

  it('waits for the reset of a bucket instead of hitting a 429', async () => {
    const discord = await fakeDiscord();
    discord.on('GET', '/channels/5/messages', {
      body: [],
      headers: {
        'x-ratelimit-bucket': 'abc',
        'x-ratelimit-limit': '1',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '0.1',
      },
    });
    const waits: number[] = [];
    const rest = client(discord, { onRateLimit: info => waits.push(info.ms) });
    await rest.request(Endpoints.GetChannelMessages, ['5']);
    const started = Date.now();
    await rest.request(Endpoints.GetChannelMessages, ['5']);
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(50);
    expect(waits[0]).toBeLessThanOrEqual(100);
  });

  it('counts each top-level resource apart', async () => {
    const discord = await fakeDiscord();
    const exhausted = {
      body: [],
      headers: {
        'x-ratelimit-bucket': 'abc',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset-after': '0.3',
      },
    };
    discord.on('GET', '/channels/5/messages', exhausted);
    discord.on('GET', '/channels/6/messages', exhausted);
    const waits: number[] = [];
    const rest = client(discord, { onRateLimit: info => waits.push(info.ms) });
    await rest.request(Endpoints.GetChannelMessages, ['5']);
    // Channel 6 has its own count: no wait.
    await rest.request(Endpoints.GetChannelMessages, ['6']);
    expect(waits).toEqual([]);
  });

  it('shares the limit between routes of the same bucket', async () => {
    const discord = await fakeDiscord();
    const headers = {
      'x-ratelimit-bucket': 'shared-bucket',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset-after': '0.1',
    };
    discord.on('GET', '/guilds/1/roles', { body: [], headers }, { body: [] });
    discord.on(
      'GET',
      '/guilds/1/channels',
      { body: [], headers },
      { body: [] }
    );
    const waits: string[] = [];
    const rest = client(discord, {
      onRateLimit: info => waits.push(info.route),
    });
    // Both routes first learn they belong to the same bucket…
    await rest.request(Endpoints.GetGuildRoles, ['1']);
    await rest.request(Endpoints.GetGuildChannels, ['1']);
    // …then the first one has to wait for the limit the second one used up.
    await rest.request(Endpoints.GetGuildRoles, ['1']);
    expect(waits).toContain('GET /guilds/{guild.id}/roles');
  });

  it('sends the requests of a bucket one at a time, in order', async () => {
    const discord = await fakeDiscord();
    let active = 0;
    let most = 0;
    discord.on('POST', '/channels/5/messages', async request => {
      active++;
      most = Math.max(most, active);
      await new Promise(resolve => setTimeout(resolve, 20));
      active--;
      return { body: { id: (request.body as { content: string }).content } };
    });
    const rest = client(discord);
    const results = await Promise.all(
      ['a', 'b', 'c', 'd'].map(content =>
        rest.request(Endpoints.CreateMessage, ['5'], { body: { content } })
      )
    );
    expect(most).toBe(1);
    expect(results.map(result => result.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(
      discord.requests.map(r => (r.body as { content: string }).content)
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sends requests of different buckets at the same time', async () => {
    const discord = await fakeDiscord();
    let active = 0;
    let most = 0;
    const slow = async () => {
      active++;
      most = Math.max(most, active);
      await new Promise(resolve => setTimeout(resolve, 40));
      active--;
      return { body: [] };
    };
    discord.on('GET', '/channels/5/messages', slow);
    discord.on('GET', '/channels/6/messages', slow);
    discord.on('GET', '/guilds/1/roles', slow);
    const rest = client(discord);
    await Promise.all([
      rest.request(Endpoints.GetChannelMessages, ['5']),
      rest.request(Endpoints.GetChannelMessages, ['6']),
      rest.request(Endpoints.GetGuildRoles, ['1']),
    ]);
    expect(most).toBe(3);
  });

  it('keeps a failed request from blocking the next one of its bucket', async () => {
    const discord = await fakeDiscord();
    discord.on(
      'GET',
      '/users/1',
      { status: 404, body: { code: 10013 } },
      { body: user }
    );
    const rest = client(discord);
    await expect(rest.request(Endpoints.GetUser, ['1'])).rejects.toThrow(
      /Unknown user/i
    );
    await expect(rest.request(Endpoints.GetUser, ['1'])).resolves.toEqual(user);
  });

  it('never sends more than the global limit per second', async () => {
    const discord = await fakeDiscord();
    const times: number[] = [];
    for (const id of ['1', '2', '3', '4', '5']) {
      discord.on('GET', `/users/${id}`, () => {
        times.push(Date.now());
        return { body: user };
      });
    }
    const rest = client(discord, { globalLimit: 2 });
    // Different users share one route, hence one bucket: use other routes.
    discord.on(
      'GET',
      '/channels/1',
      () => (times.push(Date.now()), { body: {} })
    );
    discord.on(
      'GET',
      '/guilds/1',
      () => (times.push(Date.now()), { body: {} })
    );
    discord.on(
      'GET',
      '/stickers/1',
      () => (times.push(Date.now()), { body: {} })
    );
    const started = Date.now();
    await Promise.all([
      rest.request(Endpoints.GetChannel, ['1']),
      rest.request(Endpoints.GetGuild, ['1']),
      rest.request(Endpoints.GetSticker, ['1']),
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(times).toHaveLength(3);
  });

  it('does not count requests authenticated by their path in the global limit', async () => {
    const discord = await fakeDiscord();
    discord.on('POST', '/webhooks/3/tok', { body: { id: '9' } });
    discord.on('POST', '/webhooks/4/tok', { body: { id: '9' } });
    discord.on('POST', '/webhooks/5/tok', { body: { id: '9' } });
    const rest = client(discord, { globalLimit: 1 });
    const started = Date.now();
    await Promise.all(
      ['3', '4', '5'].map(id =>
        rest.request(Endpoints.ExecuteWebhook, [id, 'tok'], {
          body: {},
          auth: false,
        })
      )
    );
    expect(Date.now() - started).toBeLessThan(800);
  });
});
