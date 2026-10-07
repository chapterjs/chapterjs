// When a task runs: a plain duration (`'10m'`) or a cron expression, with
// a timezone. Written once, with no dependency: the next occurrence of a
// cron is found by reading the clock of the timezone through `Intl`.

const fail = (message: string): never => {
  throw new TypeError(message);
};

/** A duration: every so often. */
export interface EverySchedule {
  readonly kind: 'every';
  /** The text the file gave: `'10m'`. */
  readonly text: string;
  readonly ms: number;
}

/** A cron expression, in a timezone. */
export interface CronSchedule {
  readonly kind: 'cron';
  /** The text the file gave: `'0 9 * * 1-5'`. */
  readonly text: string;
  readonly timezone: string;
  /** For each field, the values that match. */
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly days: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly weekdays: ReadonlySet<number>;
  /** Whether the day of month was given (`*` in both day fields means every day). */
  readonly anyDay: boolean;
  readonly anyWeekday: boolean;
}

export type Schedule = EverySchedule | CronSchedule;

/** The shortest `every` accepted, in milliseconds. */
export const MIN_EVERY = 1000;

const UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses a duration: a number and a unit, `s`, `m`, `h` or `d`, like
 * `'30s'`, `'10m'`, `'2h'`, `'1d'`. Several parts add up: `'1h30m'`.
 */
export function parseEvery(text: unknown): EverySchedule {
  const example = `every: '10m' (a number and a unit: s, m, h or d, like '30s', '2h', '1d' or '1h30m')`;
  if (typeof text !== 'string' || text.trim() === '') {
    return fail(`"every" says how often the task runs: ${example}.`);
  }
  const parts = [
    ...text.replace(/\s+/g, '').matchAll(/(\d+(?:\.\d+)?)([smhd])/gi),
  ];
  const whole = parts.map(part => part[0]).join('');
  if (
    parts.length === 0 ||
    whole.toLowerCase() !== text.replace(/\s+/g, '').toLowerCase()
  ) {
    return fail(
      `"every" is ${JSON.stringify(text)}, which is not a duration: ${example}.`
    );
  }
  let ms = 0;
  for (const [, amount, unit] of parts) {
    ms += Number(amount) * UNITS[unit!.toLowerCase()]!;
  }
  if (ms < MIN_EVERY) {
    fail(
      `"every" is ${JSON.stringify(text)}: a task runs at most once per second.`
    );
  }
  return { kind: 'every', text, ms: Math.round(ms) };
}

const NAMES: Record<string, Record<string, number>> = {
  months: {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  },
  weekdays: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 },
};

/** The values one field of a cron matches. */
function parseField(
  text: string,
  field: 'minutes' | 'hours' | 'days' | 'months' | 'weekdays',
  low: number,
  high: number,
  expression: string
): Set<number> {
  const values = new Set<number>();
  const names = NAMES[field] ?? {};
  const read = (part: string): number => {
    const named = names[part.toLowerCase()];
    if (named !== undefined) return named;
    if (!/^\d+$/.test(part)) {
      return fail(
        `In cron ${JSON.stringify(expression)}, ${JSON.stringify(part)} is not a value for ${field}: use numbers from ${low} to ${high}${Object.keys(names).length ? `, or ${Object.keys(names).join(', ')}` : ''}.`
      );
    }
    const value = Number(part);
    if (value < low || value > high) {
      fail(
        `In cron ${JSON.stringify(expression)}, ${part} is out of range for ${field}: ${low} to ${high}.`
      );
    }
    return value;
  };
  for (const item of text.split(',')) {
    const [range = '', stepText] = item.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (stepText !== undefined && (!/^\d+$/.test(stepText) || step < 1)) {
      fail(
        `In cron ${JSON.stringify(expression)}, "/${stepText}" is not a step: write a number, like */15.`
      );
    }
    let from: number;
    let to: number;
    if (range === '*') {
      from = low;
      to = high;
    } else if (range.includes('-')) {
      const [a = '', b = ''] = range.split('-');
      from = read(a);
      to = read(b);
      if (from > to) {
        fail(
          `In cron ${JSON.stringify(expression)}, the range ${range} goes backwards.`
        );
      }
    } else {
      from = read(range);
      to = stepText === undefined ? from : high;
    }
    for (let value = from; value <= to; value += step) values.add(value);
  }
  // Sunday is 0 and 7.
  if (field === 'weekdays' && values.has(7)) {
    values.delete(7);
    values.add(0);
  }
  return values;
}

/** Whether a timezone exists, as `Intl` knows them. */
export function isTimezone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** The timezone of the machine. */
export const localTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Parses a cron expression: five fields, minute, hour, day of month,
 * month and day of week, with `*`, lists, ranges, steps and names.
 * @see https://en.wikipedia.org/wiki/Cron#Cron_expression
 */
