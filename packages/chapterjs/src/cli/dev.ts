// `chapterjs dev`: runs the bot of the current folder against its dev
// server, and reloads every file of the project when it is saved.

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createBot, type Bot } from '../core/bot.js';
import { GatewayIntent, type GatewayIntentName } from '../discord/intents.js';
import type { RawApplication } from '../discord/types/application.js';
import type { GatewayDispatchEvents } from '../discord/types/gateway-events.js';
import { commandsConvention } from '../commands/convention.js';
import { registerGuildCommands } from '../commands/register.js';
import { CommandRouter } from '../commands/router.js';
import {
  buildCommands,
  findConflicts,
  type CommandEntry,
} from '../commands/tree.js';
import { eventsConvention } from '../events/convention.js';
import { eventTypedFolders } from '../events/types.js';
import { writeGenerated } from '../loader/generated.js';
import { EVENTS } from '../events/registry.js';
import { EventRouter, intentsFor, type LoadedEvent } from '../events/router.js';
import { GatewayFatalError, SessionLimitError } from '../gateway/errors.js';
import { enableProjectLoader, nextGeneration } from '../loader/hot.js';
import { loadFolder, type FailedFile } from '../loader/loader.js';
import { locate, messageOf } from '../loader/locate.js';
import { snapshotFolder, watchFolder } from '../loader/watch.js';
import {
  DiscordApiError,
  DiscordUnavailableError,
  InvalidTokenError,
} from '../rest/errors.js';
import { RestClient } from '../rest/rest.js';
import { readDevEnv } from './env.js';
import type { Log } from './log.js';
import {
  describeIntents,
  ensureInDevGuild,
  ensurePrivilegedIntents,
  fetchApplication,
  PreflightFailure,
  type PreflightOptions,
} from './preflight.js';

export interface DevOptions {
  /** The folder of the project. */
  cwd: string;
  env: Record<string, string | undefined>;
  /** The version of the framework. */
  version: string;
  log: Log;
  /** Whether a person is watching the terminal. */
  interactive: boolean;
  /** Aborted when the user asks to stop (Ctrl+C). */
  signal: AbortSignal;
  /** Only tests change these. */
  pollInterval?: number;
  deferAfter?: number;
}

