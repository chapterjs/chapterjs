import { ChannelType, modal, store } from 'chapterjs';
import { close } from './close';

// The ticket each person has open: the id of its thread, by person. A
// store keeps data from one restart to the next, per server: in this
// server, `tickets.get(member.id)` is the ticket of that member here.
export const tickets = store<string>();

// The form a ticket starts with. `run` receives the fields typed from
// their kind: `subject` and `details` are strings, `category` is one of
// the three values below.
export const openTicket = modal({
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
      options: { Bug: 'bug', Question: 'question', Other: 'other' },
    },
    details: {
      type: 'text',
      label: ({ t }) => t('formDetails'),
      style: 'paragraph',
      minLength: 20,
      maxLength: 1000,
    },
  },
  async run({ interaction, fields, channel, member, t }) {
    if (!channel.isText()) {
      await interaction.reply({ content: t('notHere'), ephemeral: true });
      return;
    }
    // One ticket at a time per person.
    const open = await tickets.get(member.id);
    if (open) {
      await interaction.reply({
        content: t('alreadyOpen', { thread: `<#${open}>` }),
        ephemeral: true,
      });
      return;
    }
    // A private thread: only the people added to it, and the staff, see it.
    const thread = await channel.startThread(
      {
        name: `${fields.category}-${member.displayName}`.slice(0, 100),
        type: ChannelType.PrivateThread,
        invitable: false,
      },
      `Ticket opened by ${member.user.username}`
    );
    await thread.addMember(member);
    await tickets.set(member.id, thread.id);
    await thread.send({
      content: t('opened', { user: member.toString() }),
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
      // The close button carries who opened the ticket, so it knows who may
      // close it besides the staff, and who to tell when it is closed.
      components: [close({ userId: member.id })],
    });
    await interaction.reply({
      content: t('created', { thread: thread.toString() }),
      ephemeral: true,
    });
  },
});
