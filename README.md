# ChapterJS

**The Discord framework: ultra simple, but ultra customizable.**

Drop files into folders, and the `chapterjs` CLI does everything else: the connection, the intents, the registration of commands, hot reload, sharding and several processes for large bots. Everything you write is typed end to end, without a single type to write.

```bash
pnpm create chapterjs my-bot
```

📖 Documentation, in English and in French: **[chapterjs.org](https://www.chapterjs.org)**

## Your files become a bot

```
src/
└── presence.ts              → presence({ ... }): the one file of a new project
```

That is the `minimal` template. The others are complete bots to start from or to read: `tickets` (support tickets in private threads, claimed and closed with buttons), `moderation` (warnings, timeouts, kicks, bans, purge, slowmode, lock, and a log of every action), `levels` (XP for every message, roles at each level, a leaderboard page after page) and `giveaways` (giveaways people enter with a button, drawn by a task when time is up). Every file of `src/` exports what it declares:

```
src/
├── tickets/
│   ├── panel.ts             → command({ name: 'ticket panel' }), and the button it posts
│   ├── form.ts              → modal({ ... }): the form a ticket starts with
│   ├── actions.ts           → button({ ... }) twice: claim and close, on every ticket
│   ├── add.ts               → command({ name: 'ticket add' })
│   ├── tickets.ts           → store(): the open tickets, and event({ name: 'channelDelete' })
│   └── messages.ts          → language({ locale: 'en-US' }), language({ locale: 'fr' })
└── presence.ts              → what the bot shows under its name
```

What a file exports says what it is: the framework loads every file of `src/` and runs what they declare, wherever they are. The folders are a choice, not a rule: a folder is only a folder. A command and an event have a name; a button is named by its export; what your function receives is inferred.

```ts
// src/events/wave.ts
import { event } from 'chapterjs';

export default event({
  name: 'reactionAdd',
  async run({ emoji, channel, messageId }) {
    if (emoji.name !== '👋') return;
    const message = await channel.fetchMessage(messageId);
    await message.react('👋');
  },
});
```

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

## What it does

- **Slash commands** with typed options, choices, autocomplete, permissions, cooldowns and translations, and **menu commands** on the right click of a message or a person.
- **Events**: the intents follow from the files you write, privileged ones included, with a direct link when one must be enabled.
- **Components**: buttons, select menus, forms and embeds, with typed `data` carried in the message and no id to write.
- **Waiting for an answer**: `await channel.waitForMessage({ matches: 'paris', within: '30s' })`, a click or a reaction, right where your function asked.
- **Tasks**: every so often or with a cron, in the timezone you choose.
- **Presence**: one activity, or several in turn, with texts computed when shown.
- **Storage**: `store<Warning[]>({ expires: '30d' })` keeps data from one restart to the next, per server, typed, in a JSON file written for you, or in Redis with `storage: 'redis'` and a `REDIS_URL`; `ranking()` keeps a score per member in order, for leaderboards.
- **Translated messages**: `t('welcome', { name })` speaks the language of who will read it.
- **Voice**: join a channel and play a file, an attachment or a link, end-to-end encrypted (DAVE).
- **Tests**: `chapterjs test` runs the bot against a Discord in memory, no token needed: every command, component, event and task is used once by itself, then your scenarios (`scenario('ping answers Pong', async bot => { … })`) say what the bot should answer.
- **Four commands**:
  - `chapterjs dev` runs the bot on a test server and reloads each file when you save it. A broken file is reported with its line and never stops the bot.
  - `chapterjs test` checks the bot without Discord, with nothing written and with your scenarios.
  - `chapterjs build` checks every file and the types, then compiles the bot into one JavaScript file.
  - `chapterjs start` runs it in production, on several processes when the bot is large.

Nothing to install to run a bot: the framework only uses what Node has (Node 24 or later). Discord's rate limits, payload sizes and reconnections are handled for you.

## Contributing

This repository is a pnpm and Turborepo monorepo:

| Folder                      | What it is                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/chapterjs`        | The framework and its `chapterjs` CLI                                                              |
| `packages/create-chapterjs` | `pnpm create chapterjs`, the project scaffolder, and its templates                                 |
| `packages/create-chapter`   | The same, as `pnpm create chapter`                                                                 |
| `packages/test-utils`       | Test helpers: the fake Discord of `chapterjs test`, closed with each test, and a fake voice server |
| `apps/docs`                 | The documentation site (Mintlify), in English and in French                                        |

```bash
pnpm install
pnpm build          # build every package
pnpm check-types    # type-check everything, tests included
pnpm test           # run every test suite
```

Branches: features and fixes are merged into `develop` through pull requests, and `develop` into `master` for a release, then deployed to npm by running the Deploy workflow, with the version written in the three `package.json` (always the same in all three).

[CONTRIBUTING.md](CONTRIBUTING.md) says what a change includes; a vulnerability is reported privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
