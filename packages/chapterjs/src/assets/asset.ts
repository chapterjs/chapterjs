// `asset()`, as user files import it from 'chapterjs': a file of the
// `public/` folder of the project, to send with a message. Its type is
// written per project (see `public.ts`), so the editor lists the files.

import { readFile } from 'node:fs/promises';
import { basename, join, normalize, sep } from 'node:path';
import { PUBLIC_FOLDER } from './public.js';

/** What can change about a file of `public/` when it is sent. */
export interface AssetOptions {
  /** The name the file is sent under; by default its own name. */
  name?: string;
  /** What the file shows, for people who can't see it. */
  description?: string;
  /** Hides the file until it is clicked. */
  spoiler?: boolean;
  /** The media type of the file (`image/png`); guessed from the name when missing. */
  contentType?: string;
}

declare const brand: unique symbol;

/**
 * A file of the `public/` folder of the project, made by `asset()`, to put
 * in the `files` of a message. It is read when the message is sent.
 */
export interface AssetFile {
  readonly [brand]: 'asset';
  /** The name the file is sent under, with its extension. */
  readonly name: string;
  /** The path of the file inside `public/`. */
  readonly path: string;
  /** What the file shows, for people who can't see it. */
  readonly description?: string;
  /** Hides the file until it is clicked. */
  readonly spoiler?: boolean;
  /** The media type of the file; guessed from the name when missing. */
  readonly contentType?: string;
}

const ASSET = Symbol.for('chapterjs.asset');

/** Where `public/` is: told by the CLI, which knows the project. */
let publicDir: string | null = null;

/** Tells `asset()` where the project is. Only the CLI calls it. */
export function setPublicDir(projectDir: string): void {
  publicDir = join(projectDir, PUBLIC_FOLDER);
}

/** Whether a value was made by `asset()`. */
export function isAssetFile(value: unknown): value is AssetFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[ASSET] === true
  );
}

/**
 * A file of the `public/` folder of the project, to send with a message:
 * `files: [asset('photos/monday.png')]`. The file is read when the message
 * is sent, so a missing file is an error there.
 */
export function asset(path: string, options: AssetOptions = {}): AssetFile {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new TypeError(
      `asset() takes the path of a file inside ${PUBLIC_FOLDER}/, like asset('photos/monday.png').`
    );
  }
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.split('/').some(part => part === '..' || part === '')) {
    throw new TypeError(
      `asset() only reads inside ${PUBLIC_FOLDER}/: ${JSON.stringify(path)} leaves it.`
    );
  }
  if (typeof options !== 'object' || options === null) {
    throw new TypeError(
      `The options of asset() are an object like { description: '...' }.`
    );
  }
  for (const key of Object.keys(options)) {
    if (!['name', 'description', 'spoiler', 'contentType'].includes(key)) {
      throw new TypeError(
        `"${key}" is not an option of asset(). Options are: name, description, spoiler, contentType.`
      );
    }
  }
  const name = options.name ?? basename(clean);
  if (typeof name !== 'string' || name.trim() === '' || name.includes('/')) {
    throw new TypeError(
      `The name of an asset is a file name with its extension, like "chart.png", got ${JSON.stringify(options.name)}.`
    );
  }
  const file = {
    name,
    path: clean,
    ...(options.description !== undefined
      ? { description: options.description }
      : {}),
    ...(options.spoiler ? { spoiler: true } : {}),
    ...(options.contentType !== undefined
      ? { contentType: options.contentType }
      : {}),
  };
  // The brand is not shown by console.log, nor copied by a spread.
  Object.defineProperty(file, ASSET, { value: true });
  return Object.freeze(file) as unknown as AssetFile;
}

/** Where the file of an asset is on disk, checked to be inside `public/`. */
export function assetPath(file: AssetFile): string {
  if (!publicDir) {
    throw new Error(
      `asset('${file.path}') can only be sent by a bot run with chapterjs dev or chapterjs start.`
    );
  }
  const target = join(publicDir, normalize(file.path));
  if (!target.startsWith(publicDir + sep)) {
    throw new Error(
      `asset() only reads inside ${PUBLIC_FOLDER}/: ${JSON.stringify(file.path)} leaves it.`
    );
  }
  return target;
}

/** The error to give for an asset whose file could not be opened. */
export function missingAsset(file: AssetFile, error: unknown): unknown {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
    ? new Error(
        `There is no file ${PUBLIC_FOLDER}/${file.path} in your project: put it there, or pick one of the files the editor lists in asset().`
      )
    : error;
}

/** Reads the file of an asset, when the message is sent. */
export async function readAsset(file: AssetFile): Promise<Uint8Array> {
  const target = assetPath(file);
  try {
    return await readFile(target);
  } catch (error) {
    throw missingAsset(file, error);
  }
}
