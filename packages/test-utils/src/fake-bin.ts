import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './temp.js';

/**
 * A folder of fake commands, to use as the only entry of `PATH`: the code under
 * test then sees exactly these commands, whatever is installed on the machine.
 * Each value is the body of a `/bin/sh` script. Scripts only get this folder in
 * their `PATH`, so they should stick to shell builtins (`echo`, `read`, `case`,
 * `[ ]`…) or absolute paths.
 */
export function fakeBin(commands: Record<string, string>): string {
  const dir = tempDir('chapterjs-bin-');
  for (const [name, body] of Object.entries(commands)) {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  }
  return dir;
}
