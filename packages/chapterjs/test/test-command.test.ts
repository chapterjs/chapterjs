// `chapterjs test`, run for real on scratch projects: what it checks by
// itself, what the scenarios of a project can do, and what it prints.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProgress } from '../src/cli/test.js';
import { modal } from '../src/components/modal.js';
import type { TestReply } from '../src/testing/harness.js';
import { bin, project } from './dev-helpers.js';

/** Runs `chapterjs test` in a project, and waits for it. */
function runTest(
  cwd: string,
  env: Record<string, string> = {}
): { code: number; output: string } {
  const result = spawnSync(process.execPath, [bin, 'test'], {
    cwd,
    encoding: 'utf8',
    // Nothing inherited from who runs the tests.
    env: { PATH: process.env.PATH ?? '', NO_COLOR: '1', ...env },
  });
  return {
    code: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  };
}

const PING = `import { button, command } from 'chapterjs';

export const confirm = button({
  label: 'Confirm',
  style: 'success',
  data: { count: 'number' },
  who: 'author',
  async run({ interaction, data }) {
    await interaction.update(\`Confirmed \${data.count}\`);
  },
});

export const ping = command({
  name: 'ping',
  description: 'Replies with Pong!',
  options: {
    count: { type: 'integer', description: 'How many', min: 1, max: 5 },
    who: { type: 'user', description: 'Someone', required: true },
  },
  async run({ interaction, options }) {
    await interaction.reply({
      content: \`Pong \${options.count ?? 1} for \${options.who.username}\`,
      components: [confirm({ count: options.count ?? 1 })],
    });
  },
});
`;

const WARN = `import { command, event, modal, store, task } from 'chapterjs';

export const warnings = store<string[]>();

export const reason = modal({
  title: 'Why?',
  fields: {
    why: { type: 'text', label: 'Reason', style: 'paragraph' },
    severity: { type: 'radio', label: 'Severity', options: ['low', 'high'], required: false },
  },
  async run({ interaction, fields }) {
    await interaction.reply({ content: \`Noted: \${fields.why} (\${fields.severity ?? 'none'})\`, ephemeral: true });
  },
});

export const warn = command({
  name: 'warn',
  description: 'Warns someone',
  permissions: ['ModerateMembers'],
  options: {
    target: { type: 'user', description: 'Who', required: true },
    text: { type: 'string', description: 'Why', maxLength: 50, choices: ['spam', 'rude'] },
  },
  async run({ interaction, options }) {
    if (!options.text) {
      await interaction.showModal(reason);
      return;
    }
    const list = (await warnings.get(options.target.id)) ?? [];
    list.push(options.text);
    await warnings.set(options.target.id, list);
    await interaction.reply(\`\${options.target.username} has \${list.length} warning(s)\`);
  },
});

export const welcome = event({
  name: 'memberJoin',
  async run({ member, guild }) {
    const channel = [...guild.channels.values()].find(c => c.name === 'general');
    if (channel?.isTextBased()) await channel.send(\`Welcome \${member.user.username}!\`);
    await member.send('Glad to have you').catch(() => {});
  },
});

export const hello = event({
  name: 'messageCreate',
  async run({ message }) {
    if (message.content === 'hi') await message.reply('hey');
  },
});

export const weekly = task({
  every: '1h',
  async run({ guilds }) {
    console.log(\`task ran for \${guilds.size} guild(s)\`);
  },
});
`;

// Typed: a form that carries data is named by its export, with or without
// it, or called with it. Checked by the type checker, never run.
const report = modal({
  title: 'Report',
  data: { userId: 'string' },
  fields: { why: { type: 'text', label: 'Why' } },
  run() {},
});
export function formTypes(reply: TestReply): void {
  reply.opensForm(report);
  reply.opensForm(report({ userId: '1' }));
  reply.opensForm();
  // @ts-expect-error not a form
  reply.opensForm('report');
}

const full = (extra: Record<string, string> = {}) =>
  project({ 'src/ping.ts': PING, 'src/mod/warn.ts': WARN, ...extra });

