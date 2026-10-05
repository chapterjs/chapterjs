import { fakeDiscord, startCli } from '@chapterjs/test-utils';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLog } from '../src/cli/log.js';
import {
  ensureInDevGuild,
  ensurePrivilegedIntents,
  inviteUrl,
  missingPrivilegedIntents,
  PreflightFailure,
  type PreflightOptions,
} from '../src/cli/preflight.js';
import { GatewayIntent } from '../src/discord/intents.js';
import { EVENT_NAMES } from '../src/events/registry.js';
import { RestClient } from '../src/rest/rest.js';
import {
  ALICE,
  ALL_PRIVILEGED,
  bin,
  BOT,
  connected,
  GENERAL,
  GUILD,
  packageDir,
  project,
  rawGuild,
  rawMessage,
  runDev,
  world,
} from './dev-helpers.js';

const PING = `import { event } from 'chapterjs';

export default event(async ({ message }) => {
  if (message.content === '!ping') await message.reply('pong');
});
`;

const posted = (fake: Awaited<ReturnType<typeof world>>) =>
  fake.discord
    .requestsTo('POST', `/channels/${GENERAL}/messages`)
    .map(request => (request.body as { content: string }).content);

/** Waits until the bot has answered `count` messages. */
async function replies(fake: Awaited<ReturnType<typeof world>>, count: number) {
  const deadline = Date.now() + 5000;
  while (posted(fake).length < count) {
    if (Date.now() > deadline) {
      throw new Error(
        `Expected ${count} replies, got ${JSON.stringify(posted(fake))}`
      );
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return posted(fake);
}

describe.skipIf(process.platform === 'win32')('chapterjs dev', () => {
  it('connects, runs the events of the project and stops cleanly', async () => {
    const fake = await world();
    fake.discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000080', 'pong'),
    });
    const cwd = project({
      'src/events/messageCreate/ping.ts': PING,
      'src/events/ready/hello.ts': `import { event } from 'chapterjs';
export default event(({ user, guilds }) => {
  console.log(\`hello from \${user.username} in \${[...guilds.values()].map(guild => guild.name).join('+')}\`);
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ Connected to Dev Server as test-bot');
    await cli.waitFor(
      'ℹ Intents computed from your files: GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT'
    );
    await cli.waitFor('✓ 2 events loaded');
    // The dev bot only knows its dev server.
    await cli.waitFor('hello from test-bot in Dev Server');

    const connection = await connected(fake);
    const identify = connection.received.find(payload => payload.op === 2)!
      .d as { intents: number; token: string };
    expect(identify.token).toBe('test-token');
    expect(identify.intents).toBe(
      GatewayIntent.Guilds |
        GatewayIntent.GuildMessages |
        GatewayIntent.DirectMessages |
        GatewayIntent.MessageContent
    );

    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000070', 'hi')
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000071', '!ping')
    );
    expect(await replies(fake, 1)).toEqual(['pong']);
    const [request] = fake.discord.requestsTo(
      'POST',
      `/channels/${GENERAL}/messages`
    );
    expect(request!.body).toEqual({
      content: 'pong',
      message_reference: { message_id: '100000000000000071' },
    });
    expect(request!.headers.authorization).toBe('Bot test-token');

    cli.signal('SIGTERM');
    const { code, output } = await cli.exited;
    expect(code).toBe(0);
    expect(output).toContain('✓ Disconnected');
    // The session was ended: no ghost bot stays online.
    expect(await connection.waitForClose()).toBe(1000);
  });

  it('ignores what happens in other servers', async () => {
    const fake = await world();
    fake.discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000080', 'pong'),
    });
    const cli = runDev(
      project({ 'src/events/messageCreate/ping.ts': PING }),
      fake
    );
    await cli.waitFor('✓ Connected');
    const connection = await connected(fake);
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000070', '!ping', {
        guild_id: '100000000000000900',
      })
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000071', '!ping')
    );
    expect(await replies(fake, 1)).toEqual(['pong']);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(posted(fake)).toHaveLength(1);
    expect(
      (
        fake.discord.requests.at(-1)!.body as {
          message_reference: { message_id: string };
        }
      ).message_reference.message_id
    ).toBe('100000000000000071');
  });

  it('reloads a file when it is saved, and the files it imports', async () => {
    const fake = await world();
    fake.discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000080', 'x'),
    });
    const cwd = project({
      'src/lib/answer.ts': `export const answer: string = 'pong';\n`,
      'src/events/messageCreate/ping.ts': `import { event } from 'chapterjs';
import { answer } from '../../lib/answer';
export default event(async ({ message }) => {
  if (message.content === '!ping') await message.reply(answer);
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 1 event loaded');
    const connection = await connected(fake);
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000070', '!ping')
    );
    expect(await replies(fake, 1)).toEqual(['pong']);

    // A helper file changes: the event that imports it follows.
    writeFileSync(
      join(cwd, 'src/lib/answer.ts'),
      `export const answer: string = 'PONG!';\n`
    );
    await cli.waitFor(/↻ Reloaded in \d+ ms, 1 event loaded/);
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000071', '!ping')
    );
    expect(await replies(fake, 2)).toEqual(['pong', 'PONG!']);

    // A new file is picked up, a deleted one stops running.
    writeFileSync(
      join(cwd, 'src/events/messageCreate/echo.ts'),
      `import { event } from 'chapterjs';
export default event(async ({ message }) => {
  if (message.content.startsWith('!echo ')) await message.reply(message.content.slice(6));
});
`
    );
    await cli.waitFor(/↻ Reloaded in \d+ ms, 2 events loaded/);
    rmSync(join(cwd, 'src/events/messageCreate/ping.ts'));
    await cli.waitFor(/↻ Reloaded in \d+ ms, 1 event loaded/);
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000072', '!ping')
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000073', '!echo hey')
    );
    expect(await replies(fake, 3)).toEqual(['pong', 'PONG!', 'hey']);
    // Still the same connection: reloading never reconnects for nothing.
    expect(fake.gateway.connections).toHaveLength(1);
  });

  it('keeps the last working version of a file that breaks', async () => {
    const fake = await world();
    fake.discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000080', 'x'),
    });
    const cwd = project({ 'src/events/messageCreate/ping.ts': PING });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 1 event loaded');
    const connection = await connected(fake);

    writeFileSync(
      join(cwd, 'src/events/messageCreate/ping.ts'),
      `import { event } from 'chapterjs';\n\nexport default event(async ({ message }) => {\n  await message.reply(;\n};\n`
    );
    await cli.waitFor(/✗ src\/events\/messageCreate\/ping\.ts:4 .+/);
    await cli.waitFor(
      '⚠ Reloaded with an error: that file keeps running its last working version'
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000070', '!ping')
    );
    expect(await replies(fake, 1)).toEqual(['pong']);

    // Fixed: the new version takes over.
    writeFileSync(
      join(cwd, 'src/events/messageCreate/ping.ts'),
      PING.replace("'pong'", "'fixed'")
    );
    await cli.waitFor(/↻ Reloaded in \d+ ms, 1 event loaded/);
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000071', '!ping')
    );
    expect(await replies(fake, 2)).toEqual(['pong', 'fixed']);
  });

  it('reports a handler that throws with its file and line, and goes on', async () => {
    const fake = await world();
    fake.discord.on('POST', `/channels/${GENERAL}/messages`, {
      body: rawMessage('100000000000000080', 'x'),
    });
    const cwd = project({
      'src/events/messageCreate/ping.ts': PING,
      'src/events/messageCreate/crash.ts': `import { event } from 'chapterjs';

export default event(({ message }) => {
  if (message.content === '!crash') {
    throw new Error('this handler is broken');
  }
});
`,
      'src/events/messageCreate/refused.ts': `import { event } from 'chapterjs';
export default event(async ({ message }) => {
  if (message.content === '!pin') await message.pin();
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 3 events loaded');
    const connection = await connected(fake);
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000070', '!crash')
    );
    await cli.waitFor(
      '✗ src/events/messageCreate/crash.ts:5 this handler is broken'
    );
    // Discord refusing an action is reported the same way.
    fake.discord.on(
      'PUT',
      `/channels/${GENERAL}/messages/pins/100000000000000071`,
      {
        status: 403,
        body: { code: 50013, message: 'Missing Permissions' },
      }
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000071', '!pin')
    );
    await cli.waitFor(
      /✗ src\/events\/messageCreate\/refused\.ts:3 Discord refused PUT .+ Missing Permissions \(50013\)/
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000072', '!ping')
    );
    expect(await replies(fake, 1)).toEqual(['pong']);
  });

  it.each([
    [
      'a file that exports nothing',
      'src/events/messageCreate/bad.ts',
      `export const nope = 1;\n`,
      /✗ src\/events\/messageCreate\/bad\.ts This file has no default export\. It should look like: import \{ event \} from 'chapterjs'; export default event\(/,
    ],
    [
      'a file whose default export is not a function',
      'src/events/ready/bad.ts',
      `export default { run() {} };\n`,
      /✗ src\/events\/ready\/bad\.ts The default export of this file must be what event\(\) returns: import \{ event \}/,
    ],
    [
      'a file that exports its function without event()',
      'src/events/ready/bad.ts',
      `export default () => {};\n`,
      /✗ src\/events\/ready\/bad\.ts The default export of this file must be what event\(\) returns/,
    ],
    [
      'a file that gives event() something that is not a function',
      'src/events/ready/bad.ts',
      `import { event } from 'chapterjs';\n\nexport default event('nope' as never);\n`,
      /✗ src\/events\/ready\/bad\.ts:3 event\(\) needs the function to run when the event happens/,
    ],
    [
      'a folder that is not an event',
      'src/events/memberjoin/bad.ts',
      `console.log('this file ran');\nexport default () => {};\n`,
      /✗ src\/events\/memberjoin\/bad\.ts The folder src\/events\/memberjoin is not named after an event\. Did you mean "memberJoin"\? Events are: ready, messageCreate/,
    ],
    [
      'a file that is not in an event folder',
      'src/events/bad.ts',
      `console.log('this file ran');\nexport default () => {};\n`,
      /✗ src\/events\/bad\.ts This file is directly in src\/events\/\. Put it in a folder named after the event it reacts to, like src\/events\/messageCreate\/bad\.ts/,
    ],
    [
      'a file that crashes while loading',
      'src/events/ready/bad.ts',
      `const config: { name: string } | undefined = undefined;\nexport default config!.name;\n`,
      /✗ src\/events\/ready\/bad\.ts:2 Cannot read properties of undefined/,
    ],
  ])(
    'says what is wrong with %s, and starts anyway',
    async (_name, path, content, message) => {
      const fake = await world();
      const cli = runDev(
        project({ [path]: content, 'src/events/messageCreate/ping.ts': PING }),
        fake
      );
      await cli.waitFor(message);
      await cli.waitFor('✓ 1 event loaded');
      // A misplaced file is never run.
      expect(cli.output).not.toContain('this file ran');
    }
  );

  it('starts with no event at all, only asking Discord for the minimum', async () => {
    const fake = await world({ flags: 0 });
    const cli = runDev(project({ 'src/commands/.gitkeep': '' }), fake);
    await cli.waitFor('ℹ Intents computed from your files: GUILDS');
    await cli.waitFor(
      'ℹ No events yet: add a file in a folder like src/events/messageCreate/'
    );
    const connection = await connected(fake);
    expect(
      (
        connection.received.find(payload => payload.op === 2)!.d as {
          intents: number;
        }
      ).intents
    ).toBe(1);
  });

  it('reconnects when a new file needs more from Discord', async () => {
    const fake = await world();
    const cwd = project({ 'src/events/messageCreate/ping.ts': PING });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 1 event loaded');
    const first = await connected(fake);

    mkdirSync(join(cwd, 'src/events/memberJoin'));
    writeFileSync(
      join(cwd, 'src/events/memberJoin/welcome.ts'),
      `import { event } from 'chapterjs';
export default event(({ member, guild }) => {
  console.log(\`welcome \${member.displayName} to \${guild.name}\`);
});
`
    );
    await cli.waitFor(
      '↻ Your files now need more from Discord (GUILD_MEMBERS): reconnecting...'
    );
    await cli.waitFor('✓ Reconnected, 2 events loaded');
    expect(await first.waitForClose()).toBe(1000);
    const second = await connected(fake, 1);
    const identify = second.received.find(payload => payload.op === 2)!.d as {
      intents: number;
    };
    expect(identify.intents & GatewayIntent.GuildMembers).toBe(
      GatewayIntent.GuildMembers
    );

    second.dispatch('GUILD_MEMBER_ADD', {
      guild_id: GUILD,
      user: {
        id: ALICE,
        username: 'alice',
        discriminator: '0',
        global_name: 'Alice',
      },
      roles: [],
      joined_at: '2024-01-01T00:00:00Z',
      deaf: false,
      mute: false,
      flags: 0,
    });
    await cli.waitFor('welcome Alice to Dev Server');
  });

  it('delivers what was removed with the events that remove it', async () => {
    const fake = await world();
    const cwd = project({
      'src/events/memberLeave/left.ts': `import { event } from 'chapterjs';
export default event(({ user, member, guild }) => {
  console.log(\`left: \${user.username} nick=\${member?.nick} count=\${guild.memberCount}\`);
});
`,
      'src/events/roleDelete/role.ts': `import { event } from 'chapterjs';
export default event(({ role, roleId }) => {
  console.log(\`role deleted: \${role?.name} \${roleId}\`);
});
`,
      'src/events/guildJoin/guild.ts': `import { event } from 'chapterjs';
export default event(({ guild }) => {
  console.log(\`joined: \${guild.name}\`);
});
`,
      'src/events/roleCreate/frozen.ts': `import { event } from 'chapterjs';
export default event((context) => {
  (context as { role: unknown }).role = null;
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 4 events loaded');
    const connection = await connected(fake);
    const member = {
      user: { id: ALICE, username: 'alice', discriminator: '0' },
      roles: [],
      nick: 'Ali',
      joined_at: null,
      deaf: false,
      mute: false,
      flags: 0,
    };
    connection.dispatch('GUILD_MEMBER_ADD', { guild_id: GUILD, ...member });
    connection.dispatch('GUILD_MEMBER_REMOVE', {
      guild_id: GUILD,
      user: member.user,
    });
    await cli.waitFor('left: alice nick=Ali count=2');
    connection.dispatch('GUILD_ROLE_CREATE', {
      guild_id: GUILD,
      role: {
        id: '100000000000000010',
        name: 'Mod',
        permissions: '0',
        position: 1,
      },
    });
    // What a handler receives can't be changed for the others.
    await cli.waitFor(
      /✗ src\/events\/roleCreate\/frozen\.ts:3 Cannot assign to read only property 'role'/
    );
    connection.dispatch('GUILD_ROLE_DELETE', {
      guild_id: GUILD,
      role_id: '100000000000000010',
    });
    await cli.waitFor('role deleted: Mod 100000000000000010');
    // The dev server sending its data again is not the bot joining it.
    connection.dispatch('GUILD_CREATE', rawGuild());
    connection.dispatch('GUILD_ROLE_DELETE', {
      guild_id: GUILD,
      role_id: '100000000000000099',
    });
    await cli.waitFor('role deleted: undefined 100000000000000099');
    expect(cli.output).not.toContain('joined:');
  });

  it('tells when the connection is lost and when it is back', async () => {
    const fake = await world();
    const cli = runDev(
      project({ 'src/events/messageCreate/ping.ts': PING }),
      fake
    );
    await cli.waitFor('✓ Connected');
    (await connected(fake)).drop();
    await cli.waitFor('⚠ Connection to Discord lost, reconnecting...');
    await cli.waitFor('↻ Reconnected to Discord');
  });

  it('stops when Discord refuses the bot for good', async () => {
    const fake = await world();
    const cli = runDev(
      project({ 'src/events/messageCreate/ping.ts': PING }),
      fake
    );
    await cli.waitFor('✓ Connected');
    (await connected(fake)).close(4004);
    const { code, output } = await cli.exited;
    expect(code).toBe(1);
    expect(output).toMatch(
      /✗ Discord refused the bot token\. Copy it again .+ BOT_TOKEN in your \.env file/
    );
  });
});

describe.skipIf(process.platform === 'win32')(
  'chapterjs dev, before connecting',
  () => {
    const failing = async (
      cwd: string,
      fake: Awaited<ReturnType<typeof world>>
    ) => {
      const result = await runDev(cwd, fake).exited;
      expect(result.code).toBe(1);
      // Nothing was tried on the gateway.
      expect(fake.gateway.connections).toHaveLength(0);
      return result.output;
    };
    const files = { 'src/events/messageCreate/ping.ts': PING };

    it.each([
      [
        null,
        /✗ There is no \.env file in this folder\.\n  Copy \.env\.example to \.env, then fill in BOT_TOKEN and DEV_GUILD_ID\./,
      ],
      ['', /BOT_TOKEN is empty[\s\S]+DEV_GUILD_ID is empty/],
      [
        `BOT_TOKEN=\nDEV_GUILD_ID=${GUILD}\n`,
        /✗ \.env: BOT_TOKEN is empty\.\n  Copy the token of your bot from https:\/\/discord\.com\/developers\/applications/,
      ],
      [
        `BOT_TOKEN=your-token-here\nDEV_GUILD_ID=${GUILD}\n`,
        /BOT_TOKEN is still the example value/,
      ],
      [
        `BOT_TOKEN="abc def"\nDEV_GUILD_ID=${GUILD}\n`,
        /BOT_TOKEN contains a space/,
      ],
      [
        `BOT_TOKEN=abc\nDEV_GUILD_ID=\n`,
        /✗ \.env: DEV_GUILD_ID is empty\.\n  In Discord, right-click your test server → Copy Server ID/,
      ],
      [
        `BOT_TOKEN=abc\nDEV_GUILD_ID=My Server\n`,
        /DEV_GUILD_ID is "My Server", which is not a server ID/,
      ],
      [
        `BOT_TOKEN=abc\nDEV_GUILD_ID=123\n`,
        /DEV_GUILD_ID is "123", which is not a server ID/,
      ],
    ])('explains the .env %j', async (env, message) => {
      const fake = await world();
      const output = await failing(project(files, env), fake);
      expect(output).toMatch(message);
      // Nothing was asked to Discord with a token that can't be right.
      expect(fake.discord.requests).toHaveLength(0);
    });

    it('reads the real environment before the .env file', async () => {
      const fake = await world();
      const cli = startCli({
        bin,
        args: ['dev'],
        cwd: project(files, `BOT_TOKEN=from-file\nDEV_GUILD_ID=${GUILD}\n`),
        env: { ...fake.env, BOT_TOKEN: 'Bot from-env' },
      });
      await cli.waitFor('✓ Connected');
      expect(fake.discord.requests[0]!.headers.authorization).toBe(
        'Bot from-env'
      );
    });

    it('explains a folder that is not a project', async () => {
      const fake = await world();
      const output = await failing(project({}), fake);
      expect(output).toMatch(
        /✗ There is no src folder here\.\n  Run this command in the folder of your bot/
      );
    });

    it('explains a refused token', async () => {
      const fake = await world();
      fake.discord.on('GET', '/applications/@me', {
        status: 401,
        body: { code: 0, message: '401: Unauthorized' },
      });
      const output = await failing(project(files), fake);
      expect(output).toMatch(
        /✗ Discord refused the bot token\. Copy it again from the Developer Portal/
      );
      expect(output).not.toContain('test-token');
    });

    it('explains that Discord cannot be reached', async () => {
      const fake = await world();
      const cli = startCli({
        bin,
        args: ['dev'],
        cwd: project(files),
        env: { CHAPTERJS_API_URL: 'http://127.0.0.1:1' },
        timeout: 20_000,
      });
      const { code, output } = await cli.exited;
      expect(code).toBe(1);
      expect(output).toMatch(
        /✗ Discord could not be reached .+ Check your internet connection/
      );
      expect(fake.gateway.connections).toHaveLength(0);
    });

    it('gives the link to add the bot to the dev server', async () => {
      const fake = await world({ inGuild: false });
      const output = await failing(project(files), fake);
      expect(output).toContain(
        `✗ Your bot is not in your dev server yet (DEV_GUILD_ID=${GUILD}).`
      );
      expect(output).toContain(
        `https://discord.com/oauth2/authorize?client_id=${BOT}&scope=bot+applications.commands&permissions=8&guild_id=${GUILD}&disable_guild_select=true`
      );
    });

    it('lists the files that need an option the bot does not have', async () => {
      const fake = await world({ flags: 1 << 19 });
      const output = await failing(
        project({
          ...files,
          'src/events/memberJoin/welcome.ts': `import { event } from 'chapterjs';\nexport default event(() => {});\n`,
          'src/events/memberLeave/bye.ts': `import { event } from 'chapterjs';\nexport default event(() => {});\n`,
        }),
        fake
      );
      expect(output).toContain(
        '✗ Your files need an option that is not enabled for your bot:\n  - Server Members Intent, needed by src/events/memberJoin/welcome.ts, src/events/memberLeave/bye.ts\n  Enable it under "Privileged Gateway Intents", then save:\n  https://discord.com/developers/applications/100000000000000002/bot'
      );
      // Message Content is enabled: not mentioned.
      expect(output).not.toContain('Message Content Intent');
    });

    it.each([
      [
        ['start'],
        /✗ "chapterjs start" is not available yet in this version\.\n  Use "chapterjs dev"/,
        1,
      ],
      [['build'], /"chapterjs build" is not available yet/, 1],
      [
        ['deploy'],
        /✗ "deploy" is not a command\.\n  Usage: chapterjs <command>/,
        1,
      ],
      [[], /^Usage: chapterjs <command>\n\nCommands:\n  dev /, 0],
      [['--help'], /^Usage: chapterjs <command>/, 0],
      [['--version'], /^\d+\.\d+\.\d+\n$/, 0],
    ])('answers "chapterjs %s"', async (args, message, code) => {
      const fake = await world();
      const result = await runDev(project(files), fake, args).exited;
      expect(result.output).toMatch(message);
      expect(result.code).toBe(code);
      expect(fake.discord.requests).toHaveLength(0);
    });
  }
);

describe('waiting for a fix when someone is there', () => {
  async function setup() {
    const discord = await fakeDiscord();
    const lines: string[] = [];
    const controller = new AbortController();
    const options: PreflightOptions = {
      rest: new RestClient({ token: 't', version: '1', baseUrl: discord.url }),
      log: createLog(line => lines.push(line), false),
      interactive: true,
      pollInterval: 20,
      signal: controller.signal,
    };
    return { discord, lines, options, controller };
  }
  const unknownGuild = {
    status: 404,
    body: { code: 10004, message: 'Unknown Guild' },
  };

  it('goes on as soon as the bot is added to the server', async () => {
    const { discord, lines, options } = await setup();
    discord.on(
      'GET',
      `/guilds/${GUILD}`,
      unknownGuild,
      unknownGuild,
      { status: 403, body: { code: 50001 } },
      { body: { id: GUILD, name: 'Dev Server' } }
    );
    const guild = await ensureInDevGuild(options, BOT, GUILD);
    expect(guild.name).toBe('Dev Server');
    expect(discord.requests).toHaveLength(4);
    expect(lines[0]).toMatch(
      /^⚠ Your bot is not in your dev server yet[\s\S]+Waiting for the bot to be added\.\.\.$/
    );
    expect(lines[0]).toContain(inviteUrl(BOT, GUILD));
    expect(lines[1]).toBe('✓ The bot joined Dev Server');
  });

  it('says nothing when the bot is already there', async () => {
    const { discord, lines, options } = await setup();
    discord.on('GET', `/guilds/${GUILD}`, {
      body: { id: GUILD, name: 'Dev Server' },
    });
    await ensureInDevGuild(options, BOT, GUILD);
    expect(lines).toEqual([]);
  });

  it('does not take another problem for "not in the server"', async () => {
    const { discord, options } = await setup();
    discord.on('GET', `/guilds/${GUILD}`, {
      status: 400,
      body: { code: 50035, message: 'Invalid Form Body' },
    });
    await expect(ensureInDevGuild(options, BOT, GUILD)).rejects.toThrow(
      /Invalid Form Body/
    );
  });

  it('stops waiting when the user gives up', async () => {
    const { discord, options, controller } = await setup();
    discord.on('GET', `/guilds/${GUILD}`, unknownGuild);
    const waiting = ensureInDevGuild(options, BOT, GUILD);
    setTimeout(() => controller.abort(), 60);
    await expect(waiting).rejects.toThrow();
  });

  it('fails at once when nobody is there', async () => {
    const { discord, lines, options } = await setup();
    discord.on('GET', `/guilds/${GUILD}`, unknownGuild);
    await expect(
      ensureInDevGuild({ ...options, interactive: false }, BOT, GUILD)
    ).rejects.toThrow(PreflightFailure);
    expect(lines[0]).toMatch(/^✗ Your bot is not in your dev server yet/);
    expect(discord.requests).toHaveLength(1);
  });

  it('goes on as soon as the privileged intents are enabled', async () => {
    const { discord, lines, options } = await setup();
    discord.on(
      'GET',
      '/applications/@me',
      { body: { id: BOT, flags: 0 } },
      { body: { id: BOT, flags: 1 << 19 } },
      { body: { id: BOT, flags: (1 << 19) | (1 << 14) } }
    );
    const intents =
      GatewayIntent.Guilds |
      GatewayIntent.GuildMembers |
      GatewayIntent.MessageContent;
    await ensurePrivilegedIntents(
      options,
      { id: BOT, flags: 0 } as never,
      intents,
      intent =>
        intent === 'GuildMembers'
          ? ['src/events/a.ts']
          : ['src/events/b.ts', 'src/events/c.ts']
    );
    expect(discord.requests).toHaveLength(3);
    expect(lines[0]).toBe(
      '⚠ Your files need options that are not enabled for your bot:\n  - Server Members Intent, needed by src/events/a.ts\n  - Message Content Intent, needed by src/events/b.ts, src/events/c.ts\n  Enable them under "Privileged Gateway Intents", then save:\n  https://discord.com/developers/applications/100000000000000002/bot\n  Waiting for you to enable them...'
    );
    expect(lines[1]).toBe('✓ Privileged intents enabled');
  });

  it.each([
    [GatewayIntent.Guilds | GatewayIntent.GuildMessages, 0, []],
    [GatewayIntent.GuildMembers, 0, ['GuildMembers']],
    [GatewayIntent.GuildMembers, 1 << 14, []],
    [GatewayIntent.GuildMembers, 1 << 15, []],
    [
      GatewayIntent.GuildPresences | GatewayIntent.MessageContent,
      1 << 12,
      ['MessageContent'],
    ],
    [
      GatewayIntent.GuildPresences | GatewayIntent.MessageContent,
      ALL_PRIVILEGED,
      [],
    ],
    [GatewayIntent.MessageContent, undefined, ['MessageContent']],
  ])(
    'intents %s with application flags %s lack %j',
    (intents, flags, expected) => {
      expect(missingPrivilegedIntents(intents, { flags })).toEqual(expected);
    }
  );
});

describe.skipIf(process.platform === 'win32')('the token of the .env', () => {
  const files = { 'src/events/messageCreate/ping.ts': PING };

  it.each([
    'MyNDk4.GhT5Kw.abc',
    'yourABC.def.ghi',
    'TOKENabc.def.ghi',
    'xxxyz.a.b',
  ])(
    'is not taken for an example value when it is the real token %s',
    async token => {
      const fake = await world();
      const cli = runDev(
        project(files, `BOT_TOKEN=${token}\nDEV_GUILD_ID=${GUILD}\n`),
        fake
      );
      await cli.waitFor('✓ Connected');
      expect(fake.discord.requests[0]!.headers.authorization).toBe(
        `Bot ${token}`
      );
    }
  );

  it.each([
    '<token>',
    'YOUR_BOT_TOKEN',
    'your-token',
    'xxxx',
    'changeme',
    '...',
  ])('is refused when it is the example value %s', async token => {
    const fake = await world();
    const { code, output } = await runDev(
      project(files, `BOT_TOKEN=${token}\nDEV_GUILD_ID=${GUILD}\n`),
      fake
    ).exited;
    expect(code).toBe(1);
    expect(output).toContain('BOT_TOKEN is still the example value');
    expect(fake.discord.requests).toHaveLength(0);
  });
});

describe.skipIf(process.platform === 'win32')(
  'the templates of the scaffolder',
  () => {
    const templates = join(packageDir, '../create-chapter/templates');

    it.each(readdirSync(templates))(
      '%s type-checks and runs without error',
      async name => {
        const cwd = project({});
        cpSync(join(templates, name, 'src'), join(cwd, 'src'), {
          recursive: true,
        });
        cpSync(
          join(templates, name, 'tsconfig.json'),
          join(cwd, 'tsconfig.json')
        );
        symlinkSync(
          join(packageDir, 'node_modules/@types'),
          join(cwd, 'node_modules/@types'),
          'dir'
        );
        // What installing does (the postinstall script of the template).
        execFileSync(process.execPath, [bin, 'sync'], { cwd, stdio: 'pipe' });
        // Type-checked against the package as a project would see it.
        execFileSync(join(packageDir, 'node_modules/.bin/tsc'), ['-b'], {
          cwd,
          stdio: 'pipe',
        });

        // Only non-privileged intents: a template must run on a brand new bot.
        const fake = await world({ flags: 0 });
        const cli = runDev(cwd, fake);
        await cli.waitFor('✓ Connected to Dev Server as test-bot');
        await cli.waitFor('test-bot is online in 1 server(s)');
        cli.signal('SIGINT');
        const { code, output } = await cli.exited;
        expect(code).toBe(0);
        expect(output).not.toMatch(/[✗⚠]/);
      }
    );
  }
);

describe.skipIf(process.platform === 'win32')('the generated folder', () => {
  const read = (cwd: string, path: string) =>
    readFileSync(join(cwd, '.chapterjs', path), 'utf8');

  it('is written by sync: one project per event, and it ignores itself in git', async () => {
    const fake = await world();
    const cwd = project({});
    const { code, output } = await runDev(cwd, fake, ['sync']).exited;
    expect(code).toBe(0);
    expect(output).toBe('✓ Types written to .chapterjs/\n');

    expect(read(cwd, 'types/events.memberJoin.d.ts')).toBe(
      "// Written by ChapterJS: do not edit, it is overwritten.\nexport * from '../../node_modules/chapterjs/dist/index.js';\nimport type { EventContexts, EventFile } from '../../node_modules/chapterjs/dist/index.js';\n\n/**\n * Says what to do when `memberJoin` happens. Export the result as the default\n * export of a file of src/events/memberJoin/.\n */\nexport declare function event(\n  handler: (context: EventContexts['memberJoin']) => unknown\n): EventFile;\n"
    );
    expect(JSON.parse(read(cwd, 'projects/events.memberJoin.json'))).toEqual({
      extends: '../../tsconfig.json',
      compilerOptions: {
        paths: { chapterjs: ['../types/events.memberJoin.d.ts'] },
      },
      include: [
        '../../src/events/memberJoin',
        '../types/events.memberJoin.d.ts',
      ],
    });
    const main = JSON.parse(read(cwd, 'projects/main.json'));
    expect(main.include).toEqual(['../../src']);
    expect(main.exclude.sort()).toEqual(
      EVENT_NAMES.map(name => `../../src/events/${name}`).sort()
    );
    expect(JSON.parse(read(cwd, 'tsconfig.json'))).toEqual({
      files: [],
      references: [
        { path: './projects/main.json' },
        ...EVENT_NAMES.map(name => ({
          path: `./projects/events.${name}.json`,
        })),
      ],
    });
    expect(readdirSync(join(cwd, '.chapterjs/types')).sort()).toEqual(
      EVENT_NAMES.map(name => `events.${name}.d.ts`).sort()
    );
    expect(read(cwd, '.gitignore')).toBe('*\n');
    // Nothing was asked to Discord, and no .env is needed.
    expect(fake.discord.requests).toHaveLength(0);
  });

  it('is written by dev, left alone when nothing changed, and cleaned of old files', async () => {
    const fake = await world();
    const cwd = project({ 'src/events/messageCreate/ping.ts': PING });
    const first = runDev(cwd, fake);
    await first.waitFor('✓ Connected');
    const file = join(cwd, '.chapterjs/types/events.ready.d.ts');
    const before = statSync(file).mtimeMs;
    first.signal('SIGTERM');
    await first.exited;
    await new Promise(resolve => setTimeout(resolve, 20));
    await runDev(cwd, fake, ['sync']).exited;
    expect(statSync(file).mtimeMs).toBe(before);

    // A file someone changed by hand is put back, what an older version
    // wrote is removed, and what TypeScript keeps there is left alone.
    writeFileSync(file, 'export {};\n');
    const stale = join(cwd, '.chapterjs/types/src/events/ready/$types.d.ts');
    mkdirSync(join(stale, '..'), { recursive: true });
    writeFileSync(stale, 'export type Event = never;\n');
    const buildInfo = join(cwd, '.chapterjs/projects/main.tsbuildinfo');
    writeFileSync(buildInfo, '{}');
    await runDev(cwd, fake, ['sync']).exited;
    expect(readFileSync(file, 'utf8')).toContain("EventContexts['ready']");
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(buildInfo)).toBe(true);
  });

  it('underlines a mistake in a file before the bot runs', async () => {
    const fake = await world();
    const cwd = project({
      'src/lib/names.ts': `import type { GuildMember } from 'chapterjs';
export const nameOf = (member: GuildMember): string => member.displayName;
`,
      'src/events/memberJoin/ok.ts': `import { event } from 'chapterjs';
import { nameOf } from '../../lib/names';
export default event(async ({ member, guild }) => {
  await member.send(\`Welcome to \${guild.name}, \${nameOf(member)}\`);
});
`,
      'src/events/memberJoin/deep/ok.ts': `import { event, type Guild } from 'chapterjs';
export default event(({ guild }) => { const same: Guild = guild; return same; });
`,
      'src/events/messageCreate/wrong.ts': `import { event } from 'chapterjs';
export default event(({ member }) => member);
`,
      'src/events/roleDelete/wrong.ts': `import { event } from 'chapterjs';
export default event(({ role }) => role.name);
`,
      'src/lib/wrong.ts': `export const count: number = 'three';\n`,
    });
    cpSync(
      join(packageDir, '../create-chapter/templates/default/tsconfig.json'),
      join(cwd, 'tsconfig.json')
    );
    symlinkSync(
      join(packageDir, 'node_modules/@types'),
      join(cwd, 'node_modules/@types'),
      'dir'
    );
    await runDev(cwd, fake, ['sync']).exited;
    const result = spawnSync(
      join(packageDir, 'node_modules/.bin/tsc'),
      ['-b'],
      { cwd, encoding: 'utf8' }
    );
    const errors = result.stdout
      .split('\n')
      .filter(line => line.includes('error TS'))
      .sort();
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(
      /src\/events\/messageCreate\/wrong\.ts\(2,\d+\): error TS2339: Property 'member' does not exist/
    );
    expect(errors[1]).toMatch(
      /src\/events\/roleDelete\/wrong\.ts\(2,\d+\): error TS18047: 'role' is possibly 'null'/
    );
    // Files outside the event folders are checked too.
    expect(errors[2]).toMatch(/src\/lib\/wrong\.ts\(1,\d+\): error TS2322/);
    expect(result.status).not.toBe(0);
  });
});

describe.skipIf(process.platform === 'win32')(
  'messages of bots and webhooks',
  () => {
    const log = (
      label: string,
      options = ''
    ) => `import { event } from 'chapterjs';
export default event(({ message }) => {
  console.log(\`${label}: \${message.content}\`);
}${options});
`;

    it('only reach the files that asked for them', async () => {
      const fake = await world();
      const cli = runDev(
        project({
          'src/events/messageCreate/people.ts': log('people'),
          'src/events/messageCreate/everyone.ts': log(
            'everyone',
            ', { bots: true }'
          ),
          'src/events/messageCreate/explicit.ts': log(
            'explicit',
            ', { bots: false }'
          ),
          'src/events/messageUpdate/edits.ts': log('edit'),
          'src/events/messageUpdate/all-edits.ts': log(
            'any edit',
            ', { bots: true }'
          ),
        }),
        fake
      );
      await cli.waitFor('✓ 5 events loaded');
      const connection = await connected(fake);
      const bot = {
        id: '100000000000000555',
        username: 'other-bot',
        discriminator: '0',
        bot: true,
      };
      const self = {
        id: BOT,
        username: 'test-bot',
        discriminator: '0',
        bot: true,
      };
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000070', 'from a bot', { author: bot })
      );
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000071', 'from itself', { author: self })
      );
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000072', 'from a webhook', {
          webhook_id: '100000000000000777',
        })
      );
      connection.dispatch(
        'MESSAGE_UPDATE',
        rawMessage('100000000000000070', 'bot edit', { author: bot })
      );
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000073', 'from a person')
      );
      connection.dispatch(
        'MESSAGE_UPDATE',
        rawMessage('100000000000000073', 'person edit')
      );
      await cli.waitFor('any edit: person edit');
      await new Promise(resolve => setTimeout(resolve, 100));

      const lines = cli.output.split('\n');
      const seenBy = (label: string) =>
        lines
          .filter(line => line.startsWith(`${label}: `))
          .map(line => line.slice(label.length + 2));
      expect(seenBy('everyone')).toEqual([
        'from a bot',
        'from itself',
        'from a webhook',
        'from a person',
      ]);
      expect(seenBy('people')).toEqual(['from a person']);
      expect(seenBy('explicit')).toEqual(['from a person']);
      expect(seenBy('edit')).toEqual(['person edit']);
      expect(seenBy('any edit')).toEqual(['bot edit', 'person edit']);
    });

    it.each([
      [
        'messageCreate',
        '{ bot: true }',
        /✗ src\/events\/messageCreate\/bad\.ts "bot" is not an option of messageCreate\. Options of messageCreate are: bots\./,
      ],
      [
        'messageCreate',
        "{ bots: 'yes' }",
        /✗ src\/events\/messageCreate\/bad\.ts The option bots of messageCreate is true or false, got "yes"\./,
      ],
      [
        'messageUpdate',
        "'bots'",
        /✗ src\/events\/messageUpdate\/bad\.ts The second argument of event\(\) is its options, like \{ bots: true \}\. Options of messageUpdate are: bots\./,
      ],
      [
        'messageCreate',
        'null',
        /The second argument of event\(\) is its options/,
      ],
      [
        'ready',
        '{ bots: true }',
        /✗ src\/events\/ready\/bad\.ts "bots" is not an option of ready\. ready has no options: remove the second argument of event\(\)\./,
      ],
      ['memberJoin', '{}', null],
    ])(
      'checks the options of %s given as %s',
      async (folder, options, message) => {
        const fake = await world();
        const cli = runDev(
          project({
            [`src/events/${folder}/bad.ts`]: `import { event } from 'chapterjs';\nexport default event(() => {}, ${options} as never);\n`,
          }),
          fake
        );
        if (message) {
          await cli.waitFor(message);
          await cli.waitFor('ℹ No events yet');
        } else {
          // An empty object asks for nothing: accepted everywhere.
          await cli.waitFor('✓ 1 event loaded');
        }
      }
    );

    it('are typed: the option only exists where it means something', async () => {
      const fake = await world();
      const cwd = project({
        'src/events/messageCreate/ok.ts': `import { event } from 'chapterjs';
export default event(({ message }) => message.id, { bots: true });
`,
        'src/events/messageUpdate/typo.ts': `import { event } from 'chapterjs';
export default event(({ message }) => message.id, { bot: true });
`,
        'src/events/memberJoin/none.ts': `import { event } from 'chapterjs';
export default event(({ member }) => member.id, { bots: true });
`,
      });
      cpSync(
        join(packageDir, '../create-chapter/templates/default/tsconfig.json'),
        join(cwd, 'tsconfig.json')
      );
      symlinkSync(
        join(packageDir, 'node_modules/@types'),
        join(cwd, 'node_modules/@types'),
        'dir'
      );
      await runDev(cwd, fake, ['sync']).exited;
      expect(
        readFileSync(
          join(cwd, '.chapterjs/types/events.messageCreate.d.ts'),
          'utf8'
        )
      ).toContain(
        "  handler: (context: EventContexts['messageCreate']) => unknown,\n  options?: EventOptions['messageCreate']\n): EventFile;"
      );
      const result = spawnSync(
        join(packageDir, 'node_modules/.bin/tsc'),
        ['-b'],
        { cwd, encoding: 'utf8' }
      );
      const errors = result.stdout
        .split('\n')
        .filter(line => line.includes('error TS'))
        .sort();
      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(
        /src\/events\/memberJoin\/none\.ts\(2,\d+\): error TS2554: Expected 1 arguments, but got 2/
      );
      expect(errors[1]).toMatch(
        /src\/events\/messageUpdate\/typo\.ts\(2,\d+\): error TS\d+: .*'bot'/
      );
    });
  }
);

