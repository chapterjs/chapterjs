// Runs the command someone used: finds its file, turns what Discord sent
// into what `run` receives, and makes sure the person always gets an answer.

import { setTimeout as sleep } from 'node:timers/promises';
import { Permissions } from '../discord/permissions.js';
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
} from '../discord/types/application-command.js';
import type { RawChannel } from '../discord/types/channel.js';
import type { RawGuildMember } from '../discord/types/guild.js';
import {
  InteractionType,
  type RawApplicationCommandData,
  type RawApplicationCommandInteractionDataOption,
  type RawInteraction,
} from '../discord/types/interaction.js';
import { DiscordApiError } from '../rest/errors.js';
import type { Context } from '../structures/context.js';
import { CommandInteraction } from '../structures/interaction.js';
import { remember } from '../structures/known.js';
import { toCamelCase } from '../util/case.js';
import type { CommandContext } from './command.js';
import { commandName, type CommandEntry } from './tree.js';

export interface CommandRouterOptions {
  /** A `run` threw: reported with the file it comes from. */
  onError: (file: string, error: unknown) => void;
  /** Something the developer should know, that is not an error of theirs. */
  onWarning: (file: string, message: string) => void;
  /**
   * After how long without an answer the framework defers, in milliseconds.
   * Discord gives 3 seconds: the default leaves room for the request.
   */
  deferAfter?: number;
}

const SUB = ApplicationCommandOptionType.SubCommand;
const GROUP = ApplicationCommandOptionType.SubCommandGroup;

export class CommandRouter {
  #commands = new Map<string, CommandEntry>();
  readonly #options: CommandRouterOptions;

  constructor(options: CommandRouterOptions) {
    this.#options = options;
  }

  /** Replaces every command (after a load or a reload). */
  set(entries: Iterable<CommandEntry>): void {
    const commands = new Map<string, CommandEntry>();
    for (const entry of entries) {
      commands.set(entry.command.path.join(' '), entry);
    }
    this.#commands = commands;
  }

  /** Handles an Interaction Create event, if it is a slash command. */
  dispatch(ctx: Context, raw: RawInteraction): void {
    if (raw.type !== InteractionType.ApplicationCommand) return;
    const data = raw.data as RawApplicationCommandData | undefined;
    if (!data || data.type !== ApplicationCommandType.ChatInput) return;

    // `/mod roles add` comes as a command with nested options.
    const path = [data.name];
    let given = data.options ?? [];
    while (given[0] && (given[0].type === SUB || given[0].type === GROUP)) {
      path.push(given[0].name);
      given = given[0].options ?? [];
    }
    const entry = this.#commands.get(path.join(' '));

    const { user: rawUser, member: rawMember, ...rest } = raw;
    const author = rawMember?.user ?? rawUser;
    if (!author) return;
    const user = ctx.entities.user(author);
    const interaction = new CommandInteraction(ctx, rest, user, {
      ephemeral: entry?.command.ephemeral ?? false,
      commandName: commandName(path),
    });
    const refuse = (message: string): void => {
      interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    };
    if (!entry) {
      // Still registered on Discord, but its file is gone or broken.
      refuse('This command is not available right now.');
      return;
    }
    const { command, file } = entry;

    // In a server Discord sends the member, in a private message the user.
    const guild = raw.guild_id
      ? (ctx.cache.guilds.get(raw.guild_id) ?? null)
      : null;
    const member =
      raw.guild_id && rawMember
        ? ctx.entities.member(raw.guild_id, rawMember)
        : null;
    const inGuild = guild !== null && member !== null;
    if (command.where === 'guild' && !inGuild) {
      refuse('This command can only be used in a server.');
      return;
    }
    if (command.where === 'dm' && raw.guild_id) {
      refuse('This command can only be used in a private message with me.');
      return;
    }
    if (raw.guild_id && !inGuild) {
      // A server the bot is not in: nothing of it is known.
      refuse('This command can not be used here.');
      return;
    }
    // What the member can do where the command was used, overwrites
    // included: Discord computes it for us.
    if (command.permissions !== 0n && rawMember) {
      const missing = new Permissions(rawMember.permissions ?? '0').missing(
        command.permissions
      );
      if (missing.length > 0) {
        refuse(
          `You need the ${missing.join(', ')} permission${missing.length === 1 ? '' : 's'} to use this command.`
        );
        return;
      }
    }

    let options: Record<string, unknown>;
    try {
      options = this.#readOptions(ctx, raw, data, given, entry);
    } catch (error) {
      this.#options.onError(file, error);
      refuse('Something went wrong while running this command.');
      return;
    }
    // Discord sends the channel with the interaction: known without asking.
    const channel =
      (raw.channel_id ? ctx.cache.channels.get(raw.channel_id) : undefined) ??
      (raw.channel?.id
        ? ctx.entities.channel(raw.channel as RawChannel, raw.guild_id)
        : undefined);
    if (!channel?.isTextBased() || (!inGuild && !channel.isDM())) {
      this.#options.onWarning(
        file,
        `${commandName(path)} was used in a channel the bot can't answer in (${channel ? `type ${channel.type}` : 'Discord did not say which'}): it did not run.`
      );
      refuse('This command can not be used here.');
      return;
    }
    remember(interaction, {
      guild: guild ?? undefined,
      member: member ?? undefined,
      channel,
    });
    // What a command receives follows where it works: nothing about a
    // server exists for a command of private messages.
    const context = Object.freeze({
      interaction,
      options: Object.freeze(options),
      user,
      channel,
      ...(command.where === 'dm' ? {} : { guild, member }),
    }) as unknown as CommandContext;

