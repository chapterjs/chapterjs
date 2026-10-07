// What `chapterjs dev` and `chapterjs start` share: the files of a project,
// loaded and routed, and a bot that runs them. Each command adds what makes
// it different (reloading for one, every server and several processes for
// the other).

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setPublicDir } from '../assets/asset.js';
import { listPublic, publicDeclarations } from '../assets/public.js';
import { eventTypedFolders } from '../events/types.js';
import { MissingForEvent } from '../events/registry.js';
import { writeGenerated } from '../loader/generated.js';
import { commandsConvention } from '../commands/convention.js';
import { CommandRouter } from '../commands/router.js';
import { findConflicts, type CommandEntry } from '../commands/tree.js';
import {
  componentsConvention,
  findDuplicates,
} from '../components/convention.js';
import { ComponentRouter, type ComponentEntry } from '../components/router.js';
import { tasksConvention } from '../tasks/convention.js';
import {
  DEFAULT_PRESENCE,
  presenceConvention,
  type LoadedPresence,
} from '../presence/convention.js';
import {
  assembleMessages,
  commandsDeclarations,
  languagesConvention,
  languageTypedFolders,
  messagesDeclarations,
  type LanguageEntry,
} from '../messages/convention.js';
import { translation, type LoadedMessages } from '../messages/translate.js';
import { translateCommand, unknownCommands } from '../messages/commands.js';
import {
  TimerScheduler,
  type Scheduler,
  type TaskEntry,
} from '../tasks/scheduler.js';
import { createBot, type Bot, type BotOptions } from '../core/bot.js';
import { watchMemory } from '../core/memory.js';
import { GatewayIntent, type GatewayIntentName } from '../discord/intents.js';
import type { GatewayDispatchEvents } from '../discord/types/gateway-events.js';
import { eventsConvention } from '../events/convention.js';
import {
  EventRouter,
  intentsFor,
  intentsOf,
  limitsFor,
  type LoadedEvent,
} from '../events/router.js';
import { GatewayFatalError, SessionLimitError } from '../gateway/errors.js';
import {
  listFolder,
  loadBuilt,
  loadFolder,
  type BuiltFile,
  type FailedFile,
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
  /** Only tests change this. */
  deferAfter?: number;
}

/**
 * Writes the types of a project (`.chapterjs/`): one project per typed
 * folder (every event, every language file), and what every file gets,
 * like the files of `public/`. With the commands and the languages as
 * they loaded, a language file only offers the ones without `description`
 * in their file, `t` is typed from the default language and `default:
 * true` is refused in every file when another one says it (`defaults`,
 * the files that do); without them (`sync`, which runs nothing),
 * every command is offered and the first language file types `t`.
 * @returns how many files were written
 */
export async function writeTypes(
  cwd: string,
  commands?: ReadonlyMap<string, CommandEntry>,
  messages?: LoadedMessages | null,
  defaults: readonly string[] = []
): Promise<number> {
  const [files, languageFiles, commandFiles] = await Promise.all([
    listPublic(cwd),
    listFolder(cwd, languagesConvention),
    listFolder(cwd, commandsConvention),
  ]);
  return writeGenerated(
    cwd,
    [...eventTypedFolders(), ...languageTypedFolders(languageFiles, defaults)],
    publicDeclarations(files) +
      messagesDeclarations(
        languageFiles,
        messages ? messages.files.get(messages.default) : undefined
      ),
    // Only language files use it, and they are in the main project.
    commandsDeclarations(
      commandFiles.map(({ file }) => ({
        file,
        described: commands?.get(file)?.command.described ?? false,
      }))
    )
  );
}

/** The conventional folders of a project: one per feature. */
export const CONVENTIONS = [
  eventsConvention,
  commandsConvention,
  componentsConvention,
  tasksConvention,
  presenceConvention,
  languagesConvention,
] as const;

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
  /** The last version of each file that loaded: what the bot runs. */
  readonly events: ReadonlyMap<string, LoadedEvent>;
  readonly commands: ReadonlyMap<string, CommandEntry>;
  readonly components: ReadonlyMap<string, ComponentEntry>;
  readonly tasks: ReadonlyMap<string, TaskEntry>;
  /** What `src/presence.ts` declares, or `null` without that file. */
  readonly presence: LoadedPresence | null;
  /** The languages of `src/messages/`, assembled, or `null` without any. */
  readonly messages: LoadedMessages | null;
  /**
   * The language files that say `default: true`, as they are now: a file
   * left out because a second one says it is counted, so that both are
   * underlined in the editor.
   */
  readonly languageDefaults: readonly string[];
  /**
   * Loads every file (again). A file that fails is returned; it keeps its
   * last working version when it had one.
   */
  load(): Promise<FailedFile[]>;
  /** Shows a failure with its file and line. */
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
   * Starts the tasks of the project, with the bot `current` returns (none
   * while it reconnects). Only one process of a bot runs them.
   */
  startTasks(current: () => Bot | null): void;
  /** Stops the tasks: nothing runs after this. */
  stopTasks(): void;
  /** Looks after the memory of the bot `current` returns. */
  watchMemory(current: () => Bot | null): { stop(): void };
}

