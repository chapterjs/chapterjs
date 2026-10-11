import { command } from 'chapterjs';

// /purge deletes the last messages of the channel, all of them or only
// the ones of a person. Discord only deletes in bulk what is less than two
// weeks old: older messages are left out, and the answer says how many
// really went.
export default command({
  name: 'purge',
  permissions: ['ManageMessages'],
  // The answer only the person sees, so the channel is not filled again.
  ephemeral: true,
  cooldown: { channel: '5s' },
  options: {
    count: { type: 'integer', min: 1, max: 100, required: true },
    user: { type: 'user' },
  },
  async run({ interaction, options, channel, member, t }) {
    // Deleting takes a moment: tell Discord the answer is coming.
    await interaction.defer();
    const messages = await channel.fetchMessages({ limit: options.count });
    const chosen = options.user
      ? messages.filter(message => message.author.id === options.user!.id)
      : messages;
    const deleted = await channel.bulkDelete(
      chosen,
      `Purge by ${member.user.username}`
    );
    await interaction.reply(t('purged', { count: deleted }));
  },
});
