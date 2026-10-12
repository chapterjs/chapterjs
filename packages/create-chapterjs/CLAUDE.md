# packages/create-chapterjs

The project scaffolder (`pnpm create chapterjs [dir]`), built on `@clack/prompts`. `packages/create-chapter` is an alias so `pnpm create chapter` works too. The rules of the repo are in the root `CLAUDE.md`.

## What it asks

- The target folder (`.` = current folder, must be new or empty).
- The package manager: each one is checked with `<pm> --version` in parallel during the first question; missing ones are shown but disabled; the one from `npm_config_user_agent` is preselected.
- A template. Then it copies it and runs `<pm> install`.
- A question with only one possible answer is skipped and its answer logged (`choose.ts`). Node older than 24 is refused at once with what to install (`node-version.ts`, `nodeTooOld()`).

## Modules

- `project.ts`: folder validation, copy, package name.
- `package-manager.ts`: detection, installed versions, install.
- `templates.ts`: listing.
- `choose.ts`: a select menu that skips itself and logs the answer when only one choice can be picked; used for the package manager and the template.

## Templates

Every folder of `templates/` is a template. They are how users discover the framework: every template must type-check and run without errors (`packages/chapterjs/test/` runs each one against the fake Discord); only templates that clearly need a privileged intent may require one, other examples stay commented. Prefer short commented examples over extra files. A new template comes with its own tests.

- The menu hint is the template's package.json `description` (removed on copy); `default` is listed first.
- `_gitignore` is renamed to `.gitignore` (npm strips `.gitignore` when publishing). It ignores `data/`, where the stores of a project keep their files.
- An empty `public/` is created after the copy (git and npm keep no empty folder, so a template can't ship one; a template may still put files in it).
- The `chapterjs` dependency is set to the exact `create-chapterjs` version, no `^`: `create chapterjs@X` gives a project on `chapterjs@X`, which only changes version when its developer runs the command `chapterjs dev` offers.
- When pnpm is the package manager, `pnpm-workspace.yaml` is written too (`PNPM_WORKSPACE`): pnpm 11 refuses to install a project that has esbuild anywhere in its dependencies (here through `chapterjs`) until it is told whether esbuild's install script may run (it may not, and esbuild does not need it); `allowBuilds` is for pnpm 11, `ignoredBuiltDependencies` for pnpm 10. This repo has the same setting in its own `pnpm-workspace.yaml`.
- Templates run `chapterjs sync` as `postinstall` and have a `typecheck` script (`tsc -b`) and a `test` script (`chapterjs test`). Every template but `default` has one scenario file (`*.test.ts`, next to what it tests: `tickets/tickets.test.ts`, `moderation/moderation.test.ts`, `community.test.ts`, `music/music.test.ts`, `games.test.ts`), short, checking its main flows with `scenario()` from `chapterjs/test`; `packages/chapterjs/test/dev.test.ts` type-checks them with the template, and `chapterjs test` must pass on every template.

Templates today (`default`, `tickets`, `music`, `community`, `moderation`, `games`), each with its own flow in `packages/chapterjs/test/dev.test.ts` (`flows`, one per template, checked against the folder) and its row in `setup/project-structure` of the docs (`## Templates`, both languages). Every template but `default` has its texts in `en-US` and `fr` (a `messages.ts` next to what it translates, with the `commands` descriptions, so no command file has a `description`) and a presence.

### `default`

One file, `src/events/ready.ts`: the `ready` event printing a line, with a commented command as the next step. What the tutorial of the docs starts from: every chapter adds a file to it.

### `tickets`

`src/tickets/`: `panel.ts` (`/ticket panel`, `permissions: ['ManageThreads']`, posts an embed and the button `open`, which opens the form), `open.ts` (the modal `openTicket`: subject, category as a radio, details; its `run` refuses a second ticket while one is open (the store `tickets`, the thread id by person, per server), starts a private thread in the channel, adds the person, remembers it and posts the summary with the button `close({ userId })`), `close.ts` (the button `close`: the staff or who opened it may use it; the thread is locked and archived, the ticket forgotten, the opener told in private), `messages.ts`.

### `music`

`src/music/`: `queue.ts` (plain code: a `Map` of queues by server, `playQueue()` plays song after song until the queue is empty, then leaves; `clearQueue()`), `play.ts` (`/play` with a file or a link, which joins and starts the loop or queues, and the buttons `pause`, `skip`, `stop`, each refused to someone outside the bot's voice channel), `queue-command.ts` (`/queue`, with a plural text), `leave.ts` (`/leave`), `messages.ts`. No "leave when the channel is empty": the framework gives no list of who is in a voice channel.

### `community`

`src/welcome/` (`welcome.ts`: `memberJoin` posting a card, an `embed()` of the member, and `memberLeave`; `channel.ts`: plain code finding the channel named like asked, else the system channel), `src/roles/roles.ts` (`/roles` showing the select menu `pick` with the roles of a constant list, added and removed on selection, missing roles named in a follow-up), `src/stats/weekly.ts` (a cron task, Monday 9:00 Europe/Paris, posting the numbers of each server), `src/messages.ts`. One of the two templates that need a privileged intent (Server Members Intent, for `memberJoin`; `games` needs Message Content): its test world has every privileged intent.

### `games`

What waiting, menu commands and a presence that rotates look like together. `src/quiz/` (`questions.ts`: plain code, the questions as keys of the language files with the regular expression of their answer; `scores.ts`: the ranking `quizScores`, one point per right answer per server, and the store `answered`, global, counted for the presence; `quiz.ts`: `/quiz start`, which asks a random question and waits 30 s with `channel.waitForMessage({ matches })` for the first right answer, one quiz per channel through a channel cooldown, and `/quiz scores`, the top 10 in an embed; `score-menu.ts`: the user menu `Quiz score`, translated by its `locales`), `src/duel/duel.ts` (the buttons `accept` and `decline` without `run`, `/duel opponent` and the message menu `Challenge to a duel` sharing one function: `waitForClick({ from: opponent })`, then a die each), `src/presence.ts` (three activities in turn, two of them functions: the answers found, from the store, and the servers, with `t`), `src/messages.ts`. Needs the Message Content Intent (the quiz reads the answers): its test world has every privileged intent.

### `moderation`

`src/moderation/`: `timeout.ts` (`/timeout` with `duration` as integer choices in minutes, refused on the owner and on someone whose highest role is not below the moderator's, and `/untimeout`), `purge.ts` (`/purge count [user]`, deferred, `bulkDelete` and its count), `channel.ts` (`/slowmode`, `/lock` denying `SendMessages` and thread creation to `@everyone` on the channel, `/unlock` deleting that overwrite), `log.ts` (`auditLogEntryCreate` posting kicks, bans, member updates, bulk deletes and permission changes in the channel named `mod-log`), `warn.ts` (`/warn add` and `/warn list` on the store `warnings`, `Warning[]` by member, per server, forgotten 30 days after the last one: what shows a store with an expiration), `messages.ts`. Different from the moderation example of 0.1 (`/ban`, `/kick`, `/warn`) on purpose.
