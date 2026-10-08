// `chapterjs build`: prepares the bot for production. Everything that can
// go wrong with the files of the project goes wrong here, before anything
// is online: types are checked, every file is run, then the whole bot is
// compiled into one JavaScript file in `.chapterjs/build/`. `chapterjs
// start` runs that, and only that: the bot in production is exactly what
// was built.
//
// The compiling is done by esbuild, the one dependency of the framework. It
// is only loaded here: running a bot never needs it.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { enableProjectLoader } from '../loader/hot.js';
import { listFolder, type BuiltFile } from '../loader/loader.js';
import { sourcesJoinVoice } from '../voice/usage.js';
import type { Log } from './log.js';
import {
  CONVENTIONS,
  createProject,
  hasSources,
  writeTypes,
} from './project.js';

/** Where the build of a project is, from its folder. */
export const buildDir = (cwd: string): string =>
  join(cwd, '.chapterjs', 'build');

/** The file the whole bot is compiled into, in the build. */
export const BUNDLE = 'bot.js';

/** What `build.json` says of a build. */
export interface BuildInfo {
  /** The version of the framework that made it. */
  version: string;
  /** What the files of `src` were when it was made. */
  sources: string;
  commands: number;
  events: number;
  /** Whether the files join voice channels (an intent to ask for). */
  voice: boolean;
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
    await stat(join(buildDir(cwd), BUNDLE));
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

/**
 * Loads the bot a build compiled: every file of the project, already run.
 * Errors that come out of it afterwards name the file and the line of the
 * project, not of the compiled file: Node reads the map next to it.
 */
export async function loadBundle(cwd: string): Promise<BuiltFile[]> {
  process.setSourceMapsEnabled(true);
  const module = (await import(
    pathToFileURL(join(buildDir(cwd), BUNDLE)).href
  )) as { files: BuiltFile[] };
  return module.files;
}

/** What esbuild says when it can't compile. */
interface EsbuildFailure {
  errors?: {
    text: string;
    location?: { file: string; line: number } | null;
  }[];
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

  // Whatever happens next, the last build is not one to start any more.
  await rm(out, { recursive: true, force: true });
  const stopped = async (
    failures: number,
    why = "can't run"
  ): Promise<number> => {
    log.error(
      `${failures === 1 ? 'This file' : `These ${failures} files`} ${why}, so your bot was not built. Fix ${failures === 1 ? 'it' : 'them'} and build again: chapterjs dev shows the same errors while you write.`
    );
    await rm(out, { recursive: true, force: true });
    return 1;
  };

  // 1. Every file must run, one by one: each says what is wrong with it.
  enableProjectLoader(src, { reload: false });
  const sources = createProject({ cwd, version: options.version, log });
  const failures = await sources.load();
  // 2. Types: what the editor underlines, for the whole project. Written
  // once the files ran, so a language file only offers the commands they
  // do not describe; written even when a file failed, so the editor
  // follows.
  await writeTypes(
    cwd,
    sources.commands,
    sources.messages,
    sources.languageDefaults
  );
  if (failures.length > 0) {
    for (const failure of failures) sources.report(failure);
    return stopped(failures.length);
  }
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

  // 3. The whole bot in one file: every file of the conventional folders,
  // with what it imports from the project. Packages stay where they are
  // installed: the bot and the framework must share the same ones.
  const found = (
    await Promise.all(
      CONVENTIONS.map(convention => listFolder(cwd, convention))
    )
  ).flat();
  const entry = [
    ...found.map(
      ({ path }, index) => `import * as m${index} from ${JSON.stringify(path)};`
    ),
    `export const files = [${found
      .map(
        ({ file }, index) =>
          `{ file: ${JSON.stringify(file)}, exports: m${index} }`
      )
      .join(', ')}];`,
  ].join('\n');
  await mkdir(out, { recursive: true });
  // Loaded when it is needed: no other command pays for it.
  const esbuild = await import('esbuild');
  try {
    await esbuild.build({
      stdin: {
        contents: entry,
        resolveDir: cwd,
        sourcefile: 'chapterjs-build.js',
        loader: 'js',
      },
      absWorkingDir: cwd,
      outfile: join(out, BUNDLE),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      packages: 'external',
      // Compact, but with the names the developer wrote: an error must
      // still read like their code. The map gives back files and lines.
      minifyWhitespace: true,
      minifySyntax: true,
      minifyIdentifiers: false,
      keepNames: true,
      sourcemap: true,
      sourcesContent: false,
      logLevel: 'silent',
    });
  } catch (error) {
    const errors = (error as EsbuildFailure).errors ?? [];
    if (errors.length === 0) throw error;
    for (const { text, location } of errors) {
      log.error(
        `${location ? `${location.file}:${location.line} ` : ''}${text}`
      );
    }
    return stopped(errors.length, "can't be compiled");
  }

  // 4. What was compiled is run once, as production will run it.
  const built = createProject({
    cwd,
    version: options.version,
    log,
    built: await loadBundle(cwd),
  });
  const broken = await built.load();
  if (broken.length > 0) {
    for (const failure of broken) built.report(failure);
    return stopped(broken.length, "can't run once compiled");
  }

  const info: BuildInfo = {
    version: options.version,
    sources: await fingerprint(src),
    commands: built.commands.size,
    events: built.events.size,
    voice: await sourcesJoinVoice(cwd),
  };
  await writeFile(join(out, 'build.json'), JSON.stringify(info, null, 2));
  if (built.isEmpty()) log.info(built.summary());
  const { size } = await stat(join(out, BUNDLE));
  log.success(
    `Built in .chapterjs/build: ${built.isEmpty() ? 'nothing to run yet' : built.summary().replace(/ loaded$/, '')} (${Math.max(1, Math.round(size / 1024))} kB)`
  );
  log.info('Run chapterjs start to put it online.');
  return 0;
}
