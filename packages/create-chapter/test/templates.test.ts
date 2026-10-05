import { tempDir } from '@chapterjs/test-utils';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listTemplates, templatesDir } from '../src/templates.js';

function templatesFolder(templates: Record<string, object | undefined>) {
  const root = tempDir();
  for (const [name, pkg] of Object.entries(templates)) {
    mkdirSync(join(root, name));
    if (pkg)
      writeFileSync(join(root, name, 'package.json'), JSON.stringify(pkg));
  }
  return root;
}

describe('listTemplates', () => {
  it('lists every folder with its description', async () => {
    const root = templatesFolder({
      basic: { description: 'A basic bot' },
      music: { description: 'A music bot' },
    });
    expect(await listTemplates(root)).toEqual([
      { name: 'basic', description: 'A basic bot' },
      { name: 'music', description: 'A music bot' },
    ]);
  });

  it('puts default first, then sorts by name', async () => {
    const root = templatesFolder({
      zeta: {},
      alpha: {},
      default: {},
      middle: {},
    });
    expect((await listTemplates(root)).map(t => t.name)).toEqual([
      'default',
      'alpha',
      'middle',
      'zeta',
    ]);
  });

  it('sorts without default too', async () => {
    const root = templatesFolder({ b: {}, a: {}, c: {} });
    expect((await listTemplates(root)).map(t => t.name)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it.each([
    ['missing', {}],
    ['not a string', { description: 42 }],
    ['null', { description: null }],
  ])('has no description when it is %s', async (_, pkg) => {
    const root = templatesFolder({ only: pkg });
    expect(await listTemplates(root)).toEqual([
      { name: 'only', description: undefined },
    ]);
  });

  it('ignores files and folders without a package.json', async () => {
    const root = templatesFolder({ real: {}, 'not-a-template': undefined });
    writeFileSync(join(root, 'README.md'), '');
    writeFileSync(join(root, '.DS_Store'), '');
    expect((await listTemplates(root)).map(t => t.name)).toEqual(['real']);
  });

  it('returns an empty list for an empty folder', async () => {
    expect(await listTemplates(tempDir())).toEqual([]);
  });
});

/**
 * The templates shipped to users: what every one of them must contain for the
 * scaffolder and the framework to work.
 */
describe('shipped templates', async () => {
  const templates = await listTemplates();

  it('include a default template, listed first', () => {
    expect(templates[0]?.name).toBe('default');
  });

  describe.each(templates.map(t => t.name))('%s', name => {
    const dir = join(templatesDir, name);
    const read = (file: string) => readFileSync(join(dir, file), 'utf8');
    const pkg = JSON.parse(read('package.json'));

    it('has a description for the menu', () => {
      expect(pkg.description).toEqual(expect.any(String));
      expect(pkg.description.length).toBeGreaterThan(0);
    });

    it('is a private ES module project', () => {
      expect(pkg.private).toBe(true);
      expect(pkg.type).toBe('module');
    });

    it('runs through the chapterjs CLI', () => {
      expect(pkg.scripts).toMatchObject({
        dev: 'chapterjs dev',
        start: 'chapterjs start',
      });
      expect(pkg.dependencies).toHaveProperty('chapterjs');
    });

    it('requires the Node version chapterjs needs', () => {
      expect(pkg.engines?.node).toBe('>=22.18');
    });

    it('ships .gitignore as _gitignore, since npm strips .gitignore', () => {
      expect(existsSync(join(dir, '.gitignore'))).toBe(false);
      expect(existsSync(join(dir, '_gitignore'))).toBe(true);
    });

    it('never commits secrets or installed files', () => {
      const ignored = read('_gitignore').split('\n');
      expect(ignored).toEqual(
        expect.arrayContaining(['.env', 'node_modules', 'dist'])
      );
      expect(existsSync(join(dir, '.env'))).toBe(false);
      expect(existsSync(join(dir, 'node_modules'))).toBe(false);
    });

    it('documents every variable the CLI needs, empty', () => {
      const env = read('.env.example');
      for (const variable of ['BOT_TOKEN', 'DEV_GUILD_ID']) {
        expect(env).toMatch(new RegExp(`^${variable}=$`, 'm'));
      }
    });

    it('has the conventional folders', () => {
      expect(existsSync(join(dir, 'src', 'events'))).toBe(true);
      expect(existsSync(join(dir, 'src', 'commands'))).toBe(true);
    });

    it('type-checks files the way chapterjs runs them', () => {
      const tsconfig = JSON.parse(read('tsconfig.json'));
      expect(tsconfig.compilerOptions).toMatchObject({
        // Imports need no extension.
        module: 'Preserve',
        moduleResolution: 'Bundler',
        allowImportingTsExtensions: true,
        erasableSyntaxOnly: true,
        verbatimModuleSyntax: true,
        noEmit: true,
        strict: true,
      });
      // The files of the project are type-checked by the projects chapterjs
      // generates, where each folder gets its own types.
      expect(tsconfig.files).toEqual([]);
      expect(tsconfig.references).toEqual([{ path: './.chapterjs' }]);
    });
  });
});
