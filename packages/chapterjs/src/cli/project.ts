// What `chapterjs dev` and `chapterjs start` share: the files of a project,
// loaded and routed, and a bot that runs them. Each command adds what makes
// it different (reloading for one, every server and several processes for
// the other).

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setPublicDir } from '../assets/asset.js';
import { listPublic, publicDeclarations } from '../assets/public.js';
import { MissingForEvent } from '../events/registry.js';
import { VOICE_USE } from '../voice/usage.js';
import { MESSAGES_USE, REACTIONS_USE } from '../waiting/usage.js';
import { MemoryWaiters, type WaitWatcher } from '../waiting/waiters.js';
import { scanUses, usesIntents, type FoundUses } from '../loader/usage.js';
import { writeGenerated } from '../loader/generated.js';
import { commandDeclaration, scanCommands } from '../commands/declaration.js';
import { CommandRouter } from '../commands/router.js';
import { findConflicts, type CommandEntry } from '../commands/tree.js';
import {
  componentDeclaration,
  findDuplicates,
} from '../components/declaration.js';
import { ComponentRouter, type ComponentEntry } from '../components/router.js';
import { taskDeclaration } from '../tasks/declaration.js';
import { storeDeclaration, type LoadedStore } from '../store/declaration.js';
import {
  rankingDeclaration,
  type LoadedRanking,
} from '../ranking/declaration.js';
import {
  nowhereToKeep,
  NowhereToKeepError,
  setStoreBackend,
  STORAGES,
  type StoreBackend,
  type StoreStorage,
} from '../store/backend.js';
import { DATA_FOLDER, FileStoreBackend } from '../store/file-backend.js';
import {
  checkText,
  DEFAULT_PRESENCE,
  presenceDeclaration,
  readActivities,
  type LoadedPresence,
} from '../presence/declaration.js';
import type { PresenceContext } from '../presence/presence.js';
import { PresenceRotation } from '../presence/rotation.js';
import { GetCurrentApplication } from '../discord/endpoints.js';
import {
  assembleMessages,
  commandsDeclarations,
  languageDeclaration,
  languageDefaultsDeclaration,
  messagesDeclarations,
  scanLanguages,
  type DeclaredCommand,
  type DeclaredLanguage,
  type LanguageEntry,
} from '../messages/declaration.js';
import { translation, type LoadedMessages } from '../messages/translate.js';
import { translateCommand, unknownCommands } from '../messages/commands.js';
import type { Locale } from '../discord/types/common.js';
import {
  runTask,
  TimerScheduler,
  type Scheduler,
  type TaskEntry,
} from '../tasks/scheduler.js';
import { createBot, type Bot, type BotOptions } from '../core/bot.js';
import { watchMemory } from '../core/memory.js';
import { GatewayIntent, type GatewayIntentName } from '../discord/intents.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
} from '../discord/types/gateway-events.js';
import type { RawInteraction } from '../discord/types/interaction.js';
import { eventDeclaration } from '../events/declaration.js';
import {
  EventRouter,
  intentsFor,
  intentsOf,
  limitsFor,
  type LoadedEvent,
} from '../events/router.js';
import { GatewayFatalError, SessionLimitError } from '../gateway/errors.js';
import {
  loadSources,
  readDeclarations,
  siteName,
  type BuiltFile,
  type Declaration,
  type ExportSite,
  type FailedFile,
  type LoadedItem,
} from '../loader/loader.js';
import { locate, messageOf } from '../loader/locate.js';
import {
  DiscordApiError,
  DiscordUnavailableError,
  InvalidTokenError,
} from '../rest/errors.js';
import type { Log } from './log.js';
import { PreflightFailure } from './preflight.js';

export interface ProjectOptions {
  /** The folder of the project. */
  cwd: string;
  /** The version of the framework. */
  version: string;
  log: Log;
  /**
   * The files of the project as `chapterjs build` kept them. Without it,
   * they are read from the `src` folder.
   */
  built?: readonly BuiltFile[];
  /**
   * What the files do that only their code shows (`CODE_USES`: joining
   * voice, waiting for messages or reactions), as `chapterjs build` found.
   * Without it, the files of `src` are read on every load.
   */
  uses?: FoundUses;
  /**
   * Where the stores of the project keep their data, by storage. `file`: a
   * file per store in the `data/` folder of the project by default, the
   * first process of a cluster through IPC for the other processes.
   * `redis`: what the CLI made of `REDIS_URL`; without one, a store that
   * asks for Redis is reported and left out.
   */
  stores?: Partial<Record<StoreStorage, StoreBackend>>;
  /** Only tests change this. */
  deferAfter?: number;
  /**
   * Told what the bot is doing with the files, and when it is done with
   * it: what `chapterjs test` waits for. Nothing of the bot waits.
   */
  observe?: ProjectObserver;
}

