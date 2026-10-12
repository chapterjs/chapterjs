import { command, store, timestamp } from 'chapterjs';

interface Warning {
  reason: string;
  /** Who gave it: a user id. */
  by: string;
  /** When, in ms since 1970: a store keeps JSON, and a Date is not. */
  at: number;
}

// The warnings of each member, kept from one restart to the next, per
// server: in a command, `warnings.get(id)` reads the server it is used in.
// The list is forgotten 30 days after its last warning.
export const warnings = store<Warning[]>({ expires: '30d' });

export const warn = command({
  name: 'warn add',
  permissions: ['ModerateMembers'],
  options: {
    user: { type: 'user', required: true },
    reason: { type: 'string', required: true, maxLength: 200 },
  },
  async run({ interaction, options, member, guild, t }) {
    // Reads, adds and keeps in one go; `list` is undefined the first time.
    const list = await warnings.update(options.user.id, (list = []) => [
      ...list,
      { reason: options.reason, by: member.id, at: Date.now() },
    ]);
    await interaction.reply(
      t('warned', { user: options.user.toString(), count: list.length })
    );
    // The person is told in private. Someone who refuses private messages
    // is not an error.
    await options.user
      .send(t('warnedDm', { server: guild.name, reason: options.reason }))
      .catch(() => {});
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

export const clear = command({
  name: 'warn clear',
  permissions: ['ModerateMembers'],
  options: {
    user: { type: 'user', required: true },
  },
  async run({ interaction, options, t }) {
    await warnings.delete(options.user.id);
    await interaction.reply(
      t('warningsCleared', { user: options.user.toString() })
    );
  },
});
