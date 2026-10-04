# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ChapterJS is a Discord bot framework: "ultra simple, but ultra customizable". A user creates a project, drops files into conventional folders (`src/events/`, `src/commands/`…) and the `chapterjs` CLI does everything else: connection, intents, command registration, hot reload, scaling. pnpm + Turborepo monorepo; read `AGENTS.md` before touching Turborepo config. The root `README.md` is the Turborepo starter and does not describe this project.

## Layout

- `packages/chapterjs`: the framework and its `chapterjs` CLI (`dev`, `start`, `build`). Public API is re-exported from `src/index.ts`.
- `packages/create-chapter`: the project scaffolder (`pnpm create chapter [dir]`), built on `@clack/prompts`: asks for the target folder (`.` = current folder, must be new or empty), the package manager (each one checked with `<pm> --version` in parallel during the first question; missing ones are shown but disabled; the one from `npm_config_user_agent` is preselected) and a template, copies it, then runs `<pm> install`. Modules: `project.ts` (folder validation, copy, package name), `package-manager.ts` (detection, installed versions, install), `templates.ts` (listing), `choose.ts` (a select menu that skips itself and logs the answer when only one choice can be picked; used for the package manager and the template). Every folder of `templates/` is a template, its menu hint is its package.json `description` (removed on copy); `default` is listed first; `_gitignore` is renamed to `.gitignore` (npm strips `.gitignore` when publishing); the `chapterjs` dependency is set to `^<create-chapter version>`.
- `packages/create-chapterjs`: alias so `pnpm create chapterjs` works too.
- `packages/test-utils` (`@chapterjs/test-utils`, private, never published, exports its TypeScript sources): test helpers shared by every package: `tempDir()` (a folder deleted when the test ends), `fakeBin()` (fake commands to use as the only `PATH` entry), `startCli()` (runs a CLI as a real process and drives it through stdin: `waitFor`, `type`, `press`, `exited`). Any new test helper useful to more than one package goes here.
- `apps/docs`: the user-facing documentation site; has its own `AGENTS.md`. `index.mdx` is the landing page (Mintlify `mode: "custom"`: no default typography, everything is styled with Tailwind classes); keep its feature claims and commands in sync with the framework.

The three packages are always released with the same version.

## Constraints

- **100% type-safe**: everything the user writes is typed end to end (event context, command options, component data, modal fields, config…), with no `any` in the public API. A mistake should be underlined in the editor before the bot even runs, and what types promise is also checked at runtime.
- **Ultra performant**: low memory and CPU, fast startup, no unnecessary REST calls (cache first), no work done for features the project doesn't use. Performance must hold for large bots (sharding, multiple processes).
- **Zero runtime dependencies** for `chapterjs`: only Node built-ins (Node ≥ 22.18, native TypeScript). Keep it that way.
- **The only source of truth for Discord is the official documentation: https://docs.discord.com/developers/reference** (API/gateway v10). Read the relevant page before implementing anything Discord-related; never rely on discord.js, discord-api-types or memory of them. Code comments link to the exact section used.
- **Users can't bypass the framework**: the connection, login, intents, presence, event routing and shutdown are driven only by the CLI. Never export a way for user code to run them; exporting types is fine. What handlers receive is enforced at runtime, not only by types.
- Packages are ESM with `NodeNext` resolution (internal imports use `.js`). User project files are run directly by Node, so their relative imports use `.ts`.

## Architecture first

The framework is built in two layers, and the order matters:

1. **A generic core, designed once and meant to stay stable**: talking to Discord (REST, gateway, rate limits), the cache, the structures wrapping Discord data, loading and hot reloading user files, routing, validation, error reporting, storage. Each piece solves its problem in general, not for one feature.
2. **Features assembled from that core**: events, commands, components, tasks, presence… are thin layers that combine core building blocks. Adding a feature should mean adding files, not rewriting existing ones.

Rules that follow:

- **Think before coding.** Before writing a core piece, design how every known feature (and plausible future ones) will use it. For a significant change, propose the architecture first and wait for approval.
- **One mechanism per problem.** If two features need the same thing (scanning a folder, reloading a file, validating options, answering an interaction…), it lives once in the core and both use it. Never copy-paste a mechanism to adapt it.
- **Extend, don't modify.** The core exposes clear extension points (e.g. a new user folder convention, a new event, a new component kind should be a registration, not a change to the loader or the router).
- **A feature that forces a core rewrite is a design signal.** Stop and rethink the core piece so it becomes generic enough, rather than adding a special case to it.
- **Behind an interface, never hard-wired.** Anything that could have several implementations later (where data is stored, how processes coordinate, how a cache is kept, how something is scheduled…) is accessed through a small interface with a default implementation. Adding a new backend later must mean writing one new implementation and plugging it in (2 or 3 places at most: the implementation, the config option, the wiring), with no change to the features that use it.
- **Design for the features that will come, not only the current one.** The framework will keep growing (new data sources, new ways to run the bot, new user conventions). When designing a core piece, ask what a future feature of the same family would need, and leave room for it without implementing it.
- Small modules with one responsibility and explicit dependencies, so a piece can be replaced or improved without touching the rest.

