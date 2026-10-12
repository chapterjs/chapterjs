// Waiting for what comes next: the next message of a channel, a click on
// the buttons of a message, a reaction. A function of the files asks
// (`channel.waitForMessage()`, `message.waitForClick()`...), the bot offers
// what Discord sends, and the first thing that fits ends the wait, or the
// time does. One mechanism for every kind: a new kind of wait is a new
// `WaitKind` and the place that offers it.
//
// Waits live in the process, behind the `Waiters` interface: everything of
// one server reaches one process (its shard), so a wait always hears what
// it waits for. A restart ends them: nothing is kept.

import { currentRun } from '../store/scope.js';

/** What can be waited for. */
export type WaitKind = 'message' | 'reaction' | 'click';

/** One wait, as a structure asks for it. */
export interface WaitRequest {
  readonly kind: WaitKind;
  /** Whether what is offered is what the wait is for. */
  match(offered: unknown): boolean;
  /** How many to take before the wait ends: 1 to wait for one. */
  readonly max: number;
  /** How long it waits, in milliseconds. */
  readonly within: number;
}

/**
 * Told when a run of the files starts and stops waiting, for `chapterjs
 * test`: a run that waits is not one to wait for.
 */
export interface WaitWatcher {
  parked(run: object): void;
  resumed(run: object): void;
}

/** The waits of a bot. */
export interface Waiters {
  /**
   * Waits for what fits the request, until `max` were taken or the time is
   * up: resolves with what was taken, in order (maybe nothing).
   */
  wait<T>(request: WaitRequest): Promise<T[]>;
  /** Whether a wait is waiting for this kind: nothing is built otherwise. */
  wants(kind: WaitKind): boolean;
  /**
   * Gives what just happened to the waits that want it. A click goes to
   * one wait only, and nothing else runs it: returns whether one took it.
   */
  offer(kind: WaitKind, offered: unknown): boolean;
  /** Ends every wait with what it has: the bot stops. */
  close(): void;
}

/** The kinds a single wait takes for itself: nothing else runs them. */
const EXCLUSIVE: ReadonlySet<WaitKind> = new Set(['click']);

interface Pending {
  readonly request: WaitRequest;
  readonly taken: unknown[];
  readonly run: object | undefined;
  readonly timer: NodeJS.Timeout;
  /** Ends the wait with what it took, or with the error of its test. */
  readonly end: (error?: unknown) => void;
}

/** The waits of a bot, in memory: the default. */
export class MemoryWaiters implements Waiters {
  readonly #pending = new Map<WaitKind, Set<Pending>>();
  /** How many waits each run has going. */
  readonly #runs = new Map<object, number>();
  readonly #watch: WaitWatcher | undefined;

  constructor(options: { watch?: WaitWatcher } = {}) {
    this.#watch = options.watch;
  }

  wait<T>(request: WaitRequest): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      const run = currentRun();
      const taken: unknown[] = [];
      const list = this.#pending.get(request.kind) ?? new Set<Pending>();
      this.#pending.set(request.kind, list);
      const pending: Pending = {
        request,
        taken,
        run,
        // Nothing of the bot waits for it: a wait never keeps it running.
        timer: setTimeout(() => pending.end(), request.within).unref(),
        end: error => {
          if (!list.delete(pending)) return;
          clearTimeout(pending.timer);
          if (list.size === 0) this.#pending.delete(request.kind);
          this.#leave(run);
          if (error === undefined) resolve(taken as T[]);
          else reject(error);
        },
      };
      list.add(pending);
      this.#enter(run);
    });
  }

  wants(kind: WaitKind): boolean {
    return (this.#pending.get(kind)?.size ?? 0) > 0;
  }

  offer(kind: WaitKind, offered: unknown): boolean {
    const list = this.#pending.get(kind);
    if (!list) return false;
    let took = false;
    for (const pending of [...list]) {
      let fits: boolean;
      try {
        fits = pending.request.match(offered);
      } catch (error) {
        // A test of the files that throws ends its wait with the error,
        // thrown where the files wait: reported with their line.
        pending.end(error ?? new Error('The test of the wait threw.'));
        continue;
      }
      if (!fits) continue;
      took = true;
      pending.taken.push(offered);
      if (pending.taken.length >= pending.request.max) pending.end();
      if (EXCLUSIVE.has(kind)) break;
    }
    return took;
  }

  close(): void {
    for (const list of [...this.#pending.values()]) {
      for (const pending of [...list]) pending.end();
    }
  }

  #enter(run: object | undefined): void {
    if (!run) return;
    const count = this.#runs.get(run) ?? 0;
    this.#runs.set(run, count + 1);
    if (count === 0) this.#watch?.parked(run);
  }

  #leave(run: object | undefined): void {
    if (!run) return;
    const count = (this.#runs.get(run) ?? 1) - 1;
    if (count > 0) {
      this.#runs.set(run, count);
      return;
    }
    this.#runs.delete(run);
    this.#watch?.resumed(run);
  }
}
