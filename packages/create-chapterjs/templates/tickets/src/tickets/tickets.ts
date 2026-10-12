import { event, store } from 'chapterjs';

// The ticket each person has open: the id of its thread, by person. A store
// keeps its data from one restart to the next, per server: in a command,
// `tickets.get(member.id)` is the ticket of that member in this server.
export const tickets = store<string>();

// A ticket thread deleted by hand is forgotten too, so its owner may open
// another one. A file can declare several things: here a store and an event.
export const forgetDeleted = event({
  name: 'channelDelete',
  async run({ channel }) {
    if (!channel.isThread()) return;
    for (const { key, value } of await tickets.entries()) {
      if (value === channel.id) await tickets.delete(key);
    }
  },
});
