# Contributing to ChapterJS

Thank you for helping. Bugs and ideas go to the [issues](https://github.com/chapterjs/chapterjs/issues): the templates ask for what is needed to act on them. Code goes through a pull request into `develop`.

## Setting up

You need Node 24 or later and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/chapterjs/chapterjs.git
cd chapterjs
pnpm install
pnpm build          # build every package
pnpm check-types    # type-check everything, tests included
pnpm test           # run every test suite
pnpm format         # prettier
```

The repository is a pnpm and Turborepo monorepo:

| Folder                      | What it is                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| `packages/chapterjs`        | The framework and its `chapterjs` CLI                            |
| `packages/create-chapter`   | `pnpm create chapter`, the project scaffolder, and its templates |
| `packages/create-chapterjs` | The same, as `pnpm create chapterjs`                             |
| `packages/test-utils`       | Test helpers: fake Discord REST API, gateway and voice servers   |
| `apps/docs`                 | The documentation site (Mintlify), in English and in French      |

To try a change on a real bot, run `pnpm build`, then the CLI of `packages/chapterjs/dist/cli/cli.js` in a project of your own, with a `.env` holding `BOT_TOKEN` and `DEV_GUILD_ID`.

## What a change includes

The rules of the repository are in `CLAUDE.md` at the root, and each package and module describes itself in its own `CLAUDE.md`: read the one of the folder you touch. In short, a change is finished when, in the same pull request:

- **It is tested.** A new feature gets tests, a changed behavior gets its tests updated, a fixed bug gets a test that fails without the fix. Tests are Vitest, in `test/` next to `src/`; Discord is never called, it is played by the fakes of `packages/test-utils`.
- **The docs follow**, when a user can see the change: `apps/docs`, with every page in English and in French (`fr/`), samples that compile against the current API, and a line in the changelog. Read `apps/docs/AGENTS.md`, the style guide, first.
- **The templates follow**, when they use what changed: `packages/create-chapter/templates`, and each one type-checks and runs.
- **The `CLAUDE.md` of the folder follows**, when the change makes it inaccurate.
- `pnpm check-types`, `pnpm test` and `pnpm format` pass.

Some things are rules, not preferences: `chapterjs` has one dependency (esbuild, loaded by `chapterjs build` only) and none to run a bot; everything a user writes is typed end to end, with no `any` in the public API; the only source of truth for Discord is its [official documentation](https://docs.discord.com/developers/reference); and user code never drives the connection itself. A change that needs one of them to bend is a design to discuss in an issue first.

## Branches and releases

`master` is what is released, `develop` what comes next. Features and fixes are branches of `develop`, merged through a pull request that runs the checks (prettier, build, types, tests on Ubuntu and macOS). A release merges `develop` into `master` with the version written in the three `package.json` (always the same in all three), then the Deploy workflow publishes the packages on npm and tags the commit.

## Security

A vulnerability is not an issue: see [SECURITY.md](./SECURITY.md).
