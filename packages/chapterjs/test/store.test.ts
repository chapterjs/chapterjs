import { fakeRedis, tempDir } from '@chapterjs/test-utils';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { setStoreBackend, type StoreBackend } from '../src/store/backend.js';
import { storeDeclaration } from '../src/store/declaration.js';
import { FileStoreBackend } from '../src/store/file-backend.js';
import { RedisClient } from '../src/redis/client.js';
import {
  escapePart,
  RedisStoreBackend,
  unescapePart,
} from '../src/store/redis-backend.js';
import {
  IpcStoreBackend,
  serveStores,
  type StoreReply,
  type StoreRequest,
} from '../src/store/ipc-backend.js';
import { currentGuildId, withGuild } from '../src/store/scope.js';
import { checkJson, store } from '../src/store/store.js';
import {
  ALICE,
  BOT,
  connected,
  GENERAL,
  GUILD,
  packageDir,
  project,
  useCommand,
  rawMessage,
  runDev,
  site,
  world,
  type FakeWorld,
} from './dev-helpers.js';

const GUILD_A = '100000000000000001';
const GUILD_B = '100000000000000002';

/** A store as the loader leaves it: bound to the name of its export. */
function declared<T>(name: string, config: Parameters<typeof store>[0] = {}) {
  const value = store<T>(config);
  storeDeclaration.read(value, site(`src/${name}.ts`, name));
  return value;
}

/** A file backend in a fresh folder, given to every store of the test. */
function fileBackend(options: { now?: () => number } = {}) {
  const dir = join(tempDir(), 'data');
  const backend = new FileStoreBackend(dir, { writeDelay: 5, ...options });
  setStoreBackend('file', backend);
  setStoreBackend('redis', null);
  return { dir, backend };
}

/** A Redis backend on a fake Redis, given to the stores kept there. */
async function redisBackend(
  options: {
    now?: () => number;
    prefix?: string;
    scanCount?: number;
    transactions?: number;
  } = {},
  existing?: Awaited<ReturnType<typeof fakeRedis>>
) {
  const fake = existing ?? (await fakeRedis());
  const client = new RedisClient(
    {
      host: fake.host,
      port: fake.port,
      tls: false,
      username: null,
      password: null,
      db: 0,
    },
    { retryDelay: 20 }
  );
  const backend = new RedisStoreBackend(client, options);
  setStoreBackend('redis', backend);
  onTestFinished(() => backend.close());
  return { fake, backend, client };
}

const inGuild = <T>(guildId: string, fn: () => Promise<T>) =>
  withGuild(guildId, fn);

describe('the current server', () => {
  it('is known inside withGuild, through awaits, and nowhere else', async () => {
    expect(currentGuildId()).toBeUndefined();
    await withGuild(GUILD_A, async () => {
      expect(currentGuildId()).toBe(GUILD_A);
      await new Promise(resolve => setTimeout(resolve, 1));
      expect(currentGuildId()).toBe(GUILD_A);
      await withGuild(GUILD_B, async () => {
        expect(currentGuildId()).toBe(GUILD_B);
      });
      expect(currentGuildId()).toBe(GUILD_A);
    });
    expect(withGuild(null, () => currentGuildId())).toBeNull();
    expect(currentGuildId()).toBeUndefined();
  });
});

describe('what a store keeps', () => {
  it.each([
    ['a text', 'hi'],
    ['a number', 3],
    ['a boolean', false],
    ['null', null],
    ['a list', [1, 'two', [3]]],
    ['a plain object', { a: 1, b: { c: [true] } }],
    ['an object without prototype', Object.create(null)],
  ])('accepts %s', (_, value) => {
    expect(() => checkJson(value)).not.toThrow();
  });

  it.each([
    ['undefined', undefined, /is undefined.*use delete\(\)/],
    ['a Date', new Date(), /the value is a Date.*Keep what you need of it/],
    ['a Map', new Map(), /is a Map/],
    ['a Set', new Set(), /is a Set/],
    ['a function', () => 1, /is a function/],
    ['a bigint', 1n, /is a bigint/],
    ['a symbol', Symbol('s'), /is a symbol/],
    ['Infinity', Infinity, /is Infinity/],
    ['NaN', NaN, /is NaN/],
    ['a class instance', new (class Warning {})(), /is a Warning/],
    [
      'a Date deep inside',
      { list: [{ at: new Date() }] },
      /the value\.list\[0\]\.at is a Date/,
    ],
  ])('refuses %s, naming where', (_, value, message) => {
    expect(() => checkJson(value)).toThrow(message);
  });
});

