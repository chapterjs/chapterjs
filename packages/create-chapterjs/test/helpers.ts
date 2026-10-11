import { fakeBin, startCli } from '@chapterjs/test-utils';
import { fileURLToPath } from 'node:url';
import type { PackageManager } from '../src/package-manager.js';

export const bin = fileURLToPath(new URL('../dist/index.js', import.meta.url));

export interface FakeManager {
  version: string;
  /** When set, `install` prints this and fails. */
  failInstall?: string;
}

/**
 * Fake package managers, as they behave for the scaffolder:
 * - `--version` prints the version, except in a folder whose package.json has
 *   a `packageManager` field, where it fails like corepack does;
 * - `install` writes `.installed-by` (the manager's name) in the current
 *   folder, or fails with `failInstall`.
 * Returns the folder to use as `PATH`: managers left out are "not installed".
 */
export function fakePackageManagers(
  managers: Partial<Record<PackageManager, FakeManager>>
): string {
  return fakeBin(
    Object.fromEntries(
      Object.entries(managers).map(([name, { version, failInstall }]) => [
        name,
        `
case "$1" in
  --version)
    if [ -f package.json ]; then
      # The second test also reads a last line without a final newline.
      while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in *packageManager*) echo "corepack refused" >&2; exit 1;; esac
      done < package.json
    fi
    echo "${version}"
    ;;
  install)
    ${failInstall === undefined ? '' : `echo "${failInstall}" >&2; exit 1`}
    echo "${name}" > .installed-by
    echo "installed with ${name}"
    ;;
  *) exit 2;;
esac`,
      ])
    )
  );
}

export interface RunOptions {
  cwd: string;
  args?: string[];
  /** The `PATH` of the CLI, usually from `fakePackageManagers`. */
  path: string;
  /** e.g. `pnpm/10.0.0 npm/? node/v24.0.0`, as set by `pnpm create`. */
  userAgent?: string;
}

const TEMPLATE_QUESTION = 'Which template do you want to start from?';

/** Starts the built `create-chapterjs` CLI. */
export function runCreate({ cwd, args, path, userAgent }: RunOptions) {
  const cli = startCli({
    bin,
    args,
    cwd,
    env: {
      PATH: path,
      ...(userAgent === undefined ? {} : { npm_config_user_agent: userAgent }),
    },
  });
  // The preselected template is accepted if the question shows up, so tests
  // don't depend on how many templates exist.
  const watching = setInterval(() => {
    if (cli.output.includes(TEMPLATE_QUESTION)) {
      clearInterval(watching);
      cli.press('enter');
    }
  }, 10);
  void cli.exited.catch(() => {}).finally(() => clearInterval(watching));
  return cli;
}
