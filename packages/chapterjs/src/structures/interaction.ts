import {
  CreateFollowupMessage,
  CreateInteractionResponse,
  DeleteOriginalInteractionResponse,
  EditOriginalInteractionResponse,
  GetOriginalInteractionResponse,
} from '../discord/endpoints.js';
import type { ModalComponent } from '../components/instance.js';
import { renderedOf } from '../components/instance.js';
import type { Locale, Snowflake } from '../discord/types/common.js';
import {
  InteractionCallbackType,
  type RawInteraction,
  type RawInteractionCallbackModalData,
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
import { resolve } from '../components/instance.js';
import { translatorOf } from '../messages/translate.js';
import type { Translator } from '../messages/messages.js';
import type { User } from './user.js';

export type InteractionData = Omit<
  RawInteraction,
  'user' | 'member' | 'message'
>;

/** Only the framework reads how far an interaction was answered. */
export let isUpdating: (interaction: Interaction) => boolean;
/** Answers with a change of the message: see `ComponentInteraction.update()`. */
let updateMessage: (
  interaction: Interaction,
  message: string | MessageEditOptions
) => Promise<Message>;
let deferUpdateMessage: (interaction: Interaction) => Promise<void>;
let openModal: (
  interaction: Interaction,
  form: ModalComponent
) => Promise<void>;

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
  /**
   * `deferred`: "thinking…" is shown, the answer is a new message.
   * `updating`: the answer is a change of the message of the component,
   * nothing is shown meanwhile.
   */
  #state: 'waiting' | 'deferred' | 'updating' | 'answered' = 'waiting';
  /** Answers are sent one after the other, in the order they were asked. */
  #queue: Promise<void> = Promise.resolve();

  static {
    isUpdating = interaction => interaction.#state === 'updating';
    updateMessage = (interaction, message) => {
      const { body, files } = buildMessage(message, {
        edit: true,
        t: interaction.#t(interaction.#ephemeral),
      });
      return interaction.#run(async () => {
        const { rest, entities } = ctxOf(interaction);
        const {
          id,
          token,
          application_id: applicationId,
        } = dataOf(interaction);
        if (
          interaction.#state === 'answered' ||
          interaction.#state === 'deferred'
        ) {
          throw new Error(
            'This interaction was already answered: the message can no longer be changed through it. Use interaction.message.edit() to change the message, or interaction.followUp() to send another one.'
          );
        }
        if (interaction.#state === 'updating') {
          const raw = await rest.request(
            EditOriginalInteractionResponse,
            [applicationId, token],
            { body, files, auth: false }
          );
          interaction.#state = 'answered';
          return entities.message(raw, interaction.guildId ?? undefined);
        }
        const response = await rest.request(
          CreateInteractionResponse,
          [id, token],
          {
            body: { type: InteractionCallbackType.UpdateMessage, data: body },
            query: { with_response: true },
            files,
            auth: false,
          }
        );
        interaction.#state = 'answered';
        const raw =
          response?.resource?.message ??
          (await rest.request(
            GetOriginalInteractionResponse,
            [applicationId, token],
            { auth: false }
          ));
        return entities.message(raw, interaction.guildId ?? undefined);
      });
    };
    deferUpdateMessage = interaction =>
      interaction.#run(async () => {
        if (interaction.#state !== 'waiting') return;
        const { id, token } = dataOf(interaction);
        await ctxOf(interaction).rest.request(
          CreateInteractionResponse,
          [id, token],
          {
            body: { type: InteractionCallbackType.DeferredUpdateMessage },
            auth: false,
          }
        );
        interaction.#state = 'updating';
      });
    openModal = (interaction, form) => {
      const rendered = renderedOf(form, 'The form given to showModal()');
      if (rendered.kind !== 'modal') {
        throw new TypeError(
          `showModal() opens a form of src/components/modals/, got a ${rendered.kind}.`
        );
      }
      return interaction.#run(async () => {
        if (interaction.#state !== 'waiting') {
          throw new Error(
            'A form can only be the first answer to an interaction: call interaction.showModal() before reply() or defer(), and the framework waits for it.'
          );
        }
        const { id, token } = dataOf(interaction);
        await ctxOf(interaction).rest.request(
          CreateInteractionResponse,
          [id, token],
          {
            body: {
              type: InteractionCallbackType.Modal,
              // A form is seen by the person alone: in their language.
              data: resolve(
                rendered,
                translatorOf(ctxOf(interaction), {
                  person: interaction.locale,
                  ephemeral: true,
                })
              ).raw as RawInteractionCallbackModalData,
            },
            auth: false,
          }
        );
        interaction.#state = 'answered';
      });
    };
  }

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
    return this.#state === 'deferred' || this.#state === 'updating';
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

  /** `t` for an answer: the person when they alone see it, else the server. */
  #t(ephemeral: boolean | undefined): Translator {
    return translatorOf(ctxOf(this), {
      person: this.locale,
      guild: this.guild,
      ephemeral: ephemeral ?? this.#ephemeral,
    }) as Translator;
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
    const { body, files } = buildMessage(options, {
      t: this.#t(options.ephemeral),
    });
    return this.#run(async () => {
      const { rest, entities } = ctxOf(this);
      const { id, token, application_id: applicationId } = dataOf(this);
      if (this.#state === 'answered') {
        throw new Error(
          'This interaction was already answered. Use interaction.followUp() to send another message, or interaction.edit() to change the answer.'
        );
      }
      if (this.#state === 'updating') {
        // The pending answer is a change of the message of the component:
        // a new message is a follow-up, which looks the same to the person.
        const raw = await rest.request(
          CreateFollowupMessage,
          [applicationId, token],
          {
            body: {
              ...body,
              flags: this.#flags(options.ephemeral, body.flags),
            },
            files,
            auth: false,
          }
        );
        this.#state = 'answered';
        return entities.message(raw, this.guildId ?? undefined);
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
    const { body, files } = buildMessage(message, {
      edit: true,
      t: this.#t(undefined),
    });
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
    const { body, files } = buildMessage(options, {
      t: this.#t(options.ephemeral),
    });
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

  /**
   * Opens a form, as the answer: `showModal(report({ userId }))`, with a
   * form of `src/components/modals/`. It must be the first answer, and the
   * person has as long as they want to fill it in.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-modal
   */
  showModal(form: ModalComponent): Promise<void> {
    return openModal(this, form);
  }
}

