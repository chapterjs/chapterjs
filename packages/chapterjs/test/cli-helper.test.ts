import { startCli, tempDir } from '@chapterjs/test-utils';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reportLooseRejections } from '../src/cli/project.js';

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

describe('a promise of the files that nobody waited for', () => {
  it('is reported with its file and line, and what to write; one from elsewhere is thrown', () => {
    const cwd = '/project';
    const errors: string[] = [];
    const before = process.listeners('unhandledRejection').length;
    const stop = reportLooseRejections(cwd, {
      success() {},
      info() {},
      reload() {},
      warn() {},
      error: message => errors.push(message),
    });
    const listener = process.listeners('unhandledRejection').at(-1) as (
      reason: unknown
    ) => void;
    const inFile = new Error(
      'seen is a store per server, and this code does not run in one'
    );
    inFile.stack = `Error: seen is a store per server\n    at run (file:///project/src/ready.ts?chapter=0:6:10)\n    at x (file:///project/node_modules/chapterjs/dist/events/router.js:146:88)`;
    listener(inFile);
    expect(errors).toEqual([
      'src/ready.ts:6 seen is a store per server, and this code does not run in one\nThis call was not awaited: write await in front of it (and async before run), so that your function waits for it.',
    ]);
    const elsewhere = new Error('a bug of the framework');
    elsewhere.stack = `Error: a bug\n    at y (file:///project/node_modules/chapterjs/dist/core/bot.js:10:5)`;
    expect(() => listener(elsewhere)).toThrow('a bug of the framework');
    expect(() => listener('not even an error')).toThrow('not even an error');
    stop();
    expect(process.listeners('unhandledRejection')).toHaveLength(before);
  });
});
