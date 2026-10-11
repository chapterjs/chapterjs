// How Node loads the files of a project.
//
// Imports without extension: `import { greet } from '../lib/greet'` finds
// `greet.ts` (or `greet/index.ts`), as people expect. Node alone asks for
// the extension; writing it still works.
//
// Hot reload: Node keeps every imported module forever, by URL. Each reload
// gets a new "generation" number, added to the URL of every file of the
// project (and only of the project: packages keep their single copy). A
// file and everything it imports from the project are then loaded again.

import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const PARAM = 'chapter';
let generation = 0;
let root: string | null = null;
let hot = false;
/** What an import without extension may be, in the order it is tried. */
const CANDIDATES = [
  '.ts',
  '.mts',
  '.js',
  '.mjs',
  '/index.ts',
  '/index.mts',
  '/index.js',
  '/index.mjs',
];
const EXTENSION = /\.(?:m?ts|m?js)$/;

/**
 * Takes over how the files under `dir` are loaded. Called once, before
 * loading. With `reload`, `nextGeneration()` makes them load again.
 */
export function enableProjectLoader(
  dir: string,
  { reload }: { reload: boolean }
): void {
  if (root !== null) throw new Error('The project loader is already enabled.');
  root = pathToFileURL(dir).href.replace(/\/?$/, '/');
  hot = reload;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const fromProject =
        root !== null &&
        context.parentURL?.startsWith(root) === true &&
        specifier.startsWith('.');
      let result;
      try {
        result = nextResolve(specifier, context);
      } catch (error) {
        // Not found, or a folder (Node refuses those as they are).
        const code = (error as NodeJS.ErrnoException).code;
        if (
          !fromProject ||
          (code !== 'ERR_MODULE_NOT_FOUND' &&
            code !== 'ERR_UNSUPPORTED_DIR_IMPORT')
        ) {
          throw error;
        }
        if (EXTENSION.test(specifier)) throw missing(specifier, false);
        // No extension: look for the file people mean.
        for (const candidate of CANDIDATES) {
          try {
            result = nextResolve(
              specifier.replace(/\/$/, '') + candidate,
              context
            );
            break;
          } catch {
            // Try the next one.
          }
        }
        if (!result) throw missing(specifier, true);
      }
      if (hot && root !== null && result.url.startsWith(root)) {
        return {
          ...result,
          url: `${result.url.split('?')[0]}?${PARAM}=${generation}`,
        };
      }
      return result;
    },
  });
}

/**
 * The error for an import of the project that names no file: said in the
 * words of the import, not with the absolute paths Node gives.
 */
function missing(specifier: string, tried: boolean): Error {
  const name = specifier.replace(/\/$/, '').split('/').pop() ?? specifier;
  const looked = tried
    ? ` No ${name}.ts, ${name}.js or ${name}/index.ts is there.`
    : '';
  const error = new Error(
    `'${specifier}' does not exist.${looked} Check the path and the name of the file.`
  );
  (error as NodeJS.ErrnoException).code = 'ERR_MODULE_NOT_FOUND';
  return error;
}

/** Makes the next imports load the files again. */
export function nextGeneration(): void {
  generation++;
}

/** Imports a file of the project, in its current version. */
export function importFile(path: string): Promise<Record<string, unknown>> {
  const url = pathToFileURL(path).href;
  return import(hot ? `${url}?${PARAM}=${generation}` : url);
}

/** Removes what hot reload adds to the paths shown in errors. */
export function cleanPath(text: string): string {
  return text.replace(new RegExp(`\\?${PARAM}=\\d+`, 'g'), '');
}
