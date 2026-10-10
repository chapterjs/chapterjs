# ChapterJS

**The Discord framework: ultra simple, but ultra customizable.**

Drop files into `src/`, and the `chapterjs` CLI does everything else: the connection, the intents, the registration of commands, hot reload, sharding and several processes for large bots. Everything you write is typed end to end, without a single type to write.

```bash
pnpm create chapter my-bot
```

📖 Documentation, in English and in French: **[chapterjs.org](https://www.chapterjs.org)**

## A file is what it exports

```ts
// src/commands/hello.ts
import { command } from 'chapterjs';

export default command({
  name: 'hello',
  description: 'Says hello to someone',
  cooldown: '10s',
  options: {
    who: { type: 'user', description: 'Who to greet', required: true },
  },
  async run({ interaction, options }) {
    // options.who is a User: typed from the options above.
    await interaction.reply(`Hello ${options.who}!`);
  },
});
```

The framework loads every file of `src/`, wherever it is and whatever it is called, and runs what the files export: `command()`, `event()`, `button()`, `select()`, `modal()`, `embed()`, `task()`, `store()`, `presence()`, `language()`. The folders are yours to organise with.

## What it does

- **Slash commands** with typed options, choices, autocomplete, permissions, cooldowns and translations.
- **Events**: the intents follow from the files you write, privileged ones included, with a direct link when one must be enabled.
- **Components**: buttons, select menus, forms and embeds, with typed `data` carried in the message and no id to write.
- **Tasks**: every so often or with a cron, in the timezone you choose.
- **Storage**: `store<Warning[]>({ expires: '30d' })` keeps data from one restart to the next, per server, typed, in a JSON file written for you.
- **Translated messages**: `t('welcome', { name })` speaks the language of who will read it.
- **Voice**: join a channel and play a file, an attachment or a link, end-to-end encrypted (DAVE).

## Three commands

- `chapterjs dev` runs the bot on a test server and reloads each file when you save it. A broken file is reported with its line and never stops the bot.
- `chapterjs build` checks every file and the types, then compiles the bot into one JavaScript file.
- `chapterjs start` runs it in production, on several processes when the bot is large.

Nothing to install to run a bot: the framework only uses what Node has (Node 24 or later). Discord's rate limits, payload sizes and reconnections are handled for you.

## Versions

`chapterjs`, `create-chapter` and `create-chapterjs` are always released with the same version, and follow [semantic versioning](https://semver.org): what a bot's files use (the functions exported by `chapterjs`, their options, what your functions receive, the files and env vars of a project, the CLI commands) only changes in a major version. A new feature comes in a minor one, a fix in a patch. The [changelog](https://www.chapterjs.org/changelog) says what each version brings, and `chapterjs dev` tells you when a new one is out.

## Contributing

The source, the issues and the documentation live in [github.com/chapterjs/chapterjs](https://github.com/chapterjs/chapterjs). Read [CONTRIBUTING.md](https://github.com/chapterjs/chapterjs/blob/master/CONTRIBUTING.md) to get started.

## License

[MIT](./LICENSE)
