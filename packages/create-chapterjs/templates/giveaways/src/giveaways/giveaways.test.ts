import assert from 'node:assert/strict';
import { scenario } from 'chapterjs/test';
import { drawGiveaways, endNow, list, reroll } from './manage';
import start from './start';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. Time does not pass there: `bot.run(task, date)` runs a task as if
// it was that date.
const host = { permissions: ['ManageGuild'] } as const;
const inTwoHours = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

export default [
  scenario('people enter and leave with the button', async bot => {
    (await bot.use(start, { prize: 'Nitro', duration: 60 }))
      .isEphemeral()
      .says('Manage Guild');

    const giveaway = await bot.use(
      start,
      { prize: 'Nitro', duration: 60 },
      { by: bot.member('host', host) }
    );
    giveaway.hasEmbed('🎁 Nitro').hasButton('Enter (0)');

    const alice = bot.member('alice');
    const entered = await bot.click(giveaway.button('Enter (0)'), {
      by: alice,
      on: giveaway,
    });
    entered.updatesMessage().hasButton('Enter (1)');
    entered.followUps[0]!.isEphemeral().says('You are in!');

    await bot.click(giveaway.button('Enter (1)'), {
      by: bot.member('bob'),
      on: giveaway,
    });
    const left = await bot.click(giveaway.button('Enter (2)'), {
      by: alice,
      on: giveaway,
    });
    left.hasButton('Enter (1)');
    left.followUps[0]!.says('You left the giveaway.');

    (await bot.use(list)).isEphemeral().says('**Nitro**, ends');
  }),

  scenario('the task draws the winners when time is up', async bot => {
    const giveaway = await bot.use(
      start,
      { prize: 'Nitro', duration: 60 },
      { by: bot.member('host', host) }
    );
    const bob = bot.member('bob');
    await bot.click(giveaway.button('Enter (0)'), { by: bob, on: giveaway });

    // Not time yet: nothing happens.
    await bot.run(drawGiveaways);
    giveaway.hasButton('Enter (1)');

    await bot.run(drawGiveaways, inTwoHours());
    assert.equal(giveaway.button('1 entrant').disabled, true);
    bot
      .channel('general')
      .last!.says(`Congratulations <@${bob.id}>! You won **Nitro**.`);
    (await bot.use(list)).says('No giveaway is running');

    // Only once, however many times the task runs.
    const said = bot.channel('general').messages.length;
    await bot.run(drawGiveaways, inTwoHours());
    assert.equal(bot.channel('general').messages.length, said);
  }),

  scenario(
    'the menu of the message ends it early, or draws again',
    async bot => {
      const by = { by: bot.member('host', host) };
      const giveaway = await bot.use(
        start,
        { prize: 'A sticker', duration: 10, winners: 1 },
        by
      );
      (await bot.use(reroll, { on: giveaway.message! }, by)).says(
        'not a giveaway that ended'
      );

      for (const [count, name] of ['alice', 'bob'].entries()) {
        await bot.click(giveaway.button(`Enter (${count})`), {
          by: bot.member(name),
          on: giveaway,
        });
      }
      (await bot.use(endNow, { on: giveaway.message! }, by)).says(
        'The giveaway is over'
      );
      const first = bot.channel('general').last!.content;
      assert.match(
        first,
        /^🎉 Congratulations <@\d+>! You won \*\*A sticker\*\*\.$/
      );

      (await bot.use(endNow, { on: giveaway.message! }, by)).says(
        'not a running giveaway'
      );
      (await bot.use(reroll, { on: giveaway.message! }, by)).says(
        'New winners are drawn.'
      );
      // The other one wins: the first winner is left out of a new draw.
      assert.notEqual(bot.channel('general').last!.content, first);
    }
  ),
];
