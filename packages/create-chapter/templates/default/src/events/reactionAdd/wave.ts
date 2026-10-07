import { event } from 'chapterjs';

// Runs every time someone adds a reaction to a message of your server.
// Reactions of bots, yours included, are left out: when yours waves back
// below, this file does not run again. Other folders work the same way:
// voiceJoin, pollVoteAdd, banAdd... (see the list of events in the docs).
export default event(async ({ emoji, channel, messageId }) => {
  if (emoji.name !== '👋') return;
  const message = await channel.fetchMessage(messageId);
  await message.react('👋');
});
