import type { RawApplication } from './application.js';
import type { RawGuildApplicationCommandPermissions } from './application-command.js';
import type { RawAuditLogEntry } from './audit-log.js';
import type {
  AutoModerationTriggerType,
  RawAutoModerationAction,
  RawAutoModerationRule,
} from './auto-moderation.js';
import type { ChannelType, RawChannel, RawThreadMember } from './channel.js';
import type { ISO8601Timestamp, Snowflake } from './common.js';
import type { RawEmoji, RawPartialEmoji } from './emoji.js';
import type { RawEntitlement } from './entitlement.js';
import type {
  RawGuild,
  RawGuildMember,
  RawIntegration,
  RawUnavailableGuild,
} from './guild.js';
import type { RawGuildScheduledEvent } from './guild-scheduled-event.js';
import type { RawInteraction } from './interaction.js';
import type { InviteTargetType } from './invite.js';
import type { RawMessage, ReactionType } from './message.js';
import type { RawRole } from './permissions.js';
import type { RawSoundboardSound } from './soundboard.js';
import type { RawStageInstance } from './stage-instance.js';
import type { RawSticker } from './sticker.js';
import type { RawSubscription } from './subscription.js';
import type {
  RawAvatarDecorationData,
  RawCollectibles,
  RawUser,
} from './user.js';
import type { RawVoiceState } from './voice.js';

/**
 * Payload Structure
 * @see https://docs.discord.com/developers/events/gateway-events#payload-structure
 */
export interface RawGatewayPayload {
  /** Gateway opcode, which indicates the payload type */
  op: number;
  /** Event data */
  d: unknown;
  /** Sequence number of event used for resuming sessions and heartbeating */
  s: number | null;
  /** Event name */
  t: string | null;
}

/**
 * Identify Structure
 * @see https://docs.discord.com/developers/events/gateway-events#identify-identify-structure
 */
export interface RawIdentify {
  /** Authentication token */
  token: string;
  /** Connection properties */
  properties: RawIdentifyConnectionProperties;
  /** Whether this connection supports compression of packets */
  compress?: boolean;
  /** Value between 50 and 250, total number of members where the gateway will stop sending offline members in the guild member list */
  large_threshold?: number;
  /** Used for Guild Sharding */
  shard?: [number, number];
  /** Presence structure for initial presence information */
  presence?: RawGatewayPresenceUpdate;
  /** Gateway Intents you wish to receive */
  intents: number;
  /** Bitfield representing capabilities of your gateway client */
  capabilities?: number;
}

/**
 * Gateway Capabilities
 * @see https://docs.discord.com/developers/events/gateway-events#identify-gateway-capabilities
 */
export const GatewayCapabilities = {
  /** Opts the client into receiving obfuscated channel metadata over the Gateway for channels it can't view */
  ChannelObfuscation: 1 << 15,
} as const;
export type GatewayCapabilities =
  (typeof GatewayCapabilities)[keyof typeof GatewayCapabilities];

/**
 * Identify Connection Properties
 * @see https://docs.discord.com/developers/events/gateway-events#identify-identify-connection-properties
 */
export interface RawIdentifyConnectionProperties {
  /** Your operating system */
  os: string;
  /** Your library name */
  browser: string;
  /** Your library name */
  device: string;
}

/**
 * Resume Structure
 * @see https://docs.discord.com/developers/events/gateway-events#resume-resume-structure
 */
export interface RawResume {
  /** Session token */
  token: string;
  /** Session ID */
  session_id: string;
  /** Last sequence number received */
  seq: number;
}

/**
 * Request Guild Members Structure
 * @see https://docs.discord.com/developers/events/gateway-events#request-guild-members-request-guild-members-structure
 */
export interface RawRequestGuildMembers {
  /** ID of the guild to get members for */
  guild_id: Snowflake;
  /** string that username starts with, or an empty string to return all members */
  query?: string;
  /** maximum number of members to send matching the `query`; a limit of `0` can be used with an empty string `query` to return all members */
  limit: number;
  /** used to specify if we want the presences of the matched members */
  presences?: boolean;
  /** used to specify which users you wish to fetch */
  user_ids?: Snowflake | Snowflake[];
  /** nonce to identify the Guild Members Chunk response */
  nonce?: string;
}

/**
 * Request Soundboard Sounds Structure
 * @see https://docs.discord.com/developers/events/gateway-events#request-soundboard-sounds-request-soundboard-sounds-structure
 */
export interface RawRequestSoundboardSounds {
  /** IDs of the guilds to get soundboard sounds for */
  guild_ids: Snowflake[];
}

/**
 * Request Channel Info Structure
 * @see https://docs.discord.com/developers/events/gateway-events#request-channel-info-request-channel-info-structure
 */
export interface RawRequestChannelInfo {
  /** The guild id to request channel info for */
  guild_id: Snowflake;
  /** The fields to request. The current available fields are `status` and `voice_start_time`. */
  fields: string[];
}

