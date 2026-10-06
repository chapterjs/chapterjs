// Loads the files users drop in the conventional folders of their project.
// One mechanism for every folder: a feature only says which folder it owns
// and how to read what a file exports.

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { importFile } from './hot.js';

/**
 * A folder of the project whose files the framework loads, or one file at
 * the root of `src/`.
 */
export interface Convention<T> {
  /**
   * The folder, inside `src/`. With `single`, the name of the one file
   * instead: `'presence'` is `src/presence.ts`.
   */
  folder: string;
  /**
   * The convention is one file, `src/<folder>.ts`, not a folder. `check`
   * and `read` receive its name with its extension (`presence.ts`).
   */
  single?: boolean;
  /** What one file is called in messages: "event", "command"... */
  one: string;
  many: string;
  /**
   * Checks where a file is, before it is run. `path` is its path inside
   * the folder, with `/`, without the `(group)` folders (see below). Throws
   * an error whose message says where the file should be.
   */
  check?(path: string): void;
  /**
   * Checks what a file exports and returns what the feature needs from it.
   * Throws an error whose message says what the file should export.
   */
  read(exports: Record<string, unknown>, path: string): T;
}

export interface LoadedFile<T> {
  /** The path from the project folder, with `/`: `src/events/ping.ts`. */
  file: string;
  value: T;
}

export interface FailedFile {
  file: string;
  error: unknown;
}

export interface LoadResult<T> {
  loaded: LoadedFile<T>[];
  failed: FailedFile[];
  /** Every file found, loaded or not. */
  files: string[];
}

const SOURCE = /\.(?:ts|mts|js|mjs)$/;
const DECLARATION = /\.d\.m?ts$/;

/**
 * How users organise a conventional folder without changing what it means,
 * the same in every feature:
 * - a file or a folder whose name starts with `_` is private: never
 *   loaded by the framework, free to hold shared code;
 * - a folder whose name is in parentheses, like `(moderation)`, only groups
 *   files: it is not part of what the path says, at any depth.
 */
const PRIVATE = /^_/;
const GROUP = /^\(.*\)$/;

/** The path of a file as the feature reads it: without `(group)` folders. */
export function logicalPath(inside: string): string {
  const parts = inside.split('/');
  return parts
    .filter((part, index) => index === parts.length - 1 || !GROUP.test(part))
    .join('/');
}

/** The source files of a folder and its subfolders, in a stable order. */
async function scan(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    // A folder the project does not have is a feature it does not use.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (PRIVATE.test(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await scan(path)));
    else if (SOURCE.test(entry.name) && !DECLARATION.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/** A file of a conventional folder, found but not run. */
export interface FoundFile {
  /** The path from the project folder, with `/`: `src/events/ping.ts`. */
  file: string;
  /** Where it is on disk. */
  path: string;
}

/** Whether a path of the project is the file of a single-file convention. */
function isSingle(file: string, folder: string): boolean {
  return (
    file.startsWith(`src/${folder}.`) &&
    SOURCE.test(file) &&
    !DECLARATION.test(file) &&
    !file.slice(`src/${folder}.`.length).includes('/')
  );
}

/** The one file of a single-file convention, with any source extension. */
async function scanSingle(dir: string, name: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter(
      entry =>
        entry.isFile() &&
        entry.name.startsWith(`${name}.`) &&
        SOURCE.test(entry.name) &&
        !DECLARATION.test(entry.name)
    )
    .map(entry => join(dir, entry.name));
}

/**
 * The files of a conventional folder, in a stable order (or the one file
 * of a single-file convention, under every source extension it has).
 */
export async function listFolder(
  projectDir: string,
  convention: Pick<Convention<unknown>, 'folder' | 'single'>
): Promise<FoundFile[]> {
  const paths = convention.single
    ? await scanSingle(join(projectDir, 'src'), convention.folder)
    : await scan(join(projectDir, 'src', convention.folder));
  return paths
    .map(path => ({
      file: relative(projectDir, path).split(sep).join('/'),
      path,
    }))
    .sort((a, b) => (a.file < b.file ? -1 : 1));
}

/**
 * Hands what files export to the convention of their folder. `exportsOf`
 * gives what a file exports (by running it, or from a build that already
 * did); a file that fails, there or in the convention, never throws.
 */
async function readFiles<T>(
  convention: Convention<T>,
  files: readonly string[],
  exportsOf: (file: string) => Promise<Record<string, unknown>>
): Promise<LoadResult<T>> {
  const prefix = convention.single ? 'src/' : `src/${convention.folder}/`;
  const result: LoadResult<T> = { loaded: [], failed: [], files: [...files] };
  await Promise.all(
    files.map(async file => {
      try {
        const inside = logicalPath(file.slice(prefix.length));
        // A misplaced file is not run at all.
        convention.check?.(inside);
        const value = convention.read(await exportsOf(file), inside);
        result.loaded.push({ file, value });
      } catch (error) {
        result.failed.push({ file, error });
      }
    })
  );
  const byFile = (a: { file: string }, b: { file: string }) =>
    a.file < b.file ? -1 : 1;
  result.loaded.sort(byFile);
  result.failed.sort(byFile);
  result.files.sort();
  return result;
}

/** Loads every file of a conventional folder. A broken file never throws. */
export async function loadFolder<T>(
  projectDir: string,
  convention: Convention<T>
): Promise<LoadResult<T>> {
  const found = await listFolder(projectDir, convention);
  const paths = new Map(found.map(({ file, path }) => [file, path]));
  return readFiles(
    convention,
    found.map(({ file }) => file),
    file => importFile(paths.get(file)!)
  );
}

/** A file of the project as a build kept it: already run. */
export interface BuiltFile {
  /** The path it had in the project: `src/events/ping.ts`. */
  file: string;
  exports: Record<string, unknown>;
}

/**
 * Reads the files of a conventional folder from a build, which ran them
 * all at once: nothing is scanned and nothing is imported.
 */
export function loadBuilt<T>(
  convention: Convention<T>,
  built: readonly BuiltFile[]
): Promise<LoadResult<T>> {
  const prefix = `src/${convention.folder}/`;
  const mine = new Map(
    built
      .filter(({ file }) =>
        convention.single
          ? isSingle(file, convention.folder)
          : file.startsWith(prefix)
      )
      .map(({ file, exports }) => [file, exports])
  );
  return readFiles(convention, [...mine.keys()], file =>
    Promise.resolve(mine.get(file)!)
  );
}
