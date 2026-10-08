/** The oldest Node.js a ChapterJS bot runs on, as `engines` says. */
export const MINIMUM_NODE = 24;

/**
 * What to tell the person when this Node.js is older than ChapterJS needs,
 * or `null` when it is recent enough: refused before creating anything,
 * since the bot could not run.
 */
export function nodeTooOld(version = process.versions.node): string | null {
  const major = Number(version.split('.')[0]);
  if (major >= MINIMUM_NODE) return null;
  return `ChapterJS needs Node.js ${MINIMUM_NODE} or newer, and this is Node.js ${version}. Install the LTS version from https://nodejs.org, then run the command again.`;
}
