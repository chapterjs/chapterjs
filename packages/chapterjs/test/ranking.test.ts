import { fakeRedis, tempDir } from '@chapterjs/test-utils';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { cpSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { RedisClient } from '../src/redis/client.js';
import { rankingDeclaration } from '../src/ranking/declaration.js';
import { ranking } from '../src/ranking/ranking.js';
import { setStoreBackend } from '../src/store/backend.js';
import { FileStoreBackend } from '../src/store/file-backend.js';
import { IpcStoreBackend, serveStores } from '../src/store/ipc-backend.js';
import { RedisStoreBackend } from '../src/store/redis-backend.js';
import { withGuild } from '../src/store/scope.js';
import {
  GUILD,
  packageDir,
  project,
  runDev,
  site,
  useCommand,
  world,
} from './dev-helpers.js';

const GUILD_A = '100000000000000001';
const GUILD_B = '100000000000000002';

/** A ranking as the loader leaves it: bound to the name of its export. */
function declared(name: string, config: Parameters<typeof ranking>[0] = {}) {
  const value = ranking(config);
  rankingDeclaration.read(value, site(`src/${name}.ts`, name));
  return value;
}

function fileBackend() {
  const dir = join(tempDir(), 'data');
  const backend = new FileStoreBackend(dir, { writeDelay: 5 });
  setStoreBackend('file', backend);
  onTestFinished(() => backend.close());
  return { dir, backend };
}

async function redisBackend(prefix = '') {
  const fake = await fakeRedis();
  const backend = new RedisStoreBackend(
    new RedisClient({
      host: fake.host,
      port: fake.port,
      tls: false,
      username: null,
      password: null,
      db: 0,
    }),
    { prefix }
  );
  setStoreBackend('redis', backend);
  onTestFinished(() => backend.close());
  return { fake, backend };
}

/** A worker of a cluster, whose first process keeps the file. */
function ipcBackend() {
  const { backend } = fileBackend();
  const toPrimary = new EventEmitter();
  const toWorker = new EventEmitter();
  toPrimary.on(
    'message',
    serveStores(backend, reply => toWorker.emit('message', reply))
  );
  const worker = new IpcStoreBackend({
    send: message => setImmediate(() => toPrimary.emit('message', message)),
    on: listener => toWorker.on('message', listener),
  });
  setStoreBackend('file', worker);
  return { backend, worker };
}

const inGuild = <T>(guildId: string, fn: () => Promise<T>) =>
  withGuild(guildId, fn);

describe('ranking()', () => {
  it.each([
    [{}, { scope: 'guild', storage: 'file', order: 'highest' }],
    [
      { scope: 'global', storage: 'redis', order: 'lowest' },
      { scope: 'global', storage: 'redis', order: 'lowest' },
    ],
    [
      { order: 'highest' },
      { scope: 'guild', storage: 'file', order: 'highest' },
    ],
  ])('reads %j', (config, expected) => {
    expect(
      rankingDeclaration.read(ranking(config as never), site('src/x.ts', 'xp'))
    ).toEqual({ name: 'xp', ...expected });
  });

  it.each([
    [
      'a text',
      'oops',
      "ranking() takes an object, or nothing: ranking({ order: 'lowest' }).",
    ],
    [
      'an unknown key',
      { expires: '1d' },
      '"expires" is not something a ranking has. It can have: scope, storage, order.',
    ],
    [
      'a wrong scope',
      { scope: 'server' },
      `"scope" is 'guild' (a ranking per server, the default) or 'global' (one ranking for the whole bot), got "server".`,
    ],
    [
      'a wrong storage',
      { storage: 'sql' },
      `"storage" is 'file' (a file in data/, the default) or 'redis' (the Redis of REDIS_URL in .env), got "sql".`,
    ],
    [
      'a wrong order',
      { order: 'desc' },
      `"order" is 'highest' (the highest score first, the default) or 'lowest' (the lowest first), got "desc".`,
    ],
  ])('refuses %s', (_, config, message) => {
    expect(() =>
      rankingDeclaration.read(ranking(config as never), site('src/x.ts', 'xp'))
    ).toThrow(message);
  });

  it('refuses a name a file can not be called, and is recognised among the exports', () => {
    expect(() =>
      rankingDeclaration.read(ranking(), site('src/x.ts', 'with space'))
    ).toThrow(`"with space" can't name a ranking`);
    expect(rankingDeclaration.is(ranking())).toBe(true);
    expect(rankingDeclaration.is({})).toBe(false);
    expect(rankingDeclaration.list).toBe(false);
  });

  it('refuses to work before the loader bound it, or outside a running bot', async () => {
    fileBackend();
    await expect(inGuild(GUILD_A, () => ranking().size())).rejects.toThrow(
      'This ranking was not loaded by ChapterJS: a ranking is exported from a file of src/ (export const name = ranking()), and used once the bot started.'
    );
  });
});

const storages = [
  ['in a file', async () => (fileBackend(), 'file' as const)],
  ['in Redis', async () => (await redisBackend(), 'redis' as const)],
  [
    'through the first process of a cluster',
    async () => (ipcBackend(), 'file' as const),
  ],
] as const;

describe.each(storages)('a ranking %s', (_, prepare) => {
  it('adds, sets, scores and ranks, per server, the highest first', async () => {
    const storage = await prepare();
    const xp = declared('xp', { storage });
    await inGuild(GUILD_A, async () => {
      expect(await xp.add('alice', 10)).toBe(10);
      expect(await xp.add('alice', 5)).toBe(15);
      expect(await xp.add('bob', 20)).toBe(20);
      await xp.set('carol', 7.5);
      expect(await xp.add('dave', -3)).toBe(-3);
      expect(await xp.score('alice')).toBe(15);
      expect(await xp.score('nobody')).toBeUndefined();
      expect(await xp.rankOf('bob')).toBe(1);
      expect(await xp.rankOf('alice')).toBe(2);
      expect(await xp.rankOf('dave')).toBe(4);
      expect(await xp.rankOf('nobody')).toBeUndefined();
      expect(await xp.size()).toBe(4);
      expect(await xp.top()).toEqual([
        { id: 'bob', score: 20, rank: 1 },
        { id: 'alice', score: 15, rank: 2 },
        { id: 'carol', score: 7.5, rank: 3 },
        { id: 'dave', score: -3, rank: 4 },
      ]);
      // Pages.
      expect(await xp.top(2)).toEqual([
        { id: 'bob', score: 20, rank: 1 },
        { id: 'alice', score: 15, rank: 2 },
      ]);
      expect(await xp.top(2, 2)).toEqual([
        { id: 'carol', score: 7.5, rank: 3 },
        { id: 'dave', score: -3, rank: 4 },
      ]);
      expect(await xp.top(5, 10)).toEqual([]);
      expect(await xp.top(0)).toEqual([]);
    });
    // Another server has its own ranking.
    expect(await xp.in(GUILD_B).top()).toEqual([]);
    expect(await xp.in(GUILD_A).score('bob')).toBe(20);
  });

  it('orders equal scores by id, the same way everywhere', async () => {
    const storage = await prepare();
    const high = declared('high', { storage, scope: 'global' });
    const low = declared('low', { storage, scope: 'global', order: 'lowest' });
    for (const id of ['b', 'a', 'é', 'c', 'B']) {
      await high.set(id, 1);
      await low.set(id, 1);
    }
    await high.set('z', 2);
    await low.set('z', 0);
    // Redis: by the bytes of the id, reversed for the highest first.
    expect((await high.top()).map(entry => entry.id)).toEqual([
      'z',
      'é',
      'c',
      'b',
      'a',
      'B',
    ]);
    expect((await low.top()).map(entry => entry.id)).toEqual([
      'z',
      'B',
      'a',
      'b',
      'c',
      'é',
    ]);
    expect(await high.rankOf('é')).toBe(2);
    expect(await low.rankOf('é')).toBe(6);
  });

  it('removes and clears, and says how many', async () => {
    const storage = await prepare();
    const xp = declared('xp', { storage });
    await xp.in(GUILD_A).set('alice', 1);
    await xp.in(GUILD_A).set('bob', 2);
    await xp.in(GUILD_B).set('alice', 3);
    expect(await xp.in(GUILD_A).remove('alice')).toBe(true);
    expect(await xp.in(GUILD_A).remove('alice')).toBe(false);
    expect(await xp.in(GUILD_A).top()).toEqual([
      { id: 'bob', score: 2, rank: 1 },
    ]);
    expect(await xp.in(GUILD_A).clear()).toBe(1);
    expect(await xp.in(GUILD_A).size()).toBe(0);
    expect(await xp.in(GUILD_A).clear()).toBe(0);
    expect(await xp.in(GUILD_B).score('alice')).toBe(3);
  });

  it('loses no point, however many are added at once', async () => {
    const storage = await prepare();
    const xp = declared('xp', { storage, scope: 'global' });
    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        xp.add(index % 2 === 0 ? 'alice' : 'bob', 2)
      )
    );
    // A tie, the highest first: by id, reversed.
    expect(await xp.top()).toEqual([
      { id: 'bob', score: 50, rank: 1 },
      { id: 'alice', score: 50, rank: 2 },
    ]);
  });

  it('refuses what is not an id, a score or a count, before anything is kept', async () => {
    const storage = await prepare();
    const xp = declared('xp', { storage, scope: 'global' });
    await expect(xp.add('', 1)).rejects.toThrow(
      'The id of a member of a ranking is a text that is not empty, got "".'
    );
    await expect(xp.add(12 as unknown as string, 1)).rejects.toThrow(
      'got 12. Write an id as a text: member.id, not a number.'
    );
    await expect(xp.add('a', Number.NaN)).rejects.toThrow(
      'What add() adds is a number, got null.'
    );
    await expect(xp.set('a', Infinity)).rejects.toThrow(
      'The score set() is a number, got null.'
    );
    await expect(xp.set('a', '3' as unknown as number)).rejects.toThrow(
      'The score set() is a number, got "3".'
    );
    await expect(xp.top(-1)).rejects.toThrow(
      'How many top() lists is a whole number, 0 or more, got -1.'
    );
    await expect(xp.top(10, 1.5)).rejects.toThrow(
      'How many top() skips is a whole number, 0 or more, got 1.5.'
    );
    expect(await xp.size()).toBe(0);
  });

  it('refuses to guess the server', async () => {
    const storage = await prepare();
    const xp = declared('xp', { storage });
    await expect(withGuild(null, () => xp.add('a', 1))).rejects.toThrow(
      "xp is a ranking per server, and this code does not run in one: use xp.in(guild) to say which server, or declare the ranking with scope: 'global'."
    );
    expect(() => xp.in('')).toThrow('in() takes a server (a Guild) or its id');
  });
});

