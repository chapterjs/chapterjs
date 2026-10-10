# create-chapterjs

Creates a [ChapterJS](https://www.chapterjs.org) Discord bot: a project where every file of `src/` is a command, an event, a button, a task… and where the `chapterjs` CLI does everything else.

```bash
pnpm create chapterjs my-bot
```

```bash
npm create chapterjs my-bot
```

```bash
yarn create chapterjs my-bot
```

```bash
bun create chapterjs my-bot
```

`pnpm create chapter` works too.

## What it asks

- **The folder**, when it is not given: `.` is the current folder, which must be new or empty.
- **The package manager**, among those installed on your machine: the one you ran the command with is preselected.
- **A template**: `default` is one file, the `ready` event, and the [tutorial](https://www.chapterjs.org/tutorial) starts from it. The others are complete bots to start from or to read: `tickets` (support tickets in private threads), `music` (a player with a queue and buttons), `community` (welcome cards, roles people pick, weekly stats) and `moderation` (timeouts, purge, slowmode, lock, and a log of every action).

A question with only one possible answer is not asked: its answer is shown with `ℹ`. Node 24 or later is needed, and the command says so at once when it is older.

Then it copies the template, installs its dependencies, and tells you what to do next: fill `.env` with your bot token and your test server, and run `chapterjs dev`. The project depends on the exact version of `chapterjs` this command had: `pnpm create chapterjs@1.0.0` gives a project on `chapterjs@1.0.0`.

📖 [Quickstart](https://www.chapterjs.org/quickstart) · [Project structure and templates](https://www.chapterjs.org/setup/project-structure) · [Source and issues](https://github.com/chapterjs/chapterjs)

## License

[MIT](./LICENSE)
