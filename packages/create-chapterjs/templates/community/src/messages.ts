import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who will read the message: the person for a private answer, the server
// otherwise, and the default language for a task.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    welcome: 'Welcome to {server}, {user}!',
    goodbye: '{name} left. See you!',
    pickRoles: 'Pick the roles you want:',
    rolesPlaceholder: 'Your roles',
    noRoles: 'You have none of these roles now.',
    rolesUpdated: 'Your roles: {roles}.',
    rolesMissing:
      'These roles do not exist in this server yet: {roles}. Ask an admin to create them.',
    statsTitle: 'A new week on {server}',
    members: 'Members',
    textChannels: 'Text channels',
    voiceChannels: 'Voice channels',
    roles: 'Roles',
  },
  commands: {
    roles: { description: 'Picks the roles you want' },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    welcome: 'Bienvenue sur {server}, {user} !',
    goodbye: '{name} est parti. À bientôt !',
    pickRoles: 'Choisissez vos rôles :',
    rolesPlaceholder: 'Vos rôles',
    noRoles: 'Vous n’avez plus aucun de ces rôles.',
    rolesUpdated: 'Vos rôles : {roles}.',
    rolesMissing:
      'Ces rôles n’existent pas encore sur ce serveur : {roles}. Demandez à un admin de les créer.',
    statsTitle: 'Une nouvelle semaine sur {server}',
    members: 'Membres',
    textChannels: 'Salons textuels',
    voiceChannels: 'Salons vocaux',
    roles: 'Rôles',
  },
  commands: {
    roles: { description: 'Choisit les rôles que vous voulez' },
  },
});