describe('where a ranking keeps its scores', () => {
  it('in Redis: one sorted set per server, dev: in front under chapterjs dev', async () => {
    const { fake } = await redisBackend('dev:');
    const xp = declared('xp', { storage: 'redis' });
    const best = declared('best', { storage: 'redis', scope: 'global' });
    await xp.in(GUILD_A).add('alice', 10);
    await xp.in(GUILD_A).add('bob', 1.5);
    await best.set('carol', 3);
    expect(fake.keys()).toEqual(['dev:best', `dev:xp:${GUILD_A}`]);
    expect(fake.zset(`dev:xp:${GUILD_A}`)).toEqual([
      ['bob', 1.5],
      ['alice', 10],
    ]);
    // Added by Redis itself, in one command.
    expect(fake.commands.map(args => args[0])).toContain('ZINCRBY');
    expect(fake.commands.map(args => args[0])).not.toContain('WATCH');
    // A key of another kind under that name is said by Redis, plainly.
    fake.set('dev:best', 'a text');
    await expect(best.top()).rejects.toThrow('WRONGTYPE');
  });

  it('in a file: one entry per member in data/<name>.json', async () => {
    const { dir, backend } = fileBackend();
    const xp = declared('xp');
    await xp.in(GUILD_A).add('alice', 10);
    await backend.close();
    expect(JSON.parse(readFileSync(join(dir, 'xp.json'), 'utf8'))).toEqual({
      version: 1,
      entries: [[[GUILD_A, 'alice'], 10, null]],
    });
  });
});

