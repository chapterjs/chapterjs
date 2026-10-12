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
  const watcher: FSWatcher = watch(dir, { recursive: true }, changed);
  // The folder being deleted is not a reason to crash the bot.
  watcher.on('error', () => {});

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
