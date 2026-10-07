import { cpSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOT,
  connected,
  GENERAL,
  GUILD,
  packageDir,
  project,
  rawMessage,
  runDev,
  world,
  type FakeWorld,
  runProduction,
} from './dev-helpers.js';

const PING = `import { command } from 'chapterjs';

export default command({
  description: 'Replies with Pong!',
  async run({ interaction }) {
    await interaction.reply('Pong!');
  },
});
`;

const registerRoute = `/applications/${BOT}/guilds/${GUILD}/commands`;
const registered = (fake: FakeWorld) =>
  fake.discord
    .requestsTo('PUT', registerRoute)
    .map(request => request.body as Record<string, unknown>[]);

/** Lets the bot answer the interaction `id`, and returns what it sent. */
function answers(fake: FakeWorld, id: string) {
  const token = `token-${id}`;
  const callback = `/interactions/${id}/${token}/callback`;
  const original = `/webhooks/${BOT}/${token}/messages/@original`;
  const followUp = `/webhooks/${BOT}/${token}`;
  const message = rawMessage('100000000000000090', 'answer');
  fake.discord.on('POST', callback, request => {
    const body = request.body as { type: number };
    return body.type === 4
      ? {
          body: {
            interaction: { id, type: 2 },
            resource: { type: 4, message },
          },
        }
      : {};
  });
  fake.discord.on('PATCH', original, { body: message });
  fake.discord.on('DELETE', original, {});
  fake.discord.on('POST', followUp, { body: message });
  return {
    callbacks: () => fake.discord.requestsTo('POST', callback),
    edits: () => fake.discord.requestsTo('PATCH', original),
    followUps: () => fake.discord.requestsTo('POST', followUp),
    deletes: () => fake.discord.requestsTo('DELETE', original),
  };
}

/** A slash command being used, as Discord sends it. */
const use = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
  data: Record<string, unknown> = {}
) => ({
  id,
  application_id: BOT,
  type: 2,
  token: `token-${id}`,
  version: 1,
  guild_id: GUILD,
  channel_id: GENERAL,
  locale: 'fr',
  member: {
    user: { id: ALICE, username: 'alice', discriminator: '0' },
    roles: [],
    permissions: '1024',
    joined_at: '2024-01-01T00:00:00Z',
    deaf: false,
    mute: false,
    flags: 0,
  },
  app_permissions: '0',
  entitlements: [],
  authorizing_integration_owners: {},
  attachment_size_limit: 1,
  data: { id: '100000000000000500', name, type: 1, ...data },
  ...extra,
});

const waitUntil = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};

