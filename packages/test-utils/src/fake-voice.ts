import { createDecipheriv, randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { onTestFinished } from 'vitest';
import { webSocketServer } from './websocket.js';

/** A JSON payload of the voice gateway: `{ op, d, seq }`. */
export interface FakeVoicePayload {
  op: number;
  d?: unknown;
  seq?: number;
}

/** A packet of audio received over UDP. */
export interface FakeVoicePacket {
  sequence: number;
  timestamp: number;
  ssrc: number;
  /**
   * What was sent inside the transport encryption: the Opus frame, or the
   * DAVE frame when the call is end-to-end encrypted. `null` for a mode
   * the fake does not decrypt (only `aead_aes256_gcm_rtpsize` is).
   */
  payload: Buffer | null;
}

/** One connection to the voice gateway. */
export interface FakeVoiceConnection {
  query: Record<string, string>;
  /** JSON payloads received, in order. */
  received: FakeVoicePayload[];
  /** Binary messages received: the opcode, then the payload. */
  binary: { op: number; payload: Buffer }[];
  closed: { code: number | null } | null;
  send(payload: FakeVoicePayload): void;
  /** A binary message: sequence number, opcode, payload. */
  sendBinary(op: number, payload: Uint8Array): void;
  close(code: number): void;
  drop(): void;
  waitFor(
    match: number | ((payload: FakeVoicePayload) => boolean),
    timeout?: number
  ): Promise<FakeVoicePayload>;
  waitForBinary(op: number, timeout?: number): Promise<Buffer>;
  waitForClose(timeout?: number): Promise<number | null>;
}

/** How the fake voice server answers; change it at any time. */
export interface FakeVoiceBehavior {
  heartbeatInterval: number;
  ackHeartbeats: boolean;
  /** The modes offered in Ready. */
  modes: string[];
  /** `dave_protocol_version` of the Session Description. */
  daveVersion: number;
  /** Whether Identify is answered (Ready); `false` lets a test hang it. */
  answer: boolean;
}

export interface FakeVoice {
  /** What a Voice Server Update gives: host and port, without a scheme. */
  endpoint: string;
  behavior: FakeVoiceBehavior;
  connections: FakeVoiceConnection[];
  connection(index: number, timeout?: number): Promise<FakeVoiceConnection>;
  /** The transport key of the sessions. */
  secretKey: Buffer;
  ssrc: number;
  /** Audio received over UDP, in order. */
  packets: FakeVoicePacket[];
  waitForPackets(count: number, timeout?: number): Promise<FakeVoicePacket[]>;
}

/**
 * A local voice server of Discord: the voice gateway (v8, JSON and binary
 * messages) and its UDP socket, which answers IP Discovery and decrypts
 * the audio it receives. Closed when the test ends.
 */
export async function fakeVoice(
  options: Partial<FakeVoiceBehavior> = {}
): Promise<FakeVoice> {
  const behavior: FakeVoiceBehavior = {
    heartbeatInterval: 45_000,
    ackHeartbeats: true,
    modes: ['aead_aes256_gcm_rtpsize', 'aead_xchacha20_poly1305_rtpsize'],
    daveVersion: 0,
    answer: true,
    ...options,
  };
  const secretKey = randomBytes(32);
  const ssrc = 4242;
  const connections: FakeVoiceConnection[] = [];
  const connectionWaiters: (() => void)[] = [];
  const packets: FakeVoicePacket[] = [];
  const packetWaiters: (() => void)[] = [];
  let mode = '';

  const udp = createSocket('udp4');
  udp.on('message', (message, from) => {
    if (message.length === 74 && message.readUInt16BE(0) === 1) {
      const answer = Buffer.alloc(74);
      answer.writeUInt16BE(2, 0);
      answer.writeUInt16BE(70, 2);
      answer.writeUInt32BE(message.readUInt32BE(4), 4);
      answer.write(from.address, 8, 'utf8');
      answer.writeUInt16BE(from.port, 72);
      udp.send(answer, from.port, from.address);
      return;
    }
    if (message.length < 12 + 16 + 4) return;
    const header = message.subarray(0, 12);
    let payload: Buffer | null = null;
    if (mode === 'aead_aes256_gcm_rtpsize') {
      const nonce = Buffer.alloc(12);
      message.copy(nonce, 0, message.length - 4);
      const sealed = message.subarray(12, message.length - 4);
      const decipher = createDecipheriv('aes-256-gcm', secretKey, nonce);
      decipher.setAAD(header);
      decipher.setAuthTag(sealed.subarray(sealed.length - 16));
      payload = Buffer.concat([
        decipher.update(sealed.subarray(0, sealed.length - 16)),
        decipher.final(),
      ]);
    }
    packets.push({
      sequence: header.readUInt16BE(2),
      timestamp: header.readUInt32BE(4),
      ssrc: header.readUInt32BE(8),
      payload,
    });
    for (const resolve of packetWaiters.splice(0)) resolve();
  });
  await new Promise<void>(resolve => udp.bind(0, '127.0.0.1', resolve));
  const udpPort = udp.address().port;
  onTestFinished(
    () => new Promise<void>(resolve => udp.close(() => resolve()))
  );

  const { host, port } = await webSocketServer((peer, _request, on) => {
    let sequence = 0;
    const waiters: (() => void)[] = [];
    const wake = () => {
      for (const resolve of waiters.splice(0)) resolve();
    };
    const until = async <T>(
      find: () => T | undefined,
      timeout: number,
      what: string
    ): Promise<T> => {
      const deadline = Date.now() + timeout;
      for (;;) {
        const found = find();
        if (found !== undefined) return found;
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new Error(
            `The fake voice server waited ${timeout}ms for ${what}. Received: ${JSON.stringify(connection.received)}`
          );
        }
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, left);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    };
    const connection: FakeVoiceConnection = {
      query: peer.query,
      received: [],
      binary: [],
      get closed() {
        return peer.closed;
      },
      send(payload) {
        peer.sendText(JSON.stringify(payload));
      },
      sendBinary(op, payload) {
        const message = Buffer.alloc(payload.length + 3);
        message.writeUInt16BE(++sequence & 0xffff, 0);
        message[2] = op;
        message.set(payload, 3);
        peer.sendBinary(message);
      },
      close: code => peer.close(code),
      drop: () => peer.drop(),
      waitFor(match, timeout = 2000) {
        const test =
          typeof match === 'number'
            ? (payload: FakeVoicePayload) => payload.op === match
            : match;
        return until(
          () => connection.received.find(test),
          timeout,
          `a payload ${typeof match === 'number' ? `of op ${match}` : ''}`
        );
      },
      waitForBinary(op, timeout = 2000) {
        return until(
          () => connection.binary.find(message => message.op === op)?.payload,
          timeout,
          `a binary message of op ${op}`
        );
      },
      waitForClose: timeout => peer.waitForClose(timeout),
    };

    on.message(data => {
      if (typeof data !== 'string') {
        connection.binary.push({ op: data[0]!, payload: data.subarray(1) });
        wake();
        return;
      }
      const payload = JSON.parse(data) as FakeVoicePayload;
      connection.received.push(payload);
      wake();
      const d = (payload.d ?? {}) as Record<string, unknown>;
      if (payload.op === 3 && behavior.ackHeartbeats) {
        connection.send({ op: 6, d: { t: d.t } });
      } else if (payload.op === 0 && behavior.answer) {
        connection.send({
          op: 2,
          d: {
            ssrc,
            ip: '127.0.0.1',
            port: udpPort,
            modes: behavior.modes,
            heartbeat_interval: 1,
          },
        });
      } else if (payload.op === 1) {
        const data = d.data as { mode: string };
        mode = data.mode;
        connection.send({
          op: 4,
          d: {
            mode,
            secret_key: [...secretKey],
            dave_protocol_version: behavior.daveVersion,
          },
        });
      } else if (payload.op === 7) {
        connection.send({ op: 9, d: null });
      }
    });

    connections.push(connection);
    for (const resolve of connectionWaiters.splice(0)) resolve();
    connection.send({
      op: 8,
      d: { heartbeat_interval: behavior.heartbeatInterval },
    });
  });

  return {
    endpoint: `${host}:${port}`,
    behavior,
    connections,
    async connection(index, timeout = 2000) {
      const deadline = Date.now() + timeout;
      while (connections.length <= index) {
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new Error(
            `The fake voice server waited ${timeout}ms for connection ${index}: only ${connections.length} were opened.`
          );
        }
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, left);
          connectionWaiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      return connections[index]!;
    },
    secretKey,
    ssrc,
    packets,
    async waitForPackets(count, timeout = 3000) {
      const deadline = Date.now() + timeout;
      while (packets.length < count) {
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new Error(
            `The fake voice server waited ${timeout}ms for ${count} packets: ${packets.length} came.`
          );
        }
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, left);
          packetWaiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      return packets.slice(0, count);
    },
  };
}
