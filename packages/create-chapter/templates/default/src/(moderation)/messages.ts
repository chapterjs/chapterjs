import { language } from 'chapterjs';

// A language may be declared in several places: these texts are added to the
// en-US and fr of src/messages/, next to the commands that use them. What
// says `default: true` there decides for the whole language.
export const en = language({
  locale: 'en-US',
  texts: {
    cannotPunish: 'You can not act on {user}: their role is above yours.',
    notHere: '{user} is not in this server.',
    'ban.confirm': 'Ban {user}?',
    'ban.yes': 'Ban',
    'ban.defaultReason': 'Banned by {by}',
    'ban.done': 'Banned.',
    'kick.done': '{user} was kicked.',
    'warn.added': '{user} now has {count} warning(s).',
    // A plural: one form per quantity, picked by `count`.
    'warn.count': {
      one: '{user} has {count} warning.',
      other: '{user} has {count} warnings.',
    },
  },
  // What Discord shows of these commands: their descriptions live here too.
  commands: {
    ban: {
      description: 'Bans a member, after a confirmation',
      options: {
        target: { description: 'Who to ban' },
        reason: { description: 'Why' },
        days: { description: 'Days of messages to delete' },
      },
    },
    kick: {
      description: 'Kicks a member',
      options: {
        target: { description: 'Who to kick' },
        reason: { description: 'Why' },
      },
    },
    'warn add': {
      description: 'Warns a member',
      options: {
        target: { description: 'Who to warn' },
        reason: { description: 'Why' },
      },
    },
    'warn list': {
      description: 'Counts the warnings of a member',
      options: { target: { description: 'Whose warnings' } },
    },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    cannotPunish:
      'Vous ne pouvez pas agir sur {user} : son rôle est au-dessus du vôtre.',
    notHere: '{user} n’est pas sur ce serveur.',
    'ban.confirm': 'Bannir {user} ?',
    'ban.yes': 'Bannir',
    'ban.defaultReason': 'Banni par {by}',
    'ban.done': 'Banni.',
    'kick.done': '{user} a été expulsé.',
    'warn.added': '{user} a maintenant {count} avertissement(s).',
    'warn.count': {
      one: '{user} a {count} avertissement.',
      other: '{user} a {count} avertissements.',
    },
  },
  commands: {
    // A command can be renamed in a language too: /bannir for French users.
    ban: {
      name: 'bannir',
      description: 'Bannit un membre, après confirmation',
    },
    kick: { name: 'expulser', description: 'Expulse un membre' },
    'warn add': { description: 'Avertit un membre' },
    'warn list': { description: 'Compte les avertissements d’un membre' },
  },
});
