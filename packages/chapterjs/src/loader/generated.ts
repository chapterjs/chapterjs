// The `.chapterjs/` folder of a project: what the framework writes so that
// user files are typed from where they are, with nothing to write.
//
// A user file imports everything from 'chapterjs'. To give that import a
// different type in each conventional folder (`event()` in
// `src/events/memberJoin/` knows it receives a member), each such folder is
// its own TypeScript project, in which 'chapterjs' resolves to a generated
// declaration file: everything the package exports, plus what is specific
// to the folder. The tsconfig of the user project only references this
// folder; editors and `tsc -b` find the project of each file by themselves.

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A folder of user files in which 'chapterjs' has its own types. */
export interface TypedFolder {
  /** A unique name, used for file names: `events.memberJoin`. */
  id: string;
  /**
   * The folder, from the project folder, with `/`. It may contain `**` to
   * be found at any depth (inside `(group)` folders).
   */
  folder: string;
  /**
   * The declarations 'chapterjs' has in this folder, on top of what the
   * package exports. Written like a `.d.ts` that imports the package from
   * `'#chapterjs'`.
   */
  declarations: string;
}

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
  folders: readonly TypedFolder[]
): Map<string, string> {
  const files = new Map<string, string>();
  const specifier = packageSpecifier(projectDir);
  // The folder ignores itself: nothing to add to the project's .gitignore.
  files.set('.gitignore', '*\n');
  // Files that are in no typed folder: 'chapterjs' is the package itself.
  files.set(
    'projects/main.json',
    json({
      extends: '../../tsconfig.json',
      include: ['../../src'],
      exclude: folders.map(({ folder }) => `../../${folder}`),
    })
  );
  for (const { id, folder, declarations } of folders) {
    files.set(
      `projects/${id}.json`,
      json({
        extends: '../../tsconfig.json',
        compilerOptions: { paths: { chapterjs: [`../types/${id}.d.ts`] } },
        // The declaration file is listed too: a folder that does not exist
        // yet is then a valid, empty project, typed as soon as it exists.
        include: [`../../${folder}`, `../types/${id}.d.ts`],
      })
    );
    files.set(
      `types/${id}.d.ts`,
      `${HEADER}export * from '${specifier}';\n${declarations.replaceAll("'#chapterjs'", `'${specifier}'`)}`
    );
  }
  files.set(
    'tsconfig.json',
    json({
      files: [],
      references: [
        { path: './projects/main.json' },
        ...folders.map(({ id }) => ({ path: `./projects/${id}.json` })),
      ],
    })
  );
  return files;
}

/**
 * Writes the `.chapterjs/` folder of a project. A file whose content did
 * not change is left alone, so editors don't reload for nothing; what an
 * older version wrote and this one does not is removed.
 * @returns how many files were written
 */
export async function writeGenerated(
  projectDir: string,
  folders: readonly TypedFolder[]
): Promise<number> {
  const root = join(projectDir, '.chapterjs');
  const files = generatedFiles(projectDir, folders);
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
