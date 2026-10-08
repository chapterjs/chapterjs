// One session with a voice server: its WebSocket (voice gateway v8), its UDP
// socket, the transport key and the DAVE state. A session lives as long as
// its token: moving to another channel or losing it makes a new one, while
// the voice connection users hold stays the same object.
// https://docs.discord.com/developers/topics/voice-connections

import { createSocket, type Socket } from 'node:dgram';
import { VoiceCloseCode, VoiceOpcode } from '../discord/codes.js';
import type { Snowflake } from '../discord/types/common.js';
import { onSocketEnd } from '../util/websocket.js';
import { DaveSession, type loadDave } from './dave.js';
import {
  pickMode,
  rtpHeader,
  TRANSPORT_MODES,
  TransportEncryptor,
} from './transport.js';

export const VOICE_GATEWAY_VERSION = 8;

/** What a voice server needs to know who the bot is. */
export interface VoiceServer {
  endpoint: string;
  token: string;
  guildId: Snowflake;
  channelId: Snowflake;
  userId: Snowflake;
  sessionId: string;
}

/** How a session ended, when it did not end on purpose. */
export type SessionEnd =
  /** Discord ended it (the bot was disconnected, the call ended...). */
  | { type: 'ended'; code: number }
  /** The session can't be resumed: ask the gateway for a new one. */
  | { type: 'lost'; code: number }
  /** Discord refused the session: something to fix. */
  | { type: 'refused'; code: number; reason: string };

export interface SessionOptions {
  dave: Awaited<ReturnType<typeof loadDave>>;
  /** The session can no longer send; the connection decides what next. */
  onEnd: (end: SessionEnd) => void;
  warn: (message: string) => void;
  /** Only tests change these. */
  secure?: boolean;
  timeout?: number;
}

/** The close codes after which Discord says not to reconnect. */
const ENDED: readonly number[] = [
  VoiceCloseCode.Disconnected,
  VoiceCloseCode.DisconnectedRateLimited,
  VoiceCloseCode.DisconnectedCallTerminated,
];
/** The session is gone: a new one is needed, from the main gateway. */
const LOST: readonly number[] = [
  VoiceCloseCode.SessionNoLongerValid,
  VoiceCloseCode.SessionTimeout,
  VoiceCloseCode.ServerNotFound,
];
/** What these codes mean for the developer. */
const REFUSED: Readonly<Record<number, string>> = {
  [VoiceCloseCode.UnknownOpcode]: 'it received an opcode it does not know',
  [VoiceCloseCode.FailedToDecodePayload]: 'it could not read what it received',
  [VoiceCloseCode.NotAuthenticated]: 'it was sent something before Identify',
  [VoiceCloseCode.AuthenticationFailed]: 'the voice token was refused',
  [VoiceCloseCode.AlreadyAuthenticated]: 'it was identified twice',
  [VoiceCloseCode.UnknownProtocol]: 'it does not know the protocol asked',
  [VoiceCloseCode.UnknownEncryptionMode]:
    'it does not know the encryption mode asked',
  [VoiceCloseCode.E2eeDaveProtocolRequired]:
    'the channel requires end-to-end encryption (DAVE)',
  [VoiceCloseCode.BadRequest]: 'it received a malformed request',
};

/** Five frames of silence, sent before stopping. */
const SILENCE = Buffer.from([0xf8, 0xff, 0xfe]);

export class VoiceSession {
  readonly server: VoiceServer;
  readonly #options: SessionOptions;
  readonly dave: DaveSession;
  #ws: WebSocket | null = null;
  #udp: Socket | null = null;
  #remote: { ip: string; port: number } | null = null;
  #ssrc = 0;
  #encryptor: TransportEncryptor | null = null;
  #sequence = Math.floor(Math.random() * 0xffff);
  #timestamp = Math.floor(Math.random() * 0xffffffff);
  #seqAck = -1;
  #heartbeat: NodeJS.Timeout | null = null;
  #acked = true;
  #resuming = false;
  #closed = false;
  #speaking = false;
  #ready: { resolve: () => void; reject: (error: unknown) => void } | null =
    null;
  #retries = 0;
  /** Packets handed to the socket and not sent yet. */
  #sending = 0;
  #afterSends: (() => void) | null = null;

