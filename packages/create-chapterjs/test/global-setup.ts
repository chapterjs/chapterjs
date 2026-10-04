import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Builds create-chapter, then this package, before any test runs: the alias
 * test runs both from `dist/`.
 */
export default function setup() {
  for (const pkg of ['../../create-chapter/', '../']) {
    const root = new URL(pkg, import.meta.url);
    execFileSync(fileURLToPath(new URL('node_modules/.bin/tsc', root)), {
      cwd: fileURLToPath(root),
      stdio: 'inherit',
    });
  }
}
