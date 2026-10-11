import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Builds the package before any test runs: end-to-end tests run `dist/`. */
export default function setup() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(
    fileURLToPath(new URL('../node_modules/.bin/tsc', import.meta.url)),
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
}
