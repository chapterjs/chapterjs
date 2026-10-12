import assert from 'node:assert/strict';
import { scenario } from 'chapterjs/test';
import leaderboard from './leaderboard';
import rank, { rankMenu, setXp } from './rank';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. Each scenario starts on a fresh server, with empty rankings.
const admin = { permissions: ['ManageGuild'] } as const;

export default [
  scenario('a message gives XP, once a minute', async bot => {
    const alice = bot.member('alice');
    await bot.say('hello', { by: alice });
    await bot.say('hello again', { by: alice });

    const card = await bot.use(rank, {}, { by: alice });
    card.hasEmbed('Alice');
    const [level, place, progress] = card.embeds[0]!.fields!;
    assert.equal(level!.value, '0');
    assert.equal(place!.value, '#1');
    // 15 to 25 XP for the first message, nothing for the second.
    assert.match(progress!.value, /^▰*▱+ (1[5-9]|2[0-5]) \/ 100 XP$/);
  }),

  scenario('a new level is told, and gives its role', async bot => {
    const alice = bot.member('alice');
    bot.role('Active');
    const set = await bot.use(
      setXp,
      { user: alice, amount: 1490 },
      { by: bot.member('admin', admin) }
    );
    set.says('now has 1,490 XP: level 4.');

    await bot.say('one more', { by: alice });
    bot.channel('general').last!.says(`<@${alice.id}> reached level 5!`);
    assert.ok(alice.hasRole('Active'));
  }),

  scenario('the leaderboard goes page after page', async bot => {
    const by = { by: bot.member('admin', admin) };
    for (let index = 0; index < 12; index += 1) {
      await bot.use(
        setXp,
        { user: bot.member(`m${index}`), amount: index * 100 },
        by
      );
    }
    const first = await bot.use(leaderboard);
    first.hasEmbed('🏆 Leaderboard');
    assert.equal(first.embeds[0]!.footer!.text, 'Page 1 of 2');
    assert.equal(first.button('Previous').disabled, true);

    const second = await bot.click(first.button('Next'), { on: first });
    second.updatesMessage();
    assert.equal(second.embeds[0]!.footer!.text, 'Page 2 of 2');
    assert.match(second.embeds[0]!.description!, /^\*\*11\.\*\* /);
    assert.equal(second.button('Next').disabled, true);
  }),

  scenario('the menu of a person shows their card', async bot => {
    const bob = bot.member('bob');
    const card = await bot.use(rankMenu, { on: bob });
    card.isEphemeral().hasEmbed('Bob');
  }),
];
