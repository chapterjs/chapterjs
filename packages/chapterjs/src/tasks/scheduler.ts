// Runs the tasks of the project when they are due. Behind an interface:
// this one keeps timers in the process; a bot on several machines would
// share one through another implementation, with no change to the files.

import type { TaskContext } from './task.js';
import type { LoadedTask } from './declaration.js';
import { describeSchedule, nextRun, scheduleKey } from './schedule.js';

/** A task, with the file it comes from (to report its errors). */
export interface TaskEntry {
  file: string;
  /** The export it is: its name is the name of the task. */
  export: string;
  task: LoadedTask;
}

/** What runs the tasks. */
export interface Scheduler {
  /**
   * Replaces the tasks (after a load or a reload). A task whose timing did
   * not change keeps its next time; a new one is counted from now.
   */
  set(entries: Iterable<TaskEntry>): void;
  /** Starts running the tasks that are due, with what `context` gives. */
  start(context: () => Omit<TaskContext, 'now'> | null): void;
  /** Stops everything; nothing runs after this. */
  stop(): void;
}

export interface SchedulerOptions {
  /** A `run` threw: reported with the file it comes from. */
  onError: (file: string, error: unknown) => void;
  /** Something the developer should know, that is not an error of theirs. */
  onWarning: (file: string, message: string) => void;
}

interface Scheduled {
  entry: TaskEntry;
  key: string;
  next: Date;
  timer: NodeJS.Timeout | null;
  running: boolean;
}

/** The longest a timer of Node can wait. */
const MAX_DELAY = 2 ** 31 - 1;

/** Tasks run by the timers of this process. */
export class TimerScheduler implements Scheduler {
  readonly #options: SchedulerOptions;
  #tasks = new Map<string, Scheduled>();
  #context: (() => Omit<TaskContext, 'now'> | null) | null = null;

  constructor(options: SchedulerOptions) {
    this.#options = options;
  }

  set(entries: Iterable<TaskEntry>): void {
    const kept = new Map<string, Scheduled>();
    const started: Scheduled[] = [];
    for (const entry of entries) {
      const key = scheduleKey(entry.task.schedule);
      const previous = this.#tasks.get(entry.task.name);
      if (previous && previous.key === key) {
        // Same timing: the next time stays, only the code changes.
        previous.entry = entry;
        kept.set(entry.task.name, previous);
        this.#tasks.delete(entry.task.name);
        continue;
      }
      const scheduled: Scheduled = {
        entry,
        key,
        next: nextRun(entry.task.schedule, new Date()),
        timer: null,
        running: false,
      };
      kept.set(entry.task.name, scheduled);
      started.push(scheduled);
    }
    // What is left was removed, or changed timing: it starts over.
    for (const old of this.#tasks.values()) {
      if (old.timer) clearTimeout(old.timer);
    }
    this.#tasks = kept;
    if (this.#context) {
      for (const scheduled of started) {
        this.#arm(scheduled);
        if (scheduled.entry.task.onStart) this.#run(scheduled, new Date());
      }
    }
  }

  start(context: () => Omit<TaskContext, 'now'> | null): void {
    if (this.#context) return;
    this.#context = context;
    const now = new Date();
    for (const scheduled of this.#tasks.values()) {
      scheduled.next = nextRun(scheduled.entry.task.schedule, now);
      this.#arm(scheduled);
      if (scheduled.entry.task.onStart) this.#run(scheduled, now);
    }
  }

  stop(): void {
    this.#context = null;
    for (const scheduled of this.#tasks.values()) {
      if (scheduled.timer) clearTimeout(scheduled.timer);
      scheduled.timer = null;
    }
  }

  /** Waits for the next time of a task, in steps a timer can hold. */
  #arm(scheduled: Scheduled): void {
    if (scheduled.timer) clearTimeout(scheduled.timer);
    const delay = scheduled.next.getTime() - Date.now();
    scheduled.timer = setTimeout(
      () => {
        if (!this.#context) return;
        if (Date.now() < scheduled.next.getTime()) return this.#arm(scheduled);
        const due = scheduled.next;
        scheduled.next = nextRun(scheduled.entry.task.schedule, due);
        this.#arm(scheduled);
        this.#run(scheduled, due);
      },
      Math.min(Math.max(delay, 0), MAX_DELAY)
    );
  }

  /** Runs a task once, unless it is still running from the last time. */
  #run(scheduled: Scheduled, now: Date): void {
    const { file, task } = scheduled.entry;
    if (scheduled.running) {
      this.#options.onWarning(
        file,
        `${task.name} was still running when its next time came (${describeSchedule(task.schedule)}): that run was skipped.`
      );
      return;
    }
    const context = this.#context?.();
    if (!context) {
      this.#options.onWarning(
        file,
        `${task.name} was due while the bot was not connected: that run was skipped.`
      );
      return;
    }
    scheduled.running = true;
    new Promise(resolve =>
      resolve(scheduled.entry.task.run(Object.freeze({ ...context, now })))
    )
      .catch((error: unknown) => this.#options.onError(file, error))
      .finally(() => {
        scheduled.running = false;
      });
  }
}
