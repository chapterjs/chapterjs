// Watching src/ and public/: one reload per change, none for no change.
import { tempDir } from '@chapterjs/test-utils';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { snapshotFolder, watchFolder } from '../src/loader/watch.js';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Watches `dir` and counts the changes told. */
async function counting(dir: string) {
  let count = 0;
  const watcher = watchFolder(dir, () => count++, {
    loaded: snapshotFolder(dir),
  });
  // Past the catch-ups that follow the start.
  await wait(1700);
  return {
    get count() {
      return count;
    },
    close: () => watcher.close(),
  };
}

describe('watching a folder', () => {
  it('tells a save once, even written then renamed over the file', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
    const watch = await counting(dir);
    try {
      expect(watch.count).toBe(0);
      // How vim and JetBrains save: a new file, renamed over the old one.
      writeFileSync(join(dir, 'a.ts.tmp'), 'export const a = 2;\n');
      renameSync(join(dir, 'a.ts.tmp'), join(dir, 'a.ts'));
      await wait(800);
      expect(watch.count).toBe(1);
      writeFileSync(join(dir, 'a.ts'), 'export const a = 33;\n');
      await wait(800);
      expect(watch.count).toBe(2);
    } finally {
      watch.close();
    }
  });

  it('follows a folder created after the start, and its saves', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.ts'), 'x');
    const watch = await counting(dir);
    try {
      mkdirSync(join(dir, 'commands', 'mod'), { recursive: true });
      writeFileSync(join(dir, 'commands', 'mod', 'ban.ts'), 'export {};\n');
      await wait(800);
      expect(watch.count).toBe(1);
      const ban = join(dir, 'commands', 'mod', 'ban.ts');
      writeFileSync(`${ban}.tmp`, 'export const ban = 1;\n');
      renameSync(`${ban}.tmp`, ban);
      await wait(800);
      expect(watch.count).toBe(2);
      writeFileSync(ban, 'export const ban = 22;\n');
      await wait(800);
      expect(watch.count).toBe(3);
    } finally {
      watch.close();
    }
  });

  it('tells nothing for a save that changed nothing on disk', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.ts'), 'x');
    const watch = await counting(dir);
    try {
      // The system tells a change of mode: the files are the same.
      chmodSync(join(dir, 'a.ts'), 0o600);
      await wait(800);
      expect(watch.count).toBe(0);
      writeFileSync(join(dir, 'b.ts'), 'y');
      await wait(800);
      expect(watch.count).toBe(1);
    } finally {
      watch.close();
    }
  });
});