describe('a store', () => {
  it('reads and writes the data of the server the code runs for', async () => {
    fileBackend();
    const warnings = declared<string[]>('warnings');
    await inGuild(GUILD_A, async () => {
      expect(await warnings.get('bob')).toBeUndefined();
      await warnings.set('bob', ['spam']);
      expect(await warnings.get('bob')).toEqual(['spam']);
      expect(
        await warnings.update('bob', (list = []) => [...list, 'again'])
      ).toEqual(['spam', 'again']);
      expect(await warnings.update('alice', (list = []) => list)).toEqual([]);
    });
    // Another server has its own data.
    await inGuild(GUILD_B, async () => {
      expect(await warnings.get('bob')).toBeUndefined();
      expect(await warnings.entries()).toEqual([]);
    });
    await inGuild(GUILD_A, async () => {
      const entries = await warnings.entries();
      expect(entries.map(entry => [entry.key, entry.value]).sort()).toEqual([
        [['alice'], []],
        [['bob'], ['spam', 'again']],
      ]);
      expect(entries.every(entry => entry.expires === null)).toBe(true);
      expect(await warnings.delete('bob')).toBe(true);
      expect(await warnings.delete('bob')).toBe(false);
      expect(await warnings.get('bob')).toBeUndefined();
    });
  });

  it('is used for a server from anywhere with in()', async () => {
    fileBackend();
    const scores = declared<number>('scores');
    await scores.in(GUILD_A).set('bob', 10);
    await scores.in({ id: GUILD_B } as never).set('bob', 20);
    await inGuild(GUILD_A, async () => {
      expect(await scores.get('bob')).toBe(10);
      // in() wins over where the code runs.
      expect(await scores.in(GUILD_B).get('bob')).toBe(20);
    });
    expect(() => scores.in('' as never)).toThrow(
      'in() takes a server (a Guild) or its id'
    );
    expect(() => scores.in(undefined as never)).toThrow('in() takes a server');
  });

  it('refuses to guess the server', async () => {
    fileBackend();
    const scores = declared<number>('scores');
    await expect(scores.get('bob')).rejects.toThrow(
      "scores is a store per server, and this code does not run in one: use scores.in(guild) to say which server, or declare the store with scope: 'global'."
    );
    // A task runs for no server.
    await expect(withGuild(null, () => scores.get('bob'))).rejects.toThrow(
      'scores is a store per server'
    );
  });

  it('keeps one set of data for the whole bot with scope global', async () => {
    fileBackend();
    const settings = declared<{ prefix: string }>('settings', {
      scope: 'global',
    });
    await settings.set('main', { prefix: '!' });
    await inGuild(GUILD_A, async () => {
      expect(await settings.get('main')).toEqual({ prefix: '!' });
    });
    expect(await settings.get('main')).toEqual({ prefix: '!' });
    expect(await settings.entries()).toEqual([
      { key: ['main'], value: { prefix: '!' }, expires: null },
    ]);
  });

  it('takes keys of several parts, and lists by prefix', async () => {
    fileBackend();
    const notes = declared<string>('notes');
    await inGuild(GUILD_A, async () => {
      await notes.set(['c1', 'm1'], 'one');
      await notes.set(['c1', 'm2'], 'two');
      await notes.set(['c2', 'm3'], 'three');
      await notes.set('plain', 'four');
      expect(await notes.get(['c1', 'm2'])).toBe('two');
      expect(await notes.get(['c1'])).toBeUndefined();
      const inC1 = await notes.entries('c1');
      expect(inC1.map(entry => entry.key).sort()).toEqual([
        ['c1', 'm1'],
        ['c1', 'm2'],
      ]);
      expect((await notes.entries(['c1'])).length).toBe(2);
      expect((await notes.entries()).length).toBe(4);
      // The server is never part of what the user sees.
      expect(
        (await notes.entries()).every(entry => !entry.key.includes(GUILD_A))
      ).toBe(true);
    });
  });

  it.each([
    [[], 'at least one'],
    ['', 'a text that is not empty'],
    [['a', ''], 'a text that is not empty'],
    [[1], 'made of texts, got 1'],
    [['a', null], 'made of texts, got null'],
  ])('refuses the key %j', async (key, message) => {
    fileBackend();
    const notes = declared<string>('notes');
    await expect(
      inGuild(GUILD_A, () => notes.set(key as never, 'x'))
    ).rejects.toThrow(message);
  });

  it('refuses what is not JSON before keeping anything', async () => {
    fileBackend();
    const notes = declared<unknown>('notes');
    await inGuild(GUILD_A, async () => {
      await expect(notes.set('a', new Date())).rejects.toThrow('is a Date');
      await expect(notes.set('a', undefined)).rejects.toThrow('is undefined');
      expect(await notes.get('a')).toBeUndefined();
    });
  });

  it('refuses to work before the loader bound it, or outside a running bot', async () => {
    fileBackend();
    const loose = store<number>();
    await expect(inGuild(GUILD_A, () => loose.get('a'))).rejects.toThrow(
      'This store was not loaded by ChapterJS: a store is exported from a file of src/ (export const name = store()), and used once the bot started.'
    );
    const bound = declared<number>('bound');
    setStoreBackend('file', null);
    await expect(inGuild(GUILD_A, () => bound.get('a'))).rejects.toThrow(
      'Stores only work while the bot runs'
    );
  });

  describe('expiration', () => {
    it('forgets a value after the expiration of the store', async () => {
      let now = 1_000_000;
      fileBackend({ now: () => now });
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const codes = declared<string>('codes', { expires: '10m' });
      await inGuild(GUILD_A, async () => {
        await codes.set('bob', 'abc');
        const [entry] = await codes.entries();
        expect(entry!.expires).toEqual(new Date(now + 600_000));
        now += 599_000;
        expect(await codes.get('bob')).toBe('abc');
        now += 1000;
        expect(await codes.get('bob')).toBeUndefined();
        expect(await codes.entries()).toEqual([]);
        expect(await codes.ttl('bob')).toBeUndefined();
        expect(await codes.delete('bob')).toBe(false);
      });
    });

    it('takes an expiration per value: a duration, a date, or never', async () => {
      let now = 1_000_000;
      fileBackend({ now: () => now });
      const codes = declared<string>('codes', { expires: '10m' });
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      await inGuild(GUILD_A, async () => {
        await codes.set('short', 'a', { expires: '1m' });
        await codes.set('dated', 'b', { expires: new Date(now + 5000) });
        await codes.set('forever', 'c', { expires: null });
        await codes.set('default', 'd');
        expect(await codes.ttl('short')).toBe(60_000);
        expect(await codes.ttl('dated')).toBe(5000);
        expect(await codes.ttl('forever')).toBeNull();
        expect(await codes.ttl('default')).toBe(600_000);
        now += 5000;
        expect(await codes.ttl('dated')).toBeUndefined();
        expect(await codes.ttl('short')).toBe(55_000);
        now += 60_000;
        expect(await codes.get('short')).toBeUndefined();
        expect(await codes.get('forever')).toBe('c');
        expect(await codes.get('default')).toBe('d');
      });
    });

    it('keeps the expiration through update(), unless told otherwise', async () => {
      let now = 1_000_000;
      fileBackend({ now: () => now });
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const hits = declared<number>('hits', { expires: '1h' });
      await inGuild(GUILD_A, async () => {
        await hits.set('a', 1);
        now += 1_800_000;
        await hits.update('a', (n = 0) => n + 1);
        expect(await hits.ttl('a')).toBe(1_800_000);
        await hits.update('a', (n = 0) => n + 1, { expires: '2h' });
        expect(await hits.ttl('a')).toBe(7_200_000);
        await hits.update('a', (n = 0) => n + 1, { expires: null });
        expect(await hits.ttl('a')).toBeNull();
        // A value set anew takes the expiration of the store again.
        await hits.set('a', 0);
        expect(await hits.ttl('a')).toBe(3_600_000);
      });
    });

    it.each([
      ['a word', 'soon'],
      ['too short', '500ms'],
      ['a number', 10],
      ['an invalid date', new Date('nope')],
    ])('refuses %s as an expiration of a value', async (_, expires) => {
      fileBackend();
      const codes = declared<string>('codes');
      await expect(
        inGuild(GUILD_A, () =>
          codes.set('a', 'x', { expires: expires as never })
        )
      ).rejects.toThrow(/"expires" is/);
    });
  });
});

