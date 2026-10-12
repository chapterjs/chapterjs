import { command } from 'chapterjs';
import { enter } from './enter';
import { giveawayCard, giveaways, type Giveaway } from './giveaways';

// /giveaway start posts the giveaway: what is to win, for how long, and how
// many people win. The choices of `duration` are in minutes.
export default command({
  name: 'giveaway start',
  permissions: ['ManageGuild'],
  options: {
    prize: { type: 'string', required: true, maxLength: 100 },
    duration: {
      type: 'integer',
      required: true,
      choices: {
        '1 minute': 1,
        '10 minutes': 10,
        '1 hour': 60,
        '1 day': 60 * 24,
        '3 days': 60 * 24 * 3,
        '1 week': 60 * 24 * 7,
      },
    },
    winners: { type: 'integer', min: 1, max: 10 },
  },
  async run({ interaction, options, channel, user, guild, t }) {
    const giveaway: Giveaway = {
      prize: options.prize,
      winners: options.winners ?? 1,
      endsAt: Date.now() + options.duration * 60 * 1000,
      channelId: channel.id,
      hostId: user.id,
      entrants: [],
      winnerIds: [],
      ended: false,
    };
    // The answer is the giveaway itself: its id is the key in the store.
    const message = await interaction.reply({
      embeds: [giveawayCard(t, giveaway)],
      components: [enter],
    });
    await giveaways.set([guild.id, message.id], giveaway);
  },
});
