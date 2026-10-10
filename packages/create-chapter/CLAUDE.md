# packages/create-chapter

The project scaffolder (`pnpm create chapter [dir]`), built on `@clack/prompts`. `packages/create-chapterjs` is an alias so `pnpm create chapterjs` works too. The rules of the repo are in the root `CLAUDE.md`.

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
- The `chapterjs` dependency is set to the exact `create-chapter` version, no `^`: `create chapter@X` gives a project on `chapterjs@X`, which only changes version when its developer runs the command `chapterjs dev` offers.
- When pnpm is the package manager, `pnpm-workspace.yaml` is written too (`PNPM_WORKSPACE`): pnpm 11 refuses to install a project that has esbuild anywhere in its dependencies (here through `chapterjs`) until it is told whether esbuild's install script may run (it may not, and esbuild does not need it); `allowBuilds` is for pnpm 11, `ignoredBuiltDependencies` for pnpm 10. This repo has the same setting in its own `pnpm-workspace.yaml`.
- Templates run `chapterjs sync` as `postinstall` and have a `typecheck` script (`tsc -b`).

Templates today, each with its own flow in `packages/chapterjs/test/dev.test.ts` (`flows`, one per template, checked against the folder) and its row in `setup/project-structure` of the docs (`## Templates`, both languages). Every template but `default` has its texts in `en-US` and `fr` (a `messages.ts` next to what it translates, with the `commands` descriptions, so no command file has a `description`) and a presence.

### `default`

One file, `src/events/ready.ts`: the `ready` event printing a line, with a commented command as the next step. What the tutorial of the docs starts from: every chapter adds a file to it.

### `tickets`

`src/tickets/`: `panel.ts` (`/ticket panel`, `permissions: ['ManageThreads']`, posts an embed and the button `open`, which opens the form), `open.ts` (the modal `openTicket`: subject, category as a radio, details; its `run` refuses a second ticket while one is open (the store `tickets`, the thread id by person, per server), starts a private thread in the channel, adds the person, remembers it and posts the summary with the button `close({ userId })`), `close.ts` (the button `close`: the staff or who opened it may use it; the thread is locked and archived, the ticket forgotten, the opener told in private), `messages.ts`.

### `music`

`src/music/`: `queue.ts` (plain code: a `Map` of queues by server, `playQueue()` plays song after song until the queue is empty, then leaves; `clearQueue()`), `play.ts` (`/play` with a file or a link, which joins and starts the loop or queues, and the buttons `pause`, `skip`, `stop`, each refused to someone outside the bot's voice channel), `queue-command.ts` (`/queue`, with a plural text), `leave.ts` (`/leave`), `messages.ts`. No "leave when the channel is empty": the framework gives no list of who is in a voice channel.

### `community`

`src/welcome/` (`welcome.ts`: `memberJoin` posting a card, an `embed()` of the member, and `memberLeave`; `channel.ts`: plain code finding the channel named like asked, else the system channel), `src/roles/roles.ts` (`/roles` showing the select menu `pick` with the roles of a constant list, added and removed on selection, missing roles named in a follow-up), `src/stats/weekly.ts` (a cron task, Monday 9:00 Europe/Paris, posting the numbers of each server), `src/messages.ts`. The only template that needs a privileged intent (Server Members Intent, for `memberJoin`): its test world has every privileged intent.

### `moderation`

`src/moderation/`: `timeout.ts` (`/timeout` with `duration` as integer choices in minutes, refused on the owner and on someone whose highest role is not below the moderator's, and `/untimeout`), `purge.ts` (`/purge count [user]`, deferred, `bulkDelete` and its count), `channel.ts` (`/slowmode`, `/lock` denying `SendMessages` and thread creation to `@everyone` on the channel, `/unlock` deleting that overwrite), `log.ts` (`auditLogEntryCreate` posting kicks, bans, member updates, bulk deletes and permission changes in the channel named `mod-log`), `warn.ts` (`/warn add` and `/warn list` on the store `warnings`, `Warning[]` by member, per server, forgotten 30 days after the last one: what shows a store with an expiration), `messages.ts`. Different from the moderation example of 0.1 (`/ban`, `/kick`, `/warn`) on purpose.
