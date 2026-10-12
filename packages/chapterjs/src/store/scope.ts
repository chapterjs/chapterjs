// The server the code runs for, known to the framework and not written by
// the user: a store per server reads it, so `warnings.get(member.id)` in a
// command is the warnings of the server the command was used in. Set by
// the routers around every function they run, on an asynchronous context
// of Node, so it follows the `await`s into the files the function imports.

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One run of a function of the files: the server it runs for, or `null`
 * for none. A new object each time, so it also tells one run from another
 * (what waits for a message belongs to its run: `waiting/`).
 */
interface Run {
  readonly guildId: string | null;
}

const scope = new AsyncLocalStorage<Run>();

/** Runs `fn` for a server (or for none, with `null`), as one run. */
export function withGuild<T>(guildId: string | null, fn: () => T): T {
  return scope.run({ guildId }, fn);
}

/**
 * The id of the server the current function runs for: `null` when it runs
 * for none (a task, a private message), `undefined` outside any function
 * the framework runs.
 */
export function currentGuildId(): string | null | undefined {
  return scope.getStore()?.guildId;
}

/**
 * The run of a function of the files the current code belongs to, or
 * `undefined` outside any.
 */
export function currentRun(): object | undefined {
  return scope.getStore();
}

/**
 * The scope part of a key, for data per server or for the whole bot: the
 * id of the server the code runs for (`guildOf`), or nothing for a global
 * one. `what` names the kind of declaration in the message, when no server
 * is known.
 */
export function scopeParts(
  what: string,
  name: string,
  scope: 'guild' | 'global',
  guildOf: () => string | null
): string[] {
  if (scope === 'global') return [];
  const guildId = guildOf();
  if (!guildId) {
    throw new Error(
      `${name} is a ${what} per server, and this code does not run in one: use ${name}.in(guild) to say which server, or declare the ${what} with scope: 'global'.`
    );
  }
  return [guildId];
}

/** The id of what `in()` was given: a server, or its id. */
export function guildIdOf(guild: { id: string } | string): string {
  const id = typeof guild === 'string' ? guild : guild?.id;
  if (typeof id !== 'string' || id === '') {
    throw new TypeError(
      'in() takes a server (a Guild) or its id, like warnings.in(guild) or warnings.in(guild.id).'
    );
  }
  return id;
}
