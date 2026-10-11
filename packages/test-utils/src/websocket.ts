// The WebSocket server of `chapterjs/src/testing/`, closed when the
// current test ends. Imported from the sources of the framework: the
// fakes live there so that `chapterjs test` can run a bot against them,
// and this package only adds what tests need (closing with the test).
import { onTestFinished } from 'vitest';
import {
  webSocketServer as server,
  type WebSocketPeer,
} from '../../chapterjs/src/testing/websocket.js';

export type { WebSocketPeer };

/**
 * A local WebSocket server written on Node built-ins, for the fake servers
 * of Discord: it accepts every client, reads their (masked, possibly
 * fragmented) messages and answers pings. Closed when the test ends.
 */
export async function webSocketServer(
  ...args: Parameters<typeof server>
): Promise<{ url: string; host: string; port: number }> {
  const started = await server(...args);
  onTestFinished(() => started.close());
  return started;
}
