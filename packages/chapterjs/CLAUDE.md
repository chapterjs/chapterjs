# packages/chapterjs

The framework and its `chapterjs` CLI (`dev`, `start`, `build`, `sync`). The rules of the repo are in the root `CLAUDE.md`; this file says how the package is built and what each core module does. The features have their own file next to their code: `src/events/CLAUDE.md`, `src/commands/CLAUDE.md`, `src/components/CLAUDE.md`, `src/messages/CLAUDE.md`, `src/tasks/CLAUDE.md`, `src/store/CLAUDE.md`, `src/voice/CLAUDE.md`. Read the one of the module you touch.

## Public API

- `src/index.ts`: the types of the package. Structure classes are exported **as types only**, plus errors, `Permissions`, enums and formatting helpers, and the user functions typed the same everywhere: `command()`, `button()`, `select()`, `modal()`, `embed()`, `task()`, `store()`, `presence()`, `language()`.
- `src/main.ts`: what is loaded at runtime: the same, plus `asset()`, typed per project.
- What exists today: the core, `chapterjs dev`, `chapterjs build`, `chapterjs start` (one process or several, on one machine), slash commands, events, components (buttons, select menus, modals, embeds, the layout of a message), tasks (every so often, or cron), stores (data kept from one restart to the next, per server, with an expiration), the presence, translated messages (one `language()` per language) and voice (joining a voice channel and playing there). Not written yet: context menu commands, recording voice, a bot spread over several machines.

## Layers

Everything lives in `src`, in layers that only depend on the ones above them in this list:

1. `discord/`: what never changes at runtime (types, endpoints, codes, intents, permissions).
2. `util/`: case translation, durations, the end of a WebSocket.
3. `rest/`: the only place HTTP requests are sent.
4. `cache/`: what the bot remembers.
5. `structures/`: what handlers receive.
6. `gateway/`: the connection that receives events.
7. `core/`: memory watch and `createBot()`, the assembly.
8. `loader/`: loading, hot reloading and typing user files.
9. Features: `events/`, `commands/`, `interactions/`, `components/`, `assets/`, `tasks/`, `store/`, `presence/`, `messages/`, `voice/`.
10. `cli/`: the commands, built on one shared piece.

## `discord/`: what never changes at runtime

Each piece is linked to the page of the official documentation it comes from. No request is sent from here.

- `types/`: one file per documentation page (`user.ts`, `guild.ts`, `channel.ts`, `message.ts`, `interaction.ts`, `component.ts`, `gateway-events.ts`…).
  - Payloads are `Raw…` interfaces in Discord's own snake_case (`RawGuild`, `RawMessage`).
  - Request bodies and query strings are named after their endpoint (`CreateMessageJSONParams`, `GetGuildQuery`).
  - Enums are `as const` objects with PascalCase keys plus a type of the same name (`ChannelType.GuildText`), never TypeScript `enum`.
  - A field whose optionality the docs only state in prose is typed from the prose.
  - `gateway-events.ts` also has `GatewayDispatchEvents` (event name → type of its payload).
- `endpoints.ts`: every REST endpoint (212), named like its documentation heading (`GetGuildMember`), declared with `endpoint<{ result; body; query }>()('GET', '/guilds/{guild.id}/members/{user.id}')` (`endpoint.ts`). The path is the documented one; its placeholders become the positional values of a request and decide the rate limit bucket (`majorParameter`). Deprecated or disabled endpoints are left out.
- `codes.ts`: gateway and voice opcodes, close codes and which ones forbid reconnecting, HTTP statuses, the text of every JSON error code.
- `intents.ts`: intents, privileged ones, `EVENT_INTENTS` (which intents send each event).
- `permissions.ts`: the immutable `Permissions` set and the permission algorithm of the docs (base, overwrites, implicit, timeout).
- `cdn.ts` (image URLs), `formatting.ts` (mentions, timestamps), `snowflake.ts`, `api.ts` (base URLs, version, `Limits`).

## `util/`

