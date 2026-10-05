import {
  cpSync,
  existsSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprint } from '../src/cli/build.js';
import { spawnSync } from 'node:child_process';
import { bin, buildProject, packageDir, project } from './dev-helpers.js';

const PING = `import { command } from 'chapterjs';
import { answer } from '../lib/answer';
export default command({
  description: 'Replies with Pong!',
  async run({ interaction }) {
    await interaction.reply(answer);
  },
});
`;
const files = {
  'src/commands/ping.ts': PING,
  'src/lib/answer.ts': `export const answer: string = 'Pong!';\n`,
  'src/events/ready/hello.ts': `import { event } from 'chapterjs';\nexport default event(({ user }) => console.log(user.username));\n`,
};
/** A project with TypeScript, as the scaffolder leaves it. */
function typed(content: Record<string, string>): string {
  const cwd = project(content);
  cpSync(
    join(packageDir, '../create-chapter/templates/default/tsconfig.json'),
    join(cwd, 'tsconfig.json')
  );
  symlinkSync(
    join(packageDir, 'node_modules/@types'),
    join(cwd, 'node_modules/@types'),
    'dir'
  );
  for (const name of ['.bin', 'typescript']) {
    symlinkSync(
      join(packageDir, 'node_modules', name),
      join(cwd, 'node_modules', name),
      'dir'
    );
  }
  return cwd;
}

