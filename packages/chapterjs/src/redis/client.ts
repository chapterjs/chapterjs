// The one connection of the process to Redis, on Node's `net` and `tls`
// and nothing else. Commands are sent in order and answered in order
// (RESP pipelines by itself), so every call is a promise of its reply.
// The connection is opened on the first command, logs in and picks the
// database by itself, and comes back alone when it was lost: a command
// sent meanwhile fails at once with why, instead of waiting for nobody.
// https://redis.io/docs/latest/commands/auth/ and /commands/select/

import { connect as connectTcp, type Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import {
  encodeCommand,
  RedisError,
  ReplyReader,
  type RedisReply,
} from './protocol.js';
import { describeRedis, type RedisAddress } from './url.js';

export interface RedisClientOptions {
  /** The connection could not be made, or was lost: said once per outage. */
  onError?: (message: string) => void;
  /** The connection is back after an outage. */
  onReconnect?: () => void;
  /** How long a connection attempt may take. */
  connectTimeout?: number;
  /** The first wait before trying again, doubled each time up to `maxRetryDelay`. */
  retryDelay?: number;
  maxRetryDelay?: number;
}

/** A command waiting for its reply. */
interface Pending {
  resolve: (reply: RedisReply) => void;
  reject: (error: Error) => void;
}

/** A thrown reason, in plain words, with what to do. */
function explain(address: RedisAddress, error: unknown): string {
  const where = `Redis at ${describeRedis(address)}`;
  // Already said in these words (a password refused during the handshake).
  if (error instanceof Error && error.message.startsWith(where)) {
    return error.message;
  }
  if (error instanceof RedisError) {
    if (error.code === 'WRONGPASS') {
      return `${where} refused the password: check REDIS_PASSWORD (or the password in REDIS_URL) in .env.`;
    }
    if (error.code === 'NOAUTH') {
      return `${where} asks for a password: set REDIS_PASSWORD (or the password in REDIS_URL) in .env.`;
    }
    if (error.code === 'NOPERM') {
      return `${where} refused the user: check the user in REDIS_URL, and what it may do.`;
    }
    return `${where} refused the connection: ${error.message}`;
  }
  const code = (error as NodeJS.ErrnoException)?.code;
  switch (code) {
    case 'ECONNREFUSED':
      return `${where} can't be reached: nothing answers there. Start Redis, or check REDIS_URL in .env.`;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `${where} can't be reached: the host is unknown. Check REDIS_URL in .env.`;
    case 'ETIMEDOUT':
      return `${where} can't be reached: it did not answer in time. Check REDIS_URL in .env, and that the machine lets you reach it.`;
    case 'ECONNRESET':
    case 'EPIPE':
      return `${where} closed the connection.`;
    default:
      return `${where} can't be reached: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** One connection to Redis, which only opens when a command needs it. */
export class RedisClient {
  readonly address: RedisAddress;
  readonly #options: Required<
    Pick<RedisClientOptions, 'connectTimeout' | 'retryDelay' | 'maxRetryDelay'>
  > &
    RedisClientOptions;
  #socket: Socket | null = null;
  #state: 'idle' | 'connecting' | 'ready' | 'closed' = 'idle';
  /** Commands sent, waiting for their reply, in order. */
  #waiting: Pending[] = [];
  /** Commands given while connecting, sent once the connection is ready. */
  #queue: { args: readonly (string | number)[]; pending: Pending }[] = [];
  /** Why the last attempt failed: what a command gets while waiting to retry. */
  #outage: string | null = null;
  #wasReady = false;
  #attempts = 0;
  #retryTimer: NodeJS.Timeout | null = null;

  constructor(address: RedisAddress, options: RedisClientOptions = {}) {
    this.address = address;
    this.#options = {
      connectTimeout: 5000,
      retryDelay: 1000,
      maxRetryDelay: 30_000,
      ...options,
    };
  }

  /** `host:port` and the database, for messages. */
  get where(): string {
    return describeRedis(this.address);
  }

  /** Whether a command sent now goes out at once. */
  get connected(): boolean {
    return this.#state === 'ready';
  }

  /**
   * Sends a command and resolves with its reply. An error reply (`-ERR`)
   * rejects with a `RedisError`; a connection that fails or is lost
   * rejects with what happened, in plain words.
   */
  send(...args: readonly (string | number)[]): Promise<RedisReply> {
    return new Promise<RedisReply>((resolve, reject) => {
      const pending = { resolve, reject };
      switch (this.#state) {
        case 'closed':
          reject(
            new Error(`Redis at ${this.where} is closed: the bot stopped.`)
          );
          return;
        case 'ready':
          this.#write(args, pending);
          return;
        case 'connecting':
          this.#queue.push({ args, pending });
          return;
        case 'idle':
          if (this.#outage && this.#retryTimer) {
            reject(new Error(this.#outage));
            return;
          }
          this.#queue.push({ args, pending });
          this.#connect();
      }
    });
  }

  /**
   * Makes sure Redis answers: the connection is opened, logged in and on
   * the right database, or the reason it can't be is thrown.
   */
  async ping(): Promise<void> {
    const reply = await this.send('PING');
    if (reply !== 'PONG') {
      throw new Error(
        `Redis at ${this.where} answered ${JSON.stringify(reply)} to PING: is REDIS_URL the address of a Redis server?`
      );
    }
  }

  #write(args: readonly (string | number)[], pending: Pending): void {
    this.#waiting.push(pending);
    this.#socket!.write(encodeCommand(args));
  }

  #connect(): void {
    this.#state = 'connecting';
    const { host, port } = this.address;
    const socket = this.address.tls
      ? connectTls({ host, port, servername: host })
      : connectTcp({ host, port });
    this.#socket = socket;
    socket.setNoDelay(true);
    const reader = new ReplyReader();
    const timer = setTimeout(() => {
      socket.destroy(
        Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
      );
    }, this.#options.connectTimeout);

    // The end of this connection, whenever it comes: while connecting, or
    // once it served. Told once: a destroyed socket says error, then close.
    let ended = false;
    const fail = (error: unknown): void => {
      clearTimeout(timer);
      if (ended) return;
      ended = true;
      if (socket !== this.#socket) return;
      this.#socket = null;
      socket.destroy();
      const message = explain(this.address, error);
      // Everything sent or about to be sent fails: nobody is there.
      const waiting = this.#waiting;
      const queue = this.#queue;
      this.#waiting = [];
      this.#queue = [];
      for (const pending of waiting) pending.reject(new Error(message));
      for (const { pending } of queue) pending.reject(new Error(message));
      if (this.#state === 'closed') return;
      this.#state = 'idle';
      if (this.#outage === null) {
        this.#options.onError?.(`${message} Trying again every few seconds.`);
      }
      const delay = Math.min(
        this.#options.retryDelay * 2 ** this.#attempts,
        this.#options.maxRetryDelay
      );
      this.#attempts++;
      this.#outage = `${message} Trying again in ${Math.round(delay / 1000) || 1} s.`;
      this.#retryTimer = setTimeout(() => {
        this.#retryTimer = null;
        if (this.#state === 'idle') this.#connect();
      }, delay);
      this.#retryTimer.unref();
    };

    socket.on('error', fail);
    socket.on('close', () =>
      fail(Object.assign(new Error('closed'), { code: 'ECONNRESET' }))
    );
    socket.on('data', chunk => {
      reader.push(chunk);
      try {
        let reply;
        while ((reply = reader.next()) !== undefined) {
          const pending = this.#waiting.shift();
          if (!pending) continue;
          if (reply instanceof RedisError) {
            // A password refused, or missing, is about the connection, not
            // the command: said in the words of .env.
            pending.reject(
              reply.code === 'NOAUTH' || reply.code === 'WRONGPASS'
                ? new Error(explain(this.address, reply))
                : reply
            );
          } else pending.resolve(reply);
        }
      } catch (error) {
        socket.destroy(error as Error);
      }
    });
    socket.once(this.address.tls ? 'secureConnect' : 'connect', () => {
      this.#handshake(socket)
        .then(() => {
          clearTimeout(timer);
          if (this.#state !== 'connecting' || socket !== this.#socket) return;
          this.#state = 'ready';
          this.#attempts = 0;
          const back = this.#outage !== null && this.#wasReady;
          this.#outage = null;
          this.#wasReady = true;
          if (back) this.#options.onReconnect?.();
          const queue = this.#queue;
          this.#queue = [];
          for (const { args, pending } of queue) this.#write(args, pending);
        })
        .catch(fail);
    });
  }

  /** Logs in and picks the database, as the first commands of a connection. */
  async #handshake(socket: Socket): Promise<void> {
    const { username, password, db } = this.address;
    const steps: Promise<RedisReply>[] = [];
    const ask = (...args: string[]): void => {
      steps.push(
        new Promise((resolve, reject) => {
          this.#waiting.push({ resolve, reject });
          socket.write(encodeCommand(args));
        })
      );
    };
    if (password !== null) {
      ask('AUTH', ...(username === null ? [password] : [username, password]));
    }
    if (db !== 0) ask('SELECT', String(db));
    await Promise.all(steps);
  }

  /** Ends the connection; every command sent from now on fails. */
  async close(): Promise<void> {
    this.#state = 'closed';
    if (this.#retryTimer) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
    const socket = this.#socket;
    this.#socket = null;
    const message = `Redis at ${this.where} is closed: the bot stopped.`;
    for (const pending of this.#waiting) pending.reject(new Error(message));
    for (const { pending } of this.#queue) pending.reject(new Error(message));
    this.#waiting = [];
    this.#queue = [];
    socket?.destroy();
  }
}
