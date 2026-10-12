// Whether a project joins voice channels, from its code. Discord only tells
// a bot its own voice state with the GUILD_VOICE_STATES intent, without
// which `join()` can't finish: like every intent, it is asked for when the
// project needs it, and only then.

import { GatewayIntent } from '../discord/intents.js';
import type { CodeUse } from '../loader/usage.js';

/**
 * A call to `join()` without an argument or with options: what joining a
 * voice channel looks like. The `join(', ')` of a list does not match; a
 * `join()` of a list does, and only costs an intent.
 */
const JOINS_VOICE = /\.join\(\s*(?:\)|\{)/;

/** Joining voice, as `loader/usage.ts` looks for it. */
export const VOICE_USE: CodeUse = {
  name: 'voice',
  pattern: JOINS_VOICE,
  intents: GatewayIntent.GuildVoiceStates,
};

/** Whether some code joins a voice channel. */
export function joinsVoice(code: string): boolean {
  return JOINS_VOICE.test(code);
}
