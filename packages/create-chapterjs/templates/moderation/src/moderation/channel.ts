import { command } from 'chapterjs';

// /slowmode sets how long people wait between two messages in the channel.
// 0 removes it.
export const slowmode = command({
  name: 'slowmode',
  permissions: ['ManageChannels'],
  options: {
    seconds: { type: 'integer', min: 0, max: 21600, required: true },
  },
  async run({ interaction, options, channel, member, t }) {
    if (!channel.isText()) {
      await interaction.reply({ content: t('notHere'), ephemeral: true });
      return;
    }
    await channel.edit(
      { rateLimitPerUser: options.seconds },
      `By ${member.user.username}`
    );
    await interaction.reply(
      options.seconds === 0
        ? t('slowmodeOff')
        : t('slowmodeOn', { count: options.seconds })
    );
  },
});

// /lock keeps everyone from writing in the channel, /unlock gives it back.
// Both change the permissions of @everyone on the channel only.
export const lock = command({
  name: 'lock',
  permissions: ['ManageChannels'],
  options: {
    reason: { type: 'string', maxLength: 200 },
  },
  async run({ interaction, options, channel, guild, member, t }) {
    if (!channel.isText()) {
      await interaction.reply({ content: t('notHere'), ephemeral: true });
      return;
    }
    await channel.setPermissions(
      guild.everyoneRole,
      { deny: ['SendMessages', 'CreatePublicThreads', 'CreatePrivateThreads'] },
      options.reason ?? `Locked by ${member.user.username}`
    );
    await interaction.reply(
      t('locked', { reason: options.reason ?? t('noReason') })
    );
  },
});

export const unlock = command({
  name: 'unlock',
  permissions: ['ManageChannels'],
  async run({ interaction, channel, guild, member, t }) {
    if (!channel.isText()) {
      await interaction.reply({ content: t('notHere'), ephemeral: true });
      return;
    }
    // Deleting the overwrite gives @everyone back what the server says.
    await channel.deletePermissions(
      guild.everyoneRole,
      `Unlocked by ${member.user.username}`
    );
    await interaction.reply(t('unlocked'));
  },
});
