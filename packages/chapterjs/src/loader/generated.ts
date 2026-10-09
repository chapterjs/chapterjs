// The `.chapterjs/` folder of a project: what the framework writes so that
// the files of the project are typed from the project itself, with nothing
// to write. Everything 'chapterjs' gives is typed by the package; what only
// the project knows (the files of `public/`, its languages, its commands)
// is written here as an augmentation of 'chapterjs', in one TypeScript
// project that covers every file of `src/`. The tsconfig of the user
// project only references this folder; editors and `tsc -b` find it by
// themselves.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADER = '// Written by ChapterJS: do not edit, it is overwritten.\n';
const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** How a file of `.chapterjs/types/` imports the real package. */
function packageSpecifier(projectDir: string): string {
  const installed = join(projectDir, 'node_modules', 'chapterjs');
  const target = existsSync(installed)
    ? installed
    : // No node_modules (some package managers): where this code runs from.
      fileURLToPath(new URL('../..', import.meta.url));
  const path = relative(join(projectDir, '.chapterjs', 'types'), target);
  return `${path.split(sep).join('/')}/dist/index.js`;
}

/** Every file of `.chapterjs/`, by its path inside it. */
function generatedFiles(
  projectDir: string,
  declarations: string
): Map<string, string> {
  const files = new Map<string, string>();
  const specifier = packageSpecifier(projectDir);
  // The folder ignores itself: nothing to add to the project's .gitignore.
  files.set('.gitignore', '*\n');
  // What the project adds to 'chapterjs': written as an augmentation, so
  // the editor offers one 'chapterjs' and not a second copy of it.
  files.set(
    'types/project.d.ts',
    `${HEADER}${declarations.replaceAll("'#chapterjs'", `'${specifier}'`)}`
  );
  files.set(
    'tsconfig.json',
    json({
      extends: '../tsconfig.json',
      // The declaration file is listed too: a project without a src folder
      // yet is then a valid, empty project.
      include: ['../src', './types/project.d.ts'],
    })
  );
  return files;
}

/**
 * Writes the `.chapterjs/` folder of a project. A file whose content did
 * not change is left alone, so editors don't reload for nothing; what an
 * older version wrote and this one does not is removed. `declarations` is
 * what 'chapterjs' has in this project on top of the package: `declare
 * module 'chapterjs'` augmentations, importing the package from
 * `'#chapterjs'`.
 * @returns how many files were written
 */
export async function writeGenerated(
  projectDir: string,
  declarations: string
): Promise<number> {
  const root = join(projectDir, '.chapterjs');
  const files = generatedFiles(projectDir, declarations);
  const existing = await readdir(root, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  await Promise.all(
    existing
      .filter(entry => entry.isFile())
      .map(entry => join(entry.parentPath, entry.name))
      .filter(
        path =>
          !files.has(relative(root, path).split(sep).join('/')) &&
          // What TypeScript itself leaves there to check faster next time,
          // and what features remember between two runs.
          !path.endsWith('.tsbuildinfo') &&
          !relative(root, path).startsWith(`cache${sep}`) &&
          // What `chapterjs build` made is not ours to remove.
          !relative(root, path).startsWith(`build${sep}`)
      )
      .map(path => rm(path, { force: true }))
  );
  let written = 0;
  await Promise.all(
    [...files].map(async ([path, content]) => {
      const target = join(root, path);
      if ((await readFile(target, 'utf8').catch(() => null)) === content) {
        return;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
      written++;
    })
  );
  return written;
}
