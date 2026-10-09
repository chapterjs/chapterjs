// Tasks: what the bot does by itself, every so often or at given times.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { taskDeclaration } from '../src/tasks/declaration.js';
import {
  describeSchedule,
  nextCron,
  nextRun,
  parseCron,
  parseEvery,
  scheduleKey,
} from '../src/tasks/schedule.js';
import { TimerScheduler } from '../src/tasks/scheduler.js';
import { task } from '../src/tasks/task.js';
import {
  connected,
  project,
  runDev,
  runStart,
  shardOf,
  site,
  world,
} from './dev-helpers.js';

describe('every', () => {
  it.each([
    ['1s', 1000],
    ['30s', 30_000],
    ['10m', 600_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
    ['1h30m', 5_400_000],
    ['1H 30M', 5_400_000],
    ['1.5h', 5_400_000],
  ])('reads %s', (text, ms) => {
    expect(parseEvery(text)).toEqual({ kind: 'every', text, ms });
  });

  it.each([
    [
      undefined,
      "\"every\" says how often the task runs: every: '10m' (a number and a unit: s, m, h or d, like '30s', '2h', '1d' or '1h30m').",
    ],
    ['', '"every" says how often the task runs'],
    ['10', '"every" is "10", which is not a duration'],
    ['10 minutes', '"every" is "10 minutes", which is not a duration'],
    ['m10', '"every" is "m10", which is not a duration'],
    ['500ms', '"every" is "500ms", which is not a duration'],
    ['0.5s', '"every" is "0.5s": a task runs at most once per second.'],
    ['0m', '"every" is "0m": a task runs at most once per second.'],
    [10, '"every" says how often the task runs'],
  ])('refuses %j', (text, message) => {
    expect(() => parseEvery(text)).toThrow(message);
  });
});

describe('cron', () => {
  const at = (text: string) => new Date(text);
  const next = (cron: string, from: string, timezone = 'UTC') =>
    nextCron(parseCron(cron, timezone), at(from))?.toISOString();

  it.each([
    ['* * * * *', '2026-10-06T10:15:30Z', '2026-10-06T10:16:00.000Z'],
    ['0 9 * * *', '2026-10-06T10:15:00Z', '2026-10-07T09:00:00.000Z'],
    ['0 9 * * *', '2026-10-06T08:59:59Z', '2026-10-06T09:00:00.000Z'],
    ['0 9 * * *', '2026-10-06T09:00:00Z', '2026-10-07T09:00:00.000Z'],
    ['*/15 * * * *', '2026-10-06T10:16:00Z', '2026-10-06T10:30:00.000Z'],
    ['0 9 * * 1-5', '2026-10-09T10:00:00Z', '2026-10-12T09:00:00.000Z'], // Friday to Monday
    ['0 9 * * mon,wed', '2026-10-06T10:00:00Z', '2026-10-07T09:00:00.000Z'],
    ['0 9 * * sun', '2026-10-06T10:00:00Z', '2026-10-11T09:00:00.000Z'],
    ['0 9 * * 7', '2026-10-06T10:00:00Z', '2026-10-11T09:00:00.000Z'],
    ['30 8 1 * *', '2026-10-06T10:00:00Z', '2026-11-01T08:30:00.000Z'],
    ['0 0 1 jan *', '2026-10-06T10:00:00Z', '2027-01-01T00:00:00.000Z'],
    ['0 0 29 2 *', '2026-10-06T10:00:00Z', '2028-02-29T00:00:00.000Z'],
    ['0 12 1-7 * 1', '2026-10-06T13:00:00Z', '2026-10-07T12:00:00.000Z'], // 1st to 7th, or Mondays
    ['0 12 15 * 1', '2026-10-06T13:00:00Z', '2026-10-12T12:00:00.000Z'],
    ['5,35 */6 * * *', '2026-10-06T06:35:00Z', '2026-10-06T12:05:00.000Z'],
    ['0 0 * * *', '2026-12-31T23:59:00Z', '2027-01-01T00:00:00.000Z'],
  ])('%s after %s is %s (UTC)', (cron, from, expected) => {
    expect(next(cron, from)).toBe(expected);
  });

  it('follows the clock of the timezone, daylight saving time included', () => {
    // 9:00 in Paris is 7:00 UTC in summer, 8:00 UTC in winter.
    expect(next('0 9 * * *', '2026-07-01T10:00:00Z', 'Europe/Paris')).toBe(
      '2026-07-02T07:00:00.000Z'
    );
    expect(next('0 9 * * *', '2026-12-01T10:00:00Z', 'Europe/Paris')).toBe(
      '2026-12-02T08:00:00.000Z'
    );
    // On March 29, 2026, 2:00 becomes 3:00 in Paris: 2:30 does not exist.
    expect(next('30 2 * * *', '2026-03-28T10:00:00Z', 'Europe/Paris')).toBe(
      '2026-03-30T00:30:00.000Z'
    );
    expect(next('0 3 * * *', '2026-03-28T10:00:00Z', 'Europe/Paris')).toBe(
      '2026-03-29T01:00:00.000Z'
    );
    // On October 25, 2026, 3:00 becomes 2:00 again: 2:30 happens once.
    expect(next('30 2 * * *', '2026-10-24T10:00:00Z', 'Europe/Paris')).toBe(
      '2026-10-25T00:30:00.000Z'
    );
    expect(next('30 2 * * *', '2026-10-25T00:30:00Z', 'Europe/Paris')).toBe(
      '2026-10-26T01:30:00.000Z'
    );
    // Days change at the midnight of the timezone.
    expect(
      next('0 0 * * mon', '2026-10-11T22:30:00Z', 'Pacific/Auckland')
    ).toBe('2026-10-18T11:00:00.000Z');
    expect(
      next('0 0 * * mon', '2026-10-11T10:30:00Z', 'Pacific/Auckland')
    ).toBe('2026-10-11T11:00:00.000Z');
  });

  it.each([
    [
      undefined,
      undefined,
      '"cron" says when the task runs: cron: \'0 9 * * 1-5\' (minute, hour, day of month, month, day of week).',
    ],
    [
      '0 9 * *',
      undefined,
      '"cron" is "0 9 * *", which has 4 fields: a cron has 5',
    ],
    ['0 9 * * * *', undefined, 'which has 6 fields'],
    [
      '60 * * * *',
      undefined,
      'In cron "60 * * * *", 60 is out of range for minutes: 0 to 59.',
    ],
    [
      '* 24 * * *',
      undefined,
      'In cron "* 24 * * *", 24 is out of range for hours: 0 to 23.',
    ],
    ['* * 0 * *', undefined, '0 is out of range for days: 1 to 31.'],
    ['* * * 13 *', undefined, '13 is out of range for months: 1 to 12.'],
    ['* * * * 8', undefined, '8 is out of range for weekdays: 0 to 7.'],
    [
      '* * * * monday',
      undefined,
      'In cron "* * * * monday", "monday" is not a value for weekdays: use numbers from 0 to 7, or sun, mon, tue, wed, thu, fri, sat.',
    ],
    [
      'a * * * *',
      undefined,
      'In cron "a * * * *", "a" is not a value for minutes: use numbers from 0 to 59.',
    ],
    [
      '5-1 * * * *',
      undefined,
      'In cron "5-1 * * * *", the range 5-1 goes backwards.',
    ],
    [
      '*/x * * * *',
      undefined,
      'In cron "*/x * * * *", "/x" is not a step: write a number, like */15.',
    ],
    ['*/0 * * * *', undefined, '"/0" is not a step'],
    [
      '0 0 31 2 *',
      undefined,
      '"cron" is "0 0 31 2 *", which never happens: no day of the next 5 years matches it.',
    ],
    [
      '0 9 * * *',
      'Paris',
      '"timezone" is "Paris", which is not a timezone. Write one like \'Europe/Paris\' or \'America/New_York\'; without it, the task follows the clock of the machine',
    ],
    ['0 9 * * *', 3, '"timezone" is 3, which is not a timezone.'],
  ])('refuses %j %j', (cron, timezone, message) => {
    expect(() => parseCron(cron, timezone)).toThrow(message);
  });

  it('is described, and told apart by its text and timezone', () => {
    const paris = parseCron('0 9 * * *', 'Europe/Paris');
    expect(describeSchedule(paris)).toBe('at "0 9 * * *" (Europe/Paris)');
    expect(scheduleKey(paris)).toBe('cron 0 9 * * * Europe/Paris');
    expect(scheduleKey(parseCron(' 0 9 * * * ', 'Europe/Paris'))).toBe(
      scheduleKey(paris)
    );
    expect(scheduleKey(parseCron('0 9 * * *', 'UTC'))).not.toBe(
      scheduleKey(paris)
    );
    expect(describeSchedule(parseEvery('10m'))).toBe('every 10m');
    expect(scheduleKey(parseEvery('10m'))).toBe(
      scheduleKey(parseEvery('600s'))
    );
    expect(parseCron('0 9 * * *', undefined).timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    expect(nextRun(parseEvery('1s'), new Date(1000)).getTime()).toBe(2000);
  });
});

describe('task()', () => {
  const load = (path: string, exports: Record<string, unknown>) =>
    taskDeclaration.read(exports.default, site(`src/tasks/${path}`));

  it('is recognised among the exports of a file, one per export', () => {
    expect(taskDeclaration.is(task({ every: '1m', run() {} }))).toBe(true);
    expect(taskDeclaration.is({ every: '1m', run() {} })).toBe(false);
    // A list has no name to give each task.
    expect(taskDeclaration.list).toBe(false);
  });

  it.each([
    [
      { default: task('x' as never) },
      "task() needs an object: task({ every: '10m', run() { ... } })",
    ],
    [
      { default: task({ every: '1m', cron: '* * * * *', run() {} } as never) },
      'This task has both "every" and "cron": keep one. "every" is an interval (\'10m\'), "cron" a time (\'0 9 * * *\').',
    ],
    [
      { default: task({ run() {} } as never) },
      "This task does not say when it runs: add every: '10m' (an interval) or cron: '0 9 * * *' (a time).",
    ],
    [
      { default: task({ every: '1m', timezone: 'UTC', run() {} } as never) },
      '"timezone" only goes with "cron": an interval is the same in every timezone.',
    ],
    [
      { default: task({ every: '1m', onStart: 'yes', run() {} } as never) },
      '"onStart" is true or false, got "yes".',
    ],
    [
      { default: task({ every: '1m' } as never) },
      'This task has no "run": the function to run each time, like async run({ guilds }) { ... }',
    ],
    [
      { default: task({ every: '1m', at: 'noon', run() {} } as never) },
      '"at" is not something a task has. It can have: every, cron, timezone, onStart, run.',
    ],
    [
      { default: task({ every: 'soon', run() {} }) },
      '"every" is "soon", which is not a duration',
    ],
    [
      { default: task({ cron: 'daily', run() {} }) },
      '"cron" is "daily", which has 1 fields',
    ],
  ])('refuse a wrong task (%#)', (exports, message) => {
    expect(() => load('report.ts', exports)).toThrow(message);
  });

  it('reads a task, named after its export (or its file for a default export)', () => {
    const run = () => {};
    expect(
      load('daily/report.ts', {
        default: task({
          cron: '0 9 * * *',
          timezone: 'UTC',
          onStart: true,
          run,
        }),
      })
    ).toMatchObject({
      name: 'report',
      schedule: { kind: 'cron', text: '0 9 * * *', timezone: 'UTC' },
      onStart: true,
      run,
    });
    expect(
      taskDeclaration.read(
        task({ every: '1h', run }),
        site('src/cleanup.ts', 'oldMessages')
      )
    ).toEqual({
      name: 'oldMessages',
      schedule: { kind: 'every', text: '1h', ms: 3_600_000 },
      onStart: false,
      run,
    });
  });
});

describe('the scheduler', () => {
  afterEach(() => vi.useRealTimers());

  const entry = (file: string, config: Parameters<typeof task>[0]) => ({
    ...site(file),
    task: taskDeclaration.read(task(config), site(file)),
  });

  it('runs tasks when they are due, with the bot of the moment', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-06T10:00:00Z') });
    const errors: unknown[] = [];
    const warnings: string[] = [];
    const scheduler = new TimerScheduler({
      onError: (file, error) => errors.push([file, error]),
      onWarning: (file, message) => warnings.push(`${file} ${message}`),
    });
    const runs: string[] = [];
    const nine = entry('src/tasks/nine.ts', {
      cron: '0 9 * * *',
      timezone: 'UTC',
      run: ({ now }) => runs.push(`nine ${now.toISOString()}`),
    });
    scheduler.set([
      entry('src/tasks/tick.ts', {
        every: '1s',
        run: ({ now, user }) => runs.push(`tick ${now.toISOString()} ${user}`),
      }),
      entry('src/tasks/first.ts', {
        every: '1d',
        onStart: true,
        run: ({ now }) => runs.push(`first ${now.toISOString()}`),
      }),
      nine,
    ]);
    // Nothing runs before the scheduler starts.
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toEqual([]);

    let bot: { user: string; guilds: Map<string, never> } | null = {
      user: 'bot',
      guilds: new Map<string, never>(),
    };
    scheduler.start(() => bot as never);
    expect(runs).toEqual(['first 2026-10-06T10:00:05.000Z']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toEqual([
      'first 2026-10-06T10:00:05.000Z',
      'tick 2026-10-06T10:00:06.000Z bot',
      'tick 2026-10-06T10:00:07.000Z bot',
    ]);

    // While the bot reconnects, a run is skipped and said.
    bot = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(warnings).toEqual([
      'src/tasks/tick.ts tick was due while the bot was not connected: that run was skipped.',
    ]);
    bot = { user: 'bot', guilds: new Map<string, never>() };

    // The cron runs at 9:00 the next day, and the days after. Only the cron is
    // kept from here: a task every second would fire 170,000 fake timers.
    scheduler.set([nine]);
    runs.length = 0;
    await vi.advanceTimersByTimeAsync(23 * 3_600_000);
    expect(runs.filter(run => run.startsWith('nine'))).toEqual([
      'nine 2026-10-07T09:00:00.000Z',
    ]);
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(runs.filter(run => run.startsWith('nine'))).toEqual([
      'nine 2026-10-07T09:00:00.000Z',
      'nine 2026-10-08T09:00:00.000Z',
    ]);

    scheduler.stop();
    runs.length = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('keeps the next time of a task whose timing did not change, and reports errors', async () => {
    vi.useFakeTimers({ now: 0 });
    const errors: [string, unknown][] = [];
    const warnings: string[] = [];
    const scheduler = new TimerScheduler({
      onError: (file, error) => errors.push([file, error]),
      onWarning: (file, message) => warnings.push(message),
    });
    const runs: string[] = [];
    scheduler.set([
      entry('src/tasks/slow.ts', { every: '10s', run: () => runs.push('v1') }),
    ]);
    scheduler.start(() => ({ user: 'bot', guilds: new Map() }) as never);
    await vi.advanceTimersByTimeAsync(7000);
    // Reloaded with the same timing: due in 3 s, not in 10.
    scheduler.set([
      entry('src/tasks/slow.ts', { every: '10s', run: () => runs.push('v2') }),
      entry('src/tasks/fresh.ts', {
        every: '1m',
        onStart: true,
        run: () => {
          throw new Error('boom');
        },
      }),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual([['src/tasks/fresh.ts', new Error('boom')]]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toEqual(['v2']);
    // Reloaded with another timing: counted from now.
    scheduler.set([
      entry('src/tasks/slow.ts', { every: '5s', run: () => runs.push('v3') }),
    ]);
    await vi.advanceTimersByTimeAsync(4999);
    expect(runs).toEqual(['v2']);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual(['v2', 'v3']);
    // Removed: never again.
    scheduler.set([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runs).toEqual(['v2', 'v3']);
    expect(warnings).toEqual([]);
  });

  it('skips a run while the previous one is still going, and says so', async () => {
    vi.useFakeTimers({ now: 0 });
    const warnings: string[] = [];
    const scheduler = new TimerScheduler({
      onError: () => {},
      onWarning: (file, message) => warnings.push(`${file} ${message}`),
    });
    let release!: () => void;
    const runs: number[] = [];
    scheduler.set([
      entry('src/tasks/long.ts', {
        every: '1s',
        run: ({ now }) => {
          runs.push(now.getTime());
          return new Promise<void>(resolve => (release = resolve));
        },
      }),
    ]);
    scheduler.start(() => ({ user: 'bot', guilds: new Map() }) as never);
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toEqual([1000]);
    expect(warnings).toEqual([
      'src/tasks/long.ts long was still running when its next time came (every 1s): that run was skipped.',
      'src/tasks/long.ts long was still running when its next time came (every 1s): that run was skipped.',
    ]);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toEqual([1000, 4000]);
    scheduler.stop();
  });
});

describe.skipIf(process.platform === 'win32')('tasks', () => {
  it('run in dev once the bot is connected, keep their time through a reload, and report errors', async () => {
    const fake = await world();
    const cwd = project({
      'src/tasks/tick.ts': `import { task } from 'chapterjs';
export default task({
  every: '1s',
  onStart: true,
  run({ user, guilds, now }) {
    console.log('tick v1', user.username, guilds.size, now instanceof Date);
  },
});
`,
      'src/tasks/boom.ts': `import { task } from 'chapterjs';
export default task({
  every: '1s',
  onStart: true,
  run() {
    throw new Error('kaboom');
  },
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 2 tasks loaded');
    await cli.waitFor('tick v1 test-bot 1 true');
    await cli.waitFor('✗ src/tasks/boom.ts:6 kaboom');
    await cli.waitFor('tick v1 test-bot 1 true');
    await connected(fake);

    writeFileSync(
      join(cwd, 'src/tasks/tick.ts'),
      `import { task } from 'chapterjs';
export default task({
  every: '1s',
  onStart: true,
  run() {
    console.log('tick v2');
  },
});
`
    );
    await cli.waitFor('↻ Reloaded in');
    // Same timing: no extra run on start, the next one is the new code.
    const before = cli.output.match(/tick v2/g)?.length ?? 0;
    expect(before).toBe(0);
    await cli.waitFor('tick v2');
    cli.signal('SIGTERM');
    await cli.exited;
  });

  it('run in one process only when the bot is split', async () => {
    const servers = ['A', 'B', 'C', 'D'].map((name, index) => {
      let id = 100000000000001000n;
      while (shardOf(String(id), 4) !== index) id += 1n << 22n;
      return { id: String(id), name };
    });
    const fake = await world({
      shards: 4,
      maxConcurrency: 16,
      guilds: servers,
    });
    const cli = runStart(
      project(
        {
          'src/tasks/who.ts': `import { task } from 'chapterjs';
export default task({ every: '1s', onStart: true, run({ guilds }) { console.log('task sees', guilds.size, 'servers'); } });
`,
        },
        'BOT_TOKEN=test-token\n'
      ),
      fake,
      ['--processes', '2']
    );
    await cli.waitFor(
      '✓ Online as test-bot in 5 servers (4 shards, 2 processes)'
    );
    await cli.waitFor(/\[1\] task sees \d servers/);
    await cli.waitFor(/\[1\] task sees \d servers/);
    expect(cli.output).not.toContain('[2] task sees');
    cli.signal('SIGTERM');
    await cli.exited;
  });
});
