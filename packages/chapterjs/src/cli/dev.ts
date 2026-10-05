// `chapterjs dev`: runs the bot of the current folder against its dev
// server, and reloads every file of the project when it is saved.

import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createBot, type Bot } from '../core/bot.js';
import { GatewayIntent, type GatewayIntentName } from '../discord/intents.js';
import type { RawApplication } from '../discord/types/application.js';
import { eventsConvention } from '../events/convention.js';
import { eventTypedFolders } from '../events/types.js';
import { writeGenerated } from '../loader/generated.js';
import { EVENTS } from '../events/registry.js';
import { EventRouter, intentsFor, type LoadedEvent } from '../events/router.js';
import { GatewayFatalError, SessionLimitError } from '../gateway/errors.js';
import { enableProjectLoader, nextGeneration } from '../loader/hot.js';
import { loadFolder, type FailedFile } from '../loader/loader.js';
import { locate, messageOf } from '../loader/locate.js';
import { watchFolder } from '../loader/watch.js';
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
  /** Only tests change it. */
  pollInterval?: number;
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
  /** The last version of each file that loaded: what the bot runs. */
  let events = new Map<string, LoadedEvent>();
  /** Loads every file again; a broken one keeps its last working version. */
  const load = async (): Promise<FailedFile[]> => {
    const result = await loadFolder(cwd, eventsConvention);
    const next = new Map<string, LoadedEvent>();
    for (const { file, value } of result.loaded) {
      next.set(file, { file, event: value });
    }
    for (const { file } of result.failed) {
      const previous = events.get(file);
      if (previous) next.set(file, previous);
    }
    events = next;
    router.set(events.values());
    return result.failed;
  };
  const summary = (): string => {
    const count = events.size;
    return count === 0
      ? 'No events yet: add a file in a folder like src/events/messageCreate/'
      : `${count} ${count === 1 ? 'event' : 'events'} loaded`;
  };
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
  let fatal: ((code: number) => void) | null = null;
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
      onDispatch: (event, data, info) =>
        router.dispatch(created.ctx, event, data, {
          joined: info.joined,
          before: info.before as unknown[] | undefined,
        }),
      onEvent(event) {
        if (event.type === 'disconnected' && !lost) {
          lost = true;
          log.warn('Connection to Discord lost, reconnecting...');
        } else if (event.type === 'ready' && lost) {
          lost = false;
          log.reload('Reconnected to Discord');
        } else if (event.type === 'fatal' && bot === created) {
          log.error(event.error.message);
          fatal?.(1);
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

    const self = bot.ctx.cache.users.get(bot.ctx.self!.userId)!;
    log.success(`Connected to ${guild.name} as ${self.username}`);
    log.info(
      `Intents computed from your files: ${describeIntents(connectedIntents)}`
    );
    (events.size === 0 ? log.info : log.success)(summary());
    router.emit('ready', { user: self, guilds: bot.ctx.cache.guilds });

    // 4. Every save reloads the project.
    let reloading: Promise<void> = Promise.resolve();
    watcher = watchFolder(src, () => {
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
            return;
          }
          const ms = Math.max(1, Math.round(performance.now() - started));
          if (failures.length === 0)
            log.reload(`Reloaded in ${ms} ms, ${summary()}`);
          else {
            log.warn(
              `Reloaded with ${failures.length === 1 ? 'an error' : `${failures.length} errors`}: ${failures.length === 1 ? 'that file keeps' : 'those files keep'} running ${failures.length === 1 ? 'its' : 'their'} last working version`
            );
          }
        })
        .catch(error => {
          if (!signal.aborted) explain(error, log);
          fatal?.(1);
        });
    });

    // 5. Until the user stops it, or Discord refuses the bot for good.
    const code = await new Promise<number>(resolve => {
      fatal = resolve;
      if (signal.aborted) resolve(0);
      signal.addEventListener('abort', () => resolve(0), { once: true });
    });
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
