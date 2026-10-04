import { tempDir } from '@chapterjs/test-utils';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createProject,
  toPackageName,
  validateTargetDir,
} from '../src/project.js';

/** Runs `validateTargetDir` as if the user ran the CLI from `cwd`. */
function validateFrom(cwd: string, input: string | undefined) {
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  return validateTargetDir(input);
}

describe('validateTargetDir', () => {
  it.each([undefined, '', ' ', '\t \n'])(
    'asks for a name when the input is %j',
    input => {
      expect(validateFrom(tempDir(), input)).toBe(
        'Type a folder name, or . to use the current folder.'
      );
    }
  );

  it('accepts a folder that does not exist yet', () => {
    expect(validateFrom(tempDir(), 'my-bot')).toBeUndefined();
  });

  it('accepts nested folders that do not exist yet', () => {
    expect(validateFrom(tempDir(), 'bots/discord/my-bot')).toBeUndefined();
  });

  it('accepts an absolute path', () => {
    expect(validateFrom(tempDir(), join(tempDir(), 'my-bot'))).toBeUndefined();
  });

  it('ignores spaces around the name', () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, 'used'));
    writeFileSync(join(cwd, 'used', 'file.txt'), '');
    expect(validateFrom(cwd, '  my-bot  ')).toBeUndefined();
    expect(validateFrom(cwd, '  used  ')).toBe(
      'The folder used is not empty. Pick another name.'
    );
  });

  it('accepts an existing empty folder', () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, 'empty'));
    expect(validateFrom(cwd, 'empty')).toBeUndefined();
  });

  it.each(['.git', '.DS_Store', 'Thumbs.db', '.idea', '.vscode'])(
    'treats a folder containing only %s as empty',
    file => {
      const cwd = tempDir();
      mkdirSync(join(cwd, 'target', file), { recursive: true });
      expect(validateFrom(cwd, 'target')).toBeUndefined();
    }
  );

  it('accepts a folder containing every ignored file at once', () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, 'target', '.git'), { recursive: true });
    writeFileSync(join(cwd, 'target', '.DS_Store'), '');
    writeFileSync(join(cwd, 'target', 'Thumbs.db'), '');
    expect(validateFrom(cwd, 'target')).toBeUndefined();
  });

  it.each(['index.ts', '.env', '.gitignore', 'node_modules', '.hidden'])(
    'refuses a folder containing %s',
    file => {
      const cwd = tempDir();
      mkdirSync(join(cwd, 'target'));
      writeFileSync(join(cwd, 'target', file), '');
      expect(validateFrom(cwd, 'target')).toBe(
        'The folder target is not empty. Pick another name.'
      );
    }
  );

  it('refuses a file', () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'notes.txt'), '');
    expect(validateFrom(cwd, 'notes.txt')).toBe(
      'notes.txt is a file, not a folder. Pick another name.'
    );
  });

  it('follows a symlink to an empty folder', () => {
    const cwd = tempDir();
    symlinkSync(tempDir(), join(cwd, 'link'));
    expect(validateFrom(cwd, 'link')).toBeUndefined();
  });

  describe('the current folder', () => {
    it.each(['.', './', ' . '])('accepts %j when it is empty', input => {
      expect(validateFrom(tempDir(), input)).toBeUndefined();
    });

    it.each(['.', './'])(
      'refuses %j with a dedicated message when it is not empty',
      input => {
        const cwd = tempDir();
        writeFileSync(join(cwd, 'package.json'), '{}');
        expect(validateFrom(cwd, input)).toBe(
          'The current folder is not empty. Type a name to create a new folder instead.'
        );
      }
    );

    it('uses the dedicated message for a path that leads back to it', () => {
      const cwd = tempDir();
      mkdirSync(join(cwd, 'sub'));
      writeFileSync(join(cwd, 'file'), '');
      expect(validateFrom(cwd, 'sub/..')).toBe(
        'The current folder is not empty. Type a name to create a new folder instead.'
      );
    });
  });
});

