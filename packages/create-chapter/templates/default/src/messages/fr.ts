import { language } from 'chapterjs';

// Every language has the texts of the default one, with the same
// {placeholders}: a missing one is reported when the file loads.
export default language({
  locale: 'fr',
  texts: {
    pong: 'Pong! en fr',
    again: 'Pong en fr ! ×{count}',
    joinVoice: 'Rejoignez d’abord un salon vocal, puis redemandez.',
    hello: 'J’arrive dans {channel} !',
    nothingToPlay:
      'Envoyez un fichier audio (.mp3, .ogg...) ou un lien qui commence par https://.',
    playing: 'Lecture de {song} dans {channel}.',
  },
  // What the bot answers by itself can be translated too, phrase by phrase:
  //
  // framework: {
  //   command: 'commande',
  //   failed: "Quelque chose s'est mal passé avec cette {what}.",
  // },
  commands: {
    ping: {
      description: 'Répond avec Pong !',
    },
    hello: {
      description: 'Dit bonjour dans votre salon vocal',
    },
    play: {
      description: 'Joue une musique dans votre salon vocal',
      options: {
        file: { description: 'Une musique à jouer' },
        url: { description: 'Ou le lien d’une musique ou d’un flux' },
      },
    },
  },
});
