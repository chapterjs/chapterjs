import { watch, type FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * What every file under a folder looks like right now: taken before the
 * files are loaded, it lets `watchFolder` notice what was saved since.
 */
export async function snapshotFolder(dir: string): Promise<string> {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  const files = await Promise.all(
    entries
      .filter(entry => entry.isFile())
      .map(async entry => {
        const path = join(entry.parentPath, entry.name);
        const info = await stat(path).catch(() => null);
        return `${path}:${info?.mtimeMs ?? 0}:${info?.size ?? 0}`;
      })
  );
  return files.sort().join('\n');
}

/**
 * Calls `onChange` when files under `dir` are saved, once per change: an
 * editor often writes a file in several steps, saving several files at once
 * is one change, and the system may tell a save twice, a moment apart (macOS
 * does for a file written then renamed over the old one). What is compared
 * is the folder itself, so a save that changed nothing reloads nothing.
 */
export function watchFolder(
  dir: string,
  onChange: () => void,
  {
    delay = 60,
    loaded = snapshotFolder(dir),
  }: {
    delay?: number;
    /** The folder as it was when its files were loaded. */
    loaded?: Promise<string>;
  } = {}
): { close(): void } {
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  /** The folder as the last load saw it. */
  let lastSeen: Promise<string> = loaded;
  /** One comparison at a time, in the order the bursts ended. */
  let comparing: Promise<void> = Promise.resolve();
  const compare = (): void => {
    comparing = comparing.then(async () => {
      if (closed) return;
      await watcher.refresh();
      const [then, now] = await Promise.all([lastSeen, snapshotFolder(dir)]);
      if (closed || then === now) return;
      lastSeen = Promise.resolve(now);
      onChange();
    });
  };
  const changed = (): void => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      compare();
    }, delay);
  };
  const watcher = watchTree(dir, changed);

  // The system takes a moment to really start watching: a file saved
  // between the load and that moment would be missed. The folder is
  // compared, a little later, with what it was when it was loaded.
  const catchUps = [300, 1500].map(wait => setTimeout(compare, wait));

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const catchUp of catchUps) clearTimeout(catchUp);
      watcher.close();
    },
  };
}

/**
 * Calls `listener` when anything under `dir` changes. macOS and Windows watch
 * a tree themselves. Elsewhere Node watches every file on its own, and a file
 * written then renamed over the old one (how vim and JetBrains save) is a new
 * file it never watches again: its next saves would be missed. So each folder
 * is watched instead, which hears every file in it whatever replaced it, and
 * `refresh()` follows the folders created or deleted since.
 */
function watchTree(
  dir: string,
  listener: () => void
): { refresh(): Promise<void>; close(): void } {
  const open = (path: string, recursive: boolean): FSWatcher => {
    const watcher = watch(path, { recursive }, listener);
    // A folder being deleted is not a reason to crash the bot.
    watcher.on('error', () => {});
    return watcher;
  };
  if (process.platform === 'darwin' || process.platform === 'win32') {
    const watcher = open(dir, true);
    return { refresh: async () => {}, close: () => watcher.close() };
  }
  const watchers = new Map<string, FSWatcher>();
  let closed = false;
  const refresh = async (): Promise<void> => {
    const entries = await readdir(dir, {
      recursive: true,
      withFileTypes: true,
    }).catch(() => []);
    if (closed) return;
    const folders = new Set([
      dir,
      ...entries
        .filter(entry => entry.isDirectory())
        .map(entry => join(entry.parentPath, entry.name)),
    ]);
    for (const [path, watcher] of watchers) {
      if (folders.has(path)) continue;
      watcher.close();
      watchers.delete(path);
    }
    for (const path of folders) {
      if (watchers.has(path)) continue;
      try {
        watchers.set(path, open(path, false));
      } catch {
        // Deleted since it was listed: the next refresh forgets it.
      }
    }
  };
  // The folder itself at once, so nothing is missed while the rest is read.
  watchers.set(dir, open(dir, false));
  void refresh();
  return {
    refresh,
    close() {
      closed = true;
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}
