// `chapterjs test`: runs the bot of the current folder against a Discord
// in memory and checks it, without a token and without touching Discord.
// First what needs nothing written: every command, button, menu, form,
// event and task is used once with ordinary values and with hard ones,
// and must answer without throwing. Then the scenarios of the project
// (`src/**/*.test.ts`, written with `scenario()` from 'chapterjs/test'),
// each on a fresh server.

import { join } from 'node:path';
import type { Bot } from '../core/bot.js';
import { enableProjectLoader } from '../loader/hot.js';
import {
  listTests,
  loadFiles,
  readDeclarations,
  siteName,
  type FailedFile,
} from '../loader/loader.js';
import { locate, messageOf } from '../loader/locate.js';
import { MemoryStoreBackend } from '../store/memory-backend.js';
import { TestFailure } from '../testing/failure.js';
import { captureLog, Observer, Session } from '../testing/harness.js';
import {
  scenarioDeclaration,
  type LoadedScenario,
} from '../testing/scenario.js';
import { smokeChecks, type Check } from '../testing/smoke.js';
import { World } from '../testing/world.js';
import type { Log } from './log.js';
import {
  createProject,
  hasSources,
  reportLooseRejections,
  writeTypes,
  type Project,
} from './project.js';

export interface TestOptions {
  /** The folder of the project. */
  cwd: string;
  /** The version of the framework. */
  version: string;
  log: Log;
  /** How long a scenario may take, in milliseconds. Default: 10 s. */
  scenarioTimeout?: number;
  /**
   * Whether a person is watching a terminal: the check in progress is then
   * shown, case by case, and replaced by its result once done.
   */
  progress?: boolean;
}

/**
 * What a terminal shows while a file is tested: `↻ Testing src/close.ts`,
 * then one line per thing and case as it is tried. Once the file is done,
 * those lines are erased and its result takes their place, so a report
 * that passed reads as if nothing had moved. When nobody is watching (the
 * output is not a terminal), nothing is shown meanwhile.
 */
export function checkProgress(
  enabled: boolean,
  log: Pick<Log, 'reload'>,
  write: (text: string) => void
): { start(title: string): void; step(label: string): void; clear(): void } {
  let lines = 0;
  return {
    start(title) {
      if (!enabled) return;
      log.reload(title);
      lines = 1;
    },
    step(label) {
      if (!enabled) return;
      write(`  → ${label}\n`);
      lines++;
    },
    clear() {
      if (!enabled || lines === 0) return;
      // Up to the first line of the check, then everything below it goes.
      write(`\x1b[${lines}A\x1b[0J`);
      lines = 0;
    },
  };
}

/** What the files said to the developer during a check, as failures. */
function problems(captured: { errors: string[]; warnings: string[] }): {
  failures: string[];
  warnings: string[];
} {
  const failures = [...captured.errors];
  const warnings: string[] = [];
  for (const warning of captured.warnings) {
    // The person sees "The application did not respond": a failure.
    if (warning.includes('finished without answering')) failures.push(warning);
    else warnings.push(warning);
  }
  return { failures, warnings };
}

/** Where a failure of a scenario comes from, when it is in the project. */
function where(error: unknown, cwd: string): string {
  const found = locate(error, cwd);
  return found ? `${found.file}:${found.line} ` : '';
}

/** Runs the whole project in a fresh world; `close` ends it. */
/** What join() says in the Discord in memory, where nothing plays. */
const VOICE_NOT_SIMULATED =
  'Voice is not simulated by chapterjs test yet: the bot can not join a voice channel here.';

async function startSession(
  project: Project,
  observer: Observer,
  stores: MemoryStoreBackend
): Promise<{ session: Session; close(): Promise<void> }> {
  stores.reset();
  observer.reset();
  const world = new World();
  await world.start();
  let bot: Bot;
  try {
    bot = await project.connect({
      token: 'test-token',
      apiUrl: world.discord.url,
      privateEvents: true,
      voiceUnavailable: VOICE_NOT_SIMULATED,
      onFatal: () => {},
    });
  } catch (error) {
    await world.close();
    throw error;
  }
  const session = new Session(world, project, bot, observer);
  return {
    session,
    close: async () => {
      await bot.close();
      await world.close();
    },
  };
}