- `case.ts`: **the only place names are translated.** Users read and write camelCase everywhere: `Camelize<T>` turns a `Raw…` type into its camelCase version at type level, `toSnakeCase` / `toCamelCase` do it at runtime (ids and locales used as keys are left alone). An option type for users is `Camelize<SomeJSONParams>`, never a hand-written copy.
- `duration.ts`: the one parser of a `Duration` (`'10s'`, `'1h30m'`: a number and a unit `s`/`m`/`h`/`d`), shared by the `cooldown` of commands and the `every` of tasks.
- `websocket.ts`: **the end of a WebSocket, told once.** `onSocketEnd(ws, onEnd)` is how the shard and the voice session learn that their socket ended: on `close`, or on an `error` that no `close` follows by the next turn of the event loop. Node 22 fired only `error` when a connection was refused and left the socket connecting forever, so a bot that lost the network never reconnected; kept so that how a socket ends never depends on the version of Node.

## `rest/`: the only place HTTP requests are sent

- `RestClient.request(endpoint, pathValues, { body, query, reason, files, auth })` is typed by the endpoint.
- Rate limits are handled from response headers only (`rate-limiter.ts`: one queue per bucket and top-level resource, the global limit, 429 retries).
- Retries on 5xx and network errors, multipart uploads, the audit log reason; stops sending anything once the token was refused.
- Errors: `DiscordApiError` (status, JSON code, flattened field errors), `DiscordUnavailableError`, `InvalidTokenError`.
- Features depend on the `Rest` interface, not on the class.

## `cache/`

- `CacheStore`: a `ReadonlyMap` plus writes, synchronous on purpose (sharing between processes belongs to the process coordination layer). `MemoryStore` is the default implementation, created through a `CacheStoreFactory`.
- `Cache` holds users, guilds and channels. A guild owns its roles, members, channels, emojis and voice states; a channel owns its messages.
- Voice states (`VoiceEntry`): who is in a voice channel, with that channel kept beside the state so a channel deleted meanwhile is still known. Filled only when Discord sends voice states, which is when a file listens to a voice event; forgotten when the person leaves voice or the server.
- `CacheLimits` sets how many are kept per kind: members 100 per server, users without limit, messages 0 (a feature that needs them raises it). A limited store drops the entry written the longest ago, and writing one again makes it the most recent, which `entities.ts` does every time Discord sends it.
- A store can be resized (`resize()`, `limit`), and `trimStore()` makes one forget its oldest entries.
- `Cache.configured` is what the files of the project need (`Cache.configure()` changes it while the bot runs), `Cache.limits` what holds right now (lower while memory is short). Limits are not a user setting yet.
- Nothing may depend on a member being remembered: an event builds its member from what it comes with (a limit of 0 must work). What an event comes with never depends on them (see `known.ts`), and neither does `guild.me`.

## `structures/`: what handlers receive

A structure wraps the raw payload (no copy) and exposes camelCase getters and actions (`guild.fetchMember()`, `member.ban()`, `channel.send()`, `message.reply()`).

- The context (REST, cache) and the data are `#private` fields of `Structure`, read only through `ctxOf` / `dataOf` (`base.ts`), which the public API never exports. `toJSON()` and `console.log` show the camelCase data, never internals or secrets.
- `entities.ts` is the single place raw payloads become structures, always through the cache: the same thing is always the same object, patched in place (fields Discord left out are kept).
- A property reads the cache and never sends a request; a `fetch…()` method asks Discord (cache first when it gets one thing by id, `{ force: true }` to skip the cache); other verbs are actions. Actions that appear in the audit log take a `reason`.
- What users pass is validated before sending, with the limit in the message (`payload.ts` for messages, `Limits`).
- **What can't be missing is never nullable.** `member.guild`, `role.guild`, the `guild` of a server channel, `guild.me`, `guild.everyoneRole`, `member.highestRole`, `interaction.channel` and `interaction.locale` are not nullable: a `| null` is only for what may really not exist (a channel without category, a message never edited, something deleted the bot never saw).
  - `known.ts` makes it hold over time: a structure keeps what it was created with (`remember`: its server, its member, its channel), read after the cache (`findGuild`, `guildOf`, `knownMember`, `knownChannel`), so nothing turns to `null` because the member left or the channel was deleted while a handler runs.
  - It costs one reference inside each structure (`originOf` in `base.ts`) and no allocation for what belongs to a server (members, roles, channels keep the server itself); only messages and interactions, few and short-lived, keep a small object. A server keeps the bot's own member the same way, so `guild.me` survives a limit on remembered members.
  - The few impossible cases (something of a server the bot is not in, a server Discord sent without its roles) throw a clear error instead of answering `null`.
  - A value is never made up to avoid a `null`: what Discord may not send stays nullable (`guild.memberCount`).
