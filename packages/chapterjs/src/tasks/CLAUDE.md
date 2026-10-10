# `tasks/`: what the bot does by itself

`export const report = task({ every: '10m' | cron: '0 9 * * 1-5', timezone?, onStart?, run })`, from any file of `src/`. The name of the export is the name of the task (a default export takes the name of its file; two tasks with the same name are reported, the later one left out; a list is refused). `task()` is typed the same everywhere, so it is a normal export of `index.ts`. A task receives `t` in the default language (see `src/messages/CLAUDE.md`).

## `schedule.ts`: the core, with no dependency

- `parseEvery()`: a number and a unit `s`/`m`/`h`/`d`, parts add up, 1 s at least (the parser is `util/duration.ts`, shared with the `cooldown` of commands).
- `parseCron()`: 5 fields, `*`, lists, ranges, steps, names; the timezone checked with `Intl`, the machine's by default; a cron that never happens in 5 years is refused at load.
- `nextCron()`: walks the clock of the timezone through `Intl.DateTimeFormat`, hour by hour on days that do not match and minute by minute otherwise, so DST is read, not computed: a time that does not exist is skipped, a time that comes twice runs once.
- `nextRun()`, `scheduleKey()` (what tells one timing from another), `describeSchedule()`.

## `scheduler.ts`

- The `Scheduler` interface (`set`, `start(context)`, `stop`) and `TimerScheduler`, its default on Node timers (chained for waits over 24 days). Another implementation (shared between machines) plugs in here, with no change to the files.
- `set()` keeps the next time of a task whose key did not change and only swaps its `run` (a save in dev does not reset an hourly task), counts a new or changed one from now, and runs `onStart` tasks added while started.
- A run still going when the next time comes is skipped with a `⚠`; so is one due while `context()` has no bot (reconnecting). An error is reported with its file and line and the task goes on.

## `declaration.ts` and the wiring

- The `Declaration` of tasks: `read` refuses both or neither of `every`/`cron`, `timezone` without `cron`, and checks the rest → `LoadedTask`, keyed by name in the scheduler.
- `cli/project.ts` loads it with the others, feeds the scheduler on every load, counts it in `summary`, and exposes `startTasks(current)` / `stopTasks()`: `dev` starts them after `ready` with the bot of the moment (they follow reconnections); `start` starts them in `runAlone`, and in a cluster only in the process whose `assignment.index` is 0, so a task runs once for the whole bot.
