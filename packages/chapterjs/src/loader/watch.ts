import { watch, type FSWatcher } from 'node:fs';

/**
 * Calls `onChange` when files under `dir` are saved, once per burst: an
 * editor often writes a file in several steps, and saving several files at
 * once is one change.
 */
export function watchFolder(
  dir: string,
  onChange: () => void,
  delay = 60
): { close(): void } {
  let timer: NodeJS.Timeout | null = null;
  const watcher: FSWatcher = watch(dir, { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, delay);
  });
  // The folder being deleted is not a reason to crash the bot.
  watcher.on('error', () => {});
  return {
    close() {
      if (timer) clearTimeout(timer);
      watcher.close();
    },
  };
}
