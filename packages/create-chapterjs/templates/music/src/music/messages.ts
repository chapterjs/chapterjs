import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who will read the message. A text with {count} can have one form per
// quantity (`one`, `other`...): Discord's language rules pick the form.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    nothingToPlay:
      'Send an audio file (.mp3, .ogg...) or a link starting with https://.',
    joinVoice: 'Join a voice channel first, then ask again.',
    playing: 'Now playing {song} in {channel}.',
    queued: 'Added {song} to the queue, at position {position}.',
    nowPlaying: '▶ {song}, asked by {by}',
    upNext: {
      one: 'Up next, {count} song:',
      other: 'Up next, {count} songs:',
    },
    nothingPlaying: 'Nothing is playing.',
    notWithMe: 'Join my voice channel to control what plays.',
    notInVoice: 'I am not in a voice channel.',
    pauseButton: 'Pause / resume',
    skipButton: 'Skip',
    stopButton: 'Stop',
    paused: 'Paused.',
    resumed: 'Playing again.',
    skipped: 'Skipped.',
    stopped: 'Stopped, the queue is empty.',
    left: 'Bye!',
  },
  commands: {
    play: {
      description:
        'Plays a song in your voice channel, or adds it to the queue',
      options: {
        file: { description: 'A song to play' },
        url: { description: 'Or the link of a song or a stream' },
      },
    },
    queue: { description: 'Shows what plays and what comes next' },
    leave: { description: 'Makes the bot leave the voice channel' },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    nothingToPlay:
      'Envoyez un fichier audio (.mp3, .ogg...) ou un lien qui commence par https://.',
    joinVoice: 'Rejoignez d’abord un salon vocal, puis redemandez.',
    playing: 'Lecture de {song} dans {channel}.',
    queued: '{song} ajouté à la file, en position {position}.',
    nowPlaying: '▶ {song}, demandé par {by}',
    upNext: {
      one: 'Ensuite, {count} morceau :',
      other: 'Ensuite, {count} morceaux :',
    },
    nothingPlaying: 'Rien n’est en cours de lecture.',
    notWithMe: 'Rejoignez mon salon vocal pour contrôler la lecture.',
    notInVoice: 'Je ne suis pas dans un salon vocal.',
    pauseButton: 'Pause / reprendre',
    skipButton: 'Passer',
    stopButton: 'Stop',
    paused: 'En pause.',
    resumed: 'Reprise.',
    skipped: 'Passé.',
    stopped: 'Arrêté, la file est vide.',
    left: 'À plus !',
  },
  commands: {
    play: {
      description:
        'Joue une musique dans votre salon vocal, ou l’ajoute à la file',
      options: {
        file: { description: 'Une musique à jouer' },
        url: { description: 'Ou le lien d’une musique ou d’un flux' },
      },
    },
    queue: { description: 'Montre ce qui joue et ce qui suit' },
    leave: { description: 'Fait quitter le salon vocal au bot' },
  },
});
