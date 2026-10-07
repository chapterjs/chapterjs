// `chapterjs start`: runs for everyone the bot `chapterjs build` prepared.
// Nothing is reloaded, commands are registered for every server, and a
// large bot is spread over several processes by itself.

import { registerCommands } from '../commands/register.js';
import { buildCommands } from '../commands/tree.js';
import type { Bot } from '../core/bot.js';
import { GLOBAL_REQUESTS_PER_SECOND } from '../discord/api.js';
import { messageOf } from '../loader/locate.js';
import { GetGatewayBot } from '../discord/endpoints.js';
import { SessionLimitError } from '../gateway/errors.js';
import { RestClient } from '../rest/rest.js';
import {
  connectToPrimary,
  planProcesses,
  REFUSED,
  runCluster,
  type Assignment,
} from './cluster.js';
import { loadBundle, readBuild } from './build.js';
import { readStartEnv } from './env.js';
import type { Log } from './log.js';
import {
  describeIntents,
  ensurePrivilegedIntents,
  fetchApplication,
} from './preflight.js';
import { createProject, explain, type Project } from './project.js';

export interface StartOptions {
  /** The folder of the project. */
  cwd: string;
  env: Record<string, string | undefined>;
  /** The version of the framework. */
  version: string;
  log: Log;
  /** Aborted when the bot is asked to stop (Ctrl+C, the host). */
  signal: AbortSignal;
  /** Shows a line printed by another process of the bot. */
  write: (line: string) => void;
  /** How many processes to use, when the developer says so. */
  processes?: number | undefined;
  /** The share of this process, when another one started it. */
  assignment?: Assignment | null;
  /** How the other processes are started: this command again. */
  script: string;
  args: readonly string[];
  /** Only tests change this. */
  deferAfter?: number;
}

/** Runs until stopped. Resolves with the exit code of the process. */
export async function start(options: StartOptions): Promise<number> {
  const { cwd, log, signal } = options;
  const assignment = options.assignment ?? null;

  // 1. What the bot must have before anything is tried.
  const read = await readStartEnv(cwd, options.env);
  if ('problems' in read) {
    for (const problem of read.problems) log.error(problem);
    return 1;
  }
  const { token, devGuildId } = read.env;

  // 2. What `chapterjs build` prepared: production runs that, and only
  // that.
  const built = await readBuild(cwd, options.version);
  if ('problem' in built) {
    if (!assignment) log.error(built.problem);
    return 1;
  }
  if (built.stale && !assignment) {
    log.warn(
      'Your files changed since the last build: the bot runs the build, not your changes. Run "chapterjs build" to put them online.'
    );
  }
  let files;
  try {
    files = await loadBundle(cwd);
  } catch (error) {
    // The build ran when it was made: something changed around it since
    // (a package, the version of Node).
    if (!assignment) {
      log.error(
        `The build of your bot can't run any more: ${messageOf(error)}\nRun "chapterjs build" again: it says what to fix.`
      );
    }
    return 1;
  }
  const project = createProject({
    cwd,
    version: options.version,
    log,
    built: files,
    ...(options.deferAfter === undefined
      ? {}
      : { deferAfter: options.deferAfter }),
  });
  const failures = await project.load();
  if (failures.length > 0) {
    for (const failure of failures) project.report(failure);
    if (!assignment) {
      log.error(
        `${failures.length === 1 ? 'This file' : `These ${failures.length} files`} of the build can't run any more, so the bot was not started. Run "chapterjs build" again: it says what to fix.`
      );
    }
    return 1;
  }

  const apiUrl = options.env.CHAPTERJS_API_URL;
  const interval = Number(options.env.CHAPTERJS_IDENTIFY_INTERVAL);
  const identifyInterval =
    Number.isFinite(interval) && interval > 0 ? interval : undefined;
  const connection = {
    token,
    apiUrl,
    identifyInterval,
    // The dev server belongs to `chapterjs dev`: with the same token, the
    // two never answer the same thing.
    ...(devGuildId
      ? { guildFilter: (id: string): boolean => id !== devGuildId }
      : {}),
  };

  try {
    if (assignment)
      return await runShare(project, options, connection, assignment);

    // 3. What Discord must agree with, checked once for every process.
    const rest = new RestClient({
      token,
      version: options.version,
      ...(apiUrl ? { baseUrl: apiUrl } : {}),
    });
    const application = await fetchApplication(rest);
    const intents = project.intents();
    await ensurePrivilegedIntents(
      { rest, log, interactive: false, pollInterval: 0, signal },
      application,
      intents,
      project.filesNeeding
    );
    if (
      await registerCommands({
        rest,
        projectDir: cwd,
        applicationId: application.id,
        commands: buildCommands([...project.commands.values()], {
          guild: false,
        }),
      })
    ) {
      log.success('Commands updated for everyone');
    }

    // 4. How the bot is split: Discord says in how many shards, the size
    // of the machine in how many processes.
    const plan = await rest.request(GetGatewayBot, []);
    const limit = plan.session_start_limit;
    if (limit.remaining < plan.shards) {
      throw new SessionLimitError(
        plan.shards,
        limit.remaining,
        limit.reset_after
      );
    }
    const processes = planProcesses(plan.shards, options.processes);
    const online = (user: string, guilds: number): void => {
      const split = [
        ...(plan.shards > 1 ? [`${plan.shards} shards`] : []),
        ...(processes > 1 ? [`${processes} processes`] : []),
      ].join(', ');
      log.success(
        `Online as ${user} in ${guilds} ${guilds === 1 ? 'server' : 'servers'}${split ? ` (${split})` : ''}`
      );
      log.info(`Intents computed from your files: ${describeIntents(intents)}`);
      (project.isEmpty() ? log.info : log.success)(project.summary());
    };

    if (processes === 1) {
      return await runAlone(project, options, connection, online);
    }
    const code = await runCluster({
      script: options.script,
      args: options.args,
      env: options.env,
      shards: plan.shards,
      processes,
      maxConcurrency: limit.max_concurrency,
      signal,
      identifyInterval,
      write: options.write,
      onReady: ({ user, guilds }) => online(user, guilds),
      onRestart: (index, why) =>
        log.warn(
          `Process ${index + 1} of ${processes} stopped by itself (${why}): starting it again. Its servers are back in a moment.`
        ),
    });
    if (code === 0) log.success('Disconnected');
    return code;
  } catch (error) {
    if (signal.aborted) return 0;
    explain(error, log);
    return assignment ? REFUSED : 1;
  }
}

