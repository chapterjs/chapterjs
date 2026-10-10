// Runs the component someone used: reads the id the framework wrote in it,
// finds its declaration, turns what Discord sent into what `run` receives,
// and makes sure the person always gets an answer.

import type { RawChannel } from '../discord/types/channel.js';
import {
  ComponentType,
  type RawLabelInteractionResponseChildComponent,
} from '../discord/types/component.js';
import type { RawGuildMember } from '../discord/types/guild.js';
import {
  InteractionType,
  type RawInteraction,
  type RawMessageComponentData,
  type RawModalSubmitData,
  type RawResolvedData,
} from '../discord/types/interaction.js';
import { MessageFlags, type RawMessage } from '../discord/types/message.js';
import {
  authorOf,
  placeContext,
  refuse,
  resolvePlace,
  runInteraction,
  type Reporter,
} from '../interactions/dispatch.js';
import type { Context } from '../structures/context.js';
import type { What } from '../messages/phrases.js';
import { audienceLocale, translation } from '../messages/translate.js';
import {
  ComponentInteraction,
  ModalInteraction,
  type Interaction,
} from '../structures/interaction.js';
import { remember } from '../structures/known.js';
import { toCamelCase } from '../util/case.js';
import type { LoadedComponent } from './declaration.js';
import { decodeCustomId, readData } from './custom-id.js';
import type { LoadedField } from './modal.js';
import { SELECT_TYPES } from './select.js';

/** A component, with the file and the export it comes from (to report its errors). */
export interface ComponentEntry {
  file: string;
  export: string;
  component: LoadedComponent;
}

export type ComponentRouterOptions = Reporter;

/** What a component is called, for the person and the developer. */
const WHAT_OF = {
  button: 'button',
  select: 'menu',
  modal: 'form',
} as const satisfies Record<string, What>;

export class ComponentRouter {
  #components = new Map<string, ComponentEntry>();
  readonly #options: ComponentRouterOptions;

  constructor(options: ComponentRouterOptions) {
    this.#options = options;
  }

  /** Replaces every component (after a load or a reload). */
  set(entries: Iterable<ComponentEntry>): void {
    const components = new Map<string, ComponentEntry>();
    for (const entry of entries) {
      if (entry.component.kind !== 'embed') {
        components.set(
          `${entry.component.kind}:${entry.component.name}`,
          entry
        );
      }
    }
    this.#components = components;
  }

