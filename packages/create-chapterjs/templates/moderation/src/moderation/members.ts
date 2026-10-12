import { command, timestamp } from 'chapterjs';
import type {
  CommandInteraction,
  Guild,
  GuildMember,
  Translator,
  User,
} from 'chapterjs';

/**
 * The member a moderator acts on, or `null` after saying why not: someone
 * who is not in the server, the moderator themselves, or someone whose
 * highest role is not below theirs (the owner included).
 */
async function targetOf(
  interaction: CommandInteraction,
  t: Translator,
  guild: Guild,
  moderator: GuildMember,
  user: User
): Promise<GuildMember | null> {
  // Someone who left, or never joined, is no member: Discord says so.
  const target = await guild.fetchMember(user).catch(() => null);
  const refusal = !target
    ? t('notMember', { user: user.toString() })
    : target.id === moderator.id
      ? t('notYourself')
      : !moderator.isHigherThan(target)
        ? t('cantModerate', { user: target.toString() })
        : null;
  if (refusal) {
    await interaction.reply({ content: refusal, ephemeral: true });
    return null;
  }
  return target;
}

// /timeout keeps someone from writing, reacting and speaking for a while.
// `permissions` is what a member needs to see and use the command. The
// choices of `duration` are what the person picks from, in minutes.
export const timeout = command({
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
    const target = await targetOf(interaction, t, guild, member, options.user);
    if (!target) return;
    const ms = options.duration * 60 * 1000;
    await target.timeout(ms, options.reason ?? `By ${member.user.username}`);
    await interaction.reply(
      t('timedOut', {
        user: target.toString(),
        until: timestamp(Date.now() + ms, 'R'),
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
    const target = await targetOf(interaction, t, guild, member, options.user);
    if (!target) return;
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

export const kick = command({
  name: 'kick',
  permissions: ['KickMembers'],
  options: {
    user: { type: 'user', required: true },
    reason: { type: 'string', maxLength: 200 },
  },
  async run({ interaction, options, guild, member, t }) {
    const target = await targetOf(interaction, t, guild, member, options.user);
    if (!target) return;
    await target.kick(options.reason ?? `By ${member.user.username}`);
    await interaction.reply(
      t('kicked', {
        user: target.user.username,
        reason: options.reason ?? t('noReason'),
      })
    );
  },
});

// /ban can also delete what the person wrote lately: `messages` is how far
// back, in seconds.
export const ban = command({
  name: 'ban',
  permissions: ['BanMembers'],
  options: {
    user: { type: 'user', required: true },
    reason: { type: 'string', maxLength: 200 },
    messages: {
      type: 'integer',
      choices: {
        'Keep them': 0,
        'Last hour': 60 * 60,
        'Last day': 60 * 60 * 24,
        'Last week': 60 * 60 * 24 * 7,
      },
    },
  },
  async run({ interaction, options, guild, member, t }) {
    const target = await targetOf(interaction, t, guild, member, options.user);
    if (!target) return;
    await target.ban({
      reason: options.reason ?? `By ${member.user.username}`,
      deleteMessageSeconds: options.messages ?? 0,
    });
    await interaction.reply(
      t('banned', {
        user: target.user.username,
        reason: options.reason ?? t('noReason'),
      })
    );
  },
});
