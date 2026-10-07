import { button } from 'chapterjs';

// The folder is the kind of component (buttons, selects, modals, embeds)
// and the path of the file is what tells which one was used: you never
// write an id. `data` is what the button carries from one click to the next.
const again = button({
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

export default again;
