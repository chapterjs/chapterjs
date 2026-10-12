import { fakeRedis } from '@chapterjs/test-utils';
import { createServer } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { RedisClient } from '../src/redis/client.js';
import {
  encodeCommand,
  RedisError,
  ReplyReader,
} from '../src/redis/protocol.js';
import { describeRedis, parseRedisUrl } from '../src/redis/url.js';
import { readDevEnv, readStartEnv } from '../src/cli/env.js';
import { tempDir } from '@chapterjs/test-utils';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const address = (fake: { host: string; port: number }, extra = {}) => ({
  host: fake.host,
  port: fake.port,
  tls: false,
  username: null,
  password: null,
  db: 0,
  ...extra,
});

/** A client closed when the test ends, with short retries. */
function client(
  fake: { host: string; port: number },
  options: Partial<
    ConstructorParameters<typeof RedisClient>[1] & { address: object }
  > = {}
) {
  const { address: extra, ...rest } = options;
  const created = new RedisClient(address(fake, extra ?? {}), {
    retryDelay: 20,
    maxRetryDelay: 100,
    connectTimeout: 2000,
    ...rest,
  });
  return created;
}

const until = async (check: () => boolean, timeout = 3000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

describe('the RESP protocol', () => {
  it('writes a command as an array of bulk strings', () => {
    expect(encodeCommand(['SET', 'k', 'héllo', 'PX', 1500]).toString()).toBe(
      '*5\r\n$3\r\nSET\r\n$1\r\nk\r\n$6\r\nhéllo\r\n$2\r\nPX\r\n$4\r\n1500\r\n'
    );
    expect(encodeCommand(['PING']).toString()).toBe('*1\r\n$4\r\nPING\r\n');
    expect(encodeCommand(['SET', 'k', '']).toString()).toBe(
      '*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$0\r\n\r\n'
    );
  });

  it.each([
    ['a simple string', '+OK\r\n', 'OK'],
    ['an integer', ':42\r\n', 42],
    ['a negative integer', ':-2\r\n', -2],
    ['a bulk string', '$5\r\nhello\r\n', 'hello'],
    ['an empty bulk string', '$0\r\n\r\n', ''],
    ['a bulk string with CRLF inside', '$7\r\na\r\nb\r\nc\r\n', 'a\r\nb\r\nc'],
    ['unicode', '$6\r\nhéllo\r\n', 'héllo'],
    ['a null bulk string', '$-1\r\n', null],
    ['an empty array', '*0\r\n', []],
    ['a null array', '*-1\r\n', null],
    [
      'a nested array',
      '*2\r\n$1\r\n0\r\n*2\r\n$3\r\nk:1\r\n:7\r\n',
      ['0', ['k:1', 7]],
    ],
  ])('reads %s', (_, wire, expected) => {
    const reader = new ReplyReader();
    reader.push(Buffer.from(wire));
    expect(reader.next()).toEqual(expected);
    expect(reader.next()).toBeUndefined();
  });

  it('reads an error as a RedisError with its code', () => {
    const reader = new ReplyReader();
    reader.push(Buffer.from('-WRONGPASS invalid username-password pair\r\n'));
    const reply = reader.next();
    expect(reply).toBeInstanceOf(RedisError);
    expect((reply as unknown as RedisError).code).toBe('WRONGPASS');
    expect((reply as unknown as RedisError).message).toBe(
      'WRONGPASS invalid username-password pair'
    );
  });

  it('reads a reply cut anywhere, and several replies in one piece', () => {
    const wire = Buffer.from('+OK\r\n$5\r\nhello\r\n*2\r\n:1\r\n$-1\r\n:3\r\n');
    const expected = ['OK', 'hello', [1, null], 3];
    for (let cut = 1; cut < wire.length; cut++) {
      const reader = new ReplyReader();
      const got: unknown[] = [];
      for (const chunk of [wire.subarray(0, cut), wire.subarray(cut)]) {
        reader.push(chunk);
        let reply;
        while ((reply = reader.next()) !== undefined) got.push(reply);
      }
      expect(got, `cut at ${cut}`).toEqual(expected);
    }
    // One byte at a time, the hardest case.
    const reader = new ReplyReader();
    const got: unknown[] = [];
    for (const byte of wire) {
      reader.push(Buffer.from([byte]));
      let reply;
      while ((reply = reader.next()) !== undefined) got.push(reply);
    }
    expect(got).toEqual(expected);
  });

  it('reads a huge bulk string', () => {
    const big = 'x'.repeat(5_000_000);
    const reader = new ReplyReader();
    reader.push(Buffer.from(`$${big.length}\r\n`));
    expect(reader.next()).toBeUndefined();
    reader.push(Buffer.from(`${big}\r\n`));
    expect(reader.next()).toBe(big);
  });

  it('refuses what is not RESP', () => {
    const reader = new ReplyReader();
    reader.push(Buffer.from('HTTP/1.1 400 Bad Request\r\n'));
    expect(() => reader.next()).toThrow(
      'Redis answered something that is not RESP (a line starting with "H"): is REDIS_URL the address of a Redis server?'
    );
  });
});

describe('REDIS_URL', () => {
  it.each([
    [
      'redis://localhost:6379',
      {
        host: 'localhost',
        port: 6379,
        tls: false,
        username: null,
        password: null,
        db: 0,
      },
    ],
    [
      'redis://localhost',
      {
        host: 'localhost',
        port: 6379,
        tls: false,
        username: null,
        password: null,
        db: 0,
      },
    ],
    [
      'rediss://cache.example.com:6380/2',
      {
        host: 'cache.example.com',
        port: 6380,
        tls: true,
        username: null,
        password: null,
        db: 2,
      },
    ],
    [
      'redis://:s3cret@10.0.0.1:6379',
      {
        host: '10.0.0.1',
        port: 6379,
        tls: false,
        username: null,
        password: 's3cret',
        db: 0,
      },
    ],
    [
      'redis://bot:p%40ss@host:1/1',
      {
        host: 'host',
        port: 1,
        tls: false,
        username: 'bot',
        password: 'p@ss',
        db: 1,
      },
    ],
    [
      'redis://[::1]:6379/',
      {
        host: '::1',
        port: 6379,
        tls: false,
        username: null,
        password: null,
        db: 0,
      },
    ],
  ])('reads %s', (url, expected) => {
    expect(parseRedisUrl(url, '')).toEqual({ address: expected });
  });

  it('takes REDIS_PASSWORD over the password of the URL', () => {
    const parsed = parseRedisUrl('redis://bot:old@host', 'new');
    expect(parsed).toEqual({
      address: {
        host: 'host',
        port: 6379,
        tls: false,
        username: 'bot',
        password: 'new',
        db: 0,
      },
    });
  });

  it.each([
    ['localhost:6379', 'is not an address.'],
    ['', 'is not an address.'],
    [
      'http://localhost:6379',
      'starts with "http://", and a Redis address starts with redis:// or rediss://.',
    ],
    ['redis://', 'names no host.'],
    ['redis:///1', 'names no host.'],
    [
      'redis://localhost/one',
      'ends with "/one", and what follows the host is the number of the database.',
    ],
  ])('refuses %s', (url, problem) => {
    const parsed = parseRedisUrl(url, '');
    expect(parsed).toHaveProperty('problem');
    expect((parsed as { problem: string }).problem).toContain(problem);
    expect((parsed as { problem: string }).problem).toContain(
      'Write it like redis://localhost:6379'
    );
  });

  it('describes an address without its password', () => {
    expect(
      describeRedis({
        host: 'h',
        port: 6379,
        tls: true,
        username: 'u',
        password: 'p',
        db: 0,
      })
    ).toBe('h:6379');
    expect(
      describeRedis({
        host: 'h',
        port: 6380,
        tls: false,
        username: null,
        password: null,
        db: 3,
      })
    ).toBe('h:6380/3');
  });

  describe('in the .env of a project', () => {
    const env = (text: string) => {
      const dir = tempDir();
      writeFileSync(join(dir, '.env'), text);
      return dir;
    };
    const base = 'BOT_TOKEN=abc.def.ghi\nDEV_GUILD_ID=123456789012345678\n';

    it('is optional, and read with REDIS_PASSWORD by dev and start', async () => {
      expect(await readDevEnv(env(base), {})).toEqual({
        env: {
          token: 'abc.def.ghi',
          devGuildId: '123456789012345678',
          redis: null,
        },
      });
      const dir = env(
        `${base}REDIS_URL=redis://localhost:6379/1\nREDIS_PASSWORD=pw\n`
      );
      const expected = {
        host: 'localhost',
        port: 6379,
        tls: false,
        username: null,
        password: 'pw',
        db: 1,
      };
      expect(await readDevEnv(dir, {})).toMatchObject({
        env: { redis: expected },
      });
      expect(await readStartEnv(dir, {})).toMatchObject({
        env: { redis: expected },
      });
      // The real environment wins.
      expect(
        await readStartEnv(dir, {
          REDIS_URL: 'rediss://other:6380',
          REDIS_PASSWORD: '',
        })
      ).toMatchObject({
        env: {
          redis: {
            host: 'other',
            port: 6380,
            tls: true,
            password: null,
            db: 0,
          },
        },
      });
    });

    it('explains a wrong REDIS_URL, and a REDIS_PASSWORD alone', async () => {
      expect(
        await readDevEnv(env(`${base}REDIS_URL=localhost:6379\n`), {})
      ).toEqual({
        problems: [
          '.env: REDIS_URL is not an address. Write it like redis://localhost:6379 (rediss:// for a TLS connection, /1 at the end for a database other than 0), with the user and password when there are some: redis://user:password@host:6379.',
        ],
      });
      expect(await readStartEnv(env(`${base}REDIS_PASSWORD=pw\n`), {})).toEqual(
        {
          problems: [
            '.env: REDIS_PASSWORD is set, but REDIS_URL is not.\nAdd REDIS_URL, the address of your Redis (like redis://localhost:6379), or remove REDIS_PASSWORD.',
          ],
        }
      );
      // Without a file, the environment is named.
      expect(
        await readStartEnv(tempDir(), {
          BOT_TOKEN: 'abc.def',
          REDIS_URL: 'nope',
        })
      ).toEqual({
        problems: [
          expect.stringMatching(/^Environment: REDIS_URL is not an address\./),
        ],
      });
      // Said with the other problems, at once.
      const read = await readDevEnv(
        env('BOT_TOKEN=\nDEV_GUILD_ID=\nREDIS_URL=x\n'),
        {}
      );
      expect('problems' in read && read.problems).toHaveLength(3);
    });
  });
});

describe('the Redis client', () => {
  it('connects on the first command, pipelines, and answers in order', async () => {
    const fake = await fakeRedis();
    const redis = client(fake);
    expect(redis.connected).toBe(false);
    const replies = await Promise.all([
      redis.send('SET', 'a', '1'),
      redis.send('SET', 'b', '2'),
      redis.send('GET', 'a'),
      redis.send('GET', 'nope'),
      redis.send('DEL', 'a', 'b'),
      redis.send('PING'),
    ]);
    expect(replies).toEqual(['OK', 'OK', '1', null, 2, 'PONG']);
    expect(redis.connected).toBe(true);
    expect(fake.connections).toHaveLength(1);
    expect(fake.commands.map(args => args[0])).toEqual([
      'SET',
      'SET',
      'GET',
      'GET',
      'DEL',
      'PING',
    ]);
    expect(redis.where).toBe(`127.0.0.1:${fake.port}`);
    await redis.close();
    await until(() => fake.connections[0]!.closed);
  });

  it('logs in with a password, or a user and a password, and picks the database first', async () => {
    const fake = await fakeRedis({ password: 'pw' });
    const redis = client(fake, { address: { password: 'pw', db: 3 } });
    await redis.send('SET', 'k', 'v');
    expect(fake.connections[0]!.commands).toEqual([
      ['AUTH', 'pw'],
      ['SELECT', '3'],
      ['SET', 'k', 'v'],
    ]);
    expect(fake.get('k', 3)).toBe('v');
    expect(fake.get('k')).toBeUndefined();
    await redis.close();

    fake.behavior.username = 'bot';
    const named = client(fake, {
      address: { username: 'bot', password: 'pw' },
    });
    expect(await named.send('PING')).toBe('PONG');
    expect(fake.connections[1]!.commands[0]).toEqual(['AUTH', 'bot', 'pw']);
    await named.close();
  });

  it('explains a wrong password, and keeps trying', async () => {
    const fake = await fakeRedis({ password: 'right' });
    const errors: string[] = [];
    const redis = client(fake, {
      address: { password: 'wrong' },
      onError: message => errors.push(message),
    });
    await expect(redis.send('PING')).rejects.toThrow(
      `Redis at 127.0.0.1:${fake.port} refused the password: check REDIS_PASSWORD (or the password in REDIS_URL) in .env.`
    );
    await expect(redis.ping()).rejects.toThrow(
      /refused the password.*Trying again in 1 s\.$/
    );
    expect(errors).toEqual([
      `Redis at 127.0.0.1:${fake.port} refused the password: check REDIS_PASSWORD (or the password in REDIS_URL) in .env. Trying again every few seconds.`,
    ]);
    // Tries again by itself, with the same (wrong) password.
    await until(() => fake.connections.length >= 2);
    await redis.close();
  });

  it('explains a password missing, as Redis says it', async () => {
    const fake = await fakeRedis({ password: 'pw' });
    const redis = client(fake);
    await expect(redis.send('PING')).rejects.toThrow(
      `Redis at 127.0.0.1:${fake.port} asks for a password: set REDIS_PASSWORD (or the password in REDIS_URL) in .env.`
    );
    await redis.close();
  });

  it('explains nothing answering there, and a host unknown', async () => {
    const errors: string[] = [];
    const nobody = createServer();
    await new Promise<void>(resolve => nobody.listen(0, '127.0.0.1', resolve));
    const port = (nobody.address() as { port: number }).port;
    await new Promise<void>(resolve => nobody.close(() => resolve()));
    const redis = client(
      { host: '127.0.0.1', port },
      { onError: m => errors.push(m) }
    );
    await expect(redis.ping()).rejects.toThrow(
      `Redis at 127.0.0.1:${port} can't be reached: nothing answers there. Start Redis, or check REDIS_URL in .env.`
    );
    // While waiting to try again, a command fails at once and says when.
    await expect(redis.send('PING')).rejects.toThrow(
      /nothing answers there\. Start Redis, or check REDIS_URL in \.env\. Trying again in 1 s\.$/
    );
    expect(errors).toHaveLength(1);
    await redis.close();

    const unknown = client({ host: 'no-such-host.invalid', port: 6379 });
    await expect(unknown.ping()).rejects.toThrow(
      "Redis at no-such-host.invalid:6379 can't be reached: the host is unknown. Check REDIS_URL in .env."
    );
    await unknown.close();
  });

  it('gives up a connection that does not answer in time', async () => {
    const fake = await fakeRedis({ answer: false });
    const redis = client(fake, {
      connectTimeout: 50,
      address: { password: 'pw' },
    });
    await expect(redis.ping()).rejects.toThrow(
      `Redis at 127.0.0.1:${fake.port} can't be reached: it did not answer in time.`
    );
    await redis.close();
  });

  it('refuses what is not a Redis', async () => {
    const web = createServer(socket => {
      socket.on('data', () => socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'));
    });
    await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
    const port = (web.address() as { port: number }).port;
    const redis = client({ host: '127.0.0.1', port });
    await expect(redis.send('PING')).rejects.toThrow(
      'Redis answered something that is not RESP (a line starting with "H"): is REDIS_URL the address of a Redis server?'
    );
    await redis.close();
    await new Promise<void>(resolve => web.close(() => resolve()));
  });

  it('says what Redis refused, by its message', async () => {
    const fake = await fakeRedis();
    const redis = client(fake);
    await expect(redis.send('NOPE')).rejects.toThrow(RedisError);
    await expect(redis.send('NOPE', 'x')).rejects.toThrow(
      "ERR unknown command 'NOPE', with args beginning with: 'x'"
    );
    await expect(redis.send('SELECT', '99')).rejects.toThrow(
      'ERR DB index is out of range'
    );
    // Still usable after.
    expect(await redis.send('PING')).toBe('PONG');
    await redis.close();
  });

  it('comes back after the connection was lost, and says so once', async () => {
    const fake = await fakeRedis({ password: 'pw' });
    const errors: string[] = [];
    const back = vi.fn();
    const redis = client(fake, {
      address: { password: 'pw' },
      onError: message => errors.push(message),
      onReconnect: back,
    });
    await redis.send('SET', 'k', 'v');
    // A command in flight when the connection drops fails with why.
    fake.behavior.answer = false;
    const hanging = redis.send('GET', 'k');
    await until(() => fake.connections[0]!.commands.length === 3);
    fake.behavior.answer = true;
    fake.connections[0]!.drop();
    await expect(hanging).rejects.toThrow(
      `Redis at 127.0.0.1:${fake.port} closed the connection.`
    );
    expect(errors).toEqual([
      `Redis at 127.0.0.1:${fake.port} closed the connection. Trying again every few seconds.`,
    ]);
    // Comes back by itself, logs in again, and the data is still there.
    await until(() => redis.connected);
    expect(back).toHaveBeenCalledTimes(1);
    expect(await redis.send('GET', 'k')).toBe('v');
    expect(fake.connections[1]!.commands[0]).toEqual(['AUTH', 'pw']);
    expect(errors).toHaveLength(1);
    await redis.close();
  });

  it('waits longer each time, up to a cap, and starts over once connected', async () => {
    const fake = await fakeRedis();
    const redis = client(fake, { retryDelay: 1000, maxRetryDelay: 2000 });
    await redis.ping();
    await fake.close();
    await until(() => !redis.connected);
    const delay = async (): Promise<number> => {
      try {
        await redis.send('PING');
        return 0;
      } catch (error) {
        return Number(
          /Trying again in (\d+) s/.exec((error as Error).message)?.[1]
        );
      }
    };
    // The first wait, then twice as long, then the cap.
    expect(await delay()).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 1100));
    expect(await delay()).toBe(2);
    await new Promise(resolve => setTimeout(resolve, 2100));
    expect(await delay()).toBe(2);
    // Back: the waits start over.
    const again = await fakeRedis({ port: fake.port });
    await until(() => redis.connected, 5000);
    await again.close();
    await until(() => !redis.connected);
    expect(await delay()).toBe(1);
    await redis.close();
  }, 15_000);

  it('fails every command once closed, the queued ones included', async () => {
    const fake = await fakeRedis({ answer: false });
    const redis = client(fake);
    const pending = redis.send('PING');
    await until(() => fake.connections.length === 1);
    await redis.close();
    await expect(pending).rejects.toThrow(
      `Redis at 127.0.0.1:${fake.port} is closed: the bot stopped.`
    );
    await expect(redis.send('PING')).rejects.toThrow(
      'is closed: the bot stopped.'
    );
    // Closing twice is fine.
    await redis.close();
  });

  it('refuses a PING answered by something else', async () => {
    const fake = await fakeRedis();
    const redis = client(fake);
    // The fake answers PING with its argument: a Redis that is not one.
    const original = redis.send.bind(redis);
    redis.send = (...args) =>
      original(...(args[0] === 'PING' ? ['PING', 'nope'] : args));
    await expect(redis.ping()).rejects.toThrow(
      `Redis at 127.0.0.1:${fake.port} answered "nope" to PING: is REDIS_URL the address of a Redis server?`
    );
    await redis.close();
  });
});
