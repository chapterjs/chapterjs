import { ChannelType, modal } from 'chapterjs';
import { claim, close } from './actions';
import { tickets } from './tickets';

// The form a ticket starts with. `run` receives the fields typed from their
// kind: `subject` and `details` are texts, `category` one of the three
// values below.
export const ticketForm = modal({
  title: ({ t }) => t('formTitle'),
  fields: {
    subject: {
      type: 'text',
      label: ({ t }) => t('formSubject'),
      style: 'short',
      maxLength: 80,
    },
    category: {
      type: 'radio',
      label: ({ t }) => t('formCategory'),
      options: { Question: 'question', Bug: 'bug', Other: 'other' },
    },
    details: {
      type: 'text',
      label: ({ t }) => t('formDetails'),
      style: 'paragraph',
      minLength: 20,
      maxLength: 1000,
    },
  },
  ephemeral: true,
  async run({ interaction, fields, channel, member, t }) {
    if (!channel.isText()) {
      await interaction.reply(t('notHere'));
      return;
    }
    // One ticket at a time per person.
    const open = await tickets.get(member.id);
    if (open) {
      await interaction.reply(t('alreadyOpen', { thread: `<#${open}>` }));
      return;
    }
    // A private thread: only the people added to it, and the staff, see it.
    const thread = await channel.startThread(
      {
        name: `${fields.category}-${member.displayName}`.slice(0, 100),
        type: ChannelType.PrivateThread,
        invitable: false,
      },
      `Ticket of ${member.user.username}`
    );
    await thread.addMember(member);
    await tickets.set(member.id, thread.id);
    await thread.send({
      content: t('welcome', { user: member.toString() }),
      embeds: [
        {
          title: fields.subject,
          description: fields.details,
          color: 0xc026d3,
          fields: [
            { name: t('category'), value: fields.category, inline: true },
            { name: t('openedBy'), value: member.toString(), inline: true },
          ],
        },
      ],
      // The buttons carry who opened the ticket (`data`, kept by Discord in
      // the button itself): close knows who else may use it, and who to tell.
      components: [claim({ userId: member.id }), close({ userId: member.id })],
    });
    await interaction.reply(t('created', { thread: thread.toString() }));
  },
});
