# Documentation site instructions

This is the user-facing documentation of ChapterJS, built on [Mintlify](https://mintlify.com): MDX pages with YAML frontmatter, navigation in `docs.json`. Preview with `mint dev` (install the CLI with `npm i -g mint`). Read the root `CLAUDE.md` first: it describes the framework, and what the docs must stay in sync with.

## Who reads this

Amateur developers writing their first Discord bot. They know JavaScript, maybe TypeScript, and little of the Discord API. Every page assumes that reader.

## The two tabs

- **Guide** (`/…`) is read in order and teaches. A guide page shows how to do one thing, with a complete file that works as is, and never lists an API: it links to the reference for that.
- **Reference** (`/reference/…`) is looked up and lists everything. A reference page never explains a concept: it links to the guide for that.

Each page of one tab links to its counterpart in the other (`commands/answering` ↔ `reference/interaction`).

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

A change in the framework is not finished until the docs follow, in the same change (see `CLAUDE.md`): a new or renamed API, option, event, convention, env var, command or message. New feature → its guide page and its reference page, both in `docs.json`. Changed API → every page and sample using it. `memory.mdx` follows `CacheLimits` and `core/memory.ts`. `index.mdx` (the landing page) only claims what exists.

`packages/chapterjs/test/docs.test.ts` checks the site against the package: every page of `docs.json` exists and every page is in `docs.json`; every name exported by the package appears in code in some page; every public method and property of a structure class is on its reference page (a method under its `### name()` heading, a property as a `<ResponseField>`), and no `### name()` names a method that does not exist; and every `ts` sample that is a program (a user file titled with its path, or a function taking a typed structure) compiles with `tsc -b` in a scratch project, with the generated types of its folder. A signature block (`kick(reason?: string): Promise<void>`) is not a program and is left alone.
`````
