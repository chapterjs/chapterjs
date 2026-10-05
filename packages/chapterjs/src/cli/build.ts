// `chapterjs build`: prepares the bot for production. Everything that can
// go wrong with the files of the project goes wrong here, before anything
// is online: types are checked, every file is loaded, and what passed is
// kept in `.chapterjs/build/`. `chapterjs start` runs that, and only that:
// the bot in production is exactly what was built.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { eventTypedFolders } from '../events/types.js';
import { writeGenerated } from '../loader/generated.js';
import { enableProjectLoader } from '../loader/hot.js';
import type { Log } from './log.js';
import { createProject, hasSources } from './project.js';

/** Where the build of a project is, from its folder. */
export const buildDir = (cwd: string): string =>
  join(cwd, '.chapterjs', 'build');

/** What `build.json` says of a build. */
export interface BuildInfo {
  /** The version of the framework that made it. */
  version: string;
  /** What the files of `src` were when it was made. */
  sources: string;
  commands: number;
  events: number;
}

/** One value for everything in a folder: it changes when a file does. */
export async function fingerprint(dir: string): Promise<string> {
  const hash = createHash('sha256');
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    hash.update(relative(dir, file).split(sep).join('/'));
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** The build of a project, or why there is none to run. */
export async function readBuild(
  cwd: string,
  version: string
): Promise<{ info: BuildInfo; stale: boolean } | { problem: string }> {
  let info: BuildInfo;
  try {
    info = JSON.parse(
      await readFile(join(buildDir(cwd), 'build.json'), 'utf8')
    ) as BuildInfo;
  } catch {
    return {
      problem:
        'There is no build of your bot here.\nRun "chapterjs build" first (the build script of your project), then start again.',
    };
  }
  if (info.version !== version) {
    return {
      problem: `This build was made with chapterjs ${info.version}, and this is chapterjs ${version}.\nRun "chapterjs build" again.`,
    };
  }
  // On a host that only received the build, there are no sources to compare.
  const src = join(cwd, 'src');
  const hasSrc = (await stat(src).catch(() => null))?.isDirectory() === true;
  return {
    info,
    stale: hasSrc && (await fingerprint(src)) !== info.sources,
  };
}

/** Runs the TypeScript of the project on itself. `null`: there is none. */
async function checkTypes(
  cwd: string
): Promise<{ ok: boolean; output: string } | null> {
  const tsc = join(cwd, 'node_modules', '.bin', 'tsc');
  const [hasTsc, hasConfig] = await Promise.all([
    stat(tsc).catch(() => null),
    stat(join(cwd, 'tsconfig.json')).catch(() => null),
  ]);
  if (!hasTsc || !hasConfig) return null;
  return new Promise(resolve => {
    const child = spawn(tsc, ['-b', '--pretty', 'false'], { cwd });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', error => resolve({ ok: false, output: error.message }));
    child.on('close', code => resolve({ ok: code === 0, output }));
  });
}

export interface BuildOptions {
  /** The folder of the project. */
  cwd: string;
  /** The version of the framework. */
  version: string;
  log: Log;
}

/** Resolves with the exit code of the process. */
export async function build(options: BuildOptions): Promise<number> {
  const { cwd, log } = options;
  if (!(await hasSources(cwd, log))) return 1;
  const src = join(cwd, 'src');
  const out = buildDir(cwd);

  // 1. Types: what the editor underlines, for the whole project.
  await writeGenerated(cwd, eventTypedFolders());
  const types = await checkTypes(cwd);
  if (types === null) {
    log.info(
      'Types were not checked: TypeScript is not installed in this project (or it has no tsconfig.json).'
    );
  } else if (!types.ok) {
    log.error(
      `Your project has type errors, so it was not built:\n${types.output.trim()}`
    );
    return 1;
  } else {
    log.success('Types checked');
  }

  // 2. The files as they are now, kept apart: what runs in production does
  // not change when a file of the project does.
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(src, join(out, 'src'), { recursive: true });

  // 3. Every file must run, from where it will run.
  const project = createProject({ cwd: out, version: options.version, log });
  enableProjectLoader(join(out, 'src'), { reload: false });
  const failures = await project.load();
  if (failures.length > 0) {
    for (const failure of failures) project.report(failure);
    // The build only takes src: what a file imports from elsewhere in the
    // project is not there any more.
    if (
      failures.some(
        ({ error }) =>
          (error as NodeJS.ErrnoException | null)?.code ===
          'ERR_MODULE_NOT_FOUND'
      )
    ) {
      log.info(
        'A file your bot imports was not found in the build. Everything it runs must be inside src/ (or be an installed package): move it there.'
      );
    }
    log.error(
      `${failures.length === 1 ? 'This file' : `These ${failures.length} files`} can't run, so your bot was not built. Fix ${failures.length === 1 ? 'it' : 'them'} and build again: chapterjs dev shows the same errors while you write.`
    );
    // A build that failed is not one to start.
    await rm(out, { recursive: true, force: true });
    return 1;
  }

  const info: BuildInfo = {
    version: options.version,
    sources: await fingerprint(src),
    commands: project.commands.size,
    events: project.events.size,
  };
  await writeFile(join(out, 'build.json'), JSON.stringify(info, null, 2));
  if (project.isEmpty()) {
    log.info(project.summary());
  }
  log.success(
    `Built in .chapterjs/build: ${project.isEmpty() ? 'nothing to run yet' : project.summary().replace(/ loaded$/, '')}`
  );
  log.info('Run chapterjs start to put it online.');
  return 0;
}
