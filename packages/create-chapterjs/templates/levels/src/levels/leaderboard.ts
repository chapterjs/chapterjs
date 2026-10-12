import { button, command, userMention, type Translator } from 'chapterjs';
import { levelOf, xp } from './xp';

const PER_PAGE = 10;

/** One page of the leaderboard: the embed and the buttons around it. */
async function leaderboard(t: Translator, wanted: number) {
  const pages = Math.max(1, Math.ceil((await xp.size()) / PER_PAGE));
  // A page that no longer exists (people left the leaderboard) is the
  // nearest one that does.
  const page = Math.min(Math.max(0, Math.trunc(wanted) || 0), pages - 1);
  const entries = await xp.top(PER_PAGE, page * PER_PAGE);
  const lines = entries.map(
    entry =>
      `**${entry.rank}.** ${userMention(entry.id)}: ${t('levelShort', { level: levelOf(entry.score) })}, ${entry.score} XP`
  );
  return {
    embeds: [
      {
        title: t('leaderboardTitle'),
        description: lines.join('\n') || t('leaderboardEmpty'),
        color: 0xc026d3,
        footer: { text: t('page', { page: page + 1, pages }) },
      },
    ],
    // One button declaration, put twice with a different page to go to.
    components: [
      turn(
        { page: page - 1 },
        { label: t('previous'), emoji: '◀️', disabled: page === 0 }
      ),
      turn({ page: page + 1 }, { disabled: page + 1 >= pages }),
    ],
  };
}

export default command({
  name: 'leaderboard',
  async run({ interaction, t }) {
    await interaction.reply(await leaderboard(t, 0));
  },
});

// The page a button goes to is its `data`, carried by the button itself:
// nothing to remember between two clicks. What the file says is the look by
// default; the previous button changes it where it is put.
export const turn = button({
  label: ({ t }) => t('next'),
  emoji: '▶️',
  style: 'secondary',
  data: { page: 'number' },
  async run({ interaction, data, t }) {
    await interaction.update(await leaderboard(t, data.page));
  },
});
