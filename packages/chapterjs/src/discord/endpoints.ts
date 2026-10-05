// Every REST endpoint of the Discord API: method, path and the types of what
// it takes and returns, as described by the official documentation. Nothing
// here sends a request: the REST client does, from these descriptions.

import { endpoint } from './endpoint.js';
import type {
  EditCurrentApplicationJSONParams,
  RawActivityInstance,
  RawApplication,
} from './types/application.js';
import type {
  BulkOverwriteGuildApplicationCommandsJSONParams,
  CreateGlobalApplicationCommandJSONParams,
  CreateGuildApplicationCommandJSONParams,
  EditApplicationCommandPermissionsJSONParams,
  EditGlobalApplicationCommandJSONParams,
  EditGuildApplicationCommandJSONParams,
  GetGlobalApplicationCommandsQuery,
  GetGuildApplicationCommandsQuery,
  RawApplicationCommand,
  RawGuildApplicationCommandPermissions,
} from './types/application-command.js';
import type { RawApplicationRoleConnectionMetadata } from './types/application-role-connection-metadata.js';
import type { GetGuildAuditLogQuery, RawAuditLog } from './types/audit-log.js';
import type {
  CreateAutoModerationRuleJSONParams,
  ModifyAutoModerationRuleJSONParams,
  RawAutoModerationRule,
} from './types/auto-moderation.js';
import type {
  CreateChannelInviteJSONParams,
  EditChannelPermissionsJSONParams,
  FollowAnnouncementChannelJSONParams,
  GetThreadMemberQuery,
  GroupDmAddRecipientJSONParams,
  ListJoinedPrivateArchivedThreadsQuery,
  ListJoinedPrivateArchivedThreadsResponse,
  ListPrivateArchivedThreadsQuery,
  ListPrivateArchivedThreadsResponse,
  ListPublicArchivedThreadsQuery,
  ListPublicArchivedThreadsResponse,
  ListThreadMembersQuery,
  ModifyChannelJSONParams,
  RawChannel,
  RawFollowedChannel,
  RawThreadMember,
  SetVoiceChannelStatusJSONParams,
  StartThreadFromMessageJSONParams,
  StartThreadInForumOrMediaChannelJSONParams,
  StartThreadWithoutMessageJSONParams,
} from './types/channel.js';
import type { Snowflake } from './types/common.js';
import type {
  CreateApplicationEmojiJSONParams,
  CreateGuildEmojiJSONParams,
  ModifyApplicationEmojiJSONParams,
  ModifyGuildEmojiJSONParams,
  RawEmoji,
} from './types/emoji.js';
import type {
  CreateTestEntitlementJSONParams,
  ListEntitlementsQuery,
  RawEntitlement,
} from './types/entitlement.js';
import type { RawGatewayBot } from './types/gateway.js';
import type {
  AddGuildMemberJSONParams,
  BeginGuildPruneJSONParams,
  BulkGuildBanJSONParams,
  CreateGuildBanJSONParams,
  CreateGuildChannelJSONParams,
  CreateGuildRoleJSONParams,
  GetGuildBansQuery,
  GetGuildPruneCountQuery,
  GetGuildQuery,
  ListActiveGuildThreadsResponse,
  ListGuildMembersQuery,
  ModifyCurrentMemberJSONParams,
  ModifyGuildChannelPositionsJSONParams,
  ModifyGuildIncidentActionsJSONParams,
  ModifyGuildJSONParams,
  ModifyGuildMemberJSONParams,
  ModifyGuildOnboardingJSONParams,
  ModifyGuildRoleJSONParams,
  ModifyGuildRolePositionsJSONParams,
  ModifyGuildWelcomeScreenJSONParams,
  RawBan,
  RawBulkBanResponse,
  RawGuild,
  RawGuildMember,
  RawGuildOnboarding,
  RawGuildPreview,
  RawGuildWidget,
  RawGuildWidgetSettings,
  RawIncidentsData,
  RawIntegration,
  RawWelcomeScreen,
  SearchGuildMembersQuery,
} from './types/guild.js';
import type {
  CreateGuildScheduledEventJSONParams,
  GetGuildScheduledEventQuery,
  GetGuildScheduledEventUsersQuery,
  ListScheduledEventsForGuildQuery,
  ModifyGuildScheduledEventJSONParams,
  RawGuildScheduledEvent,
  RawGuildScheduledEventUser,
} from './types/guild-scheduled-event.js';
import type {
  CreateGuildTemplateJSONParams,
  ModifyGuildTemplateJSONParams,
  RawGuildTemplate,
} from './types/guild-template.js';
import type {
  CreateInteractionResponseQuery,
  RawInteractionCallbackResponse,
  RawInteractionResponse,
} from './types/interaction.js';
import type {
  BulkAddTargetUsersJSONParams,
  BulkDeleteTargetUsersJSONParams,
  GetInviteQuery,
  RawInvite,
  RawInviteTargetUsersJob,
} from './types/invite.js';
import type {
  BulkDeleteMessagesJSONParams,
  CreateMessageJSONParams,
  EditMessageJSONParams,
  GetChannelMessagesQuery,
  GetChannelPinsQuery,
  GetChannelPinsResponse,
  GetReactionsQuery,
  RawMessage,
  SearchGuildMessagesQuery,
  SearchGuildMessagesResponse,
} from './types/message.js';
import type { GetCurrentAuthorizationInformationResponse } from './types/oauth2.js';
import type { RawRole } from './types/permissions.js';
import type {
  GetAnswerVotersQuery,
  GetAnswerVotersResponse,
} from './types/poll.js';
import type { RawSku } from './types/sku.js';
import type {
  CreateGuildSoundboardSoundJSONParams,
  ListGuildSoundboardSoundsResponse,
  ModifyGuildSoundboardSoundJSONParams,
  RawSoundboardSound,
  SendSoundboardSoundJSONParams,
} from './types/soundboard.js';
import type {
  CreateStageInstanceJSONParams,
  ModifyStageInstanceJSONParams,
  RawStageInstance,
} from './types/stage-instance.js';
import type {
  CreateGuildStickerJSONParams,
  ListStickerPacksResponse,
  ModifyGuildStickerJSONParams,
  RawSticker,
  RawStickerPack,
} from './types/sticker.js';
import type {
  ListSkuSubscriptionsQuery,
  RawSubscription,
} from './types/subscription.js';
import type {
  CreateDmJSONParams,
  CreateGroupDmJSONParams,
  GetCurrentUserGuildsQuery,
  ModifyCurrentUserJSONParams,
  RawApplicationRoleConnection,
  RawConnection,
  RawUser,
  UpdateCurrentUserApplicationRoleConnectionJSONParams,
} from './types/user.js';
import type {
  ModifyCurrentUserVoiceStateJSONParams,
  ModifyUserVoiceStateJSONParams,
  RawVoiceRegion,
  RawVoiceState,
} from './types/voice.js';
import type {
  CreateWebhookJSONParams,
  DeleteWebhookMessageQuery,
  EditWebhookMessageJSONParams,
  EditWebhookMessageQuery,
  ExecuteWebhookJSONParams,
  ExecuteWebhookQuery,
  GetWebhookMessageQuery,
  ModifyWebhookJSONParams,
  RawWebhook,
} from './types/webhook.js';

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/user
// --------------------------------------------------------------------------

/**
 * Returns the user object of the requester's account. For OAuth2, this requires the `identify` scope, which will return the object *without* an email, and optionally the `email` scope, which returns the object *with* an email if the user has one.
 * @see https://docs.discord.com/developers/resources/user#get-current-user
 */
export const GetCurrentUser = endpoint<{ result: RawUser }>()(
  'GET',
  '/users/@me'
);

/**
 * Returns a user object for a given user ID.
 * @see https://docs.discord.com/developers/resources/user#get-user
 */
export const GetUser = endpoint<{ result: RawUser }>()(
  'GET',
  '/users/{user.id}'
);

/**
 * Modify the requester's user account settings. Returns a user object on success. Fires a User Update Gateway event.
 * @see https://docs.discord.com/developers/resources/user#modify-current-user
 */
export const ModifyCurrentUser = endpoint<{
  result: RawUser;
  body: ModifyCurrentUserJSONParams;
}>()('PATCH', '/users/@me');

/**
 * Returns a list of partial guild objects the current user is a member of. For OAuth2, requires the `guilds` scope.
 * @see https://docs.discord.com/developers/resources/user#get-current-user-guilds
 */
export const GetCurrentUserGuilds = endpoint<{
  result: RawGuild[];
  query: GetCurrentUserGuildsQuery;
}>()('GET', '/users/@me/guilds');

/**
 * Returns a guild member object for the current user. Requires the `guilds.members.read` OAuth2 scope.
 * @see https://docs.discord.com/developers/resources/user#get-current-user-guild-member
 */
export const GetCurrentUserGuildMember = endpoint<{ result: RawGuildMember }>()(
  'GET',
  '/users/@me/guilds/{guild.id}/member'
);

/**
 * Leave a guild. Returns a 204 empty response on success. Fires a Guild Delete Gateway event and a Guild Member Remove Gateway event.
 * @see https://docs.discord.com/developers/resources/user#leave-guild
 */
export const LeaveGuild = endpoint<{}>()(
  'DELETE',
  '/users/@me/guilds/{guild.id}'
);

/**
 * Create a new DM channel with a user. Returns a DM channel object (if one already exists, it will be returned instead).
 * @see https://docs.discord.com/developers/resources/user#create-dm
 */
export const CreateDm = endpoint<{
  result: RawChannel;
  body: CreateDmJSONParams;
}>()('POST', '/users/@me/channels');

/**
 * Create a new group DM channel with multiple users. Returns a DM channel object. This endpoint was intended to be used with the now-deprecated GameBridge SDK. Fires a Channel Create Gateway event.
 * @see https://docs.discord.com/developers/resources/user#create-group-dm
 */
export const CreateGroupDm = endpoint<{
  result: RawChannel;
  body: CreateGroupDmJSONParams;
}>()('POST', '/users/@me/channels');

/**
 * Returns a list of connection objects. Requires the `connections` OAuth2 scope.
 * @see https://docs.discord.com/developers/resources/user#get-current-user-connections
 */
export const GetCurrentUserConnections = endpoint<{
  result: RawConnection[];
}>()('GET', '/users/@me/connections');

/**
 * Returns the application role connection for the user. Requires an OAuth2 access token with `role_connections.write` scope for the application specified in the path.
 * @see https://docs.discord.com/developers/resources/user#get-current-user-application-role-connection
 */
export const GetCurrentUserApplicationRoleConnection = endpoint<{
  result: RawApplicationRoleConnection;
}>()('GET', '/users/@me/applications/{application.id}/role-connection');

/**
 * Updates and returns the application role connection for the user. Requires an OAuth2 access token with `role_connections.write` scope for the application specified in the path.
 * @see https://docs.discord.com/developers/resources/user#update-current-user-application-role-connection
 */
