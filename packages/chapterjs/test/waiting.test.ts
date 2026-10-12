// Waiting for what comes next: `channel.waitForMessage()`,
// `channel.collectMessages()`, `message.waitForClick()` and
// `message.waitForReaction()`. The waits themselves, what the options
// accept, the intents the code needs, and the whole thing running in
// `chapterjs dev` and `chapterjs test`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '@chapterjs/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayOpcode } from '../src/discord/codes.js';
import { GatewayIntent } from '../src/discord/intents.js';
import { scanUses, usesIntents } from '../src/loader/usage.js';
import { withGuild } from '../src/store/scope.js';
import {
  personId,
  readEmoji,
  readMatches,
  readWithin,
} from '../src/structures/wait.js';
import { VOICE_USE } from '../src/voice/usage.js';
import { MESSAGES_USE, REACTIONS_USE } from '../src/waiting/usage.js';
import { MemoryWaiters } from '../src/waiting/waiters.js';
import {
  ALICE,
  bin,
  BOT,
  connected,
  GENERAL,
  GUILD,
  project,
  rawMessage,
  runDev,
  useCommand,
  world,
} from './dev-helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

const request = (
  overrides: Partial<{
    kind: 'message' | 'click' | 'reaction';
    match: (offered: unknown) => boolean;
    max: number;
    within: number;
  }> = {}
) => ({
  kind: 'message' as const,
  match: () => true,
  max: 1,
  within: 60_000,
  ...overrides,
});

