// What `chapterjs dev` and `chapterjs start` share: the files of a project,
// loaded and routed, and a bot that runs them. Each command adds what makes
// it different (reloading for one, every server and several processes for
// the other).

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { commandsConvention } from '../commands/convention.js';
import { CommandRouter } from '../commands/router.js';
import { findConflicts, type CommandEntry } from '../commands/tree.js';
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
import { loadFolder, type FailedFile } from '../loader/loader.js';
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
  /** Only tests change this. */
  deferAfter?: number;
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
  /** The last version of each file that loaded: what the bot runs. */
  readonly events: ReadonlyMap<string, LoadedEvent>;
  readonly commands: ReadonlyMap<string, CommandEntry>;
  /**
   * Loads every file (again). A file that fails is returned; it keeps its
   * last working version when it had one.
   */
  load(): Promise<FailedFile[]>;
  /** Shows a failure with its file and line. */
  report(failure: FailedFile): void;
  /** "2 commands, 3 events loaded". */
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
  const report = ({ file, error }: FailedFile): void => {
    const where = locate(error, cwd);
    log.error(
      `${where ? `${where.file}:${where.line}` : file} ${messageOf(error)}`
    );
  };
  const router = new EventRouter(
    (file, error) => report({ file, error }),
    (event, error) =>
      log.warn(
        `A ${event} event was not given to your files: Discord did not let the bot read the channel it happened in (${messageOf(error)}).`
      )
  );
  const commandRouter = new CommandRouter({
    onError: (file, error) => report({ file, error }),
    onWarning: (file, message) => log.warn(`${file} ${message}`),
    ...(options.deferAfter === undefined
      ? {}
      : { deferAfter: options.deferAfter }),
  });
  let events = new Map<string, LoadedEvent>();
  let commands = new Map<string, CommandEntry>();
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
    report,
    async load() {
      const [eventFiles, commandFiles] = await Promise.all([
        loadFolder(cwd, eventsConvention),
        loadFolder(cwd, commandsConvention),
      ]);
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
      commandRouter.set(commands.values());
      return [
        ...eventFiles.failed,
        ...commandFiles.failed,
        ...conflicts.map(({ file, message }) => ({
          file,
          error: new TypeError(message),
        })),
      ];
    },
    summary() {
      if (events.size === 0 && commands.size === 0) {
        return 'Nothing to run yet: add a file in src/commands/ or in a folder like src/events/messageCreate/';
      }
      return `${[
        ...(commands.size > 0
          ? [count(commands.size, 'command', 'commands')]
          : []),
        ...(events.size > 0 ? [count(events.size, 'event', 'events')] : []),
      ].join(', ')} loaded`;
    },
    isEmpty: () => events.size === 0 && commands.size === 0,
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
            commandRouter.dispatch(
              created.ctx,
              data as GatewayDispatchEvents['INTERACTION_CREATE']
            );
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
      await created.connect();
      return created;
    },
    ready(bot) {
      const user = bot.ctx.cache.users.get(bot.ctx.self!.userId)!;
      router.emit('ready', { user, guilds: bot.ctx.cache.guilds });
    },
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
