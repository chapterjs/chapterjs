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
import { timestamp, TimestampStyle } from '../discord/formatting.js';
import {
  checkCooldown,
  MemoryCooldowns,
  type CooldownStore,
} from '../interactions/cooldown.js';
import {
  authorOf,
  placeContext,
  refuse,
  resolvePlace,
  runInteraction,
  type Reporter,
} from '../interactions/dispatch.js';
import type { Context } from '../structures/context.js';
import { audienceLocale, translation } from '../messages/translate.js';
import { CommandInteraction } from '../structures/interaction.js';
import { remember } from '../structures/known.js';
import { toCamelCase } from '../util/case.js';
import { suggest } from './autocomplete.js';
import type { CommandContext } from './command.js';
import { commandName, type CommandEntry } from './tree.js';

export interface CommandRouterOptions extends Reporter {
  /** Where the last uses of the commands with a `cooldown` are kept. */
  cooldowns?: CooldownStore;
}

/**
 * How long a refusal for a cooldown may wait before deleting itself: the
 * token of an interaction lives 15 minutes, with room for the request.
 * @see https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-object
 */
const DELETE_WITHIN = 14 * 60_000;

const SUB = ApplicationCommandOptionType.SubCommand;
const GROUP = ApplicationCommandOptionType.SubCommandGroup;

export class CommandRouter {
  #commands = new Map<string, CommandEntry>();
  readonly #options: CommandRouterOptions;
  // Kept by the router, not the entries: a reload keeps the cooldowns.
  readonly #cooldowns: CooldownStore;
  // What was already said about suggestions, which come on every keystroke.
  readonly #warnedOnce = new Set<string>();

  constructor(options: CommandRouterOptions) {
    this.#options = options;
    this.#cooldowns = options.cooldowns ?? new MemoryCooldowns();
  }

  /** Replaces every command (after a load or a reload). */
  set(entries: Iterable<CommandEntry>): void {
    const commands = new Map<string, CommandEntry>();
    for (const entry of entries) {
      commands.set(entry.command.path.join(' '), entry);
    }
    this.#commands = commands;
  }

  /**
   * Handles an Interaction Create event, if it is a slash command being
   * used, or someone typing in one of its options with suggestions.
   */
  dispatch(ctx: Context, raw: RawInteraction): void {
    const autocomplete =
      raw.type === InteractionType.ApplicationCommandAutocomplete;
    if (raw.type !== InteractionType.ApplicationCommand && !autocomplete) {
      return;
    }
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
    if (autocomplete) {
      suggest(ctx, raw, entry, given, this.#options, this.#warnedOnce);
      return;
    }
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
      refuse(interaction, 'unavailable');
      return;
    }
    const { command, file } = entry;
    const placed = resolvePlace(
      ctx,
      raw,
      user,
      author.member,
      command.where,
      message => this.#options.onWarning(file, `${name} ${message}`)
    );
    if (!placed.place) {
      refuse(interaction, placed.refusal, { what: 'command' });
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
        refuse(interaction, 'needsPermissions', {
          permissions: missing.join(', '),
          count: missing.length,
        });
        return;
      }
    }

    // Used too soon: the person is told when, and nothing runs.
    const again = checkCooldown(
      this.#cooldowns,
      path.join(' '),
      command.cooldown,
      {
        user: user.id,
        channel: place.channel.id,
        guild: place.guild?.id,
      }
    );
    if (again > 0) {
      this.#refuseUntil(interaction, again);
      return;
    }

    let options: Record<string, unknown>;
    try {
      options = this.#readOptions(ctx, raw, data, given, entry);
    } catch (error) {
      this.#options.onError(file, error);
      refuse(interaction, 'failed', { what: 'command' });
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
      // `t` speaks the language of who will read the answer.
      ...translation(
        ctx,
        audienceLocale({
          person: raw.locale,
          guild: place.guild,
          ephemeral: command.ephemeral,
        })
      ),
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

  /**
   * Tells the person when they can use the command again. Discord shows a
   * relative time ("in 5 seconds") that counts down, but keeps counting
   * ("52 seconds ago") once passed: the answer is deleted when the
   * cooldown ends, as long as the interaction can still be edited (15
   * minutes); beyond that, the date and time are shown instead.
   */
  #refuseUntil(interaction: CommandInteraction, until: number): void {
    const at = Math.ceil(until / 1000) * 1000;
    const wait = at - Date.now();
    const deletable = wait <= DELETE_WITHIN;
    const when = timestamp(
      at,
      deletable ? TimestampStyle.Relative : TimestampStyle.LongDateShortTime
    );
    const refused = refuse(interaction, 'cooldown', { what: 'command', when });
    if (!deletable) return;
    const timer = setTimeout(() => {
      refused.then(() => interaction.delete()).catch(() => {});
    }, wait);
    // Nothing of the bot waits for it: the process may stop meanwhile.
    timer.unref();
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
