import { startCli, tempDir } from '@chapterjs/test-utils';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planProcesses, runCluster, splitShards } from '../src/cli/cluster.js';
import { FileStoreBackend } from '../src/store/file-backend.js';
import { GatewayIntent } from '../src/discord/intents.js';
import {
  ALICE,
  BOT,
  connected,
  GUILD,
  OTHER_GUILD,
  project,
  rawMessage,
  runProduction,
  runStart,
  shardOf,
  world,
  type FakeWorld,
  bin,
  buildProject,
} from './dev-helpers.js';

const PING = `import { command } from 'chapterjs';
export default command({
  name: 'ping',
  description: 'Replies with Pong!',
  async run({ interaction }) {
    await interaction.reply('Pong!');
  },
});
`;
const LOG = `import { event } from 'chapterjs';
export default event({
  name: 'messageCreate',
  run({ message }) {
    console.log(\`said: \${message.content} in \${message.guild.name}\`);
  },
});
`;
const READY = `import { event } from 'chapterjs';
export default event({
  name: 'ready',
  run({ user, guilds }) {
    console.log(\`ready: \${user.username} pid \${process.pid} in \${[...guilds.values()].map(guild => guild.name).sort().join('+')}\`);
  },
});
`;
const files = {
  'src/commands/ping.ts': PING,
  'src/events/messageCreate/log.ts': LOG,
  'src/events/ready/hello.ts': READY,
};
const globalCommands = (fake: FakeWorld) =>
  fake.discord
    .requestsTo('PUT', `/applications/${BOT}/commands`)
    .map(request => request.body as Record<string, unknown>[]);
const identifies = (fake: FakeWorld) =>
  fake.gateway.connections
    .map(
      connection =>
        connection.received.find(payload => payload.op === 2)?.d as
          | { shard?: [number, number]; intents: number; token: string }
          | undefined
    )
    .filter(identify => identify !== undefined);

