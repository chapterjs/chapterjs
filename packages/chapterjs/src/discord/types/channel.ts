import type { ISO8601Timestamp, Snowflake } from './common.js';
import type { RawComponent } from './component.js';
import type { RawGuildMember } from './guild.js';
import type { InviteTargetType } from './invite.js';
import type {
  RawAllowedMentions,
  RawAttachmentRequest,
  RawEmbed,
} from './message.js';
import type { RawUser } from './user.js';

/**
 * Channel Structure
 * @see https://docs.discord.com/developers/resources/channel#channel-object-channel-structure
 */
export interface RawChannel {
  /** the id of this channel */
  id: Snowflake;
  /** the type of channel */
  type: ChannelType;
  /** the id of the guild (may be missing for some channel objects received over gateway guild dispatches) */
  guild_id?: Snowflake;
  /** sorting position of the channel (channels with the same position are sorted by id) */
  position?: number;
  /** explicit permission overwrites for members and roles */
  permission_overwrites?: RawPermissionOverwrite[];
  /** the name of the channel (1-100 characters) */
  name?: string | null;
  /** the channel topic (0-4096 characters for `GUILD_FORUM` and `GUILD_MEDIA` channels, 0-1024 characters for all others) */
  topic?: string | null;
  /** whether the channel is age-restricted */
  nsfw?: boolean;
  /** the id of the last message sent in this channel (or thread for `GUILD_FORUM` or `GUILD_MEDIA` channels) (may not point to an existing or valid message or thread) */
  last_message_id?: Snowflake | null;
  /** the bitrate (in bits per second) of the voice channel */
  bitrate?: number;
  /** the user limit of the voice channel */
  user_limit?: number;
  /** amount of seconds a user has to wait before sending another message (0-21600); bots, as well as users with the permission `BYPASS_SLOWMODE`, are unaffected */
  rate_limit_per_user?: number;
  /** the recipients of the DM */
  recipients?: RawUser[];
  /** icon hash of the group DM */
  icon?: string | null;
  /** id of the creator of the group DM or thread */
  owner_id?: Snowflake;
  /** application id associated with the channel. for group DMs, this is the application that created the group */
  application_id?: Snowflake | null;
  /** for group DM channels: whether the channel is managed by an application via the `gdm.join` OAuth2 scope */
  managed?: boolean;
  /** for guild channels: id of the parent category for a channel (each parent category can contain up to 50 channels), for threads: id of the text channel this thread was created */
  parent_id?: Snowflake | null;
  /** when the last pinned message was pinned. This may be `null` in events such as `GUILD_CREATE` when a message is not pinned. */
  last_pin_timestamp?: ISO8601Timestamp | null;
  /** voice region id for the voice channel, automatic when set to null */
  rtc_region?: string | null;
  /** the camera video quality mode of the voice channel, 1 when not present */
  video_quality_mode?: VideoQualityMode;
  /** number of messages (not including the initial message or deleted messages) in a thread. */
  message_count?: number;
  /** an approximate count of users in a thread, stops counting at 50 */
  member_count?: number;
  /** thread-specific fields not needed by other channels */
  thread_metadata?: RawThreadMetadata;
  /** thread member object for the current user, if they have joined the thread, only included on certain API endpoints */
  member?: RawThreadMember;
  /** default duration, copied onto newly created threads, in minutes, threads will stop showing in the channel list after the specified period of inactivity, can be set to: 60, 1440, 4320, 10080 */
  default_auto_archive_duration?: number;
  /** computed permissions for the invoking user in the channel, including overwrites, only included when part of the `resolved` data received on an interaction. This does not include implicit permissions, which may need to be checked separately */
  permissions?: string;
  /** computed permissions for the bot user in the channel, including overwrites, only included when part of the `resolved` data received on an interaction. This does not include implicit permissions, which may need to be checked separately */
  app_permissions?: string;
  /** channel flags combined as a bitfield */
  flags?: number;
  /** number of messages ever sent in a thread, it's similar to `message_count` on message creation, but will not decrement the number when a message is deleted */
  total_message_sent?: number;
  /** the set of tags that can be used in a `GUILD_FORUM` or a `GUILD_MEDIA` channel */
  available_tags?: RawForumTag[];
  /** the IDs of the set of tags that have been applied to a thread in a `GUILD_FORUM` or a `GUILD_MEDIA` channel */
  applied_tags?: Snowflake[];
  /** the emoji to show in the add reaction button on a thread in a `GUILD_FORUM` or a `GUILD_MEDIA` channel */
  default_reaction_emoji?: RawDefaultReaction | null;
  /** the initial `rate_limit_per_user` to set on newly created threads in a channel. this field is copied to the thread at creation time and does not live update. */
  default_thread_rate_limit_per_user?: number;
  /** the default sort order type used to order posts in `GUILD_FORUM` and `GUILD_MEDIA` channels. Defaults to `null`, which indicates a preferred sort order hasn't been set by a channel admin */
  default_sort_order?: ForumSortOrderType | null;
  /** the default forum layout view used to display posts in `GUILD_FORUM` channels. Defaults to `0`, which indicates a layout view has not been set by a channel admin */
  default_forum_layout?: ForumLayoutType;
}

