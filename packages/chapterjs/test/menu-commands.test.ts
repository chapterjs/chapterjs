// Menu commands: `command({ type: 'message' | 'user' })`, used with a right
// click on a message or a person. Checked when they load, registered with
// the slash commands, run with what they were used on, and tried by
// `chapterjs test`.
// https://docs.discord.com/developers/interactions/application-commands#user-commands
// https://docs.discord.com/developers/interactions/application-commands#message-commands
import { spawnSync } from 'node:child_process';
import { cpSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '@chapterjs/test-utils';
import { describe, expect, it } from 'vitest';
import { command } from '../src/commands/command.js';
import {
  commandDeclaration,
  scanCommands,
} from '../src/commands/declaration.js';
import {
  buildCommands,
  describeCommand,
  findConflicts,
  MAX_MENUS,
} from '../src/commands/tree.js';
import { withoutGlobalTwins } from '../src/commands/twins.js';
import {
  ALICE,
  bin,
  BOT,
  GUILD,
  packageDir,
  project,
  rawMessage,
  runDev,
  site,
  useCommand,
  world,
  type FakeWorld,
} from './dev-helpers.js';

const read = (config: unknown, file = 'src/menu.ts') =>
  commandDeclaration.read(command(config as never) as never, site(file));

const entry = (config: Record<string, unknown>, file = 'src/menu.ts') => ({
  ...site(file),
  command: read({ run() {}, ...config }, file),
});

describe('a menu command, when it loads', () => {
  it('is read with its type, its name as written, and no texts to find', () => {
    const report = read({
      type: 'message',
      name: 'Report message',
      locales: { fr: { name: 'Signaler le message' } },
      permissions: ['ManageMessages'],
      where: 'both',
      nsfw: true,
      ephemeral: true,
      cooldown: '10s',
      run() {},
    });
    expect(report).toMatchObject({
      type: 'message',
      path: ['Report message'],
      names: { fr: 'Signaler le message' },
      described: true,
      description: '',
      options: [],
      permissions: 1n << 13n,
      where: 'both',
      nsfw: true,
      ephemeral: true,
      cooldown: { user: 10_000, channel: 0, guild: 0 },
    });
    expect(read({ type: 'user', name: 'Show avatar', run() {} })).toMatchObject(
      { type: 'user', path: ['Show avatar'], where: 'guild' }
    );
    // A slash command says what it is too.
    expect(read({ name: 'ping', description: 'd', run() {} }).type).toBe(
      'slash'
    );
    // Exactly 32 characters, emoji counted as one.
    expect(
      read({ type: 'user', name: `${'a'.repeat(31)}🙂`, run() {} }).path
    ).toEqual([`${'a'.repeat(31)}🙂`]);
  });

  it.each([
    [
      { type: 'chat', name: 'x' },
      `"type" is what a menu command is used on: 'message' (a right click on a message) or 'user' (a right click on a person). Got "chat". Leave it out for a slash command.`,
    ],
    [
      { type: 'message', name: 'X', description: 'd' },
      `A menu command has no "description": Discord only shows its name. Remove it.`,
    ],
    [
      { type: 'message', name: 'X', options: {} },
      `A menu command has no "options": it receives what it was used on (message). Remove it, or make it a slash command (no "type").`,
    ],
    [
      { type: 'user', name: 'X', autocomplete: {} },
      `A menu command has no "autocomplete": it receives what it was used on (target). Remove it, or make it a slash command (no "type").`,
    ],
    [
      { type: 'user', name: 'X', color: 'red' },
      `"color" is not something a menu command has. It can have: type, name, locales, permissions, where, nsfw, ephemeral, cooldown, run.`,
    ],
    [
      { type: 'user' },
      `this user menu command has no "name": what the menu shows, like name: 'Report message'.`,
    ],
    [
      { type: 'message', name: '   ' },
      `this message menu command has no "name": what the menu shows, like name: 'Report message'.`,
    ],
    [
      { type: 'message', name: ' Report' },
      `The name " Report" of this message menu command starts or ends with a space: remove it.`,
    ],
    [
      { type: 'message', name: 'a'.repeat(33) },
      `The name "${'a'.repeat(33)}" of this message menu command is 33 characters long: Discord accepts 32 at most.`,
    ],
    [
      { type: 'user', name: 'X', locales: { klingon: { name: 'Y' } } },
      /^"klingon" is not a language Discord knows/,
    ],
    [
      { type: 'user', name: 'X', locales: { fr: { description: 'Y' } } },
      `"description" is not something the "fr" translation has. It can have: name.`,
    ],
    [
      { type: 'user', name: 'X', locales: { fr: { name: 'b'.repeat(33) } } },
      `The name "${'b'.repeat(33)}" of this command in the "fr" translation is 33 characters long: Discord accepts 32 at most.`,
    ],
    [
      { type: 'user', name: 'X', locales: 'fr' },
      `"locales" is an object whose keys are languages: locales: { fr: { name: '...' } }`,
    ],
    [
      { type: 'user', name: 'X', where: 'dm', cooldown: { guild: '1m' } },
      /^"cooldown" has "guild", but this command only works in private messages/,
    ],
    [
      { type: 'user', name: 'X', permissions: ['Fly'] },
      /^"Fly" is not a permission/,
    ],
  ])('refuses %j, saying what to write', (config, message) => {
    expect(() => read({ run() {}, ...config })).toThrow(message);
  });

  it('needs a run function', () => {
    expect(() => read({ type: 'user', name: 'X' })).toThrow(
      /^This command has no "run"/
    );
  });

  it('is named in messages by what it is used on', () => {
    expect(
      describeCommand(read({ type: 'user', name: 'Avatar', run() {} }))
    ).toBe('the user menu "Avatar"');
    expect(
      describeCommand(read({ type: 'message', name: 'Quote', run() {} }))
    ).toBe('the message menu "Quote"');
    expect(
      describeCommand(read({ name: 'mod ban', description: 'd', run() {} }))
    ).toBe('/mod ban');
  });
});

describe('menu commands of a project', () => {
  it('may share a name with a slash command and a menu of the other type', () => {
    const { valid, conflicts } = findConflicts([
      entry({ name: 'report', description: 'd' }, 'src/a.ts'),
      entry({ type: 'message', name: 'report' }, 'src/b.ts'),
      entry({ type: 'user', name: 'report' }, 'src/c.ts'),
    ]);
    expect(conflicts).toEqual([]);
    expect(valid).toHaveLength(3);
  });

  it('refuses two menus of one type with the same name, on the later one', () => {
    const { valid, conflicts } = findConflicts([
      entry({ type: 'message', name: 'Quote' }, 'src/b.ts'),
      entry({ type: 'message', name: 'Quote' }, 'src/a.ts'),
    ]);
    expect(valid.map(one => one.file)).toEqual(['src/a.ts']);
    expect(conflicts).toEqual([
      {
        file: 'src/b.ts',
        export: 'default',
        message:
          'The message menu "Quote" is already declared in src/a.ts: two message menu commands can\'t have the same name.',
      },
    ]);
  });

  it(`keeps ${MAX_MENUS} menus of each type, as Discord does, and says so for the others`, () => {
    const many = (type: string) =>
      Array.from({ length: MAX_MENUS + 2 }, (_, index) =>
        entry(
          { type, name: `${type} ${String(index).padStart(2, '0')}` },
          `src/${type}-${String(index).padStart(2, '0')}.ts`
        )
      );
    const { valid, conflicts } = findConflicts([
      ...many('user'),
      ...many('message'),
      // Menus never count against slash commands, nor the other way round.
      entry({ name: 'ping', description: 'd' }, 'src/ping.ts'),
    ]);
    expect(valid).toHaveLength(MAX_MENUS * 2 + 1);
    expect(conflicts.map(one => one.message)).toEqual([
      'The message menu "message 15" is one message menu command too many: Discord accepts 15 at most. Remove one, or make it a slash command (no "type").',
      'The message menu "message 16" is one message menu command too many: Discord accepts 15 at most. Remove one, or make it a slash command (no "type").',
      'The user menu "user 15" is one user menu command too many: Discord accepts 15 at most. Remove one, or make it a slash command (no "type").',
      'The user menu "user 16" is one user menu command too many: Discord accepts 15 at most. Remove one, or make it a slash command (no "type").',
    ]);
  });

  it('never makes a menu with spaces the parent of a slash command', () => {
    const { conflicts } = findConflicts([
      entry({ type: 'message', name: 'mod' }, 'src/a.ts'),
      entry({ name: 'mod ban', description: 'd' }, 'src/b.ts'),
      entry({ type: 'user', name: 'mod ban' }, 'src/c.ts'),
    ]);
    expect(conflicts).toEqual([]);
  });

  it('are registered after the slash commands: a name, no description, no options', () => {
    const entries = [
      entry({ type: 'user', name: 'Show avatar', where: 'both' }),
      entry({
        type: 'message',
        name: 'Report',
        permissions: ['ManageMessages'],
        nsfw: true,
        locales: { fr: { name: 'Signaler' } },
      }),
      entry({ type: 'message', name: 'Private', where: 'dm' }),
      entry({ name: 'ping', description: 'd' }),
    ];
    expect(buildCommands(entries, { guild: false })).toEqual([
      expect.objectContaining({ type: 1, name: 'ping' }),
      {
        type: 3,
        name: 'Private',
        default_member_permissions: null,
        integration_types: [0],
        contexts: [1],
      },
      {
        type: 3,
        name: 'Report',
        name_localizations: { fr: 'Signaler' },
        default_member_permissions: String(1n << 13n),
        integration_types: [0],
        contexts: [0],
        nsfw: true,
      },
      {
        type: 2,
        name: 'Show avatar',
        default_member_permissions: null,
        integration_types: [0],
        contexts: [0, 1],
      },
    ]);
    // In one server: no contexts, and nothing that only works in private.
    expect(buildCommands(entries, { guild: true })).toEqual([
      expect.objectContaining({ type: 1, name: 'ping' }),
      {
        type: 3,
        name: 'Report',
        name_localizations: { fr: 'Signaler' },
        default_member_permissions: String(1n << 13n),
        nsfw: true,
      },
      { type: 2, name: 'Show avatar', default_member_permissions: null },
    ]);
  });

  it('are twins of the ones production has, by type and name', () => {
    const payloads = buildCommands(
      [
        entry({ type: 'message', name: 'Report' }),
        entry({ type: 'user', name: 'Report' }),
      ],
      { guild: true }
    );
    // What Discord gives back: an empty description, never sent.
    const global = [
      {
        id: '1',
        application_id: BOT,
        version: '1',
        type: 3 as const,
        name: 'Report',
        description: '',
        default_member_permissions: null,
      },
    ];
    expect(withoutGlobalTwins(payloads, global as never)).toEqual({
      kept: [payloads[1]],
      twins: ['the message menu "Report"'],
      changed: [],
    });
    const changed = [{ ...global[0]!, nsfw: true }];
    expect(withoutGlobalTwins(payloads, changed as never).changed).toEqual([
      'the message menu "Report"',
    ]);
  });

  it('are left out of what the language files may describe, when nothing runs', async () => {
    const cwd = tempDir();
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(cwd, 'src'));
    writeFileSync(
      join(cwd, 'src/a.ts'),
      `import { command } from 'chapterjs';
export const quote = command({ type: 'message', name: 'Quote', run() {} });
export const ping = command({ name: 'ping', run() {} });
export const avatar = command({
  name: 'Show avatar',
  type: "user",
  run() {},
});
export const pong = command({ name: 'pong', run() {} });
// The type of an option is not the type of the command.
export const kick = command({
  name: 'kick',
  options: { target: { type: 'user', required: true } },
  run() {},
});
export const report = command({ name: 'Report', run() {}, type: 'message' });
`
    );
    expect(await scanCommands(cwd)).toEqual(['kick', 'ping', 'pong']);
  });
});

