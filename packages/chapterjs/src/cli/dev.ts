// `chapterjs dev`: runs the bot of the current folder against its dev
// server, and reloads every file of the project when it is saved.

import { join } from 'node:path';
import { registerCommands } from '../commands/register.js';
import { buildCommands, commandName, privateOnly } from '../commands/tree.js';
import { withoutGlobalTwins } from '../commands/twins.js';
import type { Bot } from '../core/bot.js';
import { configure } from '../core/memory.js';
import { GetGlobalApplicationCommands } from '../discord/endpoints.js';
import type { RawApplication } from '../discord/types/application.js';
import type { RawApplicationCommand } from '../discord/types/application-command.js';
import { EVENTS } from '../events/registry.js';
import { limitsFor } from '../events/router.js';
import { enableProjectLoader, nextGeneration } from '../loader/hot.js';
import { messageOf } from '../loader/locate.js';
import { watchPublic } from '../assets/public.js';
import { snapshotFolder, watchFolder } from '../loader/watch.js';
import { RestClient } from '../rest/rest.js';
import { readDevEnv } from './env.js';
import type { Log } from './log.js';
import {
  describeIntents,
  ensureInDevGuild,
  ensurePrivilegedIntents,
  fetchApplication,
  type PreflightOptions,
} from './preflight.js';
import { createProject, explain, hasSources, writeTypes } from './project.js';

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
  if (!(await hasSources(cwd, log))) return 1;

  // 2. The files of the project.
  const project = createProject({
    cwd,
    version: options.version,
    log,
    ...(options.deferAfter === undefined
      ? {}
      : { deferAfter: options.deferAfter }),
  });
  await writeTypes(cwd);
  enableProjectLoader(src, { reload: true });
  // Taken before loading: what is saved from now on must be reloaded.
  const loaded = snapshotFolder(src);
  for (const failure of await project.load()) project.report(failure);

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
  // The files of public/ are listed in the types: a file added or removed
  // is offered (or not) by the editor at once.
  const assets = watchPublic(cwd, () => {
    writeTypes(cwd)
      .then(written => {
        if (written > 0) log.reload('public/ changed: types updated');
      })
      .catch(() => {});
  });
  const memory = project.watchMemory(() => bot);
  // Resolved with the exit code when something ends the command: asked for
  // from the very start, so nothing that happens early is lost.
  let fatal!: (code: number) => void;
  const ended = new Promise<number>(resolve => (fatal = resolve));
  /** The intents of the current connection. */
  let connectedIntents = 0;

  const connect = async (known?: RawApplication): Promise<Bot> => {
    const application = known ?? (await fetchApplication(rest));
    const intents = project.intents(false);
    await ensurePrivilegedIntents(
      preflight,
      application,
      intents,
      project.filesNeeding
    );
    const created = await project.connect({
      token,
      apiUrl,
      // The dev bot only sees its dev server, and nothing outside servers:
      // another process can run the same bot for everyone else, and what
      // happens in private is answered by that one.
      guildFilter: id => id === devGuildId,
      privateEvents: false,
      onFatal: failed => {
        if (bot === failed) fatal(1);
      },
    });
    connectedIntents = intents;
    return created;
  };

  try {
    const application = await fetchApplication(rest);
    const guild = await ensureInDevGuild(preflight, application.id, devGuildId);
    bot = await connect(application);

    // What the bot already has for everyone (a bot in production with the
    // same token): asked once, so the dev server does not show it twice.
    const global = await rest
      .request(GetGlobalApplicationCommands, [application.id], {
        query: { with_localizations: true },
      })
      .catch((): RawApplicationCommand[] => []);
    /** The commands shown twice, already said. */
    const saidTwice = new Set<string>();

    /**
     * Tells Discord the commands of the project, on the dev server only:
     * they show up there at once. Nothing is sent when they did not change.
     */
    const syncCommands = async (): Promise<boolean> => {
      const { kept, changed } = withoutGlobalTwins(
        buildCommands([...project.commands.values()], { guild: true }),
        global
      );
      for (const name of changed) {
        if (saidTwice.has(name)) continue;
        saidTwice.add(name);
        log.info(
          `/${name} is not the same here as in production, so ${guild.name} shows it twice: yours, and the one everyone has. It is shown once again when production runs your version.`
        );
      }
      try {
        return await registerCommands({
          rest,
          projectDir: cwd,
          applicationId: application.id,
          guildId: devGuildId,
          commands: kept,
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
    (project.isEmpty() ? log.info : log.success)(project.summary());
    project.ready(bot);
    // Tasks follow the bot through reconnections: they read the current one.
    project.startTasks(() => bot);

    // Said once per file: what only happens in private messages can't be
    // tried here. Discord only offers the commands of a server in that
    // server, and private messages are answered by the bot in production.
    const noted = new Set<string>();
    const notePrivateOnly = (): void => {
      const note = (file: string, what: string): void => {
        if (noted.has(file)) return;
        noted.add(file);
        log.info(
          `${file} ${what} only works in private messages, and chapterjs dev only runs your bot in ${guild.name}. Try it with chapterjs start.`
        );
      };
      for (const { file, command } of privateOnly([
        ...project.commands.values(),
      ])) {
        note(file, commandName(command.path));
      }
      for (const { file, event } of project.events.values()) {
        if (
          EVENTS[event.name].options &&
          (event.options as { where?: string }).where === 'dm'
        ) {
          note(file, `this ${event.name} file`);
        }
      }
      for (const { file, component } of project.components.values()) {
        if (component.kind !== 'embed' && component.where === 'dm') {
          note(file, `the ${component.kind} ${component.path}`);
        }
      }
    };
    notePrivateOnly();

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
            const failures = await project.load();
            for (const failure of failures) project.report(failure);
            notePrivateOnly();
            if (bot) {
              configure(bot.ctx.cache, limitsFor(project.events.values()));
            }
            const intents = project.intents(false);
            if ((intents & ~connectedIntents) !== 0 && bot) {
              // Intents are given when connecting: new ones need a new session.
              log.reload(
                `Your files now need more from Discord (${describeIntents(intents & ~connectedIntents)}): reconnecting...`
              );
              const previous = bot;
              bot = null;
              await previous.close();
              bot = await connect();
              log.success(`Reconnected, ${project.summary()}`);
              if (await syncCommands())
                log.reload('Commands updated on Discord');
              return;
            }
            const ms = Math.max(1, Math.round(performance.now() - started));
            const updated = await syncCommands();
            if (failures.length === 0)
              log.reload(`Reloaded in ${ms} ms, ${project.summary()}`);
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
    project.stopTasks();
    watcher.close();
    assets.close();
    memory.stop();
    await bot?.close();
    if (code === 0) log.success('Disconnected');
    return code;
  } catch (error) {
    project.stopTasks();
    watcher?.close();
    assets.close();
    memory.stop();
    await bot?.close();
    if (signal.aborted) return 0;
    explain(error, log);
    return 1;
  }
}