export const UpdateCurrentUserApplicationRoleConnection = endpoint<{
  result: RawApplicationRoleConnection;
  body: UpdateCurrentUserApplicationRoleConnectionJSONParams;
}>()('PUT', '/users/@me/applications/{application.id}/role-connection');

/**
 * Deletes the application role connection for the user. Requires an OAuth2 access token with `role_connections.write` scope for the application specified in the path.
 * @see https://docs.discord.com/developers/resources/user#delete-current-user-application-role-connection
 */
export const DeleteCurrentUserApplicationRoleConnection = endpoint<{}>()(
  'DELETE',
  '/users/@me/applications/{application.id}/role-connection'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/guild
// --------------------------------------------------------------------------

/**
 * Returns the guild object for the given id. If `with_counts` is set to `true`, this endpoint will also return `approximate_member_count` and `approximate_presence_count` for the guild.
 * @see https://docs.discord.com/developers/resources/guild#get-guild
 */
export const GetGuild = endpoint<{ result: RawGuild; query: GetGuildQuery }>()(
  'GET',
  '/guilds/{guild.id}'
);

/**
 * Returns the guild preview object for the given id.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-preview
 */
export const GetGuildPreview = endpoint<{ result: RawGuildPreview }>()(
  'GET',
  '/guilds/{guild.id}/preview'
);

/**
 * Modify a guild's settings. Requires the `MANAGE_GUILD` permission. Returns the updated guild object on success. Fires a Guild Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild
 */
export const ModifyGuild = endpoint<{
  result: RawGuild;
  body: ModifyGuildJSONParams;
}>()('PATCH', '/guilds/{guild.id}');

/**
 * Returns a list of guild channel objects. Does not include threads.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-channels
 */
export const GetGuildChannels = endpoint<{ result: RawChannel[] }>()(
  'GET',
  '/guilds/{guild.id}/channels'
);

/**
 * Create a new channel object for the guild. Requires the `MANAGE_CHANNELS` permission. If setting permission overwrites, only permissions your bot has in the guild can be allowed/denied. Setting `MANAGE_ROLES` permission in channels is only possible for guild administrators. Returns the new channel object on success. Fires a Channel Create Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#create-guild-channel
 */
export const CreateGuildChannel = endpoint<{
  result: RawChannel;
  body: CreateGuildChannelJSONParams;
}>()('POST', '/guilds/{guild.id}/channels');

/**
 * Modify the positions of a set of channel objects for the guild. Requires `MANAGE_CHANNELS` permission. Returns a 204 empty response on success. Fires multiple Channel Update Gateway events.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-channel-positions
 */
export const ModifyGuildChannelPositions = endpoint<{
  body: ModifyGuildChannelPositionsJSONParams[];
}>()('PATCH', '/guilds/{guild.id}/channels');

/**
 * Returns all active threads in the guild, including public and private threads. Threads are ordered by their `id`, in descending order.
 * @see https://docs.discord.com/developers/resources/guild#list-active-guild-threads
 */
export const ListActiveGuildThreads = endpoint<{
  result: ListActiveGuildThreadsResponse;
}>()('GET', '/guilds/{guild.id}/threads/active');

/**
 * Returns a guild member object for the specified user.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-member
 */
export const GetGuildMember = endpoint<{ result: RawGuildMember }>()(
  'GET',
  '/guilds/{guild.id}/members/{user.id}'
);

/**
 * Returns a list of guild member objects that are members of the guild.
 * @see https://docs.discord.com/developers/resources/guild#list-guild-members
 */
export const ListGuildMembers = endpoint<{
  result: RawGuildMember[];
  query: ListGuildMembersQuery;
}>()('GET', '/guilds/{guild.id}/members');

/**
 * Returns a list of guild member objects whose username or nickname starts with a provided string.
 * @see https://docs.discord.com/developers/resources/guild#search-guild-members
 */
export const SearchGuildMembers = endpoint<{
  result: RawGuildMember[];
  query: SearchGuildMembersQuery;
}>()('GET', '/guilds/{guild.id}/members/search');

/**
 * Adds a user to the guild, provided you have a valid oauth2 access token for the user with the `guilds.join` scope. Returns a 201 Created with the guild member as the body, or 204 No Content if the user is already a member of the guild. Fires a Guild Member Add Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#add-guild-member
 */
export const AddGuildMember = endpoint<{
  result: RawGuildMember | undefined;
  body: AddGuildMemberJSONParams;
}>()('PUT', '/guilds/{guild.id}/members/{user.id}');

/**
 * Modify attributes of a guild member. Returns a 200 OK with the guild member as the body. Fires a Guild Member Update Gateway event. If the `channel_id` is set to null, this will force the target user to be disconnected from voice.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-member
 */
export const ModifyGuildMember = endpoint<{
  result: RawGuildMember;
  body: ModifyGuildMemberJSONParams;
}>()('PATCH', '/guilds/{guild.id}/members/{user.id}');

/**
 * Modifies the current member in a guild. Returns a 200 with the updated member object on success. Fires a Guild Member Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#modify-current-member
 */
export const ModifyCurrentMember = endpoint<{
  result: RawGuildMember;
  body: ModifyCurrentMemberJSONParams;
}>()('PATCH', '/guilds/{guild.id}/members/@me');

/**
 * Adds a role to a guild member. Requires the `MANAGE_ROLES` permission. Returns a 204 empty response on success. Fires a Guild Member Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#add-guild-member-role
 */
export const AddGuildMemberRole = endpoint<{}>()(
  'PUT',
  '/guilds/{guild.id}/members/{user.id}/roles/{role.id}'
);

/**
 * Removes a role from a guild member. Requires the `MANAGE_ROLES` permission. Returns a 204 empty response on success. Fires a Guild Member Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#remove-guild-member-role
 */
export const RemoveGuildMemberRole = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/members/{user.id}/roles/{role.id}'
);

/**
 * Remove a member from a guild. Requires `KICK_MEMBERS` permission. Returns a 204 empty response on success. Fires a Guild Member Remove Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#remove-guild-member
 */
export const RemoveGuildMember = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/members/{user.id}'
);

/**
 * Returns a list of ban objects for the users banned from this guild. Requires the `BAN_MEMBERS` or `VIEW_AUDIT_LOG` permission.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-bans
 */
export const GetGuildBans = endpoint<{
  result: RawBan[];
  query: GetGuildBansQuery;
}>()('GET', '/guilds/{guild.id}/bans');

/**
 * Returns a ban object for the given user or a 404 not found if the ban cannot be found. Requires the `BAN_MEMBERS` or `VIEW_AUDIT_LOG` permission.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-ban
 */
export const GetGuildBan = endpoint<{ result: RawBan }>()(
  'GET',
  '/guilds/{guild.id}/bans/{user.id}'
);

/**
 * Create a guild ban, and optionally delete previous messages sent by the banned user. Requires the `BAN_MEMBERS` permission. Returns a 204 empty response on success. Fires a Guild Ban Add Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#create-guild-ban
 */
export const CreateGuildBan = endpoint<{ body: CreateGuildBanJSONParams }>()(
  'PUT',
  '/guilds/{guild.id}/bans/{user.id}'
);

/**
 * Remove the ban for a user. Requires the `BAN_MEMBERS` permissions. Returns a 204 empty response on success. Fires a Guild Ban Remove Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#remove-guild-ban
 */
export const RemoveGuildBan = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/bans/{user.id}'
);

/**
 * Ban up to 200 users from a guild, and optionally delete previous messages sent by the banned users. Requires both the `BAN_MEMBERS` and `MANAGE_GUILD` permissions. Returns a 200 response on success, including the fields `banned_users` with the IDs of the banned users and `failed_users` with IDs that could not be banned or were already banned.
 * @see https://docs.discord.com/developers/resources/guild#bulk-guild-ban
 */
export const BulkGuildBan = endpoint<{
  result: RawBulkBanResponse;
  body: BulkGuildBanJSONParams;
}>()('POST', '/guilds/{guild.id}/bulk-ban');

/**
 * Returns a list of role objects for the guild.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-roles
 */
export const GetGuildRoles = endpoint<{ result: RawRole[] }>()(
  'GET',
  '/guilds/{guild.id}/roles'
);

/**
 * Returns a role object for the specified role.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-role
 */
export const GetGuildRole = endpoint<{ result: RawRole }>()(
  'GET',
  '/guilds/{guild.id}/roles/{role.id}'
);

/**
 * Returns a map of role IDs to the number of members with the role. Does not include the @everyone role.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-role-member-counts
 */
export const GetGuildRoleMemberCounts = endpoint<{
  result: Record<Snowflake, number>;
}>()('GET', '/guilds/{guild.id}/roles/member-counts');

/**
 * Create a new role for the guild. Requires the `MANAGE_ROLES` permission. Returns the new role object on success. Fires a Guild Role Create Gateway event. All JSON params are optional.
 * @see https://docs.discord.com/developers/resources/guild#create-guild-role
 */
export const CreateGuildRole = endpoint<{
  result: RawRole;
  body: CreateGuildRoleJSONParams;
}>()('POST', '/guilds/{guild.id}/roles');

/**
 * Modify the positions of a set of role objects for the guild. Requires the `MANAGE_ROLES` permission. Returns a list of all of the guild's role objects on success. Fires multiple Guild Role Update Gateway events.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-role-positions
 */
export const ModifyGuildRolePositions = endpoint<{
  result: RawRole[];
  body: ModifyGuildRolePositionsJSONParams[];
}>()('PATCH', '/guilds/{guild.id}/roles');

/**
 * Modify a guild role. Requires the `MANAGE_ROLES` permission. Returns the updated role on success. Fires a Guild Role Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-role
 */
export const ModifyGuildRole = endpoint<{
  result: RawRole;
  body: ModifyGuildRoleJSONParams;
}>()('PATCH', '/guilds/{guild.id}/roles/{role.id}');

/**
 * Delete a guild role. Requires the `MANAGE_ROLES` permission. Returns a 204 empty response on success. Fires a Guild Role Delete Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#delete-guild-role
 */
export const DeleteGuildRole = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/roles/{role.id}'
);

/**
 * Returns an object with one `pruned` key indicating the number of members that would be removed in a prune operation. Requires the `MANAGE_GUILD` and `KICK_MEMBERS` permissions, unless the guild has the `PRUNE_REQUIRES_ADMIN` guild feature, in which case it requires the `ADMINISTRATOR` permission.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-prune-count
 */
export const GetGuildPruneCount = endpoint<{
  result: { pruned: number };
  query: GetGuildPruneCountQuery;
}>()('GET', '/guilds/{guild.id}/prune');

/**
 * Begin a prune operation. Requires the `MANAGE_GUILD` and `KICK_MEMBERS` permissions, unless the guild has the `PRUNE_REQUIRES_ADMIN` guild feature, in which case it requires the `ADMINISTRATOR` permission. Returns an object with one `pruned` key indicating the number of members that were removed in the prune operation. For large guilds it's recommended to set the `compute_prune_count` option to `false`, forcing `pruned` to `null`. Fires multiple Guild Member Remove Gateway events.
 * @see https://docs.discord.com/developers/resources/guild#begin-guild-prune
 */
