import assert from 'node:assert/strict';
import { scenario } from 'chapterjs/test';
import roles, { pick } from './roles/roles';
import { weekly } from './stats/weekly';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. The welcome channel does not exist there, so the bot writes in
// the system channel of the server, #general.
export default [
  scenario('people are welcomed, and waved goodbye', async bot => {
    const newbie = await bot.join('newbie');
    bot
      .channel('general')
      .last!.says('Welcome to Test Server')
      .hasEmbed('Newbie');

    await bot.leave(newbie);
    bot.channel('general').last!.says('Newbie left.');
  }),

  scenario('people pick their roles, once the roles exist', async bot => {
    const menu = await bot.use(roles);
    menu.isEphemeral().says('Pick the roles');

    const missing = await bot.select(pick, ['Announcements']);
    missing.updatesMessage().says('Your roles: Announcements.');
    missing.followUps[0]!.says('do not exist in this server yet');

    bot.role('Announcements');
    bot.role('Events');
    bot.role('Gaming');
    const picked = await bot.select(pick, ['Announcements', 'Gaming']);
    picked.says('Your roles: Announcements, Gaming.');
    assert.deepEqual([...bot.someone.roles].sort(), [
      'Announcements',
      'Gaming',
    ]);

    const none = await bot.select(pick, []);
    none.says('You have none of these roles now.');
    assert.deepEqual(bot.someone.roles, []);
  }),

  scenario('the weekly stats are posted', async bot => {
    await bot.run(weekly);
    bot.channel('general').last!.hasEmbed('A new week on Test Server');
  }),
];
