import { button, command } from 'chapterjs';
import { openTicket } from './open';

// /ticket panel posts the message people open a ticket from: an embed and
// a button. Only the staff can post it (`permissions`); Discord hides the
// command from everyone else. `t` speaks the language of the server.
export default command({
  name: 'ticket panel',
  permissions: ['ManageThreads'],
  async run({ interaction, channel, t }) {
    await channel.send({
      embeds: [
        {
          title: t('panelTitle'),
          description: t('panelText'),
          color: 0xc026d3,
        },
      ],
      components: [open],
    });
    await interaction.reply({ content: t('panelPosted'), ephemeral: true });
  },
});

// A button is named by its export (`open`): nothing to register, no id to
// write. Its label is a function of `t`, run when the message is sent.
export const open = button({
  label: ({ t }) => t('openButton'),
  style: 'primary',
  emoji: '🎫',
  async run({ interaction }) {
    // A form must be the first answer to a click.
    await interaction.showModal(openTicket);
  },
});
