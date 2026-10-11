import { scenario } from 'chapterjs/test';
import leave from './leave';
import play from './play';
import queue from './queue-command';

// `chapterjs test` runs these against a Discord in memory: no token, no
// server, and no voice yet: what can be checked is what the bot says
// before playing anything.
export default [
  scenario('nothing plays at first', async bot => {
    const reply = await bot.use(queue);
    reply.isEphemeral().says('Nothing is playing.');
    const left = await bot.use(leave);
    left.isEphemeral().says('I am not in a voice channel.');
  }),

  scenario('play needs a song, then a voice channel', async bot => {
    const nothing = await bot.use(play);
    nothing.isEphemeral().says('Send an audio file');
    const notAudio = await bot.use(play, {
      file: { name: 'photo.png', type: 'image/png' },
    });
    notAudio.isEphemeral().says('Send an audio file');
    const noVoice = await bot.use(play, {
      url: 'https://example.com/song.mp3',
    });
    noVoice.isEphemeral().says('Join a voice channel first');
  }),
];
