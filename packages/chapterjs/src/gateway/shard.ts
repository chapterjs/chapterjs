// One WebSocket connection to the Discord gateway, kept alive for as long
// as the bot runs: handshake, heartbeats, resuming after a disconnect.
// https://docs.discord.com/developers/events/gateway#connections

import { setTimeout as sleep } from 'node:timers/promises';
import { API_VERSION } from '../discord/api.js';
import {
  FATAL_GATEWAY_CLOSE_CODES,
  GatewayCloseCode,
  GatewayOpcode,
} from '../discord/codes.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
  RawGatewayPayload,
  RawGatewayPresenceUpdate,
  RawHello,
  RawIdentify,
  RawReadyEvent,
  RawResume,
} from '../discord/types/gateway-events.js';
import { GatewayFatalError } from './errors.js';
import type { IdentifyGate } from './identify-queue.js';

export type ShardStatus =
  /** Not started yet. */
  | 'idle'
  /** Opening the WebSocket, or waiting for Hello. */
  | 'connecting'
  /** Waiting for its turn to identify, or for Ready. */
  | 'identifying'
  /** Waiting for Discord to replay the events missed while disconnected. */
  | 'resuming'
  /** Connected: events are flowing. */
  | 'ready'
  /** Disconnected, about to try again. */
  | 'reconnecting'
  /** Closed for good: by the bot, or by a fatal error. */
  | 'closed';

/** What happens to a shard, for whoever shows it to the developer. */
export type ShardEvent =
  | { type: 'ready'; shardId: number; resumed: boolean }
  | {
      type: 'disconnected';
      shardId: number;
      /** The close code, when the connection was closed with one. */
      code: number | null;
      /** Whether the session can be resumed without losing events. */
      resumable: boolean;
      /** In how many milliseconds the shard tries again. */
      retryIn: number;
    }
  | { type: 'fatal'; shardId: number; error: Error };

export interface ShardOptions {
  /** `[shard_id, num_shards]` of the Identify payload. */
  id: number;
  count: number;
  token: string;
  intents: number;
  /** The WSS URL given by Get Gateway Bot. */
  url: string;
  /** The presence the bot has as soon as it is connected. */
  presence?: RawGatewayPresenceUpdate;
  /** Decides when this shard may identify. */
  identifyGate: IdentifyGate;
  /** Called for every event Discord dispatches, in order. */
  onDispatch: <E extends GatewayDispatchEventName>(
    event: E,
    data: GatewayDispatchEvents[E],
    shardId: number
  ) => void;
  onEvent?: (event: ShardEvent) => void;
  /** Milliseconds to wait before the nth try in a row. Only tests change it. */
  backoff?: (attempt: number) => number;
}

/**
 * Apps can send 120 gateway events per connection every 60 seconds.
 * @see https://docs.discord.com/developers/events/gateway#rate-limiting
 */
const SEND_LIMIT = 120;
const SEND_WINDOW = 60_000;
/** Kept free for heartbeats, which must never wait. */
const SEND_RESERVE = 5;
/**
 * An event sent to Discord must not exceed 4096 bytes.
 * @see https://docs.discord.com/developers/events/gateway#sending-events
 */
const MAX_PAYLOAD_BYTES = 4096;
/**
 * The code used to close a connection the shard wants to resume: any code
 * but 1000 and 1001 keeps the session alive.
 * @see https://docs.discord.com/developers/events/gateway#initiating-a-disconnect
 */
const CLOSE_AND_RESUME = 4000;
/**
 * Close codes after which the session is gone: the shard reconnects and
 * identifies again.
 */
const SESSION_LOST: ReadonlySet<number> = new Set([
  1000,
  1001,
  GatewayCloseCode.NotAuthenticated,
  GatewayCloseCode.InvalidSeq,
  GatewayCloseCode.SessionTimedOut,
]);

const defaultBackoff = (attempt: number): number =>
  attempt === 0
    ? 0
    : Math.min(1000 * 2 ** (attempt - 1), 60_000) * (0.5 + Math.random() / 2);

export class Shard {
  readonly id: number;
  readonly #options: ShardOptions;
  #status: ShardStatus = 'idle';
  #ws: WebSocket | null = null;
  /** Whether the current connection got its Hello. */
  #greeted = false;
  // What a Resume needs, kept from the Ready event and the last dispatch.
  #sessionId: string | null = null;
  #resumeUrl: string | null = null;
  #sequence: number | null = null;
  // Heartbeats.
  #heartbeatTimer: NodeJS.Timeout | null = null;
  #acknowledged = true;
  #heartbeatSentAt = 0;
  #ping: number | null = null;
  /** Tries in a row that did not reach Ready or Resumed. */
  #attempts = 0;
  #retryTimer: NodeJS.Timeout | null = null;
  /** When the last events were sent, to respect the send limit. */
  readonly #sent: number[] = [];
  // Who is waiting for the shard to be ready.
  #readyWaiters: { resolve: () => void; reject: (error: Error) => void }[] = [];
  #fatal: Error | null = null;