## What the framework does

### CLI

- `chapterjs dev`: runs the bot against one dev server (`DEV_GUILD_ID`) with hot reload of every user file. A broken file never crashes the bot: the error is shown with the file and line, and the last working version is kept.
- `chapterjs start`: production. No hot reload, any invalid file fails startup, commands are registered globally, can run on several processes.
- A dev process and a production process can share one bot token: dev only sees the dev server, production ignores it.
- Before connecting, it checks what's missing and says exactly how to fix it: missing/placeholder `.env` values, bot not in the dev server (prints an invite link), privileged intents not enabled (lists the files that need them, with a direct link to the Developer Portal; in a terminal it waits until they're enabled).
- Intents are computed from the files the user wrote: the user never lists them by hand.
- Shutdown (Ctrl+C, SIGTERM) closes the Discord session cleanly, so no ghost bot stays online.

### Expected behavior

- When a handler throws, the end user gets a short, plain answer (e.g. which permission the bot is missing) and the developer gets the error with the line in their code.
- Discord limits (rate limits, payload sizes, presence throttling…) are handled by the framework, never by the user.
- Every value from user code is validated: errors appear at load time with a clear message, ideally underlined in the editor.
- **Ask as little as possible.** Every action the user has to take is a cost: never ask what can be detected, never ask a question with only one possible answer (take it and say so with `ℹ`), and preselect the most likely answer. Applies everywhere: CLI prompts, config, file conventions, error fixes.

## Messages

Every message is written for amateur developers: plain words, what happened, then what to do. Symbols: `✓` success, `↻` reload/reconnection, `ℹ` a note, `⚠` warning, `✗` error prefixed with the file (and line when known). Messages shown to end users never contain technical details.

## Keep things in sync

A change is not finished until these are updated, in the same change:

- **This file (CLAUDE.md)**: after every change that makes it inaccurate or incomplete, user-facing or internal: a new or removed module, a new public API, a renamed option or command, a new env var, a new convention, constraint or architecture decision. Never add work that was only discussed and not implemented.
- **Docs** (`apps/docs`, Mintlify: MDX pages, navigation in `docs.json`; read `apps/docs/AGENTS.md` first): after every user-facing change (new or renamed API, option, event, file convention, env var, CLI command or message users will see). New feature → its page, added to `docs.json`; changed API → every page and sample using it. Samples must compile against the current API and match the templates. Commands are shown for every package manager in a `<CodeGroup>`, always in the order pnpm, npm, yarn, bun (pnpm is the preferred one, same order as the scaffolder).
- **Templates** (`packages/create-chapter/templates/`): how users discover the framework. Every template must type-check and run without errors; only templates that clearly need a privileged intent may require one, other examples stay commented. Prefer short commented examples over extra files.
- **Tests**: see below.

## Tests

Every change comes with its tests, in the same change: a new feature gets new tests, a changed behavior gets its tests updated, a fixed bug gets a test that fails without the fix. A change is not finished until `pnpm test` and `pnpm check-types` pass.

- **Vitest** (version set once in the `catalog` of `pnpm-workspace.yaml`), in every package: `test/**/*.test.ts` next to `src/`, never built nor published. Shared settings live in `vitest.shared.ts` at the root, merged by each package's `vitest.config.ts`. `test/tsconfig.json` type-checks tests with the sources.
- **Test hard, not just the happy path**: empty, blank and huge inputs, unicode, every branch and error message, cancellation, missing tools, failing commands, files already there, several things at once. Prefer `it.each` tables to cover many cases.
- **End-to-end tests run the real thing**: the built CLI as a separate process (`startCli`, after a `globalSetup` that builds the package so `dist/` is never stale), with the outside world faked through `PATH` (`fakeBin`) instead of mocks, and its environment fully controlled (nothing inherited from the runner). Assert what the user sees (messages, next steps) and what ends up on disk.
- **Mocks only for what can't run for real** (e.g. an interactive prompt in a unit test). Each test cleans after itself (`tempDir`, restored mocks and env).
- **Check that tests catch bugs**: after writing tests for a piece of code, reintroduce plausible bugs one at a time and confirm a test fails for each; a bug that no test catches means a missing test.
- Tests that need a POSIX shell are skipped on Windows (`describe.skipIf(process.platform === 'win32')`).
- Discord itself is never called by tests: a fake Discord (REST and gateway) will be needed for `chapterjs` and belongs in `@chapterjs/test-utils`.

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
