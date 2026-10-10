import { tempDir } from '@chapterjs/test-utils';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { setStoreBackend, type StoreBackend } from '../src/store/backend.js';
import { storeDeclaration } from '../src/store/declaration.js';
import { FileStoreBackend } from '../src/store/file-backend.js';
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
  project,
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
  setStoreBackend(backend);
  return { dir, backend };
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
    setStoreBackend(null);
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
    setStoreBackend(again);
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
    setStoreBackend(worker);
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
      'get',
      'set',
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
    [{}, { scope: 'guild', expires: null }],
    [{ scope: 'global' }, { scope: 'global', expires: null }],
    [{ expires: '30d' }, { scope: 'guild', expires: 30 * 86_400_000 }],
    [
      { scope: 'guild', expires: '1h30m' },
      { scope: 'guild', expires: 5_400_000 },
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
      '"ttl" is not something a store has. It can have: scope, expires.',
    ],
    [
      'a wrong scope',
      { scope: 'server' },
      `"scope" is 'guild' (the data is kept per server, the default) or 'global' (one set of data for the whole bot), got "server".`,
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
    const use = async (fake: FakeWorld, id: string, connection = 0) => {
      const callback = `/interactions/${id}/token-${id}/callback`;
      fake.discord.on('POST', callback, {
        body: {
          interaction: { id, type: 2 },
          resource: { type: 4, message: rawMessage(`${id}9`, '') },
        },
      });
      (await connected(fake, connection)).dispatch('INTERACTION_CREATE', {
        id,
        application_id: BOT,
        type: 2,
        token: `token-${id}`,
        version: 1,
        guild_id: GUILD,
        channel_id: GENERAL,
        locale: 'en-US',
        member: {
          user: { id: ALICE, username: 'alice', discriminator: '0' },
          roles: [],
          permissions: '8',
          joined_at: '2024-01-01T00:00:00Z',
          deaf: false,
          mute: false,
          flags: 0,
        },
        app_permissions: '8',
        entitlements: [],
        authorizing_integration_owners: {},
        attachment_size_limit: 1,
        data: { id: `${id}0`, name: 'count', type: 1 },
      });
      const deadline = Date.now() + 5000;
      let answer;
      while (
        !(answer = fake.discord.requestsTo('POST', callback)[0]) &&
        Date.now() < deadline
      ) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return (answer!.body as { data: { content: string } }).data.content;
    };

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
  }
);
