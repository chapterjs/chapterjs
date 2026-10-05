import type { ApplicationIntegrationType } from './application.js';
import type {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  RawApplicationCommandOptionChoice,
} from './application-command.js';
import type { RawChannel } from './channel.js';
import type { Locale, Snowflake } from './common.js';
import type {
  ComponentType,
  RawComponent,
  RawModalSubmitComponent,
} from './component.js';
import type { RawEntitlement } from './entitlement.js';
import type { RawGuild, RawGuildMember } from './guild.js';
import type {
  RawAllowedMentions,
  RawAttachment,
  RawAttachmentRequest,
  RawEmbed,
  RawMessage,
} from './message.js';
import type { RawRole } from './permissions.js';
import type { RawPollCreateRequest } from './poll.js';
import type { RawUser } from './user.js';

/**
 * Interaction Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-interaction-structure
 */
export interface RawInteraction {
  /** ID of the interaction */
  id: Snowflake;
  /** ID of the application this interaction is for */
  application_id: Snowflake;
  /** Type of interaction */
  type: InteractionType;
  /** Interaction data payload */
  data?: RawInteractionData;
  /** Guild that the interaction was sent from */
  guild?: Partial<RawGuild>;
  /** Guild that the interaction was sent from */
  guild_id?: Snowflake;
  /** Channel that the interaction was sent from */
  channel?: Partial<RawChannel>;
  /** Channel that the interaction was sent from */
  channel_id?: Snowflake;
  /** Guild member data for the invoking user, including permissions */
  member?: RawGuildMember;
  /** User object for the invoking user, if invoked in a DM */
  user?: RawUser;
  /** Continuation token for responding to the interaction */
  token: string;
  /** Read-only property, always `1` */
  version: number;
  /** For components or modals triggered by components, the message they were attached to */
  message?: RawMessage;
  /** Bitwise set of permissions the app has in the source location of the interaction */
  app_permissions: string;
  /** Selected language of the invoking user */
  locale?: Locale;
  /** Guild's preferred locale, if invoked in a guild */
  guild_locale?: Locale;
  /** For monetized apps, any entitlements for the invoking user, representing access to premium SKUs */
  entitlements: RawEntitlement[];
  /** Mapping of installation contexts that the interaction was authorized for to related user or guild IDs. See Authorizing Integration Owners Object for details */
  authorizing_integration_owners: Partial<
    Record<`${ApplicationIntegrationType}`, Snowflake>
  >;
  /** Context where the interaction was triggered from */
  context?: InteractionContextType;
  /** Attachment size limit in bytes */
  attachment_size_limit: number;
}

/**
 * Interaction Type
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-interaction-type
 */
export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  ApplicationCommandAutocomplete: 4,
  ModalSubmit: 5,
} as const;
export type InteractionType =
  (typeof InteractionType)[keyof typeof InteractionType];

/**
 * Application Command Data Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-application-command-data-structure
 */
export interface RawApplicationCommandData {
  /** `ID` of the invoked command */
  id: Snowflake;
  /** `name` of the invoked command */
  name: string;
  /** `type` of the invoked command */
  type: ApplicationCommandType;
  /** Converted users + roles + channels + attachments */
  resolved?: RawResolvedData;
  /** Params + values from the user */
  options?: RawApplicationCommandInteractionDataOption[];
  /** ID of the guild the command is registered to */
  guild_id?: Snowflake;
  /** ID of the user or message targeted by a user or message command */
  target_id?: Snowflake;
}

/**
 * Message Component Data Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-message-component-data-structure
 */
export interface RawMessageComponentData {
  /** `custom_id` of the component */
  custom_id: string;
  /** type of the component */
  component_type: ComponentType;
  /** Values the user selected in a select menu component */
  values?: string[];
  /** Resolved entities from selected options */
  resolved?: RawResolvedData;
}

/**
 * Modal Submit Data Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-modal-submit-data-structure
 */
export interface RawModalSubmitData {
  /** The custom ID provided for the modal */
  custom_id: string;
  /** Values submitted by the user */
  components: RawModalSubmitComponent[];
  /** Resolved entities from selected options */
  resolved?: RawResolvedData;
}

/**
 * Resolved Data Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-resolved-data-structure
 */
export interface RawResolvedData {
  /** IDs and User objects */
  users?: Record<Snowflake, RawUser>;
  /** IDs and partial Member objects */
  members?: Record<Snowflake, Partial<RawGuildMember>>;
  /** IDs and Role objects */
  roles?: Record<Snowflake, RawRole>;
  /** IDs and partial Channel objects */
  channels?: Record<Snowflake, Partial<RawChannel>>;
  /** IDs and partial Message objects */
  messages?: Record<Snowflake, Partial<RawMessage>>;
  /** IDs and attachment objects */
  attachments?: Record<Snowflake, RawAttachment>;
}

/**
 * Application Command Interaction Data Option Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-application-command-interaction-data-option-structure
 */
export interface RawApplicationCommandInteractionDataOption {
  /** Name of the parameter */
  name: string;
  /** Value of application command option type */
  type: ApplicationCommandOptionType;
  /** Value of the option resulting from user input */
  value?: string | number | boolean;
  /** Present if this option is a group or subcommand */
  options?: RawApplicationCommandInteractionDataOption[];
  /** `true` if this option is the currently focused option for autocomplete */
  focused?: boolean;
}

/**
 * Message Interaction Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#message-interaction-object-message-interaction-structure
 */
