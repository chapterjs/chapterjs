import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who reads the message: the person for a private answer, the server
// otherwise. `commands` is what Discord shows of each command.
export const en = language({
  locale: 'en-US',
  default: true,
  texts: {
    panelTitle: 'Need help?',
    panelText:
      'Open a ticket and the staff will answer you in a private thread.',
    panelPosted: 'The panel is posted.',
    openButton: 'Open a ticket',
    formTitle: 'New ticket',
    formSubject: 'Subject',
    formCategory: 'What is it about?',
    formDetails: 'Tell us more',
    notHere: 'Tickets can only be opened from a text channel.',
    alreadyOpen: 'You already have a ticket open: {thread}. Close it first.',
    created: 'Your ticket is open: {thread}',
    welcome: 'Thanks {user}, the staff will be with you shortly.',
    category: 'Category',
    openedBy: 'Opened by',
    claimButton: 'Claim',
    claimedBy: 'Claimed by {user}',
    claimed: '{user} is taking care of this ticket.',
    staffOnly: 'Only the staff can claim a ticket.',
    closeButton: 'Close',
    notATicket: 'This only works inside a ticket.',
    notYours: 'Only the staff, or who opened this ticket, can close it.',
    closing: 'Ticket closed by {user}.',
    closedDm: 'Your ticket "{ticket}" on {server} was closed.',
    added: '{user} was added to the ticket.',
  },
  commands: {
    'ticket panel': {
      description: 'Posts the message people open tickets from',
    },
    'ticket add': {
      description: 'Adds someone to this ticket',
      options: { user: { description: 'Who to add' } },
    },
  },
});

export const fr = language({
  locale: 'fr',
  texts: {
    panelTitle: 'Besoin d’aide ?',
    panelText: 'Ouvrez un ticket et le staff vous répondra dans un fil privé.',
    panelPosted: 'Le panneau est posté.',
    openButton: 'Ouvrir un ticket',
    formTitle: 'Nouveau ticket',
    formSubject: 'Sujet',
    formCategory: 'De quoi s’agit-il ?',
    formDetails: 'Dites-nous en plus',
    notHere: 'Un ticket ne peut être ouvert que depuis un salon textuel.',
    alreadyOpen:
      'Vous avez déjà un ticket ouvert : {thread}. Fermez-le d’abord.',
    created: 'Votre ticket est ouvert : {thread}',
    welcome: 'Merci {user}, le staff arrive.',
    category: 'Catégorie',
    openedBy: 'Ouvert par',
    claimButton: 'Prendre en charge',
    claimedBy: 'Pris en charge par {user}',
    claimed: '{user} s’occupe de ce ticket.',
    staffOnly: 'Seul le staff peut prendre un ticket en charge.',
    closeButton: 'Fermer',
    notATicket: 'Ceci ne fonctionne que dans un ticket.',
    notYours:
      'Seul le staff, ou la personne qui a ouvert ce ticket, peut le fermer.',
    closing: 'Ticket fermé par {user}.',
    closedDm: 'Votre ticket « {ticket} » sur {server} a été fermé.',
    added: '{user} a été ajouté au ticket.',
  },
  commands: {
    'ticket panel': {
      description: 'Poste le message depuis lequel on ouvre un ticket',
    },
    'ticket add': {
      description: 'Ajoute quelqu’un à ce ticket',
      options: { user: { description: 'Qui ajouter' } },
    },
  },
});
