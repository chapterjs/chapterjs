import assert from 'node:assert/strict';
import { scenario, type TestBot } from 'chapterjs/test';
import add from './add';
import { ticketForm } from './form';
import panel, { open } from './panel';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. `bot` is this bot in a test server, with the people you name.
const staff = { permissions: ['ManageThreads'] } as const;

/** Someone clicks the button of the panel and sends the form. */
async function openTicket(bot: TestBot) {
  (await bot.click(open)).opensForm(ticketForm);
  const reply = await bot.submit(ticketForm, {
    subject: 'No sound',
    category: 'bug',
    details: 'The music stops after a minute, every single time.',
  });
  const [thread] = bot.channel('general').threads;
  return { reply, thread: thread!, ticket: thread!.last! };
}

export default [
  scenario('the panel is posted by the staff only', async bot => {
    (await bot.use(panel)).isEphemeral().says('Manage Threads');

    const posted = await bot.use(panel, {}, { by: bot.member('mod', staff) });
    posted.isEphemeral().says('The panel is posted.');
    bot
      .channel('general')
      .last!.hasEmbed('Need help?')
      .hasButton('Open a ticket');
  }),

  scenario('a ticket opens in a private thread, once per person', async bot => {
    const { reply, ticket } = await openTicket(bot);
    reply.isEphemeral().says('Your ticket is open');
    ticket
      .says('Thanks')
      .hasEmbed('No sound')
      .hasButton('Claim')
      .hasButton('Close');

    const again = await bot.submit(ticketForm, {
      subject: 'Another one',
      category: 'question',
      details: 'Can I open two tickets at the same time, please?',
    });
    again.isEphemeral().says('You already have a ticket open');
  }),

  scenario('the staff claims a ticket and adds someone', async bot => {
    const { thread, ticket } = await openTicket(bot);
    const mod = bot.member('mod', staff);

    const refused = await bot.click(ticket.button('Claim'), {
      in: thread,
      on: ticket,
    });
    refused.isEphemeral().says('Only the staff');

    const claimed = await bot.click(ticket.button('Claim'), {
      by: mod,
      in: thread,
      on: ticket,
    });
    claimed.updatesMessage();
    claimed.followUps[0]!.says(`<@${mod.id}>`).says(
      'is taking care of this ticket'
    );
    assert.equal(ticket.button('Claimed by Mod').disabled, true);

    const bob = bot.member('bob');
    (await bot.use(add, { user: bob }, { by: mod, in: thread })).says(
      'was added to the ticket'
    );
    assert.ok(thread.members.some(member => member.id === bob.id));
  }),

  scenario('only the staff or who opened a ticket closes it', async bot => {
    const { thread, ticket } = await openTicket(bot);

    const stranger = await bot.click(ticket.button('Close'), {
      by: bot.member('stranger'),
      in: thread,
      on: ticket,
    });
    stranger.isEphemeral().says('Only the staff');

    const closed = await bot.click(ticket.button('Close'), {
      in: thread,
      on: ticket,
    });
    closed.isPublic().says('Ticket closed by');
    assert.ok(thread.archived && thread.locked);

    // Closed, so a new one can be opened.
    await bot.click(open);
    (
      await bot.submit(ticketForm, {
        subject: 'Again',
        category: 'other',
        details: 'Another question, now that the first one is closed.',
      })
    ).says('Your ticket is open');
  }),
];
