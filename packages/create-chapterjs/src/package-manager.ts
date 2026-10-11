import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

/** In menu order: pnpm, the one ChapterJS itself uses, comes first. */
export const packageManagers = ['pnpm', 'npm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof packageManagers)[number];

/**
 * The package manager that launched `create chapterjs`, read from the user agent
 * it sets (e.g. `pnpm/11.0.0 npm/? node/v24.0.0 darwin arm64`).
 */
export function detectPackageManager(): PackageManager {
  const name = process.env.npm_config_user_agent?.split('/')[0];
  return packageManagers.find(pm => pm === name) ?? 'pnpm';
}

/**
 * The installed version of each package manager, or `undefined` when it isn't
 * installed. All are checked at once, so this takes as long as the slowest one.
 */
export async function installedVersions(): Promise<
  Record<PackageManager, string | undefined>
> {
  const versions = await Promise.all(
    packageManagers.map(
      pm =>
        new Promise<string | undefined>(resolve => {
          let output = '';
          const child = spawn(pm, ['--version'], {
            // Outside the current folder: a `packageManager` field in a parent
            // package.json makes corepack refuse to run any other manager.
            cwd: tmpdir(),
            // Corepack must never stop to ask before downloading a manager.
            env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
            shell: process.platform === 'win32',
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          child.stdout.on('data', (chunk: Buffer) => (output += chunk));
          child.on('error', () => resolve(undefined));
          child.on('close', code =>
            resolve(code === 0 ? output.trim() || undefined : undefined)
          );
        })
    )
  );
  return Object.fromEntries(
    packageManagers.map((pm, i) => [pm, versions[i]])
  ) as Record<PackageManager, string | undefined>;
}

/** The command that runs a package.json script, e.g. `pnpm dev` or `npm run dev`. */
export function runScript(pm: PackageManager, script: string): string {
  return pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`;
}

export interface InstallResult {
  ok: boolean;
  /** Everything the package manager printed, shown when the install fails. */
  output: string;
}

/** Runs `<pm> install` in `cwd`, capturing the output instead of printing it. */
export function install(
  pm: PackageManager,
  cwd: string
): Promise<InstallResult> {
  return new Promise(resolve => {
    let output = '';
    const child = spawn(pm, ['install'], {
      cwd,
      // Package managers are `.cmd` shims on Windows, which only a shell can run.
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => (output += chunk));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk));
    child.on('error', (error: NodeJS.ErrnoException) => {
      const reason =
        error.code === 'ENOENT'
          ? `${pm} is not installed on this computer.`
          : error.message;
      resolve({ ok: false, output: reason });
    });
    child.on('close', code =>
      resolve({ ok: code === 0, output: output.trim() })
    );
  });
}
