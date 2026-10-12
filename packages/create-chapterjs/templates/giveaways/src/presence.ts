import { presence } from 'chapterjs';
import { giveaways } from './giveaways/giveaways';

// What the bot shows under its name. A `name` can be a function: it runs
// again after each `for` (here every minute), with `t` in the default
// language, and may read a store.
export default presence({
  activity: {
    type: 'watching',
    name: async ({ t }) => {
      const running = (await giveaways.entries()).filter(
        entry => !entry.value.ended
      );
      return t('presence', { count: running.length });
    },
    for: '1m',
  },
});
