import { button } from 'chapterjs';
import { tickets } from './open';

// The button at the top of every ticket. Everyone in the thread sees it;
// the code decides who may use it: the staff, or who opened the ticket.
// `data` is what the button carries from the message to the click: here
// who opened the ticket, kept by Discord in the button itself.
export const close = button({
  label: ({ t }) => t('closeButton'),
  style: 'danger',
  data: { userId: 'string' },
  async run({ interaction, data, channel, member, guild, t }) {
    if (!channel.isThread()) {
      await interaction.reply({ content: t('notATicket'), ephemeral: true });
      return;
    }
    const staff = member.permissions.has('ManageThreads');
    if (!staff && member.id !== data.userId) {
      await interaction.reply({ content: t('notYours'), ephemeral: true });
      return;
    }
    // Said in the thread first: archiving it closes it for everyone.
    await interaction.reply(t('closing', { user: member.toString() }));
    await channel.edit(
      { locked: true, archived: true },
      `Closed by ${member.user.username}`
    );
    // The person may open another one.
    await tickets.delete(data.userId);
    // Who opened it is told in private, unless they closed it themselves.
    // A person who refuses private messages is not an error.
    if (member.id !== data.userId) {
      const opener = await guild.fetchMember(data.userId).catch(() => null);
      await opener
        ?.send(t('closedDm', { ticket: channel.name, server: guild.name }))
        .catch(() => {});
    }
  },
});
