import { button, command, userMention } from 'chapterjs';
import type { CommandInteraction, Translator, User } from 'chapterjs';

// Buttons with no `run`: nothing runs them but `waitForClick()` below. Once
// nothing waits for them, a click tells the person they are not available.
export const accept = button({
  label: ({ t }) => t('duelAccept'),
  style: 'success',
});
export const decline = button({
  label: ({ t }) => t('duelDecline'),
  style: 'secondary',
});

/** A roll of a six-sided die. */
const roll = (): number => Math.floor(Math.random() * 6) + 1;

/**
 * Challenges someone: they have a minute to accept with a button, then
 * both roll a die. Shared by `/duel` and the menu of a message.
 */
async function challenge(
  interaction: CommandInteraction,
  t: Translator,
  user: User,
  opponent: User
): Promise<void> {
  if (opponent.id === user.id || opponent.bot) {
    await interaction.reply({ content: t('duelNobody'), ephemeral: true });
    return;
  }
  const asked = await interaction.reply({
    content: t('duelAsk', {
      opponent: userMention(opponent.id),
      user: user.username,
    }),
    components: [accept, decline],
  });
  const click = await asked.waitForClick({ from: opponent, within: '1m' });
  if (!click) {
    await interaction.edit({
      content: t('duelExpired', { opponent: opponent.username }),
      components: [],
    });
    return;
  }
  if (click.is(decline)) {
    await click.interaction.update({
      content: t('duelDeclined', { opponent: opponent.username }),
      components: [],
    });
    return;
  }
  const mine = roll();
  const theirs = roll();
  const result =
    mine === theirs
      ? t('duelDraw')
      : t('duelWinner', {
          user: mine > theirs ? user.username : opponent.username,
        });
  await click.interaction.update({
    content: `${t('duelRolls', { user: user.username, mine, opponent: opponent.username, theirs })}\n${result}`,
    components: [],
  });
}

// `/duel @someone`.
export const duel = command({
  name: 'duel',
  options: { opponent: { type: 'user', required: true } },
  run: ({ interaction, options, user, t }) =>
    challenge(interaction, t, user, options.opponent),
});

// The same from the menu of a message (right click, Apps): the author of
// the message is challenged. `type: 'message'` gives `run` the message.
export const challengeAuthor = command({
  type: 'message',
  name: 'Challenge to a duel',
  locales: { fr: { name: 'Défier en duel' } },
  run: ({ interaction, message, user, t }) =>
    challenge(interaction, t, user, message.author),
});