describe.skipIf(process.platform === 'win32')('chapterjs start', () => {
  it('runs the bot for everyone but the dev server, and stops cleanly', async () => {
    const fake = await world();
    const cwd = project(files);
    const cli = runStart(cwd, fake);
    await cli.waitFor('✓ 1 command, 2 events loaded');
    // What a person reads, in order.
    expect(cli.output.split('\n').slice(0, 4)).toEqual([
      '✓ Commands updated for everyone',
      '✓ Online as test-bot in 1 server',
      'ℹ Intents computed from your files: GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT',
      '✓ 1 command, 2 events loaded',
    ]);
    // The dev server belongs to chapterjs dev: production does not know it.
    await cli.waitFor('ready: test-bot pid ');
    expect(cli.output).toMatch(/ready: test-bot pid \d+ in Someone else\n/);
    const connection = await connected(fake);
    const identify = identifies(fake)[0]!;
    expect(identify.token).toBe('test-token');
    expect(identify.shard).toEqual([0, 1]);
    expect(identify.intents).toBe(
      GatewayIntent.Guilds |
        GatewayIntent.GuildMessages |
        GatewayIntent.MessageContent
    );

    // Commands are for everyone, with where they work.
    expect(globalCommands(fake)).toEqual([
      [
        {
          type: 1,
          name: 'ping',
          description: 'Replies with Pong!',
          default_member_permissions: null,
          integration_types: [0],
          contexts: [0],
        },
      ],
    ]);
    expect(
      fake.discord.requestsTo(
        'PUT',
        `/applications/${BOT}/guilds/${GUILD}/commands`
      )
    ).toEqual([]);

    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000070', 'for dev')
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000071', 'for everyone', {
        guild_id: OTHER_GUILD,
        channel_id: '100000000000000990',
      })
    );
    fake.discord.on('GET', '/channels/100000000000000990', {
      body: {
        id: '100000000000000990',
        type: 0,
        name: 'general',
        guild_id: OTHER_GUILD,
      },
    });
    await cli.waitFor('said: for everyone in Someone else');
    expect(cli.output).not.toContain('for dev');

    cli.signal('SIGTERM');
    const { code, output } = await cli.exited;
    expect(code).toBe(0);
    expect(output.trimEnd().split('\n').at(-1)).toBe('✓ Disconnected');
    expect(await connection.waitForClose()).toBe(1000);
    expect(output).not.toMatch(/[✗⚠]/);
  });

  it('runs every server when it is not told of a dev server', async () => {
    const fake = await world();
    const cli = runStart(project(files, 'BOT_TOKEN=test-token\n'), fake);
    await cli.waitFor('✓ Online as test-bot in 2 servers');
    await cli.waitFor(/ready: test-bot pid \d+ in Dev Server\+Someone else/);
    (await connected(fake)).dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000072', 'hello')
    );
    await cli.waitFor('said: hello in Dev Server');
  });

  it('takes its token from the host when there is no .env', async () => {
    const fake = await world();
    const cli = runStart(project(files, null), fake, [], {
      BOT_TOKEN: 'from-the-host',
    });
    await cli.waitFor('✓ Online as test-bot in 2 servers');
    await connected(fake);
    expect(identifies(fake)[0]!.token).toBe('from-the-host');
  });

  it('only tells Discord its commands when they changed', async () => {
    const fake = await world();
    const cwd = project(files);
    const first = runStart(cwd, fake);
    await first.waitFor('✓ 1 command, 2 events loaded');
    first.signal('SIGTERM');
    await first.exited;
    const second = runStart(cwd, fake);
    await second.waitFor('✓ 1 command, 2 events loaded');
    expect(second.output).not.toContain('Commands updated');
    expect(globalCommands(fake)).toHaveLength(1);
  });

  it.each([
    [
      'no token',
      files,
      null,
      [
        /✗ BOT_TOKEN is not set\.\n  Give it to the bot the way your host does it \(its "environment variables" or "secrets"\), or in a \.env file in this folder\./,
      ],
    ],
    [
      'a token left as in the example',
      files,
      'BOT_TOKEN=your-token-here\n',
      [/✗ \.env: BOT_TOKEN is still the example value\./],
    ],
    [
      'a dev server that is not an id',
      files,
      'BOT_TOKEN=test-token\nDEV_GUILD_ID=my-server\n',
      [/✗ DEV_GUILD_ID is "my-server", which is not a server ID/],
    ],
  ])(
    'does not start with %s, and says what to fix',
    async (_what, project_, env, messages) => {
      const fake = await world();
      const result = await runStart(project(project_, env), fake).exited;
      for (const message of messages) expect(result.output).toMatch(message);
      expect(result.code).toBe(1);
      // Nothing was asked to Discord, and nobody connected.
      expect(fake.discord.requests).toEqual([]);
      expect(fake.gateway.connections).toEqual([]);
      expect(result.output).not.toContain('Online');
    }
  );

  it('does not start without the privileged intents it needs, and does not wait', async () => {
    const fake = await world({ flags: 0 });
    const result = await runStart(project(files), fake).exited;
    expect(result.code).toBe(1);
    expect(result.output).toMatch(
      /✗ Your files need an option that is not enabled for your bot:\n  - Message Content Intent, needed by src\/events\/messageCreate\/log\.ts/
    );
    expect(result.output).not.toContain('Waiting');
    expect(fake.gateway.connections).toEqual([]);
    expect(globalCommands(fake)).toEqual([]);
  });

  it('does not start what was not built, and says what to run', async () => {
    const fake = await world();
    // A project nobody built: `startCli` directly, not the helper.
    const cwd = project(files);
    const result = await startCli({
      bin,
      args: ['start'],
      cwd,
      env: fake.env,
    }).exited;
    expect(result.code).toBe(1);
    expect(result.output).toBe(
      '✗ There is no build of your bot here.\n  Run "chapterjs build" first (the build script of your project), then start again.\n'
    );
    expect(fake.discord.requests).toEqual([]);
    expect(fake.gateway.connections).toEqual([]);
  });

  it('runs what was built, not what changed since, and says so', async () => {
    const fake = await world();
    const cwd = project(files);
    expect(buildProject(cwd).code).toBe(0);
    // Changed after the build: a new answer, and a file that can't run.
    writeFileSync(
      join(cwd, 'src/events/ready/hello.ts'),
      READY.replace('ready: ', 'changed: ')
    );
    writeFileSync(join(cwd, 'src/commands/broken.ts'), 'export default 5;\n');
    const cli = startCli({ bin, args: ['start'], cwd, env: fake.env });
    await cli.waitFor('✓ 1 command, 2 events loaded');
    await cli.waitFor('ready: test-bot pid ');
    expect(cli.output.split('\n')[0]).toBe(
      '⚠ Your files changed since the last build: the bot runs the build, not your changes. Run "chapterjs build" to put them online.'
    );
    expect(cli.output).not.toContain('changed: ');
    expect(cli.output).not.toContain('✗');
    cli.signal('SIGTERM');
    await cli.exited;

    // Built again: the changes are checked, then online.
    rmSync(join(cwd, 'src/commands/broken.ts'));
    expect(buildProject(cwd).code).toBe(0);
    const again = startCli({ bin, args: ['start'], cwd, env: fake.env });
    await again.waitFor('changed: test-bot pid ');
    expect(again.output).not.toContain('⚠');
  });

  it('names the file and the line of the project when the compiled bot fails', async () => {
    const fake = await world();
    const cwd = project(
      {
        'src/lib/risky.ts': `export function risky(text: string): string {
  // What went wrong is here, three files away from the compiled one.
  if (text === 'boom') throw new Error('it broke');
  return text;
}
`,
        'src/events/messageCreate/log.ts': `import { event } from 'chapterjs';
import { risky } from '../../lib/risky';

export default event({
  name: 'messageCreate',
  run({ message }) {
    console.log('said: ' + risky(message.content));
  },
});
`,
      },
      'BOT_TOKEN=test-token\n'
    );
    const cli = runStart(cwd, fake);
    await cli.waitFor('✓ 1 event loaded');
    const connection = await connected(fake);
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000075', 'boom')
    );
    // The line in the code of the developer, not in the compiled file.
    await cli.waitFor('✗ src/lib/risky.ts:3 it broke');
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000076', 'fine')
    );
    await cli.waitFor('said: fine');
    expect(cli.output).not.toContain('bot.js');
  });

  it('runs a build without the sources it was made from', async () => {
    const fake = await world();
    const cwd = project(files);
    expect(buildProject(cwd).code).toBe(0);
    // What a host receives: the build, not the project.
    rmSync(join(cwd, 'src'), { recursive: true });
    const cli = startCli({ bin, args: ['start'], cwd, env: fake.env });
    await cli.waitFor('✓ 1 command, 2 events loaded');
    expect(cli.output).not.toMatch(/[✗⚠]/);
  });

  it('refuses a build made by another version, or that can not run any more', async () => {
    const fake = await world();
    const cwd = project(files);
    expect(buildProject(cwd).code).toBe(0);
    const info = join(cwd, '.chapterjs/build/build.json');
    const built = JSON.parse(readFileSync(info, 'utf8')) as { version: string };
    writeFileSync(info, JSON.stringify({ ...built, version: '0.0.1-old' }));
    const old = await startCli({ bin, args: ['start'], cwd, env: fake.env })
      .exited;
    expect(old.code).toBe(1);
    expect(old.output).toMatch(
      /^✗ This build was made with chapterjs 0\.0\.1-old, and this is chapterjs \d+\.\d+\.\d+.*\.\n  Run "chapterjs build" again\.\n$/
    );

    // Half a build (a copy that was cut short) is no build.
    writeFileSync(info, JSON.stringify(built));
    const bot = join(cwd, '.chapterjs/build/bot.js');
    const compiled = readFileSync(bot, 'utf8');
    rmSync(bot);
    const half = await startCli({ bin, args: ['start'], cwd, env: fake.env })
      .exited;
    expect(half.code).toBe(1);
    expect(half.output).toMatch(/^✗ There is no build of your bot here\./);
    writeFileSync(bot, compiled);

    // Something around the build changed: it no longer runs.
    writeFileSync(info, JSON.stringify(built));
    writeFileSync(
      join(cwd, '.chapterjs/build/bot.js'),
      "throw new Error('a package changed');\n"
    );
    const broken = await startCli({ bin, args: ['start'], cwd, env: fake.env })
      .exited;
    expect(broken.code).toBe(1);
    expect(broken.output).toBe(
      '✗ The build of your bot can\'t run any more: a package changed\n  Run "chapterjs build" again: it says what to fix.\n'
    );
    expect(fake.gateway.connections).toEqual([]);
  });

  it('stops for good when Discord refuses the bot', async () => {
    const fake = await world();
    const cli = runStart(project(files), fake);
    await cli.waitFor('✓ 1 command, 2 events loaded');
    (await connected(fake)).close(4004);
    const { code, output } = await cli.exited;
    expect(code).toBe(1);
    expect(output).toMatch(/✗ .*token/i);
    expect(output).not.toContain('Disconnected');
  });
});

