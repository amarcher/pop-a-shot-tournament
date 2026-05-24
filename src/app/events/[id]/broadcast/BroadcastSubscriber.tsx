"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribes the broadcast page to its SSE stream and triggers
 * router.refresh() whenever any structural event arrives, so the page
 * (a server component) re-renders with fresh data.
 *
 * Also kicks a 10s polling reconcile in case SSE drops (proxies eat
 * EventSource sometimes).
 */
export function BroadcastSubscriber({ eventId }: { eventId: string }) {
  const router = useRouter();
  useEffect(() => {
    const es = new EventSource(`/api/events/${eventId}/stream`);
    es.onmessage = () => router.refresh();
    const poll = setInterval(() => router.refresh(), 10_000);
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [eventId, router]);
  return null;
}
