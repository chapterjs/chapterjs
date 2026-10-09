import { command, event } from 'chapterjs';
import { addWarning, warningsOf } from './checks';

// Two subcommands in one file: /warn add and /warn list. A subcommand is a
// matter of `name`, not of folder.
export const add = command({
  name: 'warn add',
  permissions: ['ModerateMembers'],
  options: {
    target: { type: 'user', required: true },
    reason: { type: 'string', required: true },
  },
  async run({ interaction, options, t }) {
    const count = addWarning(options.target.id);
    await interaction.reply(
      t('warn.added', { user: options.target.username, count })
    );
  },
});

export const list = command({
  name: 'warn list',
  permissions: ['ModerateMembers'],
  ephemeral: true,
  options: { target: { type: 'user', required: true } },
  async run({ interaction, options, t }) {
    await interaction.reply(
      t('warn.count', {
        user: options.target.username,
        count: warningsOf(options.target.id),
      })
    );
  },
});

// The event that goes with moderation, next to the commands it follows.
export const logged = event({
  name: 'banAdd',
  run({ user, guild }) {
    console.log(`${user.username} was banned from ${guild.name}`);
  },
});
