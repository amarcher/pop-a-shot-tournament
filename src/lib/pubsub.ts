import {
  REALTIME_EVENT_NAMES,
  channelForEvent,
  type EventMessage,
} from "./realtime-schema";
import { getRealtime, isRealtimeConfigured } from "./realtime";

export type { EventMessage } from "./realtime-schema";

type Subscriber = (msg: EventMessage) => void;

// In-process fallback used when KV_REST_API_URL is unset (local dev, LAN
// demo, verify scripts). Persists across HMR via a global symbol.
const KEY = Symbol.for("pop-a-shot.pubsub");
type Store = Map<string, Set<Subscriber>>;
const globalAny = globalThis as unknown as { [k: symbol]: Store | undefined };
if (!globalAny[KEY]) globalAny[KEY] = new Map();
const store: Store = globalAny[KEY]!;

// Distributive Omit: when applied to a discriminated union it removes the key
// from each variant individually instead of collapsing the union.
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * Fan out an event to every active subscriber on this tournament.
 *
 * - Prod (Upstash configured): publishes to `event:<eventId>` via Realtime.
 *   Messages persist in Redis Streams under our `history` config so a
 *   reconnecting SSE client can replay missed events.
 * - Dev (no Upstash env): in-process Map fan-out. No history, no
 *   cross-instance — fine for dev / LAN where producer + consumer share
 *   one process.
 */
export async function publish(
  eventId: string,
  message: DistributiveOmit<EventMessage, "ts">
): Promise<void> {
  const stamped = { ...message, ts: Date.now() } as EventMessage;
  if (isRealtimeConfigured()) {
    const { type, ...data } = stamped;
    const ch = getRealtime().channel(channelForEvent(eventId)) as unknown as {
      emit: (event: string, data: object) => Promise<void>;
    };
    await ch.emit(type, data);
    return;
  }
  const set = store.get(eventId);
  if (!set) return;
  for (const sub of set) {
    try {
      sub(stamped);
    } catch {
      set.delete(sub);
    }
  }
}

export async function subscribe(
  eventId: string,
  subscriber: Subscriber,
  options: { historyLimit?: number } = {}
): Promise<() => void | Promise<void>> {
  if (isRealtimeConfigured()) {
    const ch = getRealtime().channel(channelForEvent(eventId)) as unknown as {
      subscribe: (args: {
        events: readonly string[];
        onData: (e: { event: string; data: unknown }) => void;
        history?: { limit: number };
      }) => Promise<() => void | Promise<void>>;
    };
    const unsubscribe = await ch.subscribe({
      events: REALTIME_EVENT_NAMES,
      onData: (e) => {
        try {
          subscriber({
            type: e.event,
            ...(e.data as object),
          } as EventMessage);
        } catch {
          /* subscriber threw — Realtime keeps the stream alive */
        }
      },
      history:
        options.historyLimit && options.historyLimit > 0
          ? { limit: options.historyLimit }
          : undefined,
    });
    return unsubscribe;
  }
  let set = store.get(eventId);
  if (!set) {
    set = new Set();
    store.set(eventId, set);
  }
  set.add(subscriber);
  return () => {
    set!.delete(subscriber);
    if (set!.size === 0) store.delete(eventId);
  };
}
