import { language } from 'chapterjs';

// One file per language in src/messages/, named after the language. Each
// function of your project receives `t`, which picks the language of who
// will read the message: t('pong'), t('again', { count }).
export default language({
  // The language used when the one of a person or of a server is not here.
  default: true,
  texts: {
    pong: 'Pong! in en-US',
    again: 'Pong in en-US ! ×{count}',
    joinVoice: 'Join a voice channel first, then ask again.',
    hello: 'Coming to {channel}!',
    nothingToPlay:
      'Send an audio file (.mp3, .ogg...) or a link starting with https://.',
    playing: 'Playing {song} in {channel}.',
  },
  commands: {
    ping: {
      description: 'Replies with Pong!',
    },
    hello: {
      description: 'Says hello in your voice channel',
    },
    play: {
      description: 'Plays a song in your voice channel',
      options: {
        file: { description: 'A song to play' },
        url: { description: 'Or the link of a song or a stream' },
      },
    },
  },
});
