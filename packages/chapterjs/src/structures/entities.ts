// The single place where what Discord sends becomes structures. Everything
// goes through the cache: the same server, user or channel is always the
// same object, updated in place, whether it came from an event or from a
// request.

import type { Cache } from '../cache/cache.js';
import type { CacheStore } from '../cache/store.js';
import type { RawChannel } from '../discord/types/channel.js';
import type { Snowflake } from '../discord/types/common.js';
import type { RawEmoji } from '../discord/types/emoji.js';
import type { RawGuildCreateExtra } from '../discord/types/gateway-events.js';
import type { RawGuild, RawGuildMember } from '../discord/types/guild.js';
import type { RawInvite } from '../discord/types/invite.js';
import type { RawMessage } from '../discord/types/message.js';
import type { RawRole } from '../discord/types/permissions.js';
import type { RawUser } from '../discord/types/user.js';
import type { RawVoiceState } from '../discord/types/voice.js';
import type { RawWebhook } from '../discord/types/webhook.js';
import type { Rest } from '../rest/rest.js';
import { patch, type Structure } from './base.js';
import {
  Channel,
  channelClass,
  messagesOf,
  VoiceChannel,
  type GuildChannel,
  type ThreadChannel,
} from './channel.js';
import type { Context } from './context.js';
import { GuildEmoji } from './emoji.js';
import {
  Guild,
  storesOf,
  type VoiceEntry,
  type VoiceStateData,
} from './guild.js';
import { Invite } from './invite.js';
import { remember } from './known.js';
import { GuildMember } from './member.js';
import { Message, type MessageData } from './message.js';
import { Role } from './role.js';
import { User } from './user.js';
import { Webhook } from './webhook.js';

/** Updates the cached structure, or creates and remembers a new one. */
function upsert<S extends Structure<Raw>, Raw extends object>(
  store: CacheStore<Snowflake, S>,
  id: Snowflake,
  data: Raw,
  create: () => S
): S {
  const cached = store.get(id);
  if (cached) {
    patch(cached, data);
    // Seen again: the most recent of a store that keeps a limited number.
    store.set(id, cached);
    return cached;
  }
  const created = create();
  store.set(id, created);
  return created;
}

export class Entities {
  readonly #ctx: Context;

  constructor(ctx: Context) {
    this.#ctx = ctx;
  }

