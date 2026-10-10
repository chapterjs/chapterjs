import { command, timestamp, type GuildMember } from 'chapterjs';

// Someone can only act on people below them, and never on the owner.
function canModerate(target: GuildMember, by: GuildMember): boolean {
  return (
    target.id !== target.guild.ownerId &&
    target.highestRole.position < by.highestRole.position
  );
}

// /timeout keeps someone from writing, reacting and speaking for a while.
// `permissions` is what a member needs to see and use the command; the bot
// itself needs Moderate Members. The choices of `duration` are what the
// person picks from, in minutes.
export default command({
  name: 'timeout',
  permissions: ['ModerateMembers'],
  options: {
    user: { type: 'user', required: true },
    duration: {
      type: 'integer',
      required: true,
      choices: {
        '5 minutes': 5,
        '1 hour': 60,
        '1 day': 60 * 24,
        '1 week': 60 * 24 * 7,
      },
    },
    reason: { type: 'string', maxLength: 200 },
  },
  async run({ interaction, options, guild, member, t }) {
    const target = await guild.fetchMember(options.user);
    if (!canModerate(target, member)) {
      await interaction.reply({
        content: t('cantModerate', { user: target.toString() }),
        ephemeral: true,
      });
      return;
    }
    const until = Date.now() + options.duration * 60 * 1000;
    await target.timeout(
      options.duration * 60 * 1000,
      options.reason ?? `By ${member.user.username}`
    );
    await interaction.reply(
      t('timedOut', {
        user: target.toString(),
        until: timestamp(until, 'R'),
        reason: options.reason ?? t('noReason'),
      })
    );
  },
});

export const untimeout = command({
  name: 'untimeout',
  permissions: ['ModerateMembers'],
  options: {
    user: { type: 'user', required: true },
  },
  async run({ interaction, options, guild, member, t }) {
    const target = await guild.fetchMember(options.user);
    // The same rule as /timeout: nobody lifts what someone above them set.
    if (!canModerate(target, member)) {
      await interaction.reply({
        content: t('cantModerate', { user: target.toString() }),
        ephemeral: true,
      });
      return;
    }
    if (!target.isTimedOut) {
      await interaction.reply({
        content: t('notTimedOut', { user: target.toString() }),
        ephemeral: true,
      });
      return;
    }
    await target.removeTimeout(`By ${member.user.username}`);
    await interaction.reply(t('timeoutRemoved', { user: target.toString() }));
  },
});
