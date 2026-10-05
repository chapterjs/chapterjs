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
  runProduction,
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
      'ℹ Intents computed from your files: GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT'
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
        fake.discord.requestsTo('POST', `/channels/${GENERAL}/messages`).at(-1)!
          .body as {
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
      'ℹ Nothing to run yet: add a file in src/commands/ or in a folder like src/events/messageCreate/'
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
  console.log(\`role deleted: \${role.name} \${roleId} of \${role.guild.name}\`);
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
    await cli.waitFor('role deleted: Mod 100000000000000010 of Dev Server');
    // The dev server sending its data again is not the bot joining it.
    connection.dispatch('GUILD_CREATE', rawGuild());
    connection.dispatch('GUILD_ROLE_DELETE', {
      guild_id: GUILD,
      role_id: '100000000000000099',
    });
    // A role the bot never knew can't be given "as it was": nothing runs.
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(cli.output).not.toContain('100000000000000099');
    expect(cli.output).not.toMatch(/✗ src\/events\/roleDelete/);
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
        ['start', '--processes'],
        /✗ chapterjs start takes one option: --processes followed by a number, like "chapterjs start --processes 4"\. Got "--processes"\./,
        1,
      ],
      [['start', '--processes', '0'], /takes one option: --processes/, 1],
      [['start', '--processes=two'], /Got "--processes=two"\./, 1],
      [['start', '--processes', '2', 'now'], /takes one option/, 1],
      [['start', '--fast'], /Got "--fast"\./, 1],
      [
        ['deploy'],
        /✗ "deploy" is not a command\.\n  Usage: chapterjs <command>/,
        1,
      ],
      [
        [],
        /^Usage: chapterjs <command>\n\nCommands:\n  dev .+\n  build .+\n  start .+\n  sync .+\n\nOptions of start:\n  --processes <n> /,
        0,
      ],
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
        '../../src/events/**/memberJoin',
        '../types/events.memberJoin.d.ts',
      ],
    });
    const main = JSON.parse(read(cwd, 'projects/main.json'));
    expect(main.include).toEqual(['../../src']);
    expect(main.exclude.sort()).toEqual(
      EVENT_NAMES.map(name => `../../src/events/**/${name}`).sort()
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
      'src/events/memberLeave/wrong.ts': `import { event } from 'chapterjs';
export default event(({ member }) => member.id);
`,
      // What can't be missing in a server is not nullable.
      'src/events/roleDelete/ok.ts': `import { event } from 'chapterjs';
export default event(({ role, guild }) => role.name + role.guild.name + guild.everyoneRole.id + guild.me.displayName);
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
      /src\/events\/memberLeave\/wrong\.ts\(2,\d+\): error TS18047: 'member' is possibly 'null'/
    );
    expect(errors[1]).toMatch(
      /src\/events\/messageCreate\/wrong\.ts\(2,\d+\): error TS2339: Property 'member' does not exist/
    );
    // Files outside the event folders are checked too.
    expect(errors[2]).toMatch(/src\/lib\/wrong\.ts\(1,\d+\): error TS2322/);
    expect(result.status).not.toBe(0);
  });
});

