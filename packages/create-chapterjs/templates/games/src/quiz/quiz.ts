import { command, userMention } from 'chapterjs';
import { QUESTIONS } from './questions';
import { answered, quizScores } from './scores';

// `/quiz start`: a question to the channel, and the first right answer
// wins a point. `waitForMessage()` resolves with that message, or `null`
// after 30 seconds. One quiz at a time per channel: the cooldown.
export const start = command({
  name: 'quiz start',
  cooldown: { channel: '30s' },
  async run({ interaction, channel, t }) {
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]!;
    await interaction.reply(t('quizAsk', { question: t(question.text) }));
    const winner = await channel.waitForMessage({
      matches: message => question.answer.test(message.content.trim()),
      within: '30s',
    });
    if (!winner) {
      await channel.send(t('quizNobody', { answer: question.shown }));
      return;
    }
    const points = await quizScores.add(winner.author.id, 1);
    await answered.increment('total');
    await winner.reply(
      t('quizWin', { user: winner.author.username, count: points })
    );
  },
});

// `/quiz scores`: the best players of the server.
export const scores = command({
  name: 'quiz scores',
  async run({ interaction, t }) {
    const best = await quizScores.top(10);
    if (best.length === 0) {
      await interaction.reply({ content: t('scoresEmpty'), ephemeral: true });
      return;
    }
    // In an embed, a mention shows the name and notifies nobody.
    const lines = best.map(
      (entry, index) => `${index + 1}. ${userMention(entry.id)}: ${entry.score}`
    );
    await interaction.reply({
      embeds: [{ title: t('scoresTitle'), description: lines.join('\n') }],
    });
  },
});
