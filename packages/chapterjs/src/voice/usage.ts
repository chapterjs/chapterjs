// Whether a project joins voice channels, from its code. Discord only tells
// a bot its own voice state with the GUILD_VOICE_STATES intent, without
// which `join()` can't finish: like every intent, it is asked for when the
// project needs it, and only then.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A call to `join()` without an argument or with options: what joining a
 * voice channel looks like. The `join(', ')` of a list does not match; a
 * `join()` of a list does, and only costs an intent.
 */
const JOINS_VOICE = /\.join\(\s*(?:\)|\{)/;

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** Whether some code joins a voice channel. */
export function joinsVoice(code: string): boolean {
  return JOINS_VOICE.test(code);
}

/** Whether a file of `src/` joins a voice channel. */
export async function sourcesJoinVoice(cwd: string): Promise<boolean> {
  const src = join(cwd, 'src');
  const entries = await readdir(src, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE.test(entry.name)) continue;
    const code = await readFile(join(entry.parentPath, entry.name), 'utf8');
    if (joinsVoice(code)) return true;
  }
  return false;
}