describe.skipIf(process.platform === 'win32')('private messages', () => {
  const PRIVATE = '100000000000000090';
  const log = (
    label: string,
    options = ''
  ) => `import { event } from 'chapterjs';
export default event(({ message }) => {
  console.log(\`${label}: \${message.content} in \${message.guild?.name ?? 'private'} by \${message.member?.displayName ?? 'no member'}\`);
}${options});
`;
  const gone = (
    label: string,
    options = ''
  ) => `import { event } from 'chapterjs';
export default event(({ messageId, guildId }) => {
  console.log(\`${label}: \${messageId} of \${guildId}\`);
}${options});
`;
  /** A message as Discord sends it in a private conversation. */
  const privateMessage = (id: string, content: string, extra = {}) => {
    const {
      guild_id: _guild,
      member: _member,
      ...rest
    } = rawMessage(id, content);
    return { ...rest, channel_id: PRIVATE, ...extra };
  };
  const seenBy = (output: string, label: string) =>
    output
      .split('\n')
      .filter(line => line.startsWith(`${label}: `))
      .map(line => line.slice(label.length + 2));

  it('only reach the files that asked for them, so the others always have a server', async () => {
    const fake = await world();
    const cli = runProduction(
      project({
        'src/events/messageCreate/servers.ts': log('servers'),
        'src/events/messageCreate/off.ts': log('off', ", { where: 'guild' }"),
        'src/events/messageCreate/all.ts': log('all', ", { where: 'both' }"),
        'src/events/messageCreate/only.ts': log('only', ", { where: 'dm' }"),
        'src/events/messageDelete/only.ts': gone(
          'only deleted',
          ", { where: 'dm' }"
        ),
        'src/events/messageCreate/bots.ts': log('bots', ', { bots: true }'),
        'src/events/messageCreate/any.ts': log(
          'any',
          ", { where: 'both', bots: true }"
        ),
        'src/events/messageUpdate/servers.ts': log('edit'),
        'src/events/messageUpdate/all.ts': log(
          'any edit',
          ", { where: 'both' }"
        ),
        'src/events/messageDelete/servers.ts': gone('deleted'),
        'src/events/messageDelete/all.ts': gone(
          'any deleted',
          ", { where: 'both' }"
        ),
      }),
      fake
    );
    await cli.waitFor('✓ 11 events loaded');
    const connection = await connected(fake);
    const bot = {
      id: '100000000000000555',
      username: 'other-bot',
      discriminator: '0',
      bot: true,
    };
    connection.dispatch(
      'MESSAGE_CREATE',
      privateMessage('100000000000000091', 'psst')
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      privateMessage('100000000000000092', 'beep', { author: bot })
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000093', 'hello')
    );
    // A webhook writes in a server, but is not one of its members.
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000094', 'hook', {
        webhook_id: '100000000000000777',
        author: {
          id: '100000000000000777',
          username: 'hook',
          discriminator: '0',
          bot: true,
        },
        member: undefined,
      })
    );
    connection.dispatch(
      'MESSAGE_UPDATE',
      privateMessage('100000000000000091', 'psst!')
    );
    connection.dispatch(
      'MESSAGE_UPDATE',
      rawMessage('100000000000000093', 'hello!')
    );
    connection.dispatch('MESSAGE_DELETE', {
      id: '100000000000000091',
      channel_id: PRIVATE,
    });
    connection.dispatch('MESSAGE_DELETE', {
      id: '100000000000000093',
      channel_id: GENERAL,
      guild_id: GUILD,
    });
    await cli.waitFor(`any deleted: 100000000000000093 of ${GUILD}`);
    await new Promise(resolve => setTimeout(resolve, 100));

    const { output } = cli;
    expect(seenBy(output, 'servers')).toEqual(['hello in Dev Server by alice']);
    expect(seenBy(output, 'off')).toEqual(['hello in Dev Server by alice']);
    expect(seenBy(output, 'all')).toEqual([
      'psst in private by no member',
      'hello in Dev Server by alice',
    ]);
    expect(seenBy(output, 'bots')).toEqual([
      'hello in Dev Server by alice',
      'hook in Dev Server by no member',
    ]);
    // Private messages only: nothing of a server arrives.
    expect(seenBy(output, 'only')).toEqual(['psst in private by no member']);
    expect(seenBy(output, 'only deleted')).toEqual([
      '100000000000000091 of null',
    ]);
    expect(seenBy(output, 'any')).toEqual([
      'psst in private by no member',
      'beep in private by no member',
      'hello in Dev Server by alice',
      'hook in Dev Server by no member',
    ]);
    expect(seenBy(output, 'edit')).toEqual(['hello! in Dev Server by alice']);
    expect(seenBy(output, 'any edit')).toEqual([
      'psst! in private by no member',
      'hello! in Dev Server by alice',
    ]);
    expect(seenBy(output, 'deleted')).toEqual([
      `100000000000000093 of ${GUILD}`,
    ]);
    expect(seenBy(output, 'any deleted')).toEqual([
      '100000000000000091 of null',
      `100000000000000093 of ${GUILD}`,
    ]);
    expect(output).not.toMatch(/[✗⚠]/);
  });

  it('keeps what the types promise: no member, no delivery by default', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/events/messageCreate/servers.ts': log('servers'),
        'src/events/messageCreate/bots.ts': log('bots', ', { bots: true }'),
      }),
      fake
    );
    await cli.waitFor('✓ 2 events loaded');
    const connection = await connected(fake);
    // Discord always sends the member; if it ever does not, a file that was
    // promised one must not run without it.
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000095', 'ghost', {
        author: {
          id: '100000000000000556',
          username: 'bob',
          discriminator: '0',
        },
        member: undefined,
      })
    );
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000096', 'hello')
    );
    await cli.waitFor('bots: hello in Dev Server by alice');
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(seenBy(cli.output, 'servers')).toEqual([
      'hello in Dev Server by alice',
    ]);
    expect(seenBy(cli.output, 'bots')).toEqual([
      'ghost in Dev Server by no member',
      'hello in Dev Server by alice',
    ]);
  });

  it.each([
    [
      'messageCreate',
      log('x', ", { where: 'both' }"),
      'GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT',
    ],
    [
      'messageUpdate',
      log('x', ", { where: 'both' }"),
      'GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT',
    ],
    [
      'messageDelete',
      gone('x', ", { where: 'both' }"),
      'GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES',
    ],
    ['messageDelete', gone('x'), 'GUILDS, GUILD_MESSAGES'],
    [
      'messageDelete',
      gone('x', ", { where: 'guild' }"),
      'GUILDS, GUILD_MESSAGES',
    ],
    // Private messages only: the messages of servers are not asked for.
    [
      'messageCreate',
      log('x', ", { where: 'dm' }"),
      'GUILDS, DIRECT_MESSAGES, MESSAGE_CONTENT',
    ],
    [
      'messageDelete',
      gone('x', ", { where: 'dm' }"),
      'GUILDS, DIRECT_MESSAGES',
    ],
    [
      'messageCreate',
      log('x', ', { bots: true }'),
      'GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT',
    ],
  ])(
    'are only asked to Discord when a file wants them: %s %#',
    async (folder, content, intents) => {
      const fake = await world();
      const cli = runProduction(
        project({ [`src/events/${folder}/file.ts`]: content }),
        fake
      );
      await cli.waitFor('✓ 1 event loaded');
      expect(cli.output).toContain(
        `ℹ Intents computed from your files: ${intents}\n`
      );
    }
  );

  it('are left to production by chapterjs dev, which only runs the dev server', async () => {
    const fake = await world();
    const cwd = project({
      'src/events/messageCreate/both.ts': log('both', ", { where: 'both' }"),
      'src/events/messageCreate/only.ts': log('only', ", { where: 'dm' }"),
      'src/events/messageDelete/only.ts': gone('gone', ", { where: 'dm' }"),
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 3 events loaded');
    await cli.waitFor(/src\/events\/messageDelete\/only\.ts .* Try it with/);
    // Nothing is asked to Discord for what dev does not listen to.
    expect(cli.output).toContain(
      'ℹ Intents computed from your files: GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT\n'
    );
    const connection = await connected(fake);
    const identify = connection.received.find(payload => payload.op === 2)!
      .d as { intents: number };
    expect(identify.intents & GatewayIntent.DirectMessages).toBe(0);
    // Said once for each file that can only be tried in production.
    for (const [file, what] of [
      ['src/events/messageCreate/only.ts', 'this messageCreate file'],
      ['src/events/messageDelete/only.ts', 'this messageDelete file'],
    ]) {
      expect(cli.output).toContain(
        `ℹ ${file} ${what} only works in private messages, and chapterjs dev only runs your bot in Dev Server. Try it with chapterjs start.`
      );
    }
    expect(cli.output.match(/only works in private messages/g)).toHaveLength(2);

    // A private message is answered by the bot in production, not here.
    connection.dispatch(
      'MESSAGE_CREATE',
      privateMessage('100000000000000097', 'psst')
    );
    connection.dispatch('MESSAGE_DELETE', {
      id: '100000000000000097',
      channel_id: PRIVATE,
    });
    connection.dispatch(
      'MESSAGE_CREATE',
      rawMessage('100000000000000098', 'hello')
    );
    await cli.waitFor('both: hello in Dev Server by alice');
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(cli.output).not.toContain('psst');
    expect(cli.output).not.toContain('gone:');

    // Asking for them later changes nothing to the connection either.
    writeFileSync(
      join(cwd, 'src/events/messageCreate/both.ts'),
      log('both', ", { where: 'dm' }")
    );
    await cli.waitFor(/↻ Reloaded in \d+ ms, 3 events loaded/);
    expect(cli.output).not.toContain('reconnecting');
  });

  it('are typed: the server and the member are there unless an option says otherwise', async () => {
    const fake = await world();
    const file = (body: string, options = '') =>
      `import { event } from 'chapterjs';\nexport default event(({ message }) => ${body}${options});\n`;
    const cwd = project({
      'src/events/messageCreate/servers.ts': file(
        'message.guild.name + message.guildId.length + message.member.displayName + message.channel.name + message.member.guild.name + message.member.highestRole.name'
      ),
      'src/events/messageCreate/dm-channel.ts': file(
        'message.channel.id',
        ", { where: 'both' }"
      ),
      'src/events/messageCreate/off.ts': file(
        'message.guild.name + message.member.displayName',
        ", { where: 'guild', bots: false }"
      ),
      'src/events/messageCreate/bots-ok.ts': file(
        'message.guild.name + message.member?.displayName',
        ', { bots: true }'
      ),
      'src/events/messageCreate/bots.ts': file(
        'message.member.displayName',
        ', { bots: true }'
      ),
      'src/events/messageCreate/dm-ok.ts': file(
        'message.guild?.name ?? message.guildId ?? message.member',
        ", { where: 'both' }"
      ),
      'src/events/messageCreate/dm.ts': file(
        'message.guild.name',
        ", { where: 'both' }"
      ),
      'src/events/messageUpdate/dm-member.ts': file(
        'message.member.displayName',
        ", { where: 'both' }"
      ),
      // Not known to be off: it may be on.
      'src/events/messageCreate/maybe.ts': `import { event } from 'chapterjs';
const where: 'guild' | 'both' = process.env.DM === 'yes' ? 'both' : 'guild';
export default event(({ message }) => message.guild.name, { where });
`,
      'src/events/messageCreate/typo.ts': file(
        'message.id',
        ", { where: 'both', wher: true }"
      ),
      'src/events/messageDelete/servers.ts': `import { event } from 'chapterjs';
export default event(({ guildId, message, channel }) => guildId.length + (message?.guild.name ?? '') + channel.name);
`,
      // One check tells the place, for everything at once.
      'src/events/messageCreate/both-ok.ts': `import { event } from 'chapterjs';
export default event(({ message }) => {
  if (message.guild) return message.member.displayName + message.channel.name;
  return message.channel?.recipientId;
}, { where: 'both' });
`,
      'src/events/messageDelete/both-ok.ts': `import { event } from 'chapterjs';
export default event(({ guild, channel }) => {
  if (guild) return guild.name + channel.name;
  return channel?.recipientId;
}, { where: 'both' });
`,
      // Only private messages: nothing about a server exists.
      'src/events/messageCreate/only-ok.ts': file(
        'message.content + message.channel?.recipientId',
        ", { where: 'dm' }"
      ),
      'src/events/messageCreate/only.ts': file(
        'message.guild',
        ", { where: 'dm' }"
      ),
      'src/events/messageDelete/only.ts': `import { event } from 'chapterjs';
export default event(context => context.guildId, { where: 'dm' });
`,
      'src/events/messageCreate/place.ts': file(
        'message.id',
        ", { where: 'server' }"
      ),
      'src/events/messageDelete/dm.ts': `import { event } from 'chapterjs';
export default event(({ guildId }) => guildId.length, { where: 'both' });
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
    const result = spawnSync(
      join(packageDir, 'node_modules/.bin/tsc'),
      ['-b'],
      {
        cwd,
        encoding: 'utf8',
      }
    );
    const errors = result.stdout
      .split('\n')
      .filter(line => line.includes('error TS'))
      .map(line => line.replace(/\(\d+,\d+\): error TS\d+/, ''))
      .sort();
    expect(errors).toEqual([
      "src/events/messageCreate/bots.ts: 'message.member' is possibly 'null'.",
      "src/events/messageCreate/dm-channel.ts: 'message.channel' is possibly 'null'.",
      "src/events/messageCreate/dm.ts: 'message.guild' is possibly 'null'.",
      "src/events/messageCreate/maybe.ts: 'message.guild' is possibly 'null'.",
      "src/events/messageCreate/only.ts: Property 'guild' does not exist on type 'DmMessage'.",
      `src/events/messageCreate/place.ts: Type '"server"' is not assignable to type 'EventWhere | undefined'.`,
      "src/events/messageCreate/typo.ts: Type 'true' is not assignable to type 'never'.",
      "src/events/messageDelete/dm.ts: 'guildId' is possibly 'null'.",
      "src/events/messageDelete/only.ts: Property 'guildId' does not exist on type 'DeletedInDm'.",
      "src/events/messageUpdate/dm-member.ts: 'message.member' is possibly 'null'.",
    ]);
  });
});

describe.skipIf(process.platform === 'win32')(
  'the channel of what happens in a server',
  () => {
    const THREAD = '100000000000000300';
    const HIDDEN = '100000000000000301';
    const PRIVATE = '100000000000000302';
    const files = {
      'src/events/messageCreate/log.ts': `import { event } from 'chapterjs';
export default event(({ message }) => {
  console.log(\`said: \${message.content} in #\${message.channel.name} of \${message.channel.guild.name}\`);
});
`,
      'src/events/messageCreate/any.ts': `import { event } from 'chapterjs';
export default event(({ message }) => {
  console.log(\`any: \${message.content} in \${message.channel?.id ?? 'no channel'}\`);
}, { where: 'both' });
`,
      'src/events/messageDelete/log.ts': `import { event } from 'chapterjs';
export default event(({ messageId, channel }) => {
  console.log(\`deleted: \${messageId} in #\${channel.name}\`);
});
`,
    };
    const thread = {
      id: THREAD,
      type: 11,
      name: 'old-thread',
      guild_id: GUILD,
      parent_id: GENERAL,
      thread_metadata: {
        archived: false,
        auto_archive_duration: 60,
        archive_timestamp: '2024-01-01T00:00:00Z',
        locked: false,
      },
    };

    it('is asked to Discord once when the bot does not know it', async () => {
      const fake = await world();
      fake.discord.on('GET', `/channels/${THREAD}`, { body: thread });
      const cli = runDev(project(files), fake);
      await cli.waitFor('✓ 3 events loaded');
      const connection = await connected(fake);
      // A channel the bot knows costs nothing.
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000310', 'hi')
      );
      await cli.waitFor('said: hi in #general of Dev Server');
      expect(fake.discord.requestsTo('GET', `/channels/${GENERAL}`)).toEqual(
        []
      );

      // A thread it never saw is read first, then remembered. What happens
      // there meanwhile waits for the same answer, in order.
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000311', 'first', { channel_id: THREAD })
      );
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000312', 'second', { channel_id: THREAD })
      );
      connection.dispatch('MESSAGE_DELETE', {
        id: '100000000000000311',
        channel_id: THREAD,
        guild_id: GUILD,
      });
      await cli.waitFor('deleted: 100000000000000311 in #old-thread');
      const thenOrder = [
        'said: first in #old-thread of Dev Server',
        'said: second in #old-thread of Dev Server',
        'deleted: 100000000000000311 in #old-thread',
      ].map(line => cli.output.indexOf(line));
      expect(thenOrder.every(index => index !== -1)).toBe(true);
      expect(thenOrder).toEqual([...thenOrder].sort((x, y) => x - y));
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000313', 'third', { channel_id: THREAD })
      );
      await cli.waitFor('said: third in #old-thread of Dev Server');
      // One request for the three, and none once it is known.
      expect(
        fake.discord.requestsTo('GET', `/channels/${THREAD}`)
      ).toHaveLength(1);
      expect(cli.output).not.toMatch(/[✗⚠]/);
    });

    it('is not asked for a private message, whose file handles its absence', async () => {
      const fake = await world();
      const cli = runProduction(project(files), fake);
      await cli.waitFor('✓ 3 events loaded');
      const connection = await connected(fake);
      const {
        guild_id: _guild,
        member: _member,
        ...privateMessage
      } = rawMessage('100000000000000320', 'psst', { channel_id: PRIVATE });
      connection.dispatch('MESSAGE_CREATE', privateMessage);
      await cli.waitFor(`any: psst in no channel`);
      expect(fake.discord.requestsTo('GET', `/channels/${PRIVATE}`)).toEqual(
        []
      );
    });

    it('says so when Discord refuses it, and runs nothing with a channel missing', async () => {
      const fake = await world();
      fake.discord.on('GET', `/channels/${HIDDEN}`, {
        status: 403,
        body: { message: 'Missing Access', code: 50001 },
      });
      const cli = runDev(project(files), fake);
      await cli.waitFor('✓ 3 events loaded');
      const connection = await connected(fake);
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000330', 'secret', { channel_id: HIDDEN })
      );
      await cli.waitFor(
        /⚠ A messageCreate event was not given to your files: Discord did not let the bot read the channel it happened in \(.*Missing Access.*\)\./
      );
      connection.dispatch('MESSAGE_DELETE', {
        id: '100000000000000330',
        channel_id: HIDDEN,
        guild_id: GUILD,
      });
      await cli.waitFor(/⚠ A messageDelete event was not given to your files/);
      // Refused once is not refused forever: the bot asks again when
      // something else happens there.
      fake.discord.on('GET', `/channels/${HIDDEN}`, {
        body: { ...thread, id: HIDDEN, name: 'now-visible' },
      });
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000334', 'allowed', { channel_id: HIDDEN })
      );
      await cli.waitFor('said: allowed in #now-visible of Dev Server');
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000331', 'still here')
      );
      await cli.waitFor('said: still here in #general of Dev Server');
      expect(cli.output).not.toContain('secret');

      // A kind of channel nobody can write in, should Discord ever say so:
      // a message of a server is promised its channel, so no file runs.
      fake.discord.on('GET', `/channels/${THREAD}`, {
        body: { id: THREAD, type: 4, name: 'odd', guild_id: GUILD },
      });
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000332', 'odd one', { channel_id: THREAD })
      );
      connection.dispatch('MESSAGE_DELETE', {
        id: '100000000000000332',
        channel_id: THREAD,
        guild_id: GUILD,
      });
      connection.dispatch(
        'MESSAGE_CREATE',
        rawMessage('100000000000000333', 'the end')
      );
      await cli.waitFor('said: the end in #general of Dev Server');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cli.output).not.toContain('odd one');
      expect(cli.output).not.toContain('deleted: 100000000000000332');
      expect(cli.output).not.toContain('✗');
    });
  }
);

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
        /✗ src\/events\/messageCreate\/bad\.ts "bot" is not an option of messageCreate\. Options of messageCreate are: bots, where\./,
      ],
      [
        'messageCreate',
        "{ bots: 'yes' }",
        /✗ src\/events\/messageCreate\/bad\.ts The option bots of messageCreate is true or false, got "yes"\./,
      ],
      [
        'messageUpdate',
        "'bots'",
        /✗ src\/events\/messageUpdate\/bad\.ts The second argument of event\(\) is its options, like \{ bots: true \}\. Options of messageUpdate are: bots, where\./,
      ],
      [
        'messageCreate',
        'null',
        /The second argument of event\(\) is its options/,
      ],
      [
        'messageDelete',
        '{ bots: true }',
        /✗ src\/events\/messageDelete\/bad\.ts "bots" is not an option of messageDelete\. Options of messageDelete are: where\./,
      ],
      [
        'messageDelete',
        "{ where: 'server' }",
        /✗ src\/events\/messageDelete\/bad\.ts The option where of messageDelete is 'guild', 'dm' or 'both', got "server"\./,
      ],
      [
        'messageCreate',
        '{ where: true }',
        /✗ src\/events\/messageCreate\/bad\.ts The option where of messageCreate is 'guild', 'dm' or 'both', got true\./,
      ],
      [
        'messageDelete',
        "'both'",
        /✗ src\/events\/messageDelete\/bad\.ts The second argument of event\(\) is its options, like \{ where: 'both' \}\. Options of messageDelete are: where\./,
      ],
      [
        'messageCreate',
        '{ dm: true }',
        /✗ src\/events\/messageCreate\/bad\.ts "dm" is not an option of messageCreate\./,
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
          await cli.waitFor('ℹ Nothing to run yet');
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
      const types = readFileSync(
        join(cwd, '.chapterjs/types/events.messageCreate.d.ts'),
        'utf8'
      );
      expect(types).toContain(
        "const Options extends EventOptions['messageCreate'] = {},"
      );
      expect(types).toContain(
        "handler: (context: ContextOf<'messageCreate', Options>) => unknown,"
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
    await cli.waitFor('ℹ Nothing to run yet');
  });
});