describe.skipIf(process.platform === 'win32')('commands', () => {
  it('are registered on the dev server from their paths, only when they change', async () => {
    const fake = await world();
    const cwd = project({
      'src/commands/ping.ts': PING,
      'src/commands/mod/ban.ts': `import { command, ChannelType } from 'chapterjs';
export default command({
  description: 'Ban a member',
  permissions: ['BanMembers'],
  nsfw: true,
  options: {
    days: { type: 'integer', description: 'Days of messages to delete', min: 0, max: 7 },
    target: { type: 'user', description: 'Who to ban', required: true },
    reason: { type: 'string', description: 'Why', choices: { Spam: 'spam', 'Raid attack': 'raid' }, required: true },
    level: { type: 'number', description: 'How bad', choices: [1, 2.5] },
    note: { type: 'string', description: 'A note', minLength: 2, maxLength: 50 },
    where: { type: 'channel', description: 'Where to log', channelTypes: [ChannelType.GuildText] },
  },
  run() {},
});
`,
      'src/commands/mod/kick.ts': `import { command } from 'chapterjs';
export default command({ description: 'Kick a member', permissions: ['BanMembers', 'KickMembers'], run() {} });
`,
      'src/commands/mod/roles/add.ts': `import { command } from 'chapterjs';
export default command({ description: 'Give a role', permissions: ['BanMembers', 'ManageRoles'], run() {} });
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 4 commands loaded');
    await cli.waitFor('✓ Commands updated on Dev Server');
    expect(registered(fake)).toEqual([
      [
        {
          type: 1,
          name: 'mod',
          description: 'mod commands',
          // What every subcommand asks for.
          default_member_permissions: '4',
          nsfw: true,
          options: [
            {
              type: 1,
              name: 'ban',
              description: 'Ban a member',
              options: [
                // Required options first, as Discord wants them.
                {
                  type: 6,
                  name: 'target',
                  description: 'Who to ban',
                  required: true,
                },
                {
                  type: 3,
                  name: 'reason',
                  description: 'Why',
                  required: true,
                  choices: [
                    { name: 'Spam', value: 'spam' },
                    { name: 'Raid attack', value: 'raid' },
                  ],
                },
                {
                  type: 4,
                  name: 'days',
                  description: 'Days of messages to delete',
                  min_value: 0,
                  max_value: 7,
                },
                {
                  type: 10,
                  name: 'level',
                  description: 'How bad',
                  choices: [
                    { name: '1', value: 1 },
                    { name: '2.5', value: 2.5 },
                  ],
                },
                {
                  type: 3,
                  name: 'note',
                  description: 'A note',
                  min_length: 2,
                  max_length: 50,
                },
                {
                  type: 7,
                  name: 'where',
                  description: 'Where to log',
                  channel_types: [0],
                },
              ],
            },
            { type: 1, name: 'kick', description: 'Kick a member' },
            {
              type: 2,
              name: 'roles',
              description: 'roles commands',
              options: [{ type: 1, name: 'add', description: 'Give a role' }],
            },
          ],
        },
        {
          type: 1,
          name: 'ping',
          description: 'Replies with Pong!',
          default_member_permissions: null,
        },
      ],
    ]);
    expect(
      fake.discord.requestsTo('PUT', registerRoute)[0]!.headers.authorization
    ).toBe('Bot test-token');

    // What a command does changes: Discord is not told.
    writeFileSync(
      join(cwd, 'src/commands/ping.ts'),
      PING.replace("'Pong!'", "'Pong again!'")
    );
    await cli.waitFor(/↻ Reloaded in \d+ ms, 4 commands loaded/);
    expect(registered(fake)).toHaveLength(1);
    // What a command is changes: Discord is told.
    writeFileSync(
      join(cwd, 'src/commands/ping.ts'),
      PING.replace('Replies with Pong!', 'Answers')
    );
    await cli.waitFor('↻ Commands updated on Discord');
    expect(registered(fake)).toHaveLength(2);
    expect(registered(fake)[1]!.at(-1)).toMatchObject({
      name: 'ping',
      description: 'Answers',
    });

    // Starting again with the same commands costs no request.
    cli.signal('SIGTERM');
    await cli.exited;
    const again = runDev(cwd, fake);
    await again.waitFor('✓ 4 commands loaded');
    again.signal('SIGTERM');
    const { output } = await again.exited;
    expect(output).not.toContain('Commands updated');
    expect(registered(fake)).toHaveLength(2);
  });

  it('run when used, with what the person filled in', async () => {
    const fake = await world();
    const ROLE = '100000000000000010';
    const cwd = project({
      'src/commands/ping.ts': PING,
      'src/commands/show.ts': `import { command } from 'chapterjs';
export default command({
  description: 'Shows what it received',
  options: {
    who: { type: 'user', description: 'd', required: true },
    role: { type: 'role', description: 'd' },
    where: { type: 'channel', description: 'd' },
    any: { type: 'mentionable', description: 'd' },
    file: { type: 'attachment', description: 'd' },
    count: { type: 'integer', description: 'd' },
    text: { type: 'string', description: 'd', choices: ['a', 'b'] },
    flag: { type: 'boolean', description: 'd' },
    missing: { type: 'string', description: 'd' },
  },
  async run({ interaction, options, user, member, guild, channel }) {
    console.log(JSON.stringify({
      command: interaction.commandName,
      locale: interaction.locale,
      user: user.username,
      member: member.id === user.id,
      guild: guild.name,
      channel: channel?.id,
      who: options.who.username,
      whoIsMember: guild.members.get(options.who.id)?.nick,
      role: options.role?.name,
      where: options.where?.isText(),
      any: options.any?.constructor.name,
      file: options.file?.filename,
      count: options.count,
      text: options.text,
      flag: options.flag,
      missing: options.missing,
      hasMissing: 'missing' in options,
    }));
    await interaction.reply({ content: 'seen', ephemeral: true });
  },
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 2 commands loaded');
    const connection = await connected(fake);

    const ping = answers(fake, '100000000000000601');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000601', 'ping')
    );
    await waitUntil(() => ping.callbacks().length === 1, 'the answer to /ping');
    const [callback] = ping.callbacks();
    expect(callback!.body).toEqual({
      type: 4,
      data: { content: 'Pong!', flags: 0 },
    });
    expect(callback!.query).toEqual({ with_response: ['true'] });
    // The token of the interaction authenticates the answer, not the bot's.
    expect(callback!.headers.authorization).toBeUndefined();

    const show = answers(fake, '100000000000000602');
    connection.dispatch(
      'INTERACTION_CREATE',
      use(
        '100000000000000602',
        'show',
        {},
        {
          options: [
            { name: 'who', type: 6, value: '100000000000000777' },
            { name: 'role', type: 8, value: ROLE },
            { name: 'where', type: 7, value: GENERAL },
            { name: 'any', type: 9, value: ROLE },
            { name: 'file', type: 11, value: '100000000000000888' },
            { name: 'count', type: 4, value: 3 },
            { name: 'text', type: 3, value: 'b' },
            { name: 'flag', type: 5, value: false },
          ],
          resolved: {
            users: {
              '100000000000000777': {
                id: '100000000000000777',
                username: 'bob',
                discriminator: '0',
              },
            },
            members: {
              '100000000000000777': {
                roles: [],
                nick: 'Bobby',
                joined_at: null,
                flags: 0,
              },
            },
            roles: {
              [ROLE]: { id: ROLE, name: 'Mod', permissions: '0', position: 1 },
            },
            channels: {
              [GENERAL]: {
                id: GENERAL,
                type: 0,
                name: 'general',
                permissions: '0',
              },
            },
            attachments: {
              '100000000000000888': {
                id: '100000000000000888',
                filename: 'cat.png',
                size: 1,
                url: 'u',
                proxy_url: 'p',
              },
            },
          },
        }
      )
    );
    await cli.waitFor('"command":"/show"');
    const seen = JSON.parse(
      cli.output.split('\n').find(line => line.startsWith('{"command"'))!
    );
    expect(seen).toEqual({
      command: '/show',
      locale: 'fr',
      user: 'alice',
      member: true,
      guild: 'Dev Server',
      channel: GENERAL,
      who: 'bob',
      whoIsMember: 'Bobby',
      role: 'Mod',
      where: true,
      any: 'Role',
      file: 'cat.png',
      count: 3,
      text: 'b',
      flag: false,
      hasMissing: true,
    });
    await waitUntil(() => show.callbacks().length === 1, 'the answer to /show');
    expect(show.callbacks()[0]!.body).toEqual({
      type: 4,
      data: { content: 'seen', flags: 64 },
    });
  });

  it('find subcommands, and refuse a command whose file is gone', async () => {
    const fake = await world();
    const sub = (text: string) => `import { command } from 'chapterjs';
export default command({ description: 'd', ephemeral: true, async run({ interaction }) { await interaction.reply('${text} ' + interaction.commandName); } });
`;
    const cli = runDev(
      project({
        'src/commands/mod/ban.ts': sub('ban'),
        'src/commands/mod/roles/add.ts': sub('add'),
      }),
      fake
    );
    await cli.waitFor('✓ 2 commands loaded');
    const connection = await connected(fake);
    const content = async (
      id: string,
      data: Record<string, unknown>,
      name = 'mod'
    ) => {
      const sent = answers(fake, id);
      connection.dispatch('INTERACTION_CREATE', use(id, name, {}, data));
      await waitUntil(
        () => sent.callbacks().length === 1,
        `the answer to ${id}`
      );
      return (
        sent.callbacks()[0]!.body as {
          data: { content: string; flags: number };
        }
      ).data;
    };
    // The command says its answers are ephemeral: nothing to repeat.
    expect(
      await content('100000000000000611', {
        options: [{ name: 'ban', type: 1 }],
      })
    ).toEqual({
      content: 'ban /mod ban',
      flags: 64,
    });
    expect(
      await content('100000000000000612', {
        options: [
          {
            name: 'roles',
            type: 2,
            options: [{ name: 'add', type: 1, options: [] }],
          },
        ],
      })
    ).toEqual({ content: 'add /mod roles add', flags: 64 });
    expect(await content('100000000000000613', {}, 'old-command')).toEqual({
      content: 'This command is not available right now.',
      flags: 64,
    });
    expect(
      await content('100000000000000614', {
        options: [{ name: 'gone', type: 1 }],
      })
    ).toEqual({
      content: 'This command is not available right now.',
      flags: 64,
    });
  });

  it('check the permissions a command asks for before running it', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/commands/ban.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  permissions: ['BanMembers', 'KickMembers'],
  async run({ interaction }) { console.log('ban ran'); await interaction.reply('banned'); },
});
`,
      }),
      fake
    );
    await cli.waitFor('✓ 1 command loaded');
    const connection = await connected(fake);
    const member = (permissions: string) => ({
      member: {
        user: { id: ALICE, username: 'alice', discriminator: '0' },
        roles: [],
        permissions,
        joined_at: null,
        flags: 0,
      },
    });
    const run = async (id: string, permissions: string) => {
      const sent = answers(fake, id);
      connection.dispatch(
        'INTERACTION_CREATE',
        use(id, 'ban', member(permissions))
      );
      await waitUntil(
        () => sent.callbacks().length === 1,
        `the answer to ${id}`
      );
      return (sent.callbacks()[0]!.body as { data: unknown }).data;
    };
    expect(await run('100000000000000621', '1024')).toEqual({
      content:
        'You need the KickMembers, BanMembers permissions to use this command.',
      flags: 64,
    });
    expect(await run('100000000000000622', '4')).toEqual({
      content: 'You need the KickMembers permission to use this command.',
      flags: 64,
    });
    expect(cli.output).not.toContain('ban ran');
    expect(await run('100000000000000623', '6')).toEqual({
      content: 'banned',
      flags: 0,
    });
    // An administrator can do everything.
    expect(await run('100000000000000624', '8')).toEqual({
      content: 'banned',
      flags: 0,
    });
  });

  it('always give the person an answer, and the developer the error', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/commands/crash.ts': `import { command } from 'chapterjs';

export default command({
  description: 'd',
  run() {
    throw new Error('this command is broken');
  },
});
`,
        'src/commands/late-crash.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  async run({ interaction }) {
    await interaction.reply('working on it');
    throw new Error('broke after answering');
  },
});
`,
        'src/commands/refused.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  async run({ guild }) {
    await guild.ban('${ALICE}');
  },
});
`,
        'src/commands/twice.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  async run({ interaction }) {
    await interaction.reply('one');
    await interaction.reply('two');
  },
});
`,
        'src/commands/silent.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', run() {} });
`,
      }),
      fake
    );
    await cli.waitFor('✓ 5 commands loaded');
    const connection = await connected(fake);
    const generic = {
      content: 'Something went wrong while running this command.',
      flags: 64,
    };

    const crash = answers(fake, '100000000000000631');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000631', 'crash')
    );
    await cli.waitFor('✗ src/commands/crash.ts:6 this command is broken');
    await waitUntil(
      () => crash.callbacks().length === 1,
      'the answer to /crash'
    );
    expect((crash.callbacks()[0]!.body as { data: unknown }).data).toEqual(
      generic
    );

    // Already answered: the bad news comes as another message.
    const late = answers(fake, '100000000000000632');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000632', 'late-crash')
    );
    await cli.waitFor('✗ src/commands/late-crash.ts:6 broke after answering');
    await waitUntil(
      () => late.followUps().length === 1,
      'the follow-up of /late-crash'
    );
    expect(late.followUps()[0]!.body).toEqual(generic);

    // Discord refusing what the bot tries is said in plain words.
    fake.discord.on('PUT', `/guilds/${GUILD}/bans/${ALICE}`, {
      status: 403,
      body: { code: 50013, message: 'Missing Permissions' },
    });
    const refused = answers(fake, '100000000000000633');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000633', 'refused')
    );
    await cli.waitFor(
      /✗ src\/commands\/refused\.ts:5 Discord refused PUT .+ Missing Permissions \(50013\)/
    );
    await waitUntil(
      () => refused.callbacks().length === 1,
      'the answer to /refused'
    );
    expect((refused.callbacks()[0]!.body as { data: unknown }).data).toEqual({
      content: "I don't have the permission to do that here.",
      flags: 64,
    });

    const twice = answers(fake, '100000000000000634');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000634', 'twice')
    );
    await cli.waitFor(
      /✗ src\/commands\/twice\.ts:6 This interaction was already answered\. Use interaction\.followUp\(\)/
    );
    expect(twice.callbacks()).toHaveLength(1);

    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000635', 'silent')
    );
    await cli.waitFor(
      '⚠ src/commands/silent.ts /silent finished without answering: the person sees "The application did not respond". Call interaction.reply() in run.'
    );
  });

  it('put the bad news in the pending answer, and never show the token', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/commands/deferred-crash.ts': `import { command } from 'chapterjs';
