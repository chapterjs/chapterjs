# `commands/`: slash commands

`command({ name: 'ping', ... })` is `/ping`, `name: 'mod ban'` is `/mod ban`, `name: 'mod roles add'` is `/mod roles add` (Discord allows nothing deeper), exported from any file of `src/` (several per file, in a list too). A declaration is `command({ name, description, options, locales, permissions, where, nsfw, ephemeral, cooldown, autocomplete, run })`. `command` is typed the same everywhere, so it is a normal export of `index.ts`. What every interaction shares (`interactions/`) and the `Interaction` structures are described in `packages/chapterjs/CLAUDE.md`; the texts of commands in `src/messages/CLAUDE.md`.

- `description` (and the descriptions of options) may be left out when the language files give them (see `messages/`).
- A command with subcommands needs no declaration of its own: its description (which Discord never shows) is generated, and its name is not translated.

## `command.ts`: `command()` and its types

- Options are declared as an object (`{ target: { type: 'user', description, required: true } }`) and `run` receives their values typed from that declaration (`OptionValuesOf`: required → the value, optional → `| undefined`, `choices` → the union of the choices).
- `where: 'guild' | 'dm' | 'both'` (servers by default) is where the command can be used, registered as Discord's `contexts`. What `run` receives follows it (`CommandContext<Options, Where>`): in a server `guild`, `member` and `channel` are there (`GuildCommandInteraction`); with `'dm'` they do not exist at all (`DmCommandInteraction`); with `'both'` it is a union told apart by `guild` (`GuildCommandInteraction | PrivateCommandInteraction`), so one `if (guild)` narrows everything. It follows the docs: `member` is sent in a server, `user` in a private message.
- `cooldown` is how long to wait before the command can be used again: a `Duration` (`util/duration.ts`) for each person, or `{ user?, channel?, guild? }` (1 s at least, no `guild` with `where: 'dm'`).
- `locales` (translations by language: name, description, options, choices) is typed against the declared options and choices, with `NoInfer` so it never takes part in inferring them.

## `declaration.ts`

- The `Declaration` of commands. `read` validates `name` (`readCommandName`: words of lowercase letters, digits, `-` and `_`, three at most) and everything the declaration says against Discord's limits (translations included: known language, existing option and choice, no two options with the same name in a language), with a message that says what to write, and sorts required options first. It returns a `LoadedCommand` (`path` is the words of the name, `described` whether the file owns its texts).
- `checkLocales` is exported for `messages/commands.ts`, which checks a language's translations the same way.
- `scanCommands()` finds the names by reading the files without running them, for `sync`.

## `tree.ts`

- `findConflicts`: two declarations of the same command, wherever they are, or a command that also has subcommands. Each is reported on the later one (file, then export), which is left out.
- `buildCommands`: what Discord registers, one command per top-level name. A folder has a generated description, its default permissions are what every subcommand asks for, and it is offered wherever one of its subcommands works. For the commands of one server, where Discord takes no contexts and never offers them in private messages, what only works in private messages is left out (`privateOnly`, which `chapterjs dev` tells the developer once per file). Translations become Discord's `name_localizations` / `description_localizations`, left out when empty. Options with autocomplete are registered with `autocomplete: true`.

## `register.ts` and `twins.ts`

- `register.ts`: bulk overwrite of the commands, of one server (dev) or for everyone (start), only when the payload changed: its hash is kept in `.chapterjs/cache/` (one file per kind; `writeGenerated` leaves the folder alone), so restarting or changing what a command _does_ costs no request.
- `twins.ts`: Discord shows a global command and a server command of the same name both. `withoutGlobalTwins()` leaves out of the dev server the commands production already has for everyone exactly as declared (`sameDefinition()` compares definitions whatever Discord adds or leaves empty); a command that changed is kept, shown twice, and dev says so once. The global list is asked once per `chapterjs dev`.

## `router.ts`

Interaction Create → the command of that path → the context (`interaction`, `options` resolved into structures, `user`, `member`, `guild`, `channel`, `t`), after checking:

- That it is used where it works (`resolvePlace` of `interactions/dispatch.ts`). A command of private messages receives no `guild` nor `member` at all. The channel comes from the interaction itself, so it is always there without a request; a command used where the bot can't answer does not run.
- The command's permissions against the member's (a private refusal otherwise).
- Its cooldown (`interactions/cooldown.ts`: `checkCooldown()` against a `CooldownStore`, `MemoryCooldowns` by default, kept by the router so a reload keeps the last uses and a restart starts empty; one key per command, scope and id). A refused use counts for nothing, and the person is told the scope that ends last, in the `cooldown` phrase, as a relative Discord timestamp whose refusal deletes itself when the cooldown ends (an unref'd timer: a relative time would keep counting into "52 seconds ago"), or as a date and time when it ends after the 15 minutes an interaction can be edited (`DELETE_WITHIN`). A store shared between processes is another implementation, given through `CommandRouterOptions.cooldowns`.

Then `runInteraction`: it defers by itself after 2 s without an answer (Discord gives 3), tells the person something plain when `run` throws (privately, in the pending answer if there is one) and reports the error with its file and line; a `run` that never answers is a warning.

## `autocomplete.ts`: suggestions while the person types

- A file declares `autocomplete: { <option>: fn }`, a sibling of `options` keyed by option name (never inside the option: a function inside `options` can't be typed from the options being inferred, TS gives `any`), for a `string`, `integer` or `number` option without `choices` (`checkAutocomplete` in `convention.ts`, `LoadedCommand.autocomplete`; `tree.ts` registers `autocomplete: true` for those options, so the hash changes and the command is registered again).
- `CommandAutocomplete<Options, Where>` types the block from the options (`Suggestable` names; when none can, every key is refused with a sentence as the type). Each function receives `AutocompleteContext` (`value`: the text typed so far, or for a number a number or `undefined`; `options`: `OptionsSoFar`, every option optional, entities as ids; `user`, `locale`, `t`, and the place following `where` like `run`, without `interaction`) and returns `Suggestion[]` (a value, or `{ name, value }`).
- The router sends Interaction Create of type 4 to `suggest()`: the focused option → its function → `toChoices()` checks the result (what can be fixed is fixed and said once per option with `⚠`: more than 25, a name over 100 characters cut; what can't is a `✗` and nothing is suggested: not a list, a value of the wrong kind, a text value over 100 characters) → one request of callback type 8.
- Every path answers, so the person never waits on a spinner; a thrown function is reported with its line. Unknown interaction (10062) after 3 s is a `⚠` saying to be faster, before that it is silence (the person typed on). Discord gives no defer for it.
