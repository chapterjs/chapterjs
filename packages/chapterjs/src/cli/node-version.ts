/** The oldest Node.js ChapterJS runs on, as `engines` says in package.json. */
export const MINIMUM_NODE = 24;

/**
 * What to tell the developer when this Node.js is older than ChapterJS
 * needs, or `null` when it is recent enough. `engines` is only a warning
 * when installing, which npm does not even show: this is what refuses.
 */
export function nodeTooOld(version = process.versions.node): string | null {
  const major = Number(version.split('.')[0]);
  if (major >= MINIMUM_NODE) return null;
  return `ChapterJS needs Node.js ${MINIMUM_NODE} or newer, and this is Node.js ${version}. Install the LTS version from https://nodejs.org, then run the command again.`;
}