describe.skipIf(process.platform === 'win32')('chapterjs build', () => {
  it('checks the project and keeps what passed in .chapterjs/build', () => {
    const cwd = typed(files);
    const result = buildProject(cwd);
    expect(result.output).toBe(
      '✓ Types checked\n✓ Built in .chapterjs/build: 1 command, 1 event\nℹ Run chapterjs start to put it online.\n'
    );
    expect(result.code).toBe(0);
    const built = join(cwd, '.chapterjs/build');
    // Everything of src, as it was: also what the files import.
    for (const file of Object.keys(files)) {
      expect(readFileSync(join(built, file), 'utf8')).toBe(
        files[file as keyof typeof files]
      );
    }
    const info = JSON.parse(readFileSync(join(built, 'build.json'), 'utf8'));
    expect(info).toEqual({
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      sources: expect.stringMatching(/^[0-9a-f]{64}$/),
      commands: 1,
      events: 1,
    });
    // The types of the project are written too, and the build is not in git.
    expect(existsSync(join(cwd, '.chapterjs/tsconfig.json'))).toBe(true);
    expect(readFileSync(join(cwd, '.chapterjs/.gitignore'), 'utf8')).toBe(
      '*\n'
    );
  });

  it('says when types could not be checked, and builds all the same', () => {
    const result = buildProject(project(files));
    expect(result.code).toBe(0);
    expect(result.output).toBe(
      'ℹ Types were not checked: TypeScript is not installed in this project (or it has no tsconfig.json).\n✓ Built in .chapterjs/build: 1 command, 1 event\nℹ Run chapterjs start to put it online.\n'
    );
  });

  it('builds a project with nothing to run yet', () => {
    const result = buildProject(
      project({ 'src/lib/later.ts': 'export {};\n' })
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain(
      'ℹ Nothing to run yet: add a file in src/commands/ or in a folder like src/events/messageCreate/\n✓ Built in .chapterjs/build: nothing to run yet\n'
    );
  });

  it('stops on a type error, with where it is, and builds nothing', () => {
    const cwd = typed({
      ...files,
      'src/lib/answer.ts': `export const answer: string = 5;\n`,
    });
    const result = buildProject(cwd);
    expect(result.code).toBe(1);
    expect(result.output).toMatch(
      /^✗ Your project has type errors, so it was not built:\n  src\/lib\/answer\.ts\(1,14\): error TS2322: Type 'number' is not assignable to type 'string'\.\n$/
    );
    expect(existsSync(join(cwd, '.chapterjs/build'))).toBe(false);
  });

  it.each([
    [
      'a file that can not run',
      { 'src/commands/broken.ts': 'export default 5;\n' },
      [
        /✗ src\/commands\/broken\.ts The default export of this file must be what command\(\) returns/,
        /✗ This file can't run, so your bot was not built\. Fix it and build again: chapterjs dev shows the same errors while you write\./,
      ],
    ],
    [
      'several files that can not run',
      {
        'src/commands/broken.ts': 'export default 5;\n',
        'src/events/nope/x.ts': '',
        'src/commands/throws.ts': "throw new Error('boom');\n",
      },
      [
        /✗ src\/commands\/throws\.ts:1 boom/,
        /✗ src\/events\/nope\/x\.ts The folder src\/events\/nope is not named after an event/,
        /✗ These 3 files can't run, so your bot was not built\. Fix them and build again/,
      ],
    ],
    [
      'two files that are the same command',
      { 'src/commands/(a)/ping.ts': PING.replace('../lib', '../../lib') },
      [
        /✗ src\/commands\/ping\.ts \/ping is already src\/commands\/\(a\)\/ping\.ts/,
      ],
    ],
    [
      'a file that imports something outside src',
      {
        'config.ts': `export const name: string = 'bot';\n`,
        'src/commands/outside.ts': `import { command } from 'chapterjs';
import { name } from '../../config';
export default command({ description: name, run() {} });
`,
      },
      [
        /✗ src\/commands\/outside\.ts .*Cannot find module/,
        /ℹ A file your bot imports was not found in the build\. Everything it runs must be inside src\/ \(or be an installed package\): move it there\./,
        /✗ This file can't run, so your bot was not built\./,
      ],
    ],
  ])('stops on %s, and leaves no build behind', (_what, more, messages) => {
    const cwd = project({ ...files, ...more });
    // A build that worked before must not survive one that failed.
    writeFileSync(join(cwd, 'src/commands/placeholder.txt'), '');
    const result = buildProject(cwd);
    for (const message of messages) expect(result.output).toMatch(message);
    expect(result.code).toBe(1);
    expect(result.output).not.toContain('Built in');
    expect(existsSync(join(cwd, '.chapterjs/build'))).toBe(false);
  });

  it('replaces the last build: a removed file is no longer in it', () => {
    const cwd = project({ ...files, 'src/commands/old.ts': PING });
    expect(buildProject(cwd).output).toContain('2 commands, 1 event');
    const old = join(cwd, '.chapterjs/build/src/commands/old.ts');
    expect(existsSync(old)).toBe(true);
    rmSync(join(cwd, 'src/commands/old.ts'));
    // A command removed from the project must not stay online.
    expect(buildProject(cwd).output).toContain('1 command, 1 event');
    expect(existsSync(old)).toBe(false);
  });

  it('survives what writes the types of the project again', () => {
    const cwd = project(files);
    expect(buildProject(cwd).code).toBe(0);
    // `chapterjs sync` (run after every install) and `chapterjs dev` clean
    // the folder they share with the build.
    const sync = spawnSync(process.execPath, [bin, 'sync'], {
      cwd,
      encoding: 'utf8',
    });
    expect(sync.status).toBe(0);
    expect(existsSync(join(cwd, '.chapterjs/build/build.json'))).toBe(true);
    expect(existsSync(join(cwd, '.chapterjs/build/src/commands/ping.ts'))).toBe(
      true
    );
  });

  it('says there is no project in a folder without src', () => {
    const result = buildProject(project({}));
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/^✗ There is no src folder here\./);
  });
});

describe('the fingerprint of the sources', () => {
  it('changes with a content, a name or a file, and with nothing else', async () => {
    const make = (content: Record<string, string>) =>
      fingerprint(join(project(content), 'src'));
    const base = await make(files);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    // The same files elsewhere: the same.
    expect(await make(files)).toBe(base);
    expect(await make({ ...files, 'src/lib/answer.ts': 'x' })).not.toBe(base);
    expect(await make({ ...files, 'src/lib/more.ts': '' })).not.toBe(base);
    const { 'src/lib/answer.ts': answer, ...rest } = files;
    expect(await make({ ...rest, 'src/lib/renamed.ts': answer })).not.toBe(
      base
    );
    // A content moved from a file to its neighbour is not the same either.
    expect(await make({ 'src/a.ts': 'xy', 'src/b.ts': '' })).not.toBe(
      await make({ 'src/a.ts': 'x', 'src/b.ts': 'y' })
    );
  });
});