describe('the file backend', () => {
  it('writes one JSON file per store, atomically, and reads it back', async () => {
    const { dir, backend } = fileBackend();
    const scores = declared<number>('scores');
    await scores.in(GUILD_A).set('bob', 1);
    await scores.in(GUILD_B).set(['x', 'y'], 2);
    expect(existsSync(dir)).toBe(false);
    await backend.close();
    expect(readdirSync(dir)).toEqual(['scores.json']);
    expect(JSON.parse(readFileSync(join(dir, 'scores.json'), 'utf8'))).toEqual({
      version: 1,
      entries: [
        [[GUILD_A, 'bob'], 1, null],
        [[GUILD_B, 'x', 'y'], 2, null],
      ],
    });
    // Another process, later: the same data.
    const again = new FileStoreBackend(dir);
    setStoreBackend('file', again);
    expect(await scores.in(GUILD_A).get('bob')).toBe(1);
    expect(await scores.in(GUILD_B).get(['x', 'y'])).toBe(2);
    await again.close();
  });

  it('writes shortly after a change, once for a burst of changes', async () => {
    const { dir } = fileBackend();
    const scores = declared<number>('scores');
    for (let n = 0; n < 50; n++) await scores.in(GUILD_A).set(`k${n}`, n);
    expect(existsSync(dir)).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(readdirSync(dir)).toEqual(['scores.json']);
    const written = JSON.parse(
      readFileSync(join(dir, 'scores.json'), 'utf8')
    ) as { entries: unknown[] };
    expect(written.entries).toHaveLength(50);
  });

  it('drops what expired when it reads a file, and when it sweeps', async () => {
    let now = 1_000_000;
    const dir = join(tempDir(), 'data');
    writeFileSync(join(dir, '..', 'x'), '');
    const first = new FileStoreBackend(dir, {
      writeDelay: 5,
      sweepEvery: 20,
      now: () => now,
    });
    await first.set('codes', ['a'], { value: 1, expiresAt: now + 100 });
    await first.set('codes', ['b'], { value: 2, expiresAt: null });
    await first.set('codes', ['c'], { value: 3, expiresAt: now + 1000 });
    await first.close();
    now += 500;
    const second = new FileStoreBackend(dir, {
      writeDelay: 5,
      sweepEvery: 20,
      now: () => now,
    });
    expect((await second.entries('codes', [])).map(e => e.key)).toEqual([
      ['b'],
      ['c'],
    ]);
    now += 1000;
    // The sweep writes the file without 'c', without anyone asking.
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(
      (
        JSON.parse(readFileSync(join(dir, 'codes.json'), 'utf8')) as {
          entries: unknown[][];
        }
      ).entries.map(entry => entry[0])
    ).toEqual([['b']]);
    await second.close();
  });

  it('explains a file it did not write', async () => {
    const dir = join(tempDir(), 'data');
    const backend = new FileStoreBackend(dir);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'codes.json'), '{"oops": true}');
    await expect(backend.get('codes', ['a'])).rejects.toThrow(
      `${join(dir, 'codes.json')} is not a file ChapterJS wrote: fix it, or delete it to start the store empty.`
    );
    writeFileSync(join(dir, 'broken.json'), 'not json');
    await expect(backend.get('broken', ['a'])).rejects.toThrow(
      'is not a file ChapterJS wrote'
    );
    await backend.close();
  });

  it('refuses a name a file can not be called', async () => {
    const backend = new FileStoreBackend(join(tempDir(), 'data'));
    await expect(backend.get('../etc', ['a'])).rejects.toThrow(
      '"../etc" can\'t name a store'
    );
    await backend.close();
  });

  it('writes what is pending when the process exits', async () => {
    const { dir, backend } = fileBackend();
    const scores = declared<number>('scores');
    await scores.in(GUILD_A).set('bob', 1);
    expect(existsSync(dir)).toBe(false);
    process.emit('exit', 0);
    expect(readdirSync(dir)).toEqual(['scores.json']);
    await backend.close();
  });
});