describe.skipIf(process.platform === 'win32')(
  'a ranking in chapterjs dev',
  () => {
    const LEVEL = `import { command, ranking, store } from 'chapterjs';
export const xp = ranking({ storage: 'redis' });
export const hits = store<number>({ storage: 'redis' });
export default command({
  name: 'level',
  description: 'Gains xp',
  async run({ interaction, user }) {
    const score = await xp.add(user.id, 10);
    await hits.increment('all');
    const [best] = await xp.top(1);
    await interaction.reply(\`\${score} xp, rank \${await xp.rankOf(user.id)}, best \${best?.score}\`);
  },
});
`;

    it('is loaded, said with the stores kept in Redis, and keeps its scores there', async () => {
      const redis = await fakeRedis();
      const cwd = project(
        { 'src/level.ts': LEVEL },
        `BOT_TOKEN=test-token\nDEV_GUILD_ID=${GUILD}\nREDIS_URL=${redis.url}\n`
      );
      const fake = await world();
      const cli = runDev(cwd, fake);
      await cli.waitFor('✓ 1 command, 1 store, 1 ranking loaded');
      await cli.waitFor(
        `ℹ The store hits and the ranking xp are kept in Redis at 127.0.0.1:${redis.port}`
      );
      expect(await useCommand(fake, 'level', '1')).toBe(
        '10 xp, rank 1, best 10'
      );
      expect(await useCommand(fake, 'level', '2')).toBe(
        '20 xp, rank 1, best 20'
      );
      expect(redis.zset(`dev:xp:${GUILD}`)).toEqual([
        ['100000000000000003', 20],
      ]);
      cli.signal('SIGINT');
      const { output } = await cli.exited;
      expect(output).not.toMatch(/[✗⚠]/);
    });

    it('reports a store and a ranking with one name, and a ranking kept in Redis without REDIS_URL', async () => {
      const cwd = project({
        'src/a.ts': `import { store } from 'chapterjs';\nexport const xp = store<number>();\n`,
        'src/b.ts': `import { ranking } from 'chapterjs';\nexport const xp = ranking();\nexport const best = ranking({ storage: 'redis' });\n`,
      });
      const fake = await world();
      const cli = runDev(cwd, fake);
      await cli.waitFor('Connected to Dev Server');
      expect(cli.output).toContain(
        '✗ src/b.ts (xp) There is already a store named xp, in src/a.ts: the name of the export is the name of the ranking, so rename one of them.'
      );
      expect(cli.output).toContain(
        "✗ src/b.ts (best) best is kept in Redis (storage: 'redis'), but REDIS_URL is not set: add it to .env (like redis://localhost:6379) and start again, or remove storage: 'redis' to keep its scores in data/."
      );
      cli.signal('SIGINT');
      await cli.exited;
    });
  }
);

