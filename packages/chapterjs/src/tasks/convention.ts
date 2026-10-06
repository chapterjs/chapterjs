// `src/tasks/`: one file per task, named after it. What the file declares
// is checked when it loads, so a wrong duration or cron is explained
// before the bot waits for it.

import type { Convention } from '../loader/loader.js';
import { parseCron, parseEvery, type Schedule } from './schedule.js';
import { isTaskFile, type TaskConfig, type TaskContext } from './task.js';

/** A task file, checked: what the scheduler works with. */
export interface LoadedTask {
  /** The name of the task: the path of the file, without extension. */
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

/**
 * `src/tasks/`: each file is a task, named after its path. It exports by
 * default what `task()` returns:
 *
 * ```ts
 * // src/tasks/report.ts
 * import { task } from 'chapterjs';
 *
 * export default task({
 *   cron: '0 9 * * 1',
 *   async run({ guilds }) { ... },
 * });
 * ```
 */
export const tasksConvention: Convention<LoadedTask> = {
  folder: 'tasks',
  one: 'task',
  many: 'tasks',
  check(path) {
    for (const part of path.replace(/\.[^./]+$/, '').split('/')) {
      if (!/^[A-Za-z0-9_-]+$/.test(part)) {
        fail(
          `"${part}" can't be in the name of a task: use letters, digits, - and _ only. The path of the file is the name of the task.`
        );
      }
    }
  },
  read(exports, path) {
    const file = exports.default;
    const example = `import { task } from 'chapterjs'; export default task({ every: '10m', run() { ... } })`;
    if (!isTaskFile(file)) {
      return fail(
        'default' in exports
          ? `The default export of this file must be what task() returns: ${example}`
          : `This file has no default export. It should look like: ${example}`
      );
    }
    const config = file.config as TaskConfig;
    if (!isRecord(config)) {
      return fail(
        `task() needs an object: task({ every: '10m', run() { ... } })`
      );
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
      name: path.replace(/\.[^./]+$/, ''),
      schedule,
      onStart: config.onStart === true,
      run: config.run,
    });
  },
};
