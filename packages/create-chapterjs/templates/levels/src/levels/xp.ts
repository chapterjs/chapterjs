import { ranking } from 'chapterjs';

// The XP of each member, per server, always in order: `xp.top(10)` is the
// leaderboard, `xp.rankOf(id)` someone's place in it.
export const xp = ranking();

// Plain code, shared by the other files. Each level asks for 100 XP more
// than the one before: level 1 at 100 XP, level 2 at 300, level 3 at 600...

/** The XP a level starts at. */
export function xpForLevel(level: number): number {
  return (100 * level * (level + 1)) / 2;
}

/** The level of someone who has `points` XP. */
export function levelOf(points: number): number {
  return Math.floor((Math.sqrt(1 + (8 * points) / 100) - 1) / 2);
}

/** A bar of ten blocks, filled as far as the next level. */
export function progressBar(points: number): string {
  const level = levelOf(points);
  const start = xpForLevel(level);
  const filled = Math.floor(
    ((points - start) / (xpForLevel(level + 1) - start)) * 10
  );
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}
