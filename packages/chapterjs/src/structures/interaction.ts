import {
  CreateFollowupMessage,
  CreateInteractionResponse,
  DeleteOriginalInteractionResponse,
  EditOriginalInteractionResponse,
  GetOriginalInteractionResponse,
} from '../discord/endpoints.js';
import type { Locale, Snowflake } from '../discord/types/common.js';
import {
  InteractionCallbackType,
  type RawInteraction,
} from '../discord/types/interaction.js';
import { MessageFlags } from '../discord/types/message.js';
import type { Camelize } from '../util/case.js';
import { ctxOf, dataOf, IdStructure } from './base.js';
import type {
  DMChannel,
  GuildTextBasedChannel,
  TextBasedChannel,
} from './channel.js';
import type { Context } from './context.js';
import { findGuild, knownChannel, knownMember } from './known.js';
import type { Guild } from './guild.js';
import type { GuildMember } from './member.js';
import type { Message } from './message.js';
import {
  buildMessage,
  type MessageEditOptions,
  type MessageOptions,
} from './payload.js';
import type { User } from './user.js';

export type InteractionData = Omit<RawInteraction, 'user' | 'member'>;

/** An answer to an interaction: its text, or its options. */
export type InteractionReply = string | InteractionReplyOptions;

/** The options of an answer: everything a message takes, except `replyTo` and `stickers`. */
export interface InteractionReplyOptions extends Omit<
  MessageOptions,
  'replyTo' | 'stickers'
> {
  /**
   * Only show the answer to who used the command. By default: what the
   * command says with its own `ephemeral`, else visible to everyone.
   */
  ephemeral?: boolean;
}

/**
 * Someone used something of the bot (a command...) and waits for an answer.
 * Discord wants a first answer within 3 seconds, and accepts edits and
 * other messages for 15 minutes.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding
 */
export class Interaction extends IdStructure<InteractionData> {
  /** Who did it. */
  readonly user: User;
  readonly #ephemeral: boolean;
  #state: 'waiting' | 'deferred' | 'answered' = 'waiting';
  /** Answers are sent one after the other, in the order they were asked. */
  #queue: Promise<void> = Promise.resolve();

  constructor(
    ctx: Context,
    data: InteractionData,
    user: User,
    { ephemeral = false }: { ephemeral?: boolean } = {}
  ) {
    super(ctx, data);
    this.user = user;
    this.#ephemeral = ephemeral;
  }

  /** The id of the server; `null` in a private message. */
  get guildId(): Snowflake | null {
    return dataOf(this).guild_id ?? null;
  }

  /** The id of the channel it happened in. */
  get channelId(): Snowflake {
    return dataOf(this).channel_id ?? this.channel.id;
  }

  /** The server it happened in; `null` in a private message. */
  get guild(): Guild | null {
    return findGuild(this, this.guildId);
  }

  /** The channel it happened in: Discord sends it with the interaction. */
  get channel(): TextBasedChannel {
    const id = dataOf(this).channel_id;
    const channel =
      (id ? ctxOf(this).cache.channels.get(id) : undefined) ??
      knownChannel(this);
    if (!channel?.isTextBased()) {
      throw new Error('This interaction came without its channel.');
    }
    return channel;
  }

  /** Who did it, as a member of the server; `null` in a private message. */
  get member(): GuildMember | null {
    return this.guild?.members.get(this.user.id) ?? knownMember(this) ?? null;
  }

  /** The language of the person: use it to answer in their language. */
  get locale(): Locale {
    // Discord sends it with everything a person does (all but pings).
    return dataOf(this).locale!;
  }

  /** Whether an answer was sent, or promised with `defer()`. */
  get answered(): boolean {
    return this.#state !== 'waiting';
  }

  /** Whether `defer()` was called and the answer is still to come. */
  get deferred(): boolean {
    return this.#state === 'deferred';
  }

  /** The data of the interaction, without its token: a token is a secret. */
  override toJSON(): Camelize<InteractionData> {
    const { token: _token, ...data } = super.toJSON();
    return data as Camelize<InteractionData>;
  }

