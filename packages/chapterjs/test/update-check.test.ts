import { fakeDiscord, tempDir } from '@chapterjs/test-utils';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHANGELOG_URL,
  checkForUpdate,
  describeUpdate,
  isNewer,
  updateCommand,
} from '../src/cli/update-check.js';
import { project, runDev, world } from './dev-helpers.js';

const DAY = 24 * 60 * 60 * 1000;

describe('isNewer', () => {
  it.each([
    ['0.3.0', '0.2.0', true],
    ['1.0.0', '0.9.9', true],
    ['0.2.1', '0.2.0', true],
    ['0.2.0', '0.2.0', false],
    ['0.1.9', '0.2.0', false],
    ['0.2.0', '0.10.0', false],
    ['0.10.0', '0.9.0', true],
    // Only the numbers count: a prerelease is not told from its final.
    ['1.0.0', '1.0.0-beta.2', false],
    ['1.0.1', '1.0.0-beta.2', true],
    ['v0.3.0', '0.2.0', true],
    [' 0.3.0 ', '0.2.0', true],
    // What is not a version is never newer.
    ['latest', '0.2.0', false],
    ['0.3', '0.2.0', false],
    ['', '0.2.0', false],
    ['0.3.0', 'dev', false],
    ['0.3.0.1', '0.2.0', false],
  ])('%s newer than %s: %s', (latest, current, expected) => {
    expect(isNewer(latest, current)).toBe(expected);
  });
});

describe('updateCommand', () => {
  it.each([
    ['pnpm-lock.yaml', 'pnpm update chapterjs --latest'],
    ['package-lock.json', 'npm install chapterjs@latest'],
    ['npm-shrinkwrap.json', 'npm install chapterjs@latest'],
    ['yarn.lock', 'yarn add chapterjs@latest'],
    ['bun.lock', 'bun add chapterjs@latest'],
    ['bun.lockb', 'bun add chapterjs@latest'],
  ])('reads the package manager from %s', (lockfile, command) => {
    const cwd = tempDir();
    writeFileSync(join(cwd, lockfile), '');
    // The lockfile wins over who started the command.
    expect(updateCommand(cwd, { npm_config_user_agent: 'yarn/4.0.0' })).toBe(
      command
    );
  });

  it.each([
    [
      'pnpm/11.0.0 npm/? node/v24.0.0 darwin arm64',
      'pnpm update chapterjs --latest',
    ],
    ['npm/10.9.0 node/v24.0.0 darwin arm64', 'npm install chapterjs@latest'],
    ['yarn/4.5.0 npm/? node/v24.0.0 darwin arm64', 'yarn add chapterjs@latest'],
    ['bun/1.2.0 npm/? node/v24.0.0 darwin arm64', 'bun add chapterjs@latest'],
  ])('falls back on who started the command (%s)', (agent, command) => {
    expect(updateCommand(tempDir(), { npm_config_user_agent: agent })).toBe(
      command
    );
  });

  it.each([
    ['nothing known', {}],
    ['an unknown agent', { npm_config_user_agent: 'deno/2.0.0' }],
    ['an empty agent', { npm_config_user_agent: '' }],
  ])('is npm with %s', (_, env) => {
    expect(updateCommand(tempDir(), env)).toBe('npm install chapterjs@latest');
  });
});

