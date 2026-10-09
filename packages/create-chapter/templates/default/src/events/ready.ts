import { event } from 'chapterjs';

// An event is declared with event() and exported: `name` is the event, and
// it types what `run` receives. This one runs once, when your bot is
// connected. A file may declare several events, commands or buttons.
export default event({
  name: 'ready',
  run({ user, guilds }) {
    console.log(`${user.username} is online in ${guilds.size} server(s)`);
  },
});

// Something to do by itself, every so often or at given times, is a task:
// the name of its export is the name of the task.
//
// import { task } from 'chapterjs';
//
// export const report = task({
//   cron: '0 9 * * 1', // every Monday at 9:00
//   async run({ guilds }) {
//     console.log(`A new week in ${guilds.size} server(s)`);
//   },
// });
//
// To react to something else, declare another event. For example, one that
// answers "Pong!" to "!ping" (reading messages needs the Message Content
// intent: `chapterjs dev` tells you how to enable it):
//
// export const pong = event({
//   name: 'messageCreate',
//   async run({ message }) {
//     if (message.content === '!ping') await message.reply('Pong!');
//   },
// });
