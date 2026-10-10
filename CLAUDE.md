# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ChapterJS is a Discord bot framework: "ultra simple, but ultra customizable". A user creates a project, declares what the bot does in the files of `src/` (`command()`, `event()`, `button()`… exported from any file) and the `chapterjs` CLI does everything else: connection, intents, command registration, hot reload, scaling. pnpm + Turborepo monorepo; read `AGENTS.md` before touching Turborepo config. The root `README.md` presents the project (what it is, a sample, how to contribute): keep it true when a feature or a command changes.

## Where the details live

This file holds the rules of the repo. What a package or a module does is described next to it, in a `CLAUDE.md` loaded when you work there. **Read the one of the folder you touch before changing anything in it**, and update it in the same change:

- `packages/chapterjs/CLAUDE.md`: the framework, its layers and every core module (`discord/`, `util/`, `rest/`, `cache/`, `structures/`, `gateway/`, `core/`, `loader/`, `assets/`, `interactions/`, `presence/`, `cli/`).
- `packages/chapterjs/src/<feature>/CLAUDE.md`, one per feature: `events/`, `commands/`, `components/`, `messages/`, `tasks/`, `voice/`.
- `packages/create-chapter/CLAUDE.md`: the scaffolder and its templates.
- `apps/docs/AGENTS.md`: the style guide of the documentation site.

## Layout

- `packages/chapterjs`: the framework and its `chapterjs` CLI (`dev`, `start`, `build`, `sync`). Public API is re-exported from `src/index.ts` (the types of the package) and `src/main.ts` (what is loaded at runtime: the same, plus `asset()`, typed per project).
- `packages/create-chapter`: the project scaffolder (`pnpm create chapter [dir]`); `packages/create-chapterjs` is an alias so `pnpm create chapterjs` works too.
- `packages/test-utils` (`@chapterjs/test-utils`, private, never published, exports its TypeScript sources): the test helpers shared by every package. Any new test helper useful to more than one package goes here.
  - `tempDir()`: a folder deleted when the test ends. `fakeBin()`: fake commands to use as the only `PATH` entry.
  - `startCli()`: runs a CLI as a real process and drives it through stdin (`waitFor`, `type`, `press`, `exited`); a CLI that ends before printing what is waited for is explained: not started (the spawn error), killed by a signal, or its exit code.
  - `fakeDiscord()`: a local HTTP server playing Discord's REST API: programmable answers per route with `on()`, every received request recorded with its JSON body, query and uploaded files.
  - `webSocketServer()`: the WebSocket server, on Node built-ins, the fakes below are written on (masked and fragmented client frames, text and binary).
  - `fakeGateway()`: a local WebSocket server playing Discord's gateway: by default it says Hello, acknowledges heartbeats, answers Identify with Ready and Resume with Resumed; `behavior` changes any of that and each connection can be driven by hand (`dispatch()`, `send()`, `close(code)`, `drop()`, `waitFor()`).
  - `fakeVoice()`: a voice server of Discord: the voice gateway v8 with its JSON and binary messages, and a UDP socket that answers IP Discovery and decrypts the audio it receives into `packets`; `behavior` sets the modes offered, the DAVE version, heartbeats.
- `apps/docs`: the user-facing documentation site (Mintlify, `luma` theme, Lucide icons, the palette and fonts in `docs.json`, the landing page in `index.mdx` with `style.css`); has its own `AGENTS.md`, the style guide: read it first.
  - Three tabs, plus a **Changelog** tab last (`changelog.mdx`, one `<Update>` per version, newest first): **Tutorial** (`tutorial/`, a course for someone who has never written a bot: explains why before how, builds one bot page after page, repeats the Guide in more words and never documents what the Guide does not have), **Guide** (read in order, teaches, one complete working file per page, never lists an API) and **Reference** (looked up, lists everything, never explains a concept). Each Guide page links its Reference counterpart, each Tutorial page its Guide counterpart. A user-facing change updates the three.
  - **The site is in English and in French**: `navigation.languages` in `docs.json` (`en` by default, `fr` with its own navbar and footer) gives the language switcher, and every page has its translation at the same path under `fr/` (`fr/commands/answering.mdx`); a change to a page is not finished until its French version says the same thing. The French keeps every name of the API, the values types are made of, the language files of the samples and the messages of the CLI as they are; `AGENTS.md` lists what is translated.
  - A reference description is the JSDoc of the source, word for word: a public member without JSDoc is a hole in the source, not a sentence to invent.
  - `memory.mdx` says what the bot remembers and how it frees memory: keep it in sync with `CacheLimits` and `core/memory.ts`. `not-yet.mdx` is the only place for features that do not exist yet.
  - `packages/chapterjs/test/docs.test.ts` checks the site against the package (every page exists in both languages, every export has a page, every structure member is documented in both languages and no documented method is a ghost, every sample of both languages compiles), so a change to the API fails the tests until the docs follow.

