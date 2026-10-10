import { command } from 'chapterjs';
import { clearQueue } from './queue';

// /leave makes the bot leave the voice channel and forget the queue.
export default command({
  name: 'leave',
  async run({ interaction, guild, t }) {
    const voice = guild.voice;
    if (!voice) {
      await interaction.reply({ content: t('notInVoice'), ephemeral: true });
      return;
    }
    clearQueue(guild);
    // leave() ends what plays: the loop of play.ts stops too.
    await voice.leave();
    await interaction.reply(t('left'));
  },
});
