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

// Slash commands: what the files of src/commands/ are written with.
export { command } from './commands/command.js';
export type {
  AutocompleteContext,
  ChannelOption,
  CommandAutocomplete,
  CommandConfig,
  CommandContext,
  CommandInDm,
  CommandInGuild,
  CommandInPrivate,
  CommandWhere,
  CommandFile,
  CommandLocales,
  CommandOption,
  CommandOptions,
  CommandTranslation,
  Cooldown,
  Duration,
  NumberOption,
  OptionsSoFar,
  OptionTranslation,
  OptionValuesOf,
  SimpleOption,
  StringOption,
  Suggestion,
} from './commands/command.js';
export type {
  CommandInteraction,
  ComponentInteraction,
  DmCommandInteraction,
  GuildCommandInteraction,
  PrivateCommandInteraction,
  Interaction,
  InteractionReply,
  InteractionReplyOptions,
  ModalInteraction,
} from './structures/interaction.js';

// Components: what the files of src/components/ are written with, and the
// pieces of a message written where the message is.
export type { DynamicText, TextContext } from './components/component.js';
export { button } from './components/button.js';
export type {
  ButtonConfig,
  ButtonContext,
  ButtonFile,
  ButtonLook,
  ButtonStyleName,
} from './components/button.js';
export { select } from './components/select.js';
export type {
  EntitySelectConfig,
  EntitySelectType,
  SelectConfig,
  SelectContext,
  SelectFile,
  SelectInstanceOptions,
  SelectLook,
  SelectType,
  StringSelectConfig,
} from './components/select.js';
export { modal } from './components/modal.js';
export type {
  CheckboxField,
  CheckboxesField,
  EntityField,
  FieldValue,
  FieldValuesOf,
  FilesField,
  ModalConfig,
  ModalContext,
  ModalField,
  ModalFields,
  ModalFile,
  ModalInstanceOptions,
  ModalPrefill,
  NoteField,
  RadioField,
  SelectField,
  TextField,
} from './components/modal.js';
export { embed } from './components/embed.js';
export type { EmbedFile } from './components/embed.js';
export type {
  ComponentWhere,
  ComponentWho,
  InDm,
  InGuild,
  InPrivate,
  InteractiveConfig,
  InteractiveContext,
  PlaceInDm,
  PlaceInGuild,
  PlaceInPrivate,
  PlaceOf,
} from './components/component.js';
export type {
  DataField,
  DataInputOf,
  DataKind,
  DataShape,
  DataValuesOf,
} from './components/custom-id.js';
export type {
  OptionValue,
  RichOption,
  SelectOptions,
} from './components/options.js';
export {
  container,
  file,
  gallery,
  linkButton,
  premiumButton,
  row,
  section,
  separator,
  text,
  thumbnail,
} from './components/layout.js';
export type {
  ContainerOptions,
  LinkButtonOptions,
  MediaOptions,
  SeparatorOptions,
} from './components/layout.js';
export type {
  ActionRowComponent,
  ButtonComponent,
  ContainerChild,
  ContainerComponent,
  FileComponent,
  GalleryComponent,
  MessageComponent,
  ModalComponent,
  Piece,
  SectionComponent,
  SelectComponent,
  SeparatorComponent,
  TextComponent,
  ThumbnailComponent,
} from './components/instance.js';

// What the functions of src/events/ receive, by event.
export type {
  ContextOf,
  EventWhere,
  WhereEventOptions,
  EventContexts,
  EventFile,
  EventName,
  EventOptions,
  MessageEventOptions,
  ReactionEventOptions,
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
  GuildTextBasedChannel,
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
  AuditLogEntry,
  AutoModerationRule,
  Ban,
  ChannelCreateOptions,
  Guild,
  GuildEditOptions,
  RoleCreateOptions,
  ScheduledEvent,
  Sticker,
  VoiceState,
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
  DmMessage,
  GuildMessage,
  MemberMessage,
  Message,
  PrivateMessage,
  MessageFlagName,
  Reaction,
  ReactionEmoji,
} from './structures/message.js';
// Tasks: what the files of src/tasks/ are written with.
export { language } from './messages/messages.js';
export type {
  CommandsTranslations,
  FrameworkTexts,
  LanguageConfig,
  LanguageFile,
  MessagesOf,
  MessageText,
  MessageTexts,
  PluralText,
  ProjectCommands,
  ParamsArgs,
  ParamsOf,
  Placeholders,
  ProjectLocale,
  ProjectLocales,
  LocaleGiven,
  ProjectMessages,
  TranslationContext,
  Translator,
} from './messages/messages.js';
export { presence } from './presence/presence.js';
export type {
  Activity,
  ActivityKind,
  PlainActivity,
  PresenceConfig,
  PresenceFile,
  PresenceStatusName,
  StreamingActivity,
} from './presence/presence.js';
export { task } from './tasks/task.js';
export type {
  CronTaskConfig,
  EveryTaskConfig,
  TaskConfig,
  TaskContext,
  TaskFile,
} from './tasks/task.js';

// Files of public/: `asset()` is typed per project by `.chapterjs/`.
export type { AssetFile, AssetOptions } from './assets/asset.js';
export type {
  AllowedMentions,
  Embed,
  FileInput,
  MessageEditOptions,
  MessageInput,
  MessageOptions,
  PollInput,
} from './structures/payload.js';
export type { Role, RoleEditOptions } from './structures/role.js';
export type { User, UserFlagName, UserPresence } from './structures/user.js';
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