describe('checkForUpdate', () => {
  /** A registry that publishes `latest`. */
  async function registry(latest: unknown, status = 200) {
    const server = await fakeDiscord();
    server.on('GET', '/chapterjs/latest', {
      status,
      body: typeof latest === 'string' ? { version: latest } : latest,
    });
    return server;
  }
  const cacheFile = (cwd: string) =>
    join(cwd, '.chapterjs', 'cache', 'update.json');
  const readCache = (cwd: string) =>
    JSON.parse(readFileSync(cacheFile(cwd), 'utf8')) as {
      checked: number;
      latest: string;
    };

  it('finds a newer version and keeps the answer for a day', async () => {
    const server = await registry('0.3.0');
    const cwd = tempDir();
    writeFileSync(join(cwd, 'pnpm-lock.yaml'), '');
    const now = 1_700_000_000_000;
    const options = {
      cwd,
      version: '0.2.0',
      env: {},
      registryUrl: server.url,
      now: () => now,
    };
    expect(await checkForUpdate(options)).toEqual({
      current: '0.2.0',
      latest: '0.3.0',
      command: 'pnpm update chapterjs --latest',
    });
    expect(server.requests.map(request => request.path)).toEqual([
      '/chapterjs/latest',
    ]);
    expect(readCache(cwd)).toEqual({ checked: now, latest: '0.3.0' });

    // Within a day, the registry is not asked again.
    expect(
      await checkForUpdate({ ...options, now: () => now + DAY - 1 })
    ).toMatchObject({ latest: '0.3.0' });
    expect(server.requests).toHaveLength(1);
    // A day later it is.
    server.on('GET', '/chapterjs/latest', { body: { version: '0.4.0' } });
    expect(
      await checkForUpdate({ ...options, now: () => now + DAY })
    ).toMatchObject({ latest: '0.4.0' });
    expect(server.requests).toHaveLength(2);
    expect(readCache(cwd)).toEqual({ checked: now + DAY, latest: '0.4.0' });
  });

  it('says nothing when the bot runs the latest version, or a newer one', async () => {
    const server = await registry('0.2.0');
    const cwd = tempDir();
    const options = { cwd, version: '0.2.0', env: {}, registryUrl: server.url };
    expect(await checkForUpdate(options)).toBeNull();
    expect(await checkForUpdate({ ...options, version: '0.3.0' })).toBeNull();
    // The answer is still kept: nothing asked twice.
    expect(server.requests).toHaveLength(1);
  });

  it.each([
    ['a version that is not published', { message: 'Not Found' }, 404],
    ['an error of the registry', { message: 'oops' }, 500],
    ['an answer without version', { name: 'chapterjs' }, 200],
    ['a version that is not one', { version: 'latest' }, 200],
    ['a version that is not a string', { version: 3 }, 200],
    ['no JSON at all', 'not json', 200],
    ['null', null, 200],
  ])('says nothing on %s', async (_, body, status) => {
    const server = await registry(body, status);
    const cwd = tempDir();
    expect(
      await checkForUpdate({
        cwd,
        version: '0.2.0',
        env: {},
        registryUrl: server.url,
      })
    ).toBeNull();
    // Nothing is remembered, so the registry is asked again next time.
    expect(() => readFileSync(cacheFile(cwd))).toThrow();
  });

  it('says nothing without network, and never waits for it', async () => {
    const cwd = tempDir();
    const started = performance.now();
    expect(
      await checkForUpdate({
        cwd,
        version: '0.2.0',
        env: {},
        registryUrl: 'http://127.0.0.1:1',
      })
    ).toBeNull();
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('gives up on a registry that does not answer in time', async () => {
    const server = await fakeDiscord();
    server.on('GET', '/chapterjs/latest', {
      body: { version: '9.9.9' },
      delay: 500,
    });
    const cwd = tempDir();
    expect(
      await checkForUpdate({
        cwd,
        version: '0.2.0',
        env: {},
        registryUrl: server.url,
        timeout: 50,
      })
    ).toBeNull();
  });

  it("uses yesterday's answer when the registry can't be reached today", async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, '.chapterjs', 'cache'), { recursive: true });
    writeFileSync(
      cacheFile(cwd),
      JSON.stringify({ checked: 0, latest: '0.3.0' })
    );
    expect(
      await checkForUpdate({
        cwd,
        version: '0.2.0',
        env: {},
        registryUrl: 'http://127.0.0.1:1',
      })
    ).toMatchObject({ latest: '0.3.0' });
  });

  it.each([
    ['garbage', 'not json'],
    ['the wrong shape', JSON.stringify({ latest: 3 })],
    ['null', 'null'],
    ['a list', '[]'],
  ])('asks again when the kept answer is %s', async (_, content) => {
    const server = await registry('0.3.0');
    const cwd = tempDir();
    mkdirSync(join(cwd, '.chapterjs', 'cache'), { recursive: true });
    writeFileSync(cacheFile(cwd), content);
    expect(
      await checkForUpdate({
        cwd,
        version: '0.2.0',
        env: {},
        registryUrl: server.url,
      })
    ).toMatchObject({ latest: '0.3.0' });
    expect(server.requests).toHaveLength(1);
    expect(readCache(cwd).latest).toBe('0.3.0');
  });

  it('reads the registry from the environment', async () => {
    const server = await registry('0.3.0');
    expect(
      await checkForUpdate({
        cwd: tempDir(),
        version: '0.2.0',
        env: { CHAPTERJS_REGISTRY_URL: server.url },
      })
    ).toMatchObject({ latest: '0.3.0' });
  });

  it('describes the update with what to run and where to read', () => {
    expect(
      describeUpdate({
        current: '0.2.0',
        latest: '0.3.0',
        command: 'pnpm update chapterjs --latest',
      })
    ).toBe(
      `A new version of chapterjs is out: 0.3.0 (you have 0.2.0). To update, run:\npnpm update chapterjs --latest\nWhat changed: ${CHANGELOG_URL}`
    );
  });
});

describe.skipIf(process.platform === 'win32')('chapterjs dev', () => {
  it('tells about a new version once the bot is online', async () => {
    const fake = await world();
    fake.registry.on('GET', '/chapterjs/latest', {
      body: { version: '99.0.0' },
    });
    const cwd = project({ 'src/commands/.gitkeep': '' });
    writeFileSync(join(cwd, 'pnpm-lock.yaml'), '');
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ Connected to Dev Server as test-bot');
    await cli.waitFor(
      `ℹ A new version of chapterjs is out: 99.0.0 (you have ${currentVersion()}). To update, run:\n  pnpm update chapterjs --latest\n  What changed: ${CHANGELOG_URL}`
    );
    expect(
      JSON.parse(
        readFileSync(join(cwd, '.chapterjs/cache/update.json'), 'utf8')
      )
    ).toMatchObject({ latest: '99.0.0' });
  });

  it('says nothing when there is no newer version', async () => {
    const fake = await world();
    fake.registry.on('GET', '/chapterjs/latest', {
      body: { version: currentVersion() },
    });
    const cli = runDev(project({ 'src/commands/.gitkeep': '' }), fake);
    await cli.waitFor('✓ Connected to Dev Server as test-bot');
    await cli.waitFor('ℹ Nothing to run yet');
    // The registry was asked, and had nothing to say.
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(fake.registry.requests.map(request => request.path)).toEqual([
      '/chapterjs/latest',
    ]);
    expect(cli.output).not.toContain('A new version');
  });
});

function currentVersion(): string {
  return (
    JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string }
  ).version;
}
