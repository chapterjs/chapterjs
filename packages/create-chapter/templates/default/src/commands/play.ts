import { command } from 'chapterjs';

// /play plays a song in your voice channel: a file you send with the
// command, or a link to an audio file or a stream. play() takes both.
export default command({
  options: {
    file: { type: 'attachment' },
    url: { type: 'string' },
  },
  async run({ interaction, member, options, t }) {
    const { file, url } = options;
    const song = file ?? url;
    if (
      !song ||
      (file && !file.contentType?.startsWith('audio/')) ||
      (url && !/^https?:\/\//.test(url))
    ) {
      await interaction.reply({ content: t('nothingToPlay'), ephemeral: true });
      return;
    }
    const channel = member.voiceChannel;
    if (!channel) {
      await interaction.reply({ content: t('joinVoice'), ephemeral: true });
      return;
    }
    const name = file?.filename ?? url ?? '';
    await interaction.reply(
      t('playing', { song: name, channel: channel.name })
    );
    // Joining the channel the bot is already in changes nothing, and a new
    // play() replaces what was playing.
    const voice = await channel.join();
    // Whatever happens while it plays, the bot leaves after.
    try {
      await voice.play(song);
    } finally {
      await voice.leave();
    }
  },
});
