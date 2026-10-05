import type { RawApplication } from './application.js';
import type { RawChannel } from './channel.js';
import type { ISO8601Timestamp, Snowflake } from './common.js';
import type { RawGuild, RawGuildMember } from './guild.js';
import type { RawGuildScheduledEvent } from './guild-scheduled-event.js';
import type { RawRole } from './permissions.js';
import type { RawUser } from './user.js';

/**
 * Invite Structure
 * @see https://docs.discord.com/developers/resources/invite#invite-object-invite-structure
 */
export interface RawInvite {
  /** the type of invite */
  type: InviteType;
  /** the invite code (unique ID) */
  code: string;
  /** the guild this invite is for */
  guild?: Partial<RawGuild>;
  /** the channel this invite is for */
  channel: Partial<RawChannel> | null;
  /** the user who created the invite */
  inviter?: RawUser;
  /** the type of target for this voice channel invite */
  target_type?: InviteTargetType;
  /** the user whose stream to display for this voice channel stream invite */
  target_user?: RawUser;
  /** the embedded application to open for this voice channel embedded application invite */
  target_application?: Partial<RawApplication>;
  /** approximate count of online members, returned from the `GET /invites/` endpoint when `with_counts` is `true` */
  approximate_presence_count?: number;
  /** approximate count of total members, returned from the `GET /invites/` endpoint when `with_counts` is `true` */
  approximate_member_count?: number;
  /** the expiration date of this invite */
  expires_at: ISO8601Timestamp | null;
  /** guild scheduled event data, only included if `guild_scheduled_event_id` contains a valid guild scheduled event id */
  guild_scheduled_event?: RawGuildScheduledEvent;
  /** guild invite flags for guild invites */
  flags?: number;
  /** the roles assigned to the user upon accepting the invite. */
  roles?: Partial<RawRole>[];
}

/**
 * Invite Types
 * @see https://docs.discord.com/developers/resources/invite#invite-object-invite-types
 */
export const InviteType = {
  Guild: 0,
  GroupDm: 1,
  Friend: 2,
} as const;
export type InviteType = (typeof InviteType)[keyof typeof InviteType];

/**
 * Invite Target Types
 * @see https://docs.discord.com/developers/resources/invite#invite-object-invite-target-types
 */
export const InviteTargetType = {
  Stream: 1,
  EmbeddedApplication: 2,
} as const;
export type InviteTargetType =
  (typeof InviteTargetType)[keyof typeof InviteTargetType];

/**
 * Guild Invite Flags
 * @see https://docs.discord.com/developers/resources/invite#invite-object-guild-invite-flags
 */
export const GuildInviteFlags = {
  /** this invite is a guest invite for a voice channel */
  IsGuestInvite: 1 << 0,
} as const;
export type GuildInviteFlags =
  (typeof GuildInviteFlags)[keyof typeof GuildInviteFlags];

/**
 * Invite Metadata Structure
 * @see https://docs.discord.com/developers/resources/invite#invite-metadata-object-invite-metadata-structure
 */
export interface RawInviteMetadata {
  /** number of times this invite has been used */
  uses: number;
  /** max number of times this invite can be used */
  max_uses: number;
  /** duration (in seconds) after which the invite expires */
  max_age: number;
  /** whether this invite only grants temporary membership */
  temporary: boolean;
  /** when this invite was created */
  created_at: ISO8601Timestamp;
}

/**
 * Invite Stage Instance Structure
 * @see https://docs.discord.com/developers/resources/invite#invite-stage-instance-object-invite-stage-instance-structure
 */
export interface RawInviteStageInstance {
  /** the members speaking in the Stage */
  members: Partial<RawGuildMember>[];
  /** the number of users in the Stage */
  participant_count: number;
  /** the number of users speaking in the Stage */
  speaker_count: number;
  /** the topic of the Stage instance (1-120 characters) */
  topic: string;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/invite#get-invite-query-string-params
 */
export interface GetInviteQuery {
  /** whether the invite should contain approximate member counts */
  with_counts?: boolean;
  /** the guild scheduled event to include with the invite */
  guild_scheduled_event_id?: Snowflake;
}

/**
 * Form Params
 * @see https://docs.discord.com/developers/resources/invite#update-target-users-form-params
 */
export interface UpdateTargetUsersJSONParams {}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/invite#bulk-add-target-users-json-params
 */
export interface BulkAddTargetUsersJSONParams {
  /** the IDs of users to add, max of 1000 users */
  user_ids: Snowflake[];
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/invite#bulk-delete-target-users-json-params
 */
export interface BulkDeleteTargetUsersJSONParams {
  /** the IDs of users to remove, max of 1000 users */
  user_ids: Snowflake[];
}

/**
 * Status Codes
 * @see https://docs.discord.com/developers/resources/invite#get-target-users-job-status-status-codes
 */
export const InviteTargetUsersJobStatus = {
  /** The default value. */
  Unspecified: 0,
  /** The job is still being processed. */
  Processing: 1,
  /** The job has been completed successfully. */
  Completed: 2,
  /** The job has failed, see `error_message` field for more details. */
  Failed: 3,
} as const;
export type InviteTargetUsersJobStatus =
  (typeof InviteTargetUsersJobStatus)[keyof typeof InviteTargetUsersJobStatus];

/**
 * The state of the job that processes the target users of an invite.
 * @see https://docs.discord.com/developers/resources/invite#get-target-users-job-status
 */
export interface RawInviteTargetUsersJob {
  status: InviteTargetUsersJobStatus;
  total_users: number;
  processed_users: number;
  created_at: ISO8601Timestamp;
  completed_at: ISO8601Timestamp | null;
  error_message?: string;
}
