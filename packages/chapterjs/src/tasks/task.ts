// `task()`, as the files of `src/tasks/` import it from 'chapterjs': what
// the bot does by itself, at intervals or at given times.

import type { Snowflake } from '../discord/types/common.js';
import type { Guild } from '../structures/guild.js';
import type { User } from '../structures/user.js';

/** What `run` receives: the bot, as the `ready` event gives it, and the time. */
export interface TaskContext {
  /** The bot itself. */
  user: User;
  /** The servers the bot is in. */
  guilds: ReadonlyMap<Snowflake, Guild>;
  /** When this run was due. */
  now: Date;
}

interface TaskConfigBase {
  /**
   * Also run once as soon as the bot is connected, without waiting for the
   * first time of the schedule.
   */
  onStart?: boolean;
  /** What the task does. */
  run: (context: TaskContext) => unknown;
}

/** A task that runs every so often. */
export interface EveryTaskConfig extends TaskConfigBase {
  /**
   * How often the task runs: a number and a unit, `s`, `m`, `h` or `d`,
   * like `'30s'`, `'10m'`, `'2h'`, `'1d'` or `'1h30m'`. Once per second at
   * most. Counted from when the bot connects.
   */
  every: string;
  cron?: never;
  timezone?: never;
}

/** A task that runs at given times. */
export interface CronTaskConfig extends TaskConfigBase {
  /**
   * When the task runs, as a cron expression: minute, hour, day of month,
   * month and day of week, like `'0 9 * * 1-5'` (9:00 on weekdays). `*`,
   * lists (`1,15`), ranges (`1-5`), steps (`*​/15`) and names (`mon`,
   * `jan`) work.
   */
  cron: string;
  /**
   * The timezone the cron follows, like `'Europe/Paris'`. The clock of
   * the machine by default.
   */
  timezone?: string;
  every?: never;
}

/** What a task file gives to `task()`: when it runs, and what it does. */
export type TaskConfig = EveryTaskConfig | CronTaskConfig;

/** What `task()` returns: the default export of a task file. */
export interface TaskFile {
  /** What the file gave to `task()`, not checked yet. */
  readonly config: unknown;
}

const BRAND = Symbol.for('chapterjs.task');

/**
 * Declares a task: something the bot does by itself. Export the result as
 * the default export of a file of `src/tasks/`: the name of the file is
 * the name of the task.
 *
 * ```ts
 * import { task } from 'chapterjs';
 *
 * export default task({
 *   every: '10m',
 *   async run({ guilds }) {
 *     console.log(`Watching ${guilds.size} servers`);
 *   },
 * });
 * ```
 */
export function task(config: TaskConfig): TaskFile {
  return Object.freeze({ [BRAND]: true, config });
}

/** Whether a value was made by `task()`. */
export function isTaskFile(value: unknown): value is TaskFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}
