#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { build } from './build.js';
import { readAssignment } from './cluster.js';
import { dev } from './dev.js';
import { writeTypes } from './project.js';
import { createLog } from './log.js';
import { nodeTooOld } from './node-version.js';
import { start } from './start.js';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as { version: string };

const USAGE = `Usage: chapterjs <command>

Commands:
  dev     Run your bot on your dev server and reload it when you save a file
  build   Check your bot and prepare it for production
  start   Run for everyone the bot that was built
  sync    Write the types of your project (dev does it too)

Options of start:
  --processes <n>   How many processes to use (by default: as many as the
                    size of your bot needs)`;

const colors = process.stdout.isTTY === true && !process.env.NO_COLOR;
const log = createLog(line => console.log(line), colors);
const tooOld = nodeTooOld();
if (tooOld) {
  log.error(tooOld);
  process.exit(1);
}
const [command, ...rest] = process.argv.slice(2);

/**
 * Ctrl+C and a stop asked by the system both end the session cleanly, so
 * the bot goes offline at once. A second one does not wait.
 */
function stopSignal(): AbortSignal {
  const controller = new AbortController();
  for (const name of ['SIGINT', 'SIGTERM'] as const) {
    process.on(name, () => {
      if (controller.signal.aborted) process.exit(1);
      controller.abort();
    });
  }
  return controller.signal;
}

/** `--processes 4` or `--processes=4`; `null` when it is not a count. */
function readProcesses(args: readonly string[]): number | undefined | null {
  const index = args.findIndex(
    arg => arg === '--processes' || arg.startsWith('--processes=')
  );
  if (index === -1) return args.length === 0 ? undefined : null;
  const arg = args[index]!;
  const value = arg.includes('=')
    ? arg.slice(arg.indexOf('=') + 1)
    : args[index + 1];
  const others = args.length - (arg.includes('=') ? 1 : 2);
  const count = Number(value);
  return others === 0 && Number.isInteger(count) && count >= 1 ? count : null;
}

if (command === 'dev') {
  const controller = { signal: stopSignal() };
  process.exitCode = await dev({
    cwd: process.cwd(),
    env: process.env,
    version,
    log,
    interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    signal: controller.signal,
  });
  // Nothing may keep the process alive once the bot is disconnected.
  process.exit();
} else if (command === 'start') {
  const processes = readProcesses(rest);
  if (processes === null) {
    log.error(
      `chapterjs start takes one option: --processes followed by a number, like "chapterjs start --processes 4". Got "${rest.join(' ')}".`
    );
    process.exitCode = 1;
  } else {
    const assignment = readAssignment(process.env);
    process.exitCode = await start({
      cwd: process.cwd(),
      env: { ...process.env, CHAPTERJS_COLORS: colors ? '1' : '0' },
      version,
      // A process started by another prints for it: colors are its choice.
      log: assignment
        ? createLog(
            line => console.log(line),
            process.env.CHAPTERJS_COLORS === '1'
          )
        : log,
      write: line => console.log(line),
      signal: stopSignal(),
      processes,
      assignment,
      script: process.argv[1]!,
      args: ['start'],
    });
    process.exit();
  }
} else if (command === 'sync') {
  // Run after installing, so the editor knows the types before the first
  // `chapterjs dev`.
  await writeTypes(process.cwd());
  log.success('Types written to .chapterjs/');
} else if (command === '--version' || command === '-v') {
  console.log(version);
} else if (command === undefined || command === '--help' || command === '-h') {
  console.log(USAGE);
} else if (command === 'build') {
  process.exitCode = await build({ cwd: process.cwd(), version, log });
  process.exit();
} else {
  log.error(`"${command}" is not a command.\n${USAGE}`);
  process.exitCode = 1;
}
