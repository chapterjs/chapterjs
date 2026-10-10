import { presence } from 'chapterjs';

// What the bot shows under its name.
export default presence({
  activity: { type: 'watching', name: 'the tickets' },
});
