// Whether a newer chapterjs is published, and the command that installs it:
// told where the developer starts their bot, so nobody has to watch npm.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Where the package is published. */
const NPM_REGISTRY = 'https://registry.npmjs.org';
/** Asked once a day: a version is not published more often. */
const CHECK_EVERY = 24 * 60 * 60 * 1000;
/** A registry that does not answer must never hold the bot. */
const DEFAULT_TIMEOUT = 5000;
export const CHANGELOG_URL = 'https://www.chapterjs.org/changelog';

export interface UpdateCheckOptions {
  /** The folder of the project. */
  cwd: string;
  /** The version of the framework that runs. */
  version: string;
  env: Record<string, string | undefined>;
  /** Only tests change these. */
  registryUrl?: string;
  timeout?: number;
  now?: () => number;
}

/** A version newer than the one that runs. */
export interface Update {
  current: string;
  latest: string;
  /** What to type to install it, with the package manager of the project. */
  command: string;
}

/** What the last check found, kept in `.chapterjs/cache/update.json`. */
interface UpdateCache {
  /** When the registry was asked, in ms since the epoch. */
  checked: number;
  latest: string;
}

const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** The lockfiles each package manager writes next to `package.json`. */
const LOCKFILES: Record<PackageManager, readonly string[]> = {
  pnpm: ['pnpm-lock.yaml'],
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
};

/** What installs the latest version with each package manager. */
const COMMANDS: Record<PackageManager, string> = {
  pnpm: 'pnpm update chapterjs --latest',
  npm: 'npm install chapterjs@latest',
  yarn: 'yarn add chapterjs@latest',
  bun: 'bun add chapterjs@latest',
};

/**
 * The command that updates `chapterjs` in a project: with the package
 * manager its lockfile belongs to, else the one that started the command
 * (`pnpm dev` sets `npm_config_user_agent`), else npm, which every
 * machine with Node has.
 */
export function updateCommand(
  cwd: string,
  env: Record<string, string | undefined>
): string {
  const fromLockfile = PACKAGE_MANAGERS.find(pm =>
    LOCKFILES[pm].some(name => existsSync(join(cwd, name)))
  );
  const agent = env.npm_config_user_agent?.split('/')[0];
  const fromAgent = PACKAGE_MANAGERS.find(pm => pm === agent);
  return COMMANDS[fromLockfile ?? fromAgent ?? 'npm'];
}

/** `1.2.3`, with or without a prerelease suffix, as numbers. */
function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * Whether `latest` is a newer version than `current`. Only the three
 * numbers count: `1.0.0-beta.2` and `1.0.0` are not told apart, so a
 * prerelease never says to install the final version it precedes.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}

/** The version the registry publishes as `latest`, or `null`. */
async function fetchLatest(
  registryUrl: string,
  timeout: number
): Promise<string | null> {
  try {
    const response = await fetch(`${registryUrl}/chapterjs/latest`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) return null;
    const { version } = (await response.json()) as { version?: unknown };
    return typeof version === 'string' && parseVersion(version)
      ? version
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether a newer `chapterjs` is published. The registry is asked at most
 * once a day (`.chapterjs/cache/update.json` keeps the answer), with a
 * short timeout, and never throws: without network, or when the registry
 * does not answer, there is nothing to say. Resolves with the update to
 * install, or `null` when the bot runs the latest version.
 */
export async function checkForUpdate(
  options: UpdateCheckOptions
): Promise<Update | null> {
  const { cwd, version, env } = options;
  const now = options.now ?? Date.now;
  const file = join(cwd, '.chapterjs', 'cache', 'update.json');
  const cached = await readFile(file, 'utf8')
    .then((text): UpdateCache | null => {
      const value = JSON.parse(text) as Partial<UpdateCache> | null;
      return value &&
        typeof value.checked === 'number' &&
        typeof value.latest === 'string'
        ? { checked: value.checked, latest: value.latest }
        : null;
    })
    .catch((): null => null);

  let latest: string | null;
  if (cached && now() - cached.checked < CHECK_EVERY) {
    latest = cached.latest;
  } else {
    latest = await fetchLatest(
      options.registryUrl ?? env.CHAPTERJS_REGISTRY_URL ?? NPM_REGISTRY,
      options.timeout ?? DEFAULT_TIMEOUT
    );
    if (latest) {
      // A folder or a disk that can't be written changes nothing: the
      // registry is asked again next time.
      await mkdir(dirname(file), { recursive: true })
        .then(() => writeFile(file, JSON.stringify({ checked: now(), latest })))
        .catch(() => {});
    } else {
      // Yesterday's answer is better than none.
      latest = cached?.latest ?? null;
    }
  }
  if (!latest || !isNewer(latest, version)) return null;
  return { current: version, latest, command: updateCommand(cwd, env) };
}

/** The line that tells the developer about an update. */
export function describeUpdate(update: Update): string {
  return `A new version of chapterjs is out: ${update.latest} (you have ${update.current}). To update, run:\n${update.command}\nWhat changed: ${CHANGELOG_URL}`;
}
