// The loader: every file of src/ is loaded, and what the files export made
// with a function of the framework is what the bot runs, wherever it is.
import { tempDir } from '@chapterjs/test-utils';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  listSources,
  loadSources,
  readDeclarations,
  siteName,
  type Declaration,
} from '../src/loader/loader.js';

/** A project folder with the given files (path from the project → content). */
function files(content: Record<string, string>): string {
  const dir = tempDir();
  for (const [path, text] of Object.entries(content)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const BRAND = Symbol('test.thing');
const thing = (name: string): object => ({ [BRAND]: true, name });

/** A kind of declaration for these tests: an object made by `thing()`. */
const things = (list: boolean): Declaration<string> => ({
  one: 'thing',
  many: 'things',
  is: value =>
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true,
  list,
  read(value, site) {
    const { name } = value as { name: string };
    if (name === 'bad') throw new TypeError(`${name} is not allowed`);
    return `${name}@${site.name}`;
  },
});

describe('the files of src/', () => {
  it('are every source file, nested, in a stable order, without declarations and tests', async () => {
    const dir = files({
      'src/b.ts': '',
      'src/a.ts': '',
      'src/deep/er/c.mts': '',
      'src/deep/d.js': '',
      'src/e.mjs': '',
      'src/types.d.ts': '',
      'src/types.d.mts': '',
      'src/a.test.ts': '',
      'src/a.spec.ts': '',
      'src/notes.txt': '',
      'src/data.json': '',
      'public/x.ts': '',
      'other.ts': '',
    });
    expect((await listSources(dir)).map(found => found.file)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/deep/d.js',
      'src/deep/er/c.mts',
      'src/e.mjs',
    ]);
    expect(await listSources(files({}))).toEqual([]);
  });

  it('are all run, and a file that can not run is returned, not thrown', async () => {
    const dir = files({
      'src/ok.ts': 'export const a: number = 1;\nexport default 2;\n',
      'src/boom.ts': "throw new Error('boom');\n",
      'src/lib/plain.ts': 'export const b = 3;\n',
    });
    const { modules, failed } = await loadSources(dir);
    expect(modules.map(({ file }) => file)).toEqual([
      'src/lib/plain.ts',
      'src/ok.ts',
    ]);
    expect(modules[1]!.exports).toMatchObject({ a: 1, default: 2 });
    expect(failed).toHaveLength(1);
    expect(failed[0]!.file).toBe('src/boom.ts');
    expect(String(failed[0]!.error)).toContain('boom');
  });
});

describe('the declarations of a kind', () => {
  const module = (file: string, exports: Record<string, unknown>) => ({
    file,
    exports,
  });

  it('are read from every export of every file, the others left alone', () => {
    const { loaded, failed } = readDeclarations(
      [
        module('src/b.ts', { x: thing('one'), plain: 1, fn: () => {} }),
        module('src/a.ts', { default: thing('two'), other: { name: 'no' } }),
      ],
      things(false)
    );
    expect(failed).toEqual([]);
    expect(loaded).toEqual([
      // By file, then by export; a default export is named after its file.
      { file: 'src/a.ts', export: 'default', name: 'a', value: 'two@a' },
      { file: 'src/b.ts', export: 'x', name: 'x', value: 'one@x' },
    ]);
  });

  it('read the same value exported twice once, at the first place', () => {
    const shared = thing('same');
    const { loaded } = readDeclarations(
      [
        module('src/index.ts', { again: shared }),
        module('src/a.ts', { first: shared, alias: shared }),
      ],
      things(false)
    );
    expect(loaded.map(({ file, export: name }) => `${file}#${name}`)).toEqual([
      'src/a.ts#alias',
    ]);
  });

  it('accept a list only for what names itself', () => {
    const modules = [
      module('src/a.ts', { list: [thing('one'), 'not a thing', thing('two')] }),
    ];
    const named = readDeclarations(modules, things(true));
    expect(named.failed).toEqual([]);
    expect(named.loaded.map(({ value }) => value)).toEqual([
      'one@list',
      'two@list',
    ]);
    const unnamed = readDeclarations(modules, things(false));
    expect(unnamed.loaded).toEqual([]);
    expect(unnamed.failed).toHaveLength(1);
    expect(String(unnamed.failed[0]!.error)).toBe(
      'TypeError: This export is a list with a thing in it: export each thing on its own (export const list = ...), its name is the name of its export.'
    );
    // A list without any declaration is plain code.
    expect(
      readDeclarations([module('src/a.ts', { list: [1, 2] })], things(false))
    ).toEqual({ loaded: [], failed: [] });
  });

  it('return what can not be read with its export, and read the rest', () => {
    const { loaded, failed } = readDeclarations(
      [module('src/a.ts', { ok: thing('fine'), default: thing('bad') })],
      things(false)
    );
    expect(loaded.map(({ value }) => value)).toEqual(['fine@ok']);
    expect(failed).toEqual([
      {
        file: 'src/a.ts',
        export: 'default',
        error: new TypeError('bad is not allowed'),
      },
    ]);
  });

  it('are named in messages by their file, and their export when it is not the default one', () => {
    expect(siteName({ file: 'src/a.ts', export: 'default' })).toBe('src/a.ts');
    expect(siteName({ file: 'src/a.ts' })).toBe('src/a.ts');
    expect(siteName({ file: 'src/a.ts', export: 'ban' })).toBe(
      'src/a.ts (ban)'
    );
  });
});
