import { command, select } from 'chapterjs';

// The roles people may give themselves: change the list, and create them
// in your server with the same names.
const SELF_ROLES = ['Announcements', 'Events', 'Gaming'] as const;

// /roles shows the menu, with what the person already has picked.
export default command({
  name: 'roles',
  ephemeral: true,
  async run({ interaction, member, t }) {
    const mine = member.roles
      .map(role => role.name)
      .filter((name): name is (typeof SELF_ROLES)[number] =>
        (SELF_ROLES as readonly string[]).includes(name)
      );
    await interaction.reply({
      content: t('pickRoles'),
      components: [pick({ defaults: mine })],
    });
  },
});

// A select menu is named by its export. `values` is what was picked, typed
// from `options`; `min: 0` lets the person remove every role.
export const pick = select({
  placeholder: ({ t }) => t('rolesPlaceholder'),
  options: SELF_ROLES,
  min: 0,
  max: SELF_ROLES.length,
  async run({ interaction, values, member, guild, t }) {
    const roles = [...guild.roles.values()];
    const missing: string[] = [];
    for (const name of SELF_ROLES) {
      const role = roles.find(role => role.name === name);
      if (!role) {
        missing.push(name);
        continue;
      }
      const wanted = values.includes(name);
      if (wanted && !member.hasRole(role))
        await member.addRole(role, 'Picked with /roles');
      if (!wanted && member.hasRole(role))
        await member.removeRole(role, 'Removed with /roles');
    }
    await interaction.update({
      content:
        values.length === 0
          ? t('noRoles')
          : t('rolesUpdated', { roles: values.join(', ') }),
      components: [],
    });
    if (missing.length > 0) {
      await interaction.followUp({
        content: t('rolesMissing', { roles: missing.join(', ') }),
        ephemeral: true,
      });
    }
  },
});
