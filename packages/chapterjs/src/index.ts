// The public types of ChapterJS, and everything in its API that is the same
// wherever it is imported. What depends on the folder of the importing file
// (`event`...) is exported at runtime by `main.ts`, and typed for each
// folder of a project by the generated `.chapterjs/` (see
// `loader/generated.ts`): declaring it here too would make editors offer
// two imports of the same name.
//
// The public API of ChapterJS. User code gets structures from the framework
// (in events, commands...) and never creates them: classes are exported as
// types only, and nothing here lets user code connect to Discord or send
// requests by itself.

// What the functions of src/events/ receive, by event.
export type {
  EventContexts,
  EventFile,
  EventName,
  EventOptions,
  MessageEventOptions,
} from './events/registry.js';

// What handlers receive.
export type {
  CategoryChannel,
  Channel,
  DMChannel,
  FetchMessagesOptions,
  ForumChannel,
  ForumPostOptions,
  ForumTag,
  GuildChannel,
  GuildChannelEditOptions,
  InviteCreateOptions,
  PermissionOverwrite,
  TextBasedChannel,
  TextChannel,
  ThreadChannel,
  ThreadCreateOptions,
  ThreadEditOptions,
  ThreadMember,
  VoiceChannel,
} from './structures/channel.js';
export type { GuildEmoji } from './structures/emoji.js';
export type {
  AuditLog,
  AutoModerationRule,
  Ban,
  ChannelCreateOptions,
  Guild,
  GuildEditOptions,
  RoleCreateOptions,
  ScheduledEvent,
  Sticker,
} from './structures/guild.js';
export type { Invite } from './structures/invite.js';
export type {
  BanOptions,
  GuildMember,
  MemberEditOptions,
} from './structures/member.js';
export type {
  Attachment,
  EmojiInput,
  Message,
  MessageFlagName,
  Reaction,
} from './structures/message.js';
export type {
  AllowedMentions,
  Component,
  Embed,
  FileInput,
  MessageEditOptions,
  MessageInput,
  MessageOptions,
  PollInput,
} from './structures/payload.js';
export type { Role, RoleEditOptions } from './structures/role.js';
export type { User, UserFlagName } from './structures/user.js';
export type { Webhook, WebhookMessageOptions } from './structures/webhook.js';

// Errors handlers can catch.
export {
  DiscordApiError,
  DiscordUnavailableError,
  InvalidTokenError,
} from './rest/errors.js';
export type { DiscordFieldError } from './rest/errors.js';

// Permissions.
export { Permissions } from './discord/permissions.js';
export type {
  PermissionName,
  PermissionResolvable,
} from './discord/permissions.js';
export { PermissionFlags } from './discord/types/permissions.js';

// Helpers to write messages.
export {
  channelMention,
  commandMention,
  emojiMention,
  GuildNavigation,
  roleMention,
  timestamp,
  TimestampStyle,
  userMention,
} from './discord/formatting.js';
export type { ImageFormat, ImageOptions, ImageSize } from './discord/cdn.js';
export {
  isSnowflake,
  snowflakeFromTimestamp,
  snowflakeTimestamp,
} from './discord/snowflake.js';

// The values Discord uses, by name.
export {
  ChannelType,
  ForumLayoutType,
  ForumSortOrderType,
  VideoQualityMode,
} from './discord/types/channel.js';
export { Locale } from './discord/types/common.js';
export type { Snowflake } from './discord/types/common.js';
export {
  ButtonStyle,
  ComponentType,
  TextInputStyle,
} from './discord/types/component.js';
export {
  DefaultMessageNotificationLevel,
  ExplicitContentFilterLevel,
  PremiumTier,
  VerificationLevel,
} from './discord/types/guild.js';
export type { GuildFeature } from './discord/types/guild.js';
export { AuditLogEvent } from './discord/types/audit-log.js';
export { MessageFlags, MessageType } from './discord/types/message.js';
export { UserFlags } from './discord/types/user.js';
