import { language } from 'chapterjs';

// Every language has the texts of the default one, with the same
// {placeholders}: a missing one is reported when the file loads.
export default language({
  texts: { pong: 'Pong !', again: 'Pong ! ×{count}' },
  // What the bot answers by itself can be translated too, phrase by phrase:
  //
  // framework: {
  //   command: 'commande',
  //   failed: "Quelque chose s'est mal passé avec cette {what}.",
  // },
});
