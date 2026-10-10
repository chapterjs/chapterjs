import { language } from 'chapterjs';

// The texts of the bot, one language() per language. `t` picks the one of
// who will read the message: the person for a private answer, the server
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
    opened: 'Thanks {user}, the staff will be with you shortly.',
    created: 'Your ticket is open: {thread}',
    alreadyOpen: 'You already have a ticket open: {thread}. Close it first.',
    category: 'Category',
    openedBy: 'Opened by',
    closeButton: 'Close the ticket',
    notATicket: 'This button only works inside a ticket.',
    notYours: 'Only the staff, or who opened this ticket, can close it.',
    closing: 'Ticket closed by {user}.',
    closedDm: 'Your ticket "{ticket}" on {server} was closed.',
  },
  commands: {
    'ticket panel': {
      description: 'Posts the message people open tickets from',
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
    opened: 'Merci {user}, le staff arrive.',
    created: 'Votre ticket est ouvert : {thread}',
    alreadyOpen:
      'Vous avez déjà un ticket ouvert : {thread}. Fermez-le d’abord.',
    category: 'Catégorie',
    openedBy: 'Ouvert par',
    closeButton: 'Fermer le ticket',
    notATicket: 'Ce bouton ne fonctionne que dans un ticket.',
    notYours:
      'Seul le staff, ou la personne qui a ouvert ce ticket, peut le fermer.',
    closing: 'Ticket fermé par {user}.',
    closedDm: 'Votre ticket « {ticket} » sur {server} a été fermé.',
  },
  commands: {
    'ticket panel': {
      description: 'Poste le message depuis lequel on ouvre un ticket',
    },
  },
});