import { inspect } from 'node:util';
export default command({
  description: 'd',
  async run({ interaction }) {
    console.log('logged', JSON.stringify(interaction), inspect(interaction));
    await interaction.defer();
    throw new Error('broke while thinking');
  },
});
`,
      }),
      fake
    );
    await cli.waitFor('✓ 1 command loaded');
    const connection = await connected(fake);
    const sent = answers(fake, '100000000000000671');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000671', 'deferred-crash')
    );
    await cli.waitFor(
      '✗ src/commands/deferred-crash.ts:8 broke while thinking'
    );
    await waitUntil(
      () => sent.edits().length === 1,
      'the edit of the pending answer'
    );
    expect(sent.edits()[0]!.body).toEqual({
      content: 'Something went wrong while running this command.',
    });
    expect(sent.followUps()).toHaveLength(0);
    expect(sent.callbacks()).toHaveLength(1);
    const logged = cli.output
      .split('\n')
      .find(line => line.startsWith('logged'))!;
    expect(logged).toContain('100000000000000671');
    expect(cli.output).not.toContain('token-100000000000000671');
  });

  it('say the answer is coming when it takes long, then complete it', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/commands/slow.ts': `import { command } from 'chapterjs';
import { setTimeout as sleep } from 'node:timers/promises';
export default command({
  description: 'd',
  ephemeral: true,
  async run({ interaction }) {
    await sleep(2400);
    await interaction.reply('finally');
    await interaction.edit('finally, edited');
    await interaction.followUp({ content: 'and more', ephemeral: false });
    await interaction.delete();
  },
});
`,
        'src/commands/own-defer.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  async run({ interaction }) {
    await interaction.defer({ ephemeral: true });
    console.log('deferred', interaction.deferred, interaction.answered);
    await interaction.reply('done');
    console.log('answered', interaction.deferred, interaction.answered);
  },
});
`,
      }),
      fake
    );
    await cli.waitFor('✓ 2 commands loaded');
    const connection = await connected(fake);

    const slow = answers(fake, '100000000000000641');
    const started = Date.now();
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000641', 'slow')
    );
    await waitUntil(
      () => slow.callbacks().length === 1,
      'the deferral of /slow'
    );
    // Within the 3 seconds Discord gives.
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
    expect(Date.now() - started).toBeLessThan(2900);
    expect(slow.callbacks()[0]!.body).toEqual({ type: 5, data: { flags: 64 } });
    await waitUntil(() => slow.deletes().length === 1, 'the end of /slow');
    expect(slow.callbacks()).toHaveLength(1);
    expect(slow.edits().map(request => request.body)).toEqual([
      { content: 'finally' },
      { content: 'finally, edited' },
    ]);
    expect(slow.followUps()[0]!.body).toEqual({
      content: 'and more',
      flags: 0,
    });
    expect(slow.edits()[0]!.headers.authorization).toBeUndefined();

    const own = answers(fake, '100000000000000642');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000642', 'own-defer')
    );
    await cli.waitFor('deferred true true');
    await cli.waitFor('answered false true');
    expect(own.callbacks().map(request => request.body)).toEqual([
      { type: 5, data: { flags: 64 } },
    ]);
    expect(own.edits().map(request => request.body)).toEqual([
      { content: 'done' },
    ]);
    // A fast command is never deferred.
    await new Promise(resolve => setTimeout(resolve, 2300));
    expect(own.callbacks()).toHaveLength(1);
  }, 20_000);

  it.each([
    [
      'src/commands/bad.ts',
      `export const nope = 1;\n`,
      /✗ src\/commands\/bad\.ts This file has no default export\. It should look like: import \{ command \} from 'chapterjs'; export default command\(/,
    ],
    [
      'src/commands/bad.ts',
      `export default () => {};\n`,
      /✗ src\/commands\/bad\.ts The default export of this file must be what command\(\) returns/,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ run() {} } as never);\n`,
      /✗ src\/commands\/bad\.ts This command has no description: write it in src\/messages\/en-US\.ts \(commands: \{ "bad": \{ description: '\.\.\.' \} \}\), or in the file \(description: '\.\.\.'\)\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'x'.repeat(101), run() {} });\n`,
      /The description of this command is 101 characters long: Discord accepts 100 at most\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd' } as never);\n`,
      /This command has no "run": the function to run when someone uses it/,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', where: 'server', run() {} } as never);\n`,
      /"where" says where the command can be used: 'guild' \(in servers, which is the default\), 'dm' \(in private messages with the bot\) or 'both'\. Got "server"\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', dm: true, run() {} } as never);\n`,
      /"dm" is not something a command has\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', name: 'other', run() {} } as never);\n`,
      /"name" is not something a command has\. It can have: description, options, locales, permissions, where, nsfw, ephemeral, run\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', permissions: ['Ban'] as never, run() {} });\n`,
      /"Ban" is not a permission\. Permissions are: CreateInstantInvite/,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: { Who: { type: 'user', description: 'd' } }, run() {} });\n`,
      /"Who" can't be the name of an option: use lowercase letters, digits, - and _ only/,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: { who: { type: 'member', description: 'd' } as never }, run() {} });\n`,
      /The type of the option "who" is "member", which does not exist\. Types are: string, integer, number, boolean, user, role, channel, mentionable, attachment\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: { who: { type: 'user' } as never }, run() {} });\n`,
      /the option "who" needs a description/,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: { n: { type: 'integer', description: 'd', min: 5, max: 1 } }, run() {} });\n`,
      /the option "n" can never be filled in: its "min" \(5\) is greater than its "max" \(1\)\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: { n: { type: 'integer', description: 'd', choices: [1.5] } }, run() {} });\n`,
      /The choice 1\.5 of the option "n" is not a whole number\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: { n: { type: 'string', description: 'd', choices: [] } }, run() {} });\n`,
      /the option "n" has 0 choices: Discord accepts between 1 and 25\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: { n: { type: 'boolean', description: 'd', min: 1 } as never }, run() {} });\n`,
      /"min" is not something the option "n" has\. It can have: type, description, required\./,
    ],
    [
      'src/commands/bad.ts',
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: Object.fromEntries(Array.from({ length: 26 }, (_, n) => ['o' + n, { type: 'string', description: 'd' }])) as never, run() {} });\n`,
      /This command has 26 options: Discord accepts 25 at most\./,
    ],
    [
      'src/commands/Bad.ts',
      PING,
      /✗ src\/commands\/Bad\.ts "Bad" can't be in the name of a command: use lowercase letters, digits, - and _ only, 32 characters at most\. The path of the file is the name of the command\./,
    ],
    [
      'src/commands/my command.ts',
      PING,
      /"my command" can't be in the name of a command/,
    ],
    [
      'src/commands/a/b/c/bad.ts',
      PING,
      /✗ src\/commands\/a\/b\/c\/bad\.ts This file is 3 folders deep: Discord allows a command, a group and a subcommand, so 2 folders at most/,
    ],
  ])('explain what is wrong with %s', async (path, content, message) => {
    const fake = await world();
    const cli = runDev(
      project({ [path]: content, 'src/commands/ping.ts': PING }),
      fake
    );
    await cli.waitFor(message);
    await cli.waitFor('✓ 1 command loaded');
    await cli.waitFor('✓ Commands updated on Dev Server');
    expect(registered(fake)[0]!.map(command => command.name)).toEqual(['ping']);
  });

  it('refuse a command that also has subcommands', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/commands/mod.ts': PING,
        'src/commands/mod/ban.ts': PING,
        'src/commands/ping.ts': PING,
      }),
      fake
    );
    await cli.waitFor(
      "✗ src/commands/mod.ts /mod can't be a command and have subcommands (src/commands/mod/ban.ts is /mod ban): Discord only lets people use the subcommands. Move this file into the folder, for example as mod/run.ts."
    );
    await cli.waitFor('✓ 2 commands loaded');
    await cli.waitFor('✓ Commands updated on Dev Server');
    expect(registered(fake)[0]!.map(command => command.name)).toEqual([
      'mod',
      'ping',
    ]);
  });

  it('are counted with events, and keep their last working version when they break', async () => {
    const fake = await world({ flags: 0 });
    const cwd = project({
      'src/commands/ping.ts': PING,
      'src/events/ready/online.ts': `import { event } from 'chapterjs';\nexport default event(() => {});\n`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('ℹ Intents computed from your files: GUILDS');
    await cli.waitFor('✓ 1 command, 1 event loaded');
    const connection = await connected(fake);
    writeFileSync(
      join(cwd, 'src/commands/ping.ts'),
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', run( });\n`
    );
    await cli.waitFor(/✗ src\/commands\/ping\.ts:2 /);
    await cli.waitFor(
      '⚠ Reloaded with an error: that file keeps running its last working version'
    );
    const ping = answers(fake, '100000000000000651');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000651', 'ping')
    );
    await waitUntil(() => ping.callbacks().length === 1, 'the answer to /ping');
    // Still registered as it was: Discord was not told about the broken file.
    expect(registered(fake)).toHaveLength(1);
  });

  it('report commands Discord refuses, and keep running', async () => {
    const fake = await world();
    fake.discord.on('PUT', registerRoute, {
      status: 400,
      body: { code: 50035, message: 'Invalid Form Body' },
    });
    const cli = runDev(project({ 'src/commands/ping.ts': PING }), fake);
    await cli.waitFor('✓ 1 command loaded');
    await cli.waitFor(
      /✗ Discord refused the commands of your project: Discord refused PUT .+ Invalid Form Body \(50035\)/
    );
    const connection = await connected(fake);
    const ping = answers(fake, '100000000000000661');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000661', 'ping')
    );
    await waitUntil(() => ping.callbacks().length === 1, 'the answer to /ping');
  });

  it('give an interaction that knows its server and its member', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/commands/where.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  async run({ interaction, guild, member }) {
    await interaction.reply([
      interaction.guild.name,
      interaction.guildId,
      interaction.member.displayName,
      interaction.guild === guild,
      interaction.member === member,
    ].join(' '));
  },
});
`,
      }),
      fake
    );
    await cli.waitFor('✓ Commands updated on Dev Server');
    const connection = await connected(fake);
    const sent = answers(fake, '100000000000000771');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000771', 'where')
    );
    await waitUntil(() => sent.callbacks().length === 1, 'the answer');
    expect(
      (sent.callbacks()[0]!.body as { data: { content: string } }).data.content
    ).toBe(`Dev Server ${GUILD} alice true true`);
  });

  it('always know the channel they were used in, without asking Discord', async () => {
    const fake = await world();
    const THREAD = '100000000000000400';
    const PRIVATE = '100000000000000401';
    const where = (dm: boolean) => `import { command } from 'chapterjs';