    // Discord wants an answer within 3 seconds: when `run` takes longer,
    // the framework says the answer is coming.
    const stop = new AbortController();
    sleep(this.#options.deferAfter ?? 2000, undefined, { signal: stop.signal })
      .then(() => interaction.defer())
      .catch(() => {});

    new Promise(resolve => resolve(command.run(context)))
      .then(() => {
        if (!interaction.answered) {
          this.#options.onWarning(
            file,
            `${commandName(path)} finished without answering: the person sees "The application did not respond". Call interaction.reply() in run.`
          );
        }
      })
      .catch((error: unknown) => {
        this.#options.onError(file, error);
        // The person gets a plain answer, never the technical details.
        const missingPermission =
          error instanceof DiscordApiError &&
          (error.code === 50013 || error.code === 50001);
        const content = missingPermission
          ? "I don't have the permission to do that here."
          : 'Something went wrong while running this command.';
        const tell = interaction.deferred
          ? interaction.edit(content)
          : interaction.answered
            ? interaction.followUp({ content, ephemeral: true })
            : interaction.reply({ content, ephemeral: true });
        tell.catch(() => {});
      })
      .finally(() => stop.abort());
  }

  /** The value of each declared option, as structures where it applies. */
  #readOptions(
    ctx: Context,
    raw: RawInteraction,
    data: RawApplicationCommandData,
    given: readonly RawApplicationCommandInteractionDataOption[],
    { command }: CommandEntry
  ): Record<string, unknown> {
    const values = new Map(given.map(option => [option.name, option.value]));
    const resolved = data.resolved ?? {};
    const guildId = raw.guild_id;
    const userOf = (id: string) => {
      const rawUser = resolved.users?.[id];
      if (!rawUser) return undefined;
      const member = resolved.members?.[id];
      // The member comes along: remembered, so `guild.members` has it.
      if (member && guildId) {
        ctx.entities.member(guildId, member as RawGuildMember, rawUser);
      }
      return ctx.entities.user(rawUser);
    };
    const roleOf = (id: string) => {
      const role = resolved.roles?.[id];
      return role && guildId ? ctx.entities.role(guildId, role) : undefined;
    };
    const options: Record<string, unknown> = {};
    for (const option of command.options) {
      const value = values.get(option.name);
      if (value === undefined) {
        options[option.name] = undefined;
        continue;
      }
      const id = String(value);
      switch (option.type) {
        case 'user':
          options[option.name] = userOf(id);
          break;
        case 'role':
          options[option.name] = roleOf(id);
          break;
        case 'mentionable':
          options[option.name] = userOf(id) ?? roleOf(id);
          break;
        case 'channel': {
          const partial = resolved.channels?.[id];
          options[option.name] =
            ctx.cache.channels.get(id) ??
            (partial
              ? ctx.entities.channel(partial as RawChannel, guildId)
              : undefined);
          break;
        }
        case 'attachment': {
          const attachment = resolved.attachments?.[id];
          options[option.name] = attachment
            ? toCamelCase(attachment)
            : undefined;
          break;
        }
        default:
          options[option.name] = value;
      }
    }
    return options;
  }
}
