import { presence } from 'chapterjs';
import { answered } from './quiz/scores';

// What the bot shows under its name: three activities in turn, each for
// its `for`. A `name` can be a function: it runs each time its activity is
// shown, with `guilds` (the servers of the bot) and `t` (the texts in the
// default language).
export default presence({
  activities: [
    { type: 'playing', name: '/quiz start', for: '30s' },
    {
      type: 'watching',
      name: async ({ t }) =>
        t('presenceAnswers', { count: (await answered.get('total')) ?? 0 }),
      for: '30s',
    },
    {
      type: 'competing',
      name: ({ t, guilds }) => t('presenceServers', { count: guilds }),
      for: '30s',
    },
  ],
});
