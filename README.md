# ChapterJS

**The Discord framework: ultra simple, but ultra customizable.**

Drop files into folders, and the `chapterjs` CLI does everything else: the connection, the intents, the registration of commands, hot reload, sharding and several processes for large bots. Everything you write is typed end to end, without a single type to write.

```bash
pnpm create chapter my-bot
```

📖 Documentation, in English and in French: **[chapterjs.dev](https://chapterjs.dev)**

## A folder of files becomes a bot

```
src/
├── commands/
│   ├── ping.ts              → /ping
│   └── mod/ban.ts           → /mod ban
├── events/
│   └── reactionAdd/wave.ts  → runs on every reaction
├── components/
│   └── buttons/again.ts     → a button, its id is its path
├── tasks/
│   └── report.ts            → every 10 minutes, or at set times
├── messages/
│   ├── en-US.ts             → the texts of the bot, one file per language
│   └── fr.ts
└── presence.ts              → what the bot shows under its name
```

Where a file is says what it is: it never repeats its own name, and what your function receives is inferred.

```ts
// src/events/reactionAdd/wave.ts
import { event } from 'chapterjs';

export default event(async ({ emoji, channel, messageId }) => {
  if (emoji.name !== '👋') return;
  const message = await channel.fetchMessage(messageId);
  await message.react('👋');
});
```

```ts
// src/commands/hello.ts
import { command } from 'chapterjs';

export default command({
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

- **Slash commands** with typed options, choices, autocomplete, permissions, cooldowns and translations.
- **Events**: the intents follow from the files you write, privileged ones included, with a direct link when one must be enabled.
- **Components**: buttons, select menus, forms and embeds, with typed `data` carried in the message and no id to write.
- **Tasks**: every so often or with a cron, in the timezone you choose.
- **Translated messages**: `t('welcome', { name })` speaks the language of who will read it.
- **Voice**: join a channel and play a file, an attachment or a link, end-to-end encrypted (DAVE).
- **Three commands**:
  - `chapterjs dev` runs the bot on a test server and reloads each file when you save it. A broken file is reported with its line and never stops the bot.
  - `chapterjs build` checks every file and the types, then compiles the bot into one JavaScript file.
  - `chapterjs start` runs it in production, on several processes when the bot is large.

Nothing to install to run a bot: the framework only uses what Node has (Node 22.18 or later). Discord's rate limits, payload sizes and reconnections are handled for you.

## Contributing

This repository is a pnpm and Turborepo monorepo:

| Folder                      | What it is                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| `packages/chapterjs`        | The framework and its `chapterjs` CLI                            |
| `packages/create-chapter`   | `pnpm create chapter`, the project scaffolder, and its templates |
| `packages/create-chapterjs` | The same, as `pnpm create chapterjs`                             |
| `packages/test-utils`       | Test helpers: fake Discord REST API, gateway and voice servers   |
| `apps/docs`                 | The documentation site (Mintlify), in English and in French      |

```bash
pnpm install
pnpm build          # build every package
pnpm check-types    # type-check everything, tests included
pnpm test           # run every test suite
```

Branches: features and fixes are merged into `develop` through pull requests, and `develop` into `master` for a release, then deployed to npm by running the Deploy workflow, with the version written in the three `package.json` (always the same in all three).

## License

MIT