/** What `chapterjs test` watches of a running project. */
export interface ProjectObserver {
  /** An interaction was given to the files; `done` once they answered it. */
  interaction?(raw: RawInteraction, done: Promise<void>): void;
  /** A gateway event was given to the files; `done` once they handled it. */
  event?(
    event: GatewayDispatchEventName,
    data: unknown,
    done: Promise<void>
  ): void;
  /**
   * Told when a run of the files starts and stops waiting for what comes
   * next (`waitForMessage()`...): its `done` waits for the test to act.
   */
  waits?: WaitWatcher;
}

/** What the types of a project are written from, once its files ran. */
export interface TypesInfo {
  /** Every language declared, with where. */
  languages: readonly DeclaredLanguage[];
  /** The language `t` is typed from, when known. */
  defaultLocale?: Locale;
  /** The languages that say `default: true`, as they are now. */
  languageDefaults: readonly Locale[];
  /** Every command, and whether its file describes it. */
  commands: readonly DeclaredCommand[];
}

/**
 * Writes the types of a project (`.chapterjs/`): what the project adds to
 * 'chapterjs', like the files of `public/`, its languages and its
 * commands. With the project as it loaded (`info`), a language only
 * offers the commands without `description`, `t` is typed from the
 * default language and `default: true` is refused in every language that
 * says it when another one does; without it (`sync`, which runs nothing),
 * the commands and the languages are found by reading the files, every
 * command is offered, and the first language or the one that says
 * `default: true` types `t`.
 * @returns how many files were written
 */
export async function writeTypes(
  cwd: string,
  info?: TypesInfo
): Promise<number> {
  const [files, found, names] = await Promise.all([
    listPublic(cwd),
    info ? null : scanLanguages(cwd),
    info ? null : scanCommands(cwd),
  ]);
  const languages = info ? info.languages : found!.languages;
  const defaultLocale = info ? info.defaultLocale : found!.defaultLocale;
  const commands = info
    ? info.commands
    : names!.map(name => ({ name, described: false }));
  return writeGenerated(
    cwd,
    publicDeclarations(files) +
      messagesDeclarations(languages, defaultLocale) +
      languageDefaultsDeclaration(info?.languageDefaults ?? []) +
      commandsDeclarations(commands)
  );
}

/** The kinds of declarations a project is made of: one per feature. */
export const DECLARATIONS: readonly Declaration<unknown>[] = [
  eventDeclaration,
  commandDeclaration,
  componentDeclaration,
  taskDeclaration,
  storeDeclaration,
  rankingDeclaration,
  presenceDeclaration,
  languageDeclaration,
];

/** A ranking, with where it is declared. */
export interface RankingEntry {
  file: string;
  export: string;
  ranking: LoadedRanking;
}

/** A store, with where it is declared. */
export interface StoreEntry {
  file: string;
  export: string;
  store: LoadedStore;
}

/** What a bot of the project is connected with. */
export interface ConnectOptions {
  token: string;
  /** Another REST API than Discord's: only tests use it. */
  apiUrl?: string | undefined;
  guildFilter?: BotOptions['guildFilter'];
  /** Whether what happens outside servers is for this bot. */
  privateEvents?: boolean;
  shards?: BotOptions['shards'];
  identifyGate?: BotOptions['identifyGate'];
  /** The share of the requests per second this process may send. */
  globalLimit?: number | undefined;
  /** Only tests change this. */
  identifyInterval?: number | undefined;
  /** Discord refused the bot for good. */
  onFatal: (bot: Bot) => void;
}

