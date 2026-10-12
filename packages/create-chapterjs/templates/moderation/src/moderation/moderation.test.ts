import assert from 'node:assert/strict';
import { scenario } from 'chapterjs/test';
import { lock, slowmode } from './channel';
import purge from './purge';
import timeout from './timeout';
import warn, { list } from './warn';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. Each scenario starts on a fresh server, with empty stores.
const mod = {
  permissions: ['ModerateMembers', 'ManageMessages', 'ManageChannels'],
} as const;

export default [
  scenario('warnings add up, per member', async bot => {
    const alice = bot.member('alice');
    const by = { by: bot.member('mod', mod) };
    const first = await bot.use(warn, { user: alice, reason: 'spam' }, by);
    first.says('They have 1 warning.');
    const second = await bot.use(warn, { user: alice, reason: 'again' }, by);
    second.says('They have 2 warnings.');

    const listed = await bot.use(list, { user: alice }, by);
    listed.isEphemeral().says('has 2 warnings').says('spam').says('again');
    const nobody = await bot.use(list, { user: bot.member('bob') }, by);
    nobody.says('has no warning');
  }),

  scenario(
    'a timeout needs the permission, and spares the owner',
    async bot => {
      const alice = bot.member('alice');
      const refused = await bot.use(timeout, { user: alice, duration: 5 });
      refused.isEphemeral().says('Moderate Members');

      const by = { by: bot.member('mod', mod) };
      const owner = await bot.use(
        timeout,
        { user: bot.owner, duration: 5 },
        by
      );
      owner.isEphemeral().says('You can not moderate');

      // Someone who left is no member any more.
      const gone = await bot.join('gone');
      await bot.leave(gone);
      const left = await bot.use(timeout, { user: gone, duration: 5 }, by);
      left.isEphemeral().says('is not in this server');

      const done = await bot.use(timeout, { user: alice, duration: 60 }, by);
      done.says('is timed out');
      assert.equal(alice.timedOut, true);
    }
  ),

  scenario('purge deletes the last messages', async bot => {
    await bot.say('one');
    await bot.say('two');
    await bot.say('three');
    const by = { by: bot.member('mod', mod) };
    const reply = await bot.use(purge, { count: 2 }, by);
    reply.isDeferred().isEphemeral().says('2 messages deleted.');
    assert.deepEqual(
      bot.channel('general').messages.map(message => message.content),
      ['one']
    );
  }),

  scenario('slowmode and lock change the channel', async bot => {
    const by = { by: bot.member('mod', mod) };
    const slow = await bot.use(slowmode, { seconds: 5 }, by);
    slow.says('one message every 5 seconds');
    assert.equal(bot.channel('general').slowmode, 5);

    const locked = await bot.use(lock, { reason: 'calm down' }, by);
    locked.says('locked').says('calm down');
    assert.equal(
      bot.channel('general').allows(bot.someone, 'SendMessages'),
      false
    );
  }),
];
