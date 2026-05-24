import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NextRequest } from "next/server";

// Serves baller portraits written by the local-disk fallback in
// src/lib/baller.ts (used when BLOB_READ_WRITE_TOKEN is unset). In prod the
// DB stores absolute Vercel Blob URLs and this route is never hit.
//
// Path: /avatars/<playerId>/<state> where state ∈ {selfie, neutral, victory, defeated}
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ playerId: string; state: string }> }
) {
  const { playerId, state } = await params;
  // Guard against path traversal: enforce a strict allowlist.
  if (!/^[a-z0-9-]+$/.test(playerId)) {
    return new Response("Bad playerId", { status: 400 });
  }
  if (!["selfie", "neutral", "victory", "defeated"].includes(state)) {
    return new Response("Bad state", { status: 400 });
  }
  const path = join(
    process.cwd(),
    ".local",
    "avatars",
    playerId,
    `${state}.jpg`
  );
  try {
    const buf = await readFile(path);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "image/jpeg",
        // Allow the ?v= cache-buster to do its job; otherwise the browser
        // would happily reuse the old bytes on regen.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
