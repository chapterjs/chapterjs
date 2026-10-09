import { button, command } from 'chapterjs';

// A command is declared with command() and exported: `name` is what people
// type after the /. Where the file is and what it is called are up to you:
// this one could live anywhere in src/.
export default command({
  name: 'ping',
  // Only the person sees the answer, so `t` speaks their language.
  ephemeral: true,
  async run({ interaction, t }) {
    // The button below, with the data it carries, and a text of
    // src/messages/ in the language of who will read the answer.
    await interaction.reply({
      content: t('pong'),
      components: [again({ count: 1 })],
    });
  },
});

// A button is declared with button() and exported: the name of the export
// (here `again`) is what tells which one was clicked, you never write an
// id. `data` is what the button carries from one click to the next.
export const again = button({
  label: 'Again',
  data: { count: 'number' },
  async run({ interaction, data, t }) {
    const count = data.count + 1;
    // Changes the message the button is on, instead of sending a new one.
    await interaction.update({
      content: t('again', { count }),
      components: [again({ count })],
    });
  },
});

// A command can ask for options, typed for you in `run`, suggest values
// while the person types, and make each person wait between two uses:
//
// export const hello = command({
//   name: 'hello',
//   description: 'Says hello to someone',
//   cooldown: '10s',
//   options: {
//     who: { type: 'user', description: 'Who to greet', required: true },
//     greeting: { type: 'string', description: 'How to greet' },
//   },
//   autocomplete: {
//     // Called while the person types in "greeting", with what they typed.
//     greeting: ({ value }) =>
//       ['Hello', 'Hi', 'Hey'].filter(word => word.startsWith(value)),
//   },
//   async run({ interaction, options }) {
//     await interaction.reply(`${options.greeting ?? 'Hello'} ${options.who}!`);
//   },
// });
