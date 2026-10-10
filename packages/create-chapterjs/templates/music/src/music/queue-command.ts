import { command } from 'chapterjs';
import { queueOf } from './queue';

// /queue shows what plays and what comes next. A text with {count} may
// have one form per quantity in the language files: see messages.ts.
export default command({
  name: 'queue',
  ephemeral: true,
  async run({ interaction, guild, t }) {
    const queue = queueOf(guild);
    if (!queue.current) {
      await interaction.reply(t('nothingPlaying'));
      return;
    }
    const next = queue.songs
      .slice(0, 10)
      .map((song, index) => `${index + 1}. ${song.title} (${song.requestedBy})`)
      .join('\n');
    const lines = [
      t('nowPlaying', {
        song: queue.current.title,
        by: queue.current.requestedBy,
      }),
    ];
    if (next) lines.push(t('upNext', { count: queue.songs.length }), next);
    await interaction.reply(lines.join('\n'));
  },
});
