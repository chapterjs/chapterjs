import { language } from 'chapterjs';

// One file per language in src/messages/, named after the language. Each
// function of your project receives `t`, which picks the language of who
// will read the message: t('pong'), t('again', { count }).
export default language({
  // The language used when the one of a person or of a server is not here.
  default: true,
  texts: { pong: 'Pong! in en-US', again: 'Pong in en-US ! ×{count}' },
  commands: {
    ping: {
      description: 'Replies with Pong!',
    },
  },
});