  /**
   * Runs one answer after the previous ones. Written with `await` so that an
   * error keeps the line of user code that asked for the answer.
   */
  async #run<T>(action: () => Promise<T>): Promise<T> {
    const previous = this.#queue;
    let release!: () => void;
    this.#queue = new Promise<void>(resolve => (release = resolve));
    await previous;
    try {
      return await action();
    } finally {
      release();
    }
  }

  #flags(ephemeral: boolean | undefined, flags = 0): number {
    return (ephemeral ?? this.#ephemeral)
      ? flags | MessageFlags.Ephemeral
      : flags;
  }

  /**
   * Answers. If `defer()` was called (by you, or by the framework because
   * the answer was taking long), this completes the pending answer.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#create-interaction-response
   */
  reply(message: InteractionReply): Promise<Message> {
    const options =
      typeof message === 'string' ? { content: message } : message;
    const { body, files } = buildMessage(options);
    return this.#run(async () => {
      const { rest, entities } = ctxOf(this);
      const { id, token, application_id: applicationId } = dataOf(this);
      if (this.#state === 'answered') {
        throw new Error(
          'This interaction was already answered. Use interaction.followUp() to send another message, or interaction.edit() to change the answer.'
        );
      }
      if (this.#state === 'deferred') {
        // Whether the answer is ephemeral was decided when deferring.
        const raw = await rest.request(
          EditOriginalInteractionResponse,
          [applicationId, token],
          { body, files, auth: false }
        );
        this.#state = 'answered';
        return entities.message(raw, this.guildId ?? undefined);
      }
      const response = await rest.request(
        CreateInteractionResponse,
        [id, token],
        {
          body: {
            type: InteractionCallbackType.ChannelMessageWithSource,
            data: {
              ...body,
              flags: this.#flags(options.ephemeral, body.flags),
            },
          },
          query: { with_response: true },
          files,
          auth: false,
        }
      );
      this.#state = 'answered';
      const raw =
        response?.resource?.message ??
        (await rest.request(
          GetOriginalInteractionResponse,
          [applicationId, token],
          { auth: false }
        ));
      return entities.message(raw, this.guildId ?? undefined);
    });
  }

  /**
   * Tells Discord the answer is coming: the person sees "thinking…" and
   * `reply()` can then take up to 15 minutes. The framework does it by
   * itself when an answer takes long; call it yourself to choose when.
   */
  defer({ ephemeral }: { ephemeral?: boolean } = {}): Promise<void> {
    return this.#run(async () => {
      if (this.#state !== 'waiting') return;
      const { id, token } = dataOf(this);
      await ctxOf(this).rest.request(CreateInteractionResponse, [id, token], {
        body: {
          type: InteractionCallbackType.DeferredChannelMessageWithSource,
          data: { flags: this.#flags(ephemeral) },
        },
        auth: false,
      });
      this.#state = 'deferred';
    });
  }

  /**
   * Changes the answer.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#edit-original-interaction-response
   */
  edit(message: string | MessageEditOptions): Promise<Message> {
    const { body, files } = buildMessage(message, { edit: true });
    return this.#run(async () => {
      if (this.#state === 'waiting') {
        throw new Error(
          'There is no answer to edit yet: call interaction.reply() first.'
        );
      }
      const { rest, entities } = ctxOf(this);
      const { token, application_id: applicationId } = dataOf(this);
      const raw = await rest.request(
        EditOriginalInteractionResponse,
        [applicationId, token],
        { body, files, auth: false }
      );
      this.#state = 'answered';
      return entities.message(raw, this.guildId ?? undefined);
    });
  }

  /**
   * Sends another message, after the answer.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#create-followup-message
   */
  followUp(message: InteractionReply): Promise<Message> {
    const options =
      typeof message === 'string' ? { content: message } : message;
    const { body, files } = buildMessage(options);
    return this.#run(async () => {
      if (this.#state === 'waiting') {
        throw new Error(
          'A follow-up comes after an answer: call interaction.reply() first.'
        );
      }
      const { rest, entities } = ctxOf(this);
      const { token, application_id: applicationId } = dataOf(this);
      const raw = await rest.request(
        CreateFollowupMessage,
        [applicationId, token],
        {
          body: { ...body, flags: this.#flags(options.ephemeral, body.flags) },
          files,
          auth: false,
        }
      );
      return entities.message(raw, this.guildId ?? undefined);
    });
  }

  /**
   * Deletes the answer.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#delete-original-interaction-response
   */
  delete(): Promise<void> {
    return this.#run(async () => {
      const { token, application_id: applicationId } = dataOf(this);
      await ctxOf(this).rest.request(
        DeleteOriginalInteractionResponse,
        [applicationId, token],
        { auth: false }
      );
    });
  }
}

/** Someone used a slash command. */
export class CommandInteraction extends Interaction {
  /** The command as the person typed it: `/mod ban`. */
  readonly commandName: string;

  constructor(
    ctx: Context,
    data: InteractionData,
    user: User,
    options: { ephemeral?: boolean; commandName: string }
  ) {
    super(ctx, data, user, options);
    this.commandName = options.commandName;
  }
}

/**
 * A slash command used in a server: what a command receives by default.
 * Discord sends the server, the member and the channel with it.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-interaction-structure
 */
export interface GuildCommandInteraction extends CommandInteraction {
  /** The id of the server. */
  readonly guildId: Snowflake;
  /** The server it happened in. */
  readonly guild: Guild;
  /** Who did it, as a member of the server. */
  readonly member: GuildMember;
  /** The channel it happened in. */
  readonly channel: GuildTextBasedChannel;
}

/**
 * A slash command used in a private message with the bot, for a command
 * that works in both places (`where: 'both'`): there is no server, which is
 * how it is told apart from `GuildCommandInteraction`.
 */
export interface PrivateCommandInteraction extends CommandInteraction {
  /** No server: it happened in a private message. */
  readonly guildId: null;
  /** No server: it happened in a private message. */
  readonly guild: null;
  /** No member: the person is `user`. */
  readonly member: null;
  /** The private conversation it happened in. */
  readonly channel: DMChannel;
}

/**
 * A slash command that is only used in private messages with the bot
 * (`where: 'dm'`): nothing about a server exists on it.
 */
export interface DmCommandInteraction extends Omit<
  CommandInteraction,
  'guildId' | 'guild' | 'member' | 'channel'
> {
  /** The private conversation it happened in. */
  readonly channel: DMChannel;
}