/**
 * Gateway Voice State Update Structure
 * @see https://docs.discord.com/developers/events/gateway-events#update-voice-state-gateway-voice-state-update-structure
 */
export interface RawGatewayVoiceStateUpdate {
  /** ID of the guild */
  guild_id: Snowflake;
  /** ID of the voice channel client wants to join (null if disconnecting) */
  channel_id: Snowflake | null;
  /** Whether the client is muted */
  self_mute: boolean;
  /** Whether the client deafened */
  self_deaf: boolean;
}

/**
 * Gateway Presence Update Structure
 * @see https://docs.discord.com/developers/events/gateway-events#update-presence-gateway-presence-update-structure
 */
export interface RawGatewayPresenceUpdate {
  /** Unix time (in milliseconds) of when the client went idle, or null if the client is not idle */
  since: number | null;
  /** User's activities */
  activities: RawBotActivity[];
  /** User's new status */
  status: PresenceStatus;
  /** Whether or not the client is afk */
  afk: boolean;
}

/**
 * Hello Structure
 * @see https://docs.discord.com/developers/events/gateway-events#hello-hello-structure
 */
export interface RawHello {
  /** Interval (in milliseconds) an app should heartbeat with */
  heartbeat_interval: number;
}

/**
 * Ready Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#ready-ready-event-fields
 */
export interface RawReadyEvent {
  /** API version */
  v: number;
  /** Information about the user including email */
  user: RawUser;
  /** Guilds the user is in. When sharding is used they are filtered to that shard. */
  guilds: RawUnavailableGuild[];
  /** Used for resuming connections */
  session_id: string;
  /** Gateway URL for resuming connections */
  resume_gateway_url: string;
  /** Shard information associated with this session, if sent when identifying */
  shard?: [number, number];
  /** Contains `id`, `flags`, and `flags_new` */
  application: Partial<RawApplication>;
}

/**
 * Auto Moderation Action Execution Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#auto-moderation-action-execution-auto-moderation-action-execution-event-fields
 */
export interface RawAutoModerationActionExecutionEvent {
  /** ID of the guild in which action was executed */
  guild_id: Snowflake;
  /** Action which was executed */
  action: RawAutoModerationAction;
  /** ID of the rule which action belongs to */
  rule_id: Snowflake;
  /** Trigger type of rule which was triggered */
  rule_trigger_type: AutoModerationTriggerType;
  /** ID of the user which generated the content which triggered the rule */
  user_id: Snowflake;
  /** ID of the channel in which user content was posted */
  channel_id?: Snowflake;
  /** ID of any user message which content belongs to * */
  message_id?: Snowflake;
  /** ID of any system auto moderation messages posted as a result of this action ** */
  alert_system_message_id?: Snowflake;
  /** User-generated text content */
  content: string;
  /** Word or phrase configured in the rule that triggered the rule */
  matched_keyword: string | null;
  /** Substring in content that triggered the rule */
  matched_content: string | null;
}

/**
 * Channel Info Structure
 * @see https://docs.discord.com/developers/events/gateway-events#channel-info-channel-info-structure
 */
export interface RawChannelInfoEvent {
  /** The guild id */
  guild_id: Snowflake;
  /** Ephemeral data for channels in the guild */
  channels: RawChannelInfoChannel[];
}

/**
 * Channel Info Channel Structure
 * @see https://docs.discord.com/developers/events/gateway-events#channel-info-channel-info-channel-structure
 */
export interface RawChannelInfoChannel {
  /** The channel id */
  id: Snowflake;
  /** The voice channel status */
  status?: string | null;
  /** Unix timestamp (in seconds) of when the voice session started */
  voice_start_time?: number | null;
}

/**
 * Voice Channel Status Update
 * @see https://docs.discord.com/developers/events/gateway-events#voice-channel-status-update
 */
export interface RawVoiceChannelStatusUpdateEvent {
  /** The channel id */
  id: Snowflake;
  /** The guild id */
  guild_id: Snowflake;
  /** The new voice channel status */
  status: string | null;
}

/**
 * Voice Channel Start Time Update
 * @see https://docs.discord.com/developers/events/gateway-events#voice-channel-start-time-update
 */
export interface RawVoiceChannelStartTimeUpdateEvent {
  /** The channel id */
  id: Snowflake;
  /** The guild id */
  guild_id: Snowflake;
  /** Unix timestamp (in seconds) of when the voice session started */
  voice_start_time?: number | null;
}

/**
 * Thread List Sync Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#thread-list-sync-thread-list-sync-event-fields
 */
export interface RawThreadListSyncEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** Parent channel IDs whose threads are being synced.  If omitted, then threads were synced for the entire guild.  This array may contain channel_ids that have no active threads as well, so you know to clear that data. */
  channel_ids?: Snowflake[];
  /** All active threads in the given channels that the current user can access */
  threads: RawChannel[];
  /** All thread member objects from the synced threads for the current user, indicating which threads the current user has been added to */
  members: RawThreadMember[];
}