describe('toPackageName', () => {
  it.each([
    ['my-bot', 'my-bot'],
    ['My Bot', 'my-bot'],
    ['MyBot', 'mybot'],
    ['  spaced  out  ', 'spaced-out'],
    ['tabs\tand\nlines', 'tabs-and-lines'],
    ['Mon Bot Été', 'mon-bot-ete'],
    ['Crème brûlée', 'creme-brulee'],
    ['Ñandú', 'nandu'],
    ['bot!!!', 'bot'],
    ['a  --  b', 'a-b'],
    ['a___b', 'a___b'],
    ['a.b.c', 'a.b.c'],
    ['~tilde', '~tilde'],
    ['.hidden', 'hidden'],
    ['_private', 'private'],
    ['-dash-', 'dash'],
    ['..._-bot', 'bot'],
    ['bot.', 'bot'],
    ['bot-.-', 'bot'],
    ['🤖 robot', 'robot'],
    ['bot 🤖', 'bot'],
    ['機器人', 'chapter-bot'],
    ['!!!', 'chapter-bot'],
    ['...', 'chapter-bot'],
    ['___', 'chapter-bot'],
  ])('turns %j into %j', (folder, name) => {
    expect(toPackageName(folder)).toBe(name);
  });

  it('uses the last folder of a path', () => {
    expect(toPackageName('bots/discord/My Bot')).toBe('my-bot');
    expect(toPackageName('/absolute/path/to/my-bot/')).toBe('my-bot');
  });

  it('uses the name of the current folder for "."', () => {
    const cwd = join(tempDir(), 'Current Folder');
    mkdirSync(cwd);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    expect(toPackageName('.')).toBe('current-folder');
  });

  it('cuts names longer than npm allows', () => {
    const name = toPackageName('a'.repeat(300));
    expect(name).toBe('a'.repeat(214));
  });

  it('never ends a cut name with a dash', () => {
    const name = toPackageName(`${'a'.repeat(213)} b`);
    expect(name).toBe('a'.repeat(213));
  });

  it('always returns a valid npm name', () => {
    const valid = /^(?![._])[a-z0-9-~._]{1,214}$/;
    for (const folder of [
      'Hello World',
      '___',
      'ÀÉÎÕÜ',
      'a/b',
      '  ',
      '🤖',
      'x'.repeat(500),
      '-_.~',
      'UPPER_case.Mixed-123',
    ]) {
      expect(toPackageName(folder)).toMatch(valid);
    }
  });
});