/**
 * What the files print while they are tested, kept out of the report: a
 * `console.log` of a `ready` event saying "online" would read as the bot
 * being online. The runner writes through `report()`; what the files wrote
 * is given back by `take()`, to show under a failure.
 */
function quiet(): {
  report(write: () => void): void;
  take(): string;
  restore(): void;
} {
  const original = {
    out: process.stdout.write.bind(process.stdout),
    err: process.stderr.write.bind(process.stderr),
  };
  let printed = '';
  const swallow = (chunk: unknown): boolean => {
    printed +=
      typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk as never).toString();
    return true;
  };
  const silence = (): void => {
    process.stdout.write = swallow as typeof process.stdout.write;
    process.stderr.write = swallow as typeof process.stderr.write;
  };
  const restore = (): void => {
    process.stdout.write = original.out;
    process.stderr.write = original.err;
  };
  silence();
  return {
    report(write) {
      restore();
      try {
        write();
      } finally {
        silence();
      }
    },
    take() {
      const taken = printed;
      printed = '';
      return taken;
    },
    restore,
  };
}

/** What the files printed, as the lines under a failure. */
function printed(output: string): string {
  const text = output.trim();
  if (text === '') return '';
  return `\nWhat the files printed meanwhile:\n${text}`;
}

/** Resolves with the exit code of the process. */
export async function test(options: TestOptions): Promise<number> {
  const { cwd } = options;
  if (!(await hasSources(cwd, options.log))) return 1;
  const src = join(cwd, 'src');
  const output = quiet();
  const stops: (() => void)[] = [];
  try {
    return await run(options, src, output, stop => stops.push(stop));
  } finally {
    for (const stop of stops) stop();
    output.restore();
  }
}