describe('how a bot is spread over processes', () => {
  it.each([
    // shards, asked, cpus → processes
    [1, undefined, 8, 1],
    [4, undefined, 8, 1],
    [5, undefined, 8, 2],
    [16, undefined, 8, 4],
    [64, undefined, 8, 8],
    [64, undefined, 1, 1],
    // What the developer asks wins, within what makes sense.
    [8, 2, 8, 2],
    [8, 8, 2, 8],
    [3, 8, 8, 3],
    [8, 0, 8, 1],
    [8, 2.9, 8, 2],
  ])(
    '%i shards, asked %s, %i CPUs: %i processes',
    (shards, asked, cpus, expected) => {
      expect(planProcesses(shards, asked, cpus)).toBe(expected);
    }
  );

  it.each([
    [1, 1, [[0]]],
    [
      4,
      2,
      [
        [0, 1],
        [2, 3],
      ],
    ],
    [
      5,
      2,
      [
        [0, 1, 2],
        [3, 4],
      ],
    ],
    [
      7,
      3,
      [
        [0, 1, 2],
        [3, 4],
        [5, 6],
      ],
    ],
    [3, 3, [[0], [1], [2]]],
  ])('%i shards over %i processes', (count, processes, expected) => {
    const shares = splitShards(count, processes);
    expect(shares).toEqual(expected);
    // Every shard, once.
    expect(shares.flat()).toEqual(Array.from({ length: count }, (_, id) => id));
  });
});