describe('the waits of a bot', () => {
  it('end with the first thing that fits, and only want what they wait for', async () => {
    const waiters = new MemoryWaiters();
    expect(waiters.wants('message')).toBe(false);
    const wait = waiters.wait<number>(
      request({ match: offered => (offered as number) > 2 })
    );
    expect(waiters.wants('message')).toBe(true);
    expect(waiters.wants('click')).toBe(false);
    expect(waiters.offer('message', 1)).toBe(false);
    expect(waiters.offer('click', 5)).toBe(false);
    expect(waiters.offer('message', 3)).toBe(true);
    expect(await wait).toEqual([3]);
    expect(waiters.wants('message')).toBe(false);
    expect(waiters.offer('message', 4)).toBe(false);
  });

  it('give a message to every wait that wants it, but a click to one only', async () => {
    const waiters = new MemoryWaiters();
    const a = waiters.wait(request());
    const b = waiters.wait(request());
    waiters.offer('message', 'hello');
    expect(await Promise.all([a, b])).toEqual([['hello'], ['hello']]);

    const first = waiters.wait(request({ kind: 'click' }));
    const second = waiters.wait(request({ kind: 'click' }));
    expect(waiters.offer('click', 'one')).toBe(true);
    expect(waiters.offer('click', 'two')).toBe(true);
    expect(await Promise.all([first, second])).toEqual([['one'], ['two']]);
  });

  it('gather up to their max, or what came when the time is up', async () => {
    vi.useFakeTimers();
    const waiters = new MemoryWaiters();
    const three = waiters.wait(request({ max: 3 }));
    const until = waiters.wait(request({ max: Infinity, within: 5_000 }));
    for (const value of ['a', 'b', 'c', 'd']) waiters.offer('message', value);
    expect(await three).toEqual(['a', 'b', 'c']);
    await vi.advanceTimersByTimeAsync(4_999);
    waiters.offer('message', 'e');
    await vi.advanceTimersByTimeAsync(1);
    expect(await until).toEqual(['a', 'b', 'c', 'd', 'e']);
    const nothing = waiters.wait(request({ within: 1_000 }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await nothing).toEqual([]);
  });

  it('end with the error of a test that throws, where the files wait', async () => {
    const waiters = new MemoryWaiters();
    const broken = waiters.wait(
      request({
        match: () => {
          throw new Error('bad test');
        },
      })
    );
    const fine = waiters.wait(request());
    expect(waiters.offer('message', 'x')).toBe(true);
    await expect(broken).rejects.toThrow('bad test');
    expect(await fine).toEqual(['x']);
  });

  it('all end with what they have when the bot stops', async () => {
    const waiters = new MemoryWaiters();
    const one = waiters.wait(request());
    const many = waiters.wait(request({ kind: 'reaction', max: 5 }));
    waiters.offer('reaction', 'r');
    waiters.close();
    expect(await one).toEqual([]);
    expect(await many).toEqual(['r']);
    expect(waiters.wants('reaction')).toBe(false);
  });

  it('say when a run of the files starts and stops waiting, once per run', async () => {
    const events: string[] = [];
    const runs = new Map<object, string>();
    const name = (run: object) => {
      if (!runs.has(run)) runs.set(run, `run${runs.size + 1}`);
      return runs.get(run);
    };
    const waiters = new MemoryWaiters({
      watch: {
        parked: run => events.push(`parked ${name(run)}`),
        resumed: run => events.push(`resumed ${name(run)}`),
      },
    });
    const a = withGuild(GUILD, () =>
      Promise.all([waiters.wait(request()), waiters.wait(request())])
    );
    const b = withGuild(null, () => waiters.wait(request({ kind: 'click' })));
    // Outside any run: nothing to say.
    const c = waiters.wait(request({ kind: 'reaction' }));
    waiters.offer('message', 'x');
    waiters.offer('click', 'y');
    waiters.offer('reaction', 'z');
    await Promise.all([a, b, c]);
    expect(events).toEqual([
      'parked run1',
      'parked run2',
      'resumed run1',
      'resumed run2',
    ]);
  });
});

describe('what a wait takes', () => {
  it.each([
    [undefined, 60_000],
    ['30s', 30_000],
    ['1s', 1_000],
    ['1d', 86_400_000],
    ['1m30s', 90_000],
  ])('waits %j as %d ms', (within, ms) => {
    expect(readWithin(within)).toBe(ms);
  });

  it.each([
    ['soon', /^"within" is how long to wait, a duration/],
    [30, /^"within" is how long to wait, a duration .*: got 30\./],
    ['500ms', /^"within" is how long to wait/],
    ['0s', /a wait lasts between 1 second and 1 day/],
    ['2d', /a wait lasts between 1 second and 1 day/],
  ])('refuses within: %j', (within, message) => {
    expect(() => readWithin(within)).toThrow(message);
  });

  it('takes a person as a user, a member or an id', () => {
    expect(personId(undefined)).toBeUndefined();
    expect(personId(ALICE)).toBe(ALICE);
    expect(personId({ id: ALICE, username: 'alice' })).toBe(ALICE);
    expect(() => personId('alice')).toThrow(
      /^"from" is the person to wait for: a user, a member or their id, got "alice"\./
    );
    expect(() => personId(42)).toThrow(/got 42\./);
  });

  it('matches a text whatever the capitals and the spaces around, a pattern, or a function', () => {
    const says = (content: string) => ({ content }) as never;
    expect(readMatches(undefined)(says('anything'))).toBe(true);
    const paris = readMatches('Paris');
    expect(paris(says('  pARIS '))).toBe(true);
    expect(paris(says('Paris!'))).toBe(false);
    expect(paris(says('🙂 Paris'))).toBe(false);
    // A global pattern starts over every time.
    const pattern = readMatches(/par/g);
    expect(pattern(says('paris'))).toBe(true);
    expect(pattern(says('paris'))).toBe(true);
    const long = readMatches(
      (message: { content: string }) => message.content.length > 3
    );
    expect(long(says('long'))).toBe(true);
    expect(long(says('no'))).toBe(false);
    // Only true counts.
    expect(readMatches(() => 'yes' as never)(says('x'))).toBe(false);
    expect(() => readMatches(42)).toThrow(
      /^"matches" is a text, a regular expression or a function/
    );
  });

  it('knows an emoji by itself, its name, its id, or as Discord writes it', () => {
    const party = { id: '123', name: 'party', animated: false };
    const thumbs = { id: null, name: '👍' };
    expect(readEmoji(undefined)(thumbs)).toBe(true);
    expect(readEmoji('👍')(thumbs)).toBe(true);
    expect(readEmoji('👍')(party)).toBe(false);
    expect(readEmoji('party')(party)).toBe(true);
    expect(readEmoji('123')(party)).toBe(true);
    expect(readEmoji('<:party:123>')(party)).toBe(true);
    expect(readEmoji('<a:other:123>')(party)).toBe(true);
    expect(readEmoji('<:party:999>')(party)).toBe(false);
    expect(() => readEmoji('')).toThrow(/^"emoji" is the emoji to wait for/);
    expect(() => readEmoji(5)).toThrow(/^"emoji" is the emoji to wait for/);
  });
});

describe('what the code waits for, read from it', () => {
  it('finds the files that wait, and the intents they need', async () => {
    const cwd = tempDir();
    mkdirSync(join(cwd, 'src/deep'), { recursive: true });
    writeFileSync(
      join(cwd, 'src/quiz.ts'),
      'export const go = (c: any) => c.waitForMessage({ within: "30s" });\n'
    );
    writeFileSync(
      join(cwd, 'src/deep/poll.ts'),
      'export const go = (m: any) => [m.waitForReaction(), m.collectMessages ()];\n'
    );
    writeFileSync(
      join(cwd, 'src/click.ts'),
      'export const go = (m: any) => m.waitForClick();\n'
    );
    // Test files are never loaded by the bot.
    writeFileSync(
      join(cwd, 'src/quiz.test.ts'),
      'export const t = (c: any) => c.waitForReaction();\n'
    );
    writeFileSync(join(cwd, 'src/notes.md'), 'c.waitForReaction()\n');
    const uses = [VOICE_USE, MESSAGES_USE, REACTIONS_USE];
    const found = await scanUses(cwd, uses);
    expect(found).toEqual({
      messages: ['src/deep/poll.ts', 'src/quiz.ts'],
      reactions: ['src/deep/poll.ts'],
    });
    expect(usesIntents(uses, found)).toBe(
      GatewayIntent.GuildMessages |
        GatewayIntent.DirectMessages |
        GatewayIntent.MessageContent |
        GatewayIntent.GuildMessageReactions |
        GatewayIntent.DirectMessageReactions
    );
    // Waiting for a click needs nothing.
    expect(usesIntents(uses, {})).toBe(0);
    expect(await scanUses(join(cwd, 'missing'), uses)).toEqual({});
  });
});

const QUIZ = `import { command } from 'chapterjs';

export const quiz = command({
  name: 'quiz',
  description: 'A question',
  async run({ interaction, channel }) {
    await interaction.reply('Capital of France?');
    const winner = await channel.waitForMessage({ matches: /^paris$/i, within: '5s' });
    await channel.send(winner ? \`\${winner.author.username} wins\` : 'Nobody');
  },
});
`;

describe.skipIf(process.platform === 'win32')(
  'waiting, in chapterjs dev',
  () => {
    it('asks for the intents of messages, and hears the answer', async () => {
      const fake = await world();
      fake.discord.on('POST', `/channels/${GENERAL}/messages`, request => ({
        body: rawMessage(
          '100000000000000990',
          String((request.body as { content: string }).content)
        ),
      }));
      const cwd = project({ 'src/quiz.ts': QUIZ });
      const cli = runDev(cwd, fake);
      // Printed in order: what is waited for comes after what was.
      await cli.waitFor(
        'ℹ Intents computed from your files: GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT'
      );
      await cli.waitFor('✓ 1 command loaded');
      const connection = await connected(fake);
      const identify = await connection.waitFor(GatewayOpcode.Identify);
      const intents = (identify.d as { intents: number }).intents;
      expect(intents & GatewayIntent.GuildMessages).toBeTruthy();
      expect(intents & GatewayIntent.MessageContent).toBeTruthy();
      // Private messages are production's: dev does not ask for them.
      expect(intents & GatewayIntent.DirectMessages).toBe(0);

      expect(await useCommand(fake, 'quiz', '100000000000000701')).toBe(
        'Capital of France?'
      );
      const say = (id: string, content: string, author = ALICE, bot = false) =>
        connection.dispatch(
          'MESSAGE_CREATE',
          rawMessage(id, content, {
            author: {
              id: author,
              username: bot ? 'robot' : 'alice',
              discriminator: '0',
              ...(bot ? { bot: true } : {}),
            },
          })
        );
      say('100000000000000711', 'Lyon');
      // A bot never wins.
      say('100000000000000712', 'Paris', BOT, true);
      say('100000000000000713', 'PARIS');
      const sent = async () => {
        const deadline = Date.now() + 5000;
        for (;;) {
          const posts = fake.discord.requestsTo(
            'POST',
            `/channels/${GENERAL}/messages`
          );
          if (posts.length > 0 || Date.now() > deadline) return posts;
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      };
      expect(
        (await sent()).map(post => (post.body as { content: string }).content)
      ).toEqual(['alice wins']);
      cli.signal('SIGTERM');
      await cli.exited;
    });
  }
);

/** Runs `chapterjs test` in a project, and waits for it. */
function runTest(files: Record<string, string>): {
  code: number;
  output: string;
} {
  const result = spawnSync(process.execPath, [bin, 'test'], {
    cwd: project(files),
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', NO_COLOR: '1' },
  });
  return {
    code: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  };
}

const GAMES = `import { button, command, select } from 'chapterjs';

export const yes = button({ label: 'Yes', style: 'success' });
export const no = button({ label: 'No', style: 'danger', data: { reason: 'string' } });
export const pick = select({ options: ['red', 'blue'] });

export const quiz = command({
  name: 'quiz',
  description: 'A question',
  async run({ interaction, channel }) {
    await interaction.reply('Capital of France?');
    const winner = await channel.waitForMessage({ matches: 'paris', within: '30s' });
    await channel.send(winner ? \`\${winner.author.username} wins\` : 'Nobody found it');
  },
});

export const poll = command({
  name: 'poll',
  description: 'Gathers ideas',
  async run({ interaction, channel, user }) {
    await interaction.reply('Ideas? Say stop to end.');
    const ideas = await channel.collectMessages({ from: user, max: 3, matches: m => m.content !== 'nope' });
    await channel.send(\`\${ideas.length} ideas: \${ideas.map(m => m.content).join(', ')}\`);
  },
});

export const sure = command({
  name: 'sure',
  description: 'Asks',
  async run({ interaction, user }) {
    const sent = await interaction.reply({ content: 'Sure?', components: [yes, no({ reason: 'late' }), pick] });
    const click = await sent.waitForClick({ from: user, within: '20s' });
    if (!click) return void (await interaction.edit({ content: 'Too slow', components: [] }));
    const what = click.is(yes) ? 'yes' : click.is(no) ? \`no (\${click.data.reason})\` : \`picked \${click.values.join()}\`;
    await click.interaction.update({ content: \`\${what} by \${click.user.username}\`, components: [] });
  },
});

export const vote = command({
  name: 'vote',
  description: 'Reactions',
  async run({ interaction }) {
    const sent = await interaction.reply('React!');
    const reaction = await sent.waitForReaction({ emoji: '👍' });
    await interaction.followUp(reaction ? \`\${reaction.user.username} agrees\` : 'Nobody');
  },
});
`;

const SCENARIOS = `import { scenario } from 'chapterjs/test';
import { no, pick, poll, quiz, sure, vote, yes } from './games';

export const wins = scenario('the first right answer wins', async bot => {
  await bot.use(quiz, {}, { by: bot.member('alice') });
  await bot.say('Lyon', { by: bot.member('bob') });
  await bot.say(' PARIS ', { by: bot.member('carol') });
  bot.channel('general').messages.at(-1)!.says('carol wins');
});

export const nobody = scenario('nobody finds it in time', async bot => {
  await bot.use(quiz);
  await bot.endWaits();
  bot.channel('general').messages.at(-1)!.says('Nobody found it');
});

export const ideas = scenario('ideas are gathered from who asked, up to 3', async bot => {
  const alice = bot.member('alice');
  await bot.use(poll, {}, { by: alice });
  await bot.say('one', { by: alice });
  await bot.say('not mine', { by: bot.member('bob') });
  await bot.say('nope', { by: alice });
  await bot.say('two', { by: alice });
  await bot.say('three', { by: alice });
  bot.channel('general').messages.at(-1)!.says('3 ideas: one, two, three');
});

export const confirms = scenario('a click is answered where it was waited for', async bot => {
  const reply = await bot.use(sure);
  (await bot.click(reply.button('Yes'))).says('yes by someone').updatesMessage();
});

export const data = scenario('a click carries its data', async bot => {
  const reply = await bot.use(sure);
  (await bot.click(reply.button('No'))).says('no (late) by someone');
});

export const menus = scenario('a menu is a click too', async bot => {
  const reply = await bot.use(sure);
  (await bot.select(reply.menu(), ['blue'])).says('picked blue by someone');
});

export const others = scenario('a click of someone else is not taken', async bot => {
  const reply = await bot.use(sure);
  (await bot.click(reply.button('Yes'), { by: bot.member('carol') })).says(/not available/);
  (await bot.click(reply.button('Yes'))).says('yes by someone');
});

export const late = scenario('a button only waited for is not available once nothing waits', async bot => {
  const reply = await bot.use(sure);
  await bot.endWaits();
  reply.says('Too slow');
  (await bot.click(yes)).says(/not available/);
  void no;
  void pick;
});

export const reactions = scenario('a reaction is waited for', async bot => {
  const reply = await bot.use(vote);
  await bot.react(reply.message!, '👎', { by: bot.member('bob') });
  await bot.react(reply.message!, '👍', { by: bot.member('alice') });
  reply.followUps.at(-1)!.says('alice agrees');
});
`;

describe.skipIf(process.platform === 'win32')(
  'waiting, in chapterjs test',
  () => {
    it('lets scenarios answer what the bot waits for, and end the waits', () => {
      const { code, output } = runTest({
        'src/games.ts': GAMES,
        'src/games.test.ts': SCENARIOS,
      });
      expect(output).toContain('✓ Tested src/games.test.ts');
      expect(code).toBe(0);
      // A button or a menu only waited for has nothing of its own to check:
      // the 4 commands are.
      expect(output).toContain('✓ Checked every file once: 4 checks in 1 file');
    }, 60_000);

    it('reports a test of a wait that throws, with its line', () => {
      const { code, output } = runTest({
        'src/broken.ts': `import { command } from 'chapterjs';
export const quiz = command({
  name: 'quiz',
  description: 'A question',
  async run({ interaction, channel }) {
    await interaction.reply('Go');
    await channel.waitForMessage({ matches: () => { throw new Error('bad test'); } });
  },
});
`,
        'src/broken.test.ts': `import { scenario } from 'chapterjs/test';
import { quiz } from './broken';
export const s = scenario('breaks', async bot => {
  await bot.use(quiz);
  await bot.say('hi');
});
`,
      });
      expect(code).toBe(1);
      expect(output).toContain('src/broken.ts:7 bad test');
    }, 60_000);
  }
);