/** The files of a project, and what runs them. */
export interface Project {
  /**
   * The last version of each declaration that loaded, by the file and the
   * export it comes from (`src/ping.ts#default`): what the bot runs.
   */
  readonly events: ReadonlyMap<string, LoadedEvent>;
  readonly commands: ReadonlyMap<string, CommandEntry>;
  readonly components: ReadonlyMap<string, ComponentEntry>;
  readonly tasks: ReadonlyMap<string, TaskEntry>;
  readonly stores: ReadonlyMap<string, StoreEntry>;
  readonly rankings: ReadonlyMap<string, RankingEntry>;
  /** Where the stores keep their data, by storage: what a cluster serves to its other processes. */
  readonly storeBackends: ReadonlyMap<StoreStorage, StoreBackend>;
  /** What is kept in Redis: the names of the stores and of the rankings, sorted. */
  redisStores(): { stores: string[]; rankings: string[] };
  /** The presence declared, or `null` without one. */
  readonly presence: LoadedPresence | null;
  /** The languages of the project, assembled, or `null` without any. */
  readonly messages: LoadedMessages | null;
  /** What the types of the project are written from, as it loaded. */
  typesInfo(): TypesInfo;
  /**
   * Loads every file (again). A declaration that fails is returned; it
   * keeps its last working version when it had one.
   */
  load(): Promise<FailedFile[]>;
  /** Shows a failure with its file (and export) and line. */
  report(failure: FailedFile): void;
  /** "2 commands, 3 events, 4 components, a presence loaded". */
  summary(): string;
  isEmpty(): boolean;
  /** The files that make an intent necessary. */
  filesNeeding(intent: GatewayIntentName): string[];
  /**
   * The intents the files need right now. Without `privateEvents`, what
   * only serves private messages is left out: nothing is asked to Discord
   * for what the bot will not listen to.
   */
  intents(privateEvents?: boolean): number;
  /** Creates a bot that runs the files, and connects it. */
  connect(options: ConnectOptions): Promise<Bot>;
  /** Runs the files of the `ready` event: the bot knows its servers. */
  ready(bot: Bot): void;
  /**
   * Gives the bot the presence of the project as it is now (Discord's
   * default without a presence file). Nothing is sent when it did not
   * change since the bot was given one.
   */
  applyPresence(bot: Bot): boolean;
  /**
   * Shows the activities of the presence in turn on the bot `current`
   * returns, and runs its functions when their time comes.
   */
  startPresence(current: () => Bot | null): void;
  /** Stops the presence: nothing of it runs after this. */
  stopPresence(): void;
  /** The file of the presence, or `null` without one. */
  readonly presenceFile: string | null;
  /**
   * Runs every function of the presence once (the list, then each text),
   * as the rotation would, with the bot given. What goes wrong is reported.
   */
  runPresence(bot: Bot): Promise<void>;
  /**
   * Starts the tasks of the project, with the bot `current` returns (none
   * while it reconnects). Only one process of a bot runs them.
   */
  startTasks(current: () => Bot | null): void;
  /** Stops the tasks: nothing runs after this. */
  stopTasks(): void;
  /**
   * Runs one task now, as the scheduler would when its time comes, with
   * the bot given. Resolves once it is done; an error is reported.
   */
  runTask(entry: TaskEntry, bot: Bot, now?: Date): Promise<void>;
  /** Looks after the memory of the bot `current` returns. */
  watchMemory(current: () => Bot | null): { stop(): void };
  /** Writes what the stores still have to write. Nothing is kept after this. */
  closeStores(): Promise<void>;
}

/**
 * What the files may do that only their code shows, each with the intents
 * it needs: read in `src/` (dev, at every load) or kept by the build.
 */
export const CODE_USES = [VOICE_USE, MESSAGES_USE, REACTIONS_USE] as const;

/**
 * A promise of the files that nobody waited for (`store.set()` without
 * `await`, in a `run` that is not `async`) rejects with nobody to tell:
 * Node would stop the bot. Reported instead, with the file and the line,
 * and what to write. A rejection from outside the files stays what it is:
 * a bug of the framework, loud. Returns what stops watching.
 */
export function reportLooseRejections(cwd: string, log: Log): () => void {
  const listener = (reason: unknown): void => {
    const where = locate(reason, cwd);
    if (!where) throw reason;
    log.error(
      `${where.file}:${where.line} ${messageOf(reason)}\nThis call was not awaited: write await in front of it (and async before run), so that your function waits for it.`
    );
  };
  process.on('unhandledRejection', listener);
  return () => {
    process.off('unhandledRejection', listener);
  };
}

/** Whether the folder is a project: it has a `src` folder. */
export async function hasSources(cwd: string, log: Log): Promise<boolean> {
  if ((await stat(join(cwd, 'src')).catch(() => null))?.isDirectory()) {
    return true;
  }
  log.error(
    'There is no src folder here.\nRun this command in the folder of your bot (the one with package.json), or create a project with "pnpm create chapterjs".'
  );
  return false;
}

/** The intents that only bring what happens in private messages. */
const PRIVATE_INTENTS =
  GatewayIntent.DirectMessages |
  GatewayIntent.DirectMessageReactions |
  GatewayIntent.DirectMessageTyping |
  GatewayIntent.DirectMessagePolls;

const megabytes = (bytes: number): string =>
  `${Math.round(bytes / 1024 / 1024)} MB`;

/** What tells one declaration from another: its file and its export. */
const keyOf = (site: { file: string; export: string }): string =>
  `${site.file}#${site.export}`;

/**
 * Two declarations with the same name, where the name is the export's
 * (a task): the later one is left out, with a message saying so.
 */
