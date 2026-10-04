import { spawn } from 'node:child_process';
import { onTestFinished } from 'vitest';

/** Keys a user can press in an interactive prompt. */
export const keys = {
  enter: '\r',
  up: '\x1b[A',
  down: '\x1b[B',
  ctrlC: '\x03',
  escape: '\x1b',
  backspace: '\x7f',
} as const;

export interface StartCliOptions {
  /** The JavaScript file to run with the current Node. */
  bin: string;
  args?: string[];
  cwd: string;
  /**
   * The whole environment of the process. Nothing is inherited from the test
   * runner, so variables set by the package manager running the tests (like
   * `npm_config_user_agent`) can't change the result.
   */
  env?: Record<string, string>;
  /** How long `waitFor` and `exited` wait before failing, in ms. */
  timeout?: number;
}

export interface ExitResult {
  code: number | null;
  output: string;
}

export interface Cli {
  /** Everything printed so far (stdout and stderr), without colors. */
  readonly output: string;
  /**
   * Waits until `text` is printed after the previous match, then moves past
   * it: a prompt redrawn several times only matches once per call.
   */
  waitFor(text: string | RegExp): Promise<void>;
  /** Types text without pressing Enter. */
  type(text: string): void;
  press(key: keyof typeof keys): void;
  /** Resolves when the process exits, with its code and full output. */
  readonly exited: Promise<ExitResult>;
}

// https://en.wikipedia.org/wiki/ANSI_escape_code: colors, cursor moves, line clears.
const ansi = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][0-9A-B]|\x1b[78=>]/g;

/** Where the first match of `text` ends in `output`, if there is one. */
function matchEnd(output: string, text: string | RegExp): number | undefined {
  if (typeof text === 'string') {
    const index = output.indexOf(text);
    return index === -1 ? undefined : index + text.length;
  }
  const match = text.exec(output);
  return match ? match.index + match[0].length : undefined;
}

/** Strips colors and terminal control sequences from `text`. */
export function stripAnsi(text: string): string {
  return text.replace(ansi, '');
}

/**
 * Starts a CLI as a real process and drives it like a user would, through its
 * standard input. The process is killed when the test ends if still running.
 */
export function startCli({
  bin,
  args = [],
  cwd,
  env = {},
  timeout = 10_000,
}: StartCliOptions): Cli {
  const child = spawn(process.execPath, [bin, ...args], {
    cwd,
    env: { NO_COLOR: '1', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  onTestFinished(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });

  let raw = '';
  let cursor = 0;
  const listeners = new Set<() => void>();
  const onData = (chunk: Buffer) => {
    raw += chunk.toString();
    for (const listener of listeners) listener();
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  const exited = new Promise<ExitResult>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `The CLI did not exit within ${timeout} ms.\n\n${stripAnsi(raw)}`
          )
        ),
      timeout
    );
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, output: stripAnsi(raw) });
    });
  });
  // Handled by whoever awaits it; this avoids an unhandled rejection otherwise.
  exited.catch(() => {});

  return {
    get output() {
      return stripAnsi(raw);
    },
    waitFor(text) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const end = matchEnd(stripAnsi(raw).slice(cursor), text);
          if (end === undefined) return false;
          cursor += end;
          done();
          resolve();
          return true;
        };
        const timer = setTimeout(() => {
          done();
          reject(
            new Error(
              `"${String(text)}" was not printed within ${timeout} ms. Output:\n\n${stripAnsi(raw)}`
            )
          );
        }, timeout);
        const onExit = () => {
          if (check()) return;
          done();
          reject(
            new Error(
              `The CLI exited before printing "${String(text)}". Output:\n\n${stripAnsi(raw)}`
            )
          );
        };
        const done = () => {
          clearTimeout(timer);
          listeners.delete(check);
          child.off('close', onExit);
        };
        if (check()) return;
        listeners.add(check);
        child.on('close', onExit);
      });
    },
    type(text) {
      child.stdin.write(text);
    },
    press(key) {
      child.stdin.write(keys[key]);
    },
    exited,
  };
}
