// What a project does that only its code shows: no declaration says that
// it joins voice or waits for a message, yet Discord only sends what that
// needs with an intent. Each feature describes such a use (`CodeUse`) and
// the files of `src/` are read for it, so the intent is asked for when the
// project needs it, and only then, like the intents of its events.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** A use of the framework seen in the code, and the intents it needs. */
export interface CodeUse {
  /** What the use is called in `build.json`: `'voice'`, `'messages'`... */
  readonly name: string;
  /** What the code looks like when it does it. */
  readonly pattern: RegExp;
  /** The intents Discord must be asked for (`GatewayIntent` bits). */
  readonly intents: number;
}

/** The uses found: for each name, the files that do it (`src/quiz.ts`). */
export type FoundUses = Readonly<Record<string, readonly string[]>>;

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/** Test files are never loaded by the bot. */
const TEST = /\.(?:test|spec)\.[^.]+$/;

/** Reads the files of `src/` for each use. */
export async function scanUses(
  cwd: string,
  uses: readonly CodeUse[]
): Promise<FoundUses> {
  const found: Record<string, string[]> = {};
  const src = join(cwd, 'src');
  const entries = await readdir(src, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE.test(entry.name) || TEST.test(entry.name)) {
      continue;
    }
    if (entry.name.endsWith('.d.ts')) continue;
    const path = join(entry.parentPath, entry.name);
    const code = await readFile(path, 'utf8').catch(() => '');
    for (const use of uses) {
      if (use.pattern.test(code)) {
        (found[use.name] ??= []).push(
          relative(cwd, path).split('\\').join('/')
        );
      }
    }
  }
  for (const files of Object.values(found)) files.sort();
  return found;
}

/** The intents the uses found need. */
export function usesIntents(
  uses: readonly CodeUse[],
  found: FoundUses
): number {
  return uses.reduce(
    (intents, use) =>
      (found[use.name]?.length ?? 0) > 0 ? intents | use.intents : intents,
    0
  );
}
