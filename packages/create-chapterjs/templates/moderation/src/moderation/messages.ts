import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who will read the message. A text with {count} can have one form per
// quantity: Discord's language rules pick the form.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    cantModerate:
      'You can not moderate {user}: their highest role is above yours.',
    timedOut: '{user} is timed out until {until}. Reason: {reason}',
    noReason: 'none given',
    notTimedOut: '{user} is not timed out.',
    timeoutRemoved: '{user} can speak again.',
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
    warned: {
      one: '{user} was warned. They have {count} warning.',
      other: '{user} was warned. They have {count} warnings.',
    },
    noWarnings: '{user} has no warning.',
    warningsOf: {
      one: '{user} has {count} warning:',
      other: '{user} has {count} warnings:',
    },
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
    'warn add': {
      description: 'Warns someone; warnings are forgotten after 30 days',
      options: { user: { description: 'Who' }, reason: { description: 'Why' } },
    },
    'warn list': {
      description: 'Lists the warnings of someone',
      options: { user: { description: 'Who' } },
    },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    cantModerate:
      'Vous ne pouvez pas modérer {user} : son rôle le plus haut est au-dessus du vôtre.',
    timedOut:
      '{user} est exclu temporairement jusqu’à {until}. Raison : {reason}',
    noReason: 'aucune',
    notTimedOut: '{user} n’est pas exclu.',
    timeoutRemoved: '{user} peut de nouveau parler.',
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
    warned: {
      one: '{user} a été averti. Il a {count} avertissement.',
      other: '{user} a été averti. Il a {count} avertissements.',
    },
    noWarnings: '{user} n’a aucun avertissement.',
    warningsOf: {
      one: '{user} a {count} avertissement :',
      other: '{user} a {count} avertissements :',
    },
  },
  commands: {
    timeout: {
      description: 'Empêche quelqu’un d’écrire et de parler pendant un moment',
      options: {
        user: { description: 'Qui' },
        duration: { description: 'Pendant combien de temps' },
        reason: { description: 'Pourquoi' },
      },
    },
    untimeout: {
      description: 'Met fin à l’exclusion temporaire de quelqu’un',
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
  },
});