export default command({
  description: 'd',${dm ? "\n  where: 'both'," : ''}
  async run({ interaction, channel }) {
    await interaction.reply([
      channel.id,
      channel.isThread() ? channel.name : channel.isDM() ? 'private' : 'other',
      interaction.channel === channel,
      interaction.channelId,
      interaction.locale,
    ].join(' '));
  },
});
`;
    const cli = runProduction(
      project({
        'src/commands/where.ts': where(false),
        'src/commands/anywhere.ts': where(true),
      }),
      fake
    );
    await cli.waitFor('✓ Commands updated for everyone');
    const connection = await connected(fake);
    const content = async (id: string, interaction: object) => {
      const sent = answers(fake, id);
      connection.dispatch('INTERACTION_CREATE', interaction);
      await waitUntil(() => sent.callbacks().length === 1, `the answer ${id}`);
      return (sent.callbacks()[0]!.body as { data: { content: string } }).data
        .content;
    };
    // A thread the bot never saw: Discord sends it with the interaction.
    const thread = {
      id: THREAD,
      type: 11,
      name: 'old-thread',
      guild_id: GUILD,
      parent_id: GENERAL,
    };
    expect(
      await content(
        '100000000000000781',
        use('100000000000000781', 'where', {
          channel_id: THREAD,
          channel: thread,
        })
      )
    ).toBe(`${THREAD} old-thread true ${THREAD} fr`);
    // In private, with a command that accepts it.
    const {
      guild_id: _guild,
      member,
      ...inPrivate
    } = use('100000000000000782', 'anywhere', {
      channel_id: PRIVATE,
      channel: { id: PRIVATE, type: 1 },
      locale: 'de',
    });
    expect(
      await content('100000000000000782', { ...inPrivate, user: member.user })
    ).toBe(`${PRIVATE} private true ${PRIVATE} de`);
    expect(fake.discord.requestsTo('GET', `/channels/${THREAD}`)).toEqual([]);
    expect(fake.discord.requestsTo('GET', `/channels/${PRIVATE}`)).toEqual([]);
    expect(cli.output).not.toMatch(/[✗⚠]/);

    // Discord not saying where: nothing runs with a channel missing.
    expect(
      await content(
        '100000000000000783',
        use('100000000000000783', 'where', {
          channel_id: '100000000000000402',
        })
      )
    ).toBe('This command can not be used here.');
    await cli.waitFor(
      "⚠ src/commands/where.ts /where was used in a channel the bot can't answer in (Discord did not say which): it did not run."
    );
    // A kind of channel nobody can write in.
    expect(
      await content(
        '100000000000000784',
        use('100000000000000784', 'where', {
          channel_id: '100000000000000403',
          channel: { id: '100000000000000403', type: 4, guild_id: GUILD },
        })
      )
    ).toBe('This command can not be used here.');
    await cli.waitFor(
      /\/where was used in a channel the bot can't answer in \(type 4\)/
    );
  });

  it('keep who, where and in which server while they run, whatever happens meanwhile', async () => {
    const fake = await world();
    const THREAD = '100000000000000410';
    const cli = runDev(
      project({
        'src/commands/later.ts': `import { command } from 'chapterjs';