  user(raw: RawUser): User {
    return upsert(
      this.#ctx.cache.users,
      raw.id,
      raw,
      () => new User(this.#ctx, raw)
    );
  }

  /** A server, with everything Discord sent along (roles, channels...). */
  guild(raw: RawGuild & Partial<RawGuildCreateExtra>): Guild {
    const {
      roles,
      emojis,
      stickers: _stickers,
      channels,
      threads,
      members,
      voice_states: voiceStates,
      presences: _presences,
      stage_instances: _stageInstances,
      guild_scheduled_events: _scheduledEvents,
      soundboard_sounds: _soundboardSounds,
      ...data
    } = raw;
    const guild = upsert(
      this.#ctx.cache.guilds,
      raw.id,
      data,
      () => new Guild(this.#ctx, data)
    );
    const stores = storesOf(guild);
    if (roles) {
      const ids = new Set(roles.map(role => role.id));
      for (const id of stores.roles.keys()) {
        if (!ids.has(id)) stores.roles.delete(id);
      }
      for (const role of roles) this.role(guild.id, role);
    }
    if (emojis) {
      stores.emojis.clear();
      for (const emoji of emojis) this.emoji(guild.id, emoji);
    }
    for (const channel of channels ?? []) this.channel(channel, guild.id);
    for (const thread of threads ?? []) this.channel(thread, guild.id);
    for (const member of members ?? []) this.member(guild.id, member);
    if (voiceStates) {
      // Everyone in voice right now: who is not listed has left meanwhile.
      stores.voiceStates.clear();
      for (const state of voiceStates) this.voiceState(guild.id, state);
    }
    return guild;
  }

  /**
   * Where someone is in voice: remembered while they are in a voice
   * channel of a server the bot is in, forgotten when they leave it.
   * Returns what is remembered now, nothing once they left.
   */
  voiceState(
    guildId: Snowflake,
    raw: Partial<RawVoiceState>
  ): VoiceEntry | undefined {
    const guild = this.#ctx.cache.guilds.get(guildId);
    const { member: _member, guild_id: _guildId, ...state } = raw;
    if (!guild || !state.user_id) return undefined;
    const store = storesOf(guild).voiceStates;
    const channel = state.channel_id
      ? this.#ctx.cache.channels.get(state.channel_id)
      : undefined;
    if (!(channel instanceof VoiceChannel)) {
      store.delete(state.user_id);
      return undefined;
    }
    const entry = { state: state as VoiceStateData, channel };
    store.set(state.user_id, entry);
    return entry;
  }

  role(guildId: Snowflake, raw: RawRole): Role {
    const guild = this.#ctx.cache.guilds.get(guildId);
    const create = () => new Role(this.#ctx, raw, guildId);
    const role = guild
      ? upsert(storesOf(guild).roles, raw.id, raw, create)
      : create();
    remember(role, { guild });
    return role;
  }

  emoji(guildId: Snowflake, raw: RawEmoji): GuildEmoji {
    const { user: _user, ...rest } = raw;
    const data = { ...rest, id: raw.id! };
    const guild = this.#ctx.cache.guilds.get(guildId);
    const create = () => new GuildEmoji(this.#ctx, data, guildId);
    return guild
      ? upsert(storesOf(guild).emojis, data.id, data, create)
      : create();
  }

  /**
   * A member. Discord leaves the user out in some payloads (messages,
   * interactions): it is then given apart.
   */
  member(
    guildId: Snowflake,
    raw: RawGuildMember,
    rawUser?: RawUser
  ): GuildMember {
    const { user: ownUser, ...data } = raw;
    const userData = ownUser ?? rawUser;
    if (!userData) {
      throw new TypeError('A member needs its user to be identified.');
    }
    const user = this.user(userData);
    const guild = this.#ctx.cache.guilds.get(guildId);
    const create = () => new GuildMember(this.#ctx, data, guildId, user);
    const member = guild
      ? upsert(storesOf(guild).members, user.id, data, create)
      : create();
    remember(member, { guild });
    // The bot itself, kept by its server whatever the cache keeps.
    if (guild && user.id === this.#ctx.self?.userId) {
      remember(guild, { member });
    }
    return member;
  }

  /**
   * A channel of any kind. Events of a server don't always repeat its id
   * in the channel: it is then given apart.
   */
  channel(raw: RawChannel, guildId?: Snowflake): Channel {
    const data: RawChannel =
      guildId && !raw.guild_id ? { ...raw, guild_id: guildId } : raw;
    for (const recipient of data.recipients ?? []) this.user(recipient);
    const channel = upsert(this.#ctx.cache.channels, data.id, data, () => {
      const Class = channelClass(data);
      return new Class(this.#ctx, data);
    });
    const guild = data.guild_id
      ? this.#ctx.cache.guilds.get(data.guild_id)
      : undefined;
    if (guild) {
      storesOf(guild).channels.set(
        channel.id,
        channel as GuildChannel | ThreadChannel
      );
      remember(channel, { guild });
    }
    return channel;
  }

  /** Forgets a channel that was deleted. */
  removeChannel(id: Snowflake): Channel | undefined {
    const { cache } = this.#ctx;
    const channel = cache.channels.get(id);
    if (!channel) return undefined;
    cache.channels.delete(id);
    const guild = channel.guildId
      ? cache.guilds.get(channel.guildId)
      : undefined;
    if (guild) storesOf(guild).channels.delete(id);
    return channel;
  }

  /** Forgets a server the bot left, with everything that belongs to it. */
  removeGuild(id: Snowflake): Guild | undefined {
    const { cache } = this.#ctx;
    const guild = cache.guilds.get(id);
    if (!guild) return undefined;
    for (const channelId of storesOf(guild).channels.keys()) {
      cache.channels.delete(channelId);
    }
    cache.guilds.delete(id);
    return guild;
  }

  message(
    raw: RawMessage & { member?: Partial<RawGuildMember> },
    guildId?: Snowflake
  ): Message {
    const { author: rawAuthor, mentions: rawMentions, member, ...others } = raw;
    const rest: MessageData = others;
    const author = this.user(rawAuthor);
    const mentions = (rawMentions ?? []).map(user => this.user(user));
    const data =
      guildId && !rest.guild_id ? { ...rest, guild_id: guildId } : rest;
    // Messages of a server come with the member who wrote them.
    const writer =
      member && data.guild_id && member.roles && !raw.webhook_id
        ? this.member(data.guild_id, member as RawGuildMember, rawAuthor)
        : undefined;
    const channel = this.#ctx.cache.channels.get(raw.channel_id);
    const create = () => new Message(this.#ctx, data, author, mentions);
    const message = channel
      ? upsert(messagesOf(channel), raw.id, data, create)
      : create();
    remember(message, {
      guild: data.guild_id
        ? this.#ctx.cache.guilds.get(data.guild_id)
        : undefined,
      member: writer,
      channel,
    });
    return message;
  }

  invite(raw: RawInvite): Invite {
    const { inviter, ...data } = raw;
    return new Invite(this.#ctx, data, inviter ? this.user(inviter) : null);
  }

  webhook(raw: RawWebhook): Webhook {
    const { user, ...data } = raw;
    if (user) this.user(user);
    return new Webhook(this.#ctx, data);
  }
}

/** Assembles what structures work with. */
export function createContext(input: { rest: Rest; cache: Cache }): Context {
  const ctx = {
    rest: input.rest,
    cache: input.cache,
    self: null,
    messages: null,
    voice: null,
  } as { -readonly [K in keyof Context]: Context[K] };
  ctx.entities = new Entities(ctx);
  return ctx;
}
