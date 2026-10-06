// Turns what users pass to send or edit a message into what Discord
// expects. Used by everything that sends a message: channels, replies,
// webhooks, and later interactions.

import { isAssetFile, readAsset, type AssetFile } from '../assets/asset.js';
import { isEmbedFile, type EmbedFile } from '../components/embed.js';
import type { MessageComponent } from '../components/instance.js';
import { renderComponents } from '../components/render.js';
import { Limits } from '../discord/api.js';
import type { Snowflake } from '../discord/types/common.js';
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
  /** Up to 10 embeds: written here, or files of `src/components/embeds/`. */
  embeds?: (Embed | EmbedFile<[]>)[];
  /**
   * Buttons, select menus and layout components, made by ChapterJS: the
   * files of `src/components/` and `row()`, `text()`, `container()`...
   */
  components?: MessageComponent[];
  /** Up to 10 files to attach: their content, or `asset()` for a file of `public/`. */
  files?: (FileInput | AssetFile)[];
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

/**
 * Checks one embed against the limits of Discord. `name` is how the embed
 * is called in messages ("embed 1", "this embed").
 * @returns how many characters it holds, which add up per message
 * @see https://docs.discord.com/developers/resources/message#embed-object-embed-limits
 */
export function checkEmbed(embed: Embed, name: string): number {
  if (typeof embed !== 'object' || embed === null) {
    throw new TypeError(
      `${name} is an object like { title: '...' }, got ${embed === null ? 'null' : typeof embed}.`
    );
  }
  let total = 0;
  const check = (what: string, text: string | undefined, max: number) => {
    const length = count(text);
    total += length;
    if (length > max) {
      throw new RangeError(
        `The ${what} of ${name} is ${length} characters long: Discord accepts ${max} at most.`
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
      `${name[0]!.toUpperCase()}${name.slice(1)} has ${fields.length} fields: Discord accepts ${Limits.EmbedFields} at most.`
    );
  }
  fields.forEach((field, at) => {
    check(`name of field ${at + 1}`, field.name, Limits.EmbedFieldName);
    check(`value of field ${at + 1}`, field.value, Limits.EmbedFieldValue);
  });
  return total;
}

/** The embeds of a message, with the files of `src/components/embeds/` called. */
function resolveEmbeds(embeds: readonly (Embed | EmbedFile<[]>)[]): Embed[] {
  if (!Array.isArray(embeds)) {
    throw new TypeError(
      `The embeds of a message are a list, got ${typeof embeds}.`
    );
  }
  return embeds.map((embed, index) => {
    if (isEmbedFile(embed)) return embed();
    if (typeof embed === 'function') {
      throw new TypeError(
        `Embed ${index + 1} of the message is a function: an embed is an object like { title: '...' }, or a file of src/components/embeds/.`
      );
    }
    return embed;
  });
}

function checkEmbeds(embeds: Embed[]): void {
  if (embeds.length > Limits.MessageEmbeds) {
    throw new RangeError(
      `A message has ${Limits.MessageEmbeds} embeds at most, got ${embeds.length}.`
    );
  }
  let total = 0;
  embeds.forEach((embed, index) => {
    total += checkEmbed(embed, `embed ${index + 1}`);
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
  const { content, components, files, stickers, poll } = input;
  const embeds = input.embeds ? resolveEmbeds(input.embeds) : undefined;

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
  const rendered = components ? renderComponents(components) : undefined;
  if (rendered?.v2 && (count(content) > 0 || embeds?.length)) {
    throw new TypeError(
      'A message built with texts, sections, galleries, files, separators or containers takes no content and no embeds: Discord shows components only. Put the text in text() and the embed in a container().'
    );
  }
  if (rendered?.v2 && poll) {
    throw new TypeError(
      "A message built with components only can't have a poll."
    );
  }
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
    !rendered?.raw.length &&
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
  if (rendered) body.components = rendered.raw;
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
  // Discord wants to be told when a message is made of components only.
  if (rendered?.v2) flags |= MessageFlags.IsComponentsV2;
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
      if (isAssetFile(file)) {
        return {
          name: file.name,
          data: () => readAsset(file),
          contentType: file.contentType,
        };
      }
      if (
        typeof file.data === 'function' ||
        (typeof file.data !== 'string' && typeof file.data !== 'object') ||
        file.data === null
      ) {
        throw new TypeError(
          `The data of the file ${file.name} is its content (a text, a Buffer, an ArrayBuffer or a Blob), or asset('...') for a file of public/.`
        );
      }
      return {
        name: file.name,
        data: file.data,
        contentType: file.contentType,
      };
    });
    const names = new Set<string>();
    for (const { name } of restFiles) {
      if (names.has(name)) {
        throw new TypeError(
          `Two files of the message are named ${name}: Discord tells them apart by their name. Give one another name (asset(path, { name: '...' })).`
        );
      }
      names.add(name);
    }
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
