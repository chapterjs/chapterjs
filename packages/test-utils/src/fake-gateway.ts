import { webSocketServer } from './websocket.js';

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

  let url = '';
  ({ url } = await webSocketServer((peer, _request, on) => {
    let sequence = 0;
    const waiters: {
      match: (payload: FakeGatewayPayload) => boolean;
      resolve: (payload: FakeGatewayPayload) => void;
    }[] = [];

    const connection: FakeGatewayConnection = {
      query: peer.query,
      received: [],
      get closed() {
        return peer.closed;
      },
      send(payload) {
        peer.sendText(JSON.stringify(payload));
      },
      dispatch(type, data) {
        connection.send({ op: 0, t: type, s: ++sequence, d: data });
      },
      close: code => peer.close(code),
      drop: () => peer.drop(),
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
      waitForClose: timeout => peer.waitForClose(timeout),
    };

    on.message(data => {
      if (typeof data !== 'string') return;
      const payload = JSON.parse(data) as FakeGatewayPayload;
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
    });

    connections.push(connection);
    for (const resolve of connectionWaiters.splice(0)) resolve();
    if (behavior.heartbeatInterval !== null) {
      connection.send({
        op: 10,
        d: { heartbeat_interval: behavior.heartbeatInterval },
      });
    }
  }));

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