export interface RawMessageInteraction {
  /** ID of the interaction */
  id: Snowflake;
  /** Type of interaction */
  type: InteractionType;
  /** Name of the application command, including subcommands and subcommand groups */
  name: string;
  /** User who invoked the interaction */
  user: RawUser;
  /** Member who invoked the interaction in the guild */
  member?: Partial<RawGuildMember>;
}

/**
 * Interaction Response Structure
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-interaction-response-structure
 */
export interface RawInteractionResponse {
  /** Type of response */
  type: InteractionCallbackType;
  /** An optional response message */
  data?: RawInteractionCallbackData;
}

/**
 * Interaction Callback Type
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type
 */
export const InteractionCallbackType = {
  /** ACK a `Ping` */
  Pong: 1,
  /** Respond to an interaction with a message */
  ChannelMessageWithSource: 4,
  /** ACK an interaction and edit a response later, the user sees a loading state */
  DeferredChannelMessageWithSource: 5,
  /** For components, ACK an interaction and edit the original message later; the user does not see a loading state */
  DeferredUpdateMessage: 6,
  /** For components, edit the message the component was attached to */
  UpdateMessage: 7,
  /** Respond to an autocomplete interaction with suggested choices */
  ApplicationCommandAutocompleteResult: 8,
  /** Respond to an interaction with a popup modal */
  Modal: 9,
  /** **Deprecated**; respond to an interaction with an upgrade button, only available for apps with monetization enabled */
  PremiumRequired: 10,
  /** Launch the Activity associated with the app. Only available for apps with Activities enabled */
  LaunchActivity: 12,
} as const;
export type InteractionCallbackType =
  (typeof InteractionCallbackType)[keyof typeof InteractionCallbackType];

/**
 * Messages
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-messages
 */
export interface RawInteractionCallbackMessageData {
  /** Whether the response is TTS */
  tts?: boolean;
  /** Message content */
  content?: string;
  /** Supports up to 10 embeds */
  embeds?: RawEmbed[];
  /** Allowed mentions object */
  allowed_mentions?: RawAllowedMentions;
  /** Message flags combined as a bitfield (only `SUPPRESS_EMBEDS`, `EPHEMERAL`, `IS_COMPONENTS_V2`, `IS_VOICE_MESSAGE`, and `SUPPRESS_NOTIFICATIONS` can be set) */
  flags?: number;
  /** Message components */
  components?: RawComponent[];
  /** Attachment objects with filename and description */
  attachments?: Partial<RawAttachmentRequest>[];
  /** Details about the poll */
  poll?: RawPollCreateRequest;
}

/**
 * Autocomplete
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-autocomplete
 */
export interface RawInteractionCallbackAutocompleteData {
  /** autocomplete choices (max of 25 choices) */
  choices: RawApplicationCommandOptionChoice[];
}

/**
 * Modal
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-modal
 */
export interface RawInteractionCallbackModalData {
  /** Developer-defined identifier for the modal, 1-100 characters */
  custom_id: string;
  /** Title of the popup modal, max 45 characters */
  title: string;
  /** Between 1 and 5 (inclusive) components that make up the modal */
  components: RawComponent[];
}

/**
 * Interaction Callback Response Object
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-callback-interaction-callback-response-object
 */
export interface RawInteractionCallbackResponse {
  /** The interaction object associated with the interaction response. */
  interaction: RawInteractionCallback;
  /** The resource that was created by the interaction response. */
  resource?: RawInteractionCallbackResource;
}

/**
 * Interaction Callback Object
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-callback-interaction-callback-object
 */
export interface RawInteractionCallback {
  /** ID of the interaction */
  id: Snowflake;
  /** Interaction type */
  type: InteractionType;
  /** Instance ID of the Activity if one was launched or joined */
  activity_instance_id?: string;
  /** ID of the message that was created by the interaction */
  response_message_id?: Snowflake;
  /** Whether the message is in a loading state */
  response_message_loading?: boolean;
  /** Whether the response message is ephemeral */
  response_message_ephemeral?: boolean;
}

/**
 * Interaction Callback Resource Object
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-callback-interaction-callback-resource-object
 */
export interface RawInteractionCallbackResource {
  /** Interaction callback type */
  type: InteractionCallbackType;
  /** Represents the Activity launched by this interaction. */
  activity_instance?: RawInteractionCallbackActivityInstanceResource;
  /** Message created by the interaction. */
  message?: RawMessage;
}

/**
 * Interaction Callback Activity Instance Resource
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-callback-interaction-callback-activity-instance-resource
 */
export interface RawInteractionCallbackActivityInstanceResource {
  /** Instance ID of the Activity if one was launched or joined. */
  id: string;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#create-interaction-response-query-string-params
 */
export interface CreateInteractionResponseQuery {
  /** Whether to include an interaction callback object as the response */
  with_response?: boolean;
}

/**
 * Interaction Context Types
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-interaction-context-types
 */
export const InteractionContextType = {
  /** Interaction can be used within servers */
  Guild: 0,
  /** Interaction can be used within DMs with the app's bot user */
  BotDm: 1,
  /** Interaction can be used within Group DMs and DMs other than the app's bot user */
  PrivateChannel: 2,
} as const;
export type InteractionContextType =
  (typeof InteractionContextType)[keyof typeof InteractionContextType];

/**
 * Interaction Data: its shape depends on the interaction type.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-interaction-data
 */
export type RawInteractionData =
  RawApplicationCommandData | RawMessageComponentData | RawModalSubmitData;

/**
 * Interaction Callback Data: its shape depends on the callback type.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-interaction-callback-data-structure
 */
export type RawInteractionCallbackData =
  | RawInteractionCallbackMessageData
  | RawInteractionCallbackAutocompleteData
  | RawInteractionCallbackModalData;