const MENUS = `import { command } from 'chapterjs';

export const quote = command({
  type: 'message',
  name: 'Quote',
  async run({ interaction, message, user, guild }) {
    await interaction.reply(\`\${user.username} quoted \${message.author.username} in \${guild.name}: \${message.content.slice(0, 100)}\`);
  },
});

export const avatar = command({
  type: 'user',
  name: 'Show avatar',
  where: 'both',
  async run({ interaction, target, targetMember, guild }) {
    await interaction.reply(\`\${target.username} \${guild ? \`member: \${targetMember?.nick ?? 'none'}\` : 'in private'}\`);
  },
});

export const ping = command({
  name: 'quote',
  description: 'A slash command with the name of a menu',
  async run({ interaction }) {
    await interaction.reply('slash');
  },
});
`;

const registered = (fake: FakeWorld) =>
  fake.discord
    .requestsTo('PUT', `/applications/${BOT}/guilds/${GUILD}/commands`)
    .map(request => request.body as Record<string, unknown>[]);

const BOB = '100000000000000777';
const bob = { id: BOB, username: 'bob', discriminator: '0' };

describe.skipIf(process.platform === 'win32')('menu commands, running', () => {
  it('are registered with the others, and run with what they were used on', async () => {
    const fake = await world();
    const cwd = project({ 'src/menus.ts': MENUS });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ 3 commands loaded');
    await cli.waitFor('✓ Commands updated on Dev Server');
    expect(registered(fake)[0]).toEqual([
      expect.objectContaining({ type: 1, name: 'quote' }),
      { type: 3, name: 'Quote', default_member_permissions: null },
      { type: 2, name: 'Show avatar', default_member_permissions: null },
    ]);

    const message = rawMessage('100000000000000555', 'Hello there', {
      author: bob,
    });
    expect(
      await useCommand(fake, 'Quote', '100000000000000801', 0, {
        type: 3,
        target_id: message.id,
        resolved: { messages: { [message.id]: message } },
      })
    ).toBe('alice quoted bob in Dev Server: Hello there');
    // The slash command of the same name is another command.
    expect(await useCommand(fake, 'quote', '100000000000000802')).toBe('slash');

    expect(
      await useCommand(fake, 'Show avatar', '100000000000000803', 0, {
        type: 2,
        target_id: BOB,
        resolved: {
          users: { [BOB]: bob },
          members: {
            [BOB]: {
              nick: 'Bobby',
              roles: [],
              joined_at: '2024-01-01T00:00:00Z',
              deaf: false,
              mute: false,
              flags: 0,
            },
          },
        },
      })
    ).toBe('bob member: Bobby');
    // Someone who is not in the server: a user, and no member.
    expect(
      await useCommand(fake, 'Show avatar', '100000000000000804', 0, {
        type: 2,
        target_id: BOB,
        resolved: { users: { [BOB]: bob } },
      })
    ).toBe('bob member: none');

    // A menu whose file is gone is still on Discord a moment: refused plainly.
    expect(
      await useCommand(fake, 'Gone', '100000000000000805', 0, {
        type: 2,
        target_id: BOB,
        resolved: { users: { [BOB]: bob } },
      })
    ).toMatch(/not available/);
  });

  it('refuse what the person may not do, and keep a cooldown per menu', async () => {
    const fake = await world();
    const cwd = project({
      'src/menus.ts': `import { command } from 'chapterjs';
export const pin = command({
  type: 'message',
  name: 'Pin',
  permissions: ['ManageMessages'],
  async run({ interaction }) { await interaction.reply('pinned'); },
});
export const wave = command({
  type: 'user',
  name: 'Wave',
  cooldown: '1m',
  async run({ interaction, target }) { await interaction.reply(\`waved at \${target.username}\`); },
});
`,
    });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ Commands updated on Dev Server');
    const message = rawMessage('100000000000000556', 'x');
    // alice has Administrator in useCommand: allowed.
    expect(
      await useCommand(fake, 'Pin', '100000000000000811', 0, {
        type: 3,
        target_id: message.id,
        resolved: { messages: { [message.id]: message } },
      })
    ).toBe('pinned');
    const target = {
      type: 2,
      target_id: ALICE,
      resolved: {
        users: {
          [ALICE]: { id: ALICE, username: 'alice', discriminator: '0' },
        },
      },
    };
    expect(
      await useCommand(fake, 'Wave', '100000000000000812', 0, target)
    ).toBe('waved at alice');
    expect(
      await useCommand(fake, 'Wave', '100000000000000813', 0, target)
    ).toMatch(/again/i);
  });

  it('report a message menu Discord sent without its message, and answer plainly', async () => {
    const fake = await world();
    const cwd = project({ 'src/menus.ts': MENUS });
    const cli = runDev(cwd, fake);
    await cli.waitFor('✓ Commands updated on Dev Server');
    const answer = await useCommand(fake, 'Quote', '100000000000000821', 0, {
      type: 3,
      target_id: '100000000000000999',
    });
    expect(answer).not.toMatch(/Discord sent/);
    await cli.waitFor(
      'Discord sent the message menu "Quote" without the message it was used on.'
    );
  });

  it('are typed from their type and where they work', async () => {
    const fake = await world();
    const cwd = project({
      'src/ok.ts': `import { command, type GuildMember, type GuildMessage, type User } from 'chapterjs';
export const quote = command({
  type: 'message',
  name: 'Quote',
  async run({ message, guild, member, interaction }) {
    const inServer: GuildMessage = message;
    const name: string = guild.name + member.displayName + message.guild.name;
    await interaction.reply(inServer.content + name);
  },
});
export const avatar = command({
  type: 'user',
  name: 'Avatar',
  run({ target, targetMember }) {
    const user: User = target;
    const member: GuildMember | null = targetMember;
    return [user, member];
  },
});
export const anywhere = command({
  type: 'user',
  name: 'Anywhere',
  where: 'both',
  run({ guild, targetMember }) {
    if (guild) return targetMember?.guild.name;
    return targetMember satisfies null;
  },
});
`,
      'src/no-member.ts': `import { command } from 'chapterjs';
export const avatar = command({ type: 'user', name: 'Private', where: 'dm', run({ targetMember }) { return targetMember; } });
`,
      'src/no-options.ts': `import { command } from 'chapterjs';
export const quote = command({ type: 'message', name: 'Q', options: {}, run() {} });
`,
      'src/no-description.ts': `import { command } from 'chapterjs';
export const quote = command({ type: 'message', name: 'Q', description: 'd', run() {} });
`,
      'src/wrong-type.ts': `import { command } from 'chapterjs';
export const quote = command({ type: 'channel', name: 'Q', run() {} });
`,
      'src/no-target.ts': `import { command } from 'chapterjs';
export const quote = command({ type: 'message', name: 'Q', run({ target }) { return target; } });
`,
    });
    cpSync(
      join(packageDir, '../create-chapterjs/templates/default/tsconfig.json'),
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
      .sort();
    expect(errors.map(error => error.replace(/\(\d+,\d+\).*/, ''))).toEqual([
      'src/no-description.ts',
      'src/no-member.ts',
      'src/no-options.ts',
      'src/no-target.ts',
      'src/wrong-type.ts',
    ]);
    expect(errors[0]).toMatch(/'string' is not assignable to type 'undefined'/);
    expect(errors[1]).toMatch(/Property 'targetMember' does not exist/);
    expect(errors[2]).toMatch(/'\{\}' is not assignable to type 'undefined'/);
    expect(errors[3]).toMatch(/Property 'target' does not exist/);
    expect(errors[4]).toMatch(/'"channel"' is not assignable/);
  });
});

/** Runs `chapterjs test` in a project, and waits for it. */
function runTest(cwd: string): { code: number; output: string } {
  const result = spawnSync(process.execPath, [bin, 'test'], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', NO_COLOR: '1' },
  });
  return {
    code: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  };
}

