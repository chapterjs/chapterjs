// Runs the component someone used: reads the id the framework wrote in it,
// finds its file, turns what Discord sent into what `run` receives, and
// makes sure the person always gets an answer.

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
import type { RawMessage } from '../discord/types/message.js';
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
import type { LoadedComponent } from './convention.js';
import { decodeCustomId, readData } from './custom-id.js';
import type { LoadedField } from './modal.js';
import { SELECT_TYPES } from './select.js';

/** A component, with the file it comes from (to report its errors). */
export interface ComponentEntry {
  file: string;
  component: LoadedComponent;
}

export type ComponentRouterOptions = Reporter;

/** What a component is called, for the person and the developer. */
const WHAT = {
  button: 'button',
  select: 'menu',
  modal: 'form',
  embed: 'embed',
} as const;

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
        components.set(entry.component.path, entry);
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

    const { path, parts } = decodeCustomId(data.custom_id);
    const entry = this.#components.get(path);
    const what: What = isModal
      ? 'form'
      : (data as RawMessageComponentData).component_type ===
          ComponentType.Button
        ? 'button'
        : 'menu';
    const interaction: Interaction = isModal
      ? new ModalInteraction(ctx, rest, user, {
          ephemeral:
            entry?.component.kind === 'modal'
              ? entry.component.ephemeral
              : false,
          message,
        })
      : new ComponentInteraction(ctx, rest, user, {
          ephemeral:
            entry && 'ephemeral' in entry.component
              ? entry.component.ephemeral
              : false,
          message: message!,
        });
    if (isComponent && !message) return;
    // Embeds are never in the map: what is left has a `run`.
    if (
      !entry ||
      entry.component.kind === 'embed' ||
      (isModal
        ? entry.component.kind !== 'modal'
        : entry.component.kind === 'modal') ||
      (entry.component.kind === 'button' &&
        (data as RawMessageComponentData).component_type !==
          ComponentType.Button) ||
      (entry.component.kind === 'select' &&
        SELECT_TYPES[entry.component.type] !==
          (data as RawMessageComponentData).component_type)
    ) {
      // Sent before the file was renamed, removed or changed of kind.
      refuse(interaction, 'gone', { what });
      return;
    }
    const { component, file } = entry;
    const values = readData(component.data, parts);
    if (!values) {
      // The data of the file changed since the message was sent.
      refuse(interaction, 'outdated', { what });
      return;
    }
    const name = component.path;
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
          ephemeral: 'ephemeral' in component ? component.ephemeral : false,
        })
      ),
    });

    runInteraction({
      interaction,
      file,
      name,
      what,
      reporter: this.#options,
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
