# `events/`: the first feature, assembled from the core

A reaction is `import { event } from 'chapterjs'; export default event({ name: 'memberJoin', run({ member }) { ... } })`, exported from any file of `src/` (a file may declare several, in a list too): `name` is the event and types what `run` receives, the user writes no type. Adding an event is adding an entry in `registry.ts`, plus its row in the docs. The core it is built on is described in `packages/chapterjs/CLAUDE.md`.

## `registry.ts`: the table of events

For each name:

- `intents`: what to ask Discord. Can be a function of the options, so Direct Messages is only asked when a file listens there (and the messages of servers are not asked for by a file of private messages only).
- The gateway events it comes from.
- `before` (optional): read what is about to leave the cache, or what a change is compared with (the emojis before a Guild Emojis Update, someone's voice state before a Voice State Update).
- `prepare` (optional): get from Discord what handlers are promised and the bot does not know yet: the channel of something that happened in a thread it never saw, or the user of an event that only gives a `user_id` (a reaction removed, a vote, typing in private, interest in a scheduled event).
  - One request each (`askOnce`, keyed `channel:id` / `user:id`), then remembered; what happens in that channel meanwhile waits for the same answer, so it is delivered in order.
  - Its result reaches `build` as `prepared`, so a user is there even when no user can be remembered right now.
  - When Discord refuses, the event is not delivered and a `⚠` names what was refused, from the `MissingForEvent` the request rejects with.
- `build`: what the handler receives, always **what the event is about plus `guild`** and nothing else (`t` is added by the router): `{ message, guild }`, `{ member, guild }`, `{ reaction, guild }`… Several facts about one thing are grouped in one object rather than spread at the top (`reaction` holds the emoji, who, the message and the channel; `voice` the member, the channel and the `state`; `presence` the `UserPresence` plus `userId`, `user`, `member`; `message` of `messageDelete` is a `DeletedMessage` with `before`). `placeOf()` gives `at` (`channelId`, `channel`, `guildId`, which go in the object) and `guild` (next to it). `null` when the event does not happen, or a list when one gateway event is several occurrences: messages deleted together are one `messageDelete` each, a Guild Emojis Update is one `emojiCreate`/`emojiUpdate`/`emojiDelete` per emoji that changed, a Thread Members Update one `threadMemberJoin`/`threadMemberLeave` per person.
- `options` and `accepts`: see below.
- `remembers`: what the event needs remembered beyond the default; no event uses it today (`memberLeave` gives `user`, not the member as it was), it is the extension point for one that will. `limitsFor()` gives the limits of a set of files the way `intentsFor()` gives their intents, so nothing is kept for what no file uses, as Discord recommends.
- `guildOf`: the server of an event, declared per event like `intents` (used by `localeOf()` in `router.ts` to pick the language of `t`). Since every context carries `guild`, it is `ofGuild` for all of them but `ready`.

## The events

- `ready`.
- Messages: `messageCreate`, `messageUpdate`, `messageDelete`.
- Members. Servers: `guildJoin`, `guildLeave`, `guildUpdate`. Channels. Roles.
- Reactions: `reactionAdd`, `reactionRemove`, `reactionClear`. Polls: `pollVoteAdd`, `pollVoteRemove`. `typingStart`.
- Threads: `threadMemberJoin`, `threadMemberLeave` (created, changed and deleted threads are channel events).
- Voice: `voiceJoin`, `voiceLeave`, `voiceMove`, `voiceUpdate`, told apart from one Voice State Update by comparing with the remembered state.
- `presenceUpdate`. Moderation: `banAdd`, `banRemove`, `auditLogEntryCreate`. Emojis. Invites: `inviteCreate`, `inviteDelete`.
- Scheduled events: `scheduledEventCreate`/`Update`/`Delete`, `scheduledEventUserAdd`/`Remove`.
- Plain data they give: `ReactionEmoji`, `VoiceState`, `UserPresence`, `AuditLogEntry`, `ScheduledEvent`, and the objects that group what an event is about, exported from `index.ts`: `DeletedMessage`, `UserReaction` and `AddedReaction` (named so, since `Reaction` is the count of a message), `ClearedReactions`, `PollVote`, `Typing`, `DeletedInvite`, `VoiceActivity`, `VoiceMove`, `VoiceChange`, `PresenceChange`, `ScheduledEventInterest`. `Invite.channel` reads the cache, so `inviteCreate` needs no `channel` of its own.
- Not written yet: auto-moderation, stickers, soundboard, pins, webhooks, integrations, stage instances, voice channel statuses and effects, entitlements.

`EventContexts` types what each handler receives.

## Options

An event can have options (`EventOptions`, with the `options` and `accepts` of its entry).

- A declaration writes them next to `name` (`event({ name: 'messageCreate', bots: true, run })`). They are checked when the file loads, typed only for the events that have them (`EventConfig` refuses any other key as `never`, and a wrong value as the option's type), and `accepts` decides per declaration whether an occurrence is delivered.
- An option is a boolean or one word of a list. An option whose type is only known to be wider counts as every value it may be.
- The events about messages use this to ignore bots and webhooks unless the file passes `{ bots: true }`, and to listen where the file says with `where: 'guild' | 'dm' | 'both'` (servers by default): the safe behavior is the default, the opt-out is explicit.
- `reactionAdd` and `reactionRemove` take the same two (`ReactionEventOptions`: the reactions of bots, this one included, are ignored by default); `reactionClear`, `pollVoteAdd`, `pollVoteRemove` and `typingStart` take `where` (`WhereEventOptions`), narrowed by the generic `Placed<Where, Key, InGuild, Private, Dm>` and `AboutMessage` types of `registry.ts`: the object under `Key` (`reaction`, `vote`, `typing`, `reactions`, `message`) is narrowed by place (`InServer`, `InPrivate`, `InDm`: its `guildId`, a `GuildTextBasedChannel`, its `message`, plus `member` where Discord sends it, `reactionAdd` and `typingStart`), and `guild` sits next to it: a `Guild` in a server, absent with `'dm'`, and with `'both'` a union told apart by `guild` (`{ … guild: Guild } | { … guild: null }`). `DeletedInGuild`, `DeletedInPrivate` and `DeletedInDm` are named so the editor shows a readable type.
- Options narrow the types: `ContextOf<Name, Options>` is what a handler receives given the options of its declaration. For a message: in a server `{ message: GuildMessage, guild: Guild }` (`guild` and `channel` never `null`), and without `bots` a `MemberMessage` (`member` too); with `'dm'` `{ message: DmMessage }`, on which nothing about a server exists; with `'both'` a union told apart by `guild`, so one `if (guild)` (or `if (message.guild)`) narrows everything. `accepts` is what makes that true at runtime.

## The other files

- `event.ts`: the `event()` user files import, a normal export of `index.ts`: `event<Name, const Options>(config: EventConfig<Name, Options>)`, where `EventConfig` is `{ name; run }` plus the options of the event, plus a reverse-mapped type over what the file wrote so that `Options` is inferred as written and typos are refused; it brands the config as an `EventDeclaration`.
- `declaration.ts`: the `Declaration` of events (`read` checks `name` against the registry, with a suggestion when a real event is close, `run`, and the options against the entry).
- `router.ts`: delivers gateway events to handlers (frozen context, one failing handler never stops the others), computes the intents of a set of declarations (`Guilds` always, for the cache) and picks the language of `t` with `localeOf()` (the server, member, channel, role or message the context carries; `ready` gets the default). `dispatch()` and `emit()` return a promise of every handler being done (what was asked to Discord first included): nothing of the bot waits for it, `chapterjs test` does.
- `cli/project.ts` keeps the last good version of a broken declaration; the `ready` event runs once per start, not on reload.
