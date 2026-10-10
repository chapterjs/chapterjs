// Delivers gateway events to the handlers of the project.

import { withGuild } from '../store/scope.js';
import { DEFAULT_CACHE_LIMITS, type CacheLimits } from '../cache/cache.js';
import { GatewayIntent } from '../discord/intents.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
} from '../discord/types/gateway-events.js';
import type { Context } from '../structures/context.js';
import { audienceLocale, translation } from '../messages/translate.js';
import type { Guild } from '../structures/guild.js';
import type { EventHandler } from './declaration.js';
import { EVENTS, type EventContexts, type EventName } from './registry.js';

/** A handler, with the file and the export it comes from (to report its errors). */
export interface LoadedEvent {
  file: string;
  export: string;
  event: EventHandler;
}

/**
 * The intents the bot needs: Guilds, which keeps the cache of servers,
 * roles and channels up to date, plus the ones of the events listened to
 * and of the options their files turned on.
 */
export function intentsFor(events: Iterable<LoadedEvent>): number {
  let intents: number = GatewayIntent.Guilds;
  for (const { event } of events) intents |= intentsOf(event);
  return intents;
}

/**
 * How much the bot remembers for a set of files: the default, raised by
 * the events that need more to give all they can.
 */
export function limitsFor(events: Iterable<LoadedEvent>): CacheLimits {
  const limits = { ...DEFAULT_CACHE_LIMITS };
  for (const { event } of events) {
    const needed = EVENTS[event.name].remembers ?? {};
    for (const kind of Object.keys(needed) as (keyof CacheLimits)[]) {
      limits[kind] = Math.max(limits[kind], needed[kind]!);
    }
  }
  return limits;
}

/** The intents one file needs, given the options it passed. */
export function intentsOf(event: EventHandler): number {
  const { intents } = EVENTS[event.name];
  return typeof intents === 'function'
    ? (intents as (options: object) => number)(event.options)
    : intents;
}

type AnySource = {
  name: EventName;
  before?: (ctx: Context, data: never) => unknown;
  prepare?: (ctx: Context, data: never) => Promise<unknown> | undefined;
  build: (
    ctx: Context,
    data: never,
    extra: { joined: boolean; before: unknown; prepared: unknown }
  ) => object | readonly object[] | null;
};

/** For each gateway event, the events it may turn into. */
const BY_GATEWAY_EVENT = new Map<GatewayDispatchEventName, AnySource[]>();
for (const [name, definition] of Object.entries(EVENTS)) {
  for (const source of definition.sources) {
    const list = BY_GATEWAY_EVENT.get(source.on) ?? [];
    list.push({ name: name as EventName, ...source } as AnySource);
    BY_GATEWAY_EVENT.set(source.on, list);
  }
}

export class EventRouter {
  #handlers = new Map<EventName, LoadedEvent[]>();
  readonly #onError: (file: string, error: unknown) => void;
  readonly #onSkipped: (event: EventName, error: unknown) => void;

  /**
   * `onError`: a handler threw. `onSkipped`: an event could not be given
   * to its handlers, because Discord refused what they are promised.
   */
  constructor(
    onError: (file: string, error: unknown) => void,
    onSkipped: (event: EventName, error: unknown) => void = () => {}
  ) {
    this.#onError = onError;
    this.#onSkipped = onSkipped;
  }

  /** Replaces every handler (after a load or a reload). */
  set(events: Iterable<LoadedEvent>): void {
    const handlers = new Map<EventName, LoadedEvent[]>();
    for (const loaded of events) {
      const list = handlers.get(loaded.event.name) ?? [];
      list.push(loaded);
      handlers.set(loaded.event.name, list);
    }
    this.#handlers = handlers;
  }

  /**
   * Reads what the event is about to remove from the cache. Returns what
   * `dispatch` needs back; nothing is read for events nobody listens to.
   */
  before<E extends GatewayDispatchEventName>(
    ctx: Context,
    event: E,
    data: GatewayDispatchEvents[E]
  ): unknown[] | undefined {
    const sources = BY_GATEWAY_EVENT.get(event);
    if (!sources) return undefined;
    return sources.map(source =>
      source.before && this.#handlers.has(source.name)
        ? source.before(ctx, data as never)
        : undefined
    );
  }

  /** Runs the handlers of a gateway event, once the cache reflects it. */
  dispatch<E extends GatewayDispatchEventName>(
    ctx: Context,
    event: E,
    data: GatewayDispatchEvents[E],
    extra: { joined: boolean; before: unknown[] | undefined }
  ): void {
    const sources = BY_GATEWAY_EVENT.get(event);
    if (!sources) return;
    sources.forEach((source, index) => {
      if (!this.#handlers.has(source.name)) return;
      const deliver = (prepared?: unknown): void => {
        const built = source.build(ctx, data as never, {
          joined: extra.joined,
          before: extra.before?.[index],
          prepared,
        });
        if (!built) return;
        // One gateway event can be several occurrences (messages deleted
        // together, emojis changed at once): each is delivered.
        const occurrences: readonly object[] = Array.isArray(built)
          ? built
          : [built];
        const guildOf = EVENTS[source.name].guildOf as
          ((context: object) => Guild | null) | undefined;
        for (const context of occurrences) {
          // `t` speaks the language of the server the event happened in.
          const guild = guildOf?.(context);
          this.emit(
            source.name,
            {
              ...context,
              ...translation(ctx, audienceLocale({ guild })),
            } as never,
            guild?.id ?? null
          );
        }
      };
      const preparing = source.prepare?.(ctx, data as never);
      if (!preparing) return deliver();
      preparing.then(deliver, (error: unknown) =>
        this.#onSkipped(source.name, error)
      );
    });
  }

  /**
   * Runs the handlers of an event with what they receive, for the server
   * it happened in (what a store per server reads).
   */
  emit<Name extends EventName>(
    name: Name,
    context: EventContexts[Name],
    guildId: string | null = null
  ): void {
    const handlers = this.#handlers.get(name);
    if (!handlers) return;
    // Handlers can't change what the others receive.
    const frozen = Object.freeze({ ...context });
    const accepts = EVENTS[name].accepts as
      ((context: object, options: object) => boolean) | undefined;
    for (const { file, event } of handlers) {
      if (accepts && !accepts(frozen, event.options)) continue;
      // One handler failing never stops the others, nor the bot.
      new Promise(resolve =>
        resolve(
          withGuild(guildId, () =>
            (event.handler as (context: object) => unknown)(frozen)
          )
        )
      ).catch((error: unknown) => this.#onError(file, error));
    }
  }
}
