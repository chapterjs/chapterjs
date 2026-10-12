import { command, embed, type Translator, type User } from 'chapterjs';
import { levelOf, progressBar, xp, xpForLevel } from './xp';

// An embed is a function of what it shows, reusable from any file: the
// card of someone, with their level, their XP and their place.
export const rankCard = embed(
  (t: Translator, user: User, points: number, rank: number | undefined) => {
    const level = levelOf(points);
    return {
      title: user.displayName,
      thumbnail: { url: user.avatarURL() },
      color: 0xc026d3,
      fields: [
        { name: t('level'), value: String(level), inline: true },
        {
          name: t('rank'),
          value: rank === undefined ? '-' : `#${rank}`,
          inline: true,
        },
        {
          name: t('progress'),
          value: `${progressBar(points)} ${points} / ${xpForLevel(level + 1)} XP`,
        },
      ],
    };
  }
);

/** The card of `user` in the server the code runs for. */
async function cardOf(t: Translator, user: User) {
  const points = (await xp.score(user.id)) ?? 0;
  return rankCard(t, user, points, await xp.rankOf(user.id));
}

// /rank shows your card, or the one of someone else.
export default command({
  name: 'rank',
  options: {
    user: { type: 'user' },
  },
  async run({ interaction, options, user, t }) {
    await interaction.reply({
      embeds: [await cardOf(t, options.user ?? user)],
    });
  },
});

// The same from the menu of a person: right click them, Apps, Rank.
// `type: 'user'` gives `run` who was clicked as `target`. The name of a menu
// is translated here: language files only describe slash commands.
export const rankMenu = command({
  type: 'user',
  name: 'Rank',
  locales: { fr: { name: 'Niveau' } },
  ephemeral: true,
  async run({ interaction, target, t }) {
    await interaction.reply({ embeds: [await cardOf(t, target)] });
  },
});

// /xp set changes the XP of someone by hand: to fix a mistake, or to bring
// the levels of another bot.
export const setXp = command({
  name: 'xp set',
  permissions: ['ManageGuild'],
  options: {
    user: { type: 'user', required: true },
    amount: { type: 'integer', min: 0, max: 10_000_000, required: true },
  },
  async run({ interaction, options, t }) {
    await xp.set(options.user.id, options.amount);
    await interaction.reply(
      t('xpSet', {
        user: options.user.toString(),
        count: options.amount,
        level: levelOf(options.amount),
      })
    );
  },
});