import { setTimeout as sleep } from 'node:timers/promises';
export default command({
  description: 'd',
  async run({ interaction }) {
    console.log('running');
    await sleep(400);
    await interaction.reply([
      interaction.channel.id,
      interaction.member.displayName,
      interaction.guild.name,
      interaction.member.guild.name,
    ].join(' '));
  },
});
`,
      }),
      fake
    );
    await cli.waitFor('✓ Commands updated on Dev Server');
    const connection = await connected(fake);
    const sent = answers(fake, '100000000000000791');
    const thread = {
      id: THREAD,
      type: 11,
      name: 'old-thread',
      guild_id: GUILD,
      parent_id: GENERAL,
    };
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000791', 'later', {
        channel_id: THREAD,
        channel: thread,
      })
    );
    await cli.waitFor('running');
    // While it runs: the thread is deleted and the person leaves.
    connection.dispatch('THREAD_DELETE', thread);
    connection.dispatch('GUILD_MEMBER_REMOVE', {
      guild_id: GUILD,
      user: { id: ALICE, username: 'alice', discriminator: '0' },
    });
    await waitUntil(() => sent.callbacks().length === 1, 'the answer');
    expect(
      (sent.callbacks()[0]!.body as { data: { content: string } }).data.content
    ).toBe(`${THREAD} alice Dev Server Dev Server`);
    expect(cli.output).not.toMatch(/[✗⚠]/);
  });

  it('are not shown twice in the dev server when production has them for everyone', async () => {
    const fake = await world();
    const cwd = project({
      'src/commands/ping.ts': PING,
      'src/commands/poll.ts': PING.replace(
        'Replies with Pong!',
        'Starts a poll'
      ),
      'src/commands/new.ts': PING.replace('Replies with Pong!', 'Brand new'),
    });
    // What a bot in production registered with the same token.
    fake.discord.on('GET', `/applications/${BOT}/commands`, {
      body: [
        {
          id: '100000000000000601',
          application_id: BOT,
          version: '1',
          type: 1,
          name: 'ping',
          description: 'Replies with Pong!',
          default_member_permissions: null,
          dm_permission: true,
          contexts: [0],
          integration_types: [0],
          nsfw: false,
          name_localizations: null,
          description_localizations: null,
        },
        {
          id: '100000000000000602',
          application_id: BOT,
          version: '1',
          type: 1,
          name: 'poll',
          description: 'The poll of last month',
          default_member_permissions: null,
          contexts: [0],
          integration_types: [0],
        },
      ],
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ Commands updated on Dev Server');
    // /ping is already there for everyone, as it is here: not given again.
    expect(registered(fake)[0]!.map(command => command.name)).toEqual([
      'new',
      'poll',
    ]);
    expect(
      fake.discord.requestsTo('GET', `/applications/${BOT}/commands`)[0]!.query
    ).toEqual({ with_localizations: ['true'] });
    // /poll changed: its new form has to be there to be tried. Said once.
    expect(cli.output).toContain(
      'ℹ /poll is not the same here as in production, so Dev Server shows it twice: yours, and the one everyone has. It is shown once again when production runs your version.'
    );
    expect(cli.output).not.toContain('/ping is not the same');
    expect(cli.output).not.toContain('/new is not the same');

    // Used in the dev server, the one for everyone runs the code of dev.
    const connection = await connected(fake);
    const sent = answers(fake, '100000000000000830');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000830', 'ping')
    );
    await waitUntil(() => sent.callbacks().length === 1, 'the answer to /ping');
    expect(
      (sent.callbacks()[0]!.body as { data: { content: string } }).data.content
    ).toBe('Pong!');

    // Changing /ping makes it differ: it is given, and said, from then on.
    writeFileSync(
      join(cwd, 'src/commands/ping.ts'),
      PING.replace('Replies with Pong!', 'Answers')
    );
    await cli.waitFor('↻ Commands updated on Discord');
    expect(registered(fake)[1]!.map(command => command.name)).toEqual([
      'new',
      'ping',
      'poll',
    ]);
    expect(cli.output).toContain(
      'ℹ /ping is not the same here as in production'
    );
    expect(cli.output.match(/\/poll is not the same/g)).toHaveLength(1);
    // The list of production is asked once, not at every save.
    expect(
      fake.discord.requestsTo('GET', `/applications/${BOT}/commands`)
    ).toHaveLength(1);
  });

  it('give the dev server everything when Discord does not say what everyone has', async () => {
    const fake = await world();
    fake.discord.on('GET', `/applications/${BOT}/commands`, {
      status: 500,
      body: { message: 'Internal Server Error' },
    });
    const cli = runDev(project({ 'src/commands/ping.ts': PING }), fake);
    await cli.waitFor('✓ Commands updated on Dev Server');
    expect(registered(fake)[0]!.map(command => command.name)).toEqual(['ping']);
    expect(cli.output).not.toContain('✗');
  });

  it('leave to production what only works in private messages', async () => {
    const fake = await world();
    const place = (where: string) =>
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', where: '${where}', async run({ interaction }) { await interaction.reply('ok'); } });\n`;
    const cwd = project({
      'src/commands/server.ts': place('guild'),
      'src/commands/private.ts': place('dm'),
      'src/commands/anywhere.ts': place('both'),
      'src/commands/mixed/a.ts': place('dm'),
      'src/commands/mixed/b.ts': place('both'),
      'src/commands/secret/only.ts': place('dm'),
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ Commands updated on Dev Server');
    // Discord never offers the commands of a server in private messages:
    // what only works there is not sent, and the developer is told once.
    expect(registered(fake)[0]!.map(command => command.name)).toEqual([
      'anywhere',
      'mixed',
      'server',
    ]);
    expect(
      (registered(fake)[0]![1]!.options as { name: string }[]).map(
        option => option.name
      )
    ).toEqual(['b']);
    for (const [file, name] of [
      ['src/commands/private.ts', '/private'],
      ['src/commands/mixed/a.ts', '/mixed a'],
      ['src/commands/secret/only.ts', '/secret only'],
    ]) {
      expect(cli.output).toContain(
        `ℹ ${file} ${name} only works in private messages, and chapterjs dev only runs your bot in Dev Server. Try it with chapterjs start.`
      );
    }
    expect(cli.output.match(/only works in private messages/g)).toHaveLength(3);
    // Said once per file, not at every save.
    writeFileSync(
      join(cwd, 'src/commands/server.ts'),
      place('guild').replace("'d'", "'changed'")
    );
    await cli.waitFor('↻ Commands updated on Discord');
    expect(cli.output.match(/only works in private messages/g)).toHaveLength(3);

    // Used in private all the same (the bot in production offers it):
    // the dev bot is not the one that answers.
    const connection = await connected(fake);
    const sent = answers(fake, '100000000000000820');
    const {
      guild_id: _guild,
      member,
      ...inPrivate
    } = use('100000000000000820', 'anywhere', {
      channel_id: '100000000000000421',
      channel: { id: '100000000000000421', type: 1 },
    });
    connection.dispatch('INTERACTION_CREATE', {
      ...inPrivate,
      user: member.user,
    });
    const inServer = answers(fake, '100000000000000821');
    connection.dispatch(
      'INTERACTION_CREATE',
      use('100000000000000821', 'anywhere')
    );
    await waitUntil(
      () => inServer.callbacks().length === 1,
      'the answer in the server'
    );
    expect(sent.callbacks()).toEqual([]);
  });

  it('only run where they say they work, and receive what that place has', async () => {
    const fake = await world();
    const PRIVATE = '100000000000000420';
    const place = (where: string) => `import { command } from 'chapterjs';
export default command({
  description: 'd',
  where: '${where}',
  async run(context) {
    await context.interaction.reply([
      'guild' in context ? String((context as { guild: { name: string } | null }).guild?.name ?? null) : 'no guild key',
      'member' in context ? 'member key' : 'no member key',
      context.channel.isDM() ? 'private' : 'server channel',
    ].join(', '));
  },
});
`;
    const cwd = project({
      'src/commands/server.ts': place('guild'),
      'src/commands/private.ts': place('dm'),
      'src/commands/anywhere.ts': place('both'),
      'src/commands/mixed/a.ts': place('dm'),
      'src/commands/mixed/b.ts': place('both'),
      'src/commands/secret/only.ts': place('dm'),
    });
    // For everyone: Discord is told where each command works.
    const cli = runProduction(cwd, fake);
    await cli.waitFor('✓ Commands updated for everyone');
    const everyone = fake.discord
      .requestsTo('PUT', `/applications/${BOT}/commands`)
      .map(request => request.body as { name: string; contexts: number[] }[]);
    expect(everyone).toHaveLength(1);
    expect(everyone[0]!.map(({ name, contexts }) => [name, contexts])).toEqual([
      ['anywhere', [0, 1]],
      ['mixed', [0, 1]],
      ['private', [1]],
      ['secret', [1]],
      ['server', [0]],
    ]);

    const connection = await connected(fake);
    const content = async (id: string, interaction: object) => {
      const sent = answers(fake, id);
      connection.dispatch('INTERACTION_CREATE', interaction);
      await waitUntil(() => sent.callbacks().length === 1, `the answer ${id}`);
      return (sent.callbacks()[0]!.body as { data: { content: string } }).data
        .content;
    };
    const inPrivate = (id: string, name: string, data = {}) => {
      const {
        guild_id: _guild,
        member,
        ...rest
      } = use(
        id,
        name,
        { channel_id: PRIVATE, channel: { id: PRIVATE, type: 1 } },
        data
      );
      return { ...rest, user: member.user };
    };
    const sub = (name: string) => ({ options: [{ name, type: 1 }] });

    // In the server.
    expect(
      await content('100000000000000801', use('100000000000000801', 'server'))
    ).toBe('Dev Server, member key, server channel');
    expect(
      await content('100000000000000802', use('100000000000000802', 'anywhere'))
    ).toBe('Dev Server, member key, server channel');
    expect(
      await content('100000000000000803', use('100000000000000803', 'private'))
    ).toBe('This command can only be used in a private message with me.');
    expect(
      await content(
        '100000000000000804',
        use('100000000000000804', 'mixed', {}, sub('a'))
      )
    ).toBe('This command can only be used in a private message with me.');
    // In a private message.
    expect(
      await content(
        '100000000000000805',
        inPrivate('100000000000000805', 'private')
      )
    ).toBe('no guild key, no member key, private');
    expect(
      await content(
        '100000000000000806',
        inPrivate('100000000000000806', 'anywhere')
      )
    ).toBe('null, member key, private');
    expect(
      await content(
        '100000000000000807',
        inPrivate('100000000000000807', 'server')
      )
    ).toBe('This command can only be used in a server.');
    expect(
      await content(
        '100000000000000808',
        inPrivate('100000000000000808', 'mixed', sub('b'))
      )
    ).toBe('null, member key, private');
    expect(cli.output).not.toMatch(/[✗⚠]/);

    // A private message always comes from a private conversation: anything
    // else is not something a command of private messages can be given.
    const odd = inPrivate('100000000000000810', 'anywhere');
    expect(
      await content('100000000000000810', {
        ...odd,
        channel: { id: PRIVATE + '1', type: 0 },
        channel_id: PRIVATE + '1',
      })
    ).toBe('This command can not be used here.');
    await cli.waitFor(
      /\/anywhere was used in a channel the bot can't answer in \(type 0\)/
    );
  });

  it('are typed from their own declaration', async () => {
    const fake = await world();
    const cwd = project({
      'src/commands/ok.ts': `import { command, type Guild, type GuildMember, type User } from 'chapterjs';
export default command({
  description: 'd',
  options: {
    target: { type: 'user', description: 'd', required: true },
    days: { type: 'integer', description: 'd' },
    reason: { type: 'string', description: 'd', choices: ['spam', 'raid'], required: true },
    level: { type: 'number', description: 'd', choices: { Low: 1, High: 2 } },
  },
  async run({ options, guild, member, interaction, channel }) {
    const target: User = options.target;
    const days: number | undefined = options.days;
    const reason: 'spam' | 'raid' = options.reason;
    const level: 1 | 2 | undefined = options.level;
    const where: Guild = guild;
    const who: GuildMember = member;
    // The interaction says the same as the context: used in a server.
    const sameWhere: Guild = interaction.guild;
    const sameWho: GuildMember = interaction.member;
    const id: string = interaction.guildId;
    // Where it was used is always known, and so is the language.
    const channelName: string = channel.name + interaction.channel.name;
    const language: string = interaction.locale + interaction.channelId;
    void [sameWhere, sameWho, id, channelName, language, channel.guild.name];
    await interaction.reply({ content: [target, days, reason, level, where, who].join(), ephemeral: true });
  },
});
`,
      'src/commands/dm.ts': `import { command, type Guild } from 'chapterjs';
export default command({
  description: 'd',
  where: 'both',
  run({ guild }) { const where: Guild = guild; return where; },
});
`,
      'src/commands/dm-interaction.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  where: 'both',
  run({ interaction }) { return [interaction.guild?.name, interaction.member?.id, interaction.guild.name]; },
});
`,
      // One check tells the place, for everything at once.
      'src/commands/both-ok.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  where: 'both',
  async run({ guild, member, channel, interaction }) {
    if (guild) return interaction.reply(member.displayName + channel.name + interaction.member.id);
    await interaction.reply(String(channel.recipientId) + String(interaction.guild satisfies null));
  },
});
`,
      // Only private messages: nothing about a server exists.
      'src/commands/only-dm.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  where: 'dm',
  async run(context) {
    await context.interaction.reply(String(context.channel.recipientId));
    return context.guild;
  },
});
`,
      'src/commands/place.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', where: 'server', run() {} });
`,
      'src/commands/wrong.ts': `import { command } from 'chapterjs';
export default command({
  description: 'd',
  options: { days: { type: 'integer', description: 'd' } },
  run({ options }) { const days: number = options.days; return [days, options.nope]; },
});
`,
      'src/commands/typo.ts': `import { command } from 'chapterjs';
export default command({ description: 'd', options: { a: { type: 'strin', description: 'd' } }, run() {} });
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
      { cwd, encoding: 'utf8' }
    );
    const errors = result.stdout
      .split('\n')
      .filter(line => line.includes('error TS'))
      .sort();
    expect(errors.map(error => error.replace(/\(\d+,\d+\).*/, ''))).toEqual([
      'src/commands/dm-interaction.ts',
      'src/commands/dm.ts',
      'src/commands/only-dm.ts',
      'src/commands/place.ts',
      'src/commands/typo.ts',
      'src/commands/wrong.ts',
      'src/commands/wrong.ts',
    ]);
    expect(errors[0]).toMatch(/'interaction\.guild' is possibly 'null'/);
    expect(errors[1]).toMatch(
      /Type 'Guild \| null' is not assignable to type 'Guild'/
    );
    expect(errors[2]).toMatch(/Property 'guild' does not exist on type/);
    expect(errors[3]).toMatch(
      /'"server"' is not assignable to type 'CommandWhere/
    );
    expect(errors[4]).toMatch(/'"strin"' is not assignable/);
    expect(errors[5]).toMatch(
      /Type 'number \| undefined' is not assignable to type 'number'/
    );
    expect(errors[6]).toMatch(/Property 'nope' does not exist/);
  });
});

describe.skipIf(process.platform === 'win32')(
  'translations of commands',
  () => {
    const BAN = `import { command } from 'chapterjs';
