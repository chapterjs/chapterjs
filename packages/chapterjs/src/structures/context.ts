import type { Cache } from '../cache/cache.js';
import type { Snowflake } from '../discord/types/common.js';
import type { LoadedMessages } from '../messages/translate.js';
import type { Rest } from '../rest/rest.js';
import type { VoiceManager } from '../voice/connection.js';
import type { Entities } from './entities.js';

/**
 * What every structure works with. It never leaves the framework: user code
 * only receives structures, which keep it out of reach.
 */
export interface Context {
  readonly rest: Rest;
  readonly cache: Cache;
  /** Turns what Discord sends into structures, through the cache. */
  readonly entities: Entities;
  /** Who the bot is; `null` until Discord said it. */
  self: { userId: Snowflake; applicationId: Snowflake } | null;
  /** The texts of the language files; `null` without a language. */
  messages: LoadedMessages | null;
  /** Where the bot is in voice; `null` outside a running bot. */
  voice: VoiceManager | null;
}

/** The identity of the bot, for actions that need it. */
export function selfOf(ctx: Context): {
  userId: Snowflake;
  applicationId: Snowflake;
} {
  if (!ctx.self) {
    throw new Error(
      'The bot is not connected to Discord yet: this can only be used once it is.'
    );
  }
  return ctx.self;
}
