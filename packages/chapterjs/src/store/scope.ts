// The server the code runs for, known to the framework and not written by
// the user: a store per server reads it, so `warnings.get(member.id)` in a
// command is the warnings of the server the command was used in. Set by
// the routers around every function they run, on an asynchronous context
// of Node, so it follows the `await`s into the files the function imports.

import { AsyncLocalStorage } from 'node:async_hooks';

/** The id of the server the current function runs for, or `null` for none. */
const scope = new AsyncLocalStorage<string | null>();

/** Runs `fn` for a server (or for none, with `null`). */
export function withGuild<T>(guildId: string | null, fn: () => T): T {
  return scope.run(guildId, fn);
}

/**
 * The id of the server the current function runs for: `null` when it runs
 * for none (a task, a private message), `undefined` outside any function
 * the framework runs.
 */
export function currentGuildId(): string | null | undefined {
  return scope.getStore();
}
