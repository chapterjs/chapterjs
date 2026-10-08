/**
 * Calls `onEnd` once when a WebSocket ends, with its close code.
 *
 * A socket that could not connect fires `error`, then `close` with 1006.
 * Node 22 fired only `error` and left the socket connecting forever: a
 * `close` that has not come by the next turn of the event loop is taken as
 * that 1006, so how a socket ends never depends on the version of Node.
 */
export function onSocketEnd(
  ws: WebSocket,
  onEnd: (code: number) => void
): void {
  let ended = false;
  const end = (code: number): void => {
    if (ended) return;
    ended = true;
    onEnd(code);
  };
  ws.addEventListener('close', event => end(event.code));
  ws.addEventListener('error', () => {
    setImmediate(() => {
      if (ended) return;
      end(1006);
      try {
        ws.close();
      } catch {
        // Already closed or never opened: nothing to release.
      }
    });
  });
}