describe.skipIf(process.platform === 'win32')('imports in a project', () => {
  it('work with or without an extension, and for a folder with an index', async () => {
    const fake = await world();
    const cwd = project({
      'src/lib/plain.ts': `export const plain: string = 'plain';\n`,
      'src/lib/explicit.ts': `export const explicit: string = 'explicit';\n`,
      'src/lib/tools/index.ts': `export { deep } from './deep';\n`,
      'src/lib/tools/deep.ts': `export const deep: string = 'deep';\n`,
      'src/events/ready/imports.ts': `import { event } from 'chapterjs';
import { plain } from '../../lib/plain';
import { explicit } from '../../lib/explicit.ts';
import { deep } from '../../lib/tools';
import { basename } from 'node:path';

export default event(() => {
  console.log(['imports', plain, explicit, deep, basename('/a/ok')].join(' '));
});
`,
      'src/events/ready/nested/with-extension.ts': `import { event } from 'chapterjs';
export default event(() => console.log('nested ran'));
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 2 events loaded');
    await cli.waitFor('imports plain explicit deep ok');
    await expect.poll(() => cli.output).toContain('nested ran');
    expect(cli.output).not.toContain('✗');

    // What the project type-checks is what runs.
    cpSync(
      join(packageDir, '../create-chapter/templates/default/tsconfig.json'),
      join(cwd, 'tsconfig.json')
    );
    symlinkSync(
      join(packageDir, 'node_modules/@types'),
      join(cwd, 'node_modules/@types'),
      'dir'
    );
    const result = spawnSync(
      join(packageDir, 'node_modules/.bin/tsc'),
      ['-b'],
      { cwd, encoding: 'utf8' }
    );
    expect(result.stdout).toBe('');
  });

  it('say which file is missing', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/events/ready/broken.ts': `import { event } from 'chapterjs';\nimport { nope } from '../../lib/nope';\nexport default event(() => nope);\n`,
      }),
      fake
    );
    await cli.waitFor(
      /✗ src\/events\/ready\/broken\.ts Cannot find module '.*\/src\/lib\/nope' imported from .*\/src\/events\/ready\/broken\.ts/
    );
    await cli.waitFor('ℹ No events yet');
  });
});