export default command({
  description: 'Ban a member',
  options: {
    target: { type: 'user', description: 'Who to ban', required: true },
    reason: { type: 'string', description: 'Why', choices: ['spam', 'raid'] },
    level: { type: 'integer', description: 'How bad', choices: { Low: 1, High: 2 } },
    note: { type: 'string', description: 'A note' },
  },
  locales: {
    fr: {
      name: 'bannir',
      description: 'Bannir un membre',
      options: {
        target: { name: 'cible', description: 'Qui bannir' },
        reason: { name: 'raison', choices: { spam: 'Pourriel' } },
        level: { description: 'Gravité', choices: { Low: 'Faible', High: 'Élevé' } },
      },
    },
    'es-ES': { description: 'Expulsar a un miembro', options: { reason: { choices: { spam: 'Correo basura', raid: 'Asalto' } } } },
  },
  async run({ interaction, options }) {
    await interaction.reply(String(options.reason));
  },
});
`;
    const sub = (description: string, locales: string) =>
      `import { command } from 'chapterjs';\nexport default command({ description: '${description}', locales: ${locales}, run() {} });\n`;

    it('are sent to Discord with the commands; folders keep the name they have', async () => {
      const fake = await world();
      const cwd = project({
        'src/commands/ban.ts': BAN,
        'src/commands/mod/kick.ts': sub(
          'Kick a member',
          `{ fr: { name: 'expulser' }, de: { name: 'rauswerfen' } }`
        ),
        'src/commands/mod/warn.ts': sub(
          'Warn a member',
          `{ fr: { name: 'avertir', description: 'Avertir un membre' } }`
        ),
        'src/commands/mod/roles/add.ts': sub(
          'Give a role',
          `{ fr: { name: 'ajouter', description: 'Donner un rôle' } }`
        ),
        'src/commands/plain/sub.ts': sub('Nothing translated here', `{}`),
      });
      const cli = runDev(cwd, fake);
      await cli.waitFor('✓ 5 commands loaded');
      await cli.waitFor('✓ Commands updated on Dev Server');
      expect(registered(fake)[0]).toEqual([
        {
          type: 1,
          name: 'ban',
          description: 'Ban a member',
          name_localizations: { fr: 'bannir' },
          description_localizations: {
            fr: 'Bannir un membre',
            'es-ES': 'Expulsar a un miembro',
          },
          default_member_permissions: null,
          options: [
            {
              type: 6,
              name: 'target',
              description: 'Who to ban',
              name_localizations: { fr: 'cible' },
              description_localizations: { fr: 'Qui bannir' },
              required: true,
            },
            {
              type: 3,
              name: 'reason',
              description: 'Why',
              name_localizations: { fr: 'raison' },
              choices: [
                {
                  name: 'spam',
                  value: 'spam',
                  name_localizations: {
                    fr: 'Pourriel',
                    'es-ES': 'Correo basura',
                  },
                },
                {
                  name: 'raid',
                  value: 'raid',
                  name_localizations: { 'es-ES': 'Asalto' },
                },
              ],
            },
            {
              type: 4,
              name: 'level',
              description: 'How bad',
              description_localizations: { fr: 'Gravité' },
              choices: [
                { name: 'Low', value: 1, name_localizations: { fr: 'Faible' } },
                { name: 'High', value: 2, name_localizations: { fr: 'Élevé' } },
              ],
            },
            // Nothing translated: nothing added.
            { type: 3, name: 'note', description: 'A note' },
          ],
        },
        {
          type: 1,
          name: 'mod',
          // A folder has no file: its description, which Discord never shows, is generated.
          description: 'mod commands',
          default_member_permissions: null,
          options: [
            {
              type: 1,
              name: 'kick',
              description: 'Kick a member',
              name_localizations: { fr: 'expulser', de: 'rauswerfen' },
            },
            {
              type: 1,
              name: 'warn',
              description: 'Warn a member',
              name_localizations: { fr: 'avertir' },
              description_localizations: { fr: 'Avertir un membre' },
            },
            {
              type: 2,
              name: 'roles',
              description: 'roles commands',
              options: [
                {
                  type: 1,
                  name: 'add',
                  description: 'Give a role',
                  name_localizations: { fr: 'ajouter' },
                  description_localizations: { fr: 'Donner un rôle' },
                },
              ],
            },
          ],
        },
        {
          type: 1,
          name: 'plain',
          description: 'plain commands',
          default_member_permissions: null,
          options: [
            { type: 1, name: 'sub', description: 'Nothing translated here' },
          ],
        },
      ]);

      // Whatever the language, the code receives the names it declared.
      const connection = await connected(fake);
      const sent = answers(fake, '100000000000000701');
      connection.dispatch(
        'INTERACTION_CREATE',
        use(
          '100000000000000701',
          'ban',
          { locale: 'fr' },
          {
            options: [
              { name: 'target', type: 6, value: ALICE },
              { name: 'reason', type: 3, value: 'spam' },
            ],
            resolved: {
              users: {
                [ALICE]: { id: ALICE, username: 'alice', discriminator: '0' },
              },
            },
          }
        )
      );
      await waitUntil(
        () => sent.callbacks().length === 1,
        'the answer to /ban'
      );
      expect(
        (sent.callbacks()[0]!.body as { data: { content: string } }).data
          .content
      ).toBe('spam');

      // A translation is something people see: changing one tells Discord.
      writeFileSync(
        join(cwd, 'src/commands/ban.ts'),
        BAN.replace('Bannir un membre', 'Bannir quelqu’un')
      );
      await cli.waitFor('↻ Commands updated on Discord');
      expect(registered(fake)[1]![0]).toMatchObject({
        description_localizations: { fr: 'Bannir quelqu’un' },
      });
    });

    const withLocales = (
      locales: string,
      options = `{ target: { type: 'user', description: 'd' }, other: { type: 'string', description: 'd', choices: ['a', 'b'] } }`
    ) =>
      `import { command } from 'chapterjs';\nexport default command({ description: 'd', options: ${options}, locales: ${locales} as never, run() {} });\n`;

    it.each([
      [
        'src/commands/bad.ts',
        withLocales(`{ klingon: { name: 'x' } }`),
        /"klingon" is not a language Discord knows\. Languages are: id, da, de, en-GB, en-US/,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: 'Bannir' }`),
        /the "fr" translation must be an object like \{ name: '\.\.\.', description: '\.\.\.' \}\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { title: 'x' } }`),
        /"title" is not something the "fr" translation has\. It can have: name, description, options\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { name: 'Bannir' } }`),
        /"Bannir" can't be the name of this command in the "fr" translation: use lowercase letters, digits, - and _ only/,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { name: 'bannir membre' } }`),
        /"bannir membre" can't be the name of this command in the "fr" translation: use lowercase letters, digits, - and _ only/,
      ],
      [
        'src/commands/mod/bad.ts',
        withLocales(`{ fr: { name: 'modération bannir' } }`),
        /"modération bannir" can't be the name of this command in the "fr" translation/,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { name: 5 } }`),
        /5 can't be the name of this command in the "fr" translation/,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { description: '' } }`),
        /this command in the "fr" translation needs a description/,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { description: 'x'.repeat(101) } }`),
        /The description of this command in the "fr" translation is 101 characters long: Discord accepts 100 at most\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { options: { cible: { name: 'x' } } } }`),
        /the "fr" translation translates an option "cible" that this command does not have\. Its options are: target, other\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { options: { target: { name: 'Ma Cible' } } } }`),
        /"Ma Cible" can't be the name of the option "target" in the "fr" translation/,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { options: { target: { label: 'x' } } } }`),
        /"label" is not something the option "target" of the "fr" translation has\. It can have: name, description, choices\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { options: { target: { choices: { a: 'x' } } } } }`),
        /the "fr" translation translates choices of the option "target", which has no choices\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { options: { other: { choices: { c: 'x' } } } } }`),
        /the "fr" translation translates a choice "c" that the option "other" does not have\. Its choices are: a, b\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { options: { other: { choices: { a: '' } } } } }`),
        /The choice "a" of the option "other" in the "fr" translation must be a text of 1 to 100 characters\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(
          `{ fr: { options: { target: { name: 'cible' }, other: { name: 'cible' } } } }`
        ),
        /In the "fr" translation, the options "target" and "other" would both be called "cible"\./,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`{ fr: { options: { target: { name: 'other' } } } }`),
        /In the "fr" translation, the options? "target".+"other"/,
      ],
      [
        'src/commands/bad.ts',
        withLocales(`'fr'`),
        /"locales" is an object whose keys are languages: locales: \{ fr: \{ description: '\.\.\.' \} \}/,
      ],
    ])(
      'are checked when the file loads: %s %#',
      async (path, content, message) => {
        const fake = await world();
        const cli = runDev(
          project({ [path]: content, 'src/commands/ping.ts': PING }),
          fake
        );
        await cli.waitFor(message);
        await cli.waitFor('✓ 1 command loaded');
      }
    );

    it('are typed: a language, an option or a choice that does not exist is underlined', async () => {
      const fake = await world();
      const file = (locales: string) => `import { command } from 'chapterjs';