async function run(
  options: TestOptions,
  src: string,
  output: ReturnType<typeof quiet>,
  /** What to undo when the run ends. */
  onEnd: (stop: () => void) => void
): Promise<number> {
  const { cwd } = options;
  // The report, written while what the files print is kept out of it.
  const log: Log = {
    success: message => output.report(() => options.log.success(message)),
    info: message => output.report(() => options.log.info(message)),
    reload: message => output.report(() => options.log.reload(message)),
    warn: message => output.report(() => options.log.warn(message)),
    error: message => output.report(() => options.log.error(message)),
  };

  // 1. The files of the project, every one of them running.
  enableProjectLoader(src, { reload: false });
  const capture = captureLog();
  // A promise of the files that nobody awaited fails the check or the
  // scenario it belongs to, as dev says it, instead of ending the run.
  onEnd(reportLooseRejections(cwd, capture.log));
  const observer = new Observer();
  const stores = new MemoryStoreBackend();
  const project = createProject({
    cwd,
    version: options.version,
    log: capture.log,
    // Every store, wherever it says it keeps its data, is in memory here:
    // a test never needs a Redis, and starts from nothing.
    stores: { file: stores, redis: stores },
    observe: observer.observe,
  });
  await writeTypes(cwd);
  const failures = await project.load();
  await writeTypes(cwd, project.typesInfo());
  if (failures.length > 0) {
    for (const failure of failures) report(failure, cwd, log);
    log.error(
      `${failures.length === 1 ? 'This file' : `These ${failures.length} files`} can't run, so your bot was not tested. Fix ${failures.length === 1 ? 'it' : 'them'} and test again: chapterjs dev shows the same errors while you write.${printed(output.take())}`
    );
    await project.closeStores();
    return 1;
  }
  if (project.isEmpty()) {
    log.info(project.summary());
    await project.closeStores();
    return 0;
  }
  log.success(project.summary());
  output.take();

  let checksPassed = 0;
  let checksFailed = 0;
  let scenariosPassed = 0;
  let scenariosFailed = 0;

  try {
    // 2. What needs nothing written: every file used once. The report
    // has one line per file: what was checked in it only shows when
    // something failed.
    const { checks, notSimulated } = smokeChecks(project);
    const smoke = {
      current: await startSession(project, observer, stores),
      /** Whether a case ran on the current world: the next gets a new one. */
      used: false,
      async restart() {
        await this.current.close();
        this.current = await startSession(project, observer, stores);
      },
    };
    /** The checks whose files join voice, which is not played here. */
    const voiceSkipped: string[] = [];
    const progress = checkProgress(options.progress === true, log, text =>
      output.report(() => process.stdout.write(text))
    );
    try {
      // The ready event runs first, as it does online; its result is
      // reported with the file it comes from.
      project.ready(smoke.current.session.bot);
      await smoke.current.session.settle();
      const atStart = problems(capture.take());
      const readyPrinted = output.take();
      const readyFiles = [
        ...new Set(
          [...project.events.values()]
            .filter(({ event }) => event.name === 'ready')
            .map(({ file }) => file)
        ),
      ];
      for (const warning of atStart.warnings) log.warn(warning);
      /** What was found in each file, in the order of the files. */
      const byFile = new Map<string, Check[]>();
      for (const file of readyFiles) byFile.set(file, []);
      for (const check of checks) {
        byFile.set(check.file, [...(byFile.get(check.file) ?? []), check]);
      }
      // The files that passed are one line at the end: these checks are
      // the framework's, what the developer reads is the scenarios.
      const quietFiles: string[] = [];
      let quietChecks = 0;
      for (const [file, own] of [...byFile].sort(([a], [b]) =>
        a < b ? -1 : 1
      )) {
        progress.start(`Checking ${file}`);
        const failures: string[] = [];
        const warnings: string[] = [];
        let passed = 0;
        if (readyFiles.includes(file)) {
          if (atStart.failures.length > 0) {
            failures.push(
              `event ready failed: ${atStart.failures.map(failure => failure.split('\n').join(' ')).join('; ')}${printed(readyPrinted)}`
            );
          } else passed++;
        }
        for (const check of own) {
          progress.step(check.subject);
          const result = await runCheck(check, smoke, capture, cwd, label =>
            progress.step(`${check.subject}, ${label}`)
          );
          const wrote = output.take();
          if (result.notSimulated)
            voiceSkipped.push(`${check.subject} (${file})`);
          if (result.failed.length === 0) passed++;
          else {
            // One case: its label says nothing more than the subject.
            failures.push(
              check.cases.length === 1
                ? `${check.subject} failed\n${result.failed[0]!.message}${printed(wrote)}`
                : `${check.subject} failed in ${result.failed.length === check.cases.length ? 'every case' : `${result.failed.length} of ${check.cases.length} cases`}\n${result.failed.map(one => `${one.label}: ${one.message}`).join('\n')}${printed(wrote)}`
            );
          }
          for (const warning of result.warnings)
            warnings.push(`${check.subject}: ${warning}`);
        }
        progress.clear();
        checksPassed += passed;
        checksFailed += failures.length;
        if (failures.length === 0) {
          quietFiles.push(file);
          quietChecks += passed;
        }
        for (const failure of failures)
          log.error(`Checked ${file}: ${failure}`);
        for (const warning of warnings) log.warn(`Checked ${file}: ${warning}`);
      }
      if (quietFiles.length > 0) {
        const files = `${quietFiles.length} ${quietFiles.length === 1 ? 'file' : 'files'}`;
        const count = `${quietChecks} ${quietChecks === 1 ? 'check' : 'checks'}`;
        log.success(
          quietFiles.length === byFile.size
            ? `Checked every file once: ${count} in ${files}`
            : `Checked the other ${files} once: ${count}`
        );
      }
    } finally {
      await smoke.current.close();
    }
    if (voiceSkipped.length > 0) {
      log.info(
        `Voice is not played in memory, so what comes after join() was not run for: ${voiceSkipped.join(', ')}. Try it on your server with chapterjs dev.`
      );
    }
    if (notSimulated.length > 0) {
      log.info(
        `${notSimulated.length === 1 ? 'An event is' : 'Some events are'} not simulated yet, so ${notSimulated.length === 1 ? 'its file was' : 'their files were'} not run: ${notSimulated.join(', ')}.`
      );
    }

    // 3. The scenarios of the project, each on a fresh server: one line
    // per test file, the scenarios of it only shown when one failed.
    const files = await listTests(cwd);
    const { loaded, broken } = await loadScenarios(files, cwd, log);
    scenariosFailed += broken;
    const scenariosByFile = new Map<string, LoadedScenario[]>();
    for (const { scenario, file } of loaded) {
      scenariosByFile.set(file, [
        ...(scenariosByFile.get(file) ?? []),
        scenario,
      ]);
    }
    for (const [file, own] of scenariosByFile) {
      progress.start(`Testing ${file}`);
      const failures: string[] = [];
      const warnings: string[] = [];
      let passed = 0;
      for (const scenario of own) {
        progress.step(`"${scenario.label}"`);
        const run = await startSession(project, observer, stores);
        let failure: string | null = null;
        try {
          project.ready(run.session.bot);
          await run.session.settle();
          capture.take();
          output.take();
          await withTimeout(
            Promise.resolve(scenario.run(run.session)),
            options.scenarioTimeout ?? 10_000,
            `took more than ${(options.scenarioTimeout ?? 10_000) / 1000} s: is something waiting for an answer that never comes?`
          );
          await run.session.settle();
        } catch (error) {
          failure =
            error instanceof TestFailure
              ? `${where(error, cwd)}${error.message}`
              : `${where(error, cwd)}${messageOf(error)}`;
        } finally {
          await run.close();
        }
        const captured = problems(capture.take());
        const wrote = output.take();
        if (failure === null && captured.failures.length === 0) passed++;
        else {
          failures.push(
            `"${scenario.label}" failed\n${[...(failure ? [failure] : []), ...captured.failures].join('\n')}${printed(wrote)}`
          );
        }
        for (const warning of captured.warnings)
          warnings.push(`"${scenario.label}": ${warning}`);
      }
      progress.clear();
      scenariosPassed += passed;
      scenariosFailed += failures.length;
      if (failures.length === 0) log.success(`Tested ${file}`);
      for (const failure of failures) log.error(`Tested ${file}: ${failure}`);
      for (const warning of warnings) log.warn(`Tested ${file}: ${warning}`);
    }
    if (files.length === 0) {
      log.info(
        `No scenario yet. Write one in a *.test.ts file of src/ with scenario() from 'chapterjs/test' to check what your bot answers.`
      );
    }
  } finally {
    await project.closeStores();
  }

  // 4. The bottom line.
  const checksTotal = checksPassed + checksFailed;
  const scenariosTotal = scenariosPassed + scenariosFailed;
  const parts = [
    `${checksTotal} ${checksTotal === 1 ? 'check' : 'checks'}`,
    ...(scenariosTotal > 0
      ? [`${scenariosTotal} ${scenariosTotal === 1 ? 'scenario' : 'scenarios'}`]
      : []),
  ];
  if (checksFailed === 0 && scenariosFailed === 0) {
    log.success(`${parts.join(' and ')} passed`);
    return 0;
  }
  log.error(
    `${[
      ...(checksFailed > 0
        ? [
            `${checksFailed} of ${checksTotal} ${checksTotal === 1 ? 'check' : 'checks'}`,
          ]
        : []),
      ...(scenariosFailed > 0
        ? [
            `${scenariosFailed} of ${scenariosTotal} ${scenariosTotal === 1 ? 'scenario' : 'scenarios'}`,
          ]
        : []),
    ].join(' and ')} failed`
  );
  return 1;
}

