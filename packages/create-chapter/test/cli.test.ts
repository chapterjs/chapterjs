import { tempDir } from '@chapterjs/test-utils';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakePackageManagers, runCreate } from './helpers.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string };

const all = fakePackageManagersSpec({
  pnpm: '10.33.0',
  npm: '11.16.0',
  yarn: '1.22.22',
  bun: '1.3.5',
});

function fakePackageManagersSpec(versions: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(versions).map(([pm, v]) => [pm, { version: v }])
  );
}

const readPackage = (dir: string) =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const installedBy = (dir: string) =>
  readFileSync(join(dir, '.installed-by'), 'utf8').trim();

/** The lines of the "Next steps" box, without its borders. */
function nextSteps(output: string): string[] {
  const box = output.slice(output.lastIndexOf('Next steps'));
  return box
    .split('\n')
    .slice(1)
    .map(line => line.replace(/^[│├╰╮╯─\s]+|[│├╰╮╯─\s]+$/g, ''))
    .filter(line => line && !line.includes('Happy building'));
}

describe.skipIf(process.platform === 'win32')('create-chapter CLI', () => {
  describe('the whole flow', () => {
    it('creates, installs and explains the next steps with the defaults', async () => {
      const cwd = tempDir();
      const cli = runCreate({ cwd, path: fakePackageManagers(all) });

      await cli.waitFor(`Create a ChapterJS bot (v${version})`);
      await cli.waitFor('Where should the project be created?');
      cli.press('enter');
      await cli.waitFor('Which package manager do you want to use?');
      cli.press('enter');
      const { code, output } = await cli.exited;

      expect(code).toBe(0);
      const dir = join(cwd, 'my-bot');
      expect(readPackage(dir)).toMatchObject({
        name: 'my-bot',
        dependencies: { chapterjs: `^${version}` },
      });
      expect(readPackage(dir)).not.toHaveProperty('description');
      expect(existsSync(join(dir, '.gitignore'))).toBe(true);
      expect(existsSync(join(dir, '_gitignore'))).toBe(false);
      expect(installedBy(dir)).toBe('pnpm');
      expect(output).toContain('Using the default template');
      expect(output).toContain(`Project created in ${dir}`);
      expect(output).toContain('Dependencies installed with pnpm');
      expect(nextSteps(output)).toEqual([
        'cd my-bot',
        'Copy .env.example to .env and fill in BOT_TOKEN and DEV_GUILD_ID',
        'pnpm dev',
      ]);
      expect(output).toContain('Happy building!');
    });

    it('shows every manager with its version, pnpm first', async () => {
      const cli = runCreate({ cwd: tempDir(), path: fakePackageManagers(all) });
      cli.press('enter');
      await cli.waitFor('Which package manager do you want to use?');
      // Only the highlighted option shows its hint: walk through all of them.
      for (const [pm, v] of [
        ['pnpm', '10.33.0'],
        ['npm', '11.16.0'],
        ['yarn', '1.22.22'],
        ['bun', '1.3.5'],
      ]) {
        await cli.waitFor(`${pm} (v${v})`);
        cli.press('down');
      }
      expect(cli.output).toMatch(/pnpm[\s\S]*npm[\s\S]*yarn[\s\S]*bun/);
    });
  });

  describe('the folder', () => {
    it('uses the typed name', async () => {
      const cwd = tempDir();
      const cli = runCreate({ cwd, path: fakePackageManagers(all) });
      await cli.waitFor('Where should the project be created?');
      cli.type('super-bot');
      cli.press('enter');
      await cli.waitFor('Which package manager');
      cli.press('enter');
      expect((await cli.exited).code).toBe(0);
      expect(readPackage(join(cwd, 'super-bot')).name).toBe('super-bot');
    });

    it('creates nested folders and names the package after the last one', async () => {
      const cwd = tempDir();
      const cli = runCreate({ cwd, path: fakePackageManagers(all) });
      await cli.waitFor('Where should the project be created?');
      cli.type('bots/discord/My Bot');
      cli.press('enter');
      await cli.waitFor('Which package manager');
      cli.press('enter');
      const { output } = await cli.exited;
      const dir = join(cwd, 'bots/discord/My Bot');
      expect(readPackage(dir).name).toBe('my-bot');
      expect(nextSteps(output)[0]).toBe('cd "bots/discord/My Bot"');
    });

    it('creates the project in the current folder with "."', async () => {
      const cwd = join(tempDir(), 'Mon Bot');
      mkdirSync(cwd);
      const cli = runCreate({ cwd, path: fakePackageManagers(all) });
      await cli.waitFor('Where should the project be created?');
      cli.type('.');
      cli.press('enter');
      await cli.waitFor('Which package manager');
      cli.press('enter');
      const { code, output } = await cli.exited;
      expect(code).toBe(0);
      expect(readPackage(cwd).name).toBe('mon-bot');
      expect(installedBy(cwd)).toBe('pnpm');
      // Already in the right folder: no `cd` step.
      expect(nextSteps(output)[0]).not.toMatch(/^cd /);
    });

    it('refuses a non-empty current folder, then accepts another name', async () => {
      const cwd = tempDir();
      writeFileSync(join(cwd, 'keep-me.txt'), 'precious');
      const cli = runCreate({ cwd, path: fakePackageManagers(all) });
      await cli.waitFor('Where should the project be created?');
      cli.type('.');
      cli.press('enter');
      await cli.waitFor('The current folder is not empty');
      for (let i = 0; i < 5; i++) cli.press('backspace');
      cli.type('other');
      cli.press('enter');
      await cli.waitFor('Which package manager');
      cli.press('enter');
      expect((await cli.exited).code).toBe(0);
      expect(readFileSync(join(cwd, 'keep-me.txt'), 'utf8')).toBe('precious');
      expect(readPackage(join(cwd, 'other')).name).toBe('other');
    });

    it('refuses the default name when my-bot is already used', async () => {
      const cwd = tempDir();
      mkdirSync(join(cwd, 'my-bot'));
      writeFileSync(join(cwd, 'my-bot', 'index.ts'), '');
      const cli = runCreate({ cwd, path: fakePackageManagers(all) });
      await cli.waitFor('Where should the project be created?');
      cli.press('enter');
      await cli.waitFor('The folder my-bot is not empty. Pick another name.');
      cli.type('bot-2');
      cli.press('enter');
      await cli.waitFor('Which package manager');
      cli.press('enter');
      expect((await cli.exited).code).toBe(0);
      expect(readdirSync(join(cwd, 'my-bot'))).toEqual(['index.ts']);
      expect(existsSync(join(cwd, 'bot-2', 'package.json'))).toBe(true);
    });

    it('refuses a file', async () => {
      const cwd = tempDir();
      writeFileSync(join(cwd, 'taken'), '');
      const cli = runCreate({ cwd, path: fakePackageManagers(all) });
      await cli.waitFor('Where should the project be created?');
      cli.type('taken');
      cli.press('enter');
      await cli.waitFor('taken is a file, not a folder. Pick another name.');
    });

    describe('given as an argument', () => {
      it('skips the question when the folder is valid', async () => {
        const cwd = tempDir();
        const cli = runCreate({
          cwd,
          args: ['from-arg'],
          path: fakePackageManagers(all),
        });
        await cli.waitFor('Which package manager');
        cli.press('enter');
        const { code, output } = await cli.exited;
        expect(code).toBe(0);
        expect(output).not.toContain('Where should the project be created?');
        expect(readPackage(join(cwd, 'from-arg')).name).toBe('from-arg');
      });

      it('accepts "." for an empty current folder', async () => {
        const cwd = tempDir();
        const cli = runCreate({
          cwd,
          args: ['.'],
          path: fakePackageManagers(all),
        });
        await cli.waitFor('Which package manager');
        cli.press('enter');
        expect((await cli.exited).code).toBe(0);
        expect(readPackage(cwd).name).toBe(basename(cwd).toLowerCase());
      });

      it('says why an invalid folder is refused, then asks for another', async () => {
        const cwd = tempDir();
        mkdirSync(join(cwd, 'used'));
        writeFileSync(join(cwd, 'used', 'file'), '');
        const cli = runCreate({
          cwd,
          args: ['used'],
          path: fakePackageManagers(all),
        });
        await cli.waitFor('The folder used is not empty. Pick another name.');
        await cli.waitFor('Where should the project be created?');
        cli.type('fresh');
        cli.press('enter');
        await cli.waitFor('Which package manager');
        cli.press('enter');
        expect((await cli.exited).code).toBe(0);
        expect(existsSync(join(cwd, 'fresh', 'package.json'))).toBe(true);
        expect(readdirSync(join(cwd, 'used'))).toEqual(['file']);
      });

      it('asks the question when the argument is blank', async () => {
        const cli = runCreate({
          cwd: tempDir(),
          args: ['  '],
          path: fakePackageManagers(all),
        });
        await cli.waitFor(
          'Type a folder name, or . to use the current folder.'
        );
        await cli.waitFor('Where should the project be created?');
      });
    });
  });

  describe('the package manager', () => {
    it.each([
      ['pnpm/10.33.0 npm/? node/v24.18.0 darwin arm64', 'pnpm', 'pnpm dev'],
      ['npm/11.16.0 node/v24.18.0 darwin arm64', 'npm', 'npm run dev'],
      ['yarn/1.22.22 npm/? node/v24.18.0 darwin arm64', 'yarn', 'yarn dev'],
      ['bun/1.3.5 npm/? node/v24.3.0 darwin arm64', 'bun', 'bun dev'],
    ])(
      'preselects the one that ran the command (%s)',
      async (userAgent, pm, run) => {
        const cwd = tempDir();
        const cli = runCreate({
          cwd,
          args: ['bot'],
          path: fakePackageManagers(all),
          userAgent,
        });
        await cli.waitFor('Which package manager');
        cli.press('enter');
        const { output } = await cli.exited;
        expect(installedBy(join(cwd, 'bot'))).toBe(pm);
        expect(output).toContain(`Dependencies installed with ${pm}`);
        expect(nextSteps(output).at(-1)).toBe(run);
      }
    );

    it('lets the user pick another one with the arrows', async () => {
      const cwd = tempDir();
      const cli = runCreate({
        cwd,
        args: ['bot'],
        path: fakePackageManagers(all),
      });
      await cli.waitFor('Which package manager');
      cli.press('down');
      cli.press('down');
      await cli.waitFor('yarn (v1.22.22)');
      cli.press('enter');
      expect((await cli.exited).code).toBe(0);
      expect(installedBy(join(cwd, 'bot'))).toBe('yarn');
    });

    it('wraps around from the first to the last one', async () => {
      const cwd = tempDir();
      const cli = runCreate({
        cwd,
        args: ['bot'],
        path: fakePackageManagers(all),
      });
      await cli.waitFor('Which package manager');
      cli.press('up');
      await cli.waitFor('bun (v1.3.5)');
      cli.press('enter');
      await cli.exited;
      expect(installedBy(join(cwd, 'bot'))).toBe('bun');
    });

    it('shows missing managers as not installed and never picks them', async () => {
      const cwd = tempDir();
      const cli = runCreate({
        cwd,
        args: ['bot'],
        path: fakePackageManagers({
          pnpm: { version: '10.0.0' },
          bun: { version: '1.0.0' },
        }),
      });
      await cli.waitFor('Which package manager');
      expect(cli.output).toContain('npm (not installed)');
      expect(cli.output).toContain('yarn (not installed)');
      expect(cli.output).not.toContain('pnpm (not installed)');
      expect(cli.output).not.toContain('bun (not installed)');
      // From pnpm, one step down skips npm and yarn and lands on bun.
      cli.press('down');
      await cli.waitFor('bun (v1.0.0)');
      cli.press('enter');
      await cli.exited;
      expect(installedBy(join(cwd, 'bot'))).toBe('bun');
    });

    it('falls back to the first installed one when the detected one is missing', async () => {
      const cwd = tempDir();
      const cli = runCreate({
        cwd,
        args: ['bot'],
        path: fakePackageManagers({
          npm: { version: '11.0.0' },
          yarn: { version: '1.22.22' },
        }),
        userAgent: 'bun/1.3.5 npm/? node/v24.3.0 darwin arm64',
      });
      await cli.waitFor('Which package manager');
      cli.press('enter');
      await cli.exited;
      expect(installedBy(join(cwd, 'bot'))).toBe('npm');
    });

    it.each(['pnpm', 'npm', 'yarn', 'bun'])(
      'skips the question when %s is the only one installed',
      async pm => {
        const cwd = tempDir();
        const cli = runCreate({
          cwd,
          args: ['bot'],
          path: fakePackageManagers({ [pm]: { version: '1.0.0' } }),
        });
        const { code, output } = await cli.exited;
        expect(code).toBe(0);
        expect(output).not.toContain('Which package manager');
        expect(output).toContain(
          `Using ${pm}, the only package manager installed`
        );
        expect(installedBy(join(cwd, 'bot'))).toBe(pm);
      }
    );

    it('stops before creating anything when no manager is installed', async () => {
      const cwd = tempDir();
      const cli = runCreate({ cwd, args: ['bot'], path: tempDir() });
      const { code, output } = await cli.exited;
      expect(code).toBe(1);
      expect(output).toContain(
        'No package manager found. Install one of pnpm, npm, yarn, bun, then run this command again.'
      );
      expect(readdirSync(cwd)).toEqual([]);
    });

    it('detects yarn even inside a project locked to pnpm by corepack', async () => {
      const cwd = tempDir();
      writeFileSync(
        join(cwd, 'package.json'),
        JSON.stringify({ packageManager: 'pnpm@11.0.0' })
      );
      const cli = runCreate({
        cwd,
        args: ['bot'],
        path: fakePackageManagers({
          pnpm: { version: '11.0.0' },
          yarn: { version: '1.22.22' },
        }),
      });
      await cli.waitFor('Which package manager');
      expect(cli.output).not.toContain('yarn (not installed)');
    });
  });

  describe('the installation', () => {
    it('reports a failed install, keeps the project and adds the install step', async () => {
      const cwd = tempDir();
      const cli = runCreate({
        cwd,
        args: ['bot'],
        path: fakePackageManagers({
          npm: {
            version: '11.0.0',
            failInstall: 'npm error notarget No matching version found',
          },
        }),
      });
      const { code, output } = await cli.exited;
      expect(code).toBe(0);
      expect(output).toContain(
        'The dependencies could not be installed with npm'
      );
      expect(output).toContain('npm error notarget No matching version found');
      expect(output).not.toContain('Dependencies installed');
      expect(existsSync(join(cwd, 'bot', 'package.json'))).toBe(true);
      expect(nextSteps(output)).toEqual([
        'cd bot',
        'npm install',
        'Copy .env.example to .env and fill in BOT_TOKEN and DEV_GUILD_ID',
        'npm run dev',
      ]);
    });

    it('runs the install inside the new project, not where the command was run', async () => {
      const cwd = tempDir();
      const cli = runCreate({
        cwd,
        args: ['bot'],
        path: fakePackageManagers({ pnpm: { version: '10.0.0' } }),
      });
      await cli.exited;
      expect(existsSync(join(cwd, '.installed-by'))).toBe(false);
      expect(installedBy(join(cwd, 'bot'))).toBe('pnpm');
    });
  });

  describe('cancelling', () => {
    it.each(['ctrlC', 'escape'] as const)(
      'with %s at the folder question creates nothing',
      async key => {
        const cwd = tempDir();
        const cli = runCreate({ cwd, path: fakePackageManagers(all) });
        await cli.waitFor('Where should the project be created?');
        cli.type('half-typed');
        cli.press(key);
        const { code, output } = await cli.exited;
        expect(code).toBe(0);
        expect(output).toContain('Cancelled, nothing was created.');
        expect(readdirSync(cwd)).toEqual([]);
      }
    );

    it.each(['ctrlC', 'escape'] as const)(
      'with %s at the package manager question creates nothing',
      async key => {
        const cwd = tempDir();
        const cli = runCreate({
          cwd,
          args: ['bot'],
          path: fakePackageManagers(all),
        });
        await cli.waitFor('Which package manager');
        cli.press(key);
        const { code, output } = await cli.exited;
        expect(code).toBe(0);
        expect(output).toContain('Cancelled, nothing was created.');
        expect(readdirSync(cwd)).toEqual([]);
      }
    );
  });
});
