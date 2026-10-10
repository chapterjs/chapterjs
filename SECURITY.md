# Security

A Discord bot holds a token that gives full control of the bot: a vulnerability in ChapterJS can expose the bots of everyone who uses it. Please report one privately, so that it is fixed before it is known.

## Reporting a vulnerability

Use [Report a vulnerability](https://github.com/chapterjs/chapterjs/security/advisories/new) on GitHub. It opens a private advisory that only the maintainers see. Do not open a public issue, and do not post it on Discord.

Say what you found, how to reproduce it (a project of `src/` files is ideal) and what an attacker can do with it. You will get an answer within a week, and the fix is released in a patch version of the three packages as soon as it is ready, with a note in the [changelog](https://www.chapterjs.org/changelog) and a GitHub advisory crediting you, unless you prefer not to be named.

## Supported versions

Only the latest version is maintained: a fix is released as a new version, never backported. `chapterjs dev` tells you when a new version is out.

## What is yours to keep safe

- Your bot token, in `.env`, is never committed: every template ignores it.
- Everything the bot keeps in `data/` (its stores) is plain JSON on the machine running it.
- What people type in a command, a form or a message reaches your functions as is: the framework checks the shape Discord declared, not what the text means.