export const BeginGuildPrune = endpoint<{
  result: { pruned: number | null };
  body: BeginGuildPruneJSONParams;
}>()('POST', '/guilds/{guild.id}/prune');

/**
 * Returns a list of voice region objects for the guild. Unlike the similar `/voice` route, this returns VIP servers when the guild is VIP-enabled.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-voice-regions
 */
export const GetGuildVoiceRegions = endpoint<{ result: RawVoiceRegion[] }>()(
  'GET',
  '/guilds/{guild.id}/regions'
);

/**
 * Returns a list of invite objects. Requires the `MANAGE_GUILD` or `VIEW_AUDIT_LOG` permission. Invite Metadata is included with the `MANAGE_GUILD` permission.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-invites
 */
export const GetGuildInvites = endpoint<{ result: RawInvite[] }>()(
  'GET',
  '/guilds/{guild.id}/invites'
);

/**
 * Returns a list of integration objects for the guild. Requires the `MANAGE_GUILD` permission.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-integrations
 */
export const GetGuildIntegrations = endpoint<{ result: RawIntegration[] }>()(
  'GET',
  '/guilds/{guild.id}/integrations'
);

/**
 * Delete the attached integration object for the guild. Deletes any associated webhooks and kicks the associated bot if there is one. Requires the `MANAGE_GUILD` permission. Returns a 204 empty response on success. Fires Guild Integrations Update and Integration Delete Gateway events.
 * @see https://docs.discord.com/developers/resources/guild#delete-guild-integration
 */
export const DeleteGuildIntegration = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/integrations/{integration.id}'
);

/**
 * Returns a guild widget settings object. Requires the `MANAGE_GUILD` permission.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-widget-settings
 */
export const GetGuildWidgetSettings = endpoint<{
  result: RawGuildWidgetSettings;
}>()('GET', '/guilds/{guild.id}/widget');

/**
 * Modify a guild widget settings object for the guild. All attributes may be passed in with JSON and modified. Requires the `MANAGE_GUILD` permission. Returns the updated guild widget settings object. Fires a Guild Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-widget
 */
export const ModifyGuildWidget = endpoint<{
  result: RawGuildWidgetSettings;
  body: Partial<RawGuildWidgetSettings>;
}>()('PATCH', '/guilds/{guild.id}/widget');

/**
 * Returns the widget for the guild. Fires an Invite Create Gateway event when an invite channel is defined and a new Invite is generated.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-widget
 */
export const GetGuildWidget = endpoint<{ result: RawGuildWidget }>()(
  'GET',
  '/guilds/{guild.id}/widget.json'
);

/**
 * Returns a partial invite object for guilds with that feature enabled. Requires the `MANAGE_GUILD` permission. `code` will be null if a vanity url for the guild is not set.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-vanity-url
 */
export const GetGuildVanityUrl = endpoint<{ result: RawInvite }>()(
  'GET',
  '/guilds/{guild.id}/vanity-url'
);

/**
 * Returns the Welcome Screen object for the guild. If the welcome screen is not enabled, the `MANAGE_GUILD` permission is required.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-welcome-screen
 */
export const GetGuildWelcomeScreen = endpoint<{ result: RawWelcomeScreen }>()(
  'GET',
  '/guilds/{guild.id}/welcome-screen'
);

/**
 * Modify the guild's Welcome Screen. Requires the `MANAGE_GUILD` permission. Returns the updated Welcome Screen object. May fire a Guild Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-welcome-screen
 */
export const ModifyGuildWelcomeScreen = endpoint<{
  result: RawWelcomeScreen;
  body: ModifyGuildWelcomeScreenJSONParams;
}>()('PATCH', '/guilds/{guild.id}/welcome-screen');

/**
 * Returns the Onboarding object for the guild.
 * @see https://docs.discord.com/developers/resources/guild#get-guild-onboarding
 */
export const GetGuildOnboarding = endpoint<{ result: RawGuildOnboarding }>()(
  'GET',
  '/guilds/{guild.id}/onboarding'
);

/**
 * Modifies the onboarding configuration of the guild. Returns a 200 with the Onboarding object for the guild. Requires the `MANAGE_GUILD` and `MANAGE_ROLES` permissions.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-onboarding
 */
export const ModifyGuildOnboarding = endpoint<{
  result: RawGuildOnboarding;
  body: ModifyGuildOnboardingJSONParams;
}>()('PUT', '/guilds/{guild.id}/onboarding');

/**
 * Modifies the incident actions of the guild. Returns a 200 with the Incidents Data object for the guild. Requires the `MANAGE_GUILD` permission.
 * @see https://docs.discord.com/developers/resources/guild#modify-guild-incident-actions
 */
export const ModifyGuildIncidentActions = endpoint<{
  result: RawIncidentsData;
  body: ModifyGuildIncidentActionsJSONParams;
}>()('PUT', '/guilds/{guild.id}/incident-actions');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/channel
// --------------------------------------------------------------------------

/**
 * Get a channel by ID. Returns a channel object.  If the channel is a thread, a thread member object is included in the returned result.
 * @see https://docs.discord.com/developers/resources/channel#get-channel
 */
export const GetChannel = endpoint<{ result: RawChannel }>()(
  'GET',
  '/channels/{channel.id}'
);

/**
 * Update a channel's settings. Returns a channel on success, and a 400 BAD REQUEST on invalid parameters.
 * @see https://docs.discord.com/developers/resources/channel#modify-channel
 */
export const ModifyChannel = endpoint<{
  result: RawChannel;
  body: ModifyChannelJSONParams;
}>()('PATCH', '/channels/{channel.id}');

/**
 * Set a voice channel's status. Requires the `SET_VOICE_CHANNEL_STATUS` permission, and additionally the `MANAGE_CHANNELS` permission if the current user is not connected to the voice channel. Fires a Voice Channel Status Update Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#set-voice-channel-status
 */
export const SetVoiceChannelStatus = endpoint<{
  body: SetVoiceChannelStatusJSONParams;
}>()('PUT', '/channels/{channel.id}/voice-status');

/**
 * Delete a channel, or close a private message. Requires the `MANAGE_CHANNELS` permission for the guild, or `MANAGE_THREADS` if the channel is a thread. Deleting a category does not delete its child channels; they will have their `parent_id` removed and a Channel Update Gateway event will fire for each of them. Returns a channel object on success. Fires a Channel Delete Gateway event (or Thread Delete if the channel was a thread).
 * @see https://docs.discord.com/developers/resources/channel#deleteclose-channel
 */
export const DeleteCloseChannel = endpoint<{ result: RawChannel }>()(
  'DELETE',
  '/channels/{channel.id}'
);

/**
 * Edit the channel permission overwrites for a user or role in a channel. Only usable for guild channels. Requires the `MANAGE_ROLES` permission. Only permissions your bot has in the guild or parent channel (if applicable) can be allowed/denied (unless your bot has a `MANAGE_ROLES` overwrite in the channel). Returns a 204 empty response on success. Fires a Channel Update Gateway event. For more information about permissions, see permissions.
 * @see https://docs.discord.com/developers/resources/channel#edit-channel-permissions
 */
export const EditChannelPermissions = endpoint<{
  body: EditChannelPermissionsJSONParams;
}>()('PUT', '/channels/{channel.id}/permissions/{overwrite.id}');

/**
 * Returns a list of invite objects (with invite metadata) for the channel. Only usable for guild channels. Requires the `MANAGE_CHANNELS` permission.
 * @see https://docs.discord.com/developers/resources/channel#get-channel-invites
 */
export const GetChannelInvites = endpoint<{ result: RawInvite[] }>()(
  'GET',
  '/channels/{channel.id}/invites'
);

/**
 * Create a new invite object for the channel. Only usable for guild channels. Requires the `CREATE_INSTANT_INVITE` permission. All JSON parameters for this route are optional, however the request body is not. If you are not sending any fields, you still have to send an empty JSON object (`{}`). Returns an invite object. Fires an Invite Create Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#create-channel-invite
 */
export const CreateChannelInvite = endpoint<{
  result: RawInvite;
  body: CreateChannelInviteJSONParams;
}>()('POST', '/channels/{channel.id}/invites');

/**
 * Delete a channel permission overwrite for a user or role in a channel. Only usable for guild channels. Requires the `MANAGE_ROLES` permission. Returns a 204 empty response on success. Fires a Channel Update Gateway event. For more information about permissions, see permissions
 * @see https://docs.discord.com/developers/resources/channel#delete-channel-permission
 */
export const DeleteChannelPermission = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/permissions/{overwrite.id}'
);

/**
 * Follow an Announcement Channel to send messages to a target channel. Requires the `MANAGE_WEBHOOKS` permission in the target channel. Returns a followed channel object. Fires a Webhooks Update Gateway event for the target channel.
 * @see https://docs.discord.com/developers/resources/channel#follow-announcement-channel
 */
export const FollowAnnouncementChannel = endpoint<{
  result: RawFollowedChannel;
  body: FollowAnnouncementChannelJSONParams;
}>()('POST', '/channels/{channel.id}/followers');

/**
 * Post a typing indicator for the specified channel, which expires after 10 seconds. Returns a 204 empty response on success. Fires a Typing Start Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#trigger-typing-indicator
 */
export const TriggerTypingIndicator = endpoint<{}>()(
  'POST',
  '/channels/{channel.id}/typing'
);

/**
 * Adds a recipient to a Group DM using their access token.
 * @see https://docs.discord.com/developers/resources/channel#group-dm-add-recipient
 */
export const GroupDmAddRecipient = endpoint<{
  body: GroupDmAddRecipientJSONParams;
}>()('PUT', '/channels/{channel.id}/recipients/{user.id}');

/**
 * Removes a recipient from a Group DM.
 * @see https://docs.discord.com/developers/resources/channel#group-dm-remove-recipient
 */
export const GroupDmRemoveRecipient = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/recipients/{user.id}'
);

/**
 * Creates a new thread from an existing message. Returns a channel on success, and a 400 BAD REQUEST on invalid parameters. Fires a Thread Create and a Message Update Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#start-thread-from-message
 */
export const StartThreadFromMessage = endpoint<{
  result: RawChannel;
  body: StartThreadFromMessageJSONParams;
}>()('POST', '/channels/{channel.id}/messages/{message.id}/threads');

/**
 * Creates a new thread that is not connected to an existing message. Returns a channel on success, and a 400 BAD REQUEST on invalid parameters. Fires a Thread Create Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#start-thread-without-message
 */
export const StartThreadWithoutMessage = endpoint<{
  result: RawChannel;
  body: StartThreadWithoutMessageJSONParams;
}>()('POST', '/channels/{channel.id}/threads');

/**
 * Creates a new thread in a forum or a media channel, and sends a message within the created thread. Returns a channel, with a nested message object, on success, and a 400 BAD REQUEST on invalid parameters. Fires a Thread Create and Message Create Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#start-thread-in-forum-or-media-channel
 */
export const StartThreadInForumOrMediaChannel = endpoint<{
  result: RawChannel & { message: RawMessage };
  body: StartThreadInForumOrMediaChannelJSONParams;
}>()('POST', '/channels/{channel.id}/threads');