export function parseCron(text: unknown, timezone: unknown): CronSchedule {
  const example = `cron: '0 9 * * 1-5' (minute, hour, day of month, month, day of week)`;
  if (typeof text !== 'string' || text.trim() === '') {
    return fail(`"cron" says when the task runs: ${example}.`);
  }
  const fields = text.trim().split(/\s+/);
  if (fields.length !== 5) {
    return fail(
      `"cron" is ${JSON.stringify(text)}, which has ${fields.length} fields: a cron has 5, ${example}.`
    );
  }
  if (
    timezone !== undefined &&
    (typeof timezone !== 'string' || !isTimezone(timezone))
  ) {
    fail(
      `"timezone" is ${JSON.stringify(timezone) ?? typeof timezone}, which is not a timezone. Write one like 'Europe/Paris' or 'America/New_York'; without it, the task follows the clock of the machine (${localTimezone()}).`
    );
  }
  const [minute, hour, day, month, weekday] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];
  const schedule: CronSchedule = {
    kind: 'cron',
    text: text.trim(),
    timezone: (timezone as string | undefined) ?? localTimezone(),
    minutes: parseField(minute, 'minutes', 0, 59, text),
    hours: parseField(hour, 'hours', 0, 23, text),
    days: parseField(day, 'days', 1, 31, text),
    months: parseField(month, 'months', 1, 12, text),
    weekdays: parseField(weekday, 'weekdays', 0, 7, text),
    anyDay: day === '*',
    anyWeekday: weekday === '*',
  };
  if (!nextCron(schedule, new Date())) {
    fail(
      `"cron" is ${JSON.stringify(text)}, which never happens: no day of the next 5 years matches it.`
    );
  }
  return schedule;
}

interface Clock {
  minute: number;
  hour: number;
  day: number;
  month: number;
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = NAMES.weekdays!;

/** What the clock of a timezone shows at a moment. */
function clockOf(date: Date, timezone: string): Clock {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatters.set(timezone, formatter);
  }
  const clock = { minute: 0, hour: 0, day: 0, month: 0, weekday: 0 };
  for (const part of formatter.formatToParts(date)) {
    if (part.type === 'weekday')
      clock.weekday = WEEKDAYS[part.value.toLowerCase()]!;
    else if (part.type in clock)
      clock[part.type as keyof Clock] = Number(part.value);
  }
  return clock;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const FIVE_YEARS = 5 * 366 * 86_400_000;

/**
 * The next moment a cron matches, strictly after `from`; `null` when none
 * comes in the next five years. Walks the clock of the timezone: minute
 * by minute within a matching hour, hour by hour otherwise, so a change
 * of daylight saving time is read, not computed.
 */
export function nextCron(schedule: CronSchedule, from: Date): Date | null {
  // Day of month and day of week: either when both are given (as cron does).
  const dayMatches = (clock: Clock): boolean => {
    const byDay = schedule.days.has(clock.day);
    const byWeekday = schedule.weekdays.has(clock.weekday);
    if (schedule.anyDay && schedule.anyWeekday) return true;
    if (schedule.anyDay) return byWeekday;
    if (schedule.anyWeekday) return byDay;
    return byDay || byWeekday;
  };
  // When clocks go back, a time of the day comes twice: a task that ran
  // at the first one does not run again at the second.
  const last = clockOf(from, schedule.timezone);
  const sameTime = (clock: Clock): boolean =>
    clock.month === last.month &&
    clock.day === last.day &&
    clock.hour === last.hour &&
    clock.minute === last.minute;
  let at = Math.floor(from.getTime() / MINUTE) * MINUTE + MINUTE;
  const limit = from.getTime() + FIVE_YEARS;
  while (at <= limit) {
    const clock = clockOf(new Date(at), schedule.timezone);
    if (!schedule.months.has(clock.month) || !dayMatches(clock)) {
      // Not today: to the next hour, then look again.
      at += HOUR - clock.minute * MINUTE;
    } else if (!schedule.hours.has(clock.hour)) {
      at += HOUR - clock.minute * MINUTE;
    } else if (!schedule.minutes.has(clock.minute) || sameTime(clock)) {
      at += MINUTE;
    } else {
      return new Date(at);
    }
  }
  return null;
}

/** The next time a schedule is due, strictly after `from`. */
export function nextRun(schedule: Schedule, from: Date): Date {
  if (schedule.kind === 'every') return new Date(from.getTime() + schedule.ms);
  const next = nextCron(schedule, from);
  if (!next) {
    throw new Error(
      `The cron ${JSON.stringify(schedule.text)} never happens again.`
    );
  }
  return next;
}

/** What tells one schedule from another: the same key is the same timing. */
export const scheduleKey = (schedule: Schedule): string =>
  schedule.kind === 'every'
    ? `every ${schedule.ms}`
    : `cron ${schedule.text} ${schedule.timezone}`;

/** The schedule in words, for the developer. */
export const describeSchedule = (schedule: Schedule): string =>
  schedule.kind === 'every'
    ? `every ${schedule.text}`
    : `at "${schedule.text}" (${schedule.timezone})`;