/**
 * Thread Member Update Event Extra Fields
 * @see https://docs.discord.com/developers/events/gateway-events#thread-member-update-thread-member-update-event-extra-fields
 */
export interface RawThreadMemberUpdateExtra {
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Thread Members Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#thread-members-update-thread-members-update-event-fields
 */
export interface RawThreadMembersUpdateEvent {
  /** ID of the thread */
  id: Snowflake;
  /** ID of the guild */
  guild_id: Snowflake;
  /** Approximate number of members in the thread, capped at 50 */
  member_count: number;
  /** Users who were added to the thread */
  added_members?: RawThreadMember[];
  /** ID of the users who were removed from the thread */
  removed_member_ids?: Snowflake[];
}

/**
 * Channel Pins Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#channel-pins-update-channel-pins-update-event-fields
 */
export interface RawChannelPinsUpdateEvent {
  /** ID of the guild */
  guild_id?: Snowflake;
  /** ID of the channel */
  channel_id: Snowflake;
  /** Time at which the most recent pinned message was pinned */
  last_pin_timestamp?: ISO8601Timestamp | null;
}

/**
 * Guild Create Extra Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-create-guild-create-extra-fields
 */
export interface RawGuildCreateExtra {
  /** When this guild was joined at */
  joined_at: ISO8601Timestamp;
  /** `true` if this is considered a large guild */
  large: boolean;
  /** `true` if this guild is unavailable due to an outage */
  unavailable?: boolean;
  /** Total number of members in this guild */
  member_count: number;
  /** States of members currently in voice channels; lacks the `guild_id` key */
  voice_states: Partial<RawVoiceState>[];
  /** Users in the guild */
  members: RawGuildMember[];
  /** Channels in the guild */
  channels: RawChannel[];
  /** All active threads in the guild that current user has permission to view */
  threads: RawChannel[];
  /** Presences of the members in the guild, will only include non-offline members if the size is greater than `large threshold` */
  presences: Partial<RawPresenceUpdateEvent>[];
  /** Stage instances in the guild */
  stage_instances: RawStageInstance[];
  /** Scheduled events in the guild */
  guild_scheduled_events: RawGuildScheduledEvent[];
  /** Soundboard sounds in the guild */
  soundboard_sounds: RawSoundboardSound[];
}

/**
 * Guild Audit Log Entry Create Event Extra Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-audit-log-entry-create-guild-audit-log-entry-create-event-extra-fields
 */
export interface RawGuildAuditLogEntryCreateExtra {
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Guild Ban Add Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-ban-add-guild-ban-add-event-fields
 */
export interface RawGuildBanAddEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** User who was banned */
  user: RawUser;
}

/**
 * Guild Ban Remove Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-ban-remove-guild-ban-remove-event-fields
 */
export interface RawGuildBanRemoveEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** User who was unbanned */
  user: RawUser;
}

/**
 * Guild Emojis Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-emojis-update-guild-emojis-update-event-fields
 */
export interface RawGuildEmojisUpdateEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** Array of emojis */
  emojis: RawEmoji[];
}

/**
 * Guild Stickers Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-stickers-update-guild-stickers-update-event-fields
 */
export interface RawGuildStickersUpdateEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** Array of stickers */
  stickers: RawSticker[];
}

/**
 * Guild Integrations Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-integrations-update-guild-integrations-update-event-fields
 */
export interface RawGuildIntegrationsUpdateEvent {
  /** ID of the guild whose integrations were updated */
  guild_id: Snowflake;
}

/**
 * Guild Member Add Extra Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-member-add-guild-member-add-extra-fields
 */
export interface RawGuildMemberAddExtra {
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Guild Member Remove Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-member-remove-guild-member-remove-event-fields
 */
export interface RawGuildMemberRemoveEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** User who was removed */
  user: RawUser;
}

/**
 * Guild Member Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-member-update-guild-member-update-event-fields
 */
export interface RawGuildMemberUpdateEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** User role ids */
  roles: Snowflake[];
  /** User */
  user: RawUser;
  /** Nickname of the user in the guild */
  nick?: string | null;
  /** Member's guild avatar hash */
  avatar: string | null;
  /** Member's guild banner hash */
  banner: string | null;
  /** When the user joined the guild */
  joined_at: ISO8601Timestamp | null;
  /** When the user starting boosting the guild */
  premium_since?: ISO8601Timestamp | null;
  /** Whether the user is deafened in voice channels */
  deaf?: boolean;
  /** Whether the user is muted in voice channels */
  mute?: boolean;
  /** Whether the user has not yet passed the guild's Membership Screening requirements */
  pending?: boolean;
  /** When the user's timeout will expire and the user will be able to communicate in the guild again, null or a time in the past if the user is not timed out */
  communication_disabled_until?: ISO8601Timestamp | null;
  /** Data for the member's guild avatar decoration */
  avatar_decoration_data?: RawAvatarDecorationData | null;
  /** data for the member's collectibles */
  collectibles?: RawCollectibles | null;
}

