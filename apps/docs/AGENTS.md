# Documentation site instructions

This is the user-facing documentation of ChapterJS, built on [Mintlify](https://mintlify.com): MDX pages with YAML frontmatter, navigation in `docs.json`. Preview with `mint dev` (install the CLI with `npm i -g mint`). Read the root `CLAUDE.md` first (the rules of the repo and what the docs must stay in sync with), then the `CLAUDE.md` of the package or module you document: `packages/chapterjs/CLAUDE.md` for the core, `packages/chapterjs/src/<feature>/CLAUDE.md` for a feature.

## Who reads this

Amateur developers writing their first Discord bot. They know JavaScript, maybe TypeScript, and little of the Discord API. Every page assumes that reader; the Tutorial assumes even less, and explains Discord itself.

## The three tabs

The landing page (`index.mdx`, mode `custom`, and `fr/index.mdx`) is in a hidden `Home` tab of `docs.json` (`searchable: true`, so it stays in search and sitemaps): it belongs to no visible tab, and the Guide tab, the first one, opens on `quickstart`. The order of the navbar is Guide, Tutorial, Reference, Changelog. Mintlify still marks the first tab as current on it, so `style.css` shows the tabs of a custom page as plain (`#navbar.is-custom`).

- **Tutorial** (`/tutorial/…`) is a course, read once from start to finish by someone who has never written a bot. It explains _why_ things are the way they are (what a token is, why intents exist, why `t` speaks the language of the readers) before showing how, builds one bot page after page, and never assumes a word is known. Every page has the same shape: what you are about to do and why, a complete file to copy, "Points of attention", a "Recap", then two cards (the next page, and its counterpart in the Guide). It repeats what the Guide says, on purpose, in more words; it never documents a behavior the Guide does not have.
- **Guide** (`/…`) is read in order and teaches. A guide page shows how to do one thing, with a complete file that works as is, and never lists an API: it links to the reference for that.
- **Reference** (`/reference/…`) is looked up and lists everything. A reference page never explains a concept: it links to the guide for that.

Each page of the Guide links to its counterpart in the Reference (`commands/answering` ↔ `reference/interaction`), and each page of the Tutorial to its counterpart in the Guide. The files of the tutorial's bot use names no other page uses (`dice`, `whois`, `reroll`, `pet`, `suggest`, `card`, `heartbeat`…): the samples of every page are compiled together in one scratch project, and a path shown twice with different content is renamed, so a tutorial file imported by another tutorial file must have its own name. Its language files are the ones of `translated-messages.mdx`, word for word, because `t` is typed from the first `src/messages/en-US.ts` of the site.

## Two languages

The site is in English and in French, and Mintlify shows a language switcher next to its name. `docs.json` has one entry per language under `navigation.languages`: `en` (the default) with the pages at the root, `fr` with the same navigation, translated group names and its own `navbar` and `footer`, pointing at the pages of `fr/`. Every page exists in both: `commands/answering.mdx` and `fr/commands/answering.mdx`, at the same path. A change to a page is not finished until its French version says the same thing; `docs.test.ts` fails when a page exists in one language only, and checks the reference of every structure in both.

What the French version translates, and what it keeps:

<!-- prettier-ignore -->
- **Translated**: the prose, the headings, the titles of steps, tabs and accordions, the texts of cards, the explanations of tables, the comments of samples, and the strings of samples that a person reads (a reply, a description, a label). Links point at `/fr/…`; an anchor is the slug Mintlify computes from the French heading (`## Délais entre deux utilisations` is `#délais-entre-deux-utilisations`, and a French ` : ` gives two hyphens: `#intents--rien-à-lister`).
- **Kept as they are**: every name of the API (functions, options, types, fields, `### kick()`, `<ResponseField name type>`), the values a type is made of (choices, options of a menu, keys of `data`, keys of `t`), the language files of `src/messages/` (byte for byte: the samples are compiled together, and `t` is typed from the first `en-US.ts`), and every message of the CLI and phrase the bot answers by itself, quoted in English as the person sees it, with the explanation around it in French. A reference description is the JSDoc of the source, translated.
- The French voice is the same as the English one, with « vous ». Terminology: serveur (never guilde), message privé, serveur de test, le bot, la personne, votre fonction, ce dont le bot se souvient, intents et intents privilégiés (with the English name of the Developer Portal option), événement, commande, formulaire, composant, bouton, menu déroulant, salon, fil, tâche, présence, compiler and compilation (for `chapterjs build`). The labels of the Discord app are given as a French Discord shows them (**Paramètres** → **Avancés** → **Mode développeur**); the Developer Portal is in English.

## Voice

- Second person, active voice, present tense. "Save a file and your bot uses the new version."
- Plain words. What happened, then what to do. No "simply", no "just", no "please note".
- One idea per sentence. Short paragraphs. Lists for parallel things, tables for things to compare.
- Sentence case for headings. A heading names what the section is about, not what it does ("Options", not "Declaring options").
- Code formatting for file names, paths, commands, values and code.
- Never guess: every behavior, message, limit and signature comes from `packages/chapterjs/src`. What the source does not do is not documented.

### Terminology

| Write                            | Never                                      | Why                                                                                         |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| server                           | guild (in prose)                           | Discord calls them servers; `Guild` stays in code                                           |
| private message                  | DM, direct message                         | `DMChannel` and `where: 'dm'` stay in code                                                  |
| test server                      | dev server, dev guild                      | The server of `DEV_GUILD_ID`                                                                |
| the bot                          | the client, the app                        | There is no client                                                                          |
| the person, who used the command | the user (in prose)                        | `User` is a type; "member" is a `GuildMember`                                               |
| your function, `run`             | handler, callback, listener                |                                                                                             |
| what the bot remembers           | the cache                                  | Users never configure a cache                                                               |
| intents, privileged intents      | gateway intents                            | With the name of the Developer Portal option: Message Content Intent, Server Members Intent |
| event, command                   | hook, listener, interaction (for commands) |                                                                                             |
| form                             | modal (in prose)                           | `modal()` and `ModalInteraction` stay in code; a "form" is what the person fills in         |
| component, button, menu          | custom_id, custom id (in prose)            | Users never see an id: the path of the file is what tells a component apart                 |
| ChapterJS                        | chapterjs (in prose)                       | `chapterjs` is the package and the CLI                                                      |

### Messages

The messages of the CLI are quoted as the user sees them, in a `text` code block, with their symbol: `✓` success, `ℹ` a note, `↻` reload or reconnection, `⚠` warning, `✗` error prefixed with the file (and line when known). The text comes from the source, not from memory.

## Page templates

### Guide page

````mdx
---
title: 'Commands'
description: 'One line that says what the reader can do after this page'
---

One sentence, then the first code block: a complete file that works as is, with its path as title.

```ts src/commands/ping.ts
…
```
````

"That is all": what happened by itself. Only then the variants, each with its own `##`.

<Note>The full list of what X has is in the [reference](/reference/member).</Note>

<CardGroup cols={2}> at most two "next" cards. </CardGroup>

````

### Reference page of a structure

```mdx
---
title: 'GuildMember'
description: 'A user as a member of one server: nickname, roles, permissions and moderation'
---

One sentence on what it is and where you get it. An example of 8 lines at most, typed with `import type`.

## Properties
<ResponseField name="displayName" type="string">The JSDoc of the getter.</ResponseField>

## Helpers            ← methods that read what the bot knows: "They never send a request."
### permissionsIn()
```ts
permissionsIn(channel: GuildChannel): Permissions
````

The JSDoc.

## Reading from Discord ← fetch…()

## Actions ← everything else, with the Discord link under the description

### kick()

```ts
kick(reason?: string): Promise<void>
```

The JSDoc.

[Discord documentation](https://docs.discord.com/developers/resources/guild#remove-guild-member)

## Types ← only types that have no page elsewhere; otherwise a link

`````

Rules:

- The description of a property or a method is **the JSDoc of the source, word for word**. A member without JSDoc is a hole to fill in the source, not a sentence to invent here. A changed signature or JSDoc is changed in both places.
- For option and data types that are `Camelize<Raw…>` of a Discord payload, the Discord sentence of the raw type is rewritten for this reader: camelCase names (`rateLimitPerUser`, never `rate_limit_per_user`), permission names as ChapterJS writes them (`ManageThreads`), no deprecated field (or `deprecated` on the field when it can't be left out), one `[Discord documentation](…)` link per table, not per row.
- Properties and fields use `<ResponseField name type>`; `required` marks what can't be left out (never a `?` in the name). A nested object uses `<Expandable title="…">`.
- Every method has its own `###` heading (that is its anchor), its signature in a `ts` block, then its description.
- A type that several pages use lives on one page and is linked everywhere else: `ImageOptions` in `reference/helpers`, `BanOptions` in `reference/member`, `ForumTag` in `reference/data`, everything a message takes in `reference/message-options`.
- Discord links point to the exact section of https://docs.discord.com/developers that the source links to.

### Reference page of an event

In `reference/events.mdx`, one `##` per event: a short table (When, Intents, Options, Remembers), then a `<ResponseField>` per field of what the function receives, with its exact type (`MemberMessage`, `GuildTextBasedChannel`, `Role`…).

## Design

The site is Mintlify's `luma` theme, set in `docs.json`, with the Lucide icon library (`icons.library`): every `icon` of a `<Card>`, a group or an `<Icon>` is a Lucide name (`terminal`, `zap`, `folder-tree`...), never a Font Awesome one. The palette is "paper and orchid": paper `#FAFAFA` and ink `#09090B` as backgrounds, orchid `#C026D3` as the accent (`#E879F9` on dark, `#A21CAF` for buttons), violet and pink only in the headline gradient; neutrals are Tailwind's `zinc`, never `stone`; code blocks use the `github-light` and `vesper` Shiki themes. Headings are Bricolage Grotesque, text is Geist (Google Fonts, loaded by Mintlify). The logo and the favicon (`logo/`, `favicon.svg`) are a bookmark on an orchid tile: the sign of a chapter.

`index.mdx` is the landing page (`mode: "custom"`: no sidebar, no default typography). It is written with Tailwind classes and the few `cj-` classes of `style.css` (gradients, glows, the colors of the editor, terminal and Discord mockup); nothing uses the `style` prop except a computed indentation. Its terminal lines are real messages of the CLI, and its claims only what exists: change it when the framework changes.

## Components

- `<CodeGroup>` for a command, always pnpm, npm, yarn, bun in that order.
- `<Tree>` with `Tree.Folder` / `Tree.File` for a folder structure (`highlight` on the file the page is about), never a hand-drawn tree in a text block.
- `<ResponseField>` for properties and fields, `<Expandable>` for a nested object.
- `<Steps>` for something done in order, `<Accordion>` for one message or one case, `<Tabs>` for two versions of the same file.
- `<Note>` for a link or a precision, `<Info>` for a behavior worth knowing, `<Warning>` for something that loses data or leaks a secret, `<Tip>` for a shortcut.
- Code blocks: a path as title for a file of the project (```` ```ts src/commands/ping.ts ````), `highlight={n}` for the line that changes, `expandable` over 30 lines.

## Samples

- Every sample compiles against the current API and matches what the templates do. Imports are `import { command } from 'chapterjs'`, `import { event } from 'chapterjs'`, `import type { Guild } from 'chapterjs'`.
- A sample of a user file is complete (import, `export default`), and its title is its path.
- A sample that is not a user file is a function taking the structure as a typed parameter, never a bare variable.
- No `any`, no `as`, no `!`. What the types make impossible (`message.guild` in a `'dm'` file) is never written.

## What is not documented

- The internal environment variables (`CHAPTERJS_API_URL`, `CHAPTERJS_IDENTIFY_INTERVAL`, `CHAPTERJS_PROCESS`, `CHAPTERJS_COLORS`): tests and workers only.
- Anything about the inside of the framework (gateway, shards, REST client, cache classes): users see servers, members and messages. `memory.mdx` is the one page about what happens behind, in user terms.
- Features that are not written yet, except in `not-yet.mdx`, which lists them so that nobody looks for them.

## Keeping in sync

A change in the framework is not finished until the docs follow, in the same change (see `CLAUDE.md`): a new or renamed API, option, event, convention, env var, command or message. New feature → its guide page and its reference page, in both languages, all in `docs.json`. Changed API → every page and sample using it, in English and in French. `memory.mdx` follows `CacheLimits` and `core/memory.ts`. `index.mdx` (the landing page) only claims what exists. A release adds its `<Update label="<version>">` at the top of `changelog.mdx` (the Changelog tab), in both languages: what a user can now do, each line linking its guide page.

`packages/chapterjs/test/docs.test.ts` checks the site against the package: every page of `docs.json` exists and every page is in `docs.json`; every name exported by the package appears in code in some page; every public method and property of a structure class is on its reference page (a method under its `### name()` heading, a property as a `<ResponseField>`), and no `### name()` names a method that does not exist; and every `ts` sample that is a program (a user file titled with its path, or a function taking a typed structure) compiles with `tsc -b` in a scratch project, with the generated types of its folder. A signature block (`kick(reason?: string): Promise<void>`) is not a program and is left alone.
`````