/**
 * Adds the current user to a thread. Also requires the thread is not archived. Returns a 204 empty response on success. Fires a Thread Members Update and a Thread Create Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#join-thread
 */
export const JoinThread = endpoint<{}>()(
  'PUT',
  '/channels/{channel.id}/thread-members/@me'
);

/**
 * Adds another member to a thread. Requires the ability to send messages in the thread. Also requires the thread is not archived. Returns a 204 empty response if the member is successfully added or was already a member of the thread. Fires a Thread Members Update Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#add-thread-member
 */
export const AddThreadMember = endpoint<{}>()(
  'PUT',
  '/channels/{channel.id}/thread-members/{user.id}'
);

/**
 * Removes the current user from a thread. Also requires the thread is not archived. Returns a 204 empty response on success. Fires a Thread Members Update Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#leave-thread
 */
export const LeaveThread = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/thread-members/@me'
);

/**
 * Removes another member from a thread. Requires the `MANAGE_THREADS` permission, or the creator of the thread if it is a `PRIVATE_THREAD`. Also requires the thread is not archived. Returns a 204 empty response on success. Fires a Thread Members Update Gateway event.
 * @see https://docs.discord.com/developers/resources/channel#remove-thread-member
 */
export const RemoveThreadMember = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/thread-members/{user.id}'
);

/**
 * Returns a thread member object for the specified user if they are a member of the thread, returns a 404 response otherwise.
 * @see https://docs.discord.com/developers/resources/channel#get-thread-member
 */
export const GetThreadMember = endpoint<{
  result: RawThreadMember;
  query: GetThreadMemberQuery;
}>()('GET', '/channels/{channel.id}/thread-members/{user.id}');

/**
 *
 * @see https://docs.discord.com/developers/resources/channel#list-thread-members
 */
export const ListThreadMembers = endpoint<{
  result: RawThreadMember[];
  query: ListThreadMembersQuery;
}>()('GET', '/channels/{channel.id}/thread-members');

/**
 * Returns archived threads in the channel that are public. When called on a `GUILD_TEXT` channel, returns threads of type `PUBLIC_THREAD`. When called on a `GUILD_ANNOUNCEMENT` channel returns threads of type `ANNOUNCEMENT_THREAD`. Threads are ordered by `archive_timestamp`, in descending order. Requires the `READ_MESSAGE_HISTORY` permission.
 * @see https://docs.discord.com/developers/resources/channel#list-public-archived-threads
 */
export const ListPublicArchivedThreads = endpoint<{
  result: ListPublicArchivedThreadsResponse;
  query: ListPublicArchivedThreadsQuery;
}>()('GET', '/channels/{channel.id}/threads/archived/public');

/**
 * Returns archived threads in the channel that are of type `PRIVATE_THREAD`. Threads are ordered by `archive_timestamp`, in descending order. Requires both the `READ_MESSAGE_HISTORY` and `MANAGE_THREADS` permissions.
 * @see https://docs.discord.com/developers/resources/channel#list-private-archived-threads
 */
export const ListPrivateArchivedThreads = endpoint<{
  result: ListPrivateArchivedThreadsResponse;
  query: ListPrivateArchivedThreadsQuery;
}>()('GET', '/channels/{channel.id}/threads/archived/private');

/**
 * Returns archived threads in the channel that are of type `PRIVATE_THREAD`, and the user has joined. Threads are ordered by their `id`, in descending order. Requires the `READ_MESSAGE_HISTORY` permission.
 * @see https://docs.discord.com/developers/resources/channel#list-joined-private-archived-threads
 */
export const ListJoinedPrivateArchivedThreads = endpoint<{
  result: ListJoinedPrivateArchivedThreadsResponse;
  query: ListJoinedPrivateArchivedThreadsQuery;
}>()('GET', '/channels/{channel.id}/users/@me/threads/archived/private');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/message
// --------------------------------------------------------------------------

/**
 * Retrieves the messages in a channel. Returns an array of message objects from newest to oldest on success.
 * @see https://docs.discord.com/developers/resources/message#get-channel-messages
 */
export const GetChannelMessages = endpoint<{
  result: RawMessage[];
  query: GetChannelMessagesQuery;
}>()('GET', '/channels/{channel.id}/messages');

/**
 * Returns a list of messages without the `reactions` key that match a search query in the guild. Requires the `READ_MESSAGE_HISTORY` permission.
 * @see https://docs.discord.com/developers/resources/message#search-guild-messages
 */
export const SearchGuildMessages = endpoint<{
  result: SearchGuildMessagesResponse;
  query: SearchGuildMessagesQuery;
}>()('GET', '/guilds/{guild.id}/messages/search');

/**
 * Retrieves a specific message in the channel. Returns a message object on success.
 * @see https://docs.discord.com/developers/resources/message#get-channel-message
 */
export const GetChannelMessage = endpoint<{ result: RawMessage }>()(
  'GET',
  '/channels/{channel.id}/messages/{message.id}'
);

/**
 *
 * @see https://docs.discord.com/developers/resources/message#create-message
 */
export const CreateMessage = endpoint<{
  result: RawMessage;
  body: CreateMessageJSONParams;
}>()('POST', '/channels/{channel.id}/messages');

/**
 * Crosspost a message in an Announcement Channel to following channels. This endpoint requires the `SEND_MESSAGES` permission, if the current user sent the message, or additionally the `MANAGE_MESSAGES` permission, for all other messages, to be present for the current user.
 * @see https://docs.discord.com/developers/resources/message#crosspost-message
 */
export const CrosspostMessage = endpoint<{ result: RawMessage }>()(
  'POST',
  '/channels/{channel.id}/messages/{message.id}/crosspost'
);

/**
 * Create a reaction for the message. This endpoint requires the `READ_MESSAGE_HISTORY` permission to be present on the current user. Additionally, if nobody else has reacted to the message using this emoji, this endpoint requires the `ADD_REACTIONS` permission to be present on the current user. Returns a 204 empty response on success. Fires a Message Reaction Add Gateway event.
 * @see https://docs.discord.com/developers/resources/message#create-reaction
 */
export const CreateReaction = endpoint<{}>()(
  'PUT',
  '/channels/{channel.id}/messages/{message.id}/reactions/{emoji.id}/@me'
);

/**
 * Delete a reaction the current user has made for the message. Returns a 204 empty response on success. Fires a Message Reaction Remove Gateway event.
 * @see https://docs.discord.com/developers/resources/message#delete-own-reaction
 */
export const DeleteOwnReaction = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/messages/{message.id}/reactions/{emoji.id}/@me'
);

/**
 * Deletes another user's reaction. This endpoint requires the `MANAGE_MESSAGES` permission to be present on the current user. Returns a 204 empty response on success. Fires a Message Reaction Remove Gateway event.
 * @see https://docs.discord.com/developers/resources/message#delete-user-reaction
 */
export const DeleteUserReaction = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/messages/{message.id}/reactions/{emoji.id}/{user.id}'
);

/**
 * Get a list of users that reacted with this emoji. Returns an array of user objects on success.
 * @see https://docs.discord.com/developers/resources/message#get-reactions
 */
export const GetReactions = endpoint<{
  result: RawUser[];
  query: GetReactionsQuery;
}>()(
  'GET',
  '/channels/{channel.id}/messages/{message.id}/reactions/{emoji.id}'
);

/**
 * Deletes all reactions on a message. This endpoint requires the `MANAGE_MESSAGES` permission to be present on the current user. Fires a Message Reaction Remove All Gateway event.
 * @see https://docs.discord.com/developers/resources/message#delete-all-reactions
 */
export const DeleteAllReactions = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/messages/{message.id}/reactions'
);

/**
 * Deletes all the reactions for a given emoji on a message. This endpoint requires the `MANAGE_MESSAGES` permission to be present on the current user. Fires a Message Reaction Remove Emoji Gateway event.
 * @see https://docs.discord.com/developers/resources/message#delete-all-reactions-for-emoji
 */
export const DeleteAllReactionsForEmoji = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/messages/{message.id}/reactions/{emoji.id}'
);

/**
 * Edit a previously sent message. The fields `content`, `embeds`, `flags` and `components` can be edited by the original message author. Other users can only edit `flags` and only if they have the `MANAGE_MESSAGES` permission in the corresponding channel. When specifying flags, ensure to include all previously set flags/bits in addition to ones that you are modifying. Only `flags` documented in the table below may be modified by users (unsupported flag changes are currently ignored without error).
 * @see https://docs.discord.com/developers/resources/message#edit-message
 */
export const EditMessage = endpoint<{
  result: RawMessage;
  body: EditMessageJSONParams;
}>()('PATCH', '/channels/{channel.id}/messages/{message.id}');

/**
 * Delete a message. If operating on a guild channel and trying to delete a message that was not sent by the current user, this endpoint requires the `MANAGE_MESSAGES` permission. Returns a 204 empty response on success. Fires a Message Delete Gateway event.
 * @see https://docs.discord.com/developers/resources/message#delete-message
 */
export const DeleteMessage = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/messages/{message.id}'
);

/**
 * Delete multiple messages in a single request. This endpoint can only be used on guild channels and requires the `MANAGE_MESSAGES` permission. Returns a 204 empty response on success. Fires a Message Delete Bulk Gateway event.
 * @see https://docs.discord.com/developers/resources/message#bulk-delete-messages
 */
export const BulkDeleteMessages = endpoint<{
  body: BulkDeleteMessagesJSONParams;
}>()('POST', '/channels/{channel.id}/messages/bulk-delete');

/**
 * Retrieves the list of pins in a channel. Requires the `VIEW_CHANNEL` permission. If the user is missing the `READ_MESSAGE_HISTORY` permission in the channel, then no pins will be returned.
 * @see https://docs.discord.com/developers/resources/message#get-channel-pins
 */
export const GetChannelPins = endpoint<{
  result: GetChannelPinsResponse;
  query: GetChannelPinsQuery;
}>()('GET', '/channels/{channel.id}/messages/pins');

/**
 * Pin a message in a channel. Requires the `PIN_MESSAGES` permission. Fires a Channel Pins Update Gateway event.
 * @see https://docs.discord.com/developers/resources/message#pin-message
 */
export const PinMessage = endpoint<{}>()(
  'PUT',
  '/channels/{channel.id}/messages/pins/{message.id}'
);

/**
 * Unpin a message in a channel. Requires the `PIN_MESSAGES` permission. Returns a 204 empty response on success. Fires a Channel Pins Update Gateway event.
 * @see https://docs.discord.com/developers/resources/message#unpin-message
 */
