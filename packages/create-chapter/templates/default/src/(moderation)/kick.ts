import { command } from 'chapterjs';

// /kick: the texts come from the language files, like every command here.
import { canPunish } from './checks';

export default command({
  name: 'kick',
  permissions: ['KickMembers'],
  ephemeral: true,
  options: {
    target: { type: 'user', required: true },
    reason: { type: 'string' },
  },
  async run({ interaction, options, member, guild, t }) {
    const target = guild.members.get(options.target.id);
    if (!target) {
      await interaction.reply(t('notHere', { user: options.target.username }));
      return;
    }
    if (!canPunish(member, target)) {
      await interaction.reply(t('cannotPunish', { user: target.displayName }));
      return;
    }
    await target.kick(options.reason);
    await interaction.reply(t('kick.done', { user: target.displayName }));
  },
});
