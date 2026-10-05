import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPath } from './hot.js';

/**
 * Where in the project an error comes from: the first place of its stack
 * that is a file of the project (not a package, not Node itself).
 */
export function locate(
  error: unknown,
  projectDir: string
): { file: string; line: number } | null {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return null;
  const stack = cleanPath(error.stack);
  // `file:///project/src/a.ts:3:7` in a stack frame, or `/project/src/a.ts:3`
  // on the first line of a syntax error.
  const pattern = /(file:\/\/[^\s():]+|(?:\/|[A-Za-z]:\\)[^\s():]+):(\d+)/g;
  for (const match of stack.matchAll(pattern)) {
    let path = match[1]!;
    try {
      if (path.startsWith('file://')) path = fileURLToPath(path);
    } catch {
      continue;
    }
    const inside = relative(projectDir, path);
    if (inside.startsWith('..') || inside.split(sep).includes('node_modules')) {
      continue;
    }
    return { file: inside.split(sep).join('/'), line: Number(match[2]) };
  }
  return null;
}

/** The message of an error, on one line, without hot reload noise. */
export function messageOf(error: unknown): string {
  const text =
    error instanceof Error ? error.message : `Thrown value: ${String(error)}`;
  return cleanPath(text).trim();
}