export default command({
  description: 'd',
  options: { target: { type: 'user', description: 'd' }, reason: { type: 'string', description: 'd', choices: ['spam'] }, size: { type: 'integer', description: 'd', choices: { Big: 2 } } },
  locales: ${locales},
  run({ options }) { return options.target; },
});
`;
      const cwd = project({
        'src/commands/ok.ts': file(
          `{ fr: { name: 'x', description: 'd', options: { target: { name: 'cible' }, reason: { choices: { spam: 'Pourriel' } }, size: { choices: { Big: 'Grand' } } } }, 'pt-BR': {} }`
        ),
        'src/commands/language.ts': file(`{ french: { name: 'x' } }`),
        'src/commands/option.ts': file(
          `{ fr: { options: { cible: { name: 'x' } } } }`
        ),
        'src/commands/choice.ts': file(
          `{ fr: { options: { reason: { choices: { raid: 'x' } } } } }`
        ),
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
      expect(errors.map(error => error.replace(/\(\d+,\d+\).*/, ''))).toEqual([
        'src/commands/choice.ts',
        'src/commands/language.ts',
        'src/commands/option.ts',
      ]);
      expect(errors[0]).toMatch(/'raid' does not exist/);
      expect(errors[1]).toMatch(/'french' does not exist/);
      expect(errors[2]).toMatch(/'cible' does not exist/);
    });
  }
);

describe.skipIf(process.platform === 'win32')('organising files', () => {
  const answering = (text: string) => `import { command } from 'chapterjs';