  /** Handles an Interaction Create event, if it is a component or a form. */
  dispatch(ctx: Context, raw: RawInteraction): void {
    const isComponent = raw.type === InteractionType.MessageComponent;
    const isModal = raw.type === InteractionType.ModalSubmit;
    if (!isComponent && !isModal) return;
    const data = raw.data as
      RawMessageComponentData | RawModalSubmitData | undefined;
    if (!data || typeof data.custom_id !== 'string') return;
    const author = authorOf(raw);
    if (!author) return;
    const user = ctx.entities.user(author.user);
    const { user: _user, member: _member, message: rawMessage, ...rest } = raw;
    const message = rawMessage
      ? ctx.entities.message(rawMessage as RawMessage, raw.guild_id)
      : null;
    // Only the person sees an ephemeral message: what answers a component
    // on it (an update of that message, a reply) stays with them, whatever
    // the file says, so `t` speaks their language.
    // https://docs.discord.com/developers/resources/message#message-object-message-flags
    const isPrivate =
      (((rawMessage as RawMessage | undefined)?.flags ?? 0) &
        MessageFlags.Ephemeral) !==
      0;
    const ephemeralOf = (component: LoadedComponent) =>
      isPrivate || ('ephemeral' in component && component.ephemeral);

    const { name, parts } = decodeCustomId(data.custom_id);
    // A button, a menu and a form may share a name: what was used says
    // which one is meant.
    const kind = isModal
      ? 'modal'
      : (data as RawMessageComponentData).component_type ===
          ComponentType.Button
        ? 'button'
        : 'select';
    const entry = this.#components.get(`${kind}:${name}`);
    const what: What = WHAT_OF[kind];
    const interaction: Interaction = isModal
      ? new ModalInteraction(ctx, rest, user, {
          ephemeral: entry ? ephemeralOf(entry.component) : isPrivate,
          message,
        })
      : new ComponentInteraction(ctx, rest, user, {
          ephemeral: entry ? ephemeralOf(entry.component) : isPrivate,
          message: message!,
        });
    if (isComponent && !message) return;
    // Embeds are never in the map: what is left has a `run`.
    if (
      !entry ||
      entry.component.kind === 'embed' ||
      (entry.component.kind === 'select' &&
        SELECT_TYPES[entry.component.type] !==
          (data as RawMessageComponentData).component_type)
    ) {
      // Sent before the export was renamed, removed or changed of kind.
      refuse(interaction, 'gone', { what });
      return;
    }
    const { component, file } = entry;
    const values = readData(component.data, parts);
    if (!values) {
      // The data of the component changed since the message was sent.
      refuse(interaction, 'outdated', { what });
      return;
    }
    const placed = resolvePlace(
      ctx,
      raw,
      user,
      author.member,
      component.where,
      warning => this.#options.onWarning(file, `${name} ${warning}`)
    );
    if (!placed.place) {
      refuse(interaction, placed.refusal, { what });
      return;
    }
    const { place } = placed;
    if (
      component.kind !== 'modal' &&
      component.who === 'author' &&
      rawMessage?.interaction_metadata?.user.id !== user.id
    ) {
      refuse(interaction, 'authorOnly', { what });
      return;
    }
    remember(interaction, {
      guild: place.guild ?? undefined,
      member: place.member ?? undefined,
      channel: place.channel,
    });

    let specific: Record<string, unknown>;
    try {
      specific =
        component.kind === 'modal'
          ? {
              fields: this.#readFields(
                ctx,
                raw,
                component.fields,
                data as RawModalSubmitData
              ),
            }
          : component.kind === 'select'
            ? this.#readValues(
                ctx,
                raw,
                component.type,
                data as RawMessageComponentData
              )
            : {};
    } catch (error) {
      this.#options.onError(file, error);
      refuse(interaction, 'failed', { what });
      return;
    }
    const context = Object.freeze({
      interaction,
      user,
      message,
      data: Object.freeze(values),
      ...specific,
      ...placeContext(place, component.where),
      // `t` speaks the language of who will read the answer.
      ...translation(
        ctx,
        audienceLocale({
          person: raw.locale,
          guild: place.guild,
          ephemeral: ephemeralOf(component),
        })
      ),
    });

    runInteraction({
      interaction,
      file,
      name,
      what,
      reporter: this.#options,
      guildId: place.guild?.id ?? null,
      // Nothing changes on screen while a component is answered; a form
      // sent is like a command used.
      defer: () =>
        interaction instanceof ComponentInteraction
          ? interaction.deferUpdate()
          : interaction.defer(),
      unanswered: `finished without answering: the person sees "This interaction failed". Call interaction.update() or interaction.reply() in run${component.kind === 'modal' ? '' : ', or interaction.deferUpdate() to change nothing'}.`,
      run: () => (component.run as (context: object) => unknown)(context),
    });
  }

  /** What the person picked in a menu, as structures where it applies. */
  #readValues(
    ctx: Context,
    raw: RawInteraction,
    type: 'string' | 'user' | 'role' | 'mentionable' | 'channel',
    data: RawMessageComponentData
  ): { values: unknown[]; value: unknown } {
    const values = resolveValues(
      ctx,
      raw,
      type,
      data.values ?? [],
      data.resolved ?? {}
    );
    return { values, value: values[0] };
  }

  /** What the person filled in, field by field. */
  #readFields(
    ctx: Context,
    raw: RawInteraction,
    fields: readonly LoadedField[],
    data: RawModalSubmitData
  ): Record<string, unknown> {
    const sent = new Map<string, RawLabelInteractionResponseChildComponent>();
    for (const top of data.components ?? []) {
      if (top.type === ComponentType.Label && top.component?.custom_id) {
        sent.set(top.component.custom_id, top.component);
      }
    }
    const resolved = data.resolved ?? {};
    const result: Record<string, unknown> = {};
    for (const { name, field, required } of fields) {
      if (field.type === 'note') continue;
      const input = sent.get(name);
      switch (field.type) {
        case 'text': {
          const text = input && 'value' in input ? (input.value as string) : '';
          result[name] = text === '' && !required ? undefined : text;
          break;
        }
        case 'radio': {
          const value = input && 'value' in input ? input.value : null;
          result[name] = value === null || value === '' ? undefined : value;
          break;
        }
        case 'checkbox':
          result[name] =
            input && 'value' in input ? input.value === true : false;
          break;
        case 'select':
        case 'checkboxes':
          result[name] =
            input && 'values' in input ? [...(input.values as string[])] : [];
          break;
        case 'files':
          result[name] = (
            input && 'values' in input ? (input.values as string[]) : []
          )
            .map(id => {
              const attachment = resolved.attachments?.[id];
              return attachment ? toCamelCase(attachment) : undefined;
            })
            .filter(one => one !== undefined);
          break;
        default:
          result[name] = resolveValues(
            ctx,
            raw,
            field.type,
            input && 'values' in input ? (input.values as string[]) : [],
            resolved
          );
      }
    }
    return result;
  }
}

/** The things picked in a menu of the server, as structures. */
function resolveValues(
  ctx: Context,
  raw: RawInteraction,
  type: 'string' | 'user' | 'role' | 'mentionable' | 'channel',
  ids: readonly string[],
  resolved: RawResolvedData
): unknown[] {
  if (type === 'string') return [...ids];
  const guildId = raw.guild_id;
  const userOf = (id: string) => {
    const rawUser = resolved.users?.[id];
    if (!rawUser) return undefined;
    const member = resolved.members?.[id];
    if (member && guildId) {
      ctx.entities.member(guildId, member as RawGuildMember, rawUser);
    }
    return ctx.entities.user(rawUser);
  };
  const roleOf = (id: string) => {
    const role = resolved.roles?.[id];
    return role && guildId ? ctx.entities.role(guildId, role) : undefined;
  };
  const channelOf = (id: string) => {
    const partial = resolved.channels?.[id];
    return (
      ctx.cache.channels.get(id) ??
      (partial
        ? ctx.entities.channel(partial as RawChannel, guildId)
        : undefined)
    );
  };
  return ids
    .map(id =>
      type === 'user'
        ? userOf(id)
        : type === 'role'
          ? roleOf(id)
          : type === 'channel'
            ? channelOf(id)
            : (userOf(id) ?? roleOf(id))
    )
    .filter(one => one !== undefined);
}
