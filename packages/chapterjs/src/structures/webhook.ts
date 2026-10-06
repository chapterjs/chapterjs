import {
  DeleteWebhook,
  ExecuteWebhook,
  ModifyWebhook,
} from '../discord/endpoints.js';
import type { Snowflake } from '../discord/types/common.js';
import type {
  ModifyWebhookJSONParams,
  RawWebhook,
} from '../discord/types/webhook.js';
import { toSnakeCase, type Camelize } from '../util/case.js';
import { ctxOf, dataOf, IdStructure } from './base.js';
import type { Message } from './message.js';
import { buildMessage, type MessageOptions } from './payload.js';

/** What a message posted with a webhook can contain. */
export interface WebhookMessageOptions extends Omit<MessageOptions, 'replyTo'> {
  /** Shows this name instead of the name of the webhook. */
  username?: string;
  /** Shows this avatar instead of the avatar of the webhook. */
  avatarURL?: string;
  /** Sends the message in this thread of the channel of the webhook. */
  threadId?: Snowflake;
}

/**
 * A webhook: a way to post messages in a channel under any name.
 * @see https://docs.discord.com/developers/resources/webhook#webhook-object
 */
export class Webhook extends IdStructure<Omit<RawWebhook, 'user'>> {
  /** The default name the webhook posts with. */
  get name(): string | null {
    return dataOf(this).name;
  }

  /** The id of the channel the webhook posts in. */
  get channelId(): Snowflake | null {
    return dataOf(this).channel_id;
  }

  /** The id of the server of the webhook. */
  get guildId(): Snowflake | null {
    return dataOf(this).guild_id ?? null;
  }

  /** The data of the webhook, without its token: a token is a secret. */
  override toJSON(): Camelize<Omit<RawWebhook, 'user'>> {
    const { token: _token, ...data } = super.toJSON();
    return data;
  }

  /** Whether the bot can post with it: only webhooks it created. */
  get canSend(): boolean {
    return typeof dataOf(this).token === 'string';
  }

  /**
   * Posts a message with the webhook.
   * @see https://docs.discord.com/developers/resources/webhook#execute-webhook
   */
  async send(message: string | WebhookMessageOptions): Promise<Message> {
    const { rest, entities } = ctxOf(this);
    const token = dataOf(this).token;
    if (!token) {
      throw new Error(
        'This webhook was not created by the bot: Discord only lets its creator post with it.'
      );
    }
    const options =
      typeof message === 'string' ? { content: message } : message;
    const { body, files } = buildMessage(options);
    const raw = await rest.request(ExecuteWebhook, [this.id, token], {
      body: {
        ...body,
        username: options.username,
        avatar_url: options.avatarURL,
      },
      query: { wait: true, thread_id: options.threadId },
      files,
      auth: false,
    });
    return entities.message(raw!, this.guildId ?? undefined);
  }

  /**
   * Changes the name, the avatar or the channel of the webhook.
   * @see https://docs.discord.com/developers/resources/webhook#modify-webhook
   */
  async edit(
    options: Camelize<ModifyWebhookJSONParams>,
    reason?: string
  ): Promise<Webhook> {
    const { rest, entities } = ctxOf(this);
    const raw = await rest.request(ModifyWebhook, [this.id], {
      body: toSnakeCase<ModifyWebhookJSONParams>(options),
      reason,
    });
    return entities.webhook(raw);
  }

  /**
   * Deletes the webhook.
   * @see https://docs.discord.com/developers/resources/webhook#delete-webhook
   */
  async delete(reason?: string): Promise<void> {
    await ctxOf(this).rest.request(DeleteWebhook, [this.id], { reason });
  }
}