/**
 * Guild Members Chunk Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-members-chunk-guild-members-chunk-event-fields
 */
export interface RawGuildMembersChunkEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** Set of guild members */
  members: RawGuildMember[];
  /** Chunk index in the expected chunks for this response (`0 <= chunk_index < chunk_count`) */
  chunk_index: number;
  /** Total number of expected chunks for this response */
  chunk_count: number;
  /** When passing an invalid ID to `REQUEST_GUILD_MEMBERS`, it will be returned here */
  not_found?: Snowflake[];
  /** When passing `true` to `REQUEST_GUILD_MEMBERS`, presences of the returned members will be here */
  presences?: RawPresenceUpdateEvent[];
  /** Nonce used in the Guild Members Request */
  nonce?: string;
}

/**
 * Guild Role Create Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-role-create-guild-role-create-event-fields
 */
export interface RawGuildRoleCreateEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** Role that was created */
  role: RawRole;
}

/**
 * Guild Role Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-role-update-guild-role-update-event-fields
 */
export interface RawGuildRoleUpdateEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** Role that was updated */
  role: RawRole;
}

/**
 * Guild Role Delete Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-role-delete-guild-role-delete-event-fields
 */
export interface RawGuildRoleDeleteEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** ID of the role */
  role_id: Snowflake;
}

/**
 * Guild Scheduled Event User Add Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-scheduled-event-user-add-guild-scheduled-event-user-add-event-fields
 */