The three packages are always released with the same version.

## Constraints

- **100% type-safe**: everything the user writes is typed end to end (event context, command options, component data, modal fields, config…), with no `any` in the public API. A mistake should be underlined in the editor before the bot even runs, and what types promise is also checked at runtime.
- **Ultra performant**: low memory and CPU, fast startup, no unnecessary REST calls (cache first), no work done for features the project doesn't use. Performance must hold for large bots (sharding, multiple processes).
- **One dependency, and none to run a bot**: `chapterjs` depends on esbuild, which `chapterjs build` compiles the bot with, so that a project has nothing to install for it. It is loaded by `build` only: everything that runs a bot (`dev`, `start`, the whole core) uses only Node built-ins (Node ≥ 24, native TypeScript; `engines` of the three packages and of the templates says `>=24`, and both CLIs refuse an older Node at once with what to install). Keep it that way: no second dependency, and never one at runtime. TypeScript, used to check types, stays a dev dependency of the project. The one exception in form, not in kind, is `vendor/dave/`: Discord's libdave (the end-to-end encryption of voice) compiled to WebAssembly, which Node runs itself (see `src/voice/CLAUDE.md`). ffmpeg, when installed on the machine, is used to play what is not Opus; nothing needs it.
- **The only source of truth for Discord is the official documentation: https://docs.discord.com/developers/reference** (API/gateway v10). Read the relevant page before implementing anything Discord-related; never rely on discord.js, discord-api-types or memory of them. Code comments link to the exact section used.
- **Export-based, with nothing to register and no types to write**: the framework loads every file of `src/` (wherever it is, whatever it is called) and runs what the files export made with one of its functions: `command()`, `event()`, `button()`, `select()`, `modal()`, `embed()`, `task()`, `store()`, `presence()`, `language()`. A file may declare several things; a file that declares none is plain code. What names itself does so in its config, because Discord shows it or because it is the thing: a command (`name: 'ping'`, `'mod ban'` for a subcommand) and an event (`name: 'memberJoin'`, which types what `run` receives); a language says its `locale`. Everything else is named by its export (`export const confirm = button(…)` is the button `confirm`, `export const warnings = store()` the store `warnings`; a default export takes the name of its file): users never write a `custom_id`. The same plain `import { event } from 'chapterjs'` works in every file, everything is inferred from what the user writes, and a mistake (a `name` that is no event, an option the event does not have, a second `default: true`) is underlined in the editor before the bot runs. Nothing about identity may come from a path: folders are the user's to organise with. A convention that makes the user repeat a name, write a type, or import something that looks like machinery is a design to rethink.
- **Users can't bypass the framework**: the connection, login, intents, presence, event routing and shutdown are driven only by the CLI. Never export a way for user code to run them; exporting types is fine. What handlers receive is enforced at runtime, not only by types.
- Packages are ESM with `NodeNext` resolution (internal imports use `.js`). User project files are TypeScript run by Node through the framework's loader (`loader/hot.ts`), which lets their relative imports have no extension (`'../lib/greet'`, or a folder with an `index`); a `.ts` extension works too. Their tsconfig uses `module: Preserve` and `moduleResolution: Bundler` to type-check the same thing.

## Architecture first

The framework is built in two layers, and the order matters:

1. **A generic core, designed once and meant to stay stable**: talking to Discord (REST, gateway, rate limits), the cache, the structures wrapping Discord data, loading and hot reloading user files, routing, validation, error reporting, storage. Each piece solves its problem in general, not for one feature.
2. **Features assembled from that core**: events, commands, components, tasks, presence… are thin layers that combine core building blocks. Adding a feature should mean adding files, not rewriting existing ones.

Rules that follow:

- **Think before coding.** Before writing a core piece, design how every known feature (and plausible future ones) will use it. For a significant change, propose the architecture first and wait for approval.
- **One mechanism per problem.** If two features need the same thing (scanning a folder, reloading a file, validating options, answering an interaction…), it lives once in the core and both use it. Never copy-paste a mechanism to adapt it.
- **Extend, don't modify.** The core exposes clear extension points (e.g. a new kind of declaration, a new event, a new component kind should be a registration, not a change to the loader or the router).
- **A feature that forces a core rewrite is a design signal.** Stop and rethink the core piece so it becomes generic enough, rather than adding a special case to it.
- **Behind an interface, never hard-wired.** Anything that could have several implementations later (where data is stored, how processes coordinate, how a cache is kept, how something is scheduled…) is accessed through a small interface with a default implementation. Adding a new backend later must mean writing one new implementation and plugging it in (2 or 3 places at most: the implementation, the config option, the wiring), with no change to the features that use it.
- **Design for the features that will come, not only the current one.** The framework will keep growing (new data sources, new ways to run the bot, new kinds of declarations). When designing a core piece, ask what a future feature of the same family would need, and leave room for it without implementing it.
- Small modules with one responsibility and explicit dependencies, so a piece can be replaced or improved without touching the rest.

## What the framework does

### CLI

- `chapterjs dev`: runs the bot against one dev server (`DEV_GUILD_ID`) with hot reload of every user file, and the files of `public/` typed as they are added. A broken file never crashes the bot: the error is shown with the file and line, and the last working version is kept. When reloaded files need intents the connection does not have, it reconnects by itself. The `ready` event runs once per start, not on reload.
- `chapterjs build`: checks every file and the types, then compiles the whole bot into one JavaScript file in `.chapterjs/build`. Any invalid file fails the build.
- `chapterjs start`: production, runs what was built. No hot reload, commands are registered globally, private messages are handled, and a large bot runs on several processes of one machine by itself (`--processes` to choose).
- The docs recommend two Discord applications from the start, one for dev and one for production, in an `<Info>` callout on `setup/discord-application`, `run/dev` and `run/start` (global commands belong to the application: Discord cannot hide them in one server, so a shared token always shows a command being changed twice; the presence, the Developer Portal settings and the session and request limits are shared too). A dev process and a production process can still share one bot token: dev only sees the dev server and nothing outside servers, production ignores the dev server (when it knows `DEV_GUILD_ID`). In dev, commands are registered on the dev server only, without the ones production already shows there: no command is shown twice unless it is being changed.
- Before connecting, it checks what's missing and says exactly how to fix it: missing/placeholder `.env` values, bot not in the dev server (prints an invite link), privileged intents not enabled (lists the files that need them, with a direct link to the Developer Portal; in a terminal it waits until they're enabled).
- Intents are computed from the files the user wrote: the user never lists them by hand.
- Shutdown (Ctrl+C, SIGTERM) closes the Discord session cleanly, so no ghost bot stays online.

### Expected behavior

- When a handler throws, the end user gets a short, plain answer (e.g. which permission the bot is missing) and the developer gets the error with the line in their code. Code that runs later on behalf of user code must keep that line: chain with `await`, not `.then` (see `Interaction`).
- Components never need an id from the user, and never break the bot: a click on a button whose file is gone, renamed or changed answers the person plainly ("not available any more", "out of date") and runs nothing. `who: 'author'` and `where` are enforced by the router before `run`.
- Discord limits (rate limits, payload sizes, presence throttling…) are handled by the framework, never by the user.
- Every value from user code is validated: errors appear at load time with a clear message, ideally underlined in the editor.
- **Ask as little as possible.** Every action the user has to take is a cost: never ask what can be detected, never ask a question with only one possible answer (take it and say so with `ℹ`), and preselect the most likely answer. Applies everywhere: CLI prompts, config, file conventions, error fixes.

## Messages

Every message is written for amateur developers: plain words, what happened, then what to do. Symbols: `✓` success, `↻` reload/reconnection, `ℹ` a note, `⚠` warning, `✗` error prefixed with the file (and line when known). Messages shown to end users never contain technical details.

## Keep things in sync

A change is not finished until these are updated, in the same change:

- **The `CLAUDE.md` files**: this one for a rule, a constraint, a convention or an architecture decision of the whole repo; the one of the package or module for everything else (a new or removed module, a new public API, a renamed option or command, a new env var, how a piece works). After every change that makes one inaccurate or incomplete, user-facing or internal. Never add work that was only discussed and not implemented.
- **Docs** (`apps/docs`, Mintlify: MDX pages, navigation in `docs.json`, every page in English and in `fr/`; read `apps/docs/AGENTS.md` first): after every user-facing change (new or renamed API, option, event, file convention, env var, CLI command or message users will see). New feature → its page, added to `docs.json`; changed API → every page and sample using it. Samples must compile against the current API and match the templates. Commands are shown for every package manager in a `<CodeGroup>`, always in the order pnpm, npm, yarn, bun (pnpm is the preferred one, same order as the scaffolder).
- **Templates** (`packages/create-chapter/templates/`, described in `packages/create-chapter/CLAUDE.md`): how users discover the framework. Every template must type-check and run without errors; only templates that clearly need a privileged intent may require one, other examples stay commented. Prefer short commented examples over extra files.
- **Tests**: see below.

## Tests

Every change comes with its tests, in the same change: a new feature gets new tests, a changed behavior gets its tests updated, a fixed bug gets a test that fails without the fix. A change is not finished until `pnpm test` and `pnpm check-types` pass.

- **Vitest** (version set once in the `catalog` of `pnpm-workspace.yaml`), in every package: `test/**/*.test.ts` next to `src/`, never built nor published. Shared settings live in `vitest.shared.ts` at the root, merged by each package's `vitest.config.ts`. `test/tsconfig.json` type-checks tests with the sources.
- **Test hard, not just the happy path**: empty, blank and huge inputs, unicode, every branch and error message, cancellation, missing tools, failing commands, files already there, several things at once. Prefer `it.each` tables to cover many cases.
- **End-to-end tests run the real thing**: the built CLI as a separate process (`startCli`, after a `globalSetup` that builds the package so `dist/` is never stale), with the outside world faked through `PATH` (`fakeBin`) instead of mocks, and its environment fully controlled (nothing inherited from the runner). Assert what the user sees (messages, next steps) and what ends up on disk. For `chapterjs`, `test/dev-helpers.ts` builds a scratch project, a fake Discord and runs the CLI in it; every template is type-checked and run this way. What the editor shows (auto-imports) is tested by asking the real TypeScript language server over LSP (`test/editor.test.ts`): an editor behavior is never assumed.
- **Mocks only for what can't run for real** (e.g. an interactive prompt in a unit test). Each test cleans after itself (`tempDir`, restored mocks and env).
- **Check that tests catch bugs**: after writing tests for a piece of code, reintroduce plausible bugs one at a time and confirm a test fails for each; a bug that no test catches means a missing test.
- Tests that need a POSIX shell are skipped on Windows (`describe.skipIf(process.platform === 'win32')`).
- Discord itself is never called by tests: the real REST client runs against `fakeDiscord()` from `@chapterjs/test-utils` (never a mocked `fetch`). The gateway is tested the same way against `fakeGateway()`, with short heartbeat intervals and retry delays so tests stay fast.

## Branches and releases

`master` is what is released, `develop` what comes next, and features and fixes are branches of `develop`. The version is the `version` of the three `package.json`, the same in all three, written by hand: no workflow changes it.

- `.github/workflows/checks.yml` (reusable): prettier, `pnpm build` + `check-types`, `pnpm test` with Node 24 on Ubuntu and on macOS (one package at a time, `--concurrency 1`: three suites spawning processes at once made a CLI fail to start on a runner), and every package packed. `.github/actions/setup` is how every job gets Node, pnpm and the dependencies.
- `ci.yml`: a pull request into `develop` runs the checks.
- `release.yml`: a pull request into `master` must come from `develop`, and runs the checks.
- `deploy.yml`: run by hand on `master` (Actions → Deploy): reads the version of the three `package.json` (the same in all three, and not already all on npm), builds, packs and publishes them (in dependency order, skipping what npm already has, so a deploy that stopped halfway can be run again; with provenance), then the commit deployed gets its tag `vX` and a GitHub release with the packages. Auth is npm trusted publishing or the `NPM_TOKEN` secret.

## Commands

```bash
pnpm build          # build every workspace
pnpm check-types    # type-check every workspace, tests included
pnpm test           # run every test suite (Turborepo, cached)
pnpm test:watch     # rerun tests on change
pnpm coverage       # tests with a coverage report (coverage/ in each package)
pnpm format         # prettier
```

Inside a package, `pnpm test` / `pnpm vitest run test/cli.test.ts` run only its tests. What tests can't cover (a real bot connecting to Discord) is also checked by running the CLI on a scratch project; that needs a `.env` with `BOT_TOKEN` and `DEV_GUILD_ID`.
