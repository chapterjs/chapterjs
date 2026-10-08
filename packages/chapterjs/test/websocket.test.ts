// How the end of a WebSocket is told, whatever the version of Node: Node 22
// fired only `error` when a connection was refused, Node 24 fires `error`
// then `close`.
import { describe, expect, it } from 'vitest';
import { onSocketEnd } from '../src/util/websocket.js';

/** A socket that fires what a test says, and counts its closes. */
function fakeSocket() {
  const target = new EventTarget();
  const socket = Object.assign(target, {
    closes: 0,
    close: () => void socket.closes++,
    error: () => target.dispatchEvent(new Event('error')),
    closed: (code: number) =>
      target.dispatchEvent(Object.assign(new Event('close'), { code })),
  });
  const ends: number[] = [];
  onSocketEnd(socket as unknown as WebSocket, code => ends.push(code));
  return { socket, ends };
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

describe('the end of a WebSocket', () => {
  it('is told once when an error is followed by its close (Node 24)', async () => {
    const { socket, ends } = fakeSocket();
    socket.error();
    socket.closed(1006);
    await nextTurn();
    await nextTurn();
    expect(ends).toEqual([1006]);
    expect(socket.closes).toBe(0);
  });

  it('is told when an error comes alone, and the socket released', async () => {
    const { socket, ends } = fakeSocket();
    socket.error();
    expect(ends).toEqual([]);
    await nextTurn();
    await nextTurn();
    expect(ends).toEqual([1006]);
    expect(socket.closes).toBe(1);
    // A close that comes after all is not a second end.
    socket.closed(1006);
    expect(ends).toEqual([1006]);
  });

  it('gives the code of a close', () => {
    const { socket, ends } = fakeSocket();
    socket.closed(4004);
    socket.closed(1000);
    expect(ends).toEqual([4004]);
  });
});