export interface RawGuildScheduledEventUserAddEvent {
  /** ID of the guild scheduled event */
  guild_scheduled_event_id: Snowflake;
  /** ID of the user */
  user_id: Snowflake;
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Guild Scheduled Event User Remove Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-scheduled-event-user-remove-guild-scheduled-event-user-remove-event-fields
 */
export interface RawGuildScheduledEventUserRemoveEvent {
  /** ID of the guild scheduled event */
  guild_scheduled_event_id: Snowflake;
  /** ID of the user */
  user_id: Snowflake;
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Guild Soundboard Sound Delete Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-soundboard-sound-delete-guild-soundboard-sound-delete-event-fields
 */
export interface RawGuildSoundboardSoundDeleteEvent {
  /** ID of the sound that was deleted */
  sound_id: Snowflake;
  /** ID of the guild the sound was in */
  guild_id: Snowflake;
}

/**
 * Guild Soundboard Sounds Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#guild-soundboard-sounds-update-guild-soundboard-sounds-update-event-fields
 */
export interface RawGuildSoundboardSoundsUpdateEvent {
  /** The guild's soundboard sounds */
  soundboard_sounds: RawSoundboardSound[];
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Soundboard Sounds Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#soundboard-sounds-soundboard-sounds-event-fields
 */
export interface RawSoundboardSoundsEvent {
  /** The guild's soundboard sounds */
  soundboard_sounds: RawSoundboardSound[];
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Integration Create Event Additional Fields
 * @see https://docs.discord.com/developers/events/gateway-events#integration-create-integration-create-event-additional-fields
 */
export interface RawIntegrationCreateExtra {
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Integration Update Event Additional Fields
 * @see https://docs.discord.com/developers/events/gateway-events#integration-update-integration-update-event-additional-fields
 */
export interface RawIntegrationUpdateExtra {
  /** ID of the guild */
  guild_id: Snowflake;
}

/**
 * Integration Delete Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#integration-delete-integration-delete-event-fields
 */
export interface RawIntegrationDeleteEvent {
  /** Integration ID */
  id: Snowflake;
  /** ID of the guild */
  guild_id: Snowflake;
  /** ID of the bot/OAuth2 application for this discord integration */
  application_id?: Snowflake;
}

/**
 * Invite Create Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#invite-create-invite-create-event-fields
 */
export interface RawInviteCreateEvent {
  /** Channel the invite is for */
  channel_id: Snowflake;
  /** Unique invite code */
  code: string;
  /** Time at which the invite was created */
  created_at: ISO8601Timestamp;
  /** Guild of the invite */
  guild_id?: Snowflake;
  /** User that created the invite */
  inviter?: RawUser;
  /** How long the invite is valid for (in seconds) */
  max_age: number;
  /** Maximum number of times the invite can be used */
  max_uses: number;
  /** Type of target for this voice channel invite */
  target_type?: InviteTargetType;
  /** User whose stream to display for this voice channel stream invite */
  target_user?: RawUser;
  /** Embedded application to open for this voice channel embedded application invite */
  target_application?: Partial<RawApplication>;
  /** Whether or not the invite is temporary (invited users will be kicked on disconnect unless they're assigned a role) */
  temporary: boolean;
  /** How many times the invite has been used (always will be 0) */
  uses: number;
  /** the expiration date of this invite */
  expires_at: ISO8601Timestamp | null;
  /** the role ID(s) for roles in the guild given to the users that accept this invite */
  role_ids?: Snowflake[];
}

/**
 * Invite Delete Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#invite-delete-invite-delete-event-fields
 */
export interface RawInviteDeleteEvent {
  /** Channel of the invite */
  channel_id: Snowflake;
  /** Guild of the invite */
  guild_id?: Snowflake;
  /** Unique invite code */
  code: string;
}

/**
 * Message Create Extra Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-create-message-create-extra-fields
 */
export interface RawMessageCreateExtra {
  /** ID of the guild the message was sent in - unless it is an ephemeral message */
  guild_id?: Snowflake;
  /** Member properties for this message's author. Missing for ephemeral messages and messages from webhooks */
  member?: Partial<RawGuildMember>;
  /** Users specifically mentioned in the message */
  mentions: (RawUser & { member?: Partial<RawGuildMember> })[];
  /** The type of channel the message was sent in */
  channel_type?: ChannelType;
}

/**
 * Message Delete Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-delete-message-delete-event-fields
 */
export interface RawMessageDeleteEvent {
  /** ID of the message */
  id: Snowflake;
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
}

/**
 * Message Delete Bulk Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-delete-bulk-message-delete-bulk-event-fields
 */
export interface RawMessageDeleteBulkEvent {
  /** IDs of the messages */
  ids: Snowflake[];
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
}

/**
 * Message Reaction Add Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-reaction-add-message-reaction-add-event-fields
 */
export interface RawMessageReactionAddEvent {
  /** ID of the user */
  user_id: Snowflake;
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the message */
  message_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
  /** Member who reacted if this happened in a guild */
  member?: RawGuildMember;
  /** Emoji used to react - example */
  emoji: RawPartialEmoji;
  /** ID of the user who authored the message which was reacted to */
  message_author_id?: Snowflake;
  /** true if this is a super-reaction */
  burst: boolean;
  /** Colors used for super-reaction animation in "#rrggbb" format */
  burst_colors?: string[];
  /** The type of reaction */
  type: ReactionType;
}

/**
 * Message Reaction Remove Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-reaction-remove-message-reaction-remove-event-fields
 */
export interface RawMessageReactionRemoveEvent {
  /** ID of the user */
  user_id: Snowflake;
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the message */
  message_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
  /** Emoji used to react - example */
  emoji: RawPartialEmoji;
  /** true if this was a super-reaction */
  burst: boolean;
  /** The type of reaction */
  type: ReactionType;
}

/**
 * Message Reaction Remove All Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-reaction-remove-all-message-reaction-remove-all-event-fields
 */
export interface RawMessageReactionRemoveAllEvent {
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the message */
  message_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
}

/**
 * Message Reaction Remove Emoji Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-reaction-remove-emoji-message-reaction-remove-emoji-event-fields
 */
export interface RawMessageReactionRemoveEmojiEvent {
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
  /** ID of the message */
  message_id: Snowflake;
  /** Emoji that was removed */
  emoji: Partial<RawEmoji>;
}

/**
 * Presence Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#presence-update-presence-update-event-fields
 */
export interface RawPresenceUpdateEvent {
  /** User whose presence is being updated */
  user: RawUser;
  /** ID of the guild */
  guild_id: Snowflake;
  /** Either "idle", "dnd", "online", or "offline" */
  status: PresenceStatus;
  /** User's current activities */
  activities: RawActivity[];
  /** User's platform-dependent status */
  client_status: RawClientStatus;
}

/**
 * Client Status Object
 * @see https://docs.discord.com/developers/events/gateway-events#client-status-object
 */
export interface RawClientStatus {
  /** User's status set for an active desktop (Windows, Linux, Mac) application session */
  desktop?: PresenceStatus;
  /** User's status set for an active mobile (iOS, Android) application session */
  mobile?: PresenceStatus;
  /** User's status set for an active web (browser, bot user) application session */
  web?: PresenceStatus;
  /** User's status set for an active virtual reality application session */
  vr?: PresenceStatus;
}

/**
 * An activity as a bot may send it: "Bot users are only able to set `name`,
 * `state`, `type`, and `url`."
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object
 */
export type RawBotActivity = Pick<RawActivity, 'name' | 'type'> &
  Partial<Pick<RawActivity, 'state' | 'url'>>;

/**
 * Activity Structure
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-structure
 */
export interface RawActivity {
  /** Activity's name */
  name: string;
  /** Activity type */
  type: ActivityType;
  /** Stream URL, is validated when type is 1 */
  url?: string | null;
  /** Unix timestamp (in milliseconds) of when the activity was added to the user's session */
  created_at: number;
  /** Unix timestamps for start and/or end of the game */
  timestamps?: RawActivityTimestamps;
  /** Application ID for the game */
  application_id?: Snowflake;
  /** Status display type; controls which field is displayed in the user's status text in the member list */
  status_display_type?: StatusDisplayType | null;
  /** What the player is currently doing */
  details?: string | null;
  /** URL that is linked when clicking on the details text */
  details_url?: string | null;
  /** User's current party status, or text used for a custom status */
  state?: string | null;
  /** URL that is linked when clicking on the state text */
  state_url?: string | null;
  /** Emoji used for a custom status */
  emoji?: RawEmoji | null;
  /** Information for the current party of the player */
  party?: RawActivityParty;
  /** Images for the presence and their hover texts */
  assets?: RawActivityAssets;
  /** Secrets for Rich Presence joining and spectating */
  secrets?: RawActivitySecrets;
  /** Whether or not the activity is an instanced game session */
  instance?: boolean;
  /** Activity flags `OR`d together, describes what the payload includes */
  flags?: number;
  /** Custom buttons shown in the Rich Presence (max 2) */
  buttons?: RawActivityButton[];
}

/**
 * Activity Types
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-types
 */
export const ActivityType = {
  Playing: 0,
  Streaming: 1,
  Listening: 2,
  Watching: 3,
  Custom: 4,
  Competing: 5,
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

/**
 * Status Display Types
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-status-display-types
 */
export const StatusDisplayType = {
  Name: 0,
  State: 1,
  Details: 2,
} as const;
export type StatusDisplayType =
  (typeof StatusDisplayType)[keyof typeof StatusDisplayType];

/**
 * Activity Timestamps
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-timestamps
 */
export interface RawActivityTimestamps {
  /** Unix time (in milliseconds) of when the activity started */
  start?: number;
  /** Unix time (in milliseconds) of when the activity ends */
  end?: number;
}

/**
 * Activity Emoji
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-emoji
 */
export interface RawActivityEmoji {
  /** Name of the emoji */
  name: string;
  /** ID of the emoji */
  id?: Snowflake;
  /** Whether the emoji is animated */
  animated?: boolean;
}

/**
 * Activity Party
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-party
 */
export interface RawActivityParty {
  /** ID of the party */
  id?: string;
  /** Used to show the party's current and maximum size */
  size?: [number, number];
}

/**
 * Activity Assets
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-assets
 */
export interface RawActivityAssets {
  /** See Activity Asset Image */
  large_image?: string;
  /** Text displayed when hovering over the large image of the activity */
  large_text?: string;
  /** URL that is opened when clicking on the large image */
  large_url?: string;
  /** See Activity Asset Image */
  small_image?: string;
  /** Text displayed when hovering over the small image of the activity */
  small_text?: string;
  /** URL that is opened when clicking on the small image */
  small_url?: string;
  /** See Activity Asset Image. Displayed as a banner on a Game Invite. */
  invite_cover_image?: string;
}

/**
 * Activity Secrets
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-secrets
 */
export interface RawActivitySecrets {
  /** Secret for joining a party */
  join?: string;
  /** Secret for spectating a game */
  spectate?: string;
  /** Secret for a specific instanced match */
  match?: string;
}

/**
 * Activity Flags
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-flags
 */
export const ActivityFlags = {
  Instance: 1 << 0,
  Join: 1 << 1,
  Spectate: 1 << 2,
  JoinRequest: 1 << 3,
  Sync: 1 << 4,
  Play: 1 << 5,
  PartyPrivacyFriends: 1 << 6,
  PartyPrivacyVoiceChannel: 1 << 7,
  Embedded: 1 << 8,
} as const;
export type ActivityFlags = (typeof ActivityFlags)[keyof typeof ActivityFlags];

/**
 * Activity Buttons
 * @see https://docs.discord.com/developers/events/gateway-events#activity-object-activity-buttons
 */
export interface RawActivityButton {
  /** Text shown on the button (1-32 characters) */
  label: string;
  /** URL opened when clicking the button (1-512 characters) */
  url: string;
}

/**
 * Typing Start Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#typing-start-typing-start-event-fields
 */
export interface RawTypingStartEvent {
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
  /** ID of the user */
  user_id: Snowflake;
  /** Unix time (in seconds) of when the user started typing */
  timestamp: number;
  /** Member who started typing if this happened in a guild */
  member?: RawGuildMember;
}

/**
 * Voice Channel Effect Send Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#voice-channel-effect-send-voice-channel-effect-send-event-fields
 */
export interface RawVoiceChannelEffectSendEvent {
  /** ID of the channel the effect was sent in */
  channel_id: Snowflake;
  /** ID of the guild the effect was sent in */
  guild_id: Snowflake;
  /** ID of the user who sent the effect */
  user_id: Snowflake;
  /** The emoji sent, for emoji reaction and soundboard effects */
  emoji?: RawEmoji | null;
  /** The type of emoji animation, for emoji reaction and soundboard effects */
  animation_type?: VoiceEffectAnimationType | null;
  /** The ID of the emoji animation, for emoji reaction and soundboard effects */
  animation_id?: number;
  /** The ID of the soundboard sound, for soundboard effects */
  sound_id?: Snowflake | number;
  /** The volume of the soundboard sound, from 0 to 1, for soundboard effects */
  sound_volume?: number;
}

/**
 * Animation Types
 * @see https://docs.discord.com/developers/events/gateway-events#voice-channel-effect-send-animation-types
 */
export const VoiceEffectAnimationType = {
  /** A fun animation, sent by a Nitro subscriber */
  Premium: 0,
  /** The standard animation */
  Basic: 1,
} as const;
export type VoiceEffectAnimationType =
  (typeof VoiceEffectAnimationType)[keyof typeof VoiceEffectAnimationType];

/**
 * Voice Server Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#voice-server-update-voice-server-update-event-fields
 */
export interface RawVoiceServerUpdateEvent {
  /** Voice connection token */
  token: string;
  /** Guild this voice server update is for */
  guild_id: Snowflake;
  /** Voice server host */
  endpoint: string | null;
}

/**
 * Webhooks Update Event Fields
 * @see https://docs.discord.com/developers/events/gateway-events#webhooks-update-webhooks-update-event-fields
 */
export interface RawWebhooksUpdateEvent {
  /** ID of the guild */
  guild_id: Snowflake;
  /** ID of the channel */
  channel_id: Snowflake;
}

/**
 * Message Poll Vote Add Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-poll-vote-add-message-poll-vote-add-fields
 */
export interface RawMessagePollVoteAddEvent {
  /** ID of the user */
  user_id: Snowflake;
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the message */
  message_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
  /** ID of the answer */
  answer_id: number;
}

/**
 * Message Poll Vote Remove Fields
 * @see https://docs.discord.com/developers/events/gateway-events#message-poll-vote-remove-message-poll-vote-remove-fields
 */
export interface RawMessagePollVoteRemoveEvent {
  /** ID of the user */
  user_id: Snowflake;
  /** ID of the channel */
  channel_id: Snowflake;
  /** ID of the message */
  message_id: Snowflake;
  /** ID of the guild */
  guild_id?: Snowflake;
  /** ID of the answer */
  answer_id: number;
}

/**
 * Rate Limited Fields
 * @see https://docs.discord.com/developers/events/gateway-events#rate-limited-fields
 */
export interface RawRateLimitedEvent {
  /** Gateway opcode of the event that was rate limited */
  opcode: number;
  /** The number of seconds to wait before submitting another request */
  retry_after: number;
  /** Metadata for the event that was rate limited */
  meta: RawRequestGuildMemberRateLimitMetadata;
}

/**
 * Request Guild Member Rate Limit Metadata Structure
 * @see https://docs.discord.com/developers/events/gateway-events#rate-limited-fields
 */
export interface RawRequestGuildMemberRateLimitMetadata {
  /** ID of the guild to get members for */
  guild_id: Snowflake;
  /** nonce to identify the Guild Members Chunk response */
  nonce?: string;
}

/**
 * Status Types
 * @see https://docs.discord.com/developers/events/gateway-events#update-presence-status-types
 */
export type PresenceStatus =
  'online' | 'dnd' | 'idle' | 'invisible' | 'offline';

/** What Message Create and Message Update carry: a message and extra fields. */
export type RawMessageCreateEvent = RawMessage & RawMessageCreateExtra;

/** An available guild, as sent by Guild Create. */
export type RawGuildCreateEvent = RawGuild & RawGuildCreateExtra;

/**
 * Receive Events: the name of every event Discord dispatches (the `t` field
 * of a Dispatch payload), with the type of its `d` field.
 * @see https://docs.discord.com/developers/events/gateway-events#receive-events
 */
export interface GatewayDispatchEvents {
  READY: RawReadyEvent;
  RESUMED: unknown;
  RATE_LIMITED: RawRateLimitedEvent;
  APPLICATION_COMMAND_PERMISSIONS_UPDATE: RawGuildApplicationCommandPermissions;
  AUTO_MODERATION_RULE_CREATE: RawAutoModerationRule;
  AUTO_MODERATION_RULE_UPDATE: RawAutoModerationRule;
  AUTO_MODERATION_RULE_DELETE: RawAutoModerationRule;
  AUTO_MODERATION_ACTION_EXECUTION: RawAutoModerationActionExecutionEvent;
  CHANNEL_CREATE: RawChannel;
  CHANNEL_UPDATE: RawChannel;
  CHANNEL_DELETE: RawChannel;
  CHANNEL_INFO: RawChannelInfoEvent;
  CHANNEL_PINS_UPDATE: RawChannelPinsUpdateEvent;
  THREAD_CREATE: RawChannel & { newly_created?: boolean };
  THREAD_UPDATE: RawChannel;
  THREAD_DELETE: Pick<RawChannel, 'id' | 'guild_id' | 'parent_id' | 'type'>;
  THREAD_LIST_SYNC: RawThreadListSyncEvent;
  THREAD_MEMBER_UPDATE: RawThreadMember & RawThreadMemberUpdateExtra;
  THREAD_MEMBERS_UPDATE: RawThreadMembersUpdateEvent;
  ENTITLEMENT_CREATE: RawEntitlement;
  ENTITLEMENT_UPDATE: RawEntitlement;
  ENTITLEMENT_DELETE: RawEntitlement;
  GUILD_CREATE: RawGuildCreateEvent | RawUnavailableGuild;
  GUILD_UPDATE: RawGuild;
  GUILD_DELETE: RawUnavailableGuild;
  GUILD_AUDIT_LOG_ENTRY_CREATE: RawAuditLogEntry &
    RawGuildAuditLogEntryCreateExtra;
  GUILD_BAN_ADD: RawGuildBanAddEvent;
  GUILD_BAN_REMOVE: RawGuildBanRemoveEvent;
  GUILD_EMOJIS_UPDATE: RawGuildEmojisUpdateEvent;
  GUILD_STICKERS_UPDATE: RawGuildStickersUpdateEvent;
  GUILD_INTEGRATIONS_UPDATE: RawGuildIntegrationsUpdateEvent;
  GUILD_MEMBER_ADD: RawGuildMember & RawGuildMemberAddExtra;
  GUILD_MEMBER_REMOVE: RawGuildMemberRemoveEvent;
  GUILD_MEMBER_UPDATE: RawGuildMemberUpdateEvent;
  GUILD_MEMBERS_CHUNK: RawGuildMembersChunkEvent;
  GUILD_ROLE_CREATE: RawGuildRoleCreateEvent;
  GUILD_ROLE_UPDATE: RawGuildRoleUpdateEvent;
  GUILD_ROLE_DELETE: RawGuildRoleDeleteEvent;
  GUILD_SCHEDULED_EVENT_CREATE: RawGuildScheduledEvent;
  GUILD_SCHEDULED_EVENT_UPDATE: RawGuildScheduledEvent;
  GUILD_SCHEDULED_EVENT_DELETE: RawGuildScheduledEvent;
  GUILD_SCHEDULED_EVENT_USER_ADD: RawGuildScheduledEventUserAddEvent;
  GUILD_SCHEDULED_EVENT_USER_REMOVE: RawGuildScheduledEventUserRemoveEvent;
  GUILD_SOUNDBOARD_SOUND_CREATE: RawSoundboardSound;
  GUILD_SOUNDBOARD_SOUND_UPDATE: RawSoundboardSound;
  GUILD_SOUNDBOARD_SOUND_DELETE: RawGuildSoundboardSoundDeleteEvent;
  GUILD_SOUNDBOARD_SOUNDS_UPDATE: RawGuildSoundboardSoundsUpdateEvent;
  SOUNDBOARD_SOUNDS: RawSoundboardSoundsEvent;
  INTEGRATION_CREATE: Omit<RawIntegration, 'user'> & RawIntegrationCreateExtra;
  INTEGRATION_UPDATE: Omit<RawIntegration, 'user'> & RawIntegrationUpdateExtra;
  INTEGRATION_DELETE: RawIntegrationDeleteEvent;
  INTERACTION_CREATE: RawInteraction;
  INVITE_CREATE: RawInviteCreateEvent;
  INVITE_DELETE: RawInviteDeleteEvent;
  MESSAGE_CREATE: RawMessageCreateEvent;
  MESSAGE_UPDATE: RawMessageCreateEvent;
  MESSAGE_DELETE: RawMessageDeleteEvent;
  MESSAGE_DELETE_BULK: RawMessageDeleteBulkEvent;
  MESSAGE_REACTION_ADD: RawMessageReactionAddEvent;
  MESSAGE_REACTION_REMOVE: RawMessageReactionRemoveEvent;
  MESSAGE_REACTION_REMOVE_ALL: RawMessageReactionRemoveAllEvent;
  MESSAGE_REACTION_REMOVE_EMOJI: RawMessageReactionRemoveEmojiEvent;
  PRESENCE_UPDATE: RawPresenceUpdateEvent;
  STAGE_INSTANCE_CREATE: RawStageInstance;
  STAGE_INSTANCE_UPDATE: RawStageInstance;
  STAGE_INSTANCE_DELETE: RawStageInstance;
  SUBSCRIPTION_CREATE: RawSubscription;
  SUBSCRIPTION_UPDATE: RawSubscription;
  SUBSCRIPTION_DELETE: RawSubscription;
  TYPING_START: RawTypingStartEvent;
  USER_UPDATE: RawUser;
  VOICE_CHANNEL_EFFECT_SEND: RawVoiceChannelEffectSendEvent;
  VOICE_CHANNEL_START_TIME_UPDATE: RawVoiceChannelStartTimeUpdateEvent;
  VOICE_CHANNEL_STATUS_UPDATE: RawVoiceChannelStatusUpdateEvent;
  VOICE_STATE_UPDATE: RawVoiceState;
  VOICE_SERVER_UPDATE: RawVoiceServerUpdateEvent;
  WEBHOOKS_UPDATE: RawWebhooksUpdateEvent;
  MESSAGE_POLL_VOTE_ADD: RawMessagePollVoteAddEvent;
  MESSAGE_POLL_VOTE_REMOVE: RawMessagePollVoteRemoveEvent;
}

/** The name of an event Discord dispatches. */
export type GatewayDispatchEventName = keyof GatewayDispatchEvents;
