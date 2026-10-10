# `store/`: what the bot keeps from one restart to the next

`export const warnings = store<Warning[]>({ scope?, expires? })`, from any file of `src/`. The name of the export is the name of the store (a default export takes the name of its file; two stores with the same name are reported, the later one left out, since they would share a file; a list is refused). `store()` is typed the same everywhere, so it is a normal export of `index.ts`. The core it is built on is described in `packages/chapterjs/CLAUDE.md`.

## `store.ts`: what the user holds

- `store<T>(config)` returns a `Store<T>`: `get`, `set`, `update` (read, change, keep in one go; the expiration stays unless `options` give one), `delete`, `entries(prefix?)` (`StoreEntry<T>[]`: `key` without the scope, `value`, `expires: Date | null`), `ttl` (ms, `null` forever, `undefined` none) and `in(guild)` (the same store for one server: a `ScopedStore<T>`, everything but `in`).
- A key (`StoreKey`) is a text or a list of texts (`parts()` refuses an empty list, an empty text and anything that is not a text); `entries()` lists by prefix. The backend gets the full key: the scope first (`[guildId, ...key]` for a store per server, the key itself for a global one).
- A value is JSON: `checkJson()` refuses `undefined`, non-finite numbers, bigints, functions, symbols, and any object whose prototype is not `Object.prototype` or `null` (a `Date`, a `Map`, a class instance), naming the path (`the value.list[0].at is a Date`) and what to keep instead.
- Expiration: `expires` on the config (a `Duration`, 1 s at least) is the default of every `set()`; `set()`/`update()` take `{ expires: Duration | Date | null }`. The backend keeps `expiresAt` in ms; `Date.now()` is the clock of the store, the backend has its own `now` (tests mock both).
- The state behind `Symbol.for('chapterjs.store')` (`storeStateOf`) holds the config and, once the loader bound it (`bindStore`), the `name`, `scope` and `expires`. Before that, every call throws "This store was not loaded by ChapterJS…": a store that is not exported refuses to serve, like a component. The store object keeps no data: the backend does, by name, so a reload (a new module, bound again to the same name) sees the same data.

## `scope.ts`: the server the code runs for

An `AsyncLocalStorage<string | null>`: `withGuild(guildId, fn)` and `currentGuildId()` (`null` for a function that runs for no server, `undefined` outside any function the framework runs). Set by the routers around every function they run: `runInteraction` (`guildId` in `RunOptions`, from `place.guild`), `EventRouter.emit` (the `guildOf` of the event), `TimerScheduler` (`null`). It follows the `await`s into the files the function imports. A store per server without a current server throws "`<name>` is a store per server, and this code does not run in one: use `<name>.in(guild)`…"; `in(guild)` overrides it.

## `backend.ts`, `file-backend.ts`, `ipc-backend.ts`: where the data is

- `StoreBackend` (`get`, `set`, `delete`, `entries(prefix)`, `close`) over `StoreEntry { value, expiresAt }` and full keys. `setStoreBackend()` gives it to every store of the process (called by `createProject`); `storeBackend()` throws "Stores only work while the bot runs" without one. `encodeKey` is `JSON.stringify(parts)`: unambiguous whatever the parts hold.
- `FileStoreBackend(dir)`: the default, `data/` of the project (`DATA_FOLDER`), one `<name>.json` per store (`{ version: 1, entries: [[key, value, expiresAt], …] }`), loaded on first use (a file it did not write is an error naming it; a name a file can't be called is refused), kept in memory, written after `writeDelay` (100 ms, one write per burst) atomically (`<file>.<pid>.tmp` then rename) and on `process.on('exit')` (synchronous), expired entries dropped when read, when asked for, and by a sweep every `sweepEvery` (60 s, unref'd). `close()` writes what is pending and stops the sweep.
- `IpcStoreBackend(channel)`: the backend of a process started by another: every call is a `StoreRequest` (`{ type: 'store', id, op, store, key | prefix, entry? }`) sent on the channel, answered by a `StoreReply` (`{ type: 'store', id, result | error }`). `serveStores(backend, reply)` is what the first process runs on each message of a child: `cli/cluster.ts` registers it per worker, so the coordinator's `FileStoreBackend` is the one home of the data; `cli/start.ts` gives a worker the IPC backend (`stores` of `createProject`) and the coordinator passes its backend to `runCluster` (`stores`). `Channel<Out, In>` is the two ends as a process and a fork have them, so tests join two emitters.

## `declaration.ts` and the wiring

- The `Declaration` of stores: `read` checks the keys (`scope`, `expires`), the scope, the expiration (`DURATION_EXAMPLE`, 1 s at least) and that the name can name a file (`[\w.-]+`), then binds the store → `LoadedStore { name, scope, expires }`.
- `cli/project.ts` loads it with the others (`sameNames(…, 'store')` for duplicates), counts it in `summary` ("2 stores"), creates the backend (`options.stores`, else the file one) and exposes `storeBackend` and `closeStores()`, which `dev` and `start` await when stopping. `data/` is in the `_gitignore` of every template.
- Not written yet: another backend (Redis, a database) is an implementation of `StoreBackend` and an option; `scope: 'user'`; `onExpire`.