/** Runs until stopped. Resolves with the exit code of the process. */
export async function dev(options: DevOptions): Promise<number> {
  const { cwd, log, signal } = options;

  // 1. What the project must have before anything is tried.
  const read = await readDevEnv(cwd, options.env);
  if ('problems' in read) {
    for (const problem of read.problems) log.error(problem);
    return 1;
  }
  const { token, devGuildId } = read.env;
  const src = join(cwd, 'src');
  if (!(await stat(src).catch(() => null))?.isDirectory()) {
    log.error(
      'There is no src folder here.\nRun this command in the folder of your bot (the one with package.json), or create a project with "pnpm create chapter".'
    );
    return 1;
  }

  // 2. The files of the project.
  const reportFailure = ({ file, error }: FailedFile): void => {
    const where = locate(error, cwd);
    log.error(
      `${where ? `${where.file}:${where.line}` : file} ${messageOf(error)}`
    );
  };
  const router = new EventRouter((file, error) => {
    const where = locate(error, cwd);
    log.error(
      `${where ? `${where.file}:${where.line}` : file} ${messageOf(error)}`
    );
  });
  const commandRouter = new CommandRouter({
    onError: (file, error) => reportFailure({ file, error }),
    onWarning: (file, message) => log.warn(`${file} ${message}`),
    ...(options.deferAfter === undefined
      ? {}
      : { deferAfter: options.deferAfter }),
  });
  /** The last version of each file that loaded: what the bot runs. */
  let events = new Map<string, LoadedEvent>();
  let commands = new Map<string, CommandEntry>();
  /** Loads every file again; a broken one keeps its last working version. */
  const load = async (): Promise<FailedFile[]> => {
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
  };
  const count = (size: number, one: string, many: string): string =>
    `${size} ${size === 1 ? one : many}`;
  const summary = (): string => {
    if (events.size === 0 && commands.size === 0) {
      return 'Nothing to run yet: add a file in src/commands/ or in a folder like src/events/messageCreate/';
    }
    return `${[
      ...(commands.size > 0
        ? [count(commands.size, 'command', 'commands')]
        : []),
      ...(events.size > 0 ? [count(events.size, 'event', 'events')] : []),
    ].join(', ')} loaded`;
  };
  const isEmpty = (): boolean => events.size === 0 && commands.size === 0;
  /** The files that make an intent necessary. */
  const filesNeeding = (intent: GatewayIntentName): string[] =>
    [...events.values()]
      .filter(
        ({ event }) =>
          (EVENTS[event.name].intents & GatewayIntent[intent]) !== 0
      )
      .map(({ file }) => file);

  await writeGenerated(cwd, eventTypedFolders());
  enableProjectLoader(src, { reload: true });
  // Taken before loading: what is saved from now on must be reloaded.
  const loaded = snapshotFolder(src);
  for (const failure of await load()) reportFailure(failure);

  // 3. What Discord must agree with before connecting.
  const apiUrl = options.env.CHAPTERJS_API_URL;
  const rest = new RestClient({
    token,
    version: options.version,
    ...(apiUrl ? { baseUrl: apiUrl } : {}),
  });
  const preflight: PreflightOptions = {
    rest,
    log,
    interactive: options.interactive,
    pollInterval: options.pollInterval ?? 3000,
    signal,
  };

  let bot: Bot | null = null;
  let watcher: { close(): void } | null = null;
  // Resolved with the exit code when something ends the command: asked for
  // from the very start, so nothing that happens early is lost.
  let fatal!: (code: number) => void;
  const ended = new Promise<number>(resolve => (fatal = resolve));
  /** The intents of the current connection. */
  let connectedIntents = 0;
  let lost = false;

  const connect = async (application: RawApplication): Promise<Bot> => {
    const intents = intentsFor(events.values());
    await ensurePrivilegedIntents(
      preflight,
      application,
      intents,
      filesNeeding
    );
    const created = createBot({
      token,
      version: options.version,
      intents,
      // The dev bot only sees its dev server: another process can run the
      // same bot for everyone else.
      guildFilter: id => id === devGuildId,
      ...(apiUrl ? { rest: { baseUrl: apiUrl } } : {}),
      beforeDispatch: (event, data) => router.before(created.ctx, event, data),
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
        } else if (event.type === 'fatal' && bot === created) {
          log.error(event.error.message);
          fatal(1);
        } else if (event.type === 'stateError') {
          log.warn(
            `An event of Discord (${event.event}) could not be read: ${messageOf(event.error)}`
          );
        }
      },
    });
    await created.connect();
    connectedIntents = intents;
    return created;
  };

  try {
    const application = await fetchApplication(rest);
    const guild = await ensureInDevGuild(preflight, application.id, devGuildId);
    bot = await connect(application);

    /**
     * Tells Discord the commands of the project, on the dev server only:
     * they show up there at once. Nothing is sent when they did not change.
     */
    const syncCommands = async (): Promise<boolean> => {
      try {
        return await registerGuildCommands({
          rest,
          projectDir: cwd,
          applicationId: application.id,
          guildId: devGuildId,
          commands: buildCommands([...commands.values()], { guild: true }),
        });
      } catch (error) {
        // The bot keeps running with the commands Discord already has.
        log.error(
          `Discord refused the commands of your project: ${messageOf(error)}`
        );
        return false;
      }
    };

    const self = bot.ctx.cache.users.get(bot.ctx.self!.userId)!;
    log.success(`Connected to ${guild.name} as ${self.username}`);
    log.info(
      `Intents computed from your files: ${describeIntents(connectedIntents)}`
    );
    (isEmpty() ? log.info : log.success)(summary());
    router.emit('ready', { user: self, guilds: bot.ctx.cache.guilds });

    // 4. Every save reloads the project. Watching starts right away; the
    // first thing done is to tell Discord the commands.
    let reloading: Promise<void> = syncCommands().then(updated => {
      if (updated) log.success(`Commands updated on ${guild.name}`);
    });
    watcher = watchFolder(
      src,
      () => {
        reloading = reloading
          .then(async () => {
            const started = performance.now();
            nextGeneration();
            const failures = await load();
            for (const failure of failures) reportFailure(failure);
            const intents = intentsFor(events.values());
            if ((intents & ~connectedIntents) !== 0 && bot) {
              // Intents are given when connecting: new ones need a new session.
              log.reload(
                `Your files now need more from Discord (${describeIntents(intents & ~connectedIntents)}): reconnecting...`
              );
              const previous = bot;
              bot = null;
              await previous.close();
              bot = await connect(await fetchApplication(rest));
              log.success(`Reconnected, ${summary()}`);
              if (await syncCommands())
                log.reload('Commands updated on Discord');
              return;
            }
            const ms = Math.max(1, Math.round(performance.now() - started));
            const updated = await syncCommands();
            if (failures.length === 0)
              log.reload(`Reloaded in ${ms} ms, ${summary()}`);
            else {
              log.warn(
                `Reloaded with ${failures.length === 1 ? 'an error' : `${failures.length} errors`}: ${failures.length === 1 ? 'that file keeps' : 'those files keep'} running ${failures.length === 1 ? 'its' : 'their'} last working version`
              );
            }
            if (updated) log.reload('Commands updated on Discord');
          })
          .catch(error => {
            if (!signal.aborted) explain(error, log);
            fatal(1);
          });
      },
      { loaded }
    );

    // 5. Until the user stops it, or Discord refuses the bot for good.
    if (signal.aborted) fatal(0);
    signal.addEventListener('abort', () => fatal(0), { once: true });
    const code = await ended;
    await reloading.catch(() => {});
    watcher.close();
    await bot?.close();
    if (code === 0) log.success('Disconnected');
    return code;
  } catch (error) {
    watcher?.close();
    await bot?.close();
    if (signal.aborted) return 0;
    explain(error, log);
    return 1;
  }
}

/** Says what went wrong in words the developer can act on. */
function explain(error: unknown, log: Log): void {
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
