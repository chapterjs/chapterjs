import { button, command } from 'chapterjs';
import { canPunish } from './checks';

// A folder is only a folder: `(moderation)` groups what moderation needs,
// and the framework reads what these files export, wherever they are.
// /ban asks for a confirmation, then bans. The command and its button live
// in the same file: the button is named by its export (`confirmBan`), and
// `who: 'author'` keeps it for the person who used the command.
export default command({
  name: 'ban',
  permissions: ['BanMembers'],
  ephemeral: true,
  options: {
    target: { type: 'user', required: true },
    reason: { type: 'string' },
    days: { type: 'integer', min: 0, max: 7 },
  },
  async run({ interaction, options, member, guild, t }) {
    const target = guild.members.get(options.target.id);
    if (target && !canPunish(member, target)) {
      await interaction.reply(t('cannotPunish', { user: target.displayName }));
      return;
    }
    await interaction.reply({
      content: t('ban.confirm', { user: options.target.username }),
      components: [
        confirmBan({
          userId: options.target.id,
          days: options.days ?? 0,
          reason: options.reason ?? '',
        }),
      ],
    });
  },
});

export const confirmBan = button({
  label: ({ t }) => t('ban.yes'),
  style: 'danger',
  who: 'author',
  data: { userId: 'string', days: 'number', reason: 'string' },
  async run({ interaction, data, guild, user, t }) {
    await guild.ban(data.userId, {
      reason: data.reason || t('ban.defaultReason', { by: user.username }),
      deleteMessageSeconds: data.days * 86_400,
    });
    await interaction.update({ content: t('ban.done'), components: [] });
  },
});
