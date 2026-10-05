import type { GatewayDispatchEventName } from './types/gateway-events.js';

/**
 * Gateway Intents: which groups of events Discord sends to the bot.
 * @see https://docs.discord.com/developers/events/gateway#list-of-intents
 */
export const GatewayIntent = {
  Guilds: 1 << 0,
  GuildMembers: 1 << 1,
  GuildModeration: 1 << 2,
  GuildExpressions: 1 << 3,
  GuildIntegrations: 1 << 4,
  GuildWebhooks: 1 << 5,
  GuildInvites: 1 << 6,
  GuildVoiceStates: 1 << 7,
  GuildPresences: 1 << 8,
  GuildMessages: 1 << 9,
  GuildMessageReactions: 1 << 10,
  GuildMessageTyping: 1 << 11,
  DirectMessages: 1 << 12,
  DirectMessageReactions: 1 << 13,
  DirectMessageTyping: 1 << 14,
  MessageContent: 1 << 15,
  GuildScheduledEvents: 1 << 16,
  AutoModerationConfiguration: 1 << 20,
  AutoModerationExecution: 1 << 21,
  GuildMessagePolls: 1 << 24,
  DirectMessagePolls: 1 << 25,
} as const;
export type GatewayIntent = (typeof GatewayIntent)[keyof typeof GatewayIntent];
export type GatewayIntentName = keyof typeof GatewayIntent;

/**
 * Intents that must be enabled by hand in the Developer Portal.
 * @see https://docs.discord.com/developers/events/gateway#privileged-intents
 */
export const PRIVILEGED_INTENTS: readonly GatewayIntentName[] = [
  'GuildPresences',
  'GuildMembers',
  'MessageContent',
];

const I = GatewayIntent;

/**
 * The intents that make Discord send each event, exactly as the list of
 * intents of the documentation groups them. An event listed under several
 * intents is sent when any of them is set (the guild one for what happens in
 * a server, the direct message one for DMs). An event that is not here needs
 * no intent.
 * @see https://docs.discord.com/developers/events/gateway#list-of-intents
 */
export const EVENT_INTENTS: Readonly<
  Partial<Record<GatewayDispatchEventName, readonly GatewayIntent[]>>
