import { command, store, timestamp } from 'chapterjs';

interface Warning {
  reason: string;
  /** Who gave it: a user id. */
  by: string;
  /** When, in ms since the epoch: a Date would not survive the file. */
  at: number;
}

// The warnings of each member, kept from one restart to the next, per
// server: `warnings.get(member.id)` in a command is the warnings of that
// member in the server the command was used in. A warning is forgotten
// thirty days after the last one was added.
export const warnings = store<Warning[]>({ expires: '30d' });

export default command({
  name: 'warn add',
  permissions: ['ModerateMembers'],
  options: {
    user: { type: 'user', required: true },
    reason: { type: 'string', required: true, maxLength: 200 },
  },
  async run({ interaction, options, member, t }) {
    // Reads, adds and keeps in one go; `list` is undefined the first time.
    const list = await warnings.update(options.user.id, (list = []) => [
      ...list,
      { reason: options.reason, by: member.id, at: Date.now() },
    ]);
    await interaction.reply(
      t('warned', { user: options.user.toString(), count: list.length })
    );
  },
});

export const list = command({
  name: 'warn list',
  permissions: ['ModerateMembers'],
  ephemeral: true,
  options: {
    user: { type: 'user', required: true },
  },
  async run({ interaction, options, t }) {
    const list = (await warnings.get(options.user.id)) ?? [];
    if (list.length === 0) {
      await interaction.reply(
        t('noWarnings', { user: options.user.toString() })
      );
      return;
    }
    await interaction.reply(
      [
        t('warningsOf', { user: options.user.toString(), count: list.length }),
        ...list.map(
          warning =>
            `• ${timestamp(warning.at, 'R')} <@${warning.by}>: ${warning.reason}`
        ),
      ].join('\n')
    );
  },
});