describe.skipIf(process.platform === 'win32')('the types of a ranking', () => {
  it('underline a score that is not a number, and an option a ranking does not have', async () => {
    const cwd = project({
      'src/ok.ts': `import { ranking } from 'chapterjs';
import type { RankingEntry } from 'chapterjs';
export const xp = ranking({ order: 'lowest', scope: 'global', storage: 'redis' });
export async function ok(): Promise<RankingEntry[]> {
  const score: number = await xp.add('a', 1);
  const rank: number | undefined = await xp.in('1').rankOf('a');
  return [...(await xp.top(10, score + (rank ?? 0)))];
}
`,
      'src/score.ts': `import { ranking } from 'chapterjs';
export const xp = ranking();
export const go = () => xp.add('a', '10');
`,
      'src/order.ts': `import { ranking } from 'chapterjs';
export const xp = ranking({ order: 'desc' });
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
    writeFileSync(join(cwd, '.env'), `BOT_TOKEN=t\nDEV_GUILD_ID=${GUILD}\n`);
    await runDev(cwd, await world(), ['sync']).exited;
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
      'src/order.ts',
      'src/score.ts',
    ]);
    expect(errors[0]).toMatch(
      /'"desc"' is not assignable to type 'RankingOrder/
    );
    expect(errors[1]).toMatch(
      /'string' is not assignable to parameter of type 'number'/
    );
  });
});
