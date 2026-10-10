// Several processes for one bot. Discord splits a bot into shards, each
// receiving the events of some servers; a process can only use one CPU, so
// a large bot spreads its shards over several processes. The first process
// (the one the developer started) checks everything once, then starts the
// others and looks after them; each of them runs the project for its share
// of the shards.
//
// What processes must agree on goes through the first one: when a shard may
// identify. A setup on several machines would give each process another
// `IdentifyGate`, and nothing else here would change.
// https://docs.discord.com/developers/events/gateway#sharding

import type { StoreBackend } from '../store/backend.js';
import {
  serveStores,
  type StoreReply,
  type StoreRequest,
} from '../store/ipc-backend.js';
import { fork, type ChildProcess } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { IdentifyQueue, type IdentifyGate } from '../gateway/identify-queue.js';

/** How many shards one process runs when nothing else is asked. */
export const SHARDS_PER_PROCESS = 4;

/** The exit code of a process Discord refused for good: not started again. */
export const REFUSED = 78;

/** The share of one process, given to it when it starts. */
export interface Assignment {
  /** Which process this is, from 0. */
  index: number;
  /** How many processes run the bot. */
  processes: number;
  /** The shards it runs, out of `count`. */
  ids: number[];
  count: number;
}

/** The name of the variable a process finds its share in. */
export const ASSIGNMENT_VARIABLE = 'CHAPTERJS_PROCESS';

type FromWorker =
  | { type: 'identify'; shard: number; id: number }
  | { type: 'ready'; guilds: number; user: string }
  | { type: 'refused' }
  | StoreRequest;
type ToWorker =
  { type: 'identify'; id: number } | { type: 'stop' } | StoreReply;

/**
 * How many processes run a bot of `shards` shards: what was asked, or one
 * for every few shards, never more than the machine has CPUs.
 */
export function planProcesses(
  shards: number,
  asked?: number,
  cpus = availableParallelism()
): number {
  const wanted =
    asked ?? Math.min(cpus, Math.ceil(shards / SHARDS_PER_PROCESS));
  return Math.max(1, Math.min(shards, Math.floor(wanted)));
}

/** The shards of each process: as even as it gets, in order. */
export function splitShards(count: number, processes: number): number[][] {
  const shares: number[][] = [];
  let next = 0;
  for (let index = 0; index < processes; index++) {
    const size = Math.ceil((count - next) / (processes - index));
    shares.push(Array.from({ length: size }, (_, offset) => next + offset));
    next += size;
  }
  return shares;
}

/** Reads the share of this process, if it was started by another one. */
export function readAssignment(
  env: Record<string, string | undefined>
): Assignment | null {
  const raw = env[ASSIGNMENT_VARIABLE];
  return raw ? (JSON.parse(raw) as Assignment) : null;
}

/**
 * In a process started by another: asks that one when a shard may
 * identify, and hears when to stop.
 */
export function connectToPrimary(): {
  gate: IdentifyGate;
  ready(info: { guilds: number; user: string }): void;
  refused(): void;
  /** Resolves when this process is asked to stop, or is left alone. */
  stopped: Promise<void>;
} {
  const waiting = new Map<number, () => void>();
  let lastId = 0;
  const send = (message: FromWorker): void => {
    // The first process may be gone: there is nobody to tell any more.
    if (process.connected) process.send?.(message);
  };
  let stop!: () => void;
  const stopped = new Promise<void>(resolve => (stop = resolve));
  process.on('message', (message: ToWorker) => {
    if (message.type === 'identify') {
      waiting.get(message.id)?.();
      waiting.delete(message.id);
    } else if (message.type === 'stop') {
      stop();
    }
  });
  // Without the process that started it, nothing looks after this one.
  process.on('disconnect', stop);
  return {
    gate: {
      wait: shard =>
        new Promise<void>(resolve => {
          const id = ++lastId;
          waiting.set(id, resolve);
          send({ type: 'identify', shard, id });
        }),
    },
    ready: info => send({ type: 'ready', ...info }),
    refused: () => send({ type: 'refused' }),
    stopped,
  };
}

export interface ClusterOptions {
  /** The file to run in each process, and its arguments. */
  script: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  shards: number;
  processes: number;
  maxConcurrency: number;
  /** Aborted when the bot is asked to stop. */
  signal: AbortSignal;
  /** Shows a line printed by one of the processes. */
  write: (line: string) => void;
  /** Where the data of the stores is: this process keeps it for the others. */
  stores: StoreBackend;
  /** Every process is connected, for the first time. */
  onReady: (info: { guilds: number; user: string }) => void;
  /** A process stopped by itself and is started again. */
  onRestart: (index: number, why: string) => void;
  /** Only tests change these. */
  identifyInterval?: number | undefined;
  restartDelay?: number;
  stopTimeout?: number;
}

