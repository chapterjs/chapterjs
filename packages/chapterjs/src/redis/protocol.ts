// RESP, the protocol of Redis, on nothing but Buffers: how a command is
// written on the wire, and how what comes back is read, one reply at a
// time, from bytes that arrive in any number of pieces. RESP2 only: every
// Redis speaks it, and the few commands the framework sends need no more.
// https://redis.io/docs/latest/develop/reference/protocol-spec/

/** What Redis answers: a text, a number, nothing, or a list of those. */
export type RedisReply = string | number | null | RedisReply[];

/** A `-ERR …` reply: Redis refused the command and says why. */
export class RedisError extends Error {
  override name = 'RedisError';
  /** The first word of the message: `ERR`, `WRONGPASS`, `NOAUTH`… */
  readonly code: string;

  constructor(message: string) {
    super(message);
    this.code = message.split(' ', 1)[0] ?? '';
  }
}

const CRLF = '\r\n';

/** A command as Redis reads it: an array of bulk strings. */
export function encodeCommand(args: readonly (string | number)[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}${CRLF}`)];
  for (const arg of args) {
    const bytes = Buffer.from(String(arg));
    parts.push(
      Buffer.from(`$${bytes.length}${CRLF}`),
      bytes,
      Buffer.from(CRLF)
    );
  }
  return Buffer.concat(parts);
}

/** A reply, or that there is not enough yet. */
type Read = { reply: RedisReply; end: number } | null;

/**
 * Reads replies out of the bytes received so far. `push()` adds what
 * arrived, `next()` gives the next whole reply, or `undefined` while a
 * reply is still incomplete: what was read of it is kept for the next
 * push, so a reply cut anywhere by the network is read whole.
 */
export class ReplyReader {
  #buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): void {
    this.#buffer =
      this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
  }

  next(): RedisReply | undefined {
    const read = this.#read(0);
    if (!read) return undefined;
    this.#buffer = this.#buffer.subarray(read.end);
    return read.reply;
  }

  /** A line ending in CRLF from `start`: its text and where the next starts. */
  #line(start: number): { text: string; end: number } | null {
    const at = this.#buffer.indexOf(CRLF, start);
    if (at === -1) return null;
    return { text: this.#buffer.toString('utf8', start, at), end: at + 2 };
  }

  #read(start: number): Read {
    if (start >= this.#buffer.length) return null;
    const type = this.#buffer[start];
    const line = this.#line(start + 1);
    if (!line) return null;
    switch (type) {
      case 0x2b: // +
        return { reply: line.text, end: line.end };
      case 0x2d: // -
        return { reply: new RedisError(line.text) as never, end: line.end };
      case 0x3a: // :
        return { reply: Number(line.text), end: line.end };
      case 0x24: {
        // $
        const length = Number(line.text);
        if (length === -1) return { reply: null, end: line.end };
        const end = line.end + length + 2;
        if (this.#buffer.length < end) return null;
        return {
          reply: this.#buffer.toString('utf8', line.end, line.end + length),
          end,
        };
      }
      case 0x2a: {
        // *
        const count = Number(line.text);
        if (count === -1) return { reply: null, end: line.end };
        const items: RedisReply[] = [];
        let at = line.end;
        for (let index = 0; index < count; index++) {
          const item = this.#read(at);
          if (!item) return null;
          items.push(item.reply);
          at = item.end;
        }
        return { reply: items, end: at };
      }
      default:
        throw new Error(
          `Redis answered something that is not RESP (a line starting with ${JSON.stringify(String.fromCharCode(type ?? 0))}): is REDIS_URL the address of a Redis server?`
        );
    }
  }
}
