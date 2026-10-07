import { command } from 'chapterjs';
import again from '../components/buttons/again';

// The path of the file is the name of the command: this one is /ping.
// A file in a folder is a subcommand: src/commands/mod/ban.ts is /mod ban.
export default command({
  async run({ interaction, t }) {
    // A button of src/components/buttons/, with the data it carries, and a
    // text of src/messages/ in the language of who will read the answer.
    await interaction.reply({
      content: t('pong'),
      components: [again({ count: 1 })],
    });
  },
});

// A command can ask for options, typed for you in `run`:
//
// export default command({
//   description: 'Says hello to someone',
//   options: {
//     who: { type: 'user', description: 'Who to greet', required: true },
//   },
//   async run({ interaction, options }) {
//     await interaction.reply(`Hello ${options.who}!`);
//   },
// });