function sameNames<T extends { file: string; export: string }>(
  entries: readonly T[],
  nameOf: (entry: T) => string,
  what: string | ((entry: T) => string)
): {
  valid: T[];
  conflicts: { file: string; export: string; message: string }[];
} {
  const seen = new Map<string, T>();
  const conflicts: { file: string; export: string; message: string }[] = [];
  const valid = [...entries]
    .sort((a, b) =>
      a.file === b.file
        ? a.export < b.export
          ? -1
          : 1
        : a.file < b.file
          ? -1
          : 1
    )
    .filter(entry => {
      const first = seen.get(nameOf(entry));
      if (!first) {
        seen.set(nameOf(entry), entry);
        return true;
      }
      const kind = (one: T): string =>
        typeof what === 'string' ? what : what(one);
      conflicts.push({
        file: entry.file,
        export: entry.export,
        message: `There is already a ${kind(first)} named ${nameOf(entry)}, in ${first.file}: the name of the export is the name of the ${kind(entry)}, so rename one of them.`,
      });
      return false;
    });
  return { valid, conflicts };
}

export function createProject(options: ProjectOptions): Project {
  const { cwd, log } = options;
  // Where `asset()` reads the files of the project from.
  setPublicDir(cwd);
  // Where the stores keep their data, for every store of the process: a
  // backend per storage the project has one for.
  const storeBackends = new Map<StoreStorage, StoreBackend>();
  for (const storage of STORAGES) {
    const backend =
      options.stores?.[storage] ??
      (storage === 'file'
        ? new FileStoreBackend(join(cwd, DATA_FOLDER))
        : null);
    setStoreBackend(storage, backend);
    if (backend) storeBackends.set(storage, backend);
  }
  const report = (failure: FailedFile): void => {
    const where = locate(failure.error, cwd);
    log.error(
      `${where ? `${where.file}:${where.line}` : siteName(failure)} ${messageOf(failure.error)}`
    );
  };
  const router = new EventRouter(
    (file, error) => report({ file, error }),
    (event, error) => {
      const missing = error instanceof MissingForEvent ? error : null;
      const what =
        missing?.what === 'user'
          ? 'the user who did it'
          : 'the channel it happened in';
      log.warn(
        `A ${event} event was not given to your files: Discord did not let the bot read ${what} (${messageOf(missing ? missing.cause : error)}).`
      );
    }
  );
  const reporter = {
    onError: (file: string, error: unknown) => report({ file, error }),
    onWarning: (file: string, message: string) =>
      log.warn(`${file} ${message}`),
    ...(options.deferAfter === undefined
      ? {}
      : { deferAfter: options.deferAfter }),
  };
  const commandRouter = new CommandRouter(reporter);
  const componentRouter = new ComponentRouter(reporter);
  const scheduler: Scheduler = new TimerScheduler(reporter);
  let events = new Map<string, LoadedEvent>();
  let commands = new Map<string, CommandEntry>();
  let components = new Map<string, ComponentEntry>();
  let tasks = new Map<string, TaskEntry>();
  let stores = new Map<string, StoreEntry>();
  let rankings = new Map<string, RankingEntry>();
  let presence: LoadedPresence | null = null;
  /** Where the presence is declared, for what its functions do wrong. */
  let presenceSite = { file: 'the presence', export: 'default' };
  /** The files the presence was declared in, to keep it when they break. */
  let presenceFiles = new Set<string>();
  // Joining voice, waiting for messages or reactions: intents the code
  // needs without any declaration saying it.
  let uses: FoundUses = options.uses ?? {};
  const neededIntents = (): number =>
    intentsFor(events.values()) | usesIntents(CODE_USES, uses);
  let messages: LoadedMessages | null = null;
  /** The last version of each language that loaded. */
  let languages = new Map<string, LanguageEntry>();
  let languageDefaults: readonly Locale[] = [];
  /** The bot running the files now, to give it what a reload changes. */
  let running: Bot | null = null;
  /** The presence each bot was given last, to send only what changed. */
  const given = new WeakMap<Bot, string>();
  /** What each bot shows now, to send only what changed. */
  const shown = new WeakMap<Bot, string>();
  /** Whether the running bot is only part of the bot (a cluster). */
  let partial = false;
  /** How many servers the whole bot is in, as Discord counted it last. */
  let counted: { guilds: number; at: number } | null = null;
  let counting = false;
  /**
   * How many servers the bot is in: what this process knows when it runs
   * every shard; else what Discord counts for the application, asked at
   * most every 10 minutes.
   * @see https://docs.discord.com/developers/resources/application#application-object-application-structure
   */
  const guildCount = (bot: Bot): number => {
    const local = bot.ctx.cache.guilds.size;
    if (!partial) return local;
    if (!counting && (!counted || Date.now() - counted.at > 600_000)) {
      counting = true;
      bot.ctx.rest
        .request(GetCurrentApplication, [])
        .then(application => {
          const guilds = application.approximate_guild_count;
          if (guilds !== undefined) counted = { guilds, at: Date.now() };
        })
        .catch(() => {})
        .finally(() => (counting = false));
    }
    return counted?.guilds ?? local;
  };
  let presenceBot: () => Bot | null = () => null;
  const rotation = new PresenceRotation({
    apply(raw) {
      const bot = presenceBot();
      if (!bot) return;
      const text = JSON.stringify(raw);
      if (shown.get(bot) === text) return;
      shown.set(bot, text);
      bot.setPresence(raw);
    },
    context() {
      const bot = presenceBot();
      if (!bot?.ctx.self) return null;
      return {
        guilds: guildCount(bot),
        ...translation(bot.ctx, null),
      } as PresenceContext;
    },
    onError: error => report({ ...presenceSite, error }),
  });
  let lost = false;
  const count = (size: number, one: string, many: string): string =>
    `${size} ${size === 1 ? one : many}`;

  return {
    get events() {
      return events;
    },
    get commands() {
      return commands;
    },
    get components() {
      return components;
    },
    get tasks() {
      return tasks;
    },
    get stores() {
      return stores;
    },
    storeBackends,
    get rankings() {
      return rankings;
    },
    redisStores: () => ({
      stores: [...stores.values()]
        .filter(entry => entry.store.storage === 'redis')
        .map(entry => entry.store.name)
        .sort(),
      rankings: [...rankings.values()]
        .filter(entry => entry.ranking.storage === 'redis')
        .map(entry => entry.ranking.name)
        .sort(),
    }),
    get presence() {
      return presence;
    },
    get messages() {
      return messages;
    },
    typesInfo: () => ({
      languages: [...languages.values()].map(entry => ({
        file: entry.file,
        export: entry.export,
        name: entry.name,
        locale: entry.language.locale,
      })),
      ...(messages ? { defaultLocale: messages.default } : {}),
      languageDefaults,
      // Only slash commands have texts in the language files.
      commands: [...commands.values()]
        .filter(({ command }) => command.type === 'slash')
        .map(({ command }) => ({
          name: command.path.join(' '),
          described: command.described,
        })),
    }),
    report,
    async load() {
      const { built } = options;
      if (options.uses === undefined) {
        uses = await scanUses(cwd, CODE_USES);
      }
      // Every file of src/ runs (or ran, in a build); what each exports is
      // then read, kind by kind.
      const sources: {
        modules: readonly BuiltFile[];
        failed: FailedFile[];
      } = built ? { modules: built, failed: [] } : await loadSources(cwd);
      const read = <T>(declaration: Declaration<T>) =>
        readDeclarations(sources.modules, declaration);
      const [
        eventItems,
        commandItems,
        componentItems,
        taskItems,
        storeItems,
        rankingItems,
        presenceItems,
        languageItems,
      ] = [
        read(eventDeclaration),
        read(commandDeclaration),
        read(componentDeclaration),
        read(taskDeclaration),
        read(storeDeclaration),
        read(rankingDeclaration),
        read(presenceDeclaration),
        read(languageDeclaration),
      ];
      const broken = new Set(sources.failed.map(({ file }) => file));
      /**
       * The next version of a kind: what loaded now, plus the last good
       * version of what failed (an export that can't be read, or a file
       * that can't run at all).
       */
      const next = <T, E extends { file: string; export: string }>(
        previous: ReadonlyMap<string, E>,
        items: { loaded: LoadedItem<T>[]; failed: FailedFile[] },
        make: (item: LoadedItem<T>) => E
      ): Map<string, E> => {
        const result = new Map<string, E>();
        for (const item of items.loaded) result.set(keyOf(item), make(item));
        const failedKeys = new Set(
          items.failed.map(({ file, export: exported }) =>
            keyOf({ file, export: exported ?? 'default' })
          )
        );
        for (const [key, entry] of previous) {
          if (failedKeys.has(key) || broken.has(entry.file)) {
            result.set(key, entry);
          }
        }
        return result;
      };

      events = next(events, eventItems, item => ({
        file: item.file,
        export: item.export,
        event: item.value,
      }));
      router.set(events.values());

      const { valid, conflicts } = findConflicts([
        ...next(commands, commandItems, item => ({
          file: item.file,
          export: item.export,
          command: item.value,
        })).values(),
      ]);
      commands = new Map(valid.map(entry => [keyOf(entry), entry]));

      const unique = findDuplicates([
        ...next(components, componentItems, item => ({
          file: item.file,
          export: item.export,
          component: item.value,
        })).values(),
      ]);
      components = new Map(unique.valid.map(entry => [keyOf(entry), entry]));
      componentRouter.set(components.values());

      const sameTask = sameNames(
        [
          ...next(tasks, taskItems, item => ({
            file: item.file,
            export: item.export,
            task: item.value,
          })).values(),
        ],
        entry => entry.task.name,
        'task'
      );
      tasks = new Map(sameTask.valid.map(entry => [keyOf(entry), entry]));
      scheduler.set(tasks.values());

      // Two stores, or a store and a ranking, with one name would share
      // one file or one key: the later is left out.
      type Kept = StoreEntry | RankingEntry;
      const keptOf = (entry: Kept): LoadedStore | LoadedRanking =>
        'store' in entry ? entry.store : entry.ranking;
      const sameStore = sameNames<Kept>(
        [
          ...next(stores, storeItems, item => ({
            file: item.file,
            export: item.export,
            store: item.value,
          })).values(),
          ...next(rankings, rankingItems, item => ({
            file: item.file,
            export: item.export,
            ranking: item.value,
          })).values(),
        ],
        entry => keptOf(entry).name,
        entry => ('store' in entry ? 'store' : 'ranking')
      );
      // What is kept where nothing keeps it (Redis without REDIS_URL) is
      // reported and left out: it says so itself when used.
      const unkept = sameStore.valid.filter(
        entry => !storeBackends.has(keptOf(entry).storage)
      );
      const kept = sameStore.valid.filter(entry => !unkept.includes(entry));
      stores = new Map(
        kept
          .filter((entry): entry is StoreEntry => 'store' in entry)
          .map(entry => [keyOf(entry), entry])
      );
      rankings = new Map(
        kept
          .filter((entry): entry is RankingEntry => 'ranking' in entry)
          .map(entry => [keyOf(entry), entry])
      );
      const nowhere = unkept.map(entry => ({
        file: entry.file,
        export: entry.export,
        error: new NowhereToKeepError(
          nowhereToKeep(
            keptOf(entry).storage,
            keptOf(entry).name,
            'store' in entry ? 'store' : 'ranking'
          )
        ),
      }));

      // One presence. A second one is left out.
      const [first, ...extra] = presenceItems.loaded;
      if (first) {
        presence = first.value;
        presenceSite = { file: first.file, export: first.export };
      } else if (
        presenceItems.failed.length === 0 &&
        ![...broken].some(file => presenceFiles.has(file))
      ) {
        presence = null;
      }
      presenceFiles = new Set(presenceItems.loaded.map(({ file }) => file));
      const twice = extra.map(item => ({
        file: item.file,
        export: item.export,
        error: new TypeError(
          `There are two presences: the one of ${siteName(first!)} is used, keep only one.`
        ),
      }));

      const nextLanguages = next(languages, languageItems, item => ({
        file: item.file,
        export: item.export,
        name: item.name,
        language: item.value,
      }));
      // What the files say now, before a declaration is put back to its
      // last good version: two languages saying default: true are both
      // underlined.
      languageDefaults = [...nextLanguages.values()]
        .filter(({ language }) => language.isDefault)
        .map(({ language }) => language.locale);
      const previousLanguages = languages;
      languages = nextLanguages;
      let assembled = assembleMessages([...languages.values()]);
      // A language that no longer matches the others keeps its last version
      // that did, like a declaration that no longer loads.
      const restored = assembled.failed.filter(failure => {
        const key = keyOf({
          file: failure.file,
          export: failure.export ?? 'default',
        });
        const previous = previousLanguages.get(key);
        return previous !== undefined && previous !== languages.get(key);
      });
      if (restored.length > 0) {
        for (const failure of restored) {
          const key = keyOf({
            file: failure.file,
            export: failure.export ?? 'default',
          });
          languages.set(key, previousLanguages.get(key)!);
        }
        const again = assembleMessages([...languages.values()]);
        assembled = {
          messages: again.messages,
          failed: [
            ...assembled.failed,
            ...again.failed.filter(
              ({ file }) => !assembled.failed.some(one => one.file === file)
            ),
          ],
        };
      }
      messages = assembled.messages;
      if (running) running.ctx.messages = messages;

      // A command has its texts in its file, or in the language files: the
      // languages give them to the ones without, and a command that can't
      // be described is left out.
      const badTexts: FailedFile[] = [...assembled.failed];
      if (messages) {
        const names = new Set(
          [...commands.values()]
            .filter(entry => entry.command.type === 'slash')
            .map(entry => entry.command.path.join(' '))
        );
        for (const { file, path } of unknownCommands(messages, names)) {
          badTexts.push({
            file,
            error: new TypeError(
              `"commands" translates "${path}", which is not a command of this project${names.size > 0 ? ` (its commands are: ${[...names].join(', ')})` : ''}. The key is the name of the command, like 'ping' or 'mod ban'.`
            ),
          });
        }
      }
      for (const [key, entry] of commands) {
        const { command, failed } = translateCommand(
          siteName(entry),
          entry.command,
          messages
        );
        badTexts.push(...failed);
        if (command) commands.set(key, { ...entry, command });
        else commands.delete(key);
      }
      commandRouter.set(commands.values());
      return [
        ...sources.failed,
        ...eventItems.failed,
        ...commandItems.failed,
        ...componentItems.failed,
        ...taskItems.failed,
        ...storeItems.failed,
        ...rankingItems.failed,
        ...presenceItems.failed,
        ...languageItems.failed,
        ...badTexts,
        ...twice,
        ...nowhere,
        ...[
          ...conflicts,
          ...unique.conflicts,
          ...sameTask.conflicts,
          ...sameStore.conflicts,
        ].map(({ file, export: exported, message }) => ({
          file,
          export: exported,
          error: new TypeError(message),
        })),
      ];
    },
    summary() {
      if (
        events.size === 0 &&
        commands.size === 0 &&
        components.size === 0 &&
        tasks.size === 0 &&
        presence === null &&
        messages === null
      ) {
        return "Nothing to run yet: export a command or an event from a file of src/, like export default command({ name: 'ping', ... })";
      }
      return `${[
        ...(commands.size > 0
          ? [count(commands.size, 'command', 'commands')]
          : []),
        ...(events.size > 0 ? [count(events.size, 'event', 'events')] : []),
        ...(components.size > 0
          ? [count(components.size, 'component', 'components')]
          : []),
        ...(tasks.size > 0 ? [count(tasks.size, 'task', 'tasks')] : []),
        ...(stores.size > 0 ? [count(stores.size, 'store', 'stores')] : []),
        ...(rankings.size > 0
          ? [count(rankings.size, 'ranking', 'rankings')]
          : []),
        ...(presence ? ['a presence'] : []),
        ...(messages
          ? [
              `messages in ${count(messages.locales.size, 'language', 'languages')}`,
            ]
          : []),
      ].join(', ')} loaded`;
    },
    isEmpty: () =>
      events.size === 0 &&
      commands.size === 0 &&
      components.size === 0 &&
      tasks.size === 0 &&
      stores.size === 0 &&
      rankings.size === 0 &&
      presence === null &&
      messages === null,
    // A file declaring several events that need the intent is named once.
    filesNeeding: intent => [
      ...new Set([
        ...[...events.values()]
          .filter(
            ({ event }) => (intentsOf(event) & GatewayIntent[intent]) !== 0
          )
          .map(({ file }) => file),
        ...CODE_USES.filter(
          use => (use.intents & GatewayIntent[intent]) !== 0
        ).flatMap(use => uses[use.name] ?? []),
      ]),
    ],
    intents: (privateEvents = true) =>
      neededIntents() & (privateEvents ? ~0 : ~PRIVATE_INTENTS),
    async connect(connection) {
      const created = createBot({
        token: connection.token,
        version: options.version,
        intents:
          neededIntents() &
          (connection.privateEvents === false ? ~PRIVATE_INTENTS : ~0),
        guildFilter: connection.guildFilter,
        privateEvents: connection.privateEvents,
        presence: presence?.raw,
        waiters: new MemoryWaiters(
          options.observe?.waits ? { watch: options.observe.waits } : {}
        ),
        shards: connection.shards,
        identifyGate: connection.identifyGate,
        ...(connection.identifyInterval === undefined
          ? {}
          : { gateway: { identifyInterval: connection.identifyInterval } }),
        // Only what the files of the project use is remembered.
        cache: { limits: limitsFor(events.values()) },
        // A local fake of Discord (tests) serves voice without TLS too.
        voice: { secure: !connection.apiUrl?.startsWith('http://') },
        rest: {
          ...(connection.apiUrl ? { baseUrl: connection.apiUrl } : {}),
          ...(connection.globalLimit === undefined
            ? {}
            : { globalLimit: connection.globalLimit }),
        },
        beforeDispatch: (event, data) =>
          router.before(created.ctx, event, data),
        onDispatch(event, data, info) {
          const handled = router.dispatch(created.ctx, event, data, {
            joined: info.joined,
            before: info.before as unknown[] | undefined,
          });
          options.observe?.event?.(event, data, handled);
          if (event === 'INTERACTION_CREATE') {
            const interaction =
              data as GatewayDispatchEvents['INTERACTION_CREATE'];
            const answered =
              commandRouter.dispatch(created.ctx, interaction) ??
              componentRouter.dispatch(created.ctx, interaction) ??
              Promise.resolve();
            options.observe?.interaction?.(interaction, answered);
          }
        },
        onEvent(event) {
          if (event.type === 'disconnected' && !lost) {
            lost = true;
            log.warn('Connection to Discord lost, reconnecting...');
          } else if (event.type === 'ready' && lost) {
            lost = false;
            log.reload('Reconnected to Discord');
          } else if (event.type === 'fatal') {
            log.error(event.error.message);
            connection.onFatal(created);
          } else if (event.type === 'stateError') {
            log.warn(
              `An event of Discord (${event.event}) could not be read: ${messageOf(event.error)}`
            );
          } else if (event.type === 'voiceWarning') {
            log.warn(`Voice: ${event.message}`);
          }
        },
      });
      given.set(created, presence?.key ?? '');
      shown.set(created, JSON.stringify(presence?.raw ?? DEFAULT_PRESENCE));
      partial =
        connection.shards !== undefined &&
        connection.shards.ids.length < connection.shards.count;
      created.ctx.messages = messages;
      running = created;
      await created.connect();
      return created;
    },
    applyPresence(bot) {
      // Always the functions of the files as they are now: a file they
      // import may have changed. What is shown is only sent when it differs.
      rotation.set(presence);
      const key = presence?.key ?? '';
      if (given.get(bot) === key) return false;
      given.set(bot, key);
      return true;
    },
    startPresence(current) {
      presenceBot = current;
      rotation.set(presence);
      rotation.start();
    },
    stopPresence: () => rotation.stop(),
    get presenceFile() {
      return presence ? presenceSite.file : null;
    },
    async runPresence(bot) {
      if (!presence) return;
      const context = {
        guilds: guildCount(bot),
        ...translation(bot.ctx, null),
      } as PresenceContext;
      const failed = (error: unknown): void =>
        report({ ...presenceSite, error });
      let activities = presence.activities;
      if (typeof activities === 'function') {
        try {
          activities = readActivities(await activities(context));
        } catch (error) {
          return failed(error);
        }
      }
      for (const { name } of activities) {
        if (typeof name !== 'function') continue;
        try {
          checkText(await name(context));
        } catch (error) {
          failed(error);
        }
      }
    },
    ready(bot) {
      const user = bot.ctx.cache.users.get(bot.ctx.self!.userId)!;
      router.emit('ready', {
        user,
        guilds: bot.ctx.cache.guilds,
        ...translation(bot.ctx, null),
      } as never);
    },
    startTasks(current) {
      scheduler.start(() => {
        const bot = current();
        if (!bot?.ctx.self) return null;
        const user = bot.ctx.cache.users.get(bot.ctx.self.userId);
        return user
          ? {
              user,
              guilds: bot.ctx.cache.guilds,
              ...translation(bot.ctx, null),
            }
          : null;
      });
    },
    stopTasks: () => scheduler.stop(),
    runTask(entry, bot, now = new Date()) {
      const user = bot.ctx.cache.users.get(bot.ctx.self!.userId)!;
      return runTask(
        entry,
        { user, guilds: bot.ctx.cache.guilds, ...translation(bot.ctx, null) },
        now,
        reporter.onError
      );
    },
    // The bot looks after its own memory: it remembers less before memory
    // is full, and only speaks up when it can't give up anything more.
    closeStores: async () => {
      for (const backend of storeBackends.values()) await backend.close();
    },
    watchMemory: current =>
      watchMemory({
        cache: () => current()?.ctx.cache,
        onTightened: ({ members, forgotten }, { used, limit }) =>
          log.info(
            `Memory was getting full (${megabytes(used)} of ${megabytes(limit)}): the bot now remembers ${members} members per server at most, and forgot ${forgotten} members and users it had not seen for the longest. Nothing changes for your code.`
          ),
        onRestored: ({ members }) =>
          log.info(
            `Memory is fine again: the bot remembers up to ${members} members per server again.`
          ),
        onFull: ({ used, limit }, freed) =>
          log.warn(
            `The bot uses ${megabytes(used)} of the ${megabytes(limit)} of memory it can use, and already remembers as little as it can: ${current()?.ctx.cache.guilds.size ?? 0} servers and ${current()?.ctx.cache.channels.size ?? 0} channels, which it needs. Remembering less freed ${megabytes(freed)}. If your own code keeps things that only grow (a list, a Map), that is what fills it: look there first. Otherwise give the bot more memory: set NODE_OPTIONS=--max-old-space-size=4096 (in MB) on a machine that has that much.`
          ),
      }),
  };
}

/** Says what went wrong in words the developer can act on. */
export function explain(error: unknown, log: Log): void {
  if (error instanceof PreflightFailure) return;
  if (
    error instanceof InvalidTokenError ||
    error instanceof GatewayFatalError ||
    error instanceof SessionLimitError ||
    error instanceof DiscordUnavailableError
  ) {
    log.error(error.message);
  } else if (error instanceof DiscordApiError) {
    log.error(
      `Discord refused a request the framework needs to start: ${error.message}`
    );
  } else {
    log.error(
      `Something unexpected happened: ${messageOf(error)}\nThis is probably a bug in ChapterJS: please report it at https://github.com/chapterjs/chapterjs/issues`
    );
  }
}