describe.skipIf(process.platform === 'win32')(
  'menu commands in chapterjs test',
  () => {
    it('are each used on ordinary and hard targets, and in scenarios with { on }', () => {
      const cwd = project({
        'src/menus.ts': MENUS,
        'src/menus.test.ts': `import { scenario } from 'chapterjs/test';
import { avatar, quote } from './menus';

export const quoting = scenario('quote says who wrote it', async bot => {
  const alice = bot.member('alice');
  const said = await bot.say('Hello there', { by: alice });
  const reply = await bot.use(quote, { on: said }, { by: bot.member('carol') });
  reply.says('carol quoted alice in Test Server: Hello there');
});

export const showing = scenario('avatar shows the member', async bot => {
  const bob = bot.member('bob');
  (await bot.use(avatar, { on: bob })).says('bob member: none');
  (await bot.use(avatar, { on: bob }, { in: 'dm' })).says('bob in private');
});

export const wrong = scenario('a menu needs what it is used on', async bot => {
  // @ts-expect-error a message menu is used on a message
  await bot.use(quote, { on: bot.member('bob') });
});
`,
      });
      const { code, output } = runTest(cwd);
      expect(output).toContain('✓ Tested src/menus.test.ts'.replace('✓', '✗'));
      expect(output).toContain(
        'The message menu "Quote" is used on a message: bot.use(command, { on: message }), with a message of the test'
      );
      expect(code).toBe(1);
      // Every menu was tried by itself, with no failure.
      expect(output).toMatch(/✓ Checked every file once: \d+ checks/);
    });

    it('report a menu that throws on a hard target, with the case', () => {
      const cwd = project({
        'src/menus.ts': `import { command } from 'chapterjs';
export const kick = command({
  type: 'user',
  name: 'Kick',
  async run({ interaction, targetMember }) {
    await interaction.reply(targetMember!.displayName);
  },
});
export const quote = command({
  type: 'message',
  name: 'Quote',
  async run({ interaction, message }) {
    if (message.content.length > 1000) throw new Error('too long');
    await interaction.reply('ok');
  },
});
`,
      });
      const { code, output } = runTest(cwd);
      expect(code).toBe(1);
      expect(output).toContain('the user menu "Kick" failed in 1 of 5 cases');
      expect(output).toContain('on someone who left');
      expect(output).toContain(
        'the message menu "Quote" failed in 1 of 4 cases'
      );
      expect(output).not.toContain('of someone who left: ');
      expect(output).toContain('on a message at its longest, with unicode');
    });
  }
);
