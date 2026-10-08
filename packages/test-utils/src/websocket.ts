import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { onTestFinished } from 'vitest';

/** One WebSocket client of a `webSocketServer()`. */
export interface WebSocketPeer {
  /** The query string of the URL it connected to. */
  query: Record<string, string>;
  /** Set once the connection is closed, with the code the client gave. */
  closed: { code: number | null } | null;
  sendText(text: string): void;
  sendBinary(data: Uint8Array): void;
  /** Closes with a close code, as a server does. */
  close(code: number): void;
  /** Drops the connection without a close frame (a network failure). */
  drop(): void;
  /** Resolves when the connection is closed, with the client's close code. */
  waitForClose(timeout?: number): Promise<number | null>;
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(opcode: number, payload: Uint8Array): Buffer {
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
 * A local WebSocket server written on Node built-ins, for the fake servers
 * of Discord: it accepts every client, reads their (masked, possibly
 * fragmented) messages and answers pings. Closed when the test ends.
 */
export async function webSocketServer(
  onConnection: (
    peer: WebSocketPeer,
    request: IncomingMessage,
    on: {
      message: (handler: (data: string | Buffer) => void) => void;
    }
  ) => void
): Promise<{ url: string; host: string; port: number }> {
  const sockets = new Set<Duplex>();
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
    const closeWaiters: ((code: number | null) => void)[] = [];
    const markClosed = (code: number | null) => {
      if (peer.closed) return;
      peer.closed = { code };
      sockets.delete(socket);
      for (const resolve of closeWaiters.splice(0)) resolve(code);
    };
    let handler: (data: string | Buffer) => void = () => {};

    const peer: WebSocketPeer = {
      query: Object.fromEntries(
        new URL(req.url ?? '/', 'http://localhost').searchParams
      ),
      closed: null,
      sendText(text) {
        if (!peer.closed) socket.write(frame(0x1, Buffer.from(text)));
      },
      sendBinary(data) {
        if (!peer.closed) socket.write(frame(0x2, data));
      },
      close(code) {
        if (peer.closed) return;
        const body = Buffer.alloc(2);
        body.writeUInt16BE(code);
        socket.end(frame(0x8, body));
        markClosed(null);
      },
      drop() {
        socket.destroy();
        markClosed(null);
      },
      waitForClose(timeout = 2000) {
        if (peer.closed) return Promise.resolve(peer.closed.code);
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `The fake server waited ${timeout}ms for the connection to close.`
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

    // Client frames are masked; a message may come in several frames.
    let buffer = Buffer.alloc(0);
    let fragments: Buffer[] = [];
    let binary = false;
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
          if (!peer.closed) socket.end(frame(0x8, data.subarray(0, 2)));
          markClosed(code);
          return;
        }
        if (opcode === 0x9) {
          socket.write(frame(0xa, data));
          continue;
        }
        if (opcode === 0xa) continue;
        if (opcode === 0x1 || opcode === 0x2) binary = opcode === 0x2;
        fragments.push(data);
        if (fin) {
          const message = Buffer.concat(fragments);
          fragments = [];
          handler(binary ? message : message.toString('utf8'));
        }
      }
    });
    socket.on('close', () => markClosed(null));
    socket.on('error', () => markClosed(null));
    onConnection(peer, req, {
      message: next => {
        handler = next;
      },
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  onTestFinished(
    () =>
      new Promise<void>(resolve => {
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );
  return { url: `ws://127.0.0.1:${port}`, host: '127.0.0.1', port };
}