/** Whether the folder is a project: it has a `src` folder. */
export async function hasSources(cwd: string, log: Log): Promise<boolean> {
  if ((await stat(join(cwd, 'src')).catch(() => null))?.isDirectory()) {
    return true;
  }
  log.error(
    'There is no src folder here.\nRun this command in the folder of your bot (the one with package.json), or create a project with "pnpm create chapter".'
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

export function createProject(options: ProjectOptions): Project {
  const { cwd, log } = options;
  // Where `asset()` reads the files of the project from.
  setPublicDir(cwd);
  const report = ({ file, error }: FailedFile): void => {
    const where = locate(error, cwd);
    log.error(
      `${where ? `${where.file}:${where.line}` : file} ${messageOf(error)}`
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
  let presence: LoadedPresence | null = null;
  let messages: LoadedMessages | null = null;
  /** The last version of each language file that loaded. */
  let languages = new Map<string, LanguageEntry>();
  let languageDefaults: readonly string[] = [];
  /** The bot running the files now, to give it what a reload changes. */
  let running: Bot | null = null;
  /** The presence each bot was given last, to send only what changed. */
  const given = new WeakMap<Bot, string>();
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
    get presence() {
      return presence;
    },
    get messages() {
      return messages;
    },
    get languageDefaults() {
      return languageDefaults;
    },
    report,
    async load() {
      const { built } = options;
      const [
        eventFiles,
        commandFiles,
        componentFiles,
        taskFiles,
        presenceFiles,
        messageFiles,
      ] = await Promise.all(
        built
          ? [
              loadBuilt(eventsConvention, built),
              loadBuilt(commandsConvention, built),
              loadBuilt(componentsConvention, built),
              loadBuilt(tasksConvention, built),
              loadBuilt(presenceConvention, built),
              loadBuilt(languagesConvention, built),
            ]
          : [
              loadFolder(cwd, eventsConvention),
              loadFolder(cwd, commandsConvention),
              loadFolder(cwd, componentsConvention),
              loadFolder(cwd, tasksConvention),
              loadFolder(cwd, presenceConvention),
              loadFolder(cwd, languagesConvention),
            ]
      );
      const nextEvents = new Map<string, LoadedEvent>();
      for (const { file, value } of eventFiles.loaded) {
        nextEvents.set(file, { file, event: value });
      }
      for (const { file } of eventFiles.failed) {
        const previous = events.get(file);
        if (previous) nextEvents.set(file, previous);
      }
      events = nextEvents;
      router.set(events.values());

      const entries: CommandEntry[] = commandFiles.loaded.map(
        ({ file, value }) => ({ file, command: value })
      );
      for (const { file } of commandFiles.failed) {
        const previous = commands.get(file);
        if (previous) entries.push(previous);
      }
      const { valid, conflicts } = findConflicts(entries);
      commands = new Map(valid.map(entry => [entry.file, entry]));

      const pieces: ComponentEntry[] = componentFiles.loaded.map(
        ({ file, value }) => ({ file, component: value })
      );
      for (const { file } of componentFiles.failed) {
        const previous = components.get(file);
        if (previous) pieces.push(previous);
      }
      const unique = findDuplicates(pieces);
      components = new Map(unique.valid.map(entry => [entry.file, entry]));
      componentRouter.set(components.values());

      const nextTasks = new Map<string, TaskEntry>();
      for (const { file, value } of taskFiles.loaded) {
        nextTasks.set(file, { file, task: value });
      }
      for (const { file } of taskFiles.failed) {
        const previous = tasks.get(file);
        if (previous) nextTasks.set(file, previous);
      }
      tasks = nextTasks;
      scheduler.set(tasks.values());

      // One presence file. A second one (another extension) is left out.
      const [first, ...extra] = presenceFiles.loaded;
      if (first) presence = first.value;
      else if (presenceFiles.failed.length === 0) presence = null;
      const twice = extra.map(({ file }) => ({
        file,
        error: new TypeError(
          `There are two presence files: ${first!.file} is used, keep only one.`
        ),
      }));
      const nextLanguages = new Map<string, LanguageEntry>();
      for (const { file, value } of messageFiles.loaded) {
        nextLanguages.set(file, { file, language: value });
      }
      for (const { file } of messageFiles.failed) {
        const previous = languages.get(file);
        if (previous) nextLanguages.set(file, previous);
      }
      // What the files say now, before a file is put back to its last good
      // version: two files saying default: true are both underlined.
      languageDefaults = [...nextLanguages.values()]
        .filter(({ language }) => language.isDefault)
        .map(({ file }) => file);
      const previousLanguages = languages;
      languages = nextLanguages;
      let assembled = assembleMessages([...languages.values()]);
      // A language that no longer matches the others keeps its last version
      // that did, like a file that no longer loads.
      const restored = assembled.failed.filter(({ file }) => {
        const previous = previousLanguages.get(file);
        return previous !== undefined && previous !== languages.get(file);
      });
      if (restored.length > 0) {
        for (const { file } of restored) {
          languages.set(file, previousLanguages.get(file)!);
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
        const paths = new Set(
          [...commands.values()].map(entry => entry.command.path.join('/'))
        );
        for (const { file, path } of unknownCommands(messages, paths)) {
          badTexts.push({
            file,
            error: new TypeError(
              `"commands" translates "${path}", which is not a command of this project${paths.size > 0 ? ` (its commands are: ${[...paths].join(', ')})` : ''}. The key is the path of the command file, like 'ping' or 'mod/ban'.`
            ),
          });
        }
      }
      for (const [file, entry] of commands) {
        const { command, failed } = translateCommand(
          file,
          entry.command,
          messages
        );
        badTexts.push(...failed);
        if (command) commands.set(file, { ...entry, command });
        else commands.delete(file);
      }
      commandRouter.set(commands.values());
      return [
        ...eventFiles.failed,
        ...commandFiles.failed,
        ...componentFiles.failed,
        ...taskFiles.failed,
        ...presenceFiles.failed,
        ...messageFiles.failed,
        ...badTexts,
        ...twice,
        ...[...conflicts, ...unique.conflicts].map(({ file, message }) => ({
          file,
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
        return 'Nothing to run yet: add a file in src/commands/ or in a folder like src/events/messageCreate/';
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
      presence === null &&
      messages === null,
    filesNeeding: intent =>
      [...events.values()]
        .filter(({ event }) => (intentsOf(event) & GatewayIntent[intent]) !== 0)
        .map(({ file }) => file),
    intents: (privateEvents = true) =>
      intentsFor(events.values()) & (privateEvents ? ~0 : ~PRIVATE_INTENTS),
    async connect(connection) {
      const created = createBot({
        token: connection.token,
        version: options.version,
        intents:
          intentsFor(events.values()) &
          (connection.privateEvents === false ? ~PRIVATE_INTENTS : ~0),
        guildFilter: connection.guildFilter,
        privateEvents: connection.privateEvents,
        presence: presence?.raw,
        shards: connection.shards,
        identifyGate: connection.identifyGate,
        ...(connection.identifyInterval === undefined
          ? {}
          : { gateway: { identifyInterval: connection.identifyInterval } }),
        // Only what the files of the project use is remembered.
        cache: { limits: limitsFor(events.values()) },
        rest: {
          ...(connection.apiUrl ? { baseUrl: connection.apiUrl } : {}),
          ...(connection.globalLimit === undefined
            ? {}
            : { globalLimit: connection.globalLimit }),
        },
        beforeDispatch: (event, data) =>
          router.before(created.ctx, event, data),
        onDispatch(event, data, info) {
          router.dispatch(created.ctx, event, data, {
            joined: info.joined,
            before: info.before as unknown[] | undefined,
          });
          if (event === 'INTERACTION_CREATE') {
            const interaction =
              data as GatewayDispatchEvents['INTERACTION_CREATE'];
            commandRouter.dispatch(created.ctx, interaction);
            componentRouter.dispatch(created.ctx, interaction);
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
          }
        },
      });
      given.set(created, presence?.key ?? '');
      created.ctx.messages = messages;
      running = created;
      await created.connect();
      return created;
    },
    applyPresence(bot) {
      const key = presence?.key ?? '';
      if (given.get(bot) === key) return false;
      given.set(bot, key);
      bot.setPresence(presence?.raw ?? DEFAULT_PRESENCE);
      return true;
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
    // The bot looks after its own memory: it remembers less before memory
    // is full, and only speaks up when it can't give up anything more.
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
