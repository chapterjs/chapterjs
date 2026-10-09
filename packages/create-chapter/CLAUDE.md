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
- `_gitignore` is renamed to `.gitignore` (npm strips `.gitignore` when publishing).
- An empty `public/` is created after the copy (git and npm keep no empty folder, so a template can't ship one; a template may still put files in it).
- The `chapterjs` dependency is set to `^<create-chapter version>`.
- When pnpm is the package manager, `pnpm-workspace.yaml` is written too (`PNPM_WORKSPACE`): pnpm 11 refuses to install a project that has esbuild anywhere in its dependencies (here through `chapterjs`) until it is told whether esbuild's install script may run (it may not, and esbuild does not need it); `allowBuilds` is for pnpm 11, `ignoredBuiltDependencies` for pnpm 10. This repo has the same setting in its own `pnpm-workspace.yaml`.
- Templates run `chapterjs sync` as `postinstall` and have a `typecheck` script (`tsc -b`).

### `default`

A folder per kind, by choice, not by rule (a feature folder like `src/(moderation)/` is just as valid: folders are the user's):

- `src/commands/`: `/ping`; `/hello`, which joins the voice channel of the person and plays `public/hello.ogg` (an Ogg Opus file of 3.5 s made with the speech of macOS), then leaves; `/play`, which plays the audio file the person sends as an `attachment` option, or the link given as a `string` option. Their texts come from the language files. Options with `autocomplete` and a `cooldown` are in `ping.ts`.
- `src/events/`: `ready.ts` (a task is a commented example there) and `wave.ts`, a `reactionAdd` that waves back at a 👋 and shows that the bot's own reaction is left out.
- One button, `again`, exported from `ping.ts` next to the command that shows it, counting its clicks with `data` (two declarations in one file).
- A presence "Playing with ChapterJS" in `src/presence.ts`.
- `src/messages/en-US.ts` and `fr.ts`, which `/ping` and the button answer with through `t`.
- No moderation example since 0.2.2 (`/ban`, `/kick`, `/warn` and their feature folder `src/(moderation)/` were removed).
