// Keeps the cache up to date with what Discord dispatches, so that reading
// it never costs a request. One entry per event; an event that changes
// nothing the bot remembers has no entry.
// https://docs.discord.com/developers/events/gateway#tracking-state

import type { Snowflake } from '../discord/types/common.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
} from '../discord/types/gateway-events.js';
import { dataOf, patch } from '../structures/base.js';
import { messagesOf } from '../structures/channel.js';
import type { Context } from '../structures/context.js';
import { storesOf, type Guild } from '../structures/guild.js';
import { shardIdFor } from './gateway.js';

/** Where an event comes from. */
export interface DispatchOrigin {
  shardId: number;
  shardCount: number;
}

type Handlers = {
  [E in GatewayDispatchEventName]?: (
    ctx: Context,
    data: GatewayDispatchEvents[E],
    origin: DispatchOrigin
  ) => void;
};

const guildOf = (ctx: Context, id: Snowflake | undefined): Guild | undefined =>
  id ? ctx.cache.guilds.get(id) : undefined;

/** Adds to the member count of a server, when it is known exactly. */
function countMembers(guild: Guild, change: number): void {
  const count = dataOf(guild).member_count;
  if (typeof count === 'number') {
    patch(guild, { member_count: Math.max(0, count + change) });
  }
}

const upsertChannel: Handlers['CHANNEL_CREATE'] = (ctx, data) => {
  ctx.entities.channel(data);
};

const handlers: Handlers = {
  READY(ctx, data, origin) {
    ctx.self = { userId: data.user.id, applicationId: data.application.id! };
    ctx.entities.user(data.user);
    // A new session: servers the bot left while it was away are forgotten.
    const current = new Set(data.guilds.map(guild => guild.id));
    for (const id of [...ctx.cache.guilds.keys()]) {
      if (
        shardIdFor(id, origin.shardCount) === origin.shardId &&
        !current.has(id)
      ) {
        ctx.entities.removeGuild(id);
      }
    }
  },

  USER_UPDATE(ctx, data) {
    ctx.entities.user(data);
  },

  GUILD_CREATE(ctx, data) {
    if (!('name' in data)) {
      // Still unavailable because of an outage.
      const guild = guildOf(ctx, data.id);
      if (guild) patch(guild, { unavailable: true });
      return;
    }
    const guild = ctx.entities.guild(data);
    patch(guild, { unavailable: false });
    // The payload lists every channel and active thread: what is no longer
    // in it was deleted while the bot was away.
    const listed = new Set(
      [...data.channels, ...data.threads].map(channel => channel.id)
    );
    for (const id of [...storesOf(guild).channels.keys()]) {
      if (!listed.has(id)) ctx.entities.removeChannel(id);
    }
  },

  GUILD_UPDATE(ctx, data) {
    ctx.entities.guild(data);
  },

  GUILD_DELETE(ctx, data) {
    // With `unavailable`, an outage; without, the bot is no longer in it.
    const guild = guildOf(ctx, data.id);
    if (!guild) return;
    if (data.unavailable) patch(guild, { unavailable: true });
    else ctx.entities.removeGuild(data.id);
  },

  GUILD_ROLE_CREATE(ctx, data) {
    ctx.entities.role(data.guild_id, data.role);
  },
  GUILD_ROLE_UPDATE(ctx, data) {
    ctx.entities.role(data.guild_id, data.role);
  },
  GUILD_ROLE_DELETE(ctx, data) {
    const guild = guildOf(ctx, data.guild_id);
    if (guild) storesOf(guild).roles.delete(data.role_id);
  },

  GUILD_MEMBER_ADD(ctx, data) {
    const guild = guildOf(ctx, data.guild_id);
    const { guild_id: guildId, ...member } = data;
    if (guild && !guild.members.has(member.user!.id)) countMembers(guild, 1);
    ctx.entities.member(guildId, member);
  },
  GUILD_MEMBER_UPDATE(ctx, data) {
    const { guild_id: guildId, ...member } = data;
    // Fields this event leaves out keep the value they had.
    ctx.entities.member(guildId, member as never);
  },
  GUILD_MEMBER_REMOVE(ctx, data) {
    const guild = guildOf(ctx, data.guild_id);
    if (!guild) return;
    storesOf(guild).members.delete(data.user.id);
    countMembers(guild, -1);
  },
  GUILD_MEMBERS_CHUNK(ctx, data) {
    for (const member of data.members) {
      ctx.entities.member(data.guild_id, member);
    }
  },

  GUILD_EMOJIS_UPDATE(ctx, data) {
    const guild = guildOf(ctx, data.guild_id);
    if (!guild) return;
    storesOf(guild).emojis.clear();
    for (const emoji of data.emojis) ctx.entities.emoji(data.guild_id, emoji);
  },

  CHANNEL_CREATE: upsertChannel,
  CHANNEL_UPDATE: upsertChannel,
  CHANNEL_DELETE(ctx, data) {
    ctx.entities.removeChannel(data.id);
  },
  CHANNEL_PINS_UPDATE(ctx, data) {
    const channel = ctx.cache.channels.get(data.channel_id);
    if (channel && data.last_pin_timestamp !== undefined) {
      patch(channel, { last_pin_timestamp: data.last_pin_timestamp });
    }
  },

  THREAD_CREATE: upsertChannel,
  THREAD_UPDATE: upsertChannel,
  THREAD_DELETE(ctx, data) {
    ctx.entities.removeChannel(data.id);
  },
  THREAD_LIST_SYNC(ctx, data) {
    const guild = guildOf(ctx, data.guild_id);
    if (guild) {
      // Threads of the synced channels (all of them when none is named)
      // that are not listed are no longer active.
      const synced = data.channel_ids ? new Set(data.channel_ids) : null;
      const active = new Set(data.threads.map(thread => thread.id));
      for (const channel of [...guild.channels.values()]) {
        if (
          channel.isThread() &&
          !active.has(channel.id) &&
          (!synced || (channel.parentId && synced.has(channel.parentId)))
        ) {
          ctx.entities.removeChannel(channel.id);
        }
      }
    }
    for (const thread of data.threads) {
      ctx.entities.channel(thread, data.guild_id);
    }
  },

  MESSAGE_CREATE(ctx, data) {
    const channel = ctx.cache.channels.get(data.channel_id);
    if (channel) patch(channel, { last_message_id: data.id });
    ctx.entities.message(data, data.guild_id);
  },
  MESSAGE_UPDATE(ctx, data) {
    ctx.entities.message(data, data.guild_id);
  },
  MESSAGE_DELETE(ctx, data) {
    const channel = ctx.cache.channels.get(data.channel_id);
    if (channel) messagesOf(channel).delete(data.id);
  },
  MESSAGE_DELETE_BULK(ctx, data) {
    const channel = ctx.cache.channels.get(data.channel_id);
    if (!channel) return;
    const messages = messagesOf(channel);
    for (const id of data.ids) messages.delete(id);
  },
};

/** Whether an event changes what the bot remembers. */
export function tracksState(event: GatewayDispatchEventName): boolean {
  return event in handlers;
}

/** Applies one dispatched event to the cache. */
export function applyDispatch<E extends GatewayDispatchEventName>(
  ctx: Context,
  event: E,
  data: GatewayDispatchEvents[E],
  origin: DispatchOrigin
): void {
  const handler = handlers[event] as
    | ((
        ctx: Context,
        data: GatewayDispatchEvents[E],
        origin: DispatchOrigin
      ) => void)
    | undefined;
  handler?.(ctx, data, origin);
}
