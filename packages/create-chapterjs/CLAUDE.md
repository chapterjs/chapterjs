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
- `templates.ts`: listing, `minimal` first (`DEFAULT_TEMPLATE`).
- `choose.ts`: a select menu that skips itself and logs the answer when only one choice can be picked; used for the package manager and the template.

## Templates

Every folder of `templates/` is a template. They are how users discover the framework: every template must type-check and run without errors (`packages/chapterjs/test/` runs each one against the fake Discord); only templates that clearly need a privileged intent may require one, other examples stay commented. Prefer short commented examples over extra files. A new template comes with its own tests.

- The menu hint is the template's package.json `description` (removed on copy); `minimal` is listed first, so it is preselected.
- `_gitignore` is renamed to `.gitignore` (npm strips `.gitignore` when publishing). It ignores `data/`, where the stores of a project keep their files.
- An empty `public/` is created after the copy (git and npm keep no empty folder, so a template can't ship one; a template may still put files in it).
- The `chapterjs` dependency is set to the exact `create-chapterjs` version, no `^`: `create chapterjs@X` gives a project on `chapterjs@X`, which only changes version when its developer runs the command `chapterjs dev` offers.
- When pnpm is the package manager, `pnpm-workspace.yaml` is written too (`PNPM_WORKSPACE`): pnpm 11 refuses to install a project that has esbuild anywhere in its dependencies (here through `chapterjs`) until it is told whether esbuild's install script may run (it may not, and esbuild does not need it); `allowBuilds` is for pnpm 11, `ignoredBuiltDependencies` for pnpm 10. This repo has the same setting in its own `pnpm-workspace.yaml`.
- Templates run `chapterjs sync` as `postinstall` and have a `typecheck` script (`tsc -b`) and a `test` script (`chapterjs test`). Every template but `minimal` has one scenario file (`*.test.ts`, next to what it tests: `tickets/tickets.test.ts`, `moderation/moderation.test.ts`, `levels/levels.test.ts`, `giveaways/giveaways.test.ts`), short, checking its main flows with `scenario()` from `chapterjs/test`.

Templates today (`minimal`, `tickets`, `moderation`, `levels`, `giveaways`, checked by `test/templates.test.ts`). `packages/chapterjs/test/dev.test.ts` puts each one through the same steps: `chapterjs sync`, `tsc -b`, `chapterjs test` (no `✗` nor `⚠`), then `chapterjs dev` against the fake Discord with its own flow (`flows`, one per template, checked against the folder). Each has its row in `setup/project-structure` of the docs (`## Templates`, both languages). Every template but `minimal` has its texts in `en-US` and `fr` (a `messages.ts` next to what it translates, with the `commands` descriptions, so no command file has a `description`; menu commands translate their name with `locales`) and a presence. Colors are the fuchsia of the docs, `0xc026d3`.

### `minimal`

The default. One file, `src/presence.ts`: a custom status ("Getting ready"), with a commented command as the next step. What the tutorial of the docs starts from: every chapter adds a file to it (its events chapter creates `src/events/ready.ts`).

### `tickets`

`src/tickets/`: `tickets.ts` (the store `tickets`, the thread id by person, per server, and the event `forgetDeleted`: `channelDelete` of a thread forgets its ticket), `panel.ts` (`/ticket panel`, `permissions: ['ManageThreads']`, ephemeral, posts an embed and the button `open`, which opens the form), `form.ts` (the modal `ticketForm`: subject, category as a radio, details; refuses a second ticket while one is open, starts a private thread in the channel, adds the person, remembers it and posts the summary with `claim({ userId })` and `close({ userId })`), `actions.ts` (`claim`: the staff only, the message updated with the button disabled and "Claimed by …", then a follow-up; `close`: the staff or who opened it, the thread locked and archived, the ticket forgotten, the opener told in private), `add.ts` (`/ticket add user`, in a ticket thread), `messages.ts`.

### `moderation`

`src/moderation/`: `members.ts` (`/timeout` with `duration` as integer choices in minutes, `/untimeout`, `/kick`, `/ban` with `messages` as choices of seconds to delete; all go through `targetOf()`, which refuses someone who is not a member, yourself, and anyone `member.isHigherThan()` says is not below the moderator), `warnings.ts` (`/warn add`, which also tells the person in private, `/warn list`, `/warn clear`, on the store `warnings`, `Warning[]` by member, per server, forgotten 30 days after the last one), `purge.ts` (`/purge count [user]`, deferred, `bulkDelete` and its count), `channel.ts` (`/slowmode`, `/lock` denying `SendMessages` and thread creation to `@everyone` on the channel, `/unlock` deleting that overwrite), `log.ts` (`auditLogEntryCreate` posting kicks, bans, member updates, bulk deletes and permission changes in the channel named `mod-log`, without pinging), `messages.ts` (the choices translated too).

### `levels`

What a ranking, an embed function, buttons with data and a menu command look like together. `src/levels/`: `xp.ts` (the ranking `xp`, per server, and plain code: `xpForLevel()`, 100 XP more per level, `levelOf()`, `progressBar()`), `gain.ts` (`messageCreate`: 15 to 25 XP once a minute per person, kept in a `Map` that forgets itself past 1000 entries; a new level is answered under the message and gives the roles of `REWARDS` it crossed, found by name), `rank.ts` (the embed `rankCard`, `/rank [user]`, the user menu `Rank` translated by its `locales`, `/xp set` for `ManageGuild`), `leaderboard.ts` (`/leaderboard`, 10 per page, and one button `turn` with `data: { page }`, put twice, previous and next, disabled at the ends; a page out of range is the nearest one), `messages.ts`, `src/presence.ts` (two activities in turn, one a function of `guilds`). The only template that needs a privileged intent (Message Content, which `messageCreate` asks for): its test world has every privileged intent.

### `giveaways`

What a global store, a task and message menus look like together. `src/giveaways/`: `giveaways.ts` (the store `giveaways`, `scope: 'global'`, keyed `[guildId, messageId]`, so the task reads everything at once and `entries(guild.id)` lists a server; the embed `giveawayCard`; plain code: `draw()`, `announce()` (the message edited, its button disabled, the winners told under it, or in the channel when the message is gone), `finish()` (ends and draws once, inside `update()`, kept 7 days after)), `enter.ts` (the button `enter`: a click enters, a second leaves, through `update()`; the label counts the entrants, and a private follow-up says what happened), `start.ts` (`/giveaway start prize duration [winners]`, `ManageGuild`, the answer is the giveaway and its id the key), `manage.ts` (the task `drawGiveaways`, every minute, comparing with `now`; `/giveaway list`, ephemeral; the message menus `End giveaway` and `Reroll giveaway`, `ManageGuild`, the reroll leaving out who already won when it can), `messages.ts`, `src/presence.ts` (one activity whose text counts the giveaways running, every minute).
