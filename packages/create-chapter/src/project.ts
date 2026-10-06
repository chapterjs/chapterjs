import { existsSync, readdirSync, statSync } from 'node:fs';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { templatesDir } from './templates.js';
import type { PackageManager } from './package-manager.js';

/** Files that don't make a folder "used": a project can still be created there. */
const ignoredFiles = new Set([
  '.git',
  '.DS_Store',
  'Thumbs.db',
  '.idea',
  '.vscode',
]);

/** Returns why `input` can't hold a new project, or `undefined` when it can. */
export function validateTargetDir(
  input: string | undefined
): string | undefined {
  const dir = input?.trim();
  if (!dir) return 'Type a folder name, or . to use the current folder.';
  const path = resolve(dir);
  if (!existsSync(path)) return undefined;
  if (!statSync(path).isDirectory())
    return `${dir} is a file, not a folder. Pick another name.`;
  const used = readdirSync(path).some(file => !ignoredFiles.has(file));
  if (used) {
    return path === process.cwd()
      ? 'The current folder is not empty. Type a name to create a new folder instead.'
      : `The folder ${dir} is not empty. Pick another name.`;
  }
  return undefined;
}

/** A valid npm package name from a folder name, e.g. `Mon Bot Été` → `mon-bot-ete`. */
export function toPackageName(dir: string): string {
  const name = basename(resolve(dir))
    // `é` → `e`: split letters from their accents, then drop the accents.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-~._]+/g, '-')
    .replace(/-{2,}/g, '-')
    // npm names can't start with `.` or `_`, and 214 characters is the maximum.
    .replace(/^[-._]+/, '')
    .slice(0, 214)
    .replace(/[-.]+$/, '');
  return name || 'chapter-bot';
}

export interface CreateOptions {
  dir: string;
  template: string;
  /** The `chapterjs` version range the project depends on. */
  chapterjsVersion: string;
  /** The package manager the project will be installed with. */
  packageManager?: PackageManager;
  /** Where templates are read from: `templates/` of this package by default. */
  templatesRoot?: string;
}

/**
 * What pnpm needs to install a project whose framework comes with esbuild
 * (which `chapterjs build` compiles the bot with). esbuild has an install
 * script it does not need; pnpm refuses to go on until the project says whether that
 * script may run. It may not: no script of a dependency runs.
 * `allowBuilds` is read by pnpm 11, `ignoredBuiltDependencies` by pnpm 10.
 */
export const PNPM_WORKSPACE = `# esbuild works without its install script: pnpm is told not to run it.
allowBuilds:
  esbuild: false
ignoredBuiltDependencies:
  - esbuild
`;

/** Copies the template into `dir` and names the project after its folder. */
export async function createProject({
  dir,
  template,
  chapterjsVersion,
  packageManager,
  templatesRoot = templatesDir,
}: CreateOptions) {
  const root = resolve(dir);
  await cp(join(templatesRoot, template), root, { recursive: true });
  // Where the files the bot sends go (`asset()`): git and npm keep no empty
  // folder, so no template can ship it; every project gets it here.
  await mkdir(join(root, 'public'), { recursive: true });

  // npm strips `.gitignore` from published packages, so templates ship it as `_gitignore`.
  const gitignore = join(root, '_gitignore');
  if (existsSync(gitignore)) await rename(gitignore, join(root, '.gitignore'));

  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
    name?: string;
    description?: string;
    dependencies?: Record<string, string>;
  };
  pkg.name = toPackageName(dir);
  // The template's description is for the menu, not for the user's bot.
  delete pkg.description;
  pkg.dependencies = { ...pkg.dependencies, chapterjs: chapterjsVersion };
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Only for the package manager that reads it: nothing to explain to the
  // others.
  if (packageManager === 'pnpm') {
    await writeFile(join(root, 'pnpm-workspace.yaml'), PNPM_WORKSPACE);
  }
}
