import { Realtime } from "@upstash/realtime";
import { Redis } from "@upstash/redis";
import { realtimeSchema } from "./realtime-schema";

// Realtime lives in module state so producer (server actions) and consumer
// (SSE route) share one instance. Created lazily so local dev (no
// KV_REST_API_URL set) doesn't crash at import time.
function buildRealtime() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Upstash KV env (KV_REST_API_URL / KV_REST_API_TOKEN) not set"
    );
  }
  const redis = new Redis({ url, token });
  return new Realtime({
    redis,
    schema: realtimeSchema,
    maxDurationSecs: 300,
    history: {
      maxLength: 200,
      expireAfterSecs: 7200,
    },
  });
}

let _realtime: ReturnType<typeof buildRealtime> | null = null;

export function getRealtime(): ReturnType<typeof buildRealtime> {
  if (!_realtime) _realtime = buildRealtime();
  return _realtime;
}

export function isRealtimeConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
  );
}
