// Turns what users pass to send or edit a message into what Discord
// expects. Used by everything that sends a message: channels, replies,
// webhooks, and later interactions.

import { Limits } from '../discord/api.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawComponent } from '../discord/types/component.js';
import {
  MessageFlags,
  type CreateMessageJSONParams,
  type RawAllowedMentions,
  type RawEmbed,
} from '../discord/types/message.js';
import type { RawPollCreateRequest } from '../discord/types/poll.js';
import type { RestFile } from '../rest/rest.js';
import { toSnakeCase, type Camelize } from '../util/case.js';

/**
 * A rich box in a message: title, description, fields, image...
 * @see https://docs.discord.com/developers/resources/message#embed-object
 */
export type Embed = Camelize<RawEmbed>;
/**
 * A button, a select menu or a layout component of a message.
 * @see https://docs.discord.com/developers/components/reference
 */
export type Component = Camelize<RawComponent>;
/**
 * Who a message is allowed to notify.
 * @see https://docs.discord.com/developers/resources/message#allowed-mentions-object
 */
export type AllowedMentions = Camelize<RawAllowedMentions>;
/**
 * A poll to attach to a message.
 * @see https://docs.discord.com/developers/resources/poll#poll-create-request-object
 */
export type PollInput = Camelize<RawPollCreateRequest>;

/** A file to attach to a message. */
export interface FileInput {
  /** The name of the file, with its extension: `chart.png`. */
  name: string;
  /** The content of the file. */
  data: Blob | Uint8Array | ArrayBuffer | string;
  /** What the file shows, for people who can't see it. */
  description?: string;
  /** Hides the file until it is clicked. */
  spoiler?: boolean;
  /** The media type of the file (`image/png`); guessed from the name when missing. */
  contentType?: string;
}

/** What a message can contain, and how it is sent. */
export interface MessageOptions {
  /** The text of the message (up to 2000 characters). */
  content?: string;
  /** Up to 10 embeds. */
  embeds?: Embed[];
  /** Buttons, select menus and layout components. */
  components?: Component[];
  /** Up to 10 files to attach. */
  files?: FileInput[];
  /** Who the message is allowed to notify. */
  allowedMentions?: AllowedMentions;
  /** The ids of up to 3 stickers of the server. */
  stickers?: Snowflake[];
  /** A poll to attach to the message. */
  poll?: PollInput;
  /** Reads the message aloud. */
  tts?: boolean;
  /** Sends the message without a notification sound. */
  silent?: boolean;
  /** Does not show the previews of the links of the message. */
  suppressEmbeds?: boolean;
  /** The message to reply to. */
  replyTo?: Snowflake | { id: Snowflake };
}

/** A message to send: its text, or its options. */
export type MessageInput = string | MessageOptions;

/** What can be changed in a message that was already sent. */
export type MessageEditOptions = Pick<
  MessageOptions,
  | 'content'
  | 'embeds'
  | 'components'
  | 'files'
  | 'allowedMentions'
  | 'suppressEmbeds'
>;

export interface BuiltMessage {
  body: CreateMessageJSONParams;
  files: RestFile[] | undefined;
}

const count = (text: string | undefined): number => text?.trim().length ?? 0;

function checkEmbeds(embeds: Embed[]): void {
  if (embeds.length > Limits.MessageEmbeds) {
    throw new RangeError(
      `A message has ${Limits.MessageEmbeds} embeds at most, got ${embeds.length}.`
    );
  }
  let total = 0;
  embeds.forEach((embed, index) => {
    const check = (what: string, text: string | undefined, max: number) => {
      const length = count(text);
      total += length;
      if (length > max) {
        throw new RangeError(
          `The ${what} of embed ${index + 1} is ${length} characters long: Discord accepts ${max} at most.`
        );
      }
    };
    check('title', embed.title, Limits.EmbedTitle);
    check('description', embed.description, Limits.EmbedDescription);
    check('footer text', embed.footer?.text, Limits.EmbedFooterText);
    check('author name', embed.author?.name, Limits.EmbedAuthorName);
    const fields = embed.fields ?? [];
    if (fields.length > Limits.EmbedFields) {
      throw new RangeError(
        `Embed ${index + 1} has ${fields.length} fields: Discord accepts ${Limits.EmbedFields} at most.`
      );
    }
    fields.forEach((field, at) => {
      check(`name of field ${at + 1}`, field.name, Limits.EmbedFieldName);
      check(`value of field ${at + 1}`, field.value, Limits.EmbedFieldValue);
    });
  });
  if (total > Limits.EmbedTotal) {
    throw new RangeError(
      `The embeds of the message contain ${total} characters in total: Discord accepts ${Limits.EmbedTotal} at most.`
    );
  }
}

