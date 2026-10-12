import { command } from 'chapterjs';
import { quizScores } from './scores';

// A menu command: right click someone, Apps, "Quiz score". `type: 'user'`
// puts it in the menu of a person, and `run` receives them as `target`.
// Its name is translated here: language files only describe slash commands.
export const quizScore = command({
  type: 'user',
  name: 'Quiz score',
  locales: { fr: { name: 'Score au quiz' } },
  ephemeral: true,
  async run({ interaction, target, t }) {
    const points = await quizScores.score(target.id);
    const rank = await quizScores.rankOf(target.id);
    await interaction.reply(
      points === undefined || rank === undefined
        ? t('scoreNone', { user: target.username })
        : t('scoreOf', { user: target.username, count: points, rank })
    );
  },
});
