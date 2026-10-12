import { presence } from 'chapterjs';

// What the bot shows under its name: two activities in turn, each for 30
// seconds. A `name` can be a function, run each time it is shown, with
// `guilds` (how many servers the bot is in) and `t` (the default language).
export default presence({
  activities: [
    { type: 'playing', name: '/rank', for: '30s' },
    {
      type: 'watching',
      name: ({ guilds, t }) => t('presence', { count: guilds }),
      for: '30s',
    },
  ],
});
