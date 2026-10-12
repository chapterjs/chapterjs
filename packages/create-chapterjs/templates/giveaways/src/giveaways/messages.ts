import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who reads the message: the person for a private answer, the server
// otherwise, the default language for a task. `commands` is what Discord
// shows of each slash command.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    endsIn: 'Ends {time}. Click the button to enter!',
    hostedBy: 'Hosted by {host}',
    winnersCount: { one: '{count} winner', other: '{count} winners' },
    wonBy: 'Won by {winners}',
    nobodyEntered: 'Nobody entered.',
    entries: 'Enter ({count})',
    entrants: { one: '{count} entrant', other: '{count} entrants' },
    entered: 'You are in! Good luck.',
    left: 'You left the giveaway.',
    over: 'This giveaway is over.',
    congratulations: '🎉 Congratulations {winners}! You won **{prize}**.',
    nobodyWon: 'Nobody entered the giveaway for **{prize}**: no winner.',
    noneRunning: 'No giveaway is running in this server.',
    runningLine: '• **{prize}**, ends {time}: {link}',
    endedNow: 'The giveaway is over: the winners are drawn.',
    notRunning: 'This message is not a running giveaway.',
    notEnded: 'This message is not a giveaway that ended in the last 7 days.',
    rerolled: 'New winners are drawn.',
    presence: { one: '{count} giveaway', other: '{count} giveaways' },
  },
  commands: {
    'giveaway start': {
      description: 'Starts a giveaway in this channel',
      options: {
        prize: { description: 'What is to win' },
        duration: { description: 'How long people can enter' },
        winners: { description: 'How many people win, 1 by default' },
      },
    },
    'giveaway list': { description: 'The giveaways running in this server' },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    endsIn: 'Se termine {time}. Cliquez sur le bouton pour participer !',
    hostedBy: 'Organisé par {host}',
    winnersCount: { one: '{count} gagnant', other: '{count} gagnants' },
    wonBy: 'Gagné par {winners}',
    nobodyEntered: 'Personne n’a participé.',
    entries: 'Participer ({count})',
    entrants: { one: '{count} participant', other: '{count} participants' },
    entered: 'Vous participez ! Bonne chance.',
    left: 'Vous ne participez plus.',
    over: 'Ce concours est terminé.',
    congratulations: '🎉 Bravo {winners} ! Vous gagnez **{prize}**.',
    nobodyWon:
      'Personne n’a participé au concours pour **{prize}** : aucun gagnant.',
    noneRunning: 'Aucun concours en cours sur ce serveur.',
    runningLine: '• **{prize}**, se termine {time} : {link}',
    endedNow: 'Le concours est terminé : les gagnants sont tirés au sort.',
    notRunning: 'Ce message n’est pas un concours en cours.',
    notEnded: 'Ce message n’est pas un concours terminé ces 7 derniers jours.',
    rerolled: 'De nouveaux gagnants sont tirés au sort.',
    presence: { one: '{count} concours', other: '{count} concours' },
  },
  commands: {
    'giveaway start': {
      description: 'Lance un concours dans ce salon',
      options: {
        prize: { description: 'Ce qui est à gagner' },
        duration: {
          description: 'Combien de temps on peut participer',
          choices: {
            '1 minute': '1 minute',
            '10 minutes': '10 minutes',
            '1 hour': '1 heure',
            '1 day': '1 jour',
            '3 days': '3 jours',
            '1 week': '1 semaine',
          },
        },
        winners: { description: 'Combien de gagnants, 1 par défaut' },
      },
    },
    'giveaway list': { description: 'Les concours en cours sur ce serveur' },
  },
});
