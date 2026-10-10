import { startCli, tempDir } from '@chapterjs/test-utils';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** A script run as a CLI, to see how `startCli` reports its end. */
function script(body: string): string {
  const file = join(tempDir(), 'cli.mjs');
  writeFileSync(file, body);
  return file;
}

describe('startCli says why a CLI printed nothing', () => {
  it('names a process that could not be started', async () => {
    const cli = startCli({
      bin: script(''),
      cwd: join(tempDir(), 'gone'),
      env: {},
    });
    await expect(cli.waitFor('anything')).rejects.toThrow(
      /exited before printing "anything"\. The process could not be started: .*ENOENT/
    );
    await expect(cli.exited).rejects.toThrow(/could not be started/);
  });

  it('names the exit code', async () => {
    const cli = startCli({
      bin: script('process.exit(3);'),
      cwd: tempDir(),
      env: {},
    });
    await expect(cli.waitFor('anything')).rejects.toThrow(
      'The CLI exited before printing "anything". The process exited with code 3. Output:'
    );
    expect(await cli.exited).toEqual({ code: 3, output: '' });
  });

  it('names the signal that killed it', async () => {
    const cli = startCli({
      bin: script('process.kill(process.pid, "SIGKILL");'),
      cwd: tempDir(),
      env: {},
    });
    await expect(cli.waitFor('anything')).rejects.toThrow(
      'The CLI exited before printing "anything". The process was killed by SIGKILL. Output:'
    );
  });

  it('still shows what was printed', async () => {
    const cli = startCli({
      bin: script('console.log("hello"); process.exit(0);'),
      cwd: tempDir(),
      env: {},
    });
    await cli.waitFor('hello');
    await expect(cli.waitFor('bye')).rejects.toThrow(
      'The CLI exited before printing "bye". The process exited with code 0. Output:\n\nhello\n'
    );
  });
});
