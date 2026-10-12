import { button } from 'chapterjs';
import { tickets } from './tickets';

// The two buttons at the top of every ticket. Everyone in the thread sees
// them; the code decides who may use them. `data` is what a button carries
// from the message to the click: here, who opened the ticket.

// A member of the staff takes the ticket: the button says who, and can't be
// clicked again.
export const claim = button({
  label: ({ t }) => t('claimButton'),
  style: 'secondary',
  emoji: '🙋',
  data: { userId: 'string' },
  async run({ interaction, data, member, t }) {
    if (!member.permissions.has('ManageThreads')) {
      await interaction.reply({ content: t('staffOnly'), ephemeral: true });
      return;
    }
    // `update` changes the message the button is on.
    await interaction.update({
      components: [
        claim(data, {
          label: t('claimedBy', { user: member.displayName }),
          disabled: true,
        }),
        close(data),
      ],
    });
    await interaction.followUp(t('claimed', { user: member.toString() }));
  },
});

// The staff, or who opened the ticket, closes it: the thread is locked and
// archived, and the person may open another one.
export const close = button({
  label: ({ t }) => t('closeButton'),
  style: 'danger',
  emoji: '🔒',
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
    await tickets.delete(data.userId);
    // Who opened it is told in private, unless they closed it themselves.
    // Someone who refuses private messages is not an error.
    if (member.id !== data.userId) {
      const opener = await guild.fetchMember(data.userId).catch(() => null);
      await opener
        ?.send(t('closedDm', { ticket: channel.name, server: guild.name }))
        .catch(() => {});
    }
  },
});