/** Waits for something to be anywhere in what was printed so far. */
async function printed(cli: { output: string }, what: RegExp): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!what.test(cli.output)) {
    if (Date.now() > deadline) {
      throw new Error(`${what} was not printed. Output:\n${cli.output}`);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

describe.skipIf(process.platform === 'win32')(
  'chapterjs start on several processes',
  () => {
    // One server per shard of a bot split in four.
    const servers = ['A', 'B', 'C', 'D'].map((name, index) => {
      let id = 100000000000001000n;
      while (shardOf(String(id), 4) !== index) id += 1n << 22n;
      return { id: String(id), name };
    });
    const big = () => world({ shards: 4, maxConcurrency: 16, guilds: servers });
    const channelOf = (fake: FakeWorld, guildId: string) => {
      const id = `${guildId.slice(0, -1)}7`;
      fake.discord.on('GET', `/channels/${id}`, {
        body: { id, type: 0, name: 'general', guild_id: guildId },
      });
      return id;
    };
    /** The connection of a shard, once it identified. */
    const shard = async (fake: FakeWorld, id: number) => {
      const deadline = Date.now() + 8000;
      for (;;) {
        const found = fake.gateway.connections.find(
          connection =>
            !connection.closed &&
            (
              connection.received.find(payload => payload.op === 2)?.d as
                { shard?: [number, number] } | undefined
            )?.shard?.[0] === id
        );
        if (found) return found;
        if (Date.now() > deadline)
          throw new Error(`Shard ${id} never identified`);
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };

    it('gives each process its shards, checks everything once, and reads as one bot', async () => {
      const fake = await big();
      const cli = runStart(project(files, 'BOT_TOKEN=test-token\n'), fake, [
        '--processes',
        '2',
      ]);
      await cli.waitFor(
        '✓ Online as test-bot in 5 servers (4 shards, 2 processes)'
      );
      await cli.waitFor('✓ 1 command, 2 events loaded');
      // Checked and registered once, by the process that was started.
      expect(globalCommands(fake)).toHaveLength(1);
      expect(cli.output.match(/Commands updated for everyone/g)).toHaveLength(
        1
      );
      expect(cli.output.match(/Online as/g)).toHaveLength(1);
      expect(fake.discord.requestsTo('GET', '/applications/@me')).toHaveLength(
        1
      );

      // Each shard identified once, out of four.
      expect(
        identifies(fake)
          .map(identify => identify.shard)
          .sort()
      ).toEqual([
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
      ]);
      // Two processes, each with its servers: shards 0-1, and 2-3.
      await printed(cli, /\[2\] ready: test-bot pid \d+/);
      await printed(cli, /\[1\] ready: test-bot pid \d+/);
      const ready = [
        ...cli.output.matchAll(/\[(\d)\] ready: test-bot pid (\d+) in (.*)/g),
      ];
      expect(ready).toHaveLength(2);
      const pids = new Set(ready.map(match => match[2]));
      expect(pids.size).toBe(2);
      const byProcess = Object.fromEntries(
        ready.map(match => [match[1], match[3]])
      );
      const namesOf = (ids: number[]) =>
        [...servers, { id: GUILD, name: 'Dev Server' }]
          .filter(server => ids.includes(shardOf(server.id, 4)))
          .map(server => server.name)
          .sort()
          .join('+');
      expect(byProcess).toEqual({ '1': namesOf([0, 1]), '2': namesOf([2, 3]) });

      // What happens in a server is handled by the process of its shard.
      for (const [index, server] of servers.entries()) {
        (await shard(fake, index)).dispatch(
          'MESSAGE_CREATE',
          rawMessage(`10000000000000008${index}`, `hi ${server.name}`, {
            guild_id: server.id,
            channel_id: channelOf(fake, server.id),
          })
        );
      }
      for (const [index, server] of servers.entries()) {
        await printed(
          cli,
          new RegExp(
            `\\[${index < 2 ? 1 : 2}\\] said: hi ${server.name} in ${server.name}`
          )
        );
      }

      // Stopped together: every shard says goodbye, one process answers.
      const open = fake.gateway.connections.filter(
        connection => !connection.closed
      );
      expect(open).toHaveLength(4);
      cli.signal('SIGTERM');
      const { code, output } = await cli.exited;
      expect(code).toBe(0);
      expect(
        await Promise.all(open.map(connection => connection.waitForClose()))
      ).toEqual([1000, 1000, 1000, 1000]);
      expect(output.match(/Disconnected/g)).toHaveLength(1);
      expect(output.trimEnd().split('\n').at(-1)).toBe('✓ Disconnected');
      expect(output).not.toMatch(/[✗⚠]/);
    }, 30_000);

    it('shares the stores between the processes', async () => {
      const fake = await big();
      const cwd = project(
        {
          ...files,
          'src/events/messageCreate/count.ts': `import { event, store } from 'chapterjs';
export const hits = store<number>();
export const total = store<number>({ scope: 'global' });
export default event({
  name: 'messageCreate',
  async run({ message }) {
    if (message.content !== 'count') return;
    const here = await hits.update('all', (n = 0) => n + 1);
    const everywhere = await total.update('all', (n = 0) => n + 1);
    console.log(\`counted: \${here} in \${message.guild.name}, \${everywhere} everywhere\`);
  },
});
`,
        },
        'BOT_TOKEN=test-token\n'
      );
      const cli = runStart(cwd, fake, ['--processes', '2']);
      await cli.waitFor('✓ 1 command, 3 events, 2 stores loaded');
      await printed(cli, /\[2\] ready: test-bot pid \d+/);
      await printed(cli, /\[1\] ready: test-bot pid \d+/);
      // Two processes count together: what one wrote, the other reads.
      const order = [0, 2, 1, 3];
      for (const [n, index] of order.entries()) {
        const server = servers[index]!;
        (await shard(fake, index)).dispatch(
          'MESSAGE_CREATE',
          rawMessage(`10000000000000009${n}`, 'count', {
            guild_id: server.id,
            channel_id: channelOf(fake, server.id),
          })
        );
        await printed(
          cli,
          new RegExp(
            `\\[${index < 2 ? 1 : 2}\\] counted: 1 in ${server.name}, ${n + 1} everywhere`
          )
        );
      }
      // The same server again, from the same process: its own count.
      (await shard(fake, 0)).dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000099', 'count', {
          guild_id: servers[0]!.id,
          channel_id: channelOf(fake, servers[0]!.id),
        })
      );
      await printed(cli, /\[1\] counted: 2 in A, 5 everywhere/);
      cli.signal('SIGTERM');
      const { code, output } = await cli.exited;
      expect(code).toBe(0);
      expect(output).not.toMatch(/[✗⚠]/);
      // Written once, by the process that was started.
      expect(readdirSync(join(cwd, 'data')).sort()).toEqual([
        'hits.json',
        'total.json',
      ]);
      expect(
        JSON.parse(readFileSync(join(cwd, 'data', 'total.json'), 'utf8'))
      ).toEqual({ version: 1, entries: [[['all'], 5, null]] });
    }, 30_000);

    it('uses as many processes as the bot needs when nothing is asked', async () => {
      const fake = await big();
      const cli = runStart(project(files, 'BOT_TOKEN=test-token\n'), fake);
      // Four shards fit in one process.
      await cli.waitFor('✓ Online as test-bot in 5 servers (4 shards)');
      await cli.waitFor(/^ready: test-bot pid \d+ in A\+B\+C\+D\+Dev Server$/m);
      expect(identifies(fake)).toHaveLength(4);
    }, 30_000);

    it('lets one shard identify at a time when Discord asks for it', async () => {
      const fake = await world({ shards: 2, maxConcurrency: 1, guilds: [] });
      const cli = runStart(
        project(files, 'BOT_TOKEN=test-token\n'),
        fake,
        ['--processes', '2'],
        { CHAPTERJS_IDENTIFY_INTERVAL: '1500' }
      );
      // Whichever process asks first goes first.
      const deadline = Date.now() + 8000;
      while (identifies(fake).length === 0 && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const started = Date.now();
      expect(identifies(fake)).toHaveLength(1);
      // The other one waits for its turn, given by the first process.
      await new Promise(resolve => setTimeout(resolve, 700));
      expect(identifies(fake)).toHaveLength(1);
      await shard(fake, 0);
      await shard(fake, 1);
      expect(Date.now() - started).toBeGreaterThanOrEqual(1300);
      await cli.waitFor(
        '✓ Online as test-bot in 1 server (2 shards, 2 processes)'
      );
    }, 30_000);

    it('starts a process again when it stops by itself', async () => {
      const fake = await big();
      const cli = runStart(project(files, 'BOT_TOKEN=test-token\n'), fake, [
        '--processes',
        '2',
      ]);
      await printed(cli, /\[2\] ready: test-bot pid \d+/);
      await printed(cli, /\[1\] ready: test-bot pid \d+/);
      const pid = Number(
        /\[2\] ready: test-bot pid (\d+)/.exec(cli.output)![1]
      );
      const before = identifies(fake).length;
      process.kill(pid, 'SIGKILL');
      await cli.waitFor(
        '⚠ Process 2 of 2 stopped by itself (stopped by SIGKILL): starting it again. Its servers are back in a moment.'
      );
      // Its two shards come back; the other process never noticed.
      await printed(
        cli,
        /\[2\] ready: test-bot pid \d+ in .*\n(?:.|\n)*\[2\] ready: test-bot pid \d+/
      );
      const again = identifies(fake)
        .slice(before)
        .map(identify => identify.shard![0]);
      expect(again.sort()).toEqual([2, 3]);
      expect(cli.output.match(/\[1\] ready/g)).toHaveLength(1);
      // Said once, and the bot is online once.
      expect(cli.output.match(/Online as/g)).toHaveLength(1);
      cli.signal('SIGTERM');
      expect((await cli.exited).code).toBe(0);
    }, 30_000);

    it('stops every process when Discord refuses the bot', async () => {
      const fake = await big();
      const cli = runStart(project(files, 'BOT_TOKEN=test-token\n'), fake, [
        '--processes',
        '2',
      ]);
      await cli.waitFor('✓ Online as test-bot');
      const open = fake.gateway.connections.filter(
        connection => !connection.closed
      );
      (await shard(fake, 3)).close(4004);
      const { code, output } = await cli.exited;
      expect(code).toBe(1);
      expect(output).toMatch(/\[2\] ✗ .*token/i);
      expect(output).not.toContain('starting it again');
      expect(output).not.toContain('Disconnected');
      // Nobody stays connected behind.
      await Promise.all(open.map(connection => connection.waitForClose()));
    }, 30_000);

    it('says once that nothing was built, whatever the number of processes', async () => {
      const fake = await big();
      const result = await startCli({
        bin,
        args: ['start', '--processes', '2'],
        cwd: project(files, 'BOT_TOKEN=test-token\n'),
        env: fake.env,
      }).exited;
      expect(result.code).toBe(1);
      expect(result.output.match(/There is no build/g)).toHaveLength(1);
      expect(fake.gateway.connections).toEqual([]);
    });

    it('answers private messages once, from the process of the first shard', async () => {
      const fake = await big();
      const cli = runStart(
        project(
          {
            'src/events/messageCreate/private.ts': `import { event } from 'chapterjs';
export default event({ name: 'messageCreate', where: 'dm', run: ({ message }) => console.log('private: ' + message.content) });
`,
          },
          'BOT_TOKEN=test-token\n'
        ),
        fake,
        ['--processes', '2']
      );
      await cli.waitFor('✓ Online as test-bot');
      const {
        guild_id: _guild,
        member: _member,
        ...message
      } = rawMessage('100000000000000095', 'psst', {
        channel_id: '100000000000000096',
      });
      // Discord only sends what belongs to no server to the first shard.
      (await shard(fake, 0)).dispatch('MESSAGE_CREATE', message);
      await cli.waitFor('[1] private: psst');
      expect(cli.output.match(/private: psst/g)).toHaveLength(1);
      expect(ALICE).toBeDefined();
    }, 30_000);
  }
);

describe.skipIf(process.platform === 'win32')(
  'a dev bot and a production bot with one token',
  () => {
    it('never answer the same thing', async () => {
      const fake = await world();
      const cwd = project({
        'src/events/messageCreate/log.ts': `import { event } from 'chapterjs';
export default event({ name: 'messageCreate', where: 'both', run: ({ message }) => console.log('said: ' + message.content) });
`,
      });
      const production = runStart(cwd, fake);
      await production.waitFor('✓ 1 event loaded');
      const dev = (await import('./dev-helpers.js')).runDev(cwd, fake);
      await dev.waitFor('✓ 1 event loaded');
      const {
        guild_id: _guild,
        member: _member,
        ...privateMessage
      } = rawMessage('100000000000000060', 'in private', {
        channel_id: '100000000000000061',
      });
      fake.discord.on('GET', '/channels/100000000000000990', {
        body: {
          id: '100000000000000990',
          type: 0,
          name: 'general',
          guild_id: OTHER_GUILD,
        },
      });
      // Discord sends everything to both: each keeps what is its own.
      for (const index of [0, 1]) {
        const connection = await connected(fake, index);
        connection.dispatch(
          'MESSAGE_CREATE',
          rawMessage('100000000000000062', 'in dev')
        );
        connection.dispatch(
          'MESSAGE_CREATE',
          rawMessage('100000000000000063', 'elsewhere', {
            guild_id: OTHER_GUILD,
            channel_id: '100000000000000990',
          })
        );
        connection.dispatch('MESSAGE_CREATE', privateMessage);
      }
      await dev.waitFor('said: in dev');
      await production.waitFor('said: in private');
      await production.waitFor('said: elsewhere');
      await new Promise(resolve => setTimeout(resolve, 150));
      const said = (output: string) =>
        output
          .split('\n')
          .filter(line => line.startsWith('said: '))
          .sort();
      expect(said(dev.output)).toEqual(['said: in dev']);
      expect(said(production.output)).toEqual([
        'said: elsewhere',
        'said: in private',
      ]);
      expect(runProduction).toBeDefined();
    }, 30_000);
  }
);

describe.skipIf(process.platform === 'win32')('a cluster that stops', () => {
  it('asks each process to stop once, and does not fall when one is already gone', async () => {
    // The first process stops at once, the second takes a moment: the
    // first one leaving must not ask the second again.
    const script = join(tempDir(), 'worker.mjs');
    writeFileSync(
      script,
      `const { index } = JSON.parse(process.env.CHAPTERJS_PROCESS);
process.on('message', message => {
  if (message.type !== 'stop') return;
  console.log('stop');
  setTimeout(() => process.exit(0), index === 0 ? 0 : 300);
});
process.send({ type: 'ready', guilds: 1, user: 'bot' });
`
    );
    const lines: string[] = [];
    const controller = new AbortController();
    const running = runCluster({
      script,
      args: [],
      env: { PATH: process.env.PATH },
      stores: new FileStoreBackend(join(tempDir(), 'data')),
      shards: 2,
      processes: 2,
      maxConcurrency: 1,
      signal: controller.signal,
      write: line => lines.push(line),
      onReady: () => controller.abort(),
      onRestart: () => {},
    });
    expect(await running).toBe(0);
    expect(lines.sort()).toEqual(['[1] stop', '[2] stop']);
  });
});
