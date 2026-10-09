import type { GuildMember } from 'chapterjs';

// Shared code: this file declares nothing, the commands import it. Nothing
// survives a restart: a real bot keeps its warnings in a database.
export function canPunish(by: GuildMember, target: GuildMember): boolean {
  return by.highestRole.position > target.highestRole.position;
}

const warnings = new Map<string, number>();

export function addWarning(userId: string): number {
  const count = (warnings.get(userId) ?? 0) + 1;
  warnings.set(userId, count);
  return count;
}

export function warningsOf(userId: string): number {
  return warnings.get(userId) ?? 0;
}