/**
 * Validates a message and builds the request that sends it (or edits it).
 * @see https://docs.discord.com/developers/resources/message#create-message
 */
export function buildMessage(
  input: MessageInput,
  { edit = false }: { edit?: boolean } = {}
): BuiltMessage {
  if (typeof input === 'string') input = { content: input };
  if (typeof input !== 'object' || input === null) {
    throw new TypeError(
      `A message is a text or an object like { content: "Hello" }, got ${input === null ? 'null' : typeof input}.`
    );
  }
  const { content, embeds, components, files, stickers, poll } = input;

  if (content !== undefined && typeof content !== 'string') {
    throw new TypeError(
      `The content of a message is a text, got ${typeof content}.`
    );
  }
  if (content !== undefined && content.length > Limits.MessageContent) {
    throw new RangeError(
      `The message is ${content.length} characters long: Discord accepts ${Limits.MessageContent} at most. Split it in several messages or put the text in a file.`
    );
  }
  if (embeds) checkEmbeds(embeds);
  if (stickers && stickers.length > Limits.MessageStickers) {
    throw new RangeError(
      `A message has ${Limits.MessageStickers} stickers at most, got ${stickers.length}.`
    );
  }
  if (files && files.length > Limits.MessageAttachments) {
    throw new RangeError(
      `A message has ${Limits.MessageAttachments} files at most, got ${files.length}.`
    );
  }
  const empty =
    count(content) === 0 &&
    !embeds?.length &&
    !components?.length &&
    !files?.length &&
    !stickers?.length &&
    !poll;
  if (empty && !edit) {
    throw new TypeError(
      'The message is empty: give it a content, an embed, a file, a component, a sticker or a poll.'
    );
  }

  const body: CreateMessageJSONParams = {};
  if (content !== undefined) body.content = content;
  if (embeds) body.embeds = toSnakeCase<RawEmbed[]>(embeds);
  if (components) body.components = toSnakeCase<RawComponent[]>(components);
  if (input.allowedMentions) {
    body.allowed_mentions = toSnakeCase<RawAllowedMentions>(
      input.allowedMentions
    );
  }
  if (stickers) body.sticker_ids = stickers;
  if (poll) body.poll = toSnakeCase<RawPollCreateRequest>(poll);
  if (input.tts) body.tts = true;
  let flags = 0;
  if (input.silent) flags |= MessageFlags.SuppressNotifications;
  if (input.suppressEmbeds) flags |= MessageFlags.SuppressEmbeds;
  if (flags !== 0 || (edit && input.suppressEmbeds === false)) {
    body.flags = flags;
  }
  if (input.replyTo !== undefined) {
    const id =
      typeof input.replyTo === 'string' ? input.replyTo : input.replyTo.id;
    body.message_reference = { message_id: id };
  }

  let restFiles: RestFile[] | undefined;
  if (files?.length) {
    restFiles = files.map(file => {
      if (typeof file?.name !== 'string' || file.name.trim() === '') {
        throw new TypeError(
          'Every file needs a name with its extension, like "chart.png".'
        );
      }
      return {
        name: file.name,
        data: file.data,
        contentType: file.contentType,
      };
    });
    // Each file is described by the attachment whose id is its index.
    // https://docs.discord.com/developers/reference#uploading-files
    body.attachments = files.map((file, index) => ({
      id: index,
      filename: file.name,
      ...(file.description ? { description: file.description } : {}),
      ...(file.spoiler ? { is_spoiler: true } : {}),
    }));
  }
  return { body, files: restFiles };
}
