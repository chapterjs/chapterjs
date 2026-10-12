import { scenario } from 'chapterjs/test';
import { close } from './close';
import { openTicket } from './open';
import panel, { open } from './panel';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server. `bot` is this bot in a test server, with people you name.
export default [
  scenario('the panel is posted by the staff only', async bot => {
    const refused = await bot.use(panel);
    refused.isEphemeral().says('Manage Threads');

    const staff = bot.member('staff', { permissions: ['ManageThreads'] });
    const reply = await bot.use(panel, {}, { by: staff });
    reply.isEphemeral().says('The panel is posted.');
    bot
      .channel('general')
      .last!.hasEmbed('Need help?')
      .hasButton('Open a ticket');
  }),

  scenario('a ticket opens in a private thread, once per person', async bot => {
    const click = await bot.click(open);
    click.opensForm(openTicket);

    const reply = await bot.submit(openTicket, {
      subject: 'No sound',
      category: 'bug',
      details: 'The music stops after a minute, every single time.',
    });
    reply.isEphemeral().says('Your ticket is open');
    const [thread] = bot.channel('general').threads;
    thread!
      .last!.says('Thanks')
      .hasEmbed('No sound')
      .hasButton('Close the ticket');

    const again = await bot.submit(openTicket, {
      subject: 'Another one',
      category: 'question',
      details: 'Can I open two tickets at the same time, please?',
    });
    again.isEphemeral().says('You already have a ticket open');
  }),

  scenario('only the staff or who opened a ticket closes it', async bot => {
    await bot.click(open);
    await bot.submit(openTicket, {
      subject: 'Login',
      category: 'other',
      details: 'I can not log in since this morning, what can I do?',
    });
    const [thread] = bot.channel('general').threads;
    const ticket = thread!.last!;

    const stranger = await bot.click(ticket.button('Close the ticket'), {
      by: bot.member('stranger'),
      in: thread,
      on: ticket,
    });
    stranger.isEphemeral().says('Only the staff');

    const closed = await bot.click(ticket.button('Close the ticket'), {
      in: thread,
      on: ticket,
    });
    closed.isPublic().says('Ticket closed by');
    if (!thread!.archived || !thread!.locked) {
      throw new Error('The thread should be archived and locked.');
    }
  }),
];