  constructor(server: VoiceServer, options: SessionOptions) {
    this.server = server;
    this.#options = options;
    this.dave = new DaveSession(options.dave, {
      userId: server.userId,
      channelId: server.channelId,
      warn: options.warn,
      transport: {
        json: (op, data) => this.#send(op, data),
        binary: (op, payload) => this.#sendBinary(op, payload),
      },
    });
  }

  /** Resolves once the session can send audio. */
  connect(): Promise<void> {
    const timeout = this.#options.timeout ?? 15_000;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              `The voice server did not answer within ${timeout / 1000} s.`
            )
          ),
        timeout
      );
      this.#ready = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.#open();
    });
  }

  /** Sends one Opus packet that plays `samples` samples. */
  sendOpus(packet: Uint8Array, samples: number): void {
    const encryptor = this.#encryptor;
    if (!encryptor || !this.#udp || !this.#remote || this.#closed) return;
    if (!this.dave.canSend) {
      // The call is end-to-end encrypted and the bot has no key yet: what
      // it would send could not be heard. Time goes on all the same.
      this.#timestamp = (this.#timestamp + samples) >>> 0;
      return;
    }
    if (!this.#speaking) this.setSpeaking(true);
    const frame = this.dave.encrypt(packet);
    const header = rtpHeader(this.#sequence, this.#timestamp, this.#ssrc);
    this.#sequence = (this.#sequence + 1) & 0xffff;
    this.#timestamp = (this.#timestamp + samples) >>> 0;
    this.#sending++;
    this.#udp.send(
      encryptor.seal(header, frame),
      this.#remote.port,
      this.#remote.ip,
      () => {
        this.#sending--;
        if (this.#sending === 0) this.#afterSends?.();
      }
    );
  }

  /** The five frames of silence Discord asks for before a pause. */
  sendSilence(): void {
    for (let i = 0; i < 5; i++) this.sendOpus(SILENCE, 960);
  }

  /** Speaking (5): needed before audio, and shown in Discord. */
  setSpeaking(speaking: boolean): void {
    if (speaking === this.#speaking) return;
    this.#speaking = speaking;
    this.#send(VoiceOpcode.Speaking, {
      speaking: speaking ? 1 : 0,
      delay: 0,
      ssrc: this.#ssrc,
    });
  }

  /** Closes the session for good. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#stopHeartbeat();
    this.#ws?.close(1000);
    this.#ws = null;
    // What was handed to the socket (the silence that ends a song) still
    // leaves before it closes.
    const udp = this.#udp;
    this.#udp = null;
    if (udp && this.#sending > 0) this.#afterSends = () => udp.close();
    else udp?.close();
    this.dave.close();
    this.#ready?.reject(new Error('The voice connection was closed.'));
    this.#ready = null;
  }

  #open(): void {
    const scheme = this.#options.secure === false ? 'ws' : 'wss';
    const ws = new WebSocket(
      `${scheme}://${this.server.endpoint}/?v=${VOICE_GATEWAY_VERSION}`
    );
    ws.binaryType = 'arraybuffer';
    this.#ws = ws;
    ws.addEventListener('message', event => {
      if (ws !== this.#ws) return;
      try {
        if (typeof event.data === 'string') this.#onJson(event.data);
        else this.#onBinary(new Uint8Array(event.data as ArrayBuffer));
      } catch (error) {
        this.#options.warn(
          `a message of the voice server could not be read: ${(error as Error).message}`
        );
      }
    });
    onSocketEnd(ws, code => {
      if (ws === this.#ws) this.#onClose(code);
    });
  }

  #onJson(text: string): void {
    const { op, d, seq } = JSON.parse(text) as {
      op: number;
      d: Record<string, unknown> | null;
      seq?: number;
    };
    if (typeof seq === 'number') this.#seqAck = seq;
    const data = d ?? {};
    switch (op) {
      case VoiceOpcode.Hello:
        this.#startHeartbeat(data.heartbeat_interval as number);
        if (this.#resuming) {
          this.#send(VoiceOpcode.Resume, {
            server_id: this.server.guildId,
            session_id: this.server.sessionId,
            token: this.server.token,
            seq_ack: this.#seqAck,
          });
        } else {
          this.#send(VoiceOpcode.Identify, {
            server_id: this.server.guildId,
            user_id: this.server.userId,
            session_id: this.server.sessionId,
            token: this.server.token,
            max_dave_protocol_version: this.dave.maxVersion,
          });
        }
        break;
      case VoiceOpcode.Ready:
        void this.#selectProtocol(
          data as { ssrc: number; ip: string; port: number; modes: string[] }
        );
        break;
      case VoiceOpcode.SessionDescription: {
        const {
          mode,
          secret_key: key,
          dave_protocol_version: version,
        } = data as {
          mode: string;
          secret_key: number[];
          dave_protocol_version?: number;
        };
        const chosen = pickMode([mode]);
        if (!chosen) {
          this.#fail(
            new Error(
              `The voice server chose an encryption mode chapterjs does not know: ${mode}.`
            )
          );
          return;
        }
        this.#encryptor = new TransportEncryptor(chosen, Uint8Array.from(key));
        this.dave.start(version ?? 0);
        this.#retries = 0;
        this.#ready?.resolve();
        this.#ready = null;
        break;
      }
      case VoiceOpcode.HeartbeatAck:
        this.#acked = true;
        break;
      case VoiceOpcode.Resumed:
        this.#resuming = false;
        this.#retries = 0;
        break;
      case VoiceOpcode.ClientsConnect:
        this.dave.clientsConnect((data.user_ids as Snowflake[]) ?? []);
        break;
      case VoiceOpcode.ClientDisconnect:
        this.dave.clientDisconnect(data.user_id as Snowflake);
        break;
      case VoiceOpcode.DavePrepareTransition:
        this.dave.prepareTransition(
          data.transition_id as number,
          data.protocol_version as number
        );
        break;
      case VoiceOpcode.DaveExecuteTransition:
        this.dave.executeTransition(data.transition_id as number);
        break;
      case VoiceOpcode.DavePrepareEpoch:
        this.dave.prepareEpoch(
          data.epoch as number,
          data.protocol_version as number
        );
        break;
      default:
        // Speaking of others, video, and what the bot does not use.
        break;
    }
  }

  /** Binary messages: a sequence number, an opcode, then the payload. */
  #onBinary(bytes: Uint8Array): void {
    if (bytes.length < 3) return;
    this.#seqAck = (bytes[0]! << 8) | bytes[1]!;
    const op = bytes[2]!;
    const payload = bytes.subarray(3);
    const transition = (): number => (payload[0]! << 8) | payload[1]!;
    switch (op) {
      case VoiceOpcode.DaveMlsExternalSender:
        this.dave.externalSender(payload);
        break;
      case VoiceOpcode.DaveMlsProposals:
        this.dave.proposals(payload);
        break;
      case VoiceOpcode.DaveMlsAnnounceCommitTransition:
        this.dave.announceCommit(transition(), payload.subarray(2));
        break;
      case VoiceOpcode.DaveMlsWelcome:
        this.dave.welcome(transition(), payload.subarray(2));
        break;
      default:
        break;
    }
  }

  async #selectProtocol(ready: {
    ssrc: number;
    ip: string;
    port: number;
    modes: string[];
  }): Promise<void> {
    const mode = pickMode(ready.modes);
    if (!mode) {
      this.#fail(
        new Error(
          `The voice server offers none of the encryption modes chapterjs speaks (${TRANSPORT_MODES.join(', ')}): it offered ${ready.modes.join(', ')}.`
        )
      );
      return;
    }
    this.#ssrc = ready.ssrc;
    this.dave.setSsrc(ready.ssrc);
    this.#remote = { ip: ready.ip, port: ready.port };
    try {
      const self = await this.#discover(ready);
      this.#send(VoiceOpcode.SelectProtocol, {
        protocol: 'udp',
        data: { address: self.ip, port: self.port, mode },
      });
    } catch (error) {
      this.#fail(error);
    }
  }

  /**
   * IP Discovery: asks the voice server which address and port it sees the
   * bot from, through the socket audio will go through.
   * https://docs.discord.com/developers/topics/voice-connections#ip-discovery
   */
  #discover(ready: {
    ssrc: number;
    ip: string;
    port: number;
  }): Promise<{ ip: string; port: number }> {
    this.#udp?.close();
    const udp = createSocket('udp4');
    this.#udp = udp;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        udp.off('message', onMessage);
        reject(
          new Error(
            `The voice server did not answer over UDP (${ready.ip}:${ready.port}): a firewall may block it.`
          )
        );
      }, 5000);
      const onMessage = (message: Buffer): void => {
        if (message.length < 74 || message.readUInt16BE(0) !== 2) return;
        clearTimeout(timer);
        udp.off('message', onMessage);
        const end = message.indexOf(0, 8);
        resolve({
          ip: message.toString('utf8', 8, end > 8 && end < 72 ? end : 72),
          port: message.readUInt16BE(72),
        });
      };
      udp.on('message', onMessage);
      udp.on('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      const request = Buffer.alloc(74);
      request.writeUInt16BE(1, 0);
      request.writeUInt16BE(70, 2);
      request.writeUInt32BE(ready.ssrc >>> 0, 4);
      udp.send(request, ready.port, ready.ip);
    });
  }

  #onClose(code: number): void {
    this.#stopHeartbeat();
    this.#ws = null;
    if (this.#closed) return;
    if (ENDED.includes(code)) return this.#end({ type: 'ended', code });
    if (LOST.includes(code)) return this.#end({ type: 'lost', code });
    const reason = REFUSED[code];
    if (reason) return this.#end({ type: 'refused', code, reason });
    // Anything else (a network error, a crash of the voice server, a
    // missing heartbeat ACK): resume, waiting longer each time.
    if (this.#ready || !this.#encryptor) {
      // Not even ready yet: there is nothing to resume.
      return this.#end({ type: 'lost', code });
    }
    this.#resuming = true;
    const delay = Math.min(1000 * 2 ** this.#retries, 30_000);
    this.#retries++;
    setTimeout(() => {
      if (!this.#closed) this.#open();
    }, delay).unref();
  }

  #end(end: SessionEnd): void {
    const ready = this.#ready;
    this.close();
    if (ready) {
      ready.reject(
        new Error(
          end.type === 'refused'
            ? `The voice server refused the bot (${end.code}): ${end.reason}.`
            : `The voice server closed the connection (${end.code}).`
        )
      );
    }
    this.#options.onEnd(end);
  }

  #fail(error: unknown): void {
    const ready = this.#ready;
    this.#ready = null;
    this.close();
    ready?.reject(error);
    if (!ready) this.#options.onEnd({ type: 'lost', code: 0 });
  }

  #startHeartbeat(interval: number): void {
    this.#stopHeartbeat();
    this.#acked = true;
    this.#heartbeat = setInterval(() => {
      if (!this.#acked) {
        // No answer to the last one: the connection is dead.
        this.#ws?.close(4000);
        return;
      }
      this.#acked = false;
      this.#send(VoiceOpcode.Heartbeat, {
        t: Date.now(),
        seq_ack: this.#seqAck,
      });
    }, interval);
    this.#heartbeat.unref();
  }

  #stopHeartbeat(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
  }

  #send(op: VoiceOpcode, d: unknown): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify({ op, d }));
    }
  }

  #sendBinary(op: VoiceOpcode, payload: Uint8Array): void {
    if (this.#ws?.readyState !== WebSocket.OPEN) return;
    const message = new Uint8Array(payload.length + 1);
    message[0] = op;
    message.set(payload, 1);
    this.#ws.send(message);
  }
}