> = {
  GUILD_CREATE: [I.Guilds],
  GUILD_UPDATE: [I.Guilds],
  GUILD_DELETE: [I.Guilds],
  GUILD_ROLE_CREATE: [I.Guilds],
  GUILD_ROLE_UPDATE: [I.Guilds],
  GUILD_ROLE_DELETE: [I.Guilds],
  CHANNEL_CREATE: [I.Guilds],
  CHANNEL_UPDATE: [I.Guilds],
  CHANNEL_DELETE: [I.Guilds],
  CHANNEL_PINS_UPDATE: [I.Guilds, I.DirectMessages],
  THREAD_CREATE: [I.Guilds],
  THREAD_UPDATE: [I.Guilds],
  THREAD_DELETE: [I.Guilds],
  THREAD_LIST_SYNC: [I.Guilds],
  THREAD_MEMBER_UPDATE: [I.Guilds],
  THREAD_MEMBERS_UPDATE: [I.Guilds, I.GuildMembers],
  STAGE_INSTANCE_CREATE: [I.Guilds],
  STAGE_INSTANCE_UPDATE: [I.Guilds],
  STAGE_INSTANCE_DELETE: [I.Guilds],
  VOICE_CHANNEL_STATUS_UPDATE: [I.Guilds],
  VOICE_CHANNEL_START_TIME_UPDATE: [I.Guilds],
  GUILD_MEMBER_ADD: [I.GuildMembers],
  GUILD_MEMBER_UPDATE: [I.GuildMembers],
  GUILD_MEMBER_REMOVE: [I.GuildMembers],
  GUILD_AUDIT_LOG_ENTRY_CREATE: [I.GuildModeration],
  GUILD_BAN_ADD: [I.GuildModeration],
  GUILD_BAN_REMOVE: [I.GuildModeration],
  GUILD_EMOJIS_UPDATE: [I.GuildExpressions],
  GUILD_STICKERS_UPDATE: [I.GuildExpressions],
  GUILD_SOUNDBOARD_SOUND_CREATE: [I.GuildExpressions],
  GUILD_SOUNDBOARD_SOUND_UPDATE: [I.GuildExpressions],
  GUILD_SOUNDBOARD_SOUND_DELETE: [I.GuildExpressions],
  GUILD_SOUNDBOARD_SOUNDS_UPDATE: [I.GuildExpressions],
  GUILD_INTEGRATIONS_UPDATE: [I.GuildIntegrations],
  INTEGRATION_CREATE: [I.GuildIntegrations],
  INTEGRATION_UPDATE: [I.GuildIntegrations],
  INTEGRATION_DELETE: [I.GuildIntegrations],
  WEBHOOKS_UPDATE: [I.GuildWebhooks],
  INVITE_CREATE: [I.GuildInvites],
  INVITE_DELETE: [I.GuildInvites],
  VOICE_CHANNEL_EFFECT_SEND: [I.GuildVoiceStates],
  VOICE_STATE_UPDATE: [I.GuildVoiceStates],
  PRESENCE_UPDATE: [I.GuildPresences],
  MESSAGE_CREATE: [I.GuildMessages, I.DirectMessages],
  MESSAGE_UPDATE: [I.GuildMessages, I.DirectMessages],
  MESSAGE_DELETE: [I.GuildMessages, I.DirectMessages],
  MESSAGE_DELETE_BULK: [I.GuildMessages],
  MESSAGE_REACTION_ADD: [I.GuildMessageReactions, I.DirectMessageReactions],
  MESSAGE_REACTION_REMOVE: [I.GuildMessageReactions, I.DirectMessageReactions],
  MESSAGE_REACTION_REMOVE_ALL: [
    I.GuildMessageReactions,
    I.DirectMessageReactions,
  ],
  MESSAGE_REACTION_REMOVE_EMOJI: [
    I.GuildMessageReactions,
    I.DirectMessageReactions,
  ],
  TYPING_START: [I.GuildMessageTyping, I.DirectMessageTyping],
  GUILD_SCHEDULED_EVENT_CREATE: [I.GuildScheduledEvents],
  GUILD_SCHEDULED_EVENT_UPDATE: [I.GuildScheduledEvents],
  GUILD_SCHEDULED_EVENT_DELETE: [I.GuildScheduledEvents],
  GUILD_SCHEDULED_EVENT_USER_ADD: [I.GuildScheduledEvents],
  GUILD_SCHEDULED_EVENT_USER_REMOVE: [I.GuildScheduledEvents],
  AUTO_MODERATION_RULE_CREATE: [I.AutoModerationConfiguration],
  AUTO_MODERATION_RULE_UPDATE: [I.AutoModerationConfiguration],
  AUTO_MODERATION_RULE_DELETE: [I.AutoModerationConfiguration],
  AUTO_MODERATION_ACTION_EXECUTION: [I.AutoModerationExecution],
  MESSAGE_POLL_VOTE_ADD: [I.GuildMessagePolls, I.DirectMessagePolls],
  MESSAGE_POLL_VOTE_REMOVE: [I.GuildMessagePolls, I.DirectMessagePolls],
};

/** Combines intents into the number sent when identifying. */
export function combineIntents(
  intents: Iterable<GatewayIntent | GatewayIntentName>
): number {
  let bits = 0;
  for (const intent of intents) {
    bits |= typeof intent === 'number' ? intent : GatewayIntent[intent];
  }
  return bits;
}

/** The names of the intents set in a number, in the order of the docs. */
export function intentNames(bits: number): GatewayIntentName[] {
  return (Object.keys(GatewayIntent) as GatewayIntentName[]).filter(
    name => (bits & GatewayIntent[name]) !== 0
  );
}
