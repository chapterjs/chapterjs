import { event } from 'chapterjs';

// Your bot is made of the files of src/: each one exports what it declares
// with a function of 'chapterjs' (event, command, button, task...), and
// chapterjs dev runs it. This one is an event: `name` says which, and types
// what `run` receives. `ready` runs once, when the bot is connected.
export default event({
  name: 'ready',
  run({ user, guilds }) {
    console.log(`${user.username} is online in ${guilds.size} server(s)`);
  },
});

// A command is a file like this one, anywhere in src/, with command():
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
// `pnpm create chapter` show tickets, music, moderation and a community
// bot; the docs at https://www.chapterjs.org walk through everything.
