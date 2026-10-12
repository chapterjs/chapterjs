import { presence } from 'chapterjs';

// Your bot is made of the files of src/: each one exports what it declares
// with a function of 'chapterjs' (command, event, button, task...), and
// chapterjs dev runs it. This one is the presence: what Discord shows under
// the name of your bot. Change the text and save: it changes at once.
export default presence({
  activity: { type: 'custom', name: 'Getting ready' },
});

// Your first command is a new file, anywhere in src/, like src/ping.ts:
//
// import { command } from 'chapterjs';
//
// export default command({
//   name: 'ping',
//   description: 'Replies with Pong!',
//   async run({ interaction }) {
//     await interaction.reply('Pong!');
//   },
// });
//
// Save it, and /ping shows up in your test server. The other templates of
// `pnpm create chapterjs` are complete bots (tickets, moderation, levels,
// giveaways); the docs at https://www.chapterjs.org walk through everything.