export default command({ description: 'd', async run({ interaction }) { await interaction.reply('${text} ' + interaction.commandName); } });
`;

  it('ignores what starts with _, and reads through folders in parentheses', async () => {
    const fake = await world();
    const cwd = project({
      // Private: never commands, whatever they export. Free to be imported.
      'src/commands/_handler.ts': `console.log('private file ran on its own');\nexport const shout = (text: string): string => text.toUpperCase();\n`,
      'src/commands/_shared/texts.ts': `export const hello: string = 'hello';\n`,
      'src/commands/mod/_checks.ts': `export default 'not a command';\n`,
      'src/commands/(moderation)/_notes.ts': `export default 'not a command either';\n`,
      // Groups: only for the developer, at any depth.
      'src/commands/(moderation)/(punishment)/ban.ts': `import { command } from 'chapterjs';
import { shout } from '../../_handler';
import { hello } from '../../_shared/texts';
export default command({ description: 'd', async run({ interaction }) { await interaction.reply(shout(hello) + ' ' + interaction.commandName); } });
`,
      'src/commands/(moderation)/mod/kick.ts': answering('kick'),
      'src/commands/mod/(roles)/roles/(deep)/add.ts': answering('add'),
      'src/commands/(fun)/ping.ts': PING,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('private file ran on its own');
    await cli.waitFor('✓ 4 commands loaded');
    await cli.waitFor('✓ Commands updated on Dev Server');
    expect(cli.output).not.toMatch(/[✗⚠]/);
    // The private file ran once: because a command imports it.
    expect(cli.output.match(/private file ran on its own/g)).toHaveLength(1);
    const shape = (options: unknown): unknown =>
      (
        options as
          { name: string; type: number; options?: unknown }[] | undefined
      )?.map(option =>
        option.type === 2
          ? { [option.name]: shape(option.options) }
          : option.name
      );
    expect(
      registered(fake)[0]!.map(command => [
        command.name,
        shape(command.options),
      ])
    ).toEqual([
      ['ban', undefined],
      ['mod', ['kick', { roles: ['add'] }]],
      ['ping', undefined],
    ]);

    const connection = await connected(fake);
    const ban = answers(fake, '100000000000000751');
    connection.dispatch('INTERACTION_CREATE', use('100000000000000751', 'ban'));
    await waitUntil(() => ban.callbacks().length === 1, 'the answer to /ban');
    expect(
      (ban.callbacks()[0]!.body as { data: { content: string } }).data.content
    ).toBe('HELLO /ban');
    const add = answers(fake, '100000000000000752');
    connection.dispatch(
      'INTERACTION_CREATE',
      use(
        '100000000000000752',
        'mod',
        {},
        {
          options: [
            { name: 'roles', type: 2, options: [{ name: 'add', type: 1 }] },
          ],
        }
      )
    );
    await waitUntil(
      () => add.callbacks().length === 1,
      'the answer to /mod roles add'
    );
    expect(
      (add.callbacks()[0]!.body as { data: { content: string } }).data.content
    ).toBe('add /mod roles add');

    // A private file is watched like the others: what imports it follows.
    writeFileSync(
      join(cwd, 'src/commands/_shared/texts.ts'),
      `export const hello: string = 'bye';\n`
    );
    await cli.waitFor(/↻ Reloaded in \d+ ms, 4 commands loaded/);
    const again = answers(fake, '100000000000000753');
    connection.dispatch('INTERACTION_CREATE', use('100000000000000753', 'ban'));
    await waitUntil(
      () => again.callbacks().length === 1,
      'the second answer to /ban'
    );
    expect(
      (again.callbacks()[0]!.body as { data: { content: string } }).data.content
    ).toBe('BYE /ban');
  });

  it('counts depth and names without the folders in parentheses', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        // Three real folders is too deep, however they are grouped.
        'src/commands/(x)/a/(y)/b/c/(z)/bad.ts': PING,
        // Parentheses around a name with capitals or spaces are fine.
        'src/commands/(My Tools)/(Très Utile)/ping.ts': PING,
        // Not a group: the name of the folder is part of the command.
        'src/commands/(half/ping.ts': PING,
      }),
      fake
    );
    await cli.waitFor('✓ 1 command loaded');
    expect(cli.output).toMatch(
      /✗ src\/commands\/\(x\)\/a\/\(y\)\/b\/c\/\(z\)\/bad\.ts This file is 3 folders deep/
    );
    expect(cli.output).toMatch(
      /✗ src\/commands\/\(half\/ping\.ts "\(half" can't be in the name of a command/
    );
    expect(cli.output.match(/✗/g)).toHaveLength(2);
  });

  it('refuses two files that are the same command in different groups', async () => {
    const fake = await world();
    const cli = runDev(
      project({
        'src/commands/(a)/ban.ts': answering('first'),
        'src/commands/(b)/ban.ts': answering('second'),
        'src/commands/ping.ts': PING,
      }),
      fake
    );
    await cli.waitFor(
      "✗ src/commands/(b)/ban.ts /ban is already src/commands/(a)/ban.ts: two files can't be the same command. A folder in parentheses only groups files, it is not part of the name."
    );
    await cli.waitFor('✓ 2 commands loaded');
    const connection = await connected(fake);
    const ban = answers(fake, '100000000000000761');
    connection.dispatch('INTERACTION_CREATE', use('100000000000000761', 'ban'));
    await waitUntil(() => ban.callbacks().length === 1, 'the answer to /ban');
    expect(
      (ban.callbacks()[0]!.body as { data: { content: string } }).data.content
    ).toBe('first /ban');
  });

  it('works the same for events, which stay typed inside groups', async () => {
    const fake = await world({ flags: 0 });
    const cwd = project({
      'src/events/_helpers.ts': `export const label: string = 'online';\n`,
      'src/events/ready/_private.ts': `console.log('private event file ran');\nexport default 'not an event';\n`,
      'src/events/(lifecycle)/ready/(startup)/hello.ts': `import { event } from 'chapterjs';
import { label } from '../../../_helpers';
export default event(({ user }) => console.log(label, user.username));
`,
      'src/events/(logs)/(roles)/roleDelete/log.ts': `import { event } from 'chapterjs';
export default event(({ roleId, role }) => console.log('role gone', roleId, role.name));
`,
      'src/events/(logs)/typo.ts': `import { event } from 'chapterjs';\nexport default event(() => {});\n`,
      'src/events/(logs)/roleDelete/wrong.ts': `import { event } from 'chapterjs';
export default event(({ member }) => member);
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
    const cli = runDev(cwd, fake);
    // A file directly in a group is still not in an event folder.
    await cli.waitFor(
      /✗ src\/events\/\(logs\)\/typo\.ts This file is directly in src\/events\//
    );
    await cli.waitFor('✓ 3 events loaded');
    await cli.waitFor('online test-bot');
    expect(cli.output).not.toContain('private event file ran');
    const connection = await connected(fake);
    connection.dispatch('GUILD_ROLE_CREATE', {
      guild_id: GUILD,
      role: {
        id: '100000000000000010',
        name: 'Mod',
        permissions: '0',
        position: 1,
      },
    });
    connection.dispatch('GUILD_ROLE_DELETE', {
      guild_id: GUILD,
      role_id: '100000000000000010',
    });
    await cli.waitFor('role gone 100000000000000010 Mod');
    cli.signal('SIGTERM');
    await cli.exited;

    const result = spawnSync(
      join(packageDir, 'node_modules/.bin/tsc'),
      ['-b'],
      { cwd, encoding: 'utf8' }
    );
    const errors = result.stdout
      .split('\n')
      .filter(line => line.includes('error TS'));
    expect(errors.sort()).toEqual([
      expect.stringMatching(
        /^src\/events\/\(logs\)\/roleDelete\/wrong\.ts\(2,\d+\): error TS2339: Property 'member' does not exist/
      ),
      // Not in an event folder: there is no event to write here.
      expect.stringMatching(
        /^src\/events\/\(logs\)\/typo\.ts\(1,\d+\): error TS2305: Module '"chapterjs"' has no exported member 'event'/
      ),
    ]);
  });
});
