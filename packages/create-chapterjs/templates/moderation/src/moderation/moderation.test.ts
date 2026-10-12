import assert from 'node:assert/strict';
import { scenario } from 'chapterjs/test';
import { lock, slowmode, unlock } from './channel';
import { ban, kick, timeout } from './members';
import purge from './purge';
import { clear, list, warn } from './warnings';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. Each scenario starts on a fresh server, with empty stores.
const mod = {
  permissions: [
    'ModerateMembers',
    'KickMembers',
    'BanMembers',
    'ManageMessages',
    'ManageChannels',
  ],
} as const;

export default [
  scenario('warnings add up, are listed and cleared', async bot => {
    const alice = bot.member('alice');
    const by = { by: bot.member('mod', mod) };
    (await bot.use(warn, { user: alice, reason: 'spam' }, by)).says(
      'They have 1 warning.'
    );
    (await bot.use(warn, { user: alice, reason: 'again' }, by)).says(
      'They have 2 warnings.'
    );
    alice.privateMessages.at(-1)!.says('You were warned on Test Server: again');

    const listed = await bot.use(list, { user: alice }, by);
    listed.isEphemeral().says('has 2 warnings').says('spam').says('again');

    await bot.use(clear, { user: alice }, by);
    (await bot.use(list, { user: alice }, by)).says('has no warning');
  }),

  scenario('a sanction spares the owner, yourself and who left', async bot => {
    const alice = bot.member('alice');
    (await bot.use(timeout, { user: alice, duration: 5 }))
      .isEphemeral()
      .says('Moderate Members');

    const moderator = bot.member('mod', mod);
    const by = { by: moderator };
    (await bot.use(kick, { user: bot.owner }, by))
      .isEphemeral()
      .says('You can not moderate');
    (await bot.use(ban, { user: moderator }, by))
      .isEphemeral()
      .says('not do that to yourself');

    const gone = await bot.join('gone');
    await bot.leave(gone);
    (await bot.use(timeout, { user: gone, duration: 5 }, by))
      .isEphemeral()
      .says('is not in this server');
  }),

  scenario('timeout, kick and ban do what they say', async bot => {
    const by = { by: bot.member('mod', mod) };
    const alice = bot.member('alice');
    (await bot.use(timeout, { user: alice, duration: 60 }, by)).says(
      'is timed out'
    );
    assert.equal(alice.timedOut, true);

    const bob = bot.member('bob');
    (await bot.use(kick, { user: bob, reason: 'rude' }, by)).says(
      'bob was kicked. Reason: rude'
    );
    assert.equal(bob.inServer, false);

    const carol = bot.member('carol');
    (await bot.use(ban, { user: carol, messages: 3600 }, by)).says(
      'carol was banned. Reason: none given'
    );
    assert.equal(carol.banned, true);
  }),

  scenario('purge deletes the last messages', async bot => {
    await bot.say('one');
    await bot.say('two');
    await bot.say('three');
    const reply = await bot.use(
      purge,
      { count: 2 },
      { by: bot.member('mod', mod) }
    );
    reply.isDeferred().isEphemeral().says('2 messages deleted.');
    assert.deepEqual(
      bot.channel('general').messages.map(message => message.content),
      ['one']
    );
  }),

  scenario('slowmode, lock and unlock change the channel', async bot => {
    const by = { by: bot.member('mod', mod) };
    (await bot.use(slowmode, { seconds: 5 }, by)).says(
      'one message every 5 seconds'
    );
    assert.equal(bot.channel('general').slowmode, 5);

    (await bot.use(lock, { reason: 'calm down' }, by)).says('calm down');
    assert.equal(
      bot.channel('general').allows(bot.someone, 'SendMessages'),
      false
    );

    (await bot.use(unlock, {}, by)).says('open again');
    assert.equal(
      bot.channel('general').allows(bot.someone, 'SendMessages'),
      true
    );
  }),
];
