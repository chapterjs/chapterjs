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
 * Calls `onChange` when files under `dir` are saved, once per burst: an
 * editor often writes a file in several steps, and saving several files at
 * once is one change.
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
  const changed = (): void => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, delay);
  };
  const watcher: FSWatcher = watch(dir, { recursive: true }, changed);
  // The folder being deleted is not a reason to crash the bot.
  watcher.on('error', () => {});

  // The system takes a moment to really start watching: a file saved
  // between the load and that moment would be missed. The folder is
  // compared, a little later, with what it was when it was loaded.
  const before = loaded;
  const catchUps = [300, 1500].map(wait =>
    setTimeout(() => {
      void Promise.all([before, snapshotFolder(dir)]).then(([then, now]) => {
        if (then !== now && lastSeen !== now) {
          lastSeen = now;
          changed();
        }
      });
    }, wait)
  );
  let lastSeen: string | null = null;

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const catchUp of catchUps) clearTimeout(catchUp);
      watcher.close();
    },
  };
}