export const UnpinMessage = endpoint<{}>()(
  'DELETE',
  '/channels/{channel.id}/messages/pins/{message.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/emoji
// --------------------------------------------------------------------------

/**
 * Returns a list of emoji objects for the given guild. Includes `user` fields if the bot has the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission.
 * @see https://docs.discord.com/developers/resources/emoji#list-guild-emojis
 */
export const ListGuildEmojis = endpoint<{ result: RawEmoji[] }>()(
  'GET',
  '/guilds/{guild.id}/emojis'
);

/**
 * Returns an emoji object for the given guild and emoji IDs. Includes the `user` field if the bot has the `MANAGE_GUILD_EXPRESSIONS` permission, or if the bot created the emoji and has the `CREATE_GUILD_EXPRESSIONS` permission.
 * @see https://docs.discord.com/developers/resources/emoji#get-guild-emoji
 */
export const GetGuildEmoji = endpoint<{ result: RawEmoji }>()(
  'GET',
  '/guilds/{guild.id}/emojis/{emoji.id}'
);

/**
 * Create a new emoji for the guild. Requires the `CREATE_GUILD_EXPRESSIONS` permission. Returns the new emoji object on success. Fires a Guild Emojis Update Gateway event.
 * @see https://docs.discord.com/developers/resources/emoji#create-guild-emoji
 */
export const CreateGuildEmoji = endpoint<{
  result: RawEmoji;
  body: CreateGuildEmojiJSONParams;
}>()('POST', '/guilds/{guild.id}/emojis');

/**
 * Modify the given emoji. For emojis created by the current user, requires either the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission. For other emojis, requires the `MANAGE_GUILD_EXPRESSIONS` permission. Returns the updated emoji object on success. Fires a Guild Emojis Update Gateway event.
 * @see https://docs.discord.com/developers/resources/emoji#modify-guild-emoji
 */
export const ModifyGuildEmoji = endpoint<{
  result: RawEmoji;
  body: ModifyGuildEmojiJSONParams;
}>()('PATCH', '/guilds/{guild.id}/emojis/{emoji.id}');

/**
 * Delete the given emoji. For emojis created by the current user, requires either the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission. For other emojis, requires the `MANAGE_GUILD_EXPRESSIONS` permission. Returns `204 No Content` on success. Fires a Guild Emojis Update Gateway event.
 * @see https://docs.discord.com/developers/resources/emoji#delete-guild-emoji
 */
export const DeleteGuildEmoji = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/emojis/{emoji.id}'
);

/**
 * Returns an object containing a list of emoji objects for the given application under the `items` key. Includes a `user` object for the team member that uploaded the emoji from the app's settings, or for the bot user if uploaded using the API.
 * @see https://docs.discord.com/developers/resources/emoji#list-application-emojis
 */
export const ListApplicationEmojis = endpoint<{
  result: { items: RawEmoji[] };
}>()('GET', '/applications/{application.id}/emojis');

/**
 * Returns an emoji object for the given application and emoji IDs. Includes the `user` field.
 * @see https://docs.discord.com/developers/resources/emoji#get-application-emoji
 */
export const GetApplicationEmoji = endpoint<{ result: RawEmoji }>()(
  'GET',
  '/applications/{application.id}/emojis/{emoji.id}'
);

/**
 * Create a new emoji for the application. Returns the new emoji object on success.
 * @see https://docs.discord.com/developers/resources/emoji#create-application-emoji
 */
export const CreateApplicationEmoji = endpoint<{
  result: RawEmoji;
  body: CreateApplicationEmojiJSONParams;
}>()('POST', '/applications/{application.id}/emojis');

/**
 * Modify the given emoji. Returns the updated emoji object on success.
 * @see https://docs.discord.com/developers/resources/emoji#modify-application-emoji
 */
export const ModifyApplicationEmoji = endpoint<{
  result: RawEmoji;
  body: ModifyApplicationEmojiJSONParams;
}>()('PATCH', '/applications/{application.id}/emojis/{emoji.id}');

/**
 * Delete the given emoji. Returns `204 No Content` on success.
 * @see https://docs.discord.com/developers/resources/emoji#delete-application-emoji
 */
