// Loads the files of a project and finds what they declare. Every source
// file under `src/` is loaded, wherever it is and whatever it is called:
// what the framework runs is what the files export, made with one of its
// functions (`command()`, `event()`, `button()`...). One mechanism for
// every feature: a feature only says how to recognise and read its
// declarations.

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { importFile } from './hot.js';

/** Where a declaration was found: a file of the project, and its export. */
export interface ExportSite {
  /** The path from the project folder, with `/`: `src/moderation/ban.ts`. */
  file: string;
  /** The name of the export: `'ban'`, or `'default'`. */
  export: string;
  /**
   * The name the export gives to what it declares: the name of the export,
   * or the name of the file (without extension) for the default export.
   */
  name: string;
}

/** A kind of declaration a feature reads from the exports of the files. */
export interface Declaration<T> {
  /** What one is called in messages: "event", "command"... */
  one: string;
  many: string;
  /** Whether a value is one of these, before it is read. */
  is(value: unknown): boolean;
  /**
   * Whether a file may export several in a list. Only what names itself
   * (an event, a command, a language) may: a list has no export name to
   * give each one.
   */
  list: boolean;
  /**
   * Checks a declaration and returns what the feature needs from it.
   * Throws an error whose message says what to write.
   */
  read(value: unknown, site: ExportSite): T;
}

/** A declaration, read, with where it comes from. */
export interface LoadedItem<T> extends ExportSite {
  value: T;
}

/** An export the framework could not use, or a file that could not run. */
export interface FailedFile {
  file: string;
  /** The export that failed, when the file itself ran. */
  export?: string;
  error: unknown;
}

/** The declarations of one kind found in the files. */
export interface LoadResult<T> {
  loaded: LoadedItem<T>[];
  failed: FailedFile[];
}

/** What `file` is called in a message: `src/a.ts`, or `src/a.ts (ban)`. */
export const siteName = (site: { file: string; export?: string }): string =>
  site.export === undefined || site.export === 'default'
    ? site.file
    : `${site.file} (${site.export})`;

const SOURCE = /\.(?:ts|mts|js|mjs)$/;
const DECLARATION = /\.d\.m?ts$/;
/** Tests next to the code: they are for a test runner, not for the bot. */
const TEST = /\.(?:test|spec)\.[^.]+$/;

/** The source files of a folder and its subfolders, in a stable order. */
async function scan(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await scan(path)));
    else if (
      SOURCE.test(entry.name) &&
      !DECLARATION.test(entry.name) &&
      !TEST.test(entry.name)
    ) {
      files.push(path);
    }
  }
  return files;
}

/** A file of the project, found but not run. */
export interface FoundFile {
  /** The path from the project folder, with `/`: `src/ping.ts`. */
  file: string;
  /** Where it is on disk. */
  path: string;
}

/** Every source file of `src/`, in a stable order. */
export async function listSources(projectDir: string): Promise<FoundFile[]> {
  const paths = await scan(join(projectDir, 'src'));
  return paths
    .map(path => ({
      file: relative(projectDir, path).split(sep).join('/'),
      path,
    }))
    .sort((a, b) => (a.file < b.file ? -1 : 1));
}

/** A file of the project, run: what it exports. */
export interface LoadedModule {
  /** The path from the project folder: `src/ping.ts`. */
  file: string;
  exports: Record<string, unknown>;
}

/** The files of the project, run (`modules`) or not (`failed`). */
export interface LoadedSources {
  modules: LoadedModule[];
  failed: FailedFile[];
}

/** Runs every file of `src/`. A file that fails to run never throws. */
export async function loadSources(projectDir: string): Promise<LoadedSources> {
  const found = await listSources(projectDir);
  const result: LoadedSources = { modules: [], failed: [] };
  await Promise.all(
    found.map(async ({ file, path }) => {
      try {
        result.modules.push({ file, exports: await importFile(path) });
      } catch (error) {
        result.failed.push({ file, error });
      }
    })
  );
  const byFile = (a: { file: string }, b: { file: string }) =>
    a.file < b.file ? -1 : 1;
  result.modules.sort(byFile);
  result.failed.sort(byFile);
  return result;
}

/** The name of a file, without its folders and its extension. */
const baseName = (file: string): string =>
  file
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '');

/**
 * Reads the declarations of one kind from what the files export. Every
 * export is looked at; the ones the kind recognises are read, the others
 * are someone else's (another kind, or plain code). The same value
 * exported twice (re-exported by another file) is one declaration, at the
 * first place it is found. An export that can't be read is returned in
 * `failed`, with its name, and never throws.
 */
export function readDeclarations<T>(
  modules: readonly LoadedModule[],
  declaration: Declaration<T>
): LoadResult<T> {
  const result: LoadResult<T> = { loaded: [], failed: [] };
  const seen = new Set<unknown>();
  const sites = [...modules]
    .sort((a, b) => (a.file < b.file ? -1 : 1))
    .flatMap(({ file, exports }) =>
      Object.keys(exports)
        .sort()
        .map(name => ({ file, export: name, value: exports[name] }))
    );
  for (const { file, export: exported, value } of sites) {
    const site: ExportSite = {
      file,
      export: exported,
      name: exported === 'default' ? baseName(file) : exported,
    };
    const read = (one: unknown): void => {
      if (seen.has(one)) return;
      seen.add(one);
      result.loaded.push({ ...site, value: declaration.read(one, site) });
    };
    try {
      if (declaration.is(value)) read(value);
      else if (Array.isArray(value) && value.some(declaration.is)) {
        if (!declaration.list) {
          throw new TypeError(
            `This export is a list with a ${declaration.one} in it: export each ${declaration.one} on its own (export const ${site.name} = ...), its name is the name of its export.`
          );
        }
        for (const one of value) if (declaration.is(one)) read(one);
      }
    } catch (error) {
      result.failed.push({ file, export: exported, error });
    }
  }
  return result;
}

/** A file of the project as a build kept it: already run. */
export type BuiltFile = LoadedModule;
