import { GatewayCloseCode } from '../discord/codes.js';
import { intentNames, PRIVILEGED_INTENTS } from '../discord/intents.js';

/**
 * Discord closed the connection for a reason that reconnecting can't fix:
 * something has to change before the bot can connect.
 * @see https://docs.discord.com/developers/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes
 */
export class GatewayFatalError extends Error {
  override readonly name = 'GatewayFatalError';
  /** The close code Discord gave. */
  readonly code: number;

  constructor(code: number, intents: number) {
    super(explain(code, intents));
    this.code = code;
  }
}

function explain(code: number, intents: number): string {
  switch (code) {
    case GatewayCloseCode.AuthenticationFailed:
      return 'Discord refused the bot token. Copy it again from the Developer Portal (your application → Bot → Reset Token) into BOT_TOKEN in your .env file.';
    case GatewayCloseCode.DisallowedIntents: {
      const privileged = intentNames(intents).filter(name =>
        PRIVILEGED_INTENTS.includes(name)
      );
      return `Discord refused the connection: the bot uses privileged intents (${privileged.join(', ') || 'none found'}) that are not enabled. Enable them in the Developer Portal: your application → Bot → Privileged Gateway Intents.`;
    }
    case GatewayCloseCode.InvalidIntents:
      return 'Discord refused the intents sent by the framework. This is a bug in ChapterJS: please report it.';
    case GatewayCloseCode.ShardingRequired:
      return 'The bot is in too many servers for a single connection: it must use more shards.';
    case GatewayCloseCode.InvalidShard:
      return 'Discord refused the shard of this connection: the number of shards is not the one Discord expects for this bot.';
    case GatewayCloseCode.InvalidApiVersion:
      return 'Discord no longer accepts the gateway version this version of ChapterJS speaks: update ChapterJS.';
    default:
      return `Discord closed the connection for good (close code ${code}).`;
  }
}

/** The bot started too many sessions today: Discord would reset its token. */
export class SessionLimitError extends Error {
  override readonly name = 'SessionLimitError';
  /** When the bot can connect again. */
  readonly resetAt: Date;

  constructor(needed: number, remaining: number, resetAfter: number) {
    const resetAt = new Date(Date.now() + resetAfter);
    super(
      `The bot needs to start ${needed} session(s) but Discord only allows ${remaining} more until ${resetAt.toLocaleString()}. Going over that limit makes Discord reset the bot token, so the bot is not started. This usually means it was restarted too many times: wait, then start it again.`
    );
    this.resetAt = resetAt;
  }
}
