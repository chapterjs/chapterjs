// A bot split over several processes has one copy of its data: the first
// process keeps it (with the file backend) and the others ask it over
// IPC, the channel they already share with it. Each process then sees the
// same thing, whichever shard a command was used on.

import type {
  StoreBackend,
  StoreEntry,
  StoreKeyParts,
  StoreListedEntry,
} from './backend.js';

/** What a process asks the first one. */
export type StoreRequest = { type: 'store'; id: number } & (
  | { op: 'get'; store: string; key: StoreKeyParts }
  | { op: 'set'; store: string; key: StoreKeyParts; entry: StoreEntry }
  | { op: 'delete'; store: string; key: StoreKeyParts }
  | { op: 'entries'; store: string; prefix: StoreKeyParts }
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

/** The backend of a process that is not the first: every call is a message. */
export class IpcStoreBackend implements StoreBackend {
  readonly #channel: Channel<StoreRequest, unknown>;
  readonly #waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  #lastId = 0;

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
