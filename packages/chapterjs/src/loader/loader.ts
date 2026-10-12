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

/** What tells one export of the project from another: `src/a.ts#ban`. */
export const siteKey = (site: { file: string; export: string }): string =>
  `${site.file}#${site.export}`;

/**
 * The order in which declarations that can't both be kept (two with one
 * name) are read, the first one winning: what already ran first (`running`,
 * the `siteKey`s of the declarations of the last load), so that a file saved
 * in dev never takes its name from one that works, then by file and export,
 * so that the choice never depends on the order the files were found in.
 */
export function bySite<T extends { file: string; export: string }>(
  entries: readonly T[],
  running: ReadonlySet<string> = new Set()
): T[] {
  const before = (entry: T): number => (running.has(siteKey(entry)) ? 0 : 1);
  return [...entries].sort(
    (a, b) =>
      before(a) - before(b) ||
      (a.file === b.file
        ? a.export < b.export
          ? -1
          : a.export > b.export
            ? 1
            : 0
        : a.file < b.file
          ? -1
          : 1)
  );
}

const SOURCE = /\.(?:ts|mts|js|mjs)$/;
const DECLARATION = /\.d\.m?ts$/;
/** Tests next to the code: they are for a test runner, not for the bot. */
const TEST = /\.(?:test|spec)\.[^.]+$/;

/** The source files of a folder and its subfolders, in a stable order. */
async function scan(dir: string, tests = false): Promise<string[]> {
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
    if (entry.isDirectory()) files.push(...(await scan(path, tests)));
    else if (
      SOURCE.test(entry.name) &&
      !DECLARATION.test(entry.name) &&
      TEST.test(entry.name) === tests
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
  return found(projectDir, await scan(join(projectDir, 'src')));
}

/**
 * Every test file of `src/` (`*.test.ts`, `*.spec.ts`), in a stable order:
 * what `chapterjs test` runs, and what the bot never loads.
 */
export async function listTests(projectDir: string): Promise<FoundFile[]> {
  return found(projectDir, await scan(join(projectDir, 'src'), true));
}

const found = (projectDir: string, paths: string[]): FoundFile[] =>
  paths
    .map(path => ({
      file: relative(projectDir, path).split(sep).join('/'),
      path,
    }))
    .sort((a, b) => (a.file < b.file ? -1 : 1));

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
  return loadFiles(await listSources(projectDir));
}

/** Runs the files given. A file that fails to run never throws. */
export async function loadFiles(
  files: readonly FoundFile[]
): Promise<LoadedSources> {
  const result: LoadedSources = { modules: [], failed: [] };
  await Promise.all(
    files.map(async ({ file, path }) => {
      try {
        result.modules.push({ file, exports: await importFile(path) });
      } catch (error) {
        result.failed.push({ file, error: readable(error) });
      }
    })
  );
  const byFile = (a: { file: string }, b: { file: string }) =>
    a.file < b.file ? -1 : 1;
  result.modules.sort(byFile);
  result.failed.sort(byFile);
  return result;
}

/**
 * A file Node can't read as TypeScript gets the words of its parser
 * ("Expected ',', got ';'"): what they mean is said after them. The error
 * is the same, so its line is still found.
 */
function readable(error: unknown): unknown {
  if (
    error instanceof SyntaxError &&
    (error as { code?: unknown }).code === 'ERR_INVALID_TYPESCRIPT_SYNTAX' &&
    !error.message.includes('This line can not be read')
  ) {
    error.message = `${error.message.replace(/\.?$/, '.')} This line can not be read: look for a bracket, a comma or a quote missing or in excess, here or just before.`;
  }
  return error;
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
    const read = (one: unknown, at: ExportSite): void => {
      if (seen.has(one)) return;
      seen.add(one);
      result.loaded.push({ ...at, value: declaration.read(one, at) });
    };
    try {
      if (declaration.is(value)) read(value, site);
      else if (Array.isArray(value) && value.some(declaration.is)) {
        if (!declaration.list) {
          throw new TypeError(
            `This export is a list with a ${declaration.one} in it: export each ${declaration.one} on its own (export const ${site.name} = ...), its name is the name of its export.`
          );
        }
        // Each one of the list is told apart by its place in it (`events[2]`),
        // and read on its own: one that is wrong leaves the others running.
        value.forEach((one, index) => {
          if (!declaration.is(one)) return;
          const at = { ...site, export: `${exported}[${index}]` };
          try {
            read(one, at);
          } catch (error) {
            result.failed.push({ file, export: at.export, error });
          }
        });
      }
    } catch (error) {
      result.failed.push({ file, export: exported, error });
    }
  }
  return result;
}

/** A file of the project as a build kept it: already run. */
export type BuiltFile = LoadedModule;
