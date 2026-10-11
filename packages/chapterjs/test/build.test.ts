import {
  cpSync,
  existsSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprint } from '../src/cli/build.js';
import { spawnSync } from 'node:child_process';
import { bin, buildProject, packageDir, project } from './dev-helpers.js';

const PING = `import { command } from 'chapterjs';
import { answer } from '../lib/answer';
export default command({
  name: 'ping',
  description: 'Replies with Pong!',
  async run({ interaction }) {
    await interaction.reply(answer);
  },
});
`;
const files = {
  'src/commands/ping.ts': PING,
  'src/lib/answer.ts': `export const answer: string = 'Pong!';\nexport function neverUsed(): string {\n  return 'dropped from the build';\n}\n`,
  'src/events/ready/hello.ts': `import { event } from 'chapterjs';\nexport default event({ name: 'ready', run: ({ user }) => console.log(user.username) });\n`,
};
/** A project with TypeScript, as the scaffolder leaves it. */
function typed(content: Record<string, string>): string {
  const cwd = project(content);
  cpSync(
    join(packageDir, '../create-chapterjs/templates/default/tsconfig.json'),
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
  it('checks the project and compiles it into one file in .chapterjs/build', () => {
    const cwd = typed(files);
    const result = buildProject(cwd);
    expect(result.output).toBe(
      '✓ Types checked\n✓ Built in .chapterjs/build: 1 command, 1 event (1 kB)\nℹ Run chapterjs start to put it online.\n'
    );
    expect(result.code).toBe(0);
    const built = join(cwd, '.chapterjs/build');
    expect(readdirSync(built).sort()).toEqual([
      'bot.js',
      'bot.js.map',
      'build.json',
    ]);
    const bot = readFileSync(join(built, 'bot.js'), 'utf8');
    // JavaScript, compact: the code on one line, then where its map is.
    expect(bot.trimEnd().split('\n')).toHaveLength(2);
    expect(bot).toMatch(/\n\/\/# sourceMappingURL=bot\.js\.map\n$/);
    expect(bot).not.toContain(': string');
    // Every file of src/ is in, as it runs in dev: what the bot runs in
    // production is exactly what it ran while it was written.
    expect(bot).toContain('"Pong!"');
    expect(bot).toContain('dropped from the build');
    // With the names the developer wrote, so errors read like their code.
    expect(bot).toContain('answer');
    // Packages are not copied in: the bot and the framework share them.
    expect(bot).toMatch(/from"chapterjs"/);
    expect(bot).not.toContain('Symbol.for');
    // The map leads back to the files of the project, without copying them.
    const map = JSON.parse(readFileSync(join(built, 'bot.js.map'), 'utf8'));
    expect(map.sources).toEqual(
      expect.arrayContaining([
        '../../src/commands/ping.ts',
        '../../src/lib/answer.ts',
        '../../src/events/ready/hello.ts',
      ])
    );
    expect(map).not.toHaveProperty('sourcesContent');
    const info = JSON.parse(readFileSync(join(built, 'build.json'), 'utf8'));
    expect(info).toEqual({
      version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      sources: expect.stringMatching(/^[0-9a-f]{64}$/),
      commands: 1,
      events: 1,
      // No file joins voice: no voice states to ask for.
      voice: false,
    });
    // The types of the project are written too, and the build is not in git.
    expect(existsSync(join(cwd, '.chapterjs/tsconfig.json'))).toBe(true);
    expect(readFileSync(join(cwd, '.chapterjs/.gitignore'), 'utf8')).toBe(
      '*\n'
    );
  });

  it('needs nothing installed in the project to compile it', () => {
    const cwd = project(files);
    // The compiler comes with the framework.
    expect(existsSync(join(cwd, 'node_modules/esbuild'))).toBe(false);
    expect(buildProject(cwd).code).toBe(0);
    expect(existsSync(join(cwd, '.chapterjs/build/bot.js'))).toBe(true);
  });

  it('says when types could not be checked, and builds all the same', () => {
    const result = buildProject(project(files));
    expect(result.code).toBe(0);
    expect(result.output).toBe(
      'ℹ Types were not checked: TypeScript is not installed in this project (or it has no tsconfig.json).\n✓ Built in .chapterjs/build: 1 command, 1 event (1 kB)\nℹ Run chapterjs start to put it online.\n'
    );
  });

  it('builds a project with nothing to run yet', () => {
    const result = buildProject(
      project({ 'src/lib/later.ts': 'export {};\n' })
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain(
      "ℹ Nothing to run yet: export a command or an event from a file of src/, like export default command({ name: 'ping', ... })\n✓ Built in .chapterjs/build: nothing to run yet (1 kB)\n"
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
      'one of its commands',
      {
        'src/commands/greet.ts': `import { command } from 'chapterjs';\nexport default command({ name: 'greet', run() {} });\n`,
        'src/messages/en-US.ts': `import { language } from 'chapterjs';
export default language({ locale: 'en-US', default: true, texts: { a: 'b' }, commands: { greet: { description: 'Greets' } } });
`,
      },
      /src\/messages\/fr\.ts\(6,5\): error TS2353: Object literal may only specify known properties, and 'ping' does not exist in type '\{ readonly greet\?: CommandTranslation<.*> \| undefined; \}'\./,
    ],
    [
      'every command',
      {
        'src/messages/en-US.ts': `import { language } from 'chapterjs';
export default language({ locale: 'en-US', default: true, texts: { a: 'b' } });
`,
      },
      /src\/messages\/fr\.ts\(6,5\): error TS2322: Type '\{ description: string; \}' is not assignable to type 'never'\./,
    ],
  ])(
    'underlines a language file that translates a command its file describes: %s',
    (_, more, error) => {
      const cwd = typed({
        'src/commands/ping.ts': `import { command } from 'chapterjs';\nexport default command({ name: 'ping', description: 'Pong', run() {} });\n`,
        'src/messages/fr.ts': `import { language } from 'chapterjs';
export default language({
  locale: 'fr',
  texts: { a: 'c' },
  commands: {
    ping: { description: 'Pong !' },
  },
});
`,
        ...more,
      });
      // The files run first, and the language file is refused there...
      const result = buildProject(cwd);
      expect(result.code).toBe(1);
      expect(result.output).toContain(
        '✗ src/messages/fr.ts /ping is described in src/commands/ping.ts: remove its description there to translate it here, or remove it here.'
      );
      expect(existsSync(join(cwd, '.chapterjs/build'))).toBe(false);
      // ...but the types were written from them: the editor underlines it.
      const types = spawnSync(join(cwd, 'node_modules/.bin/tsc'), ['-b'], {
        cwd,
        encoding: 'utf8',
      });
      expect(types.stdout).toMatch(error);
    }
  );

  it.each([
    [
      'a file that can not run',
      {
        'src/commands/broken.ts': `import { command } from 'chapterjs';\nexport default command({ name: 'broken', description: 'd' } as never);\n`,
      },
      [
        /✗ src\/commands\/broken\.ts This command has no "run"/,
        /✗ This file can't run, so your bot was not built\. Fix it and build again: chapterjs dev shows the same errors while you write\./,
      ],
    ],
    [
      'several files that can not run',
      {
        'src/commands/broken.ts': `import { command } from 'chapterjs';\nexport default command({ name: 'broken', description: 'd' } as never);\n`,
        'src/events/x.ts': `import { event } from 'chapterjs';\nexport const nope = event({ name: 'nope', run() {} } as never);\n`,
        'src/commands/throws.ts': "throw new Error('boom');\n",
      },
      [
        /✗ src\/commands\/throws\.ts:1 boom/,
        /✗ src\/events\/x\.ts \(nope\) "nope" is not an event/,
        /✗ These 3 files can't run, so your bot was not built\. Fix them and build again/,
      ],
    ],
    [
      'two declarations of the same command',
      { 'src/commands/(a)/ping.ts': PING.replace('../lib', '../../lib') },
      [
        /✗ src\/commands\/ping\.ts \/ping is already declared in src\/commands\/\(a\)\/ping\.ts: two commands can't have the same name\./,
      ],
    ],
    [
      'a file that can not be compiled',
      {
        'src/commands/lazy.ts': `import { command } from 'chapterjs';
export default command({
  name: 'lazy',
  description: 'd',
  async run() {
    await import('./not-there');
  },
});
`,
      },
      [
        /✗ src\/commands\/lazy\.ts:6 Could not resolve "\.\/not-there"/,
        /✗ This file can't be compiled, so your bot was not built\. Fix it and build again/,
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

  it('takes what the files import from anywhere in the project', () => {
    const cwd = project({
      ...files,
      'config.ts': `export const motto: string = 'from the root of the project';\n`,
      'src/commands/outside.ts': `import { command } from 'chapterjs';
import { motto } from '../../config';
export default command({ name: 'outside', description: motto, run() {} });
`,
    });
    const result = buildProject(cwd);
    expect(result.code).toBe(0);
    expect(result.output).toContain('2 commands, 1 event');
    expect(
      readFileSync(join(cwd, '.chapterjs/build/bot.js'), 'utf8')
    ).toContain('from the root of the project');
  });

  it('replaces the last build: a removed file is no longer in it', () => {
    const cwd = project({
      ...files,
      'src/commands/old.ts': PING.replace(
        "name: 'ping'",
        "name: 'old'"
      ).replace('Replies with Pong!', 'Old command'),
    });
    const bot = () =>
      readFileSync(join(cwd, '.chapterjs/build/bot.js'), 'utf8');
    expect(buildProject(cwd).output).toContain('2 commands, 1 event');
    expect(bot()).toContain('Old command');
    rmSync(join(cwd, 'src/commands/old.ts'));
    // A command removed from the project must not stay online.
    expect(buildProject(cwd).output).toContain('1 command, 1 event');
    expect(bot()).not.toContain('Old command');
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
    expect(existsSync(join(cwd, '.chapterjs/build/bot.js'))).toBe(true);
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