/** A template folder with the given files, for `createProject`. */
function fakeTemplates(files: Record<string, string>) {
  const root = tempDir();
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, 'tpl', path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

const templatePackage = JSON.stringify({
  name: 'template-name',
  description: 'Shown in the menu',
  private: true,
  type: 'module',
  scripts: { dev: 'chapterjs dev' },
  dependencies: { chapterjs: 'latest', other: '^1.0.0' },
  devDependencies: { typescript: '^7.0.0' },
});

function readPackage(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

describe('createProject', () => {
  it('copies every file of the template, nested folders and dotfiles included', async () => {
    const templatesRoot = fakeTemplates({
      'package.json': templatePackage,
      '.env.example': 'BOT_TOKEN=\n',
      'src/events/ready.ts': 'export {};\n',
      'src/commands/.gitkeep': '',
      'deep/a/b/c.txt': 'deep',
    });
    const dir = join(tempDir(), 'my-bot');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^1.2.3',
      templatesRoot,
    });
    expect(readFileSync(join(dir, '.env.example'), 'utf8')).toBe(
      'BOT_TOKEN=\n'
    );
    expect(readFileSync(join(dir, 'src/events/ready.ts'), 'utf8')).toBe(
      'export {};\n'
    );
    expect(existsSync(join(dir, 'src/commands/.gitkeep'))).toBe(true);
    expect(readFileSync(join(dir, 'deep/a/b/c.txt'), 'utf8')).toBe('deep');
  });

  it('renames _gitignore to .gitignore', async () => {
    const templatesRoot = fakeTemplates({
      'package.json': templatePackage,
      _gitignore: 'node_modules\n.env\n',
    });
    const dir = join(tempDir(), 'my-bot');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^1.0.0',
      templatesRoot,
    });
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(
      'node_modules\n.env\n'
    );
    expect(existsSync(join(dir, '_gitignore'))).toBe(false);
  });

  it('works with a template that has no _gitignore', async () => {
    const templatesRoot = fakeTemplates({ 'package.json': templatePackage });
    const dir = join(tempDir(), 'my-bot');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^1.0.0',
      templatesRoot,
    });
    expect(readdirSync(dir)).toEqual(['package.json']);
  });

  it('names the package after the folder and sets the chapterjs version', async () => {
    const templatesRoot = fakeTemplates({ 'package.json': templatePackage });
    const dir = join(tempDir(), 'Mon Bot Été');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^0.4.2',
      templatesRoot,
    });
    expect(readPackage(dir)).toEqual({
      name: 'mon-bot-ete',
      private: true,
      type: 'module',
      scripts: { dev: 'chapterjs dev' },
      dependencies: { chapterjs: '^0.4.2', other: '^1.0.0' },
      devDependencies: { typescript: '^7.0.0' },
    });
  });

  it('adds chapterjs when the template forgot it', async () => {
    const templatesRoot = fakeTemplates({
      'package.json': JSON.stringify({ name: 'x' }),
    });
    const dir = join(tempDir(), 'bot');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^1.0.0',
      templatesRoot,
    });
    expect(readPackage(dir).dependencies).toEqual({ chapterjs: '^1.0.0' });
  });

  it('writes package.json with 2 spaces and a final newline', async () => {
    const templatesRoot = fakeTemplates({ 'package.json': '{"name":"x"}' });
    const dir = join(tempDir(), 'bot');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^1.0.0',
      templatesRoot,
    });
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(
      '{\n  "name": "bot",\n  "dependencies": {\n    "chapterjs": "^1.0.0"\n  }\n}\n'
    );
  });

  it('creates missing parent folders', async () => {
    const templatesRoot = fakeTemplates({ 'package.json': templatePackage });
    const dir = join(tempDir(), 'a', 'b', 'c', 'bot');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^1.0.0',
      templatesRoot,
    });
    expect(readPackage(dir).name).toBe('bot');
  });

  it('fills an existing folder that only has ignored files, keeping them', async () => {
    const templatesRoot = fakeTemplates({ 'package.json': templatePackage });
    const dir = join(tempDir(), 'bot');
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await createProject({
      dir,
      template: 'tpl',
      chapterjsVersion: '^1.0.0',
      templatesRoot,
    });
    expect(readFileSync(join(dir, '.git', 'HEAD'), 'utf8')).toBe(
      'ref: refs/heads/main\n'
    );
    expect(readPackage(dir).name).toBe('bot');
  });

  it('never changes the template itself', async () => {
    const templatesRoot = fakeTemplates({
      'package.json': templatePackage,
      _gitignore: 'x',
    });
    await createProject({
      dir: join(tempDir(), 'bot'),
      template: 'tpl',
      chapterjsVersion: '^1.0.0',
      templatesRoot,
    });
    expect(
      readFileSync(join(templatesRoot, 'tpl', 'package.json'), 'utf8')
    ).toBe(templatePackage);
    expect(existsSync(join(templatesRoot, 'tpl', '_gitignore'))).toBe(true);
  });

  it('fails when the template does not exist', async () => {
    await expect(
      createProject({
        dir: join(tempDir(), 'bot'),
        template: 'missing',
        chapterjsVersion: '^1.0.0',
        templatesRoot: tempDir(),
      })
    ).rejects.toThrow();
  });
});
