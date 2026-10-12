import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who will read the message: the person for a private answer, the server
// otherwise. `commands` is what Discord shows of each slash command; menu
// commands translate their name in their own file.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    presenceAnswers: {
      one: '{count} answer found',
      other: '{count} answers found',
    },
    presenceServers: { one: '{count} server', other: '{count} servers' },
    quizAsk: '❓ {question} First to answer in 30 seconds wins!',
    quizNobody: 'Time is up! The answer was {answer}.',
    quizWin: {
      one: '🎉 {user} found it, {count} point now.',
      other: '🎉 {user} found it, {count} points now.',
    },
    questionCapital: 'What is the capital of France?',
    questionPlanets: 'How many planets are there in the solar system?',
    questionLargest: 'What is the largest planet of the solar system?',
    questionMoon: 'In what year did people first walk on the Moon?',
    questionWater: 'What is the chemical formula of water?',
    scoresTitle: 'Best players',
    scoresEmpty: 'Nobody has a point yet: try /quiz start.',
    scoreOf: {
      one: '{user} has {count} point, rank {rank} on this server.',
      other: '{user} has {count} points, rank {rank} on this server.',
    },
    scoreNone: '{user} has no point yet.',
    duelAccept: 'Accept',
    duelDecline: 'Decline',
    duelNobody: 'Challenge someone else: not yourself, and not a bot.',
    duelAsk:
      '⚔️ {opponent}, {user} challenges you to a duel! You have a minute.',
    duelExpired: '{opponent} did not answer: no duel.',
    duelDeclined: '{opponent} declined the duel.',
    duelRolls: '🎲 {user} rolls {mine}, {opponent} rolls {theirs}.',
    duelWinner: '{user} wins!',
    duelDraw: 'A draw!',
  },
  commands: {
    'quiz start': {
      description: 'Asks a question: the first right answer wins',
    },
    'quiz scores': { description: 'The best players of the server' },
    duel: {
      description: 'Challenges someone to a dice duel',
      options: { opponent: { description: 'Who to challenge' } },
    },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    presenceAnswers: {
      one: '{count} réponse trouvée',
      other: '{count} réponses trouvées',
    },
    presenceServers: { one: '{count} serveur', other: '{count} serveurs' },
    quizAsk:
      '❓ {question} La première bonne réponse dans les 30 secondes gagne !',
    quizNobody: 'Temps écoulé ! La réponse était {answer}.',
    quizWin: {
      one: '🎉 {user} a trouvé, {count} point maintenant.',
      other: '🎉 {user} a trouvé, {count} points maintenant.',
    },
    questionCapital: 'Quelle est la capitale de la France ?',
    questionPlanets: 'Combien de planètes compte le système solaire ?',
    questionLargest: 'Quelle est la plus grande planète du système solaire ?',
    questionMoon:
      'En quelle année a-t-on marché sur la Lune pour la première fois ?',
    questionWater: 'Quelle est la formule chimique de l’eau ?',
    scoresTitle: 'Meilleurs joueurs',
    scoresEmpty: 'Personne n’a encore de point : essayez /quiz start.',
    scoreOf: {
      one: '{user} a {count} point, {rank}e sur ce serveur.',
      other: '{user} a {count} points, {rank}e sur ce serveur.',
    },
    scoreNone: '{user} n’a encore aucun point.',
    duelAccept: 'Accepter',
    duelDecline: 'Refuser',
    duelNobody: 'Défiez quelqu’un d’autre : pas vous-même, ni un bot.',
    duelAsk: '⚔️ {opponent}, {user} vous défie en duel ! Vous avez une minute.',
    duelExpired: '{opponent} n’a pas répondu : pas de duel.',
    duelDeclined: '{opponent} a refusé le duel.',
    duelRolls: '🎲 {user} fait {mine}, {opponent} fait {theirs}.',
    duelWinner: '{user} gagne !',
    duelDraw: 'Égalité !',
  },
  commands: {
    'quiz start': {
      description: 'Pose une question : la première bonne réponse gagne',
    },
    'quiz scores': { description: 'Les meilleurs joueurs du serveur' },
    duel: {
      description: 'Défie quelqu’un en duel de dés',
      options: { opponent: { description: 'Qui défier' } },
    },
  },
});
