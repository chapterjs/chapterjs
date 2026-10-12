import { button } from 'chapterjs';
import { giveaways } from './giveaways';

// The button under every giveaway: a click enters, a second click leaves.
// It knows its giveaway by the message it is on. The label shows how many
// entered: the message changes at every click.
export const enter = button({
  label: ({ t }) => t('entries', { count: 0 }),
  emoji: '🎉',
  style: 'success',
  async run({ interaction, guild, user, t }) {
    const key = [guild.id, interaction.message.id];
    const found = await giveaways.get(key);
    if (!found || found.ended) {
      await interaction.reply({ content: t('over'), ephemeral: true });
      return;
    }
    const entered = !found.entrants.includes(user.id);
    // Read and written in one go: two clicks at once both count.
    const giveaway = await giveaways.update(key, (current = found) => ({
      ...current,
      entrants: entered
        ? [...new Set([...current.entrants, user.id])]
        : current.entrants.filter(id => id !== user.id),
    }));
    await interaction.update({
      components: [
        enter({ label: t('entries', { count: giveaway.entrants.length }) }),
      ],
    });
    await interaction.followUp({
      content: entered ? t('entered') : t('left'),
      ephemeral: true,
    });
  },
});
