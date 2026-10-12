import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who reads the message: the person for a private answer, the server
// otherwise. `commands` is what Discord shows of each slash command; the
// menu command translates its name in its own file.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    levelUp: '🎉 {user} reached level {level}!',
    level: 'Level',
    levelShort: 'level {level}',
    rank: 'Rank',
    progress: 'Next level',
    xpSet: '{user} now has {count} XP: level {level}.',
    leaderboardTitle: '🏆 Leaderboard',
    leaderboardEmpty: 'Nobody has XP yet: start talking!',
    page: 'Page {page} of {pages}',
    previous: 'Previous',
    next: 'Next',
    presence: { one: '{count} server', other: '{count} servers' },
  },
  commands: {
    rank: {
      description: 'Shows your level, or the one of someone else',
      options: { user: { description: 'Whose level' } },
    },
    leaderboard: { description: 'The members with the most XP' },
    'xp set': {
      description: 'Changes the XP of someone',
      options: {
        user: { description: 'Who' },
        amount: { description: 'Their XP from now on' },
      },
    },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    levelUp: '🎉 {user} passe niveau {level} !',
    level: 'Niveau',
    levelShort: 'niveau {level}',
    rank: 'Rang',
    progress: 'Prochain niveau',
    xpSet: '{user} a maintenant {count} XP : niveau {level}.',
    leaderboardTitle: '🏆 Classement',
    leaderboardEmpty: 'Personne n’a encore d’XP : parlez !',
    page: 'Page {page} sur {pages}',
    previous: 'Précédent',
    next: 'Suivant',
    presence: { one: '{count} serveur', other: '{count} serveurs' },
  },
  commands: {
    rank: {
      description: 'Montre votre niveau, ou celui de quelqu’un d’autre',
      options: { user: { description: 'Le niveau de qui' } },
    },
    leaderboard: { description: 'Les membres qui ont le plus d’XP' },
    'xp set': {
      description: 'Change l’XP de quelqu’un',
      options: {
        user: { description: 'Qui' },
        amount: { description: 'Son XP à partir de maintenant' },
      },
    },
  },
});
