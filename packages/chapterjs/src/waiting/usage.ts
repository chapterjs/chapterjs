// What waiting needs from Discord, seen in the code: messages only reach
// the bot with the intents of messages (and their text with Message
// Content), reactions with the intents of reactions. Clicks need none.
// https://docs.discord.com/developers/events/gateway#gateway-intents

import { GatewayIntent } from '../discord/intents.js';
import type { CodeUse } from '../loader/usage.js';

/** `waitForMessage(` or `collectMessages(`: the messages of a channel. */
export const MESSAGES_USE: CodeUse = {
  name: 'messages',
  pattern: /\.(?:waitForMessage|collectMessages)\s*\(/,
  intents:
    GatewayIntent.GuildMessages |
    GatewayIntent.DirectMessages |
    GatewayIntent.MessageContent,
};

/** `waitForReaction(`: the reactions to a message. */
export const REACTIONS_USE: CodeUse = {
  name: 'reactions',
  pattern: /\.waitForReaction\s*\(/,
  intents:
    GatewayIntent.GuildMessageReactions | GatewayIntent.DirectMessageReactions,
};
