import {
  fakeDiscord,
  fakeGateway,
  startCli,
  tempDir,
  type Cli,
  type FakeDiscord,
  type FakeGateway,
  type FakeGatewayConnection,
} from '@chapterjs/test-utils';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageDir = fileURLToPath(new URL('..', import.meta.url));
export const bin = join(packageDir, 'dist/cli/cli.js');

export const BOT = '100000000000000002';
export const GUILD = '100000000000000000';
export const GENERAL = '100000000000000021';
export const ALICE = '100000000000000003';

/** Application flags of a bot with every privileged intent enabled. */
export const ALL_PRIVILEGED = (1 << 13) | (1 << 15) | (1 << 19);

/**
 * A project folder as the scaffolder leaves it: `chapterjs` installed, a
 * `.env`, and the given files (path from the project → content).
 */
export function project(
  files: Record<string, string>,
  env: string | null = `BOT_TOKEN=test-token\nDEV_GUILD_ID=${GUILD}\n`
): string {
  const dir = tempDir();
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  write('package.json', JSON.stringify({ name: 'bot', type: 'module' }));
  if (env !== null) write('.env', env);
  mkdirSync(join(dir, 'node_modules'), { recursive: true });
  symlinkSync(packageDir, join(dir, 'node_modules/chapterjs'), 'dir');
  for (const [path, content] of Object.entries(files)) write(path, content);
  return dir;
}

export const rawGuild = (id = GUILD, name = 'Dev Server') => ({
  id,
  name,
  owner_id: ALICE,
  roles: [{ id, name: '@everyone', permissions: '1024', position: 0 }],
  emojis: [],
  features: [],
  member_count: 2,
  joined_at: '2024-01-01T00:00:00Z',
  large: false,
  members: [],
  channels: [{ id: GENERAL, type: 0, name: 'general' }],
  threads: [],
  voice_states: [],
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  soundboard_sounds: [],
});

export const rawMessage = (
  id: string,
  content: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  channel_id: GENERAL,
  guild_id: GUILD,
  author: { id: ALICE, username: 'alice', discriminator: '0' },
  member: {
    roles: [],
    joined_at: '2024-01-01T00:00:00Z',
    deaf: false,
    mute: false,
    flags: 0,
  },
  content,
  timestamp: '2024-01-01T00:00:00Z',
  edited_timestamp: null,
  mentions: [],
  mention_roles: [],
  attachments: [],
  embeds: [],
  type: 0,
  ...extra,
});

export interface FakeWorld {
  discord: FakeDiscord;
  gateway: FakeGateway;
  /** The environment that points the CLI at the fakes. */
  env: Record<string, string>;
}

/**
 * A Discord where the bot exists, is in its dev server and may use the
 * given application flags. The gateway sends Ready, then the dev server and
 * another server the dev bot must ignore.
 */
export async function world(
  options: { flags?: number; inGuild?: boolean } = {}
): Promise<FakeWorld> {
  const discord = await fakeDiscord();
  const gateway = await fakeGateway();
  discord.on('GET', '/applications/@me', {
    body: { id: BOT, name: 'Test Bot', flags: options.flags ?? ALL_PRIVILEGED },
  });
  if (options.inGuild ?? true) {
    discord.on('GET', `/guilds/${GUILD}`, {
      body: { id: GUILD, name: 'Dev Server' },
    });
  } else {
    discord.on('GET', `/guilds/${GUILD}`, {
      status: 404,
      body: { code: 10004, message: 'Unknown Guild' },
    });
  }
  discord.on('GET', '/gateway/bot', {
    body: {
      url: gateway.url,
      shards: 1,
      session_start_limit: {
        total: 1000,
        remaining: 999,
        reset_after: 0,
        max_concurrency: 1,
      },
    },
  });
  // Registering commands succeeds, whatever they are.
  discord.on('PUT', `/applications/${BOT}/guilds/${GUILD}/commands`, {
    body: [],
  });
  const OTHER = '100000000000000900';
  gateway.behavior.onIdentify = connection => {
    connection.dispatch('READY', {
      v: 10,
      user: { id: BOT, username: 'test-bot', discriminator: '0', bot: true },
      guilds: [
        { id: GUILD, unavailable: true },
        { id: OTHER, unavailable: true },
      ],
      session_id: `session-${gateway.connections.length}`,
      resume_gateway_url: gateway.url,
      application: { id: BOT, flags: 0 },
    });
    connection.dispatch('GUILD_CREATE', rawGuild(OTHER, 'Someone else'));
    connection.dispatch('GUILD_CREATE', rawGuild());
  };
  return { discord, gateway, env: { CHAPTERJS_API_URL: discord.url } };
}

/** Starts `chapterjs dev` in a project, against a fake Discord. */
export function runDev(cwd: string, fake: FakeWorld, args = ['dev']): Cli {
  return startCli({ bin, args, cwd, env: fake.env });
}

/** The gateway connection of the running CLI, once it is identified. */
export async function connected(
  fake: FakeWorld,
  index = 0
): Promise<FakeGatewayConnection> {
  const connection = await fake.gateway.connection(index, 8000);
  await connection.waitFor(2, 8000);
  return connection;
}
