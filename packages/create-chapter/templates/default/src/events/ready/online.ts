import { event } from 'chapterjs';

// The folder is the event: every file of src/events/ready/ runs once, when
// your bot is connected. The name of the file is yours to choose.
export default event(({ user, guilds }) => {
  console.log(`${user.username} is online in ${guilds.size} server(s)`);
});

// Something to do by itself, every so often or at given times, is a task:
// a file of src/tasks/, like src/tasks/report.ts:
//
// import { task } from 'chapterjs';
//
// export default task({
//   cron: '0 9 * * 1', // every Monday at 9:00
//   async run({ guilds }) {
//     console.log(`A new week in ${guilds.size} server(s)`);
//   },
// });
//
// To react to something else, create a folder named after the event. For
// example src/events/messageCreate/ping.ts, which answers "Pong!" to "!ping"
// (reading messages needs the Message Content intent: `chapterjs dev` tells
// you how to enable it):
//
// import { event } from 'chapterjs';
//
// export default event(async ({ message }) => {
//   if (message.content === '!ping') await message.reply('Pong!');
// });