export const DeleteApplicationEmoji = endpoint<{}>()(
  'DELETE',
  '/applications/{application.id}/emojis/{emoji.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/sticker
// --------------------------------------------------------------------------

/**
 * Returns a sticker object for the given sticker ID.
 * @see https://docs.discord.com/developers/resources/sticker#get-sticker
 */
export const GetSticker = endpoint<{ result: RawSticker }>()(
  'GET',
  '/stickers/{sticker.id}'
);

/**
 * Returns a list of available sticker packs.
 * @see https://docs.discord.com/developers/resources/sticker#list-sticker-packs
 */
export const ListStickerPacks = endpoint<{
  result: ListStickerPacksResponse;
}>()('GET', '/sticker-packs');

/**
 * Returns a sticker pack object for the given sticker pack ID.
 * @see https://docs.discord.com/developers/resources/sticker#get-sticker-pack
 */
export const GetStickerPack = endpoint<{ result: RawStickerPack }>()(
  'GET',
  '/sticker-packs/{pack.id}'
);

/**
 * Returns an array of sticker objects for the given guild. Includes `user` fields if the bot has the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission.
 * @see https://docs.discord.com/developers/resources/sticker#list-guild-stickers
 */
export const ListGuildStickers = endpoint<{ result: RawSticker[] }>()(
  'GET',
  '/guilds/{guild.id}/stickers'
);

/**
 * Returns a sticker object for the given guild and sticker IDs. Includes the `user` field if the bot has the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission.
 * @see https://docs.discord.com/developers/resources/sticker#get-guild-sticker
 */
export const GetGuildSticker = endpoint<{ result: RawSticker }>()(
  'GET',
  '/guilds/{guild.id}/stickers/{sticker.id}'
);

/**
 * Create a new sticker for the guild. Send a `multipart/form-data` body as described in Uploading Files. Requires the `CREATE_GUILD_EXPRESSIONS` permission. Returns the new sticker object on success. Fires a Guild Stickers Update Gateway event.
 * @see https://docs.discord.com/developers/resources/sticker#create-guild-sticker
 */
export const CreateGuildSticker = endpoint<{
  result: RawSticker;
  body: CreateGuildStickerJSONParams;
}>()('POST', '/guilds/{guild.id}/stickers');

/**
 * Modify the given sticker. For stickers created by the current user, requires either the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission. For other stickers, requires the `MANAGE_GUILD_EXPRESSIONS` permission. Returns the updated sticker object on success. Fires a Guild Stickers Update Gateway event.
 * @see https://docs.discord.com/developers/resources/sticker#modify-guild-sticker
 */
export const ModifyGuildSticker = endpoint<{
  result: RawSticker;
  body: ModifyGuildStickerJSONParams;
}>()('PATCH', '/guilds/{guild.id}/stickers/{sticker.id}');

/**
 * Delete the given sticker. For stickers created by the current user, requires either the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission. For other stickers, requires the `MANAGE_GUILD_EXPRESSIONS` permission. Returns `204 No Content` on success. Fires a Guild Stickers Update Gateway event.
 * @see https://docs.discord.com/developers/resources/sticker#delete-guild-sticker
 */
export const DeleteGuildSticker = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/stickers/{sticker.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/invite
// --------------------------------------------------------------------------

/**
 * Returns an invite object for the given code.
 * @see https://docs.discord.com/developers/resources/invite#get-invite
 */
export const GetInvite = endpoint<{
  result: RawInvite;
  query: GetInviteQuery;
}>()('GET', '/invites/{invite.code}');

/**
 * Delete an invite. Requires the `MANAGE_CHANNELS` permission on the channel this invite belongs to, or `MANAGE_GUILD` to remove any invite across the guild. Returns an invite object on success. Fires an Invite Delete Gateway event.
 * @see https://docs.discord.com/developers/resources/invite#delete-invite
 */
export const DeleteInvite = endpoint<{ result: RawInvite }>()(
  'DELETE',
  '/invites/{invite.code}'
);

/**
 * Gets the users allowed to see and accept this invite. Response is a CSV file with the header `user_id` and each user ID on its own line. Requires the caller to be the inviter, or have `MANAGE_GUILD` permission, or have `VIEW_AUDIT_LOG` permission.
 * @see https://docs.discord.com/developers/resources/invite#get-target-users
 */
export const GetTargetUsers = endpoint<{ result: string }>()(
  'GET',
  '/invites/{invite.code}/target-users'
);

/**
 * Adds a target user to an existing invite. Requires the caller to be the inviter or have the `MANAGE_GUILD` permission. Returns a 204 empty response on success.
 * @see https://docs.discord.com/developers/resources/invite#add-target-user
 */
export const AddTargetUser = endpoint<{}>()(
  'PUT',
  '/invites/{invite.code}/target-users/{user.id}'
);

/**
 * Removes a target user from an existing invite. Requires the caller to be the inviter or have the `MANAGE_GUILD` permission. Returns a 204 empty response on success.
 * @see https://docs.discord.com/developers/resources/invite#remove-target-user
 */
export const RemoveTargetUser = endpoint<{}>()(
  'DELETE',
  '/invites/{invite.code}/target-users/{user.id}'
);

/**
 * Updates the users allowed to see and accept this invite. Uploading a file with invalid user IDs will result in a 400 with the invalid IDs described. Requires the caller to be the inviter or have the `MANAGE_GUILD` permission.
 * @see https://docs.discord.com/developers/resources/invite#update-target-users
 */
export const UpdateTargetUsers = endpoint<{}>()(
  'PUT',
  '/invites/{invite.code}/target-users'
);

/**
 * Adds multiple target users to an existing invite. Requires the caller to be the inviter or have the `MANAGE_GUILD` permission. Returns a 204 empty response on success.
 * @see https://docs.discord.com/developers/resources/invite#bulk-add-target-users
 */
export const BulkAddTargetUsers = endpoint<{
  body: BulkAddTargetUsersJSONParams;
}>()('POST', '/invites/{invite.code}/target-users/bulk-add');

/**
 * Removes multiple target users from an existing invite. Requires the caller to be the inviter or have the `MANAGE_GUILD` permission. Returns a 204 empty response on success.
 * @see https://docs.discord.com/developers/resources/invite#bulk-delete-target-users
 */
export const BulkDeleteTargetUsers = endpoint<{
  body: BulkDeleteTargetUsersJSONParams;
}>()('POST', '/invites/{invite.code}/target-users/bulk-delete');

/**
 * Processing target users from a CSV when creating or updating an invite is done asynchronously. This endpoint allows you to check the status of that job. Requires the caller to be the inviter, or have `MANAGE_GUILD` permission, or have `VIEW_AUDIT_LOG` permission.
 * @see https://docs.discord.com/developers/resources/invite#get-target-users-job-status
 */
export const GetTargetUsersJobStatus = endpoint<{
  result: RawInviteTargetUsersJob;
}>()('GET', '/invites/{invite.code}/target-users/job-status');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/webhook
// --------------------------------------------------------------------------

/**
 * Creates a new webhook and returns a webhook object on success. Requires the `MANAGE_WEBHOOKS` permission. Fires a Webhooks Update Gateway event.
 * @see https://docs.discord.com/developers/resources/webhook#create-webhook
 */
export const CreateWebhook = endpoint<{
  result: RawWebhook;
  body: CreateWebhookJSONParams;
}>()('POST', '/channels/{channel.id}/webhooks');

/**
 * Returns a list of channel webhook objects. Requires the `MANAGE_WEBHOOKS` permission.
 * @see https://docs.discord.com/developers/resources/webhook#get-channel-webhooks
 */
export const GetChannelWebhooks = endpoint<{ result: RawWebhook[] }>()(
  'GET',
  '/channels/{channel.id}/webhooks'
);

/**
 * Returns a list of guild webhook objects. Requires the `MANAGE_WEBHOOKS` permission.
 * @see https://docs.discord.com/developers/resources/webhook#get-guild-webhooks
 */
export const GetGuildWebhooks = endpoint<{ result: RawWebhook[] }>()(
  'GET',
  '/guilds/{guild.id}/webhooks'
);

/**
 * Returns the new webhook object for the given id.
 * @see https://docs.discord.com/developers/resources/webhook#get-webhook
 */
export const GetWebhook = endpoint<{ result: RawWebhook }>()(
  'GET',
  '/webhooks/{webhook.id}'
);

/**
 * Same as above, except this call does not require authentication and returns no user in the webhook object.
 * @see https://docs.discord.com/developers/resources/webhook#get-webhook-with-token
 */
export const GetWebhookWithToken = endpoint<{ result: RawWebhook }>()(
  'GET',
  '/webhooks/{webhook.id}/{webhook.token}'
);

/**
 * Modify a webhook. Requires the `MANAGE_WEBHOOKS` permission. Returns the updated webhook object on success. Fires a Webhooks Update Gateway event.
 * @see https://docs.discord.com/developers/resources/webhook#modify-webhook
 */
export const ModifyWebhook = endpoint<{
  result: RawWebhook;
  body: ModifyWebhookJSONParams;
}>()('PATCH', '/webhooks/{webhook.id}');

/**
 * Same as above, except this call does not require authentication, does not accept a `channel_id` parameter in the body, and does not return a user in the webhook object.
 * @see https://docs.discord.com/developers/resources/webhook#modify-webhook-with-token
 */
export const ModifyWebhookWithToken = endpoint<{
  result: RawWebhook;
  body: Omit<ModifyWebhookJSONParams, 'channel_id'>;
}>()('PATCH', '/webhooks/{webhook.id}/{webhook.token}');

/**
 * Delete a webhook permanently. Requires the `MANAGE_WEBHOOKS` permission. Returns a `204 No Content` response on success. Fires a Webhooks Update Gateway event.
 * @see https://docs.discord.com/developers/resources/webhook#delete-webhook
 */
export const DeleteWebhook = endpoint<{}>()('DELETE', '/webhooks/{webhook.id}');

/**
 * Same as above, except this call does not require authentication.
 * @see https://docs.discord.com/developers/resources/webhook#delete-webhook-with-token
 */
export const DeleteWebhookWithToken = endpoint<{}>()(
  'DELETE',
  '/webhooks/{webhook.id}/{webhook.token}'
);

/**
 * Refer to Uploading Files for details on attachments and `multipart/form-data` requests. Returns a message or `204 No Content` depending on the `wait` query parameter.
 * @see https://docs.discord.com/developers/resources/webhook#execute-webhook
 */
export const ExecuteWebhook = endpoint<{
  result: RawMessage | undefined;
  body: ExecuteWebhookJSONParams;
  query: ExecuteWebhookQuery;
}>()('POST', '/webhooks/{webhook.id}/{webhook.token}');

/**
 * Returns a previously-sent webhook message from the same token. Returns a message object on success.
 * @see https://docs.discord.com/developers/resources/webhook#get-webhook-message
 */
export const GetWebhookMessage = endpoint<{
  result: RawMessage;
  query: GetWebhookMessageQuery;
}>()('GET', '/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}');

/**
 * Edits a previously-sent webhook message from the same token. Returns a message object on success.
 * @see https://docs.discord.com/developers/resources/webhook#edit-webhook-message
 */
export const EditWebhookMessage = endpoint<{
  result: RawMessage;
  body: EditWebhookMessageJSONParams;
  query: EditWebhookMessageQuery;
}>()('PATCH', '/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}');

/**
 * Deletes a message that was created by the webhook. Returns a `204 No Content` response on success.
 * @see https://docs.discord.com/developers/resources/webhook#delete-webhook-message
 */
export const DeleteWebhookMessage = endpoint<{
  query: DeleteWebhookMessageQuery;
}>()('DELETE', '/webhooks/{webhook.id}/{webhook.token}/messages/{message.id}');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/voice
// --------------------------------------------------------------------------

/**
 * Returns an array of voice region objects that can be used when setting a voice or stage channel's `rtc_region`.
 * @see https://docs.discord.com/developers/resources/voice#list-voice-regions
 */
export const ListVoiceRegions = endpoint<{ result: RawVoiceRegion[] }>()(
  'GET',
  '/voice/regions'
);

/**
 * Returns the current user's voice state in the guild.
 * @see https://docs.discord.com/developers/resources/voice#get-current-user-voice-state
 */
export const GetCurrentUserVoiceState = endpoint<{ result: RawVoiceState }>()(
  'GET',
  '/guilds/{guild.id}/voice-states/@me'
);

/**
 * Returns the specified user's voice state in the guild.
 * @see https://docs.discord.com/developers/resources/voice#get-user-voice-state
 */
export const GetUserVoiceState = endpoint<{ result: RawVoiceState }>()(
  'GET',
  '/guilds/{guild.id}/voice-states/{user.id}'
);

/**
 * Updates the current user's voice state. Returns `204 No Content` on success. Fires a Voice State Update Gateway event.
 * @see https://docs.discord.com/developers/resources/voice#modify-current-user-voice-state
 */
export const ModifyCurrentUserVoiceState = endpoint<{
  body: ModifyCurrentUserVoiceStateJSONParams;
}>()('PATCH', '/guilds/{guild.id}/voice-states/@me');

/**
 * Updates another user's voice state. Returns `204 No Content` on success. Fires a Voice State Update Gateway event.
 * @see https://docs.discord.com/developers/resources/voice#modify-user-voice-state
 */
export const ModifyUserVoiceState = endpoint<{
  body: ModifyUserVoiceStateJSONParams;
}>()('PATCH', '/guilds/{guild.id}/voice-states/{user.id}');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/poll
// --------------------------------------------------------------------------

/**
 * Get a list of users that voted for this specific answer.
 * @see https://docs.discord.com/developers/resources/poll#get-answer-voters
 */
export const GetAnswerVoters = endpoint<{
  result: GetAnswerVotersResponse;
  query: GetAnswerVotersQuery;
}>()('GET', '/channels/{channel.id}/polls/{message.id}/answers/{answer_id}');

/**
 * Immediately ends the poll. You cannot end polls from other users.
 * @see https://docs.discord.com/developers/resources/poll#end-poll
 */
export const EndPoll = endpoint<{ result: RawMessage }>()(
  'POST',
  '/channels/{channel.id}/polls/{message.id}/expire'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/application
// --------------------------------------------------------------------------

/**
 * Returns the application object associated with the requesting bot user.
 * @see https://docs.discord.com/developers/resources/application#get-current-application
 */
export const GetCurrentApplication = endpoint<{ result: RawApplication }>()(
  'GET',
  '/applications/@me'
);

/**
 * Edit properties of the app associated with the requesting bot user. Only properties that are passed will be updated. Returns the updated application object on success.
 * @see https://docs.discord.com/developers/resources/application#edit-current-application
 */
export const EditCurrentApplication = endpoint<{
  result: RawApplication;
  body: EditCurrentApplicationJSONParams;
}>()('PATCH', '/applications/@me');

/**
 * Returns a serialized activity instance, if it exists. Useful for preventing unwanted activity sessions.
 * @see https://docs.discord.com/developers/resources/application#get-application-activity-instance
 */
export const GetApplicationActivityInstance = endpoint<{
  result: RawActivityInstance;
}>()('GET', '/applications/{application.id}/activity-instances/{instance_id}');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/application-role-connection-metadata
// --------------------------------------------------------------------------

/**
 * Returns a list of application role connection metadata objects for the given application.
 * @see https://docs.discord.com/developers/resources/application-role-connection-metadata#get-application-role-connection-metadata-records
 */
export const GetApplicationRoleConnectionMetadataRecords = endpoint<{
  result: RawApplicationRoleConnectionMetadata[];
}>()('GET', '/applications/{application.id}/role-connections/metadata');

/**
 * Updates and returns a list of application role connection metadata objects for the given application.
 * @see https://docs.discord.com/developers/resources/application-role-connection-metadata#update-application-role-connection-metadata-records
 */
export const UpdateApplicationRoleConnectionMetadataRecords = endpoint<{
  result: RawApplicationRoleConnectionMetadata[];
  body: RawApplicationRoleConnectionMetadata[];
}>()('PUT', '/applications/{application.id}/role-connections/metadata');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/audit-log
// --------------------------------------------------------------------------

/**
 * Returns an audit log object for the guild. Requires the `VIEW_AUDIT_LOG` permission.
 * @see https://docs.discord.com/developers/resources/audit-log#get-guild-audit-log
 */
export const GetGuildAuditLog = endpoint<{
  result: RawAuditLog;
  query: GetGuildAuditLogQuery;
}>()('GET', '/guilds/{guild.id}/audit-logs');

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/auto-moderation
// --------------------------------------------------------------------------

/**
 * Get a list of all rules currently configured for the guild. Returns a list of auto moderation rule objects for the given guild.
 * @see https://docs.discord.com/developers/resources/auto-moderation#list-auto-moderation-rules-for-guild
 */
export const ListAutoModerationRulesForGuild = endpoint<{
  result: RawAutoModerationRule[];
}>()('GET', '/guilds/{guild.id}/auto-moderation/rules');

/**
 * Get a single rule. Returns an auto moderation rule object.
 * @see https://docs.discord.com/developers/resources/auto-moderation#get-auto-moderation-rule
 */
export const GetAutoModerationRule = endpoint<{
  result: RawAutoModerationRule;
}>()(
  'GET',
  '/guilds/{guild.id}/auto-moderation/rules/{auto_moderation_rule.id}'
);

/**
 * Create a new rule. Returns an auto moderation rule on success. Fires an Auto Moderation Rule Create Gateway event.
 * @see https://docs.discord.com/developers/resources/auto-moderation#create-auto-moderation-rule
 */
export const CreateAutoModerationRule = endpoint<{
  result: RawAutoModerationRule;
  body: CreateAutoModerationRuleJSONParams;
}>()('POST', '/guilds/{guild.id}/auto-moderation/rules');

/**
 * Modify an existing rule. Returns an auto moderation rule on success. Fires an Auto Moderation Rule Update Gateway event.
 * @see https://docs.discord.com/developers/resources/auto-moderation#modify-auto-moderation-rule
 */
export const ModifyAutoModerationRule = endpoint<{
  result: RawAutoModerationRule;
  body: ModifyAutoModerationRuleJSONParams;
}>()(
  'PATCH',
  '/guilds/{guild.id}/auto-moderation/rules/{auto_moderation_rule.id}'
);

/**
 * Delete a rule. Returns a `204` on success. Fires an Auto Moderation Rule Delete Gateway event.
 * @see https://docs.discord.com/developers/resources/auto-moderation#delete-auto-moderation-rule
 */
export const DeleteAutoModerationRule = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/auto-moderation/rules/{auto_moderation_rule.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/entitlement
// --------------------------------------------------------------------------

/**
 * Returns all entitlements for a given app, active and expired.
 * @see https://docs.discord.com/developers/resources/entitlement#list-entitlements
 */
export const ListEntitlements = endpoint<{
  result: RawEntitlement[];
  query: ListEntitlementsQuery;
}>()('GET', '/applications/{application.id}/entitlements');

/**
 * Returns an entitlement.
 * @see https://docs.discord.com/developers/resources/entitlement#get-entitlement
 */
export const GetEntitlement = endpoint<{ result: RawEntitlement }>()(
  'GET',
  '/applications/{application.id}/entitlements/{entitlement.id}'
);

/**
 * For One-Time Purchase consumable SKUs, marks a given entitlement for the user as consumed. The entitlement will have `consumed: true` when using List Entitlements.
 * @see https://docs.discord.com/developers/resources/entitlement#consume-an-entitlement
 */
export const ConsumeAnEntitlement = endpoint<{}>()(
  'POST',
  '/applications/{application.id}/entitlements/{entitlement.id}/consume'
);

/**
 * Creates a test entitlement to a given SKU for a given guild or user. Discord will act as though that user or guild has entitlement to your premium offering.
 * @see https://docs.discord.com/developers/resources/entitlement#create-test-entitlement
 */
export const CreateTestEntitlement = endpoint<{
  result: Partial<RawEntitlement>;
  body: CreateTestEntitlementJSONParams;
}>()('POST', '/applications/{application.id}/entitlements');

/**
 * Deletes a currently-active test entitlement. Discord will act as though that user or guild *no longer has* entitlement to your premium offering.
 * @see https://docs.discord.com/developers/resources/entitlement#delete-test-entitlement
 */
export const DeleteTestEntitlement = endpoint<{}>()(
  'DELETE',
  '/applications/{application.id}/entitlements/{entitlement.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/guild-scheduled-event
// --------------------------------------------------------------------------

/**
 * Returns a list of guild scheduled event objects for the given guild.
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#list-scheduled-events-for-guild
 */
export const ListScheduledEventsForGuild = endpoint<{
  result: RawGuildScheduledEvent[];
  query: ListScheduledEventsForGuildQuery;
}>()('GET', '/guilds/{guild.id}/scheduled-events');

/**
 * Create a guild scheduled event in the guild. Returns a guild scheduled event object on success. Fires a Guild Scheduled Event Create Gateway event.
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#create-guild-scheduled-event
 */
export const CreateGuildScheduledEvent = endpoint<{
  result: RawGuildScheduledEvent;
  body: CreateGuildScheduledEventJSONParams;
}>()('POST', '/guilds/{guild.id}/scheduled-events');

/**
 * Get a guild scheduled event. Returns a guild scheduled event object on success.
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#get-guild-scheduled-event
 */
export const GetGuildScheduledEvent = endpoint<{
  result: RawGuildScheduledEvent;
  query: GetGuildScheduledEventQuery;
}>()('GET', '/guilds/{guild.id}/scheduled-events/{guild_scheduled_event.id}');

/**
 * Modify a guild scheduled event. Returns the modified guild scheduled event object on success. Fires a Guild Scheduled Event Update Gateway event.
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#modify-guild-scheduled-event
 */
export const ModifyGuildScheduledEvent = endpoint<{
  result: RawGuildScheduledEvent;
  body: ModifyGuildScheduledEventJSONParams;
}>()('PATCH', '/guilds/{guild.id}/scheduled-events/{guild_scheduled_event.id}');

/**
 * Delete a guild scheduled event. Returns a `204` on success. Fires a Guild Scheduled Event Delete Gateway event.
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#delete-guild-scheduled-event
 */
export const DeleteGuildScheduledEvent = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/scheduled-events/{guild_scheduled_event.id}'
);

/**
 * Get a list of guild scheduled event users subscribed to a guild scheduled event. Returns a list of guild scheduled event user objects on success. Guild member data, if it exists, is included if the `with_member` query parameter is set.
 * @see https://docs.discord.com/developers/resources/guild-scheduled-event#get-guild-scheduled-event-users
 */
export const GetGuildScheduledEventUsers = endpoint<{
  result: RawGuildScheduledEventUser[];
  query: GetGuildScheduledEventUsersQuery;
}>()(
  'GET',
  '/guilds/{guild.id}/scheduled-events/{guild_scheduled_event.id}/users'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/guild-template
// --------------------------------------------------------------------------

/**
 * Returns a guild template object for the given code.
 * @see https://docs.discord.com/developers/resources/guild-template#get-guild-template
 */
export const GetGuildTemplate = endpoint<{ result: RawGuildTemplate }>()(
  'GET',
  '/guilds/templates/{template.code}'
);

/**
 * Returns an array of guild template objects. Requires the `MANAGE_GUILD` permission.
 * @see https://docs.discord.com/developers/resources/guild-template#get-guild-templates
 */
export const GetGuildTemplates = endpoint<{ result: RawGuildTemplate[] }>()(
  'GET',
  '/guilds/{guild.id}/templates'
);

/**
 * Creates a template for the guild. Requires the `MANAGE_GUILD` permission. Returns the created guild template object on success.
 * @see https://docs.discord.com/developers/resources/guild-template#create-guild-template
 */
export const CreateGuildTemplate = endpoint<{
  result: RawGuildTemplate;
  body: CreateGuildTemplateJSONParams;
}>()('POST', '/guilds/{guild.id}/templates');

/**
 * Syncs the template to the guild's current state. Requires the `MANAGE_GUILD` permission. Returns the guild template object on success.
 * @see https://docs.discord.com/developers/resources/guild-template#sync-guild-template
 */
export const SyncGuildTemplate = endpoint<{ result: RawGuildTemplate }>()(
  'PUT',
  '/guilds/{guild.id}/templates/{template.code}'
);

/**
 * Modifies the template's metadata. Requires the `MANAGE_GUILD` permission. Returns the guild template object on success.
 * @see https://docs.discord.com/developers/resources/guild-template#modify-guild-template
 */
export const ModifyGuildTemplate = endpoint<{
  result: RawGuildTemplate;
  body: ModifyGuildTemplateJSONParams;
}>()('PATCH', '/guilds/{guild.id}/templates/{template.code}');

/**
 * Deletes the template. Requires the `MANAGE_GUILD` permission. Returns the deleted guild template object on success.
 * @see https://docs.discord.com/developers/resources/guild-template#delete-guild-template
 */
export const DeleteGuildTemplate = endpoint<{ result: RawGuildTemplate }>()(
  'DELETE',
  '/guilds/{guild.id}/templates/{template.code}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/sku
// --------------------------------------------------------------------------

/**
 * Returns all SKUs for a given application.
 * @see https://docs.discord.com/developers/resources/sku#list-skus
 */
export const ListSKUs = endpoint<{ result: RawSku[] }>()(
  'GET',
  '/applications/{application.id}/skus'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/soundboard
// --------------------------------------------------------------------------

/**
 * Send a soundboard sound to a voice channel the user is connected to. Fires a Voice Channel Effect Send Gateway event.
 * @see https://docs.discord.com/developers/resources/soundboard#send-soundboard-sound
 */
export const SendSoundboardSound = endpoint<{
  body: SendSoundboardSoundJSONParams;
}>()('POST', '/channels/{channel.id}/send-soundboard-sound');

/**
 * Returns an array of soundboard sound objects that can be used by all users.
 * @see https://docs.discord.com/developers/resources/soundboard#list-default-soundboard-sounds
 */
export const ListDefaultSoundboardSounds = endpoint<{
  result: RawSoundboardSound[];
}>()('GET', '/soundboard-default-sounds');

/**
 * Returns a list of the guild's soundboard sounds. Includes `user` fields if the bot has the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission.
 * @see https://docs.discord.com/developers/resources/soundboard#list-guild-soundboard-sounds
 */
export const ListGuildSoundboardSounds = endpoint<{
  result: ListGuildSoundboardSoundsResponse;
}>()('GET', '/guilds/{guild.id}/soundboard-sounds');

/**
 * Returns a soundboard sound object for the given sound id. Includes the `user` field if the bot has the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission.
 * @see https://docs.discord.com/developers/resources/soundboard#get-guild-soundboard-sound
 */
export const GetGuildSoundboardSound = endpoint<{
  result: RawSoundboardSound;
}>()('GET', '/guilds/{guild.id}/soundboard-sounds/{sound.id}');

/**
 * Create a new soundboard sound for the guild. Requires the `CREATE_GUILD_EXPRESSIONS` permission. Returns the new soundboard sound object on success. Fires a Guild Soundboard Sound Create Gateway event.
 * @see https://docs.discord.com/developers/resources/soundboard#create-guild-soundboard-sound
 */
export const CreateGuildSoundboardSound = endpoint<{
  result: RawSoundboardSound;
  body: CreateGuildSoundboardSoundJSONParams;
}>()('POST', '/guilds/{guild.id}/soundboard-sounds');

/**
 * Modify the given soundboard sound. For sounds created by the current user, requires either the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission. For other sounds, requires the `MANAGE_GUILD_EXPRESSIONS` permission. Returns the updated soundboard sound object on success. Fires a Guild Soundboard Sound Update Gateway event.
 * @see https://docs.discord.com/developers/resources/soundboard#modify-guild-soundboard-sound
 */
export const ModifyGuildSoundboardSound = endpoint<{
  result: RawSoundboardSound;
  body: ModifyGuildSoundboardSoundJSONParams;
}>()('PATCH', '/guilds/{guild.id}/soundboard-sounds/{sound.id}');

/**
 * Delete the given soundboard sound. For sounds created by the current user, requires either the `CREATE_GUILD_EXPRESSIONS` or `MANAGE_GUILD_EXPRESSIONS` permission. For other sounds, requires the `MANAGE_GUILD_EXPRESSIONS` permission. Returns `204 No Content` on success. Fires a Guild Soundboard Sound Delete Gateway event.
 * @see https://docs.discord.com/developers/resources/soundboard#delete-guild-soundboard-sound
 */
export const DeleteGuildSoundboardSound = endpoint<{}>()(
  'DELETE',
  '/guilds/{guild.id}/soundboard-sounds/{sound.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/stage-instance
// --------------------------------------------------------------------------

/**
 * Creates a new Stage instance associated to a Stage channel. Returns that Stage instance. Fires a Stage Instance Create Gateway event.
 * @see https://docs.discord.com/developers/resources/stage-instance#create-stage-instance
 */
export const CreateStageInstance = endpoint<{
  result: RawStageInstance;
  body: CreateStageInstanceJSONParams;
}>()('POST', '/stage-instances');

/**
 * Gets the stage instance associated with the Stage channel, if it exists.
 * @see https://docs.discord.com/developers/resources/stage-instance#get-stage-instance
 */
export const GetStageInstance = endpoint<{ result: RawStageInstance }>()(
  'GET',
  '/stage-instances/{channel.id}'
);

/**
 * Updates fields of an existing Stage instance. Returns the updated Stage instance. Fires a Stage Instance Update Gateway event.
 * @see https://docs.discord.com/developers/resources/stage-instance#modify-stage-instance
 */
export const ModifyStageInstance = endpoint<{
  result: RawStageInstance;
  body: ModifyStageInstanceJSONParams;
}>()('PATCH', '/stage-instances/{channel.id}');

/**
 * Deletes the Stage instance. Returns `204 No Content`. Fires a Stage Instance Delete Gateway event.
 * @see https://docs.discord.com/developers/resources/stage-instance#delete-stage-instance
 */
export const DeleteStageInstance = endpoint<{}>()(
  'DELETE',
  '/stage-instances/{channel.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/resources/subscription
// --------------------------------------------------------------------------

/**
 * Returns all subscriptions containing the SKU, filtered by user. Returns a list of subscription objects.
 * @see https://docs.discord.com/developers/resources/subscription#list-sku-subscriptions
 */
export const ListSkuSubscriptions = endpoint<{
  result: RawSubscription[];
  query: ListSkuSubscriptionsQuery;
}>()('GET', '/skus/{sku.id}/subscriptions');

/**
 * Get a subscription by its ID. Returns a subscription object.
 * @see https://docs.discord.com/developers/resources/subscription#get-sku-subscription
 */
export const GetSkuSubscription = endpoint<{ result: RawSubscription }>()(
  'GET',
  '/skus/{sku.id}/subscriptions/{subscription.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/interactions/receiving-and-responding
// --------------------------------------------------------------------------

/**
 * Create a response to an Interaction. Body is an interaction response. Returns `204` unless `with_response` is set to `true` which returns `200` with the body as interaction callback response.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#create-interaction-response
 */
export const CreateInteractionResponse = endpoint<{
  result: RawInteractionCallbackResponse | undefined;
  body: RawInteractionResponse;
  query: CreateInteractionResponseQuery;
}>()('POST', '/interactions/{interaction.id}/{interaction.token}/callback');

/**
 * Returns the initial Interaction response. Functions the same as Get Webhook Message.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#get-original-interaction-response
 */
export const GetOriginalInteractionResponse = endpoint<{
  result: RawMessage;
}>()(
  'GET',
  '/webhooks/{application.id}/{interaction.token}/messages/@original'
);

/**
 * Edits the initial Interaction response. Functions the same as Edit Webhook Message.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#edit-original-interaction-response
 */
export const EditOriginalInteractionResponse = endpoint<{
  result: RawMessage;
  body: EditWebhookMessageJSONParams;
}>()(
  'PATCH',
  '/webhooks/{application.id}/{interaction.token}/messages/@original'
);

/**
 * Deletes the initial Interaction response. Returns `204 No Content` on success.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#delete-original-interaction-response
 */
export const DeleteOriginalInteractionResponse = endpoint<{}>()(
  'DELETE',
  '/webhooks/{application.id}/{interaction.token}/messages/@original'
);

/**
 *
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#create-followup-message
 */
export const CreateFollowupMessage = endpoint<{
  result: RawMessage;
  body: ExecuteWebhookJSONParams;
}>()('POST', '/webhooks/{application.id}/{interaction.token}');

/**
 * Returns a followup message for an Interaction. Functions the same as Get Webhook Message.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#get-followup-message
 */
export const GetFollowupMessage = endpoint<{ result: RawMessage }>()(
  'GET',
  '/webhooks/{application.id}/{interaction.token}/messages/{message.id}'
);

/**
 * Edits a followup message for an Interaction. Functions the same as Edit Webhook Message.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#edit-followup-message
 */
export const EditFollowupMessage = endpoint<{
  result: RawMessage;
  body: EditWebhookMessageJSONParams;
}>()(
  'PATCH',
  '/webhooks/{application.id}/{interaction.token}/messages/{message.id}'
);

/**
 * Deletes a followup message for an Interaction. Returns `204 No Content` on success.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#delete-followup-message
 */
export const DeleteFollowupMessage = endpoint<{}>()(
  'DELETE',
  '/webhooks/{application.id}/{interaction.token}/messages/{message.id}'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/interactions/application-commands
// --------------------------------------------------------------------------

/**
 *
 * @see https://docs.discord.com/developers/interactions/application-commands#get-global-application-commands
 */
export const GetGlobalApplicationCommands = endpoint<{
  result: RawApplicationCommand[];
  query: GetGlobalApplicationCommandsQuery;
}>()('GET', '/applications/{application.id}/commands');

/**
 *
 * @see https://docs.discord.com/developers/interactions/application-commands#create-global-application-command
 */
export const CreateGlobalApplicationCommand = endpoint<{
  result: RawApplicationCommand;
  body: CreateGlobalApplicationCommandJSONParams;
}>()('POST', '/applications/{application.id}/commands');

/**
 * Fetch a global command for your application. Returns an application command object.
 * @see https://docs.discord.com/developers/interactions/application-commands#get-global-application-command
 */
export const GetGlobalApplicationCommand = endpoint<{
  result: RawApplicationCommand;
}>()('GET', '/applications/{application.id}/commands/{command.id}');

/**
 *
 * @see https://docs.discord.com/developers/interactions/application-commands#edit-global-application-command
 */
export const EditGlobalApplicationCommand = endpoint<{
  result: RawApplicationCommand;
  body: EditGlobalApplicationCommandJSONParams;
}>()('PATCH', '/applications/{application.id}/commands/{command.id}');

/**
 * Deletes a global command. Returns `204 No Content` on success.
 * @see https://docs.discord.com/developers/interactions/application-commands#delete-global-application-command
 */
export const DeleteGlobalApplicationCommand = endpoint<{}>()(
  'DELETE',
  '/applications/{application.id}/commands/{command.id}'
);

/**
 * Takes a list of application commands, overwriting the existing global command list for this application. Returns `200` and a list of application command objects. Commands that do not already exist will count toward daily application command create limits.
 * @see https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-global-application-commands
 */
export const BulkOverwriteGlobalApplicationCommands = endpoint<{
  result: RawApplicationCommand[];
  body: BulkOverwriteGuildApplicationCommandsJSONParams[];
}>()('PUT', '/applications/{application.id}/commands');

/**
 *
 * @see https://docs.discord.com/developers/interactions/application-commands#get-guild-application-commands
 */
export const GetGuildApplicationCommands = endpoint<{
  result: RawApplicationCommand[];
  query: GetGuildApplicationCommandsQuery;
}>()('GET', '/applications/{application.id}/guilds/{guild.id}/commands');

/**
 *
 * @see https://docs.discord.com/developers/interactions/application-commands#create-guild-application-command
 */
export const CreateGuildApplicationCommand = endpoint<{
  result: RawApplicationCommand;
  body: CreateGuildApplicationCommandJSONParams;
}>()('POST', '/applications/{application.id}/guilds/{guild.id}/commands');

/**
 * Fetch a guild command for your application. Returns an application command object.
 * @see https://docs.discord.com/developers/interactions/application-commands#get-guild-application-command
 */
export const GetGuildApplicationCommand = endpoint<{
  result: RawApplicationCommand;
}>()(
  'GET',
  '/applications/{application.id}/guilds/{guild.id}/commands/{command.id}'
);

/**
 *
 * @see https://docs.discord.com/developers/interactions/application-commands#edit-guild-application-command
 */
export const EditGuildApplicationCommand = endpoint<{
  result: RawApplicationCommand;
  body: EditGuildApplicationCommandJSONParams;
}>()(
  'PATCH',
  '/applications/{application.id}/guilds/{guild.id}/commands/{command.id}'
);

/**
 * Delete a guild command. Returns `204 No Content` on success.
 * @see https://docs.discord.com/developers/interactions/application-commands#delete-guild-application-command
 */
export const DeleteGuildApplicationCommand = endpoint<{}>()(
  'DELETE',
  '/applications/{application.id}/guilds/{guild.id}/commands/{command.id}'
);

/**
 * Takes a list of application commands, overwriting the existing command list for this application for the targeted guild. Returns `200` and a list of application command objects.
 * @see https://docs.discord.com/developers/interactions/application-commands#bulk-overwrite-guild-application-commands
 */
export const BulkOverwriteGuildApplicationCommands = endpoint<{
  result: RawApplicationCommand[];
  body: BulkOverwriteGuildApplicationCommandsJSONParams[];
}>()('PUT', '/applications/{application.id}/guilds/{guild.id}/commands');

/**
 * Fetches permissions for all commands for your application in a guild. Returns an array of guild application command permissions objects.
 * @see https://docs.discord.com/developers/interactions/application-commands#get-guild-application-command-permissions
 */
export const GetGuildApplicationCommandPermissions = endpoint<{
  result: RawGuildApplicationCommandPermissions[];
}>()(
  'GET',
  '/applications/{application.id}/guilds/{guild.id}/commands/permissions'
);

/**
 * Fetches permissions for a specific command for your application in a guild. Returns a guild application command permissions object.
 * @see https://docs.discord.com/developers/interactions/application-commands#get-application-command-permissions
 */
export const GetApplicationCommandPermissions = endpoint<{
  result: RawGuildApplicationCommandPermissions;
}>()(
  'GET',
  '/applications/{application.id}/guilds/{guild.id}/commands/{command.id}/permissions'
);

/**
 *
 * @see https://docs.discord.com/developers/interactions/application-commands#edit-application-command-permissions
 */
export const EditApplicationCommandPermissions = endpoint<{
  result: RawGuildApplicationCommandPermissions;
  body: EditApplicationCommandPermissionsJSONParams;
}>()(
  'PUT',
  '/applications/{application.id}/guilds/{guild.id}/commands/{command.id}/permissions'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/events/gateway
// --------------------------------------------------------------------------

/**
 *
 * @see https://docs.discord.com/developers/events/gateway#get-gateway
 */
export const GetGateway = endpoint<{ result: { url: string } }>()(
  'GET',
  '/gateway'
);

/**
 *
 * @see https://docs.discord.com/developers/events/gateway#get-gateway-bot
 */
export const GetGatewayBot = endpoint<{ result: RawGatewayBot }>()(
  'GET',
  '/gateway/bot'
);

// --------------------------------------------------------------------------
// https://docs.discord.com/developers/topics/oauth2
// --------------------------------------------------------------------------

/**
 * Returns the bot's application object.
 * @see https://docs.discord.com/developers/topics/oauth2#get-current-bot-application-information
 */
export const GetCurrentBotApplicationInformation = endpoint<{
  result: RawApplication;
}>()('GET', '/oauth2/applications/@me');

/**
 * Returns info about the current authorization. Requires authentication with a bearer token.
 * @see https://docs.discord.com/developers/topics/oauth2#get-current-authorization-information
 */
export const GetCurrentAuthorizationInformation = endpoint<{
  result: GetCurrentAuthorizationInformationResponse;
}>()('GET', '/oauth2/@me');