/**
 * Someone clicked a button or picked something in a select menu of a
 * message of the bot. It can answer like a command, or change the message
 * the component is on.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-message-component-data-structure
 */
export class ComponentInteraction extends Interaction {
  /** The message the component is on. */
  readonly message: Message;

  constructor(
    ctx: Context,
    data: InteractionData,
    user: User,
    options: { ephemeral?: boolean; message: Message }
  ) {
    super(ctx, data, user, options);
    this.message = options.message;
  }

  /**
   * Changes the message the component is on, as the answer: its text, its
   * embeds, its components, its files. Only what you pass changes;
   * `components: []` removes the buttons and menus.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type
   */
  update(message: string | MessageEditOptions): Promise<Message> {
    return updateMessage(this, message);
  }

  /**
   * Tells Discord the message will change later: the person sees nothing
   * meanwhile, and `update()` can then take up to 15 minutes. The
   * framework does it by itself when an answer takes long.
   */
  deferUpdate(): Promise<void> {
    return deferUpdateMessage(this);
  }

  /**
   * Opens a form, as the answer: `showModal(report({ userId }))`, with a
   * form of `src/components/modals/`. It must be the first answer.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-modal
   */
  showModal(form: ModalComponent): Promise<void> {
    return openModal(this, form);
  }
}

/**
 * Someone sent a form of the bot. It can answer like a command; when a
 * button or a menu opened the form, it can also change their message.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object-modal-submit-data-structure
 */
export class ModalInteraction extends Interaction {
  /** The message whose button or menu opened the form; `null` when a command did. */
  readonly message: Message | null;

  constructor(
    ctx: Context,
    data: InteractionData,
    user: User,
    options: { ephemeral?: boolean; message: Message | null }
  ) {
    super(ctx, data, user, options);
    this.message = options.message;
  }

  /**
   * Changes the message whose button or menu opened the form, as the
   * answer. Only what you pass changes.
   * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type
   */
  update(message: string | MessageEditOptions): Promise<Message> {
    if (!this.message) {
      return Promise.reject(
        new Error(
          'This form was opened by a command, not by a button or a menu: there is no message to change. Use interaction.reply().'
        )
      );
    }
    return updateMessage(this, message);
  }

  /**
   * Tells Discord the message that opened the form will change later: the
   * person sees nothing meanwhile.
   */
  deferUpdate(): Promise<void> {
    if (!this.message) {
      return Promise.reject(
        new Error(
          'This form was opened by a command, not by a button or a menu: there is no message to change. Use interaction.defer().'
        )
      );
    }
    return deferUpdateMessage(this);
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
