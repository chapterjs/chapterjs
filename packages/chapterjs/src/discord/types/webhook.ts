import type { RawChannel } from './channel.js';
import type { ImageData, Snowflake } from './common.js';
import type { RawComponent } from './component.js';
import type { RawGuild } from './guild.js';
import type {
  RawAllowedMentions,
  RawAttachmentRequest,
  RawEmbed,
} from './message.js';
import type { RawPollCreateRequest } from './poll.js';
import type { RawUser } from './user.js';

/**
 * Webhook Structure
 * @see https://docs.discord.com/developers/resources/webhook#webhook-object-webhook-structure
 */
export interface RawWebhook {
  /** the id of the webhook */
  id: Snowflake;
  /** the type of the webhook */
  type: WebhookType;
  /** the guild id this webhook is for, if any */
  guild_id?: Snowflake | null;
  /** the channel id this webhook is for, if any */
  channel_id: Snowflake | null;
  /** the user this webhook was created by (not returned when getting a webhook with its token) */
  user?: RawUser;
  /** the default name of the webhook */
  name: string | null;
  /** the default user avatar hash of the webhook */
  avatar: string | null;
  /** the secure token of the webhook (returned for Incoming Webhooks) */
  token?: string;
  /** the bot/OAuth2 application that created this webhook */
  application_id: Snowflake | null;
  /** the guild of the channel that this webhook is following (returned for Channel Follower Webhooks) */
  source_guild?: Partial<RawGuild>;
  /** the channel that this webhook is following (returned for Channel Follower Webhooks) */
  source_channel?: Partial<RawChannel>;
  /** the url used for executing the webhook (returned by the webhooks OAuth2 flow) */
  url?: string;
}

/**
 * Webhook Types
 * @see https://docs.discord.com/developers/resources/webhook#webhook-object-webhook-types
 */
export const WebhookType = {
  /** Incoming Webhooks can post messages to channels with a generated token */
  Incoming: 1,
  /** Channel Follower Webhooks are internal webhooks used with Channel Following to post new messages into channels */
  ChannelFollower: 2,
  /** Application webhooks are webhooks used with Interactions */
  Application: 3,
} as const;
export type WebhookType = (typeof WebhookType)[keyof typeof WebhookType];

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/webhook#create-webhook-json-params
 */
export interface CreateWebhookJSONParams {
  /** name of the webhook (1-80 characters) */
  name: string;
  /** image for the default webhook avatar */
  avatar?: ImageData | null;
}

/**
 * JSON Params
 * @see https://docs.discord.com/developers/resources/webhook#modify-webhook-json-params
 */
export interface ModifyWebhookJSONParams {
  /** the default name of the webhook */
  name?: string;
  /** image for the default webhook avatar */
  avatar?: ImageData | null;
  /** the new channel id this webhook should be moved to */
  channel_id?: Snowflake;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/webhook#execute-webhook-query-string-params
 */
export interface ExecuteWebhookQuery {
  /** waits for server confirmation of message send before response, and returns the created message body (defaults to `false`; when `false` a message that is not saved does not return an error) */
  wait?: boolean;
  /** Send a message to the specified thread within a webhook's channel. The thread will automatically be unarchived. */
  thread_id?: Snowflake;
  /** whether to respect the `components` field of the request. When enabled, allows application-owned webhooks to use all components and non-owned webhooks to use non-interactive components. (defaults to `false`) */
  with_components?: boolean;
}

/**
 * JSON/Form Params
 * @see https://docs.discord.com/developers/resources/webhook#execute-webhook-json/form-params
 */
export interface ExecuteWebhookJSONParams {
  /** the message contents (up to 2000 characters) */
  content?: string;
  /** override the default username of the webhook */
  username?: string;
  /** override the default avatar of the webhook */
  avatar_url?: string;
  /** true if this is a TTS message */
  tts?: boolean;
  /** embedded `rich` content */
  embeds?: RawEmbed[];
  /** allowed mentions for the message */
  allowed_mentions?: RawAllowedMentions;
  /** the components to include with the message */
  components?: RawComponent[];
  /** JSON encoded body of non-file params */
  payload_json?: string;
  /** metadata for the attachments */
  attachments?: Partial<RawAttachmentRequest>[];
  /** message flags combined as a bitfield (only `SUPPRESS_EMBEDS`, `SUPPRESS_NOTIFICATIONS` and `IS_COMPONENTS_V2` can be set) */
  flags?: number;
  /** name of thread to create (requires the webhook channel to be a forum or media channel) */
  thread_name?: string;
  /** array of tag ids to apply to the thread (requires the webhook channel to be a forum or media channel) */
  applied_tags?: Snowflake[];
  /** A poll! */
  poll?: RawPollCreateRequest;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/webhook#execute-slackcompatible-webhook-query-string-params
 */
export interface ExecuteSlackCompatibleWebhookQuery {
  /** id of the thread to send the message in */
  thread_id?: Snowflake;
  /** waits for server confirmation of message send before response (defaults to `true`; when `false` a message that is not saved does not return an error) */
  wait?: boolean;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/webhook#execute-githubcompatible-webhook-query-string-params
 */
export interface ExecuteGitHubCompatibleWebhookQuery {
  /** id of the thread to send the message in */
  thread_id?: Snowflake;
  /** waits for server confirmation of message send before response (defaults to `true`; when `false` a message that is not saved does not return an error) */
  wait?: boolean;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/webhook#get-webhook-message-query-string-params
 */
export interface GetWebhookMessageQuery {
  /** id of the thread the message is in */
  thread_id?: Snowflake;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/webhook#edit-webhook-message-query-string-params
 */
export interface EditWebhookMessageQuery {
  /** id of the thread the message is in */
  thread_id?: Snowflake;
  /** whether to respect the `components` field of the request. When enabled, allows application-owned webhooks to use all components and non-owned webhooks to use non-interactive components. (defaults to `false`) */
  with_components?: boolean;
}

/**
 * JSON/Form Params
 * @see https://docs.discord.com/developers/resources/webhook#edit-webhook-message-json/form-params
 */
export interface EditWebhookMessageJSONParams {
  /** the message contents (up to 2000 characters) */
  content?: string;
  /** embedded `rich` content */
  embeds?: RawEmbed[];
  /** message flags combined as a bitfield (`SUPPRESS_EMBEDS` and `IS_COMPONENTS_V2` only) */
  flags?: number;
  /** allowed mentions for the message */
  allowed_mentions?: RawAllowedMentions;
  /** the components to include with the message */
  components?: RawComponent[];
  /** JSON encoded body of non-file params (multipart/form-data only) */
  payload_json?: string;
  /** attached files to keep and their metadata */
  attachments?: Partial<RawAttachmentRequest>[];
  /** A poll! */
  poll?: RawPollCreateRequest;
}

/**
 * Query String Params
 * @see https://docs.discord.com/developers/resources/webhook#delete-webhook-message-query-string-params
 */
export interface DeleteWebhookMessageQuery {
  /** id of the thread the message is in */
  thread_id?: Snowflake;
}
