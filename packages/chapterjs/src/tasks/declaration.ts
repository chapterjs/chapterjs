// What a file declares with `task()`, checked when it loads, so a wrong
// duration or cron is explained before the bot waits for it. The name of
// the export is the name of the task.

import type { Declaration } from '../loader/loader.js';
import { parseCron, parseEvery, type Schedule } from './schedule.js';
import {
  isTaskDeclaration,
  type TaskConfig,
  type TaskContext,
} from './task.js';

/** A task, checked: what the scheduler works with. */
export interface LoadedTask {
  /** The name of the task: the name of the export that declares it. */
  readonly name: string;
  readonly schedule: Schedule;
  readonly onStart: boolean;
  readonly run: (context: TaskContext) => unknown;
}

const fail = (message: string): never => {
  throw new TypeError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KEYS = ['every', 'cron', 'timezone', 'onStart', 'run'];

const EXAMPLE = `task({ every: '10m', run() { ... } })`;

/**
 * A task, declared anywhere in `src/` with `task()` and exported: the name
 * of the export is the name of the task.
 */
export const taskDeclaration: Declaration<LoadedTask> = {
  one: 'task',
  many: 'tasks',
  is: isTaskDeclaration,
  list: false,
  read(value, { name }) {
    const config = (value as { config: unknown }).config as TaskConfig;
    if (!isRecord(config)) {
      return fail(`task() needs an object: ${EXAMPLE}`);
    }
    for (const key of Object.keys(config)) {
      if (!KEYS.includes(key)) {
        fail(
          `"${key}" is not something a task has. It can have: ${KEYS.join(', ')}.`
        );
      }
    }
    if (config.every !== undefined && config.cron !== undefined) {
      fail(
        `This task has both "every" and "cron": keep one. "every" is an interval ('10m'), "cron" a time ('0 9 * * *').`
      );
    }
    if (config.every === undefined && config.cron === undefined) {
      fail(
        `This task does not say when it runs: add every: '10m' (an interval) or cron: '0 9 * * *' (a time).`
      );
    }
    if (config.every !== undefined && config.timezone !== undefined) {
      fail(
        `"timezone" only goes with "cron": an interval is the same in every timezone.`
      );
    }
    const schedule =
      config.every !== undefined
        ? parseEvery(config.every)
        : parseCron(config.cron, config.timezone);
    if (config.onStart !== undefined && typeof config.onStart !== 'boolean') {
      fail(
        `"onStart" is true or false, got ${JSON.stringify(config.onStart) ?? typeof config.onStart}.`
      );
    }
    if (typeof config.run !== 'function') {
      fail(
        `This task has no "run": the function to run each time, like async run({ guilds }) { ... }`
      );
    }
    return Object.freeze({
      name,
      schedule,
      onStart: config.onStart === true,
      run: config.run,
    });
  },
};
