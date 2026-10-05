// Delivers gateway events to the handlers of the project.

import { GatewayIntent } from '../discord/intents.js';
import type {
  GatewayDispatchEventName,
  GatewayDispatchEvents,
} from '../discord/types/gateway-events.js';
import type { Context } from '../structures/context.js';
import type { EventHandler } from './convention.js';
import { EVENTS, type EventContexts, type EventName } from './registry.js';

/** A handler, with the file it comes from (to report its errors). */
export interface LoadedEvent {
  file: string;
  event: EventHandler;
}

/**
 * The intents the bot needs: Guilds, which keeps the cache of servers,
 * roles and channels up to date, plus the ones of the events listened to.
 */
export function intentsFor(events: Iterable<LoadedEvent>): number {
  let intents: number = GatewayIntent.Guilds;
  for (const { event } of events) intents |= EVENTS[event.name].intents;
  return intents;
}

type AnySource = {
  name: EventName;
  before?: (ctx: Context, data: never) => unknown;
  build: (
    ctx: Context,
    data: never,
    extra: { joined: boolean; before: unknown }
  ) => object | null;
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

  constructor(onError: (file: string, error: unknown) => void) {
    this.#onError = onError;
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
      const context = source.build(ctx, data as never, {
        joined: extra.joined,
        before: extra.before?.[index],
      });
      if (context) this.emit(source.name, context as never);
    });
  }

  /** Runs the handlers of an event with what they receive. */
  emit<Name extends EventName>(name: Name, context: EventContexts[Name]): void {
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
        resolve((event.handler as (context: object) => unknown)(frozen))
      ).catch((error: unknown) => this.#onError(file, error));
    }
  }
}
