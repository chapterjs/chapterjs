// Runs the command someone used: finds its file, turns what Discord sent
// into what `run` receives, and makes sure the person always gets an answer.

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
import {
  authorOf,
  placeContext,
  refuse,
  resolvePlace,
  runInteraction,
  type Reporter,
} from '../interactions/dispatch.js';
import type { Context } from '../structures/context.js';
import { CommandInteraction } from '../structures/interaction.js';
import { remember } from '../structures/known.js';
import { toCamelCase } from '../util/case.js';
import type { CommandContext } from './command.js';
import { commandName, type CommandEntry } from './tree.js';

export type CommandRouterOptions = Reporter;

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
    const name = commandName(path);

    const author = authorOf(raw);
    if (!author) return;
    const { user: _user, member: _member, message: _message, ...rest } = raw;
    const user = ctx.entities.user(author.user);
    const interaction = new CommandInteraction(ctx, rest, user, {
      ephemeral: entry?.command.ephemeral ?? false,
      commandName: name,
    });
    if (!entry) {
      // Still registered on Discord, but its file is gone or broken.
      refuse(interaction, 'This command is not available right now.');
      return;
    }
    const { command, file } = entry;
    const placed = resolvePlace(
      ctx,
      raw,
      user,
      author.member,
      command.where,
      'command',
      message => this.#options.onWarning(file, `${name} ${message}`)
    );
    if (!placed.place) {
      refuse(interaction, placed.refusal);
      return;
    }
    const { place } = placed;
    // What the member can do where the command was used, overwrites
    // included: Discord computes it for us.
    if (command.permissions !== 0n && author.member) {
      const missing = new Permissions(author.member.permissions ?? '0').missing(
        command.permissions
      );
      if (missing.length > 0) {
        refuse(
          interaction,
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
      refuse(interaction, 'Something went wrong while running this command.');
      return;
    }
    remember(interaction, {
      guild: place.guild ?? undefined,
      member: place.member ?? undefined,
      channel: place.channel,
    });
    const context = Object.freeze({
      interaction,
      options: Object.freeze(options),
      user,
      ...placeContext(place, command.where),
    }) as unknown as CommandContext;

    runInteraction({
      interaction,
      file,
      name,
      what: 'command',
      reporter: this.#options,
      defer: () => interaction.defer(),
      unanswered:
        'finished without answering: the person sees "The application did not respond". Call interaction.reply() in run.',
      run: () => command.run(context),
    });
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
