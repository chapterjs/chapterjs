import { button, command, row } from 'chapterjs';
import { clearQueue, playQueue, queueOf, type Song } from './queue';

// /play adds a song to the queue of the server and starts playing when
// nothing is. A song is a file sent with the command (an .mp3, an .ogg...)
// or a link to an audio file or a stream; anything that is not Opus needs
// ffmpeg installed on the machine that runs the bot.
export default command({
  name: 'play',
  options: {
    file: { type: 'attachment' },
    url: { type: 'string' },
  },
  async run({ interaction, member, guild, channel, options, t }) {
    const { file, url } = options;
    if (
      (!file && !url) ||
      (file && !file.contentType?.startsWith('audio/')) ||
      (url && !/^https?:\/\//.test(url))
    ) {
      await interaction.reply({ content: t('nothingToPlay'), ephemeral: true });
      return;
    }
    const voiceChannel = member.voiceChannel;
    if (!voiceChannel) {
      await interaction.reply({ content: t('joinVoice'), ephemeral: true });
      return;
    }
    const song: Song = {
      source: file ?? url!,
      title: file?.filename ?? url!,
      requestedBy: member.toString(),
    };
    const queue = queueOf(guild);
    queue.songs.push(song);
    if (queue.current) {
      await interaction.reply(
        t('queued', { song: song.title, position: queue.songs.length })
      );
      return;
    }
    await interaction.reply({
      content: t('playing', { song: song.title, channel: voiceChannel.name }),
      components: [row([pause, skip, stop])],
    });
    // Joining the channel the bot is already in changes nothing. The loop
    // runs until the queue is empty, and the bot leaves by itself.
    const voice = await voiceChannel.join();
    await playQueue(guild, voice, text => channel.send(text));
  },
});

// The three buttons under "Now playing". A button is named by its export,
// and `run` receives the same things as a command.
export const pause = button({
  label: ({ t }) => t('pauseButton'),
  emoji: '⏯️',
  async run({ interaction, guild, member, t }) {
    const voice = guild.voice;
    if (!voice?.playing) {
      await interaction.reply({
        content: t('nothingPlaying'),
        ephemeral: true,
      });
      return;
    }
    if (member.voiceChannel?.id !== voice.channel.id) {
      await interaction.reply({ content: t('notWithMe'), ephemeral: true });
      return;
    }
    if (voice.paused) voice.resume();
    else voice.pause();
    await interaction.reply(voice.paused ? t('paused') : t('resumed'));
  },
});

export const skip = button({
  label: ({ t }) => t('skipButton'),
  emoji: '⏭️',
  async run({ interaction, guild, member, t }) {
    const voice = guild.voice;
    if (!voice?.playing) {
      await interaction.reply({
        content: t('nothingPlaying'),
        ephemeral: true,
      });
      return;
    }
    if (member.voiceChannel?.id !== voice.channel.id) {
      await interaction.reply({ content: t('notWithMe'), ephemeral: true });
      return;
    }
    // stop() ends the current play(): the loop goes on with the next song.
    voice.stop();
    await interaction.reply(t('skipped'));
  },
});

export const stop = button({
  label: ({ t }) => t('stopButton'),
  emoji: '⏹️',
  style: 'danger',
  async run({ interaction, guild, member, t }) {
    const voice = guild.voice;
    if (!voice) {
      await interaction.reply({
        content: t('nothingPlaying'),
        ephemeral: true,
      });
      return;
    }
    if (member.voiceChannel?.id !== voice.channel.id) {
      await interaction.reply({ content: t('notWithMe'), ephemeral: true });
      return;
    }
    clearQueue(guild);
    voice.stop();
    await interaction.reply(t('stopped'));
  },
});
