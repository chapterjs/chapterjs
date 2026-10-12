import { scenario } from 'chapterjs/test';
import { challengeAuthor, duel } from './duel/duel';
import { quizScore } from './quiz/score-menu';
import { scores, start } from './quiz/quiz';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. While a function waits (`waitForMessage()`, `waitForClick()`),
// what the test does next is what it waits for; `bot.endWaits()` ends
// every wait as if its time was up.
export default [
  scenario('the first right answer of the quiz wins a point', async bot => {
    const alice = bot.member('alice');
    (await bot.use(start)).says('First to answer in 30 seconds wins!');
    await bot.say('no idea', { by: bot.member('bob') });
    // The question is picked at random: every answer, until the bot speaks.
    for (const answer of ['Paris', '8', 'Jupiter', '1969', 'H2O']) {
      await bot.say(answer, { by: alice });
      if (bot.channel('general').last!.fromBot) break;
    }
    bot.channel('general').last!.says('alice found it, 1 point now.');
    (await bot.use(scores)).hasEmbed('Best players');
    (await bot.use(quizScore, { on: alice }))
      .isEphemeral()
      .says('alice has 1 point, rank 1 on this server.');
  }),

  scenario('nobody finds it in time', async bot => {
    await bot.use(start);
    await bot.endWaits();
    bot.channel('general').last!.says('Time is up!');
    (await bot.use(scores)).isEphemeral().says('Nobody has a point yet');
  }),

  scenario('a duel is accepted by who was challenged only', async bot => {
    const alice = bot.member('alice');
    const bob = bot.member('bob');
    const asked = await bot.use(duel, { opponent: bob }, { by: alice });
    asked.says('challenges you to a duel').hasButton('Accept');
    (await bot.click(asked.button('Accept'), { by: bot.member('carol') })).says(
      'not available'
    );
    const fought = await bot.click(asked.button('Accept'), { by: bob });
    fought.says('🎲 alice rolls').hasNoComponent();
  }),

  scenario('a duel can be declined, or never answered', async bot => {
    const bob = bot.member('bob');
    const asked = await bot.use(duel, { opponent: bob });
    (await bot.click(asked.button('Decline'), { by: bob })).says(
      'bob declined the duel.'
    );
    const again = await bot.use(duel, { opponent: bob });
    await bot.endWaits();
    again.says('bob did not answer: no duel.');
  }),

  scenario('the author of a message is challenged from its menu', async bot => {
    const said = await bot.say('I am the best', { by: bot.member('dave') });
    // The menu of a message passes its author to the duel.
    const asked = await bot.use(challengeAuthor, { on: said });
    const dave = bot.member('dave');
    asked.says(`<@${dave.id}>`).says('challenges you to a duel');
    (await bot.use(duel, { opponent: bot.someone }))
      .isEphemeral()
      .says('not yourself');
  }),
];
