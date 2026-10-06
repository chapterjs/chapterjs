import { presence } from 'chapterjs';

// What your bot shows under its name: its status, and what it is doing.
// Save this file and chapterjs dev changes it at once.
export default presence({
  status: 'online',
  activity: { type: 'playing', name: 'with ChapterJS' },
});
