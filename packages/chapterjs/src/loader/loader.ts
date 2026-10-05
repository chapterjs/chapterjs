// Loads the files users drop in the conventional folders of their project.
// One mechanism for every folder: a feature only says which folder it owns
// and how to read what a file exports.

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { importFile } from './hot.js';

/** A folder of the project whose files the framework loads. */
export interface Convention<T> {
  /** The folder, inside `src/`. */
  folder: string;
  /** What one file is called in messages: "event", "command"... */
  one: string;
  many: string;
  /**
   * Checks where a file is, before it is run. `path` is its path inside
   * the folder, with `/`. Throws an error whose message says where the file
   * should be.
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
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await scan(path)));
    else if (SOURCE.test(entry.name) && !DECLARATION.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/** Loads every file of a conventional folder. A broken file never throws. */
export async function loadFolder<T>(
  projectDir: string,
  convention: Convention<T>
): Promise<LoadResult<T>> {
  const folder = join(projectDir, 'src', convention.folder);
  const paths = await scan(folder);
  const result: LoadResult<T> = { loaded: [], failed: [], files: [] };
  await Promise.all(
    paths.map(async path => {
      const file = relative(projectDir, path).split(sep).join('/');
      result.files.push(file);
      try {
        const inside = relative(folder, path).split(sep).join('/');
        // A misplaced file is not run at all.
        convention.check?.(inside);
        const value = convention.read(await importFile(path), inside);
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
