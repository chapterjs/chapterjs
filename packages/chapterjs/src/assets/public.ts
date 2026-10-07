// The `public/` folder of a project: the files a bot sends (pictures,
// documents...). Its content is listed to type `asset()`, so that the
// editor offers every file and underlines one that does not exist.

import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { watchFolder } from '../loader/watch.js';

/** The folder, at the root of the project. */
export const PUBLIC_FOLDER = 'public';

/**
 * Every file of `public/`, as a path from it with `/`, sorted. Hidden files
 * (starting with `.`) are left out. An absent folder is an empty list.
 */
export async function listPublic(projectDir: string): Promise<string[]> {
  const root = join(projectDir, PUBLIC_FOLDER);
  const entries = await readdir(root, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter(entry => entry.isFile())
    .map(entry =>
      relative(root, join(entry.parentPath, entry.name)).split(sep).join('/')
    )
    .filter(path => !path.split('/').some(part => part.startsWith('.')))
    .sort();
}

/**
 * What `'chapterjs'` declares in every file of the project about `public/`:
 * the union of its files, and `asset()` typed with it.
 */
export function publicDeclarations(paths: readonly string[]): string {
  const union =
    paths.length === 0
      ? 'never'
      : paths.map(path => `\n  | ${JSON.stringify(path)}`).join('');
  return `import type { AssetFile, AssetOptions } from '#chapterjs';

declare module 'chapterjs' {
  /**
   * A file of the public/ folder of your project, as a path from it:
   * \`'photos/monday.png'\`.${paths.length === 0 ? ' The folder is empty or missing: put files in it, and they are listed here.' : ''}
   */
  export type PublicFile = ${union.replaceAll('\n', '\n  ')};

  /**
   * A file of the public/ folder of your project, to send with a message:
   * \`files: [asset('photos/monday.png')]\`. The editor lists the files of the
   * folder; the file is read when the message is sent.
   */
  export function asset(path: PublicFile, options?: AssetOptions): AssetFile;
}
`;
}

/**
 * Calls `onChange` when a file of `public/` is added, removed or saved.
 * The folder may not exist yet: it is watched for as soon as it appears.
 */
export function watchPublic(
  projectDir: string,
  onChange: () => void
): { close(): void } {
  const root = join(projectDir, PUBLIC_FOLDER);
  let inner: { close(): void } | null = null;
  let outer: ReturnType<typeof watch> | null = null;
  const watchInside = (): void => {
    try {
      inner = watchFolder(root, onChange);
    } catch {
      inner = null;
    }
  };
  // Until the folder exists, only its parent is watched, for its creation.
  const watchForCreation = (): void => {
    try {
      outer = watch(projectDir, (_event, name) => {
        if (name !== PUBLIC_FOLDER || inner) return;
        watchInside();
        if (inner) onChange();
      });
      outer.unref();
    } catch {
      outer = null;
    }
  };
  watchInside();
  if (!inner) watchForCreation();
  return {
    close() {
      inner?.close();
      outer?.close();
    },
  };
}