describe('the check in progress', () => {
  it('shows the check and its cases, then erases them for the result', () => {
    const written: string[] = [];
    const progress = checkProgress(
      true,
      { reload: message => written.push(`↻ ${message}\n`) },
      text => written.push(text)
    );
    progress.start('Checking src/close.ts');
    progress.step('button close()');
    progress.step('button close(), with userId = ""');
    expect(written).toEqual([
      '↻ Checking src/close.ts\n',
      '  → button close()\n',
      '  → button close(), with userId = ""\n',
    ]);
    progress.clear();
    // Three lines up, then everything below erased.
    expect(written.at(-1)).toBe('\x1b[3A\x1b[0J');
    progress.clear();
    expect(written).toHaveLength(4);
  });

  it('shows nothing when nobody is watching', () => {
    const written: string[] = [];
    const progress = checkProgress(
      false,
      { reload: message => written.push(message) },
      text => written.push(text)
    );
    progress.start('Checking src/ping.ts');
    progress.step('command /ping');
    progress.clear();
    expect(written).toEqual([]);
  });
});

describe.skipIf(process.platform === 'win32')('chapterjs test', () => {
  it('is in the usage', () => {
    const result = spawnSync(process.execPath, [bin, '--help'], {
      encoding: 'utf8',
    });
    expect(result.stdout).toContain(
      'test    Check your bot without Discord: every file once, then your scenarios'
    );
  });

  it('needs a src folder', () => {
    const cwd = project({});
    rmSync(join(cwd, 'src'), { recursive: true, force: true });
    const { code, output } = runTest(cwd);
    expect(code).toBe(1);
    expect(output).toContain('✗ There is no src folder here.');
  });

  it('says when there is nothing to test yet', () => {
    const cwd = project({ 'src/lib.ts': 'export const x = 1;\n' });
    const { code, output } = runTest(cwd);
    expect(code).toBe(0);
    expect(output).toContain('ℹ Nothing to run yet');
  });

  it('stops on a file that can not run, with its line', () => {
    const cwd = full({
      'src/broken.ts': `import { command } from 'chapterjs';\nexport default command({ name: 'no run', description: 'x' } as never);\n`,
    });
    const { code, output } = runTest(cwd);
    expect(code).toBe(1);
    expect(output).toContain('✗ src/broken.ts');
    expect(output).toContain(
      "✗ This file can't run, so your bot was not tested. Fix it and test again"
    );
    expect(output).not.toContain('✓ /ping');
  });

  it('checks every command, component, event and task once, with the hard cases', () => {
    const cwd = full();
    const { code, output } = runTest(cwd);
    expect(code, output).toBe(0);
    expect(output).toContain(
      '✓ 2 commands, 2 events, 2 components, 1 task, 1 store loaded'
    );
    // One line for every file that passed: what is in them is not listed.
    expect(output).toContain('✓ Checked every file once: 7 checks in 2 files');
    expect(output).not.toContain('Checked src/');
    expect(output).not.toContain('command /ping');
    expect(output).not.toContain('confirm');
    // Not a terminal: the files in progress are not shown.
    expect(output).not.toContain('Testing ');
    expect(output).not.toContain('\x1b[');
    // What the files print stays out of the report.
    expect(output).not.toContain('task ran for 1 guild(s)');
    expect(output).toContain('ℹ No scenario yet.');
    expect(output).toContain('✓ 7 checks passed');
    // The stores of a test never touch the project.
    expect(existsSync(join(cwd, 'data'))).toBe(false);
    // The types are written, as dev and build do.
    expect(existsSync(join(cwd, '.chapterjs/tsconfig.json'))).toBe(true);
  });

  it('reports what throws and what never answers, with the file and the line', () => {
    const cwd = project({
      'src/bugs.ts': `import { button, command, event } from 'chapterjs';

export const crash = command({
  name: 'crash',
  description: 'Throws on a long text',
  options: { text: { type: 'string', description: 'Text', maxLength: 10 } },
  async run({ interaction, options }) {
    if ((options.text ?? '').length >= 10) throw new Error('too long for me');
    await interaction.reply('ok');
  },
});

export const silent = command({
  name: 'silent',
  description: 'Never answers',
  async run() {},
});

export const boom = button({
  label: 'Boom',
  data: { n: 'number' },
  async run({ interaction, data }) {
    if (data.n === 0) throw new Error('zero!');
    await interaction.update('fine');
  },
});

export const onJoin = event({
  name: 'memberJoin',
  run() {
    throw new Error('welcome failed');
  },
});
`,
    });
    const { code, output } = runTest(cwd);
    expect(code).toBe(1);
    expect(output).toContain(
      '✗ Checked src/bugs.ts: command /crash failed in 1 of 3 cases\n  with text at its longest (10 characters): src/bugs.ts:8 too long for me'
    );
    expect(output).toContain(
      '✗ Checked src/bugs.ts: command /silent failed\n  src/bugs.ts /silent finished without answering: the person sees "The application did not respond". Call interaction.reply() in run.'
    );
    expect(output).toContain(
      '✗ Checked src/bugs.ts: button boom() failed in 1 of 4 cases\n  with n = 0: src/bugs.ts:23 zero!'
    );
    expect(output).toContain(
      '✗ Checked src/bugs.ts: event memberJoin failed\n  src/bugs.ts:31 welcome failed'
    );
    expect(output).not.toContain('✓ Checked');
    expect(output).toContain('✗ 4 of 4 checks failed');
  });

  it('runs a store kept in Redis in memory, with no REDIS_URL and no Redis', () => {
    const cwd = full({
      'src/sessions.ts': `import { command, ranking, store } from 'chapterjs';
export const sessions = store<number>({ storage: 'redis', expires: '1h' });
export const visitors = ranking({ storage: 'redis' });
export default command({
  name: 'visit',
  description: 'Counts your visits',
  async run({ interaction, user }) {
    const count = await sessions.update(user.id, (n = 0) => n + 1);
    await visitors.add(user.id, 1);
    await interaction.reply(\`Visit \${count}, rank \${await visitors.rankOf(user.id)}\`);
  },
});
`,
      'src/visit.test.ts': `import { scenario } from 'chapterjs/test';
import visit from './sessions';
export default [
  scenario('counts from one on each scenario', async bot => {
    (await bot.use(visit)).says('Visit 1, rank 1');
    (await bot.use(visit)).says('Visit 2, rank 1');
  }),
  scenario('starts empty again', async bot => {
    (await bot.use(visit)).says('Visit 1, rank 1');
  }),
];
`,
    });
    const { code, output } = runTest(cwd);
    expect(code, output).toBe(0);
    expect(output).toContain(
      '3 commands, 2 events, 2 components, 1 task, 2 stores, 1 ranking loaded'
    );
    expect(output).not.toContain('Redis');
    expect(output).toContain('✓ Tested src/visit.test.ts');
    expect(existsSync(join(cwd, 'data'))).toBe(false);
  });

  it('waits for an answer that was deferred, and keeps what a stuck case does to it', () => {
    const cwd = project({
      'src/slow.ts': `import { command } from 'chapterjs';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Deferred by the framework after 2 s, answered after 6: fine online.
export const slow = command({
  name: 'slow',
  description: 'Answers late',
  async run({ interaction }) {
    await wait(6000);
    await interaction.reply('late but there');
  },
});

// Answered, then never done: given up after 30 s.
export const stuck = command({
  name: 'stuck',
  description: 'Never ends',
  async run({ interaction }) {
    await interaction.reply('started');
    await new Promise(() => {});
  },
});
`,
      // Checked after src/slow.ts: nothing of the stuck case may reach it.
      'src/z.ts': `import { command } from 'chapterjs';
export const after = command({
  name: 'after',
  description: 'Fine',
  run: ({ interaction }) => interaction.reply('ok'),
});
`,
    });
    const { code, output } = runTest(cwd);
    expect(code, output).toBe(1);
    expect(output).not.toContain('/slow failed');
    expect(output).toContain(
      '✗ Checked src/slow.ts: command /stuck failed\n  it did not finish within 30 s: is something waiting for what never comes?'
    );
    expect(output).toContain('✗ 1 of 3 checks failed');
  }, 60_000);

  it('says what joins voice was not run to its end, without failing it', () => {
    const cwd = project({
      'src/voice.ts': `import { ChannelType, command } from 'chapterjs';

export const join = command({
  name: 'join',
  description: 'Joins a new voice channel',
  async run({ interaction, guild }) {
    const channel = await guild.createChannel({ name: 'Lounge', type: ChannelType.GuildVoice });
    if (!channel.isVoice()) return interaction.reply('Not voice.');
    await channel.join();
    await interaction.reply('Joined.');
  },
});

export const leave = command({
  name: 'leave',
  description: 'Leaves',
  async run({ interaction, guild }) {
    await guild.voice?.leave();
    await interaction.reply('Left.');
  },
});
`,
      'src/voice.test.ts': `import { scenario } from 'chapterjs/test';
import { join } from './voice';
export default scenario('joining says voice is not simulated', async bot => {
  await bot.use(join);
});
`,
    });
    const { code, output } = runTest(cwd);
    expect(output).toContain(
      'ℹ Voice is not played in memory, so what comes after join() was not run for: command /join (src/voice.ts). Try it on your server with chapterjs dev.'
    );
    expect(output).toContain('✓ Checked every file once: 2 checks in 1 file');
    // A scenario is the developer's: it says why it stopped.
    expect(output).toContain(
      'Voice is not simulated by chapterjs test yet: the bot can not join a voice channel here.'
    );
    expect(code).toBe(1);
  });

  it('runs every case on a server as it was, so a ban never spills into the next case', () => {
    // And, as on Discord, the owner can not be banned: without the check,
    // "target being the owner" fails.
    const cwd = project({
      'src/ban.ts': `import { command } from 'chapterjs';
export const ban = command({
  name: 'ban',
  description: 'Bans someone',
  permissions: ['BanMembers'],
  options: { target: { type: 'user', description: 'Who', required: true } },
  async run({ interaction, guild, options }) {
    // Discord never lets a bot ban the owner of the server.
    if (options.target.id === guild.ownerId) return interaction.reply('Not the owner.');
    await guild.ban(options.target.id);
    await interaction.reply('Banned.');
  },
});
`,
    });
    const { code, output } = runTest(cwd);
    // "target being who uses it" bans the person using the command: the
    // cases after it still have them.
    expect(output, output).toContain(
      '✓ Checked every file once: 1 check in 1 file'
    );
    expect(code).toBe(0);
  });

  it('fails what forgot an await, with its line, and goes on', () => {
    const cwd = project({
      'src/twice.ts': `import { command } from 'chapterjs';
export const twice = command({
  name: 'twice',
  description: 'Answers twice without await',
  run({ interaction }) {
    interaction.reply('one');
    interaction.reply('two');
  },
});
export const fine = command({
  name: 'fine',
  description: 'Answers',
  run: ({ interaction }) => interaction.reply('ok'),
});
`,
    });
    const { code, output } = runTest(cwd);
    expect(output).toContain(
      '✗ Checked src/twice.ts: command /twice failed\n  src/twice.ts:7 This interaction was already answered. Use interaction.followUp() to send another message, or interaction.edit() to change the answer.\n  This call was not awaited: write await in front of it (and async before run), so that your function waits for it.'
    );
    // The first answer reached the person: no "did not respond".
    expect(output).not.toContain('finished without answering');
    expect(output).toContain('✗ 1 of 2 checks failed');
    expect(code).toBe(1);
  });

  it('says which events it can not make happen yet', () => {
    const cwd = project({
      'src/polls.ts': `import { event } from 'chapterjs';
export default event({ name: 'pollVoteAdd', run() {} });
`,
    });
    const { code, output } = runTest(cwd);
    expect(code).toBe(0);
    expect(output).toContain(
      'ℹ An event is not simulated yet, so its file was not run: pollVoteAdd.'
    );
  });

  describe('scenarios', () => {
    it('runs them on a fresh server each, and reports a failure with its line', () => {
      const cwd = full({
        'src/ping.test.ts': `import assert from 'node:assert/strict';
import { scenario } from 'chapterjs/test';
import { ping, confirm } from './ping';
import { warn, reason, warnings } from './mod/warn';

export default [
  scenario('ping answers Pong', async bot => {
    const alice = bot.member('alice');
    const reply = await bot.use(ping, { who: alice, count: 3 });
    reply.says('Pong 3 for alice').isPublic().hasButton('Confirm');
    const next = await bot.click(reply.button('Confirm'), { on: reply });
    next.updatesMessage().says('Confirmed 3');
    const other = await bot.click(reply.button('Confirm'), { on: reply, by: bot.member('bob') });
    other.isEphemeral().says('Only the person who used the command');
    const direct = await bot.click(confirm({ count: 9 }));
    direct.says('Confirmed 9');
  }),
  scenario('warn needs the permission, and opens a form', async bot => {
    const refused = await bot.use(warn, { target: bot.member('alice'), text: 'spam' });
    refused.isEphemeral().says('You need the Moderate Members permission');
    const mod = bot.member('mod', { permissions: ['ModerateMembers'] });
    const reply = await bot.use(warn, { target: bot.member('alice'), text: 'spam' }, { by: mod });
    reply.says('alice has 1 warning(s)');
    const form = await bot.use(warn, { target: bot.member('alice') }, { by: mod });
    form.opensForm(reason);
    assert.deepEqual(form.form?.fields, ['why', 'severity']);
    const sent = await bot.submit(reason, { why: 'because', severity: 'high' }, { by: mod });
    sent.isEphemeral().says('Noted: because (high)');
  }),
  scenario('stores start empty every time', async bot => {
    const mod = bot.member('mod', { permissions: ['ModerateMembers'] });
    const reply = await bot.use(warn, { target: bot.member('alice'), text: 'rude' }, { by: mod });
    reply.says('alice has 1 warning(s)');
    const again = await bot.use(warn, { target: bot.member('alice'), text: 'rude' }, { by: mod });
    again.says('alice has 2 warning(s)');
  }),
  scenario('people join and talk', async bot => {
    const newbie = await bot.join('newbie');
    bot.channel('general').last!.says('Welcome newbie!').isPublic();
    newbie.privateMessages[0]!.says('Glad to have you');
    const message = await bot.say('hi', { by: newbie });
    assert.equal(message.author?.name, 'newbie');
    bot.channel('general').last!.says('hey');
    assert.deepEqual(bot.channel('general').messages.map(m => m.content), ['Welcome newbie!', 'hi', 'hey']);
    await bot.leave(newbie);
    assert.equal(newbie.inServer, false);
  }),
  scenario('this one fails', async bot => {
    const reply = await bot.use(ping, { who: bot.someone });
    reply.says('Nope');
  }),
  scenario('this one throws', async bot => {
    await bot.use(ping, { who: bot.someone });
    throw new Error('something else broke');
  }),
];
`,
      });
      const { code, output } = runTest(cwd);
      expect(code).toBe(1);
      // One line per test file; a scenario is only named when it failed.
      expect(output).not.toContain('"ping answers Pong"');
      expect(output).not.toContain('✓ Tested src/ping.test.ts');
      // The scenario printed "hi": not in the report, it passed.
      expect(output).not.toMatch(/^hi$/m);
      expect(output).toMatch(
        /✗ Tested src\/ping\.test\.ts: "this one fails" failed\n {2}src\/ping\.test\.ts:\d+ The answer should say "Nope", it says "Pong 1 for someone"\./
      );
      expect(output).toMatch(
        /✗ Tested src\/ping\.test\.ts: "this one throws" failed\n {2}src\/ping\.test\.ts:\d+ something else broke/
      );
      expect(output).toContain('✗ 2 of 6 scenarios failed');
    });

    it('fails a scenario when a function of the bot throws, even with no assertion, and shows what was printed', () => {
      const cwd = project({
        'src/bad.ts': `import { command } from 'chapterjs';
export default command({ name: 'bad', description: 'Throws', async run() { console.log('about to fail'); throw new Error('nope'); } });
`,
        'src/bad.test.ts': `import { scenario } from 'chapterjs/test';
import bad from './bad';
export default scenario('bad is fine', async bot => {
  const reply = await bot.use(bad);
  reply.isEphemeral().says('Something went wrong');
});
`,
      });
      const { code, output } = runTest(cwd);
      expect(code).toBe(1);
      expect(output).toContain(
        '✗ Tested src/bad.test.ts: "bad is fine" failed\n  src/bad.ts:2 nope\n  What the files printed meanwhile:\n  about to fail'
      );
      // The smoke check of /bad failed too, with what it printed under it.
      expect(output).toContain(
        '✗ Checked src/bad.ts: command /bad failed\n  src/bad.ts:2 nope\n  What the files printed meanwhile:\n  about to fail'
      );
      expect(output.match(/about to fail/g)).toHaveLength(2);
    });

    it('refuses what Discord would not let a person send, in plain words', () => {
      const cwd = full({
        'src/inputs.test.ts': `import { scenario } from 'chapterjs/test';
import { ping } from './ping';
import { warn, reason } from './mod/warn';

const expectFailure = async (run: () => Promise<unknown>, text: string) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error && error.message.includes(text)) return;
    throw error;
  }
  throw new Error('Expected a failure saying ' + text);
};

export default [
  scenario('inputs are checked', async bot => {
    await expectFailure(() => bot.use(ping, {} as never), 'The option "who" of /ping is required');
    await expectFailure(() => bot.use(ping, { who: bot.someone, count: 9 }), 'The option "count" of /ping is 5 at most, got 9');
    await expectFailure(() => bot.use(ping, { who: bot.someone, count: 1.5 }), 'is a whole number');
    await expectFailure(() => bot.use(ping, { who: 'alice' as never }), 'is a person (bot.member(\\'alice\\'))');
    await expectFailure(() => bot.use(ping, { who: bot.someone, nope: 1 } as never), '/ping has no option "nope"');
    const mod = bot.member('mod', { permissions: ['ModerateMembers'] });
    await expectFailure(() => bot.use(warn, { target: bot.someone, text: 'other' as never }, { by: mod }), 'must be one of its choices ("spam", "rude")');
    await expectFailure(() => bot.submit(reason, {}, { by: mod }), 'The field "why" of reason is required');
    await expectFailure(() => bot.submit(reason, { why: 'x', severity: 'medium' as never }, { by: mod }), 'is one of "low", "high"');
    await expectFailure(() => bot.submit(reason, { why: 'x', extra: 1 } as never, { by: mod }), 'has no field "extra"');
    await expectFailure(() => bot.leave(bot.member('ghost')) .then(() => bot.leave(bot.member('ghost'))), 'ghost is not in the server');
  }),
];
`,
      });
      const { code, output } = runTest(cwd);
      expect(code, output).toBe(0);
      expect(output).toContain('✓ Tested src/inputs.test.ts');
    });

    it('handles commands of private messages, suggestions and the owner', () => {
      const cwd = project({
        'src/dm.ts': `import { command } from 'chapterjs';
export const secret = command({
  name: 'secret',
  description: 'Only in private',
  where: 'dm',
  async run({ interaction, user }) {
    await interaction.reply(\`psst \${user.username}\`);
  },
});
export const find = command({
  name: 'find',
  description: 'Finds things',
  options: { what: { type: 'string', description: 'What', required: true, maxLength: 20 } },
  autocomplete: {
    what: ({ value }) => ['apple', 'apricot', 'banana'].filter(one => one.startsWith(value)),
  },
  async run({ interaction, options }) {
    await interaction.reply(\`found \${options.what}\`);
  },
});
`,
        'src/dm.test.ts': `import assert from 'node:assert/strict';
import { scenario } from 'chapterjs/test';
import { secret, find } from './dm';
export default [
  scenario('a private command runs in private', async bot => {
    const reply = await bot.use(secret);
    reply.says('psst someone');
    const inServer = await bot.use(secret, {}, { in: bot.channel('general') });
    inServer.isEphemeral().says('can only be used in a private message');
  }),
  scenario('suggestions come from the file', async bot => {
    const suggestions = await bot.suggest(find, 'what', 'ap');
    assert.deepEqual(suggestions.map(s => s.value), ['apple', 'apricot']);
    assert.equal(bot.owner.can('Administrator'), true);
    assert.equal(bot.someone.can('BanMembers'), false);
    assert.equal(bot.me.name, 'Test Bot');
  }),
];
`,
      });
      const { code, output } = runTest(cwd);
      expect(code, output).toBe(0);
      expect(output).toContain('✓ Checked every file once: 2 checks in 1 file');
      expect(output).toContain('✓ Tested src/dm.test.ts');
      expect(output).toContain('✓ 2 checks and 2 scenarios passed');
    });

    it('reports a test file without scenario, and a scenario without label', () => {
      const cwd = full({
        'src/empty.test.ts': `export const nothing = 1;\n`,
        'src/bad.test.ts': `import { scenario } from 'chapterjs/test';\nexport default scenario('', async () => {});\n`,
      });
      const { code, output } = runTest(cwd);
      expect(code).toBe(1);
      expect(output).toContain(
        "⚠ src/empty.test.ts declares no scenario: export one made with scenario() from 'chapterjs/test' (its exports are: nothing)."
      );
      expect(output).toContain(
        '✗ src/bad.test.ts scenario() needs a label first, what the test checks'
      );
      expect(output).toContain('✗ 1 of 1 scenario failed');
    });

    it('gives up on a scenario that never ends', () => {
      const cwd = full({
        'src/slow.test.ts': `import { scenario } from 'chapterjs/test';
export default scenario('waits forever', () => new Promise(() => {}));
`,
      });
      const { code, output } = runTest(cwd, {
        CHAPTERJS_SCENARIO_TIMEOUT: '200',
      });
      expect(code).toBe(1);
      expect(output).toContain(
        '✗ Tested src/slow.test.ts: "waits forever" failed\n  took more than 0.2 s: is something waiting for an answer that never comes?'
      );
    });

    it('starts the next scenario clean when one was given up while the bot ran', () => {
      const cwd = project({
        'src/stuck.ts': `import { command } from 'chapterjs';
export const stuck = command({
  name: 'stuck',
  description: 'Never ends',
  async run({ interaction }) {
    await interaction.reply('started');
    await new Promise(() => {});
  },
});
export const fine = command({
  name: 'fine',
  description: 'Answers',
  run: ({ interaction }) => interaction.reply('fine'),
});
`,
        'src/stuck.test.ts': `import { scenario } from 'chapterjs/test';
import { fine, stuck } from './stuck';
export default [
  scenario('a stuck command', async bot => {
    await bot.use(stuck);
  }),
  scenario('then a fine one', async bot => {
    (await bot.use(fine)).says('fine');
  }),
];
`,
      });
      const { output } = runTest(cwd, { CHAPTERJS_SCENARIO_TIMEOUT: '1000' });
      expect(output).toContain('"a stuck command" failed');
      expect(output).not.toContain('"then a fine one" failed');
    }, 60_000);

    it('checks that a form carrying data was opened, by its export', () => {
      const cwd = project({
        'src/report.ts': `import { command, modal } from 'chapterjs';
export const report = modal({
  title: 'Report',
  data: { userId: 'string' },
  fields: { why: { type: 'text', label: 'Why' } },
  run: ({ interaction, data, fields }) => interaction.reply(\`\${data.userId}: \${fields.why}\`),
});
export const other = modal({ title: 'Other', fields: { a: { type: 'text', label: 'A' } }, run() {} });
export default command({
  name: 'report',
  description: 'Reports someone',
  run: ({ interaction, user }) => interaction.showModal(report({ userId: user.id })),
});
`,
        'src/report.test.ts': `import { scenario } from 'chapterjs/test';
import use, { other, report } from './report';
export default [
  scenario('opens the form, whatever its data', async bot => {
    const reply = await bot.use(use);
    reply.opensForm(report).opensForm(report({ userId: 'x' })).opensForm(reply.form!);
  }),
  scenario('names the form it expected', async bot => {
    (await bot.use(use)).opensForm(other);
  }),
];
`,
      });
      const { output } = runTest(cwd);
      expect(output).not.toContain(
        '"opens the form, whatever its data" failed'
      );
      expect(output).toContain(
        '"names the form it expected" failed\n  src/report.test.ts:9 The bot should have opened the form other, it opened report.'
      );
    });

    it('never loads a test file as part of the bot', () => {
      const cwd = full({
        'src/ping.test.ts': `import { scenario } from 'chapterjs/test';\nimport { command } from 'chapterjs';\nexport const sneaky = command({ name: 'sneaky', description: 'x', async run() {} });\nexport default scenario('nothing', async () => {});\n`,
      });
      const { code, output } = runTest(cwd);
      expect(code, output).toBe(0);
      expect(output).not.toContain('/sneaky');
      expect(output).toContain(
        '✓ 2 commands, 2 events, 2 components, 1 task, 1 store loaded'
      );
    });
  });
});
