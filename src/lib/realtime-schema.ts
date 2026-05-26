import { z } from "zod";

// Channel "event" identifiers used by `@upstash/realtime`. We emit on a
// per-tournament channel (`event:<eventId>`) so events from one tournament
// never bleed into another's subscribers.
//
// `ts` is publish-time wall clock (ms). The SSE route uses it to drop
// historical structural-event replays on reconnect — without it, every
// reconnect re-fires `match_complete` from Upstash history and the client
// re-runs `router.refresh()` in an infinite loop.
export const realtimeSchema = {
  round_started: z.object({
    ts: z.number(),
    roundNumber: z.number(),
    bracketSide: z
      .enum(["winners", "losers", "grand_final", "none"])
      .optional(),
  }),
  round_completed: z.object({
    ts: z.number(),
    roundNumber: z.number(),
    bracketSide: z
      .enum(["winners", "losers", "grand_final", "none"])
      .optional(),
  }),
  match_started: z.object({ ts: z.number(), matchId: z.string() }),
  match_complete: z.object({
    ts: z.number(),
    matchId: z.string(),
    winnerId: z.string(),
    loserId: z.string().nullable(),
  }),
  match_cleared: z.object({ ts: z.number(), matchId: z.string() }),
  event_complete: z.object({ ts: z.number() }),
} as const;

export const REALTIME_EVENT_NAMES = [
  "round_started",
  "round_completed",
  "match_started",
  "match_complete",
  "match_cleared",
  "event_complete",
] as const;

export type RealtimeEventName = (typeof REALTIME_EVENT_NAMES)[number];

export type EventMessage =
  | {
      type: "round_started";
      ts: number;
      roundNumber: number;
      bracketSide?: "winners" | "losers" | "grand_final" | "none";
    }
  | {
      type: "round_completed";
      ts: number;
      roundNumber: number;
      bracketSide?: "winners" | "losers" | "grand_final" | "none";
    }
  | { type: "match_started"; ts: number; matchId: string }
  | {
      type: "match_complete";
      ts: number;
      matchId: string;
      winnerId: string;
      loserId: string | null;
    }
  | { type: "match_cleared"; ts: number; matchId: string }
  | { type: "event_complete"; ts: number };

// Event types that trigger a hard refresh on the client. The SSE route drops
// any of these whose `ts` predates the client's connection, so reconnects
// don't replay an old event and put the page into a refresh loop.
export const STRUCTURAL_EVENT_TYPES: ReadonlySet<EventMessage["type"]> = new Set([
  "round_started",
  "round_completed",
  "match_started",
  "match_complete",
  "match_cleared",
  "event_complete",
]);

export function channelForEvent(eventId: string): string {
  return `event:${eventId}`;
}
