import { fakeBin, tempDir } from '@chapterjs/test-utils';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  detectPackageManager,
  install,
  installedVersions,
  packageManagers,
  runScript,
} from '../src/package-manager.js';
import { fakePackageManagers } from './helpers.js';

describe('packageManagers', () => {
  it('lists pnpm first, then npm, yarn and bun', () => {
    expect(packageManagers).toEqual(['pnpm', 'npm', 'yarn', 'bun']);
  });
});

describe('detectPackageManager', () => {
  it.each([
    ['pnpm/10.33.0 npm/? node/v24.18.0 darwin arm64', 'pnpm'],
    ['npm/11.16.0 node/v24.18.0 darwin arm64 workspaces/false', 'npm'],
    ['yarn/1.22.22 npm/? node/v24.18.0 darwin arm64', 'yarn'],
    ['yarn/4.5.0 npm/? node/v24.18.0 linux x64', 'yarn'],
    ['bun/1.3.5 npm/? node/v24.3.0 darwin arm64', 'bun'],
  ])('reads %j as %s', (agent, pm) => {
    vi.stubEnv('npm_config_user_agent', agent);
    expect(detectPackageManager()).toBe(pm);
  });

  it.each([
    ['no user agent', undefined],
    ['an empty user agent', ''],
    ['an unknown manager', 'cnpm/9.0.0 node/v24.0.0'],
    ['a name that only starts like a known one', 'pnpmx/1.0.0'],
    ['a name in uppercase', 'PNPM/10.0.0'],
    ['garbage', '???'],
  ])('falls back to pnpm with %s', (_, agent) => {
    vi.stubEnv('npm_config_user_agent', agent);
    expect(detectPackageManager()).toBe('pnpm');
  });
});

describe('runScript', () => {
  it.each([
    ['pnpm', 'pnpm dev'],
    ['npm', 'npm run dev'],
    ['yarn', 'yarn dev'],
    ['bun', 'bun dev'],
  ] as const)('runs a script with %s as %j', (pm, command) => {
    expect(runScript(pm, 'dev')).toBe(command);
  });

  it('keeps the script name as given', () => {
    expect(runScript('npm', 'build:prod')).toBe('npm run build:prod');
  });
});

describe.skipIf(process.platform === 'win32')('installedVersions', () => {
  it('reports the version of each installed manager and undefined for the others', async () => {
    vi.stubEnv(
      'PATH',
      fakePackageManagers({
        pnpm: { version: '10.33.0' },
        bun: { version: '1.3.5' },
      })
    );
    expect(await installedVersions()).toEqual({
      pnpm: '10.33.0',
      npm: undefined,
      yarn: undefined,
      bun: '1.3.5',
    });
  });

  it('reports nothing when no manager is installed', async () => {
    vi.stubEnv('PATH', tempDir());
    expect(await installedVersions()).toEqual({
      pnpm: undefined,
      npm: undefined,
      yarn: undefined,
      bun: undefined,
    });
  });

  it('ignores the package.json of the current folder (corepack refusing other managers)', async () => {
    const cwd = tempDir();
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@11.0.0' })
    );
    // A real change of folder: the managers are started from it.
    const previous = process.cwd();
    process.chdir(cwd);
    onTestFinished(() => process.chdir(previous));
    vi.stubEnv('PATH', fakePackageManagers({ yarn: { version: '1.22.22' } }));
    expect((await installedVersions()).yarn).toBe('1.22.22');
  });

  it('treats a manager that fails or prints nothing as not installed', async () => {
    vi.stubEnv(
      'PATH',
      fakeBin({ pnpm: 'exit 1', npm: 'exit 0', yarn: 'echo "   "' })
    );
    expect(await installedVersions()).toEqual({
      pnpm: undefined,
      npm: undefined,
      yarn: undefined,
      bun: undefined,
    });
  });

  it('trims the version', async () => {
    vi.stubEnv('PATH', fakeBin({ npm: 'echo "  11.0.0  "; echo ""' }));
    expect((await installedVersions()).npm).toBe('11.0.0');
  });

  it('checks every manager at the same time', async () => {
    const slow = '/bin/sleep 0.5; echo 1.0.0';
    vi.stubEnv(
      'PATH',
      fakeBin({ pnpm: slow, npm: slow, yarn: slow, bun: slow })
    );
    const start = performance.now();
    await installedVersions();
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe.skipIf(process.platform === 'win32')('install', () => {
  it('runs `<pm> install` in the project folder', async () => {
    vi.stubEnv('PATH', fakePackageManagers({ yarn: { version: '1.0.0' } }));
    const cwd = tempDir();
    const result = await install('yarn', cwd);
    expect(result).toEqual({ ok: true, output: 'installed with yarn' });
    expect(readFileSync(join(cwd, '.installed-by'), 'utf8')).toBe('yarn\n');
  });

  it('returns what the manager printed when it fails', async () => {
    vi.stubEnv(
      'PATH',
      fakePackageManagers({
        pnpm: { version: '1.0.0', failInstall: 'ERR_PNPM_NO_MATCHING_VERSION' },
      })
    );
    const cwd = tempDir();
    expect(await install('pnpm', cwd)).toEqual({
      ok: false,
      output: 'ERR_PNPM_NO_MATCHING_VERSION',
    });
    expect(existsSync(join(cwd, '.installed-by'))).toBe(false);
  });

  it('collects both stdout and stderr', async () => {
    vi.stubEnv('PATH', fakeBin({ npm: 'echo out; echo err >&2; exit 3' }));
    const result = await install('npm', tempDir());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('out');
    expect(result.output).toContain('err');
  });

  it('says plainly when the manager is not installed', async () => {
    vi.stubEnv('PATH', tempDir());
    expect(await install('bun', tempDir())).toEqual({
      ok: false,
      output: 'bun is not installed on this computer.',
    });
  });

  it('handles a large output without blocking', async () => {
    vi.stubEnv(
      'PATH',
      fakeBin({
        npm: 'i=0; while [ $i -lt 20000 ]; do echo "line $i of a very long install log"; i=$((i+1)); done',
      })
    );
    const result = await install('npm', tempDir());
    expect(result.ok).toBe(true);
    expect(result.output.split('\n')).toHaveLength(20000);
  });
});
