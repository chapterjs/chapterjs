import { command } from 'chapterjs';

// /ticket add brings someone else into the ticket it is used in: a
// colleague who knows the answer, or a friend of who opened it.
export default command({
  name: 'ticket add',
  permissions: ['ManageThreads'],
  options: {
    user: { type: 'user', required: true },
  },
  async run({ interaction, options, channel, t }) {
    if (!channel.isThread()) {
      await interaction.reply({ content: t('notATicket'), ephemeral: true });
      return;
    }
    await channel.addMember(options.user);
    await interaction.reply(t('added', { user: options.user.toString() }));
  },
});
