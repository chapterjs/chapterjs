// A bot split over several processes has one copy of its data: the first
// process keeps it (with the file backend) and the others ask it over
// IPC, the channel they already share with it. Each process then sees the
// same thing, whichever shard a command was used on.

import {
  encodeKey,
  KeyQueue,
  type StoreBackend,
  type StoreChange,
  type StoreEntry,
  type StoreKeyParts,
  type StoreListedEntry,
} from './backend.js';

/** How many times an update is tried before giving up: the value changes faster than it can be read. */
export const UPDATE_ATTEMPTS = 50;

/** Two entries are the same when their JSON is: what crossed the channel kept its order. */
const same = (a: StoreEntry | undefined, b: StoreEntry | null): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b);

/** What a process asks the first one. */
export type StoreRequest = { type: 'store'; id: number } & (
  | { op: 'get'; store: string; key: StoreKeyParts }
  | { op: 'set'; store: string; key: StoreKeyParts; entry: StoreEntry }
  | { op: 'delete'; store: string; key: StoreKeyParts }
  | { op: 'entries'; store: string; prefix: StoreKeyParts }
  | { op: 'clear'; store: string; prefix: StoreKeyParts }
  /** Keeps `entry` only if the entry is still `expected` (`null`: none). */
  | {
      op: 'swap';
      store: string;
      key: StoreKeyParts;
      expected: StoreEntry | null;
      entry: StoreEntry;
    }
);

/** What the first process answers. */
export interface StoreReply {
  type: 'store';
  id: number;
  result?: unknown;
  error?: string;
}

/** `Omit` on each member of a union, not on what they share. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** The two ends of a channel, as a process and its child have them. */
export interface Channel<Out, In> {
  send(message: Out): void;
  on(listener: (message: In) => void): void;
}

export const isStoreRequest = (message: unknown): message is StoreRequest =>
  typeof message === 'object' &&
  message !== null &&
  (message as { type?: unknown }).type === 'store' &&
  'op' in message;

export const isStoreReply = (message: unknown): message is StoreReply =>
  typeof message === 'object' &&
  message !== null &&
  (message as { type?: unknown }).type === 'store' &&
  !('op' in message);

/** What an update says when it never got through. */
export const tooBusy = (store: string): string =>
  `The value of ${store} changed ${UPDATE_ATTEMPTS} times while update() was trying to change it: it is written too often by too many at once. Keep what changes this often under several keys.`;

/** The backend of a process that is not the first: every call is a message. */
export class IpcStoreBackend implements StoreBackend {
  readonly #channel: Channel<StoreRequest, unknown>;
  readonly #waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  #lastId = 0;
  readonly #updates = new KeyQueue();

  constructor(channel: Channel<StoreRequest, unknown>) {
    this.#channel = channel;
    channel.on(message => {
      if (!isStoreReply(message)) return;
      const pending = this.#waiting.get(message.id);
      if (!pending) return;
      this.#waiting.delete(message.id);
      if (message.error !== undefined) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
    });
  }

  #ask<T>(request: DistributiveOmit<StoreRequest, 'type' | 'id'>): Promise<T> {
    const id = ++this.#lastId;
    return new Promise<T>((resolve, reject) => {
      this.#waiting.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.#channel.send({ type: 'store', id, ...request } as StoreRequest);
    });
  }

  get(store: string, key: StoreKeyParts): Promise<StoreEntry | undefined> {
    return this.#ask({ op: 'get', store, key });
  }

  set(store: string, key: StoreKeyParts, entry: StoreEntry): Promise<void> {
    return this.#ask({ op: 'set', store, key, entry });
  }

  delete(store: string, key: StoreKeyParts): Promise<boolean> {
    return this.#ask({ op: 'delete', store, key });
  }

  entries(store: string, prefix: StoreKeyParts): Promise<StoreListedEntry[]> {
    return this.#ask({ op: 'entries', store, prefix });
  }

  /**
   * A change can't cross the channel: it runs here, on what the first
   * process gave, and the first process keeps the result only if nobody
   * wrote in between; otherwise it runs again on the new value.
   */
  update(
    store: string,
    key: StoreKeyParts,
    change: StoreChange
  ): Promise<StoreEntry | undefined> {
    return this.#updates.run(`${store}\u0000${encodeKey(key)}`, () =>
      this.#update(store, key, change)
    );
  }

  async #update(
    store: string,
    key: StoreKeyParts,
    change: StoreChange
  ): Promise<StoreEntry | undefined> {
    for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt++) {
      const current = await this.get(store, key);
      const next = change(current);
      if (next === undefined) return current;
      const kept = await this.#ask<boolean>({
        op: 'swap',
        store,
        key,
        expected: current ?? null,
        entry: next,
      });
      if (kept) return next;
    }
    throw new Error(tooBusy(store));
  }

  clear(store: string, prefix: StoreKeyParts): Promise<number> {
    return this.#ask({ op: 'clear', store, prefix });
  }

  async close(): Promise<void> {
    // Nothing is kept here: the first process writes.
  }
}

/**
 * In the first process: answers the requests of one other process with
 * the real backend. Returns what to call with each message received from
 * that process; a message that is not a request is ignored.
 */
export function serveStores(
  backend: StoreBackend,
  reply: (message: StoreReply) => void
): (message: unknown) => void {
  return message => {
    if (!isStoreRequest(message)) return;
    const { id } = message;
    const run = (): Promise<unknown> => {
      switch (message.op) {
        case 'get':
          return backend.get(message.store, message.key);
        case 'set':
          return backend.set(message.store, message.key, message.entry);
        case 'delete':
          return backend.delete(message.store, message.key);
        case 'entries':
          return backend.entries(message.store, message.prefix);
        case 'clear':
          return backend.clear(message.store, message.prefix);
        case 'swap': {
          let kept = false;
          const { expected, entry } = message;
          return backend
            .update(message.store, message.key, current => {
              kept = same(current, expected);
              return kept ? entry : undefined;
            })
            .then(() => kept);
        }
      }
    };
    run().then(
      result => reply({ type: 'store', id, result }),
      (error: unknown) =>
        reply({
          type: 'store',
          id,
          error: error instanceof Error ? error.message : String(error),
        })
    );
  };
}