/**
 * Sends a message to a process, and says whether it could. A process that
 * is exiting has a channel that fails: the error goes to the callback
 * instead of crashing the first process.
 */
function tell(child: ChildProcess, message: ToWorker): boolean {
  if (!child.connected) return false;
  child.send(message, () => {});
  return true;
}

/**
 * Starts the processes of the bot and looks after them until asked to
 * stop. Resolves with the exit code: 0 when stopped, 1 when Discord refused
 * the bot.
 */
export async function runCluster(options: ClusterOptions): Promise<number> {
  const { signal } = options;
  const gate = new IdentifyQueue(
    options.maxConcurrency,
    options.identifyInterval
  );
  const shares = splitShards(options.shards, options.processes);
  const workers = new Map<number, ChildProcess>();
  const stopped = new WeakSet<ChildProcess>();
  const ready = new Map<number, { guilds: number; user: string }>();
  let announced = false;
  let refused = false;
  let end!: () => void;
  const ended = new Promise<void>(resolve => (end = resolve));
  const stopping = (): boolean => signal.aborted || refused;

  const start = (index: number, delay: number): void => {
    const assignment: Assignment = {
      index,
      processes: options.processes,
      ids: shares[index]!,
      count: options.shards,
    };
    const started = Date.now();
    const child = fork(options.script, [...options.args], {
      env: {
        ...options.env,
        [ASSIGNMENT_VARIABLE]: JSON.stringify(assignment),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    workers.set(index, child);
    // A message sent while the process exits fails; it must not stop this
    // one (see `tell`), and its exit is what matters.
    child.on('error', () => {});
    // Everything a process prints (the framework and the code of the
    // project alike) is shown with which one said it.
    for (const stream of [child.stdout!, child.stderr!]) {
      createInterface({ input: stream }).on('line', line =>
        options.write(`[${index + 1}] ${line}`)
      );
    }
    const stores = serveStores(options.stores, reply => tell(child, reply));
    child.on('message', (message: FromWorker) => {
      stores(message);
      if (message.type !== 'store' && message.type === 'identify') {
        void gate.wait(message.shard).then(() => {
          tell(child, { type: 'identify', id: message.id });
        });
      } else if (message.type === 'ready') {
        ready.set(index, message);
        if (!announced && ready.size === options.processes) {
          announced = true;
          options.onReady({
            guilds: [...ready.values()].reduce((sum, r) => sum + r.guilds, 0),
            user: message.user,
          });
        }
      } else if (message.type === 'refused') {
        refused = true;
      }
    });
    child.on('exit', (code, killedBy) => {
      workers.delete(index);
      if (code === REFUSED) refused = true;
      if (stopping()) {
        // The others have nothing to wait for either.
        for (const other of workers.values()) stopWorker(other);
        if (workers.size === 0) end();
        return;
      }
      // A process that ran for a while starts again at once; one that
      // keeps falling waits longer each time.
      const next =
        Date.now() - started > 60_000
          ? (options.restartDelay ?? 1000)
          : Math.min(60_000, Math.max(delay, 1) * 2);
      options.onRestart(
        index,
        killedBy ? `stopped by ${killedBy}` : `exit code ${code}`
      );
      void sleep(delay).then(() => {
        if (stopping()) {
          if (workers.size === 0) end();
        } else {
          start(index, next);
        }
      });
    });
  };

  const stopWorker = (child: ChildProcess): void => {
    // Asked once: a process already stopping has nothing more to hear.
    if (stopped.has(child)) return;
    stopped.add(child);
    if (!tell(child, { type: 'stop' })) child.kill('SIGTERM');
    // A process that does not stop is not waited for forever.
    const timer = setTimeout(
      () => child.kill('SIGKILL'),
      options.stopTimeout ?? 15_000
    );
    timer.unref();
    child.once('exit', () => clearTimeout(timer));
  };

  for (let index = 0; index < options.processes; index++) {
    start(index, options.restartDelay ?? 1000);
  }
  const stopAll = (): void => {
    if (workers.size === 0) end();
    for (const child of workers.values()) stopWorker(child);
  };
  if (signal.aborted) stopAll();
  else signal.addEventListener('abort', stopAll, { once: true });
  await ended;
  return refused ? 1 : 0;
}
