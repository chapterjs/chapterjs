#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { eventTypedFolders } from '../events/types.js';
import { writeGenerated } from '../loader/generated.js';
import { dev } from './dev.js';
import { createLog } from './log.js';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as { version: string };

const USAGE = `Usage: chapterjs <command>

Commands:
  dev    Run your bot on your dev server and reload it when you save a file
  sync   Write the types of your project (dev does it too)`;

const colors = process.stdout.isTTY === true && !process.env.NO_COLOR;
const log = createLog(line => console.log(line), colors);
const [command] = process.argv.slice(2);

if (command === 'dev') {
  // Ctrl+C and a stop asked by the system both end the session cleanly, so
  // the bot goes offline at once. A second one does not wait.
  const controller = new AbortController();
  for (const name of ['SIGINT', 'SIGTERM'] as const) {
    process.on(name, () => {
      if (controller.signal.aborted) process.exit(1);
      controller.abort();
    });
  }
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
} else if (command === 'sync') {
  // Run after installing, so the editor knows the types before the first
  // `chapterjs dev`.
  await writeGenerated(process.cwd(), eventTypedFolders());
  log.success('Types written to .chapterjs/');
} else if (command === '--version' || command === '-v') {
  console.log(version);
} else if (command === undefined || command === '--help' || command === '-h') {
  console.log(USAGE);
} else if (command === 'start' || command === 'build') {
  log.error(
    `"chapterjs ${command}" is not available yet in this version.\nUse "chapterjs dev" to run your bot while you write it.`
  );
  process.exitCode = 1;
} else {
  log.error(`"${command}" is not a command.\n${USAGE}`);
  process.exitCode = 1;
}