type Connection = Omit<Parameters<Project['connect']>[0], 'onFatal'>;

/** Runs a bot until it is stopped or Discord refuses it. */
async function run(
  project: Project,
  connection: Connection,
  stopped: Promise<unknown>,
  connected: (bot: Bot) => void,
  { tasks = true }: { tasks?: boolean } = {}
): Promise<'stopped' | 'refused'> {
  let refuse!: () => void;
  const refused = new Promise<'refused'>(
    resolve => (refuse = () => resolve('refused'))
  );
  let bot: Bot | null = null;
  const memory = project.watchMemory(() => bot);
  try {
    bot = await project.connect({ ...connection, onFatal: refuse });
    connected(bot);
    project.ready(bot);
    // A task runs once for the whole bot: in one process only.
    if (tasks) project.startTasks(() => bot);
    return await Promise.race([
      stopped.then(() => 'stopped' as const),
      refused,
    ]);
  } finally {
    project.stopTasks();
    memory.stop();
    await bot?.close();
  }
}

/** The whole bot in this process. */
async function runAlone(
  project: Project,
  options: StartOptions,
  connection: Connection,
  online: (user: string, guilds: number) => void
): Promise<number> {
  const { signal, log } = options;
  const stopped = new Promise<void>(resolve => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });
  const result = await run(project, connection, stopped, bot => {
    const user = bot.ctx.cache.users.get(bot.ctx.self!.userId)!;
    online(user.username, bot.ctx.cache.guilds.size);
  });
  if (result === 'refused') return 1;
  log.success('Disconnected');
  return 0;
}

/** The share of the bot another process gave this one. */
async function runShare(
  project: Project,
  options: StartOptions,
  connection: Connection,
  assignment: Assignment
): Promise<number> {
  const primary = connectToPrimary();
  const { signal } = options;
  const stopped = Promise.race([
    primary.stopped,
    new Promise<void>(resolve => {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), { once: true });
    }),
  ]);
  const result = await run(
    project,
    {
      ...connection,
      shards: { ids: assignment.ids, count: assignment.count },
      identifyGate: primary.gate,
      // Discord counts the requests of the whole bot: each process takes
      // its share, so that together they stay under the limit.
      globalLimit: Math.max(
        1,
        Math.floor(GLOBAL_REQUESTS_PER_SECOND / assignment.processes)
      ),
    },
    stopped,
    bot => {
      const user = bot.ctx.cache.users.get(bot.ctx.self!.userId)!;
      primary.ready({
        guilds: bot.ctx.cache.guilds.size,
        user: user.username,
      });
    },
    // The first process of the cluster runs the tasks for all of them.
    { tasks: assignment.index === 0 }
  );
  if (result === 'refused') {
    primary.refused();
    return REFUSED;
  }
  return 0;
}