- A value that is `null` only outside servers is not nullable for code that only runs in servers: the structure keeps its honest type (`Message.guild: Guild | null`) and a named interface extending it narrows the fields (`GuildMessage`, `MemberMessage`, `GuildCommandInteraction`); features hand out the narrow one when they guarantee it at runtime. Same object, no second class.
- Main things have a class (`User`, `Guild`, `GuildMember`, `Role`, the `Channel` family, `Message`, `GuildEmoji`, `Invite`, `Webhook`); secondary ones are returned as plain camelCase data (`Camelize<Raw…>`: audit log, scheduled events, stickers…) until a feature needs actions on them. Methods shared by several classes are written once and mixed in (`TextBasedMethods`).
- `interaction.ts`: `Interaction` (reply, defer, edit, followUp, delete; answers are sent in order; `reply` completes a deferred answer; the token never appears in logs), `CommandInteraction` (plus `showModal`), `ComponentInteraction` (`message` never null, `update` = Update Message, `deferUpdate` = Deferred Update Message, `showModal`) and `ModalInteraction` (`message: Message | null`, `update`/`deferUpdate` only when a component opened the form).
  - One state machine for all: `waiting` → `deferred` ("thinking…", a new message) or `updating` (nothing shown, the answer is a change of the component's message) → `answered`.
  - After `deferUpdate`, `reply()` goes out as a follow-up so the person sees the same thing, and `edit()` changes the component's message; `isUpdating()` lets the shared runner put the bad news in a follow-up instead of replacing that message.
  - `update()` after a message was sent throws and points to `interaction.message.edit()`. A modal must be the first answer (Discord).
- Voice: `VoiceChannel.join(options)`, `guild.voice` (the connection of the bot in a server, or `null`), `member.voiceChannel` (from the voice states of the server). See `src/voice/CLAUDE.md`.

## `gateway/`: the connection that receives events

Never exported to user code.

- `shard.ts`: one WebSocket (Node's built-in `WebSocket`, JSON encoding, no compression) kept alive forever.
  - Hello, heartbeats (first one after `interval * jitter`, a missing ACK means a dead connection), Identify (with the current presence), Resume on the URL given by Ready.
  - What to do for every opcode and close code of the docs: resume when the session survives; identify again when it is lost (codes 4003, 4007, 4009, 1000, 1001, Invalid Session `false`, or a resume URL that can't be reached); stop for good on the codes the docs mark as not reconnectable (`GatewayFatalError`, with what to fix). Retries wait longer each time (capped at 60 s).
  - `send()` waits for the shard to be ready and respects 120 events per minute (a few kept for heartbeats) and 4096 bytes per event.
  - `setPresence()` sends Update Presence within the 5 per 20 s of the docs: when the limit is reached only the latest presence is sent, when it may be; a session identified later starts with it, and a resumed one gets what changed meanwhile.
  - `close()` ends the session (code 1000) so the bot goes offline at once.
- `gateway.ts`: every shard of the process. Asks Get Gateway Bot for the URL, the recommended shard count and the session start limit (refuses to start when not enough sessions are left: `SessionLimitError`). `shards: { ids, count }` lets a future process coordinator give each process its share; `shardIdFor()` is the routing formula. `setPresence()` gives it to every shard and to the ones created later.
- `identify-queue.ts`: `IdentifyGate` decides when a shard may identify (interface: processes sharing a bot must share one); `IdentifyQueue` is the default, one identify per 5 s per `shard_id % max_concurrency` bucket.
- `state.ts`: `applyDispatch()` keeps the cache up to date, one table entry per event (guilds, roles, members and the member count, emojis, channels, threads, messages, voice states, the bot user). Adding an event to track is adding an entry.

## `core/`

- `memory.ts`: **the bot adapts what it remembers to the memory it has.** `watchMemory()` reads the heap of the process every 30 s.
  - Above 80% of what Node may use for a while, `tighten()` halves the limits themselves (members per server, users) on existing stores and for the ones to come, so the cache does not refill; under 50% for a while, `relax()` raises them back step by step to what was configured; between the two nothing moves. Servers, channels and roles are never touched.
  - The developer is told with `ℹ` when limits go down and when they are fully back; only when they are already at zero does a `⚠` speak, with how much remembering less gave back: little means the memory is used by the developer's own code, not by the bot.
  - `configure()` applies what the files need to a running bot. The framework acts by itself first: a message only asks for something it can't do.
- `bot.ts`: **the assembly**, created only by the CLI. `createBot()` wires REST, cache, structures and gateway (`setPresence()` goes to the gateway).
  - Every dispatched event is applied to the cache _before_ `onDispatch` hears of it (a cache failure is reported as `stateError` and the event is still delivered). `beforeDispatch` runs before the cache changes, for what an event is about to remove.
  - `connect()` resolves when every shard is ready and every server announced by Ready has sent its data (or `guildsTimeout` passed).
  - `onDispatch` gets `joined` for Guild Create: `true` only for a server the bot was not already in. This is where the events feature plugs in.
  - `guildFilter` drops the events of other servers before anything else (how the dev bot only sees its dev server, and production ignores it); `privateEvents: false` drops what happens in private conversations (Discord sends it to every process running the first shard: only one may answer).
  - Routes Voice State Update and Voice Server Update to `ctx.voice`.

## `loader/`: one mechanism to load user files, for every feature

- `loader.ts`:
  - `listSources(projectDir)` finds every source file of `src/` (subfolders included; `.d.ts` and `*.test.*`/`*.spec.*` files left to their tools).
  - `loadSources()` imports them all (a file that fails to run is returned in `failed`, never thrown).
  - `readDeclarations(modules, declaration)` reads one kind of declaration from everything they export. A `Declaration<T>` says how to recognise one (`is(value)`, by its brand), whether a file may export several in a list (`list`: only what names itself in its config, since a list has no export name to give), what one is called in messages (`one`/`many`) and how to check it (`read(value, site)`, which throws a message saying what to write).
  - An `ExportSite` is where a declaration was found: `file`, `export` and `name` (the export name, or the file name for `default`). The same value exported twice (re-exported elsewhere) is one declaration, at the first site. A broken export is returned in `failed` with its export name (`siteName()` prints `src/a.ts (ban)`).
  - A new kind of thing a user can declare is a new `Declaration`, nothing else.
  - `BuiltFile` is a file as a build kept it (`{ file, exports }`): `readDeclarations` reads it the same way, so `dev`, `build` and `start` share every check.
- `hot.ts`: how Node loads project files, with `module.registerHooks`.
  - Imports without extension: a relative import that Node does not find is tried with `.ts`, `.js`… then as a folder with an `index`.
  - Hot reload: every file under `src/` is resolved with a generation number in its URL, so `nextGeneration()` makes the next load re-import a file _and everything it imports from the project_ (packages keep their single copy). `cleanPath()` removes that number from what is shown.
- `generated.ts`: the `.chapterjs/` folder of a project. `writeGenerated(projectDir, declarations)` only touches files whose content changed, removes what older versions wrote, and makes the folder ignore itself in git; it leaves `cache/` and `build/` alone.
  - One TypeScript project for the whole of `src/` (`tsconfig.json` there extends the user's and includes `../src`), plus `types/project.d.ts`: what the project adds to `'chapterjs'`, as `declare module 'chapterjs'` augmentations (importing the package from `'#chapterjs'`, replaced by its real path): the `PublicFile` union and `asset()` (`assets/public.ts`), `ProjectMessages`, `ProjectLocales` and `ProjectLanguageDefaults` (`messages/declaration.ts`), `ProjectCommands` (`commandsDeclarations`). Everything else is typed by the package itself.
  - `cli/project.ts` has `writeTypes(cwd, info?)`, the one call that computes and writes it: `dev` and `build` give it `project.typesInfo()` once the files ran (which language is the default, which say `default: true`, which commands are described); `sync` gives nothing and the declarations are found by reading the files without running them (`scanLanguages()`, `scanCommands()`: a text search, approximate on purpose, corrected by the first `dev`).
  - The user's `tsconfig.json` only holds compiler options, `files: []` and one reference to `./.chapterjs`; the command line needs `tsc -b` (a plain `tsc` checks nothing; templates have a `typecheck` script). Tested against the real language server in `test/editor.test.ts`.
- `watch.ts`: recursive `fs.watch`, one call per burst of saves, plus a comparison, shortly after starting, with the folder as it was when its files were loaded (`snapshotFolder`): the system takes a moment to really watch, and a save made in between must not be lost.
- `locate.ts`: `file:line` of an error inside the project, from its stack.

## `assets/`: the `public/` folder of a project

Where the files a bot sends live.

- `public.ts`: `listPublic()` (every file, nested, sorted, hidden ones left out), `publicDeclarations()` (the `PublicFile` union of their paths and `asset(path: PublicFile, options?)`, as the shared augmentation of `generated.ts`), `watchPublic()` (watches the folder, or the project root until the folder appears).
- `asset.ts`: `asset()` (runtime; branded `AssetFile` with `name`, `path`, `description`, `spoiler`, `contentType`, the brand hidden from `console.log`; refuses a path that leaves `public/`), `setPublicDir()` (called by `createProject`: how `asset()` knows the project), `readAsset()` (reads when the message is sent, with a plain error naming the missing file).
- `payload.ts` turns an `AssetFile` into a `RestFile` whose `data` is a function, which `rest.ts` calls once before building the multipart body (a retry sends the same bytes), and refuses two files of a message with the same name.
- `asset` is exported at runtime by `main.ts` and typed per project only (like `event`): the editor lists the files of `public/` inside `asset('')` and underlines one that does not exist. `chapterjs dev` watches `public/` and rewrites the types on every change (`↻ public/ changed: types updated`).

## `interactions/`: what every interaction shares

Written once for commands and components. A new kind of interaction (context menu, autocomplete…) uses this and adds only what is its own.

- `dispatch.ts`:
  - `authorOf` (member in a server, user elsewhere).
  - `resolvePlace` (server, member, channel from the interaction itself, checked against `where`; returns a key `guildOnly`/`dmOnly`/`notHere` and the routers add `what`, for the plain refusals "can only be used in a server" / "in a private message with me" / "can not be used here").
  - `placeContext` (nothing about a server for `where: 'dm'`).
  - `says(interaction, key, params)` and `refuse(interaction, key, params)`: a framework phrase in the language of the person (`interaction.locale`), `refuse` being a private answer that never fails.
  - `runInteraction` (defers after 2 s with what the caller gives, runs `run` for the server of the place (`guildId`, what a store per server reads: `store/scope.ts`), turns a thrown error into a plain answer for the person and a located error for the developer, warns when `run` never answers).
- `cooldown.ts`: cooldowns, for every interaction that can have one (commands today). `CooldownLimits` (ms per scope `user`/`channel`/`guild`, `0` for none), the `CooldownStore` interface (`until`, `set`) with `MemoryCooldowns` (a `Map` that sweeps what expired by itself) and `checkCooldown(store, name, limits, ids)` (the time the thing may be used again, or `0` and the use counted for every scope with an id).

## `presence/`: what the bot shows under its name, declared once

`export default presence({ status?, activity? })`, from any file of `src/` (the template keeps it in `src/presence.ts`).

- `status` is `'online' | 'idle' | 'dnd' | 'invisible'` (online by default); `activity` is `{ type, name }` with `type` one of `playing`, `listening`, `watching`, `competing`, `custom` (where `name` is the text itself, sent as Discord's `state`) or `streaming` (which needs a Twitch or YouTube `url`, the only ones Discord accepts).
- A bot may only set `name`, `state`, `type` and `url` (`RawBotActivity`), so nothing else is offered; `since` and `afk` are about a person's client and stay `null`/`false`.
- `declaration.ts` is the `Declaration` of the presence (`read` validates with a message saying what to write, no length limit is invented: the docs give none) → `LoadedPresence` (`raw`, the Update Presence payload, and `key`, that payload as text, to tell a change from a rewrite) and `DEFAULT_PRESENCE` (online, nothing shown: what is sent when the declaration is removed while the bot runs).
- `cli/project.ts` loads it with the others (a second presence is reported and left out, the first one is used; a broken one keeps the last good version), counts it in `summary` ("a presence"), gives it to `createBot` and exposes `applyPresence(bot)`, which sends it only when it changed since the bot was given one: `dev` calls it on every reload (`↻ Presence updated`). In a cluster every process sets it on its own shards: nothing to coordinate.

## `cli/`: the commands, built on one shared piece

- `cli.ts`: the `chapterjs` binary (`dev`, `build`, `start` with its only option `--processes <n>`, and `sync` which only writes `.chapterjs/`; templates run it as `postinstall`). `log.ts`: the five symbols. `node-version.ts`: `nodeTooOld()`, which refuses a Node older than 24 at once with what to install.
- `env.ts`: `.env` reading with `util.parseEnv`, the real environment wins; `readDevEnv` needs `BOT_TOKEN` and `DEV_GUILD_ID`, `readStartEnv` only the token (hosts give it without a file) and takes `DEV_GUILD_ID` when it is there.
- `preflight.ts`: token, bot in the dev server with an invite link, privileged intents from the application flags; waits by polling when interactive, fails with the explanation otherwise.
- `project.ts`: **what `dev`, `build` and `start` share**, written once. A new way to run the bot is a new file using this, never a copy.
  - `DECLARATIONS`: the kinds of declarations (events, commands, components, tasks, stores, the presence, languages).
  - `load` runs every file of `src` (or takes the files a build compiled) and reads each kind from their exports, keyed by file and export (`src/a.ts#ban`) so that a broken export or file keeps its last good version.
  - `summary` ("2 commands, 3 events, 4 components, a presence, messages in 2 languages loaded"), `filesNeeding`, `intents`, `typesInfo()` for `writeTypes`.
  - A bot that runs them (`connect`; every Interaction Create goes to the command router and the component router), the `ready` event, the memory watch, `explain()` for errors.
  - Tasks: `startTasks(current)` / `stopTasks()`. Stores: the backend of the process (`options.stores`, else a `FileStoreBackend` on `data/`), given to every store with `setStoreBackend()`, exposed as `storeBackend` and closed by `closeStores()` when `dev` and `start` stop. Presence: `applyPresence(bot)`. Languages: assembled on every load, `Context.messages` set on connect and on every reload. Voice: adds `GUILD_VOICE_STATES` when `sourcesJoinVoice()` finds a join in `src/` (dev) or `build.json` says so (`start`).
- `dev.ts`: env → write types → load files → checks → connect → watch → register commands → clean stop; on each reload, commands are registered again if they changed, the types are rewritten (`↻ Types updated` when something changed), the presence applied.
  - The dev bot only runs the dev server: `guildFilter` keeps that one server, `privateEvents: false` drops what happens outside servers (and the intents that only serve it are not asked), and a declaration (command, event or component) that only works in private messages is named once with `ℹ`.
  - Once the bot is online it says with `ℹ` when a newer `chapterjs` is published, with the command to run (`update-check.ts`: `checkForUpdate()` asks the npm registry for `chapterjs/latest` at most once a day, the answer kept in `.chapterjs/cache/update.json`, a 5 s timeout and never an error: without network nothing is said; `isNewer()` compares the three numbers only; `updateCommand()` picks the package manager from the lockfile of the project, else `npm_config_user_agent`, else npm). The check starts before the files load and is only printed after the summary, so nobody waits for it; nothing is installed by the framework.
- `build.ts`: `chapterjs build`, which needs no token and never talks to Discord.
  - Every file is run once from `src` (each says what is wrong with it), the types of `.chapterjs/` are written from what ran, then checked with the TypeScript of the project (`tsc -b`; said and skipped when it is not installed).
  - The whole bot is compiled into one JavaScript file, `.chapterjs/build/bot.js`, with **esbuild**: an entry that imports every file of `src/` (`listSources`, the same files `dev` runs, so production runs exactly what was written) and exports them with their path, bundled with what they import from anywhere in the project, whitespace and syntax minified but names kept, with a source map (no sources inside). Packages are left external: the bot and the framework must share the same ones.
  - The compiled file is then run once, as production will. esbuild is the one dependency of `chapterjs`, imported by `build()` only when it runs, so no other command loads it. A build that fails leaves nothing behind.
  - `build.json` keeps the framework version, a `fingerprint()` of `src` and whether the project joins voice. `loadBundle()` imports the compiled file with Node's source maps on, so errors still name `src/...:line`.
- `start.ts`: production, which runs the build and only the build (`readBuild()`): no build or a build of another version stops it with what to run, sources changed since the build are a `⚠`.
  - It gives the compiled files to the project (`built`), so nothing is scanned or imported one by one, and no source is needed.
  - The process the developer started checks everything once (token, privileged intents without waiting, commands registered for everyone when they changed), asks Discord in how many shards the bot is split, then runs it alone or as a cluster.
  - With `DEV_GUILD_ID` it ignores that server, so a dev bot and a production bot with one token never answer the same thing.
- `cluster.ts`: several processes on one machine.
  - `planProcesses()` (one process per 4 shards, never more than CPUs, or what `--processes` asks), `splitShards()`.
  - `runCluster()` in the first process: forks the others with their share in `CHAPTERJS_PROCESS`, shows their lines prefixed with `[n]`, gives each shard its turn to identify through one `IdentifyQueue` over IPC, keeps the data of the stores for all of them (`stores`, served with `serveStores()` on each worker's messages), starts again a process that stops by itself with a growing delay, stops them all together, and stops for good when Discord refused one (exit code `REFUSED`).
  - `connectToPrimary()` in the others: an `IdentifyGate` that asks the first process; a process left alone stops. Their stores go through an `IpcStoreBackend` on the same channel.
  - Each process takes its share of the global request limit. Tasks run only in the process whose `assignment.index` is 0. Several machines would be another `IdentifyGate` and nothing else.
- Test-only environment variables, not documented to users: `CHAPTERJS_API_URL` points the CLI at another REST API (an `http://` one also makes voice servers be reached without TLS, as the fakes of tests are), `CHAPTERJS_REGISTRY_URL` at another npm registry (`world()` in `test/dev-helpers.ts` gives a fake one, `registry`, that has no version until a test says so), `CHAPTERJS_IDENTIFY_INTERVAL` shortens the wait between identifies.

## Tests of this package

- `test/dev-helpers.ts` builds a scratch project (`project()`, with the package linked in `node_modules`), a fake Discord where the bot exists (`world()`) and runs the CLI in it (`runDev()`); every template of `create-chapterjs` is type-checked and run this way.
- `test/editor.test.ts` asks the real TypeScript language server over LSP what the editor shows (auto-imports, the languages `t.in()` offers, a second `default: true` underlined): an editor behavior is never assumed.
- `test/docs.test.ts` checks the documentation site against the package: every page exists in both languages, every export has a page, every structure member is documented in both languages and no documented method is a ghost, every sample of both languages compiles. A change to the API fails the tests until the docs follow.
- `vendor/dave/` is rebuilt only by `scripts/build-dave.sh` (`pnpm --filter chapterjs build:dave`): Docker, libdave and Emscripten at fixed versions, exceptions compiled in, licenses gathered.