  constructor(options: ShardOptions) {
    this.id = options.id;
    this.#options = options;
  }

  get status(): ShardStatus {
    return this.#status;
  }

  /**
   * How long Discord took to acknowledge the last heartbeat, in
   * milliseconds; `null` before the first one.
   */
  get ping(): number | null {
    return this.#ping;
  }

  /**
   * Connects, and resolves once Discord said the shard is ready. Rejects if
   * Discord refuses the connection for good. After that the shard stays
   * connected by itself.
   */
  connect(): Promise<void> {
    if (this.#status !== 'idle') {
      throw new Error(`Shard ${this.id} was already started.`);
    }
    const ready = this.#whenReady();
    this.#open();
    return ready;
  }

  /**
   * Sends an event to Discord, once the shard is ready and the send limit
   * allows it.
   * @see https://docs.discord.com/developers/events/gateway-events#send-events
   */
  async send(op: GatewayOpcode, data: unknown): Promise<void> {
    const text = JSON.stringify({ op, d: data });
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_PAYLOAD_BYTES) {
      throw new RangeError(
        `This gateway event is ${bytes} bytes long: Discord accepts ${MAX_PAYLOAD_BYTES} at most.`
      );
    }
    for (;;) {
      if (this.#status !== 'ready') await this.#whenReady();
      const now = Date.now();
      while (this.#sent.length > 0 && now - this.#sent[0]! >= SEND_WINDOW) {
        this.#sent.shift();
      }
      if (this.#sent.length < SEND_LIMIT - SEND_RESERVE) break;
      await sleep(this.#sent[0]! + SEND_WINDOW - now);
    }
    this.#write(text);
  }

  /**
   * Closes the connection for good. The session is ended, so the bot
   * appears offline right away instead of staying online as a ghost.
   * @see https://docs.discord.com/developers/events/gateway#initiating-a-disconnect
   */
  async close(): Promise<void> {
    if (this.#status === 'closed') return;
    const ws = this.#ws;
    this.#finish(new Error(`Shard ${this.id} was closed.`));
    if (!ws || ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 2000);
      ws.addEventListener('close', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.close(1000);
    });
  }

  // -- Connection ------------------------------------------------------------

  #whenReady(): Promise<void> {
    if (this.#fatal) return Promise.reject(this.#fatal);
    return new Promise((resolve, reject) => {
      this.#readyWaiters.push({ resolve, reject });
    });
  }

  #open(): void {
    this.#status = 'connecting';
    this.#greeted = false;
    const base = (
      this.#sessionId && this.#resumeUrl ? this.#resumeUrl : this.#options.url
    ).replace(/\/+$/, '');
    // When resuming, the same version and encoding must be given again.
    const ws = new WebSocket(`${base}/?v=${API_VERSION}&encoding=json`);
    this.#ws = ws;
    ws.addEventListener('message', event => {
      if (ws === this.#ws) this.#onMessage(String(event.data));
    });
    ws.addEventListener('close', event => {
      // 1005 and 1006 mean "no close code was received".
      const code =
        event.code === 1005 || event.code === 1006 ? null : event.code;
      if (ws === this.#ws) this.#onClose(code);
    });
    // An error is always followed by a close event, handled above.
    ws.addEventListener('error', () => {});
  }

  #write(text: string): void {
    const ws = this.#ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    this.#sent.push(Date.now());
    ws.send(text);
  }

  #onMessage(text: string): void {
    let payload: RawGatewayPayload;
    try {
      payload = JSON.parse(text) as RawGatewayPayload;
    } catch {
      return;
    }
    switch (payload.op) {
      case GatewayOpcode.Hello:
        this.#greeted = true;
        this.#startHeartbeat((payload.d as RawHello).heartbeat_interval);
        void this.#handshake();
        break;
      case GatewayOpcode.HeartbeatAck:
        this.#acknowledged = true;
        this.#ping = Date.now() - this.#heartbeatSentAt;
        break;
      case GatewayOpcode.Heartbeat:
        // Discord asks for a heartbeat right now.
        this.#sendHeartbeat();
        break;
      case GatewayOpcode.Reconnect:
        this.#reconnect(true);
        break;
      case GatewayOpcode.InvalidSession:
        // `d` says whether the session may be resumed.
        this.#reconnect(payload.d === true);
        break;
      case GatewayOpcode.Dispatch:
        this.#onDispatch(payload);
        break;
    }
  }

  async #handshake(): Promise<void> {
    const ws = this.#ws;
    if (this.#sessionId !== null && this.#sequence !== null) {
      this.#status = 'resuming';
      const resume: RawResume = {
        token: this.#options.token,
        session_id: this.#sessionId,
        seq: this.#sequence,
      };
      this.#write(JSON.stringify({ op: GatewayOpcode.Resume, d: resume }));
      return;
    }
    this.#status = 'identifying';
    await this.#options.identifyGate.wait(this.id);
    // The connection may have dropped while waiting for its turn.
    if (ws !== this.#ws) return;
    const identify: RawIdentify = {
      token: this.#options.token,
      intents: this.#options.intents,
      properties: {
        os: process.platform,
        browser: 'chapterjs',
        device: 'chapterjs',
      },
      shard: [this.id, this.#options.count],
      ...(this.#options.presence ? { presence: this.#options.presence } : {}),
    };
    this.#write(JSON.stringify({ op: GatewayOpcode.Identify, d: identify }));
  }

  #onDispatch(payload: RawGatewayPayload): void {
    if (payload.s !== null && payload.s !== undefined) {
      this.#sequence = payload.s;
    }
    const event = payload.t as GatewayDispatchEventName;
    if (event === 'READY') {
      const ready = payload.d as RawReadyEvent;
      this.#sessionId = ready.session_id;
      this.#resumeUrl = ready.resume_gateway_url;
    }
    // The cache must know about Ready before anyone is told the shard is.
    this.#options.onDispatch(event, payload.d as never, this.id);
    if (event === 'READY' || event === 'RESUMED') {
      this.#status = 'ready';
      this.#attempts = 0;
      this.#options.onEvent?.({
        type: 'ready',
        shardId: this.id,
        resumed: event === 'RESUMED',
      });
      for (const waiter of this.#readyWaiters.splice(0)) waiter.resolve();
    }
  }

  // -- Heartbeats ------------------------------------------------------------

  /** @see https://docs.discord.com/developers/events/gateway#sending-heartbeats */
  #startHeartbeat(interval: number): void {
    this.#stopHeartbeat();
    this.#acknowledged = true;
    // The first heartbeat is sent after `heartbeat_interval * jitter`.
    this.#heartbeatTimer = setTimeout(() => {
      this.#sendHeartbeat();
      this.#heartbeatTimer = setInterval(() => {
        if (!this.#acknowledged) {
          // A "zombied" connection: terminate it and resume.
          this.#reconnect(true);
          return;
        }
        this.#sendHeartbeat();
      }, interval);
    }, interval * Math.random());
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatTimer) {
      clearTimeout(this.#heartbeatTimer);
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
  }

  #sendHeartbeat(): void {
    this.#acknowledged = false;
    this.#heartbeatSentAt = Date.now();
    this.#write(
      JSON.stringify({ op: GatewayOpcode.Heartbeat, d: this.#sequence })
    );
  }

  // -- Disconnections --------------------------------------------------------

  /** Drops the current connection, whose events are ignored from now on. */
  #detach(code: number): void {
    this.#stopHeartbeat();
    const ws = this.#ws;
    this.#ws = null;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try {
        ws.close(code);
      } catch {
        // Already closing.
      }
    }
  }

  /** The shard itself decides to reconnect (Discord asked, or no ACK). */
  #reconnect(resume: boolean): void {
    // Ending the session cleanly when it can't be resumed anyway.
    this.#detach(resume ? CLOSE_AND_RESUME : 1000);
    this.#retry(null, resume);
  }

  /** The connection was closed by Discord or by the network. */
  #onClose(code: number | null): void {
    this.#stopHeartbeat();
    this.#ws = null;
    if (code !== null && FATAL_GATEWAY_CLOSE_CODES.has(code)) {
      const error = new GatewayFatalError(code, this.#options.intents);
      this.#finish(error);
      this.#options.onEvent?.({ type: 'fatal', shardId: this.id, error });
      return;
    }
    // A resume that could not even reach Discord: start over from the URL
    // of Get Gateway Bot, as the documentation says.
    const resumeFailed = this.#status === 'connecting' && !this.#greeted;
    this.#retry(
      code,
      !(resumeFailed || (code !== null && SESSION_LOST.has(code)))
    );
  }

  #retry(code: number | null, resume: boolean): void {
    const resumable =
      resume && this.#sessionId !== null && this.#sequence !== null;
    if (!resumable) {
      this.#sessionId = null;
      this.#resumeUrl = null;
      this.#sequence = null;
    }
    this.#status = 'reconnecting';
    const retryIn = Math.round(
      (this.#options.backoff ?? defaultBackoff)(this.#attempts++)
    );
    this.#options.onEvent?.({
      type: 'disconnected',
      shardId: this.id,
      code,
      resumable,
      retryIn,
    });
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.#open();
    }, retryIn);
  }

  /** Stops everything, for good. */
  #finish(error: Error): void {
    this.#status = 'closed';
    this.#fatal = error;
    this.#stopHeartbeat();
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
    this.#ws = null;
    for (const waiter of this.#readyWaiters.splice(0)) waiter.reject(error);
  }
}