/**
 * Channel Types
 * @see https://docs.discord.com/developers/resources/channel#channel-object-channel-types
 */
export const ChannelType = {
  /** a text channel within a server */
  GuildText: 0,
  /** a direct message between users */
  Dm: 1,
  /** a voice channel within a server */
  GuildVoice: 2,
  /** a direct message between multiple users */
  GroupDm: 3,
  /** an organizational category that contains up to 50 channels */
  GuildCategory: 4,
  /** a channel that users can follow and crosspost into their own server (formerly news channels) */
  GuildAnnouncement: 5,
  /** a temporary sub-channel within a GUILD_ANNOUNCEMENT channel */
  AnnouncementThread: 10,
  /** a temporary sub-channel within a GUILD_TEXT or GUILD_FORUM channel */
  PublicThread: 11,
  /** a temporary sub-channel within a GUILD_TEXT channel that is only viewable by those invited and those with the MANAGE_THREADS permission */
  PrivateThread: 12,
  /** a voice channel for hosting events with an audience */
  GuildStageVoice: 13,
  /** the channel in a hub containing the listed servers */
  GuildDirectory: 14,
  /** Channel that can only contain threads */
  GuildForum: 15,
  /** Channel that can only contain threads, similar to `GUILD_FORUM` channels */
  GuildMedia: 16,
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

/**
 * Video Quality Modes
 * @see https://docs.discord.com/developers/resources/channel#channel-object-video-quality-modes
 */
export const VideoQualityMode = {
  /** Discord chooses the quality for optimal performance */
  Auto: 1,
  /** 720p */
  Full: 2,
} as const;
export type VideoQualityMode =
  (typeof VideoQualityMode)[keyof typeof VideoQualityMode];

/**
 * Channel Flags
 * @see https://docs.discord.com/developers/resources/channel#channel-object-channel-flags
 */
export const ChannelFlags = {
  /** this thread is pinned to the top of its parent `GUILD_FORUM` or `GUILD_MEDIA` channel */
  Pinned: 1 << 1,
  /** whether a tag is required to be specified when creating a thread in a `GUILD_FORUM` or a `GUILD_MEDIA` channel. Tags are specified in the `applied_tags` field. */
  RequireTag: 1 << 4,
  /** when set hides the embedded media download options. Available only for media channels */
  HideMediaDownloadOptions: 1 << 15,
  /** this channel's metadata has been obfuscated because the current user cannot view it. Only ever set on channels received over the Gateway; the HTTP API never sets this flag. See Obfuscated Channels. */
  ChannelObfuscated: 1 << 17,
  /** this channel is a Spoiler Channel i.e. users must opt in to view its contents. Can be set on all textual guild channels and voice channels (not `GUILD_STAGE`). Can only be set if channel's `nsfw` is false */
  IsSpoilerChannel: 1 << 21,
} as const;
export type ChannelFlags = (typeof ChannelFlags)[keyof typeof ChannelFlags];

/**
 * Sort Order Types
 * @see https://docs.discord.com/developers/resources/channel#channel-object-sort-order-types
 */
export const ForumSortOrderType = {
  /** Sort forum posts by activity */
  LatestActivity: 0,
  /** Sort forum posts by creation time (from most recent to oldest) */
  CreationDate: 1,
} as const;
export type ForumSortOrderType =
  (typeof ForumSortOrderType)[keyof typeof ForumSortOrderType];

/**
 * Forum Layout Types
 * @see https://docs.discord.com/developers/resources/channel#channel-object-forum-layout-types
 */
export const ForumLayoutType = {
  /** No default has been set for forum channel */
  NotSet: 0,
  /** Display posts as a list */
  ListView: 1,
  /** Display posts as a collection of tiles */
  GalleryView: 2,
} as const;
export type ForumLayoutType =
  (typeof ForumLayoutType)[keyof typeof ForumLayoutType];

/**
 * Followed Channel Structure
 * @see https://docs.discord.com/developers/resources/channel#followed-channel-object-followed-channel-structure
 */
export interface RawFollowedChannel {
  /** source channel id */
  channel_id: Snowflake;
  /** created target webhook id */
  webhook_id: Snowflake;
}

/**
 * Overwrite Structure
 * @see https://docs.discord.com/developers/resources/channel#overwrite-object-overwrite-structure
 */
export interface RawPermissionOverwrite {
  /** role or user id */
  id: Snowflake;
  /** either 0 (role) or 1 (member) */
  type: PermissionOverwriteType;
  /** permission bit set */
  allow: string;
  /** permission bit set */
  deny: string;
}

/**
 * Thread Metadata Structure
 * @see https://docs.discord.com/developers/resources/channel#thread-metadata-object-thread-metadata-structure
 */
export interface RawThreadMetadata {
  /** whether the thread is archived */
  archived: boolean;
  /** the thread will stop showing in the channel list after `auto_archive_duration` minutes of inactivity, can be set to: 60, 1440, 4320, 10080 */
  auto_archive_duration: number;
  /** timestamp when the thread's archive status was last changed, used for calculating recent activity */
  archive_timestamp: ISO8601Timestamp;
  /** whether the thread is locked; when a thread is locked, only users with MANAGE_THREADS can unarchive it */
  locked: boolean;
  /** whether non-moderators can add other non-moderators to a thread; only available on private threads */
  invitable?: boolean;
  /** timestamp when the thread was created; only populated for threads created after 2022-01-09 */
  create_timestamp?: ISO8601Timestamp | null;
}

/**
 * Thread Member Structure
 * @see https://docs.discord.com/developers/resources/channel#thread-member-object-thread-member-structure
 */
export interface RawThreadMember {
  /** ID of the thread */
  id?: Snowflake;
  /** ID of the user */
  user_id?: Snowflake;
  /** Time the user last joined the thread */
  join_timestamp: ISO8601Timestamp;
  /** Any user-thread settings, currently only used for notifications */
  flags: number;
  /** Additional information about the user */
  member?: RawGuildMember;
}

/**
 * Default Reaction Structure
 * @see https://docs.discord.com/developers/resources/channel#default-reaction-object-default-reaction-structure
 */
export interface RawDefaultReaction {
  /** the id of a guild's custom emoji */
  emoji_id: Snowflake | null;
  /** the unicode character of the emoji */
  emoji_name: string | null;
}

/**
 * Forum Tag Structure
 * @see https://docs.discord.com/developers/resources/channel#forum-tag-object-forum-tag-structure
 */
export interface RawForumTag {
  /** the id of the tag */
  id: Snowflake;
  /** the name of the tag (0-20 characters) */
  name: string;
  /** whether this tag can only be added to or removed from threads by a member with the `MANAGE_THREADS` permission */
  moderated: boolean;
  /** the id of a guild's custom emoji * */
  emoji_id: Snowflake | null;
  /** the unicode character of the emoji * */
  emoji_name: string | null;
}

/**
 * A forum tag as a request gives it: a new tag has no `id` yet, an existing
 * one keeps its own.
 * @see https://docs.discord.com/developers/resources/channel#forum-tag-object
 */
export type RawForumTagInput = Omit<RawForumTag, 'id'> & { id?: Snowflake };

/**
 * JSON Params (Group DM)
 * @see https://docs.discord.com/developers/resources/channel#modify-channel-json-params-group-dm
 */
export interface ModifyGroupDmJSONParams {
  /** 1-100 character channel name */
  name?: string;
}

/**
 * JSON Params (Guild channel)
 * @see https://docs.discord.com/developers/resources/channel#modify-channel-json-params-guild-channel
 */
export interface ModifyGuildChannelJSONParams {
  /** 1-100 character channel name */
  name?: string;
  /** the type of channel; only conversion between text and announcement is supported and only in guilds with the "NEWS" feature */
  type?: ChannelType;
  /** the position of the channel in the left-hand listing (channels with the same position are sorted by id) */
  position?: number | null;
  /** 0-1024 character channel topic (0-4096 characters for `GUILD_FORUM` and `GUILD_MEDIA` channels) */
  topic?: string | null;
  /** whether the channel is age-restricted */
  nsfw?: boolean | null;
  /** amount of seconds a user has to wait before sending another message (0-21600); bots, as well as users with the permission `BYPASS_SLOWMODE`, are unaffected */
  rate_limit_per_user?: number | null;
  /** the bitrate (in bits per second) of the voice or stage channel; min 8000 */
  bitrate?: number | null;
  /** the user limit of the voice or stage channel, max 99 for voice channels and 10,000 for stage channels (0 refers to no limit) */
  user_limit?: number | null;
  /** channel or category-specific permissions */
  permission_overwrites?: Partial<RawPermissionOverwrite>[] | null;
  /** id of the new parent category for a channel */
  parent_id?: Snowflake | null;
  /** channel voice region id, automatic when set to null */
  rtc_region?: string | null;
  /** the camera video quality mode of the voice channel */
  video_quality_mode?: VideoQualityMode | null;
  /** the default duration that the clients use (not the API) for newly created threads in the channel, in minutes, to automatically archive the thread after recent activity */
  default_auto_archive_duration?: number | null;
  /** channel flags combined as a bitfield. */
  flags?: number;
  /** the set of tags that can be used in a `GUILD_FORUM` or a `GUILD_MEDIA` channel; limited to 20 */
  available_tags?: RawForumTagInput[];
  /** the emoji to show in the add reaction button on a thread in a `GUILD_FORUM` or a `GUILD_MEDIA` channel */
  default_reaction_emoji?: RawDefaultReaction | null;
  /** the initial `rate_limit_per_user` to set on newly created threads in a channel. this field is copied to the thread at creation time and does not live update. */
  default_thread_rate_limit_per_user?: number;
  /** the default sort order type used to order posts in `GUILD_FORUM` and `GUILD_MEDIA` channels */
  default_sort_order?: ForumSortOrderType | null;
  /** the default forum layout type used to display posts in `GUILD_FORUM` channels */
  default_forum_layout?: ForumLayoutType;
}

/**
 * JSON Params (Thread)
 * @see https://docs.discord.com/developers/resources/channel#modify-channel-json-params-thread
 */
export interface ModifyThreadJSONParams {
  /** 1-100 character channel name */
  name?: string;
  /** whether the thread is archived */
  archived?: boolean;
  /** the thread will stop showing in the channel list after `auto_archive_duration` minutes of inactivity, can be set to: 60, 1440, 4320, 10080 */
  auto_archive_duration?: number;
  /** whether the thread is locked; when a thread is locked, only users with MANAGE_THREADS can unarchive it */
  locked?: boolean;
  /** whether non-moderators can add other non-moderators to a thread; only available on private threads */
  invitable?: boolean;
  /** amount of seconds a user has to wait before sending another message (0-21600); bots, as well as users with the permission `BYPASS_SLOWMODE`, are unaffected */
  rate_limit_per_user?: number | null;
  /** channel flags combined as a bitfield; `PINNED` can only be set for threads in forum and media channels */
  flags?: number;
  /** the IDs of the set of tags that have been applied to a thread in a `GUILD_FORUM` or a `GUILD_MEDIA` channel; limited to 5 */
  applied_tags?: Snowflake[];
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/channel#json-params
 */
export interface SetVoiceChannelStatusJSONParams {
  /** new voice channel status (up to 500 characters) */
  status: string | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/channel#edit-channel-permissions-json-params
 */
export interface EditChannelPermissionsJSONParams {
  /** the bitwise value of all allowed permissions (default `"0"`) */
  allow?: string | null;
  /** the bitwise value of all disallowed permissions (default `"0"`) */
  deny?: string | null;
  /** 0 for a role or 1 for a member */
  type: PermissionOverwriteType;
}

/**
 * JSON/Form Params
 * @see https://docs.discord.com/developers/resources/channel#create-channel-invite-jsonform-params
 */
export interface CreateChannelInviteJSONParams {
  /** duration of invite in seconds before expiry, or 0 for never. between 0 and 604800 (7 days) */
  max_age?: number;
  /** max number of uses or 0 for unlimited. between 0 and 100 */
  max_uses?: number;
  /** whether this invite only grants temporary membership */
  temporary?: boolean;
  /** if true, don't try to reuse a similar invite (useful for creating many unique one time use invites) */
  unique?: boolean;
  /** the type of target for this voice channel invite */
  target_type?: InviteTargetType;
  /** the id of the user whose stream to display for this invite, required if `target_type` is 1, the user must be streaming in the channel */
  target_user_id?: Snowflake;
  /** the id of the embedded application to open for this invite, required if `target_type` is 2, the application must have the `EMBEDDED` flag */
  target_application_id?: Snowflake;
  /** an array of IDs of all users able to see and accept this invite. Max of 1000 IDs */
  target_user_ids?: Snowflake[];
  /** JSON-encoded body of non-file params, only for `multipart/form-data` requests. */
  payload_json?: string;
  /** the role ID(s) for roles in the guild given to the users that accept this invite */
  role_ids?: Snowflake[];
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/channel#follow-announcement-channel-json-params
 */
export interface FollowAnnouncementChannelJSONParams {
  /** id of target channel */
  webhook_channel_id: Snowflake;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/channel#group-dm-add-recipient-json-params
 */
export interface GroupDmAddRecipientJSONParams {
  /** access token of a user that has granted your app the `gdm.join` scope */
  access_token: string;
  /** nickname of the user being added */
  nick: string;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/channel#start-thread-from-message-json-params
 */
export interface StartThreadFromMessageJSONParams {
  /** 1-100 character channel name */
  name: string;
  /** the thread will stop showing in the channel list after `auto_archive_duration` minutes of inactivity, can be set to: 60, 1440, 4320, 10080 */
  auto_archive_duration?: number;
  /** amount of seconds a user has to wait before sending another message (0-21600) */
  rate_limit_per_user?: number | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/channel#start-thread-without-message-json-params
 */
export interface StartThreadWithoutMessageJSONParams {
  /** 1-100 character channel name */
  name: string;
  /** the thread will stop showing in the channel list after `auto_archive_duration` minutes of inactivity, can be set to: 60, 1440, 4320, 10080 */
  auto_archive_duration?: number;
  /** the type of thread to create */
  type?: ChannelType;
  /** whether non-moderators can add other non-moderators to a thread; only available when creating a private thread */
  invitable?: boolean;
  /** amount of seconds a user has to wait before sending another message (0-21600) */
  rate_limit_per_user?: number | null;
}

/**
 * JSON/Form Params
 * @see https://docs.discord.com/developers/resources/channel#start-thread-in-forum-or-media-channel-jsonform-params
 */
export interface StartThreadInForumOrMediaChannelJSONParams {
  /** 1-100 character channel name */
  name: string;
  /** duration in minutes to automatically archive the thread after recent activity, can be set to: 60, 1440, 4320, 10080 */
  auto_archive_duration?: number;
  /** amount of seconds a user has to wait before sending another message (0-21600) */
  rate_limit_per_user?: number | null;
  /** contents of the first message in the forum/media thread */
  message: RawForumAndMediaThreadMessageParams;
  /** the IDs of the set of tags that have been applied to a thread in a `GUILD_FORUM` or a `GUILD_MEDIA` channel */
  applied_tags?: Snowflake[];
  /** JSON-encoded body of non-file params, only for `multipart/form-data` requests. See Uploading Files */
  payload_json?: string;
}

/**
 * Forum and Media Thread Message Params Object
 * @see https://docs.discord.com/developers/resources/channel#start-thread-in-forum-or-media-channel-forum-and-media-thread-message-params-object
 */
export interface RawForumAndMediaThreadMessageParams {
  /** Message contents (up to 2000 characters) */
  content?: string;
  /** Up to 10 `rich` embeds (up to 6000 characters) */
  embeds?: RawEmbed[];
  /** Allowed mentions for the message */
  allowed_mentions?: RawAllowedMentions;
  /** Components to include with the message */
  components?: RawComponent[];
  /** IDs of up to 3 stickers in the server to send in the message */
  sticker_ids?: Snowflake[];
  /** Metadata for the attachments. See Uploading Files */
  attachments?: Partial<RawAttachmentRequest>[];
  /** Message flags combined as a bitfield (only `SUPPRESS_EMBEDS` and `SUPPRESS_NOTIFICATIONS` can be set) */
  flags?: number;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/channel#get-thread-member-query-string-params
 */
export interface GetThreadMemberQuery {
  /** Whether to include a guild member object for the thread member */
  with_member?: boolean;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/channel#list-thread-members-query-string-params
 */
export interface ListThreadMembersQuery {
  /** Whether to include a guild member object for each thread member */
  with_member?: boolean;
  /** Get thread members after this user ID */
  after?: Snowflake;
  /** Max number of thread members to return (1-100). Defaults to 100. */
  limit?: number;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/channel#list-public-archived-threads-query-string-params
 */
export interface ListPublicArchivedThreadsQuery {
  /** returns threads archived before this timestamp */
  before?: ISO8601Timestamp;
  /** optional maximum number of threads to return */
  limit?: number;
}

/**
 * Response Body
 * @see https://docs.discord.com/developers/resources/channel#list-public-archived-threads-response-body
 */
export interface ListPublicArchivedThreadsResponse {
  /** the public, archived threads */
  threads: RawChannel[];
  /** a thread member object for each returned thread the current user has joined */
  members: RawThreadMember[];
  /** whether there are potentially additional threads that could be returned on a subsequent call */
  has_more: boolean;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/channel#list-private-archived-threads-query-string-params
 */
export interface ListPrivateArchivedThreadsQuery {
  /** returns threads archived before this timestamp */
  before?: ISO8601Timestamp;
  /** optional maximum number of threads to return */
  limit?: number;
}

/**
 * Response Body
 * @see https://docs.discord.com/developers/resources/channel#list-private-archived-threads-response-body
 */
export interface ListPrivateArchivedThreadsResponse {
  /** the private, archived threads */
  threads: RawChannel[];
  /** a thread member object for each returned thread the current user has joined */
  members: RawThreadMember[];
  /** whether there are potentially additional threads that could be returned on a subsequent call */
  has_more: boolean;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/channel#list-joined-private-archived-threads-query-string-params
 */
export interface ListJoinedPrivateArchivedThreadsQuery {
  /** returns threads before this id */
  before?: Snowflake;
  /** optional maximum number of threads to return */
  limit?: number;
}

/**
 * Response Body
 * @see https://docs.discord.com/developers/resources/channel#list-joined-private-archived-threads-response-body
 */
export interface ListJoinedPrivateArchivedThreadsResponse {
  /** the private, archived threads the current user has joined */
  threads: RawChannel[];
  /** a thread member object for each returned thread the current user has joined */
  members: RawThreadMember[];
  /** whether there are potentially additional threads that could be returned on a subsequent call */
  has_more: boolean;
}

/**
 * The `type` of a permission overwrite.
 * @see https://docs.discord.com/developers/resources/channel#overwrite-object-overwrite-structure
 */
export const PermissionOverwriteType = {
  Role: 0,
  Member: 1,
} as const;
export type PermissionOverwriteType =
  (typeof PermissionOverwriteType)[keyof typeof PermissionOverwriteType];

/**
 * What Modify Channel accepts: it depends on the kind of channel.
 * @see https://docs.discord.com/developers/resources/channel#modify-channel
 */
export type ModifyChannelJSONParams =
  | ModifyGroupDmJSONParams
  | ModifyGuildChannelJSONParams
  | ModifyThreadJSONParams;
