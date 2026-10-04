import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished } from 'vitest';

/**
 * A new empty folder, deleted when the current test ends (passed or failed).
 * The path is resolved (`/tmp` is a symlink on macOS) so it can be compared
 * with paths printed by the code under test.
 */
export function tempDir(prefix = 'chapterjs-test-'): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
