// Everything the CLI prints goes through here: one symbol per kind of
// message, colors only when a person is reading.

export interface Log {
  /** `✓` something worked. */
  success(message: string): void;
  /** `ℹ` something worth knowing. */
  info(message: string): void;
  /** `↻` a reload or a reconnection. */
  reload(message: string): void;
  /** `⚠` something to look at, that does not stop the bot. */
  warn(message: string): void;
  /** `✗` something failed: what happened, then what to do. */
  error(message: string): void;
}

const CODES = { green: 32, blue: 34, yellow: 33, red: 31 } as const;

export function createLog(write: (line: string) => void, colors: boolean): Log {
  const line = (symbol: string, color: keyof typeof CODES, message: string) => {
    const shown = colors ? `\x1b[${CODES[color]}m${symbol}\x1b[0m` : symbol;
    // Following lines are aligned under the first one.
    write(`${shown} ${message.split('\n').join('\n  ')}`);
  };
  return {
    success: message => line('✓', 'green', message),
    info: message => line('ℹ', 'blue', message),
    reload: message => line('↻', 'blue', message),
    warn: message => line('⚠', 'yellow', message),
    error: message => line('✗', 'red', message),
  };
}
