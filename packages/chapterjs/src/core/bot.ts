// Assembles the core into a running bot: REST, cache, structures and the
// gateway, with events applied to the cache before anyone hears of them.
// Only the CLI creates one; user code never does.

import { Cache, type CacheOptions } from '../cache/cache.js';
import type { Snowflake } from '../discord/types/common.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
  RawGatewayPresenceUpdate,
} from '../discord/types/gateway-events.js';
import { Gateway, type GatewayOptions } from '../gateway/gateway.js';
import type { ShardEvent } from '../gateway/shard.js';
import { applyDispatch } from '../gateway/state.js';
import { RestClient, type RestOptions } from '../rest/rest.js';
import type { Context } from '../structures/context.js';
import { createContext } from '../structures/entities.js';

/** What a dispatched event is, besides its data. */
export interface DispatchInfo {
  shardId: number;
  /**
   * For Guild Create: `true` when the bot just joined the server, `false`
   * when it was already in it and Discord is only sending its data (after
   * connecting, or after an outage).
   */
  joined: boolean;
  /** What `beforeDispatch` returned for this event. */
  before: unknown;
}

export type BotEvent =
  | ShardEvent
  /** Every server the bot is in has sent its data (or took too long). */
  | { type: 'guildsReady' }
  /** Applying an event to the cache failed: the event is still delivered. */
  | { type: 'stateError'; event: GatewayDispatchEventName; error: unknown };

export interface BotOptions {
  token: string;
  /** The version of the framework. */
  version: string;
  intents: number;
  presence?: RawGatewayPresenceUpdate;
  cache?: CacheOptions;
  shards?: GatewayOptions['shards'];
  identifyGate?: GatewayOptions['identifyGate'];
  /** Called for every event, once the cache reflects it. */
  onDispatch?: <E extends GatewayDispatchEventName>(
    event: E,
    data: GatewayDispatchEvents[E],
    info: DispatchInfo
  ) => void;
  /**
   * Called for every event before the cache reflects it: the last moment
   * to read what the event removes. What it returns is given back to
   * `onDispatch`.
   */
  beforeDispatch?: <E extends GatewayDispatchEventName>(
    event: E,
    data: GatewayDispatchEvents[E]
  ) => unknown;
  onEvent?: (event: BotEvent) => void;
  /**
   * The servers the bot pays attention to. Events of the others are dropped
   * before anything else, as if the bot was not in them: this is how a dev
   * bot only sees its dev server. What belongs to no server is decided by
   * `privateEvents`.
   */
  guildFilter?: (guildId: Snowflake) => boolean;
  /**
   * Whether what happens outside servers (private messages, commands used
   * there) is for this bot. Default: true. Discord sends it to every
   * process of the bot that runs its first shard: when a dev bot and a
   * production bot share a token, only one may answer.
   */
  privateEvents?: boolean;
  /**
   * How long to wait for the data of every server after connecting, in
   * milliseconds, before going on without the ones that did not come
   * (an outage of Discord). Default: 15000.
   */
  guildsTimeout?: number;
  /** Only tests change these. */
  rest?: Partial<RestOptions>;
  gateway?: Pick<GatewayOptions, 'backoff' | 'identifyInterval'>;
}

export interface Bot {
  readonly ctx: Context;
  readonly gateway: Gateway;
  /**
   * Connects to Discord, and resolves once every shard is ready and every
   * server has sent its data.
   */
  connect(): Promise<void>;
  /** Disconnects cleanly: the bot goes offline right away. */
  close(): Promise<void>;
}

/** The server a gateway event belongs to, when it belongs to one. */
function guildIdOf(
  event: GatewayDispatchEventName,
  data: unknown
): Snowflake | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const fields = data as { id?: unknown; guild_id?: unknown };
  // The events about a server itself carry its id as `id`.
  const id =
    event === 'GUILD_CREATE' ||
    event === 'GUILD_UPDATE' ||
    event === 'GUILD_DELETE'
      ? fields.id
      : fields.guild_id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * Whether an event that belongs to no server happened in a private
 * conversation: it has a channel. What is about the bot itself (its user,
 * its session) has none, and is always needed.
 */
function isPrivate(data: unknown): boolean {
  const fields = data as { channel_id?: unknown; recipients?: unknown };
  return typeof fields.channel_id === 'string' || 'recipients' in fields;
}

export function createBot(options: BotOptions): Bot {
  const rest = new RestClient({
    token: options.token,
    version: options.version,
    ...options.rest,
  });
  const ctx = createContext({ rest, cache: new Cache(options.cache) });

  /** Servers announced by Ready whose data has not come yet, per shard. */
  const pending = new Map<number, Set<Snowflake>>();
  let guildsReady: (() => void) | null = null;
  let guildsTimer: NodeJS.Timeout | null = null;

  const checkGuilds = (): void => {
    if (!guildsReady) return;
    for (const ids of pending.values()) if (ids.size > 0) return;
    finishGuilds();
  };
  const finishGuilds = (): void => {
    if (guildsTimer) clearTimeout(guildsTimer);
    guildsTimer = null;
    const done = guildsReady;
    guildsReady = null;
    if (done) {
      done();
      options.onEvent?.({ type: 'guildsReady' });
    }
  };

  const gateway = new Gateway({
    rest,
    token: options.token,
    intents: options.intents,
    presence: options.presence,
    shards: options.shards,
    identifyGate: options.identifyGate,
    ...options.gateway,
    onEvent: options.onEvent,
    onDispatch(event, data, shardId) {
      let joined = false;
      let awaited = false;
      const filter = options.guildFilter;
      if (event === 'READY') {
        const ready = data as GatewayDispatchEvents['READY'];
        if (filter) {
          // The cache and the wait for servers only know the allowed ones.
          data = {
            ...ready,
            guilds: ready.guilds.filter(guild => filter(guild.id)),
          } as typeof data;
        }
        pending.set(
          shardId,
          new Set(
            (data as GatewayDispatchEvents['READY']).guilds.map(
              guild => guild.id
            )
          )
        );
      } else {
        const guildId = guildIdOf(event, data);
        if (guildId === undefined) {
          if (options.privateEvents === false && isPrivate(data)) return;
        } else if (filter && !filter(guildId)) {
          return;
        }
      }
      if (event === 'GUILD_CREATE' || event === 'GUILD_DELETE') {
        const { id } = data as GatewayDispatchEvents['GUILD_DELETE'];
        awaited = pending.get(shardId)?.delete(id) ?? false;
        joined =
          event === 'GUILD_CREATE' && !awaited && !ctx.cache.guilds.has(id);
      }
      let before: unknown;
      try {
        before = options.beforeDispatch?.(event, data);
      } catch (error) {
        options.onEvent?.({ type: 'stateError', event, error });
      }
      try {
        applyDispatch(ctx, event, data, {
          shardId,
          shardCount: gateway.shardCount,
        });
      } catch (error) {
        options.onEvent?.({ type: 'stateError', event, error });
      }
      options.onDispatch?.(event, data, { shardId, joined, before });
      if (awaited) checkGuilds();
    },
  });

  return {
    ctx,
    gateway,
    async connect() {
      const allGuilds = new Promise<void>(resolve => (guildsReady = resolve));
      try {
        await gateway.connect();
      } catch (error) {
        guildsReady = null;
        throw error;
      }
      guildsTimer = setTimeout(finishGuilds, options.guildsTimeout ?? 15_000);
      checkGuilds();
      await allGuilds;
    },
    async close() {
      if (guildsTimer) clearTimeout(guildsTimer);
      guildsTimer = null;
      await gateway.close();
    },
  };
}
