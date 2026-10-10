import { fakeBin, startCli, tempDir } from '@chapterjs/test-utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const bin = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const version = (url: URL) =>
  JSON.parse(readFileSync(url, 'utf8')).version as string;

describe.skipIf(process.platform === 'win32')('create-chapter', () => {
  it('is always released with the same version as create-chapterjs', () => {
    expect(version(new URL('../package.json', import.meta.url))).toBe(
      version(new URL('../../create-chapterjs/package.json', import.meta.url))
    );
  });

  it('has its own README, description, keywords and homepage on npm', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    expect(pkg.description).toContain('create-chapterjs');
    expect(pkg.keywords).toEqual(
      expect.arrayContaining(['discord', 'discord-bot', 'chapterjs'])
    );
    expect(pkg.homepage).toBe('https://www.chapterjs.org');
    const readme = readFileSync(
      new URL('../README.md', import.meta.url),
      'utf8'
    );
    expect(readme).toMatch(/^# create-chapter\n/);
    expect(readme).toContain('pnpm create chapter my-bot');
  });

  it('runs the create-chapterjs CLI, arguments included', async () => {
    const cwd = tempDir();
    const cli = startCli({
      bin,
      args: ['my-alias-bot'],
      cwd,
      env: {
        PATH: fakeBin({
          pnpm: 'case "$1" in --version) echo 10.0.0;; install) exit 0;; esac',
        }),
      },
    });
    // The folder is given, pnpm is the only manager: the template is the
    // one question left, and Enter takes the default one.
    await cli.waitFor('Which template do you want to start from?');
    cli.press('enter');
    const { code, output } = await cli.exited;
    expect(code).toBe(0);
    expect(output).toContain('Create a ChapterJS bot');
    expect(output).toContain('Using pnpm, the only package manager installed');
    const pkg = JSON.parse(
      readFileSync(join(cwd, 'my-alias-bot', 'package.json'), 'utf8')
    );
    expect(pkg.name).toBe('my-alias-bot');
  });
});