/** Shows a file (or an export) that could not run. */
function report(failure: FailedFile, cwd: string, log: Log): void {
  const found = locate(failure.error, cwd);
  log.error(
    `${found ? `${found.file}:${found.line}` : siteName(failure)} ${messageOf(failure.error)}`
  );
}

/**
 * How long a case of a check may go without any answer: Discord gives an
 * interaction 3 s, and the framework defers by itself after 2.
 */
const ANSWER_WITHIN = 5000;
/**
 * How long a case may take in all once every interaction it started was
 * answered: a deferred answer may come later, as it may online.
 */
const FINISH_WITHIN = 30_000;

/** The world the checks run in, made again when a case was abandoned. */
interface SmokeWorld {
  session: Session;
  close(): Promise<void>;
}

/**
 * Runs the cases of a check, one after the other, in the same world. A case
 * still running when its time is up is abandoned with the world it ran in:
 * the next case gets a fresh one, so what the abandoned case does later is
 * never taken for what the next one did.
 */
async function runCheck(
  check: Check,
  smoke: { current: SmokeWorld; used: boolean; restart(): Promise<void> },
  capture: ReturnType<typeof captureLog>,
  cwd: string,
  onCase: (label: string) => void = () => {}
): Promise<{
  failed: { label: string; message: string }[];
  warnings: string[];
  notSimulated: boolean;
}> {
  const failed: { label: string; message: string }[] = [];
  const warnings: string[] = [];
  let notSimulated = false;
  for (const one of check.cases) {
    onCase(one.label);
    // Every case on a server as it was: a /ban used on someone must not
    // leave the next case without them.
    if (smoke.used) await smoke.restart();
    smoke.used = true;
    capture.take();
    const { session } = smoke.current;
    const before = new Set(session.world.interactions.values());
    const running = Promise.resolve().then(() => one.run(session));
    let thrown: string | null = null;
    let abandoned = false;
    const fail = (error: unknown): void => {
      thrown =
        error instanceof TestFailure
          ? error.message
          : `${where(error, cwd)}${messageOf(error)}`;
    };
    let outcome = await within(running, ANSWER_WITHIN);
    if (outcome.late) {
      const unanswered = [...session.world.interactions.values()].some(
        record => !before.has(record) && record.callbacks.length === 0
      );
      if (unanswered) {
        thrown = `the bot did not answer within ${ANSWER_WITHIN / 1000} s`;
        abandoned = true;
      } else {
        outcome = await within(running, FINISH_WITHIN - ANSWER_WITHIN);
        if (outcome.late) {
          thrown = `it did not finish within ${FINISH_WITHIN / 1000} s: is something waiting for what never comes?`;
          abandoned = true;
        }
      }
    }
    if (!outcome.late && outcome.failed) fail(outcome.error);
    const captured = problems(capture.take());
    const messages = [...(thrown ? [thrown] : []), ...captured.failures];
    // Voice is not played in memory: a case that only failed there is not
    // the file's fault, it was not run to its end.
    if (
      messages.length > 0 &&
      messages.every(message => message.includes(VOICE_NOT_SIMULATED))
    ) {
      notSimulated = true;
    } else if (messages.length > 0) {
      failed.push({ label: one.label, message: messages.join('; ') });
    }
    for (const warning of captured.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    if (abandoned) running.catch(() => {});
  }
  return { failed, warnings, notSimulated };
}

/** Whether `promise` settled within `ms`, and how. */
async function within(
  promise: Promise<unknown>,
  ms: number
): Promise<
  | { late: true }
  | { late: false; failed: false }
  | { late: false; failed: true; error: unknown }
> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then(
        () => ({ late: false as const, failed: false as const }),
        (error: unknown) => ({
          late: false as const,
          failed: true as const,
          error,
        })
      ),
      new Promise<{ late: true }>(resolve => {
        timer = setTimeout(() => resolve({ late: true }), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Loads the test files and reads their scenarios; what fails is reported. */
async function loadScenarios(
  files: Awaited<ReturnType<typeof listTests>>,
  cwd: string,
  log: Log
): Promise<{
  loaded: { scenario: LoadedScenario; file: string }[];
  broken: number;
}> {
  const sources = await loadFiles(files);
  const read = readDeclarations(sources.modules, scenarioDeclaration);
  const failures = [...sources.failed, ...read.failed];
  for (const failure of failures) report(failure, cwd, log);
  const loaded = read.loaded.map(item => ({
    scenario: item.value,
    file: item.file,
  }));
  for (const { file, exports } of sources.modules) {
    if (
      !read.loaded.some(item => item.file === file) &&
      !read.failed.some(item => item.file === file)
    ) {
      log.warn(
        `${file} declares no scenario: export one made with scenario() from 'chapterjs/test'${Object.keys(exports).length === 0 ? '' : ` (its exports are: ${Object.keys(exports).join(', ')})`}.`
      );
    }
  }
  return { loaded, broken: failures.length };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TestFailure(message)), ms);
    }),
  ]);
}