describe('the Redis backend', () => {
  it.each([
    ['plain', 'abc', 'abc'],
    ['a colon', 'a:b', 'a%3Ab'],
    ['the glob characters', 'a*b?c[d]e\\f', 'a%2Ab%3Fc%5Bd%5De%5Cf'],
    ['the escape itself', '100%', '100%25'],
    ['unicode', 'héllo 👋', 'héllo 👋'],
  ])('escapes %s in a part of a key, both ways', (_, part, escaped) => {
    expect(escapePart(part)).toBe(escaped);
    expect(unescapePart(escaped)).toBe(part);
  });

  it('writes one key per value, with the store and the parts in it, as JSON', async () => {
    const { fake, backend } = await redisBackend();
    const scores = declared<unknown>('scores', { storage: 'redis' });
    await scores.in(GUILD_A).set('bob', 1);
    await scores.in(GUILD_B).set(['x', 'y:z'], { deep: ['héllo', null] });
    expect(fake.keys()).toEqual([
      `scores:${GUILD_A}:bob`,
      `scores:${GUILD_B}:x:y%3Az`,
    ]);
    expect(fake.get(`scores:${GUILD_A}:bob`)).toBe('1');
    expect(fake.get(`scores:${GUILD_B}:x:y%3Az`)).toBe(
      '{"deep":["héllo",null]}'
    );
    expect(fake.expiresAt(`scores:${GUILD_A}:bob`)).toBeNull();
    expect(await scores.in(GUILD_A).get('bob')).toBe(1);
    expect(await scores.in(GUILD_B).get(['x', 'y:z'])).toEqual({
      deep: ['héllo', null],
    });
    expect(await scores.in(GUILD_A).get('nobody')).toBeUndefined();
    expect(backend.key('s', ['a', 'b'])).toBe('s:a:b');
    // Nothing but what the stores wrote.
    expect(fake.commands.map(args => args[0])).not.toContain('FLUSHDB');
  });

  it('puts the prefix of chapterjs dev in front of every key, and reads only those', async () => {
    const { fake } = await redisBackend({ prefix: 'dev:' });
    const hits = declared<number>('hits', {
      storage: 'redis',
      scope: 'global',
    });
    await hits.set('a', 1);
    // What production wrote on the same Redis is another world.
    fake.set('hits:a', '100');
    fake.set('hits:b', '200');
    expect(fake.keys()).toEqual(['dev:hits:a', 'hits:a', 'hits:b']);
    expect(await hits.get('a')).toBe(1);
    expect(await hits.get('b')).toBeUndefined();
    expect(await hits.entries()).toEqual([
      { key: ['a'], value: 1, expires: null },
    ]);
    expect(await hits.delete('b')).toBe(false);
    expect(fake.keys()).toEqual(['dev:hits:a', 'hits:a', 'hits:b']);
  });

  it('gives the expiration to Redis, and reads it back', async () => {
    let now = 1_000_000;
    const clock = () => now;
    vi.spyOn(Date, 'now').mockImplementation(clock);
    const { fake } = await redisBackend({ now: clock });
    fake.behavior.now = clock;
    const codes = declared<string>('codes', {
      storage: 'redis',
      expires: '10s',
    });
    await codes.in(GUILD_A).set('a', 'x');
    await codes.in(GUILD_A).set('forever', 'y', { expires: null });
    await codes
      .in(GUILD_A)
      .set('later', 'z', { expires: new Date(now + 60_000) });
    expect(fake.expiresAt(`codes:${GUILD_A}:a`)).toBe(now + 10_000);
    expect(fake.expiresAt(`codes:${GUILD_A}:forever`)).toBeNull();
    expect(await codes.in(GUILD_A).ttl('a')).toBe(10_000);
    expect(await codes.in(GUILD_A).ttl('forever')).toBeNull();
    expect(await codes.in(GUILD_A).ttl('none')).toBeUndefined();
    now += 4000;
    expect(await codes.in(GUILD_A).ttl('a')).toBe(6000);
    // update() keeps the expiration the value had.
    await codes.in(GUILD_A).update('a', value => `${value}!`);
    expect(await codes.in(GUILD_A).ttl('a')).toBe(6000);
    expect((await codes.in(GUILD_A).entries('a'))[0]?.expires?.getTime()).toBe(
      now + 6000
    );
    now += 6000;
    expect(await codes.in(GUILD_A).get('a')).toBeUndefined();
    expect(await codes.in(GUILD_A).entries()).toEqual([
      { key: ['forever'], value: 'y', expires: null },
      { key: ['later'], value: 'z', expires: new Date(1_000_000 + 60_000) },
    ]);
    // A value that already expired is not kept, and what was there goes.
    await codes
      .in(GUILD_A)
      .set('forever', 'gone', { expires: new Date(now - 1) });
    expect(fake.get(`codes:${GUILD_A}:forever`)).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('lists by prefix, part by part, over several pages of SCAN', async () => {
    const { fake } = await redisBackend({ scanCount: 3 });
    const notes = declared<number>('notes', { storage: 'redis' });
    const other = declared<number>('notes-other', { storage: 'redis' });
    for (let index = 0; index < 10; index++) {
      await notes.in(GUILD_A).set(['c1', `m${index}`], index);
    }
    await notes.in(GUILD_A).set(['c10', 'm0'], 100);
    await notes.in(GUILD_A).set('c1', -1);
    await notes.in(GUILD_B).set(['c1', 'm0'], 200);
    await other.in(GUILD_A).set(['c1', 'm0'], 300);
    const inC1 = await notes.in(GUILD_A).entries('c1');
    expect(inC1.map(entry => entry.value).sort((a, b) => a - b)).toEqual([
      -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(inC1.find(entry => entry.value === 3)?.key).toEqual(['c1', 'm3']);
    expect(await notes.in(GUILD_A).entries(['c1', 'm0'])).toEqual([
      { key: ['c1', 'm0'], value: 0, expires: null },
    ]);
    expect((await notes.in(GUILD_A).entries()).length).toBe(12);
    expect((await notes.in(GUILD_B).entries()).length).toBe(1);
    expect(await other.in(GUILD_A).entries()).toEqual([
      { key: ['c1', 'm0'], value: 300, expires: null },
    ]);
    expect(await notes.in(GUILD_A).delete(['c1', 'm3'])).toBe(true);
    expect(await notes.in(GUILD_A).delete(['c1', 'm3'])).toBe(false);
    expect(fake.keys()).toHaveLength(13);
  });

  it('keeps a store in Redis and another in its file, side by side', async () => {
    const { dir } = fileBackend();
    const { fake } = await redisBackend();
    const inFile = declared<number>('in-file');
    const inRedis = declared<number>('in-redis', { storage: 'redis' });
    await inFile.in(GUILD_A).set('a', 1);
    await inRedis.in(GUILD_A).set('a', 2);
    expect(fake.keys()).toEqual([`in-redis:${GUILD_A}:a`]);
    expect(await inFile.in(GUILD_A).get('a')).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(readdirSync(dir)).toEqual(['in-file.json']);
  });

  it('says what is wrong when Redis is not there, and stays usable when it is back', async () => {
    const { fake, client } = await redisBackend();
    const hits = declared<number>('hits', {
      storage: 'redis',
      scope: 'global',
    });
    await hits.set('a', 1);
    await fake.close();
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(hits.get('a')).rejects.toThrow(
      /^Redis at 127\.0\.0\.1:\d+ (closed the connection|can't be reached: nothing answers there)\./
    );
    const again = await fakeRedis({ port: fake.port });
    again.set('hits:a', '1');
    const deadline = Date.now() + 3000;
    while (!client.connected && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(await hits.get('a')).toBe(1);
  });

  it('refuses to serve a store kept in Redis when the process has no Redis', async () => {
    fileBackend();
    const hits = declared<number>('hits', {
      storage: 'redis',
      scope: 'global',
    });
    await expect(hits.get('a')).rejects.toThrow(
      "hits is kept in Redis (storage: 'redis'), but REDIS_URL is not set: add it to .env (like redis://localhost:6379) and start again, or remove storage: 'redis' to keep its data in data/."
    );
  });
});

describe('what a store does with several values', () => {
  /** Each storage, fresh, given to the stores of the test. */
  const storages = [
    ['in a file', async () => (fileBackend(), 'file' as const)],
    ['in Redis', async () => (await redisBackend(), 'redis' as const)],
  ] as const;

  describe.each(storages)('%s', (_, prepare) => {
    it('loses no update, however many run at once', async () => {
      const storage = await prepare();
      const hits = declared<number>('hits', { storage, scope: 'global' });
      const list = declared<string[]>('list', { storage, scope: 'global' });
      await Promise.all(
        Array.from({ length: 60 }, (_, index) =>
          Promise.all([
            hits.update('n', (n = 0) => n + 1),
            list.update('all', (items = []) => [...items, `#${index}`]),
          ])
        )
      );
      expect(await hits.get('n')).toBe(60);
      expect((await list.get('all'))?.length).toBe(60);
    });

    it('increments a number from 0, by 1 or by what is given, in one go', async () => {
      const storage = await prepare();
      const counts = declared<number>('counts', { storage });
      await inGuild(GUILD_A, async () => {
        expect(await counts.increment('a')).toBe(1);
        expect(await counts.increment('a')).toBe(2);
        expect(await counts.increment('a', 10)).toBe(12);
        expect(await counts.increment('a', -2.5)).toBe(9.5);
        expect(await counts.increment('b', -1)).toBe(-1);
        const all = await Promise.all(
          Array.from({ length: 40 }, () => counts.increment('c'))
        );
        expect(all.sort((x, y) => x - y)).toEqual(
          Array.from({ length: 40 }, (_, index) => index + 1)
        );
      });
      expect(await counts.in(GUILD_B).get('a')).toBeUndefined();
    });

    it('keeps the expiration of a number it increments, and gives the store one to a new number', async () => {
      const storage = await prepare();
      const counts = declared<number>('counts', {
        storage,
        scope: 'global',
        expires: '1h',
      });
      await counts.increment('a');
      const first = await counts.ttl('a');
      expect(first).toBeGreaterThan(3_590_000);
      await counts.set('b', 5, { expires: '10m' });
      await counts.increment('b');
      expect(await counts.ttl('b')).toBeLessThanOrEqual(600_000);
      await counts.increment('b', 1, { expires: null });
      expect(await counts.ttl('b')).toBeNull();
    });

    it('refuses to increment what is not a number, and by what is not one', async () => {
      const storage = await prepare();
      const mixed = declared<unknown>('mixed', { storage, scope: 'global' });
      await mixed.set('text', 'hi');
      await mixed.set('list', [1]);
      await mixed.set('nothing', null);
      const counts = mixed as unknown as typeof numbers;
      const numbers = declared<number>('numbers', { storage, scope: 'global' });
      await expect(counts.increment('text')).rejects.toThrow(
        'increment() adds to a number, and the value at ["text"] is a string: use update() to change it.'
      );
      await expect(counts.increment('list')).rejects.toThrow('is a list');
      await expect(counts.increment('nothing')).rejects.toThrow('is null');
      expect(await mixed.get('text')).toBe('hi');
      await expect(numbers.increment('a', Number.NaN)).rejects.toThrow(
        'increment() adds a number, got null.'
      );
      await expect(
        numbers.increment('a', '2' as unknown as number)
      ).rejects.toThrow('increment() adds a number, got "2".');
      expect(await numbers.get('a')).toBeUndefined();
    });

    it('gets and sets several values at once, in their order', async () => {
      const storage = await prepare();
      const scores = declared<number>('scores', { storage });
      await inGuild(GUILD_A, async () => {
        await scores.setMany([
          ['alice', 3],
          [['team', 'red'], 7],
          ['héllo:*', 1],
        ]);
        expect(
          await scores.getMany(['alice', 'nobody', ['team', 'red'], 'héllo:*'])
        ).toEqual([3, undefined, 7, 1]);
        expect(await scores.getMany([])).toEqual([]);
        await scores.setMany([]);
      });
      expect(await scores.in(GUILD_B).getMany(['alice'])).toEqual([undefined]);
    });

    it('checks every value before writing any', async () => {
      const storage = await prepare();
      const dates = declared<unknown>('dates', { storage, scope: 'global' });
      await expect(
        dates.setMany([
          ['a', 1],
          ['b', new Date(0)],
        ])
      ).rejects.toThrow('the value of item 1 is a Date');
      await expect(
        dates.setMany([
          ['a', 1],
          ['', 2],
        ])
      ).rejects.toThrow('A key of a store is a text that is not empty');
      await expect(
        dates.setMany([['a', 1], ['b'] as unknown as [string, number]])
      ).rejects.toThrow(
        'setMany() takes a list of [key, value] pairs, and item 1 is not one.'
      );
      await expect(
        dates.setMany('a' as unknown as [string, number][])
      ).rejects.toThrow('setMany() takes a list of [key, value] pairs');
      await expect(dates.getMany('a' as unknown as string[])).rejects.toThrow(
        'getMany() takes a list of keys'
      );
      expect(await dates.entries()).toEqual([]);
    });

    it('gives the expiration of the store, or the one asked, to every value it sets', async () => {
      const storage = await prepare();
      const codes = declared<string>('codes', {
        storage,
        scope: 'global',
        expires: '10m',
      });
      await codes.setMany([['a', 'x']]);
      await codes.setMany([['b', 'y']], { expires: null });
      expect(await codes.ttl('a')).toBeGreaterThan(590_000);
      expect(await codes.ttl('b')).toBeNull();
    });

    it('deletes every value under a prefix, or every value of the server, and says how many', async () => {
      const storage = await prepare();
      const notes = declared<number>('notes', { storage });
      const other = declared<number>('other', { storage });
      await notes.in(GUILD_A).setMany([
        [['c1', 'm1'], 1],
        [['c1', 'm2'], 2],
        [['c10', 'm1'], 3],
        ['c1', 4],
      ]);
      await notes.in(GUILD_B).set(['c1', 'm1'], 5);
      await other.in(GUILD_A).set(['c1', 'm1'], 6);
      expect(await notes.in(GUILD_A).deleteAll(['c1', 'm1'])).toBe(1);
      expect(await notes.in(GUILD_A).deleteAll('c1')).toBe(2);
      expect(await notes.in(GUILD_A).deleteAll('c1')).toBe(0);
      expect(await notes.in(GUILD_A).entries()).toEqual([
        { key: ['c10', 'm1'], value: 3, expires: null },
      ]);
      expect(await inGuild(GUILD_A, () => notes.deleteAll())).toBe(1);
      expect(await notes.in(GUILD_A).entries()).toEqual([]);
      // Another server, and another store, untouched.
      expect(await notes.in(GUILD_B).get(['c1', 'm1'])).toBe(5);
      expect(await other.in(GUILD_A).get(['c1', 'm1'])).toBe(6);
    });
  });

  it('runs update() again on the new value when it changed in between, and gives up after a while', async () => {
    const { fake } = await redisBackend();
    const hits = declared<number>('hits', {
      storage: 'redis',
      scope: 'global',
    });
    await hits.set('n', 1);
    let runs = 0;
    // Another client writes the key every time it is read: never the value
    // the change saw any more.
    await expect(
      hits.update('n', (n = 0) => {
        runs++;
        fake.set('hits:n', String(100 + runs));
        return n + 1;
      })
    ).rejects.toThrow(
      'The value of hits changed 50 times while update() was trying to change it'
    );
    expect(runs).toBe(50);
    expect(fake.get('hits:n')).toBe('150');
    // Once, then it gets through on the new value.
    let once = true;
    expect(
      await hits.update('n', (n = 0) => {
        if (once) fake.set('hits:n', '1000');
        once = false;
        return n + 1;
      })
    ).toBe(1001);
  });

  it('loses no update across processes sharing one Redis', async () => {
    const fake = await fakeRedis();
    const one = (await redisBackend({}, fake)).backend;
    const two = (await redisBackend({}, fake)).backend;
    const run = (backend: RedisStoreBackend) =>
      Array.from({ length: 30 }, () =>
        backend.update('hits', ['n'], current => ({
          value: ((current?.value as number | undefined) ?? 0) + 1,
          expiresAt: null,
        }))
      );
    await Promise.all([...run(one), ...run(two)]);
    expect(fake.get('hits:n')).toBe('60');
    // The updates had connections of their own: never more than asked.
    expect(fake.connections.length).toBeLessThanOrEqual(2 + 2 * 4);
  });

  it('lends Redis connections to updates, at most as many as asked', async () => {
    const { fake } = await redisBackend({ transactions: 2 });
    const hits = declared<number>('hits', {
      storage: 'redis',
      scope: 'global',
    });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => hits.increment(`k${index % 3}`))
    );
    expect(await hits.getMany(['k0', 'k1', 'k2'])).toEqual([7, 7, 6]);
    // The main one, and two for updates.
    expect(fake.connections).toHaveLength(3);
    const lent = fake.connections.filter(connection =>
      connection.commands.some(args => args[0] === 'WATCH')
    );
    expect(lent).toHaveLength(2);
    for (const connection of lent) {
      expect(connection.commands.map(args => args[0])).toContain('EXEC');
    }
  });

  it('writes nothing to Redis when update() throws, and frees the connection', async () => {
    const { fake } = await redisBackend({ transactions: 1 });
    const hits = declared<number>('hits', {
      storage: 'redis',
      scope: 'global',
    });
    await expect(
      hits.update('n', () => {
        throw new Error('changed my mind');
      })
    ).rejects.toThrow('changed my mind');
    await expect(
      hits.update('n', () => new Date() as unknown as number)
    ).rejects.toThrow('is a Date');
    expect(fake.keys()).toEqual([]);
    // The one connection was given back.
    expect(await hits.increment('n')).toBe(1);
    expect(fake.connections).toHaveLength(1);
    expect(fake.connections[0]!.commands.map(args => args[0])).toContain(
      'UNWATCH'
    );
  });

  it('loses no update across processes sharing the first one', async () => {
    const { backend } = fileBackend();
    const workers = [0, 1, 2].map(() => {
      const toPrimary = new EventEmitter();
      const toWorker = new EventEmitter();
      toPrimary.on(
        'message',
        serveStores(backend, reply => toWorker.emit('message', reply))
      );
      return new IpcStoreBackend({
        send: message => setImmediate(() => toPrimary.emit('message', message)),
        on: listener => toWorker.on('message', listener),
      });
    });
    await Promise.all(
      workers.flatMap(worker =>
        Array.from({ length: 20 }, () =>
          worker.update('hits', ['n'], current => ({
            value: ((current?.value as number | undefined) ?? 0) + 1,
            expiresAt: null,
          }))
        )
      )
    );
    expect((await backend.get('hits', ['n']))?.value).toBe(60);
    expect(await workers[0]!.clear('hits', [])).toBe(1);
    expect(await backend.get('hits', ['n'])).toBeUndefined();
  });
});

describe('the IPC backend', () => {
  /** A primary and a worker joined by two emitters, like a fork is. */
  function pair(backend: StoreBackend) {
    const toPrimary = new EventEmitter();
    const toWorker = new EventEmitter();
    const serve = serveStores(backend, reply =>
      toWorker.emit('message', reply)
    );
    toPrimary.on('message', serve);
    const sent: StoreRequest[] = [];
    const worker = new IpcStoreBackend({
      send: message => {
        sent.push(message);
        toPrimary.emit('message', message);
      },
      on: listener => toWorker.on('message', listener),
    });
    return { worker, sent, toWorker };
  }

  it('asks the first process for everything, and gets the same answers', async () => {
    const { backend } = fileBackend();
    const { worker, sent } = pair(backend);
    setStoreBackend('file', worker);
    const scores = declared<number>('scores');
    await scores.in(GUILD_A).set('bob', 1);
    expect(await scores.in(GUILD_A).get('bob')).toBe(1);
    expect(await scores.in(GUILD_A).update('bob', n => (n ?? 0) + 1)).toBe(2);
    expect(await scores.in(GUILD_A).entries()).toEqual([
      { key: ['bob'], value: 2, expires: null },
    ]);
    expect(await scores.in(GUILD_A).delete('bob')).toBe(true);
    expect(await scores.in(GUILD_A).get('bob')).toBeUndefined();
    expect(sent.map(request => request.op)).toEqual([
      'set',
      'get',
      // update(): read, then kept only if nobody wrote in between.
      'get',
      'swap',
      'entries',
      'delete',
      'get',
    ]);
    // The data is in the first process.
    expect(await backend.get('scores', [GUILD_A, 'bob'])).toBeUndefined();
    await worker.close();
    await backend.close();
  });

  it('relays an error of the first process, by its message', async () => {
    const failing: StoreBackend = {
      get: async () => {
        throw new Error('disk on fire');
      },
      set: async () => {},
      delete: async () => false,
      entries: async () => [],
      update: async () => undefined,
      clear: async () => 0,
      close: async () => {},
    };
    const { worker } = pair(failing);
    await expect(worker.get('scores', ['a'])).rejects.toThrow('disk on fire');
  });

  it('ignores the other messages of the channel', async () => {
    const { backend } = fileBackend();
    const { worker, toWorker } = pair(backend);
    toWorker.emit('message', { type: 'identify', id: 1 });
    toWorker.emit('message', { type: 'store', id: 99, result: 'nobody' });
    toWorker.emit('message', 'text');
    const serve = serveStores(backend, () => {
      throw new Error('never');
    });
    serve({ type: 'stop' });
    serve({ type: 'store', id: 1 } satisfies StoreReply);
    serve(null);
    expect(await worker.get('scores', ['a'])).toBeUndefined();
    await backend.close();
  });
});

describe('store()', () => {
  it.each([
    [{}, { scope: 'guild', storage: 'file', expires: null }],
    [{ scope: 'global' }, { scope: 'global', storage: 'file', expires: null }],
    [
      { expires: '30d' },
      { scope: 'guild', storage: 'file', expires: 30 * 86_400_000 },
    ],
    [
      { scope: 'guild', expires: '1h30m' },
      { scope: 'guild', storage: 'file', expires: 5_400_000 },
    ],
    [{ storage: 'redis' }, { scope: 'guild', storage: 'redis', expires: null }],
    [
      { storage: 'file', scope: 'global', expires: '1m' },
      { scope: 'global', storage: 'file', expires: 60_000 },
    ],
  ])('reads %j', (config, expected) => {
    expect(
      storeDeclaration.read(
        store(config as never),
        site('src/s.ts', 'warnings')
      )
    ).toEqual({ name: 'warnings', ...expected });
  });

  it.each([
    [
      'a text',
      'oops',
      "store() takes an object, or nothing: store<Warning[]>({ expires: '30d' }).",
    ],
    [
      'an unknown key',
      { ttl: '1d' },
      '"ttl" is not something a store has. It can have: scope, storage, expires.',
    ],
    [
      'a wrong scope',
      { scope: 'server' },
      `"scope" is 'guild' (the data is kept per server, the default) or 'global' (one set of data for the whole bot), got "server".`,
    ],
    [
      'a wrong storage',
      { storage: 'postgres' },
      `"storage" is 'file' (a file in data/, the default) or 'redis' (the Redis of REDIS_URL in .env), got "postgres".`,
    ],
    [
      'an expiration that is no duration',
      { expires: 'soon' },
      `"expires" is how long a value is kept: a number and a unit: s, m, h or d, like '30s', '2h', '1d' or '1h30m', 1 s at least. Got "soon".`,
    ],
    ['an expiration too short', { expires: '0s' }, '1 s at least. Got "0s"'],
    ['an expiration of a number', { expires: 60 }, 'Got 60'],
  ])('refuses %s', (_, config, message) => {
    expect(() =>
      storeDeclaration.read(
        store(config as never),
        site('src/s.ts', 'warnings')
      )
    ).toThrow(message);
  });

  it('refuses a name a file can not be called', () => {
    expect(() =>
      storeDeclaration.read(store(), site('src/s.ts', 'with space'))
    ).toThrow(
      '"with space" can\'t name a store: the name of the export is the name of the store and of its file in data/, made of letters, digits, _ . and -.'
    );
  });

  it('is recognised among the exports, and a list is refused', () => {
    expect(storeDeclaration.is(store())).toBe(true);
    expect(storeDeclaration.is({ config: {} })).toBe(false);
    expect(storeDeclaration.is(null)).toBe(false);
    expect(storeDeclaration.list).toBe(false);
  });
});

describe.skipIf(process.platform === 'win32')(
  'a store in chapterjs dev',
  () => {
    const COUNT = `import { command, store } from 'chapterjs';
export const hits = store<number>();
export const total = store<number>({ scope: 'global' });
export default command({
  name: 'count',
  description: 'Counts',
  async run({ interaction, guild }) {
    const here = await hits.update('all', (n = 0) => n + 1);
    const everywhere = await total.update('all', (n = 0) => n + 1);
    await interaction.reply(\`\${here} here, \${everywhere} everywhere, \${(await hits.in(guild).entries()).length} key(s)\`);
  },
});
`;
    const use = (fake: FakeWorld, id: string, connection = 0) =>
      useCommand(fake, 'count', id, connection);

    it('keeps the data from one start to the next, in data/', async () => {
      const cwd = project({ 'src/count.ts': COUNT });
      const fake = await world();
      let cli = runDev(cwd, fake);
      await cli.waitFor('✓ 1 command, 2 stores loaded');
      expect(await use(fake, '1')).toBe('1 here, 1 everywhere, 1 key(s)');
      expect(await use(fake, '2')).toBe('2 here, 2 everywhere, 1 key(s)');
      cli.signal('SIGINT');
      expect((await cli.exited).code).toBe(0);
      expect(readdirSync(join(cwd, 'data')).sort()).toEqual([
        'hits.json',
        'total.json',
      ]);
      expect(
        JSON.parse(readFileSync(join(cwd, 'data', 'hits.json'), 'utf8'))
      ).toEqual({ version: 1, entries: [[[GUILD, 'all'], 2, null]] });

      // Started again: the data is still there.
      cli = runDev(cwd, fake);
      await cli.waitFor('✓ 1 command, 2 stores loaded');
      expect(await use(fake, '3', 1)).toBe('3 here, 3 everywhere, 1 key(s)');
      cli.signal('SIGINT');
      const { output } = await cli.exited;
      expect(output).not.toMatch(/[✗⚠]/);
    });

    it('reports two stores with one name, and a store used where no server is', async () => {
      const cwd = project({
        'src/count.ts': COUNT,
        'src/twin.ts': `import { store } from 'chapterjs';\nexport const hits = store<number>();\n`,
        'src/task.ts': `import { store, task } from 'chapterjs';\nexport const seen = store<number>();\nexport const tick = task({ every: '1s', onStart: true, async run() { await seen.get('x'); } });\n`,
      });
      const fake = await world();
      const cli = runDev(cwd, fake);
      await cli.waitFor(
        '✗ src/twin.ts (hits) There is already a store named hits, in src/count.ts: the name of the export is the name of the store, so rename one of them.'
      );
      await cli.waitFor(
        "✗ src/task.ts:3 seen is a store per server, and this code does not run in one: use seen.in(guild) to say which server, or declare the store with scope: 'global'."
      );
      cli.signal('SIGINT');
      await cli.exited;
    });

    it('reports a call of a store nobody awaited, with its line, and keeps running', async () => {
      const cwd = project({
        'src/count.ts': COUNT,
        'src/ready.ts': `import { event, store } from 'chapterjs';
export const seen = store<number>();
export default event({
  name: 'ready',
  run({ user }) {
    seen.set(user.id, 1);
  },
});
`,
      });
      const fake = await world();
      const cli = runDev(cwd, fake);
      await cli.waitFor(
        "✗ src/ready.ts:6 seen is a store per server, and this code does not run in one: use seen.in(guild) to say which server, or declare the store with scope: 'global'.\n  This call was not awaited: write await in front of it (and async before run), so that your function waits for it."
      );
      // The bot is still there.
      expect(await use(fake, '1')).toBe('1 here, 1 everywhere, 1 key(s)');
      cli.signal('SIGINT');
      expect((await cli.exited).code).toBe(0);
    });

    describe('kept in Redis', () => {
      const REDIS_COUNT = COUNT.replace(
        'export const hits = store<number>();',
        "export const hits = store<number>({ storage: 'redis' });"
      );
      const env = (url: string, password = '') =>
        `BOT_TOKEN=test-token\nDEV_GUILD_ID=${GUILD}\nREDIS_URL=${url}\nREDIS_PASSWORD=${password}\n`;

      it('writes the stores that say so in Redis, with dev: in front, and the others in data/', async () => {
        const redis = await fakeRedis({ password: 'pw' });
        const cwd = project(
          { 'src/count.ts': REDIS_COUNT },
          env(redis.url, 'pw')
        );
        const fake = await world();
        let cli = runDev(cwd, fake);
        await cli.waitFor('✓ 1 command, 2 stores loaded');
        await cli.waitFor(
          `ℹ The store hits is kept in Redis at 127.0.0.1:${redis.port}`
        );
        // Checked before Discord was reached.
        expect(cli.output.indexOf('PONG')).toBe(-1);
        expect(redis.connections[0]!.commands.slice(0, 2)).toEqual([
          ['AUTH', 'pw'],
          ['PING'],
        ]);
        expect(await use(fake, '1')).toBe('1 here, 1 everywhere, 1 key(s)');
        expect(await use(fake, '2')).toBe('2 here, 2 everywhere, 1 key(s)');
        expect(redis.keys()).toEqual([`dev:hits:${GUILD}:all`]);
        expect(redis.get(`dev:hits:${GUILD}:all`)).toBe('2');
        cli.signal('SIGINT');
        expect((await cli.exited).code).toBe(0);
        expect(readdirSync(join(cwd, 'data'))).toEqual(['total.json']);

        // Started again: the data is still in Redis.
        cli = runDev(cwd, fake);
        await cli.waitFor('✓ 1 command, 2 stores loaded');
        expect(await use(fake, '3', 1)).toBe('3 here, 3 everywhere, 1 key(s)');
        cli.signal('SIGINT');
        const { output } = await cli.exited;
        expect(output).not.toMatch(/[✗⚠]/);
      });

      it('reports a store kept in Redis when REDIS_URL is not set, and says so again when it is used', async () => {
        const cwd = project({ 'src/count.ts': REDIS_COUNT });
        const fake = await world();
        const cli = runDev(cwd, fake);
        await cli.waitFor(
          "✗ src/count.ts (hits) hits is kept in Redis (storage: 'redis'), but REDIS_URL is not set: add it to .env (like redis://localhost:6379) and start again, or remove storage: 'redis' to keep its data in data/."
        );
        await cli.waitFor('✓ 1 command, 1 store loaded');
        expect(cli.output).not.toContain('kept in Redis at');
        expect(await use(fake, '1')).toBe(
          'Something went wrong while running this command.'
        );
        await cli.waitFor(
          "✗ src/count.ts:8 hits is kept in Redis (storage: 'redis'), but REDIS_URL is not set"
        );
        // Moved out of Redis while running: back to normal.
        writeFileSync(join(cwd, 'src/count.ts'), COUNT);
        await cli.waitFor('↻ Reloaded in');
        expect(await use(fake, '2')).toBe('1 here, 1 everywhere, 1 key(s)');
        cli.signal('SIGINT');
        await cli.exited;
      });

      it('says when a store moves to Redis, or out of it, while running', async () => {
        const redis = await fakeRedis();
        const cwd = project({ 'src/count.ts': COUNT }, env(redis.url));
        const fake = await world();
        const cli = runDev(cwd, fake);
        await cli.waitFor('✓ 1 command, 2 stores loaded');
        // Nothing asked Redis for anything.
        expect(cli.output).not.toContain('kept in Redis');
        expect(redis.connections).toHaveLength(0);
        writeFileSync(join(cwd, 'src/count.ts'), REDIS_COUNT);
        await cli.waitFor(
          `ℹ The store hits is kept in Redis at 127.0.0.1:${redis.port}`
        );
        await cli.waitFor('↻ Reloaded in');
        expect(await use(fake, '1')).toBe('1 here, 1 everywhere, 1 key(s)');
        expect(redis.keys()).toEqual([`dev:hits:${GUILD}:all`]);
        writeFileSync(join(cwd, 'src/count.ts'), COUNT);
        await cli.waitFor('↻ Reloaded in');
        expect(await use(fake, '2')).toBe('1 here, 2 everywhere, 1 key(s)');
        cli.signal('SIGINT');
        await cli.exited;
      });

      it.each([
        [
          'nothing answers',
          async () => {
            const redis = await fakeRedis();
            await redis.close();
            return env(redis.url);
          },
          /✗ Redis at 127\.0\.0\.1:\d+ can't be reached: nothing answers there\. Start Redis, or check REDIS_URL in \.env\.$/m,
        ],
        [
          'the password is wrong',
          async () =>
            env((await fakeRedis({ password: 'right' })).url, 'wrong'),
          /✗ Redis at 127\.0\.0\.1:\d+ refused the password: check REDIS_PASSWORD \(or the password in REDIS_URL\) in \.env\.$/m,
        ],
        [
          'a password is missing',
          async () => env((await fakeRedis({ password: 'pw' })).url),
          /✗ Redis at 127\.0\.0\.1:\d+ asks for a password: set REDIS_PASSWORD \(or the password in REDIS_URL\) in \.env\.$/m,
        ],
        [
          'REDIS_URL is not an address',
          async () => env('localhost:6379'),
          /✗ \.env: REDIS_URL is not an address\. Write it like redis:\/\/localhost:6379/,
        ],
      ])('does not start when %s', async (_, prepare, message) => {
        const cwd = project({ 'src/count.ts': REDIS_COUNT }, await prepare());
        const fake = await world();
        const { code, output } = await runDev(cwd, fake).exited;
        expect(output).toMatch(message);
        expect(code).toBe(1);
        expect(output).not.toContain('Connected');
        expect(fake.gateway.connections).toEqual([]);
      });

      it('warns once while Redis is away, and says when it is back', async () => {
        const redis = await fakeRedis();
        const cwd = project({ 'src/count.ts': REDIS_COUNT }, env(redis.url));
        const fake = await world();
        const cli = runDev(cwd, fake);
        await cli.waitFor('✓ 1 command, 2 stores loaded');
        expect(await use(fake, '1')).toBe('1 here, 1 everywhere, 1 key(s)');
        await redis.close();
        await cli.waitFor(
          /⚠ Redis at 127\.0\.0\.1:\d+ closed the connection\. Trying again every few seconds\./
        );
        // The command fails for the person, in plain words, and the
        // developer sees why, with the line.
        expect(await use(fake, '2')).toMatch(/Something went wrong/);
        await cli.waitFor(
          /✗ src\/count\.ts:8 Redis at 127\.0\.0\.1:\d+ (can't be reached: nothing answers there|closed the connection)/
        );
        const again = await fakeRedis({ port: redis.port });
        again.set(`dev:hits:${GUILD}:all`, '1');
        await cli.waitFor(/↻ Redis at 127\.0\.0\.1:\d+ is back/);
        // The failed use counted nothing: hits threw before total.
        expect(await use(fake, '3')).toBe('2 here, 2 everywhere, 1 key(s)');
        expect(cli.output.match(/⚠ Redis/g)).toHaveLength(1);
        cli.signal('SIGINT');
        await cli.exited;
      }, 20_000);
    });
  }
);

describe('the updates of one key in one process', () => {
  it('run one after the other, others at once, and an error keeps the line that asked', async () => {
    const { KeyQueue } = await import('../src/store/backend.js');
    const queue = new KeyQueue();
    const order: string[] = [];
    const step = (id: string, label: string, ms: number) =>
      queue.run(id, async () => {
        order.push(`${label} start`);
        await new Promise(resolve => setTimeout(resolve, ms));
        order.push(`${label} end`);
        return label;
      });
    const results = await Promise.all([
      step('a', 'a1', 20),
      step('a', 'a2', 1),
      step('b', 'b1', 1),
    ]);
    expect(results).toEqual(['a1', 'a2', 'b1']);
    // b ran meanwhile; a2 waited for a1.
    expect(order.indexOf('b1 end')).toBeLessThan(order.indexOf('a1 end'));
    expect(order.indexOf('a2 start')).toBeGreaterThan(order.indexOf('a1 end'));
    // A failure does not block the next one.
    const failed = queue.run('a', async () => {
      throw new Error('no');
    });
    const next = queue.run('a', async () => 'next');
    await expect(failed).rejects.toThrow('no');
    expect(await next).toBe('next');
    // The error is seen from the async function that asked.
    async function asking() {
      await queue.run('c', async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        throw new Error('deep');
      });
    }
    const error = await asking().then(
      () => null,
      (caught: Error) => caught
    );
    expect(error?.stack).toContain('asking');
  });
});

describe.skipIf(process.platform === 'win32')('the types of a store', () => {
  it('underline increment() on a store that does not hold numbers, and a value of the wrong type', async () => {
    const cwd = project({
      'src/ok.ts': `import { store } from 'chapterjs';
export const counts = store<number>();
export async function ok(): Promise<number> {
  const [a, b] = await counts.getMany(['a', 'b']);
  await counts.setMany([['a', 1], [['x', 'y'], 2]], { expires: '1h' });
  const removed: number = await counts.deleteAll('x');
  return (a ?? 0) + (b ?? 0) + removed + (await counts.in('1').increment('a', -1));
}
`,
      'src/text.ts': `import { store } from 'chapterjs';
export const names = store<string>();
export const go = () => names.increment('a');
`,
      'src/wrong.ts': `import { store } from 'chapterjs';
export const counts = store<number>();
export const go = () => counts.setMany([['a', 'one']]);
`,
    });
    cpSync(
      join(packageDir, '../create-chapterjs/templates/default/tsconfig.json'),
      join(cwd, 'tsconfig.json')
    );
    symlinkSync(
      join(packageDir, 'node_modules/@types'),
      join(cwd, 'node_modules/@types'),
      'dir'
    );
    const fake = await world();
    await runDev(cwd, fake, ['sync']).exited;
    const result = spawnSync(
      join(packageDir, 'node_modules/.bin/tsc'),
      ['-b'],
      { cwd, encoding: 'utf8' }
    );
    const errors = result.stdout
      .split('\n')
      .filter(line => line.includes('error TS'))
      .sort();
    expect(errors.map(error => error.replace(/\(\d+,\d+\).*/, ''))).toEqual([
      'src/text.ts',
      'src/wrong.ts',
    ]);
    expect(errors[0]).toMatch(
      /'this' context of type 'Store<string>' is not assignable/
    );
    expect(errors[1]).toMatch(
      /Type 'string' is not assignable to type 'number'/
    );
  });
});
