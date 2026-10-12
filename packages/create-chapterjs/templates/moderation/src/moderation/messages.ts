import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who reads the message. A text with {count} can have one form per
// quantity: the rules of the language pick the form.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    notMember: '{user} is not in this server.',
    notYourself: 'You can not do that to yourself.',
    cantModerate:
      'You can not moderate {user}: their highest role is not below yours.',
    noReason: 'none given',
    timedOut: '{user} is timed out until {until}. Reason: {reason}',
    notTimedOut: '{user} is not timed out.',
    timeoutRemoved: '{user} can speak again.',
    kicked: '{user} was kicked. Reason: {reason}',
    banned: '{user} was banned. Reason: {reason}',
    warned: {
      one: '{user} was warned. They have {count} warning.',
      other: '{user} was warned. They have {count} warnings.',
    },
    warnedDm: 'You were warned on {server}: {reason}',
    noWarnings: '{user} has no warning.',
    warningsOf: {
      one: '{user} has {count} warning:',
      other: '{user} has {count} warnings:',
    },
    warningsCleared: 'The warnings of {user} are cleared.',
    purged: {
      one: '{count} message deleted.',
      other: '{count} messages deleted.',
    },
    notHere: 'This only works in a text channel of the server.',
    slowmodeOff: 'Slowmode is off.',
    slowmodeOn: {
      one: 'Slowmode: one message every {count} second.',
      other: 'Slowmode: one message every {count} seconds.',
    },
    locked: '🔒 This channel is locked. Reason: {reason}',
    unlocked: '🔓 This channel is open again.',
  },
  commands: {
    timeout: {
      description: 'Keeps someone from writing and speaking for a while',
      options: {
        user: { description: 'Who' },
        duration: { description: 'For how long' },
        reason: { description: 'Why' },
      },
    },
    untimeout: {
      description: 'Ends the timeout of someone',
      options: { user: { description: 'Who' } },
    },
    kick: {
      description: 'Removes someone from the server; they may come back',
      options: { user: { description: 'Who' }, reason: { description: 'Why' } },
    },
    ban: {
      description: 'Bans someone from the server',
      options: {
        user: { description: 'Who' },
        reason: { description: 'Why' },
        messages: { description: 'Their recent messages to delete' },
      },
    },
    'warn add': {
      description: 'Warns someone; warnings are forgotten after 30 days',
      options: { user: { description: 'Who' }, reason: { description: 'Why' } },
    },
    'warn list': {
      description: 'Lists the warnings of someone',
      options: { user: { description: 'Who' } },
    },
    'warn clear': {
      description: 'Forgets every warning of someone',
      options: { user: { description: 'Who' } },
    },
    purge: {
      description: 'Deletes the last messages of this channel',
      options: {
        count: { description: 'How many, 100 at most' },
        user: { description: 'Only the messages of this person' },
      },
    },
    slowmode: {
      description: 'Sets how long people wait between two messages here',
      options: {
        seconds: { description: 'Seconds between two messages, 0 for none' },
      },
    },
    lock: {
      description: 'Keeps everyone from writing in this channel',
      options: { reason: { description: 'Why' } },
    },
    unlock: { description: 'Lets everyone write in this channel again' },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    notMember: '{user} n’est pas sur ce serveur.',
    notYourself: 'Vous ne pouvez pas faire ça à vous-même.',
    cantModerate:
      'Vous ne pouvez pas modérer {user} : son rôle le plus haut n’est pas sous le vôtre.',
    noReason: 'aucune',
    timedOut:
      '{user} est exclu temporairement jusqu’à {until}. Raison : {reason}',
    notTimedOut: '{user} n’est pas exclu.',
    timeoutRemoved: '{user} peut de nouveau parler.',
    kicked: '{user} a été expulsé. Raison : {reason}',
    banned: '{user} a été banni. Raison : {reason}',
    warned: {
      one: '{user} a été averti. Il a {count} avertissement.',
      other: '{user} a été averti. Il a {count} avertissements.',
    },
    warnedDm: 'Vous avez reçu un avertissement sur {server} : {reason}',
    noWarnings: '{user} n’a aucun avertissement.',
    warningsOf: {
      one: '{user} a {count} avertissement :',
      other: '{user} a {count} avertissements :',
    },
    warningsCleared: 'Les avertissements de {user} sont effacés.',
    purged: {
      one: '{count} message supprimé.',
      other: '{count} messages supprimés.',
    },
    notHere: 'Ceci ne fonctionne que dans un salon textuel du serveur.',
    slowmodeOff: 'Le mode lent est désactivé.',
    slowmodeOn: {
      one: 'Mode lent : un message toutes les {count} seconde.',
      other: 'Mode lent : un message toutes les {count} secondes.',
    },
    locked: '🔒 Ce salon est verrouillé. Raison : {reason}',
    unlocked: '🔓 Ce salon est de nouveau ouvert.',
  },
  commands: {
    timeout: {
      description: 'Empêche quelqu’un d’écrire et de parler pendant un moment',
      options: {
        user: { description: 'Qui' },
        duration: {
          description: 'Pendant combien de temps',
          choices: {
            '5 minutes': '5 minutes',
            '1 hour': '1 heure',
            '1 day': '1 jour',
            '1 week': '1 semaine',
          },
        },
        reason: { description: 'Pourquoi' },
      },
    },
    untimeout: {
      description: 'Met fin à l’exclusion temporaire de quelqu’un',
      options: { user: { description: 'Qui' } },
    },
    kick: {
      description: 'Retire quelqu’un du serveur ; il peut revenir',
      options: {
        user: { description: 'Qui' },
        reason: { description: 'Pourquoi' },
      },
    },
    ban: {
      description: 'Bannit quelqu’un du serveur',
      options: {
        user: { description: 'Qui' },
        reason: { description: 'Pourquoi' },
        messages: {
          description: 'Ses messages récents à supprimer',
          choices: {
            'Keep them': 'Les garder',
            'Last hour': 'La dernière heure',
            'Last day': 'Le dernier jour',
            'Last week': 'La dernière semaine',
          },
        },
      },
    },
    'warn add': {
      description:
        'Avertit quelqu’un ; un avertissement est oublié après 30 jours',
      options: {
        user: { description: 'Qui' },
        reason: { description: 'Pourquoi' },
      },
    },
    'warn list': {
      description: 'Liste les avertissements de quelqu’un',
      options: { user: { description: 'Qui' } },
    },
    'warn clear': {
      description: 'Oublie tous les avertissements de quelqu’un',
      options: { user: { description: 'Qui' } },
    },
    purge: {
      description: 'Supprime les derniers messages de ce salon',
      options: {
        count: { description: 'Combien, 100 au plus' },
        user: { description: 'Seulement les messages de cette personne' },
      },
    },
    slowmode: {
      description: 'Règle l’attente entre deux messages ici',
      options: {
        seconds: { description: 'Secondes entre deux messages, 0 pour aucune' },
      },
    },
    lock: {
      description: 'Empêche tout le monde d’écrire dans ce salon',
      options: { reason: { description: 'Pourquoi' } },
    },
    unlock: {
      description: 'Laisse de nouveau tout le monde écrire dans ce salon',
    },
  },
});
