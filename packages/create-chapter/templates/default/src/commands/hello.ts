import { asset, command } from 'chapterjs';

// /hello joins your voice channel and plays public/hello.ogg. An Opus file
// (.ogg, .webm) plays as it is; an .mp3 or a link needs ffmpeg installed.
export default command({
  name: 'hello',
  async run({ interaction, member, t }) {
    const channel = member.voiceChannel;
    if (!channel) {
      await interaction.reply({ content: t('joinVoice'), ephemeral: true });
      return;
    }
    // Answer first: a command has 3 seconds, joining takes a moment.
    await interaction.reply(t('hello', { channel: channel.name }));
    const voice = await channel.join();
    // Whatever happens while it plays, the bot leaves after.
    try {
      await voice.play(asset('hello.ogg'));
    } finally {
      await voice.leave();
    }
  },
});
