import { NextRequest } from "next/server";
import { subscribe } from "@/lib/pubsub";
import {
  STRUCTURAL_EVENT_TYPES,
  type EventMessage,
} from "@/lib/realtime-schema";

// Long-lived SSE. Streams every pub/sub event for the given tournament to
// the connected client. Heartbeats every 25s so any intermediate proxy
// doesn't kill the connection as idle.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const connectedAt = Date.now();

  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void | Promise<void>) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      function send(msg: EventMessage) {
        if (closed) return;
        // Drop *historical* structural events on reconnect — without this
        // gate, every reconnect replays old match_complete events from
        // Upstash history and the client re-runs router.refresh() in a loop.
        if (
          STRUCTURAL_EVENT_TYPES.has(msg.type) &&
          msg.ts < connectedAt - 2000
        ) {
          return;
        }
        try {
          const payload = `data: ${JSON.stringify(msg)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      }

      // Initial ping so the client immediately knows the connection is up.
      controller.enqueue(encoder.encode(`: connected\n\n`));

      try {
        unsubscribe = await subscribe(eventId, send, { historyLimit: 50 });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify(msg)}\n\n`)
        );
        closed = true;
        controller.close();
        return;
      }

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
        }
      }, 25_000);

      req.signal.addEventListener("abort", async () => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) await unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    async cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
