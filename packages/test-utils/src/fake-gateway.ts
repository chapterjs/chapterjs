import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { onTestFinished } from 'vitest';

/** A payload exchanged with the gateway: `{ op, d, s, t }`. */
export interface FakeGatewayPayload {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

/** One WebSocket connection the code under test opened. */
export interface FakeGatewayConnection {
  /** The query string of the URL it connected to (`v`, `encoding`...). */
  query: Record<string, string>;
  /** Every payload received from the code under test, in order. */
  received: FakeGatewayPayload[];
  /** Set once the connection is closed, with the code the client gave. */
  closed: { code: number | null } | null;
  /** Sends any payload. */
  send(payload: FakeGatewayPayload): void;
  /** Sends a Dispatch (opcode 0) with the next sequence number. */
  dispatch(type: string, data: unknown): void;
  /** Closes the connection with a close code, as Discord does. */
  close(code: number): void;
  /** Drops the connection without a close frame (a network failure). */
  drop(): void;
  /** Resolves with the next (or an already received) payload that matches. */
  waitFor(
    match: number | ((payload: FakeGatewayPayload) => boolean),
    timeout?: number
  ): Promise<FakeGatewayPayload>;
  /** Resolves when the connection is closed, with the client's close code. */
  waitForClose(timeout?: number): Promise<number | null>;
}

/** How the fake gateway reacts; change it at any time during a test. */
export interface FakeGatewayBehavior {
  /** The `heartbeat_interval` of Hello, in ms; `null` sends no Hello. */
  heartbeatInterval: number | null;
  /** Whether heartbeats are acknowledged. */
  ackHeartbeats: boolean;
  /**
   * Called for each Identify (opcode 2). By default answers with a Ready
   * built from `ready`.
   */
  onIdentify: (connection: FakeGatewayConnection, data: unknown) => void;
  /** Called for each Resume (opcode 6). By default answers Resumed. */
  onResume: (connection: FakeGatewayConnection, data: unknown) => void;
  /** Fields of the Ready event sent by the default `onIdentify`. */
  ready: Record<string, unknown>;
}

export interface FakeGateway {
  /** The URL to connect to: `ws://127.0.0.1:port`. */
  url: string;
  behavior: FakeGatewayBehavior;
  /** Every connection received, in order. */
  connections: FakeGatewayConnection[];
  /** Resolves with the connection number `index` (0 is the first one). */
  connection(index: number, timeout?: number): Promise<FakeGatewayConnection>;
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

/**
 * A local WebSocket server that plays the Discord gateway: tests run the
 * real connection code against it. By default it says Hello, acknowledges
 * heartbeats, answers Identify with Ready and Resume with Resumed; every
 * part of that can be changed through `behavior`, and each connection can
 * be driven by hand. Closed when the current test ends.
 */
export async function fakeGateway(
  options: Partial<FakeGatewayBehavior> = {}
): Promise<FakeGateway> {
  const connections: FakeGatewayConnection[] = [];
  const connectionWaiters: (() => void)[] = [];
  const sockets = new Set<Duplex>();
  let sessions = 0;

  const behavior: FakeGatewayBehavior = {
    heartbeatInterval: 45_000,
    ackHeartbeats: true,
    ready: {},
    onIdentify(connection) {
      connection.dispatch('READY', {
        v: 10,
        user: { id: '100000000000000002', username: 'bot', discriminator: '0' },
        guilds: [],
        session_id: `session-${++sessions}`,
        resume_gateway_url: url,
        application: { id: '100000000000000002', flags: 0 },
        ...behavior.ready,
      });
    },
    onResume(connection) {
      connection.dispatch('RESUMED', {});
    },
    ...options,
  };

  const server = createServer((_, res) => res.writeHead(426).end());
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const accept = createHash('sha1')
      .update(key + GUID)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    sockets.add(socket);

    let sequence = 0;
    const waiters: {
      match: (payload: FakeGatewayPayload) => boolean;
      resolve: (payload: FakeGatewayPayload) => void;
    }[] = [];
    const closeWaiters: ((code: number | null) => void)[] = [];
    const markClosed = (code: number | null) => {
      if (connection.closed) return;
      connection.closed = { code };
      sockets.delete(socket);
      for (const resolve of closeWaiters.splice(0)) resolve(code);
    };

    const connection: FakeGatewayConnection = {
      query: Object.fromEntries(
        new URL(req.url ?? '/', 'http://localhost').searchParams
      ),
      received: [],
      closed: null,
      send(payload) {
        if (connection.closed) return;
        socket.write(frame(0x1, Buffer.from(JSON.stringify(payload))));
      },
      dispatch(type, data) {
        connection.send({ op: 0, t: type, s: ++sequence, d: data });
      },
      close(code) {
        if (connection.closed) return;
        const body = Buffer.alloc(2);
        body.writeUInt16BE(code);
        socket.end(frame(0x8, body));
        markClosed(null);
      },
      drop() {
        socket.destroy();
        markClosed(null);
      },
      waitFor(match, timeout = 2000) {
        const test =
          typeof match === 'number'
            ? (payload: FakeGatewayPayload) => payload.op === match
            : match;
        const found = connection.received.find(test);
        if (found) return Promise.resolve(found);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `The fake gateway waited ${timeout}ms for a payload that never came. Received: ${JSON.stringify(connection.received)}`
                )
              ),
            timeout
          );
          waiters.push({
            match: test,
            resolve: payload => {
              clearTimeout(timer);
              resolve(payload);
            },
          });
        });
      },
      waitForClose(timeout = 2000) {
        if (connection.closed) return Promise.resolve(connection.closed.code);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `The fake gateway waited ${timeout}ms for the connection to close.`
                )
              ),
            timeout
          );
          closeWaiters.push(code => {
            clearTimeout(timer);
            resolve(code);
          });
        });
      },
    };

    const onPayload = (payload: FakeGatewayPayload) => {
      connection.received.push(payload);
      for (let index = waiters.length - 1; index >= 0; index--) {
        if (waiters[index]!.match(payload)) {
          waiters.splice(index, 1)[0]!.resolve(payload);
        }
      }
      if (payload.op === 1 && behavior.ackHeartbeats) {
        connection.send({ op: 11 });
      } else if (payload.op === 2) {
        behavior.onIdentify(connection, payload.d);
      } else if (payload.op === 6) {
        behavior.onResume(connection, payload.d);
      }
    };

    // Client frames are masked; a message may come in several frames.
    let buffer = Buffer.alloc(0);
    let fragments: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 2) return;
        const fin = (buffer[0]! & 0x80) !== 0;
        const opcode = buffer[0]! & 0x0f;
        let length = buffer[1]! & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        if (buffer.length < offset + 4 + length) return;
        const mask = buffer.subarray(offset, offset + 4);
        const data = Buffer.from(
          buffer.subarray(offset + 4, offset + 4 + length)
        );
        for (let index = 0; index < data.length; index++) {
          data[index]! ^= mask[index % 4]!;
        }
        buffer = buffer.subarray(offset + 4 + length);

        if (opcode === 0x8) {
          const code = data.length >= 2 ? data.readUInt16BE(0) : null;
          if (!connection.closed) socket.end(frame(0x8, data.subarray(0, 2)));
          markClosed(code);
          return;
        }
        if (opcode === 0x9) {
          socket.write(frame(0xa, data));
          continue;
        }
        if (opcode === 0xa) continue;
        fragments.push(data);
        if (fin) {
          const text = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          onPayload(JSON.parse(text) as FakeGatewayPayload);
        }
      }
    });
    socket.on('close', () => markClosed(null));
    socket.on('error', () => markClosed(null));

    connections.push(connection);
    for (const resolve of connectionWaiters.splice(0)) resolve();
    if (behavior.heartbeatInterval !== null) {
      connection.send({
        op: 10,
        d: { heartbeat_interval: behavior.heartbeatInterval },
      });
    }
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  onTestFinished(
    () =>
      new Promise<void>(resolve => {
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );

  return {
    url,
    behavior,
    connections,
    async connection(index, timeout = 2000) {
      const deadline = Date.now() + timeout;
      while (connections.length <= index) {
        const left = deadline - Date.now();
        if (left <= 0) {
          throw new Error(
            `The fake gateway waited ${timeout}ms for connection ${index}: only ${connections.length} were opened.`
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
  };
}
