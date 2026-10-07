// A duration written by a user: `'30s'`, `'10m'`, `'1h30m'`. Read once here
// for every feature that takes one (the `every` of a task, the `cooldown`
// of a command); each feature gives its own message when it is not one.

/** How a duration is written, for a message that says what to write. */
export const DURATION_EXAMPLE =
  "a number and a unit: s, m, h or d, like '30s', '2h', '1d' or '1h30m'";

const UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * The milliseconds of a duration: a number and a unit, `s`, `m`, `h` or
 * `d`. Several parts add up (`'1h30m'`), spaces and case do not matter.
 * `null` when the text is not a duration.
 */
export function parseDuration(text: string): number | null {
  const compact = text.replace(/\s+/g, '');
  const parts = [...compact.matchAll(/(\d+(?:\.\d+)?)([smhd])/gi)];
  const whole = parts.map(part => part[0]).join('');
  if (parts.length === 0 || whole.toLowerCase() !== compact.toLowerCase()) {
    return null;
  }
  let ms = 0;
  for (const [, amount, unit] of parts) {
    ms += Number(amount) * UNITS[unit!.toLowerCase()]!;
  }
  return Math.round(ms);
}
