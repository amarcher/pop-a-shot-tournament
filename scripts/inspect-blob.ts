/**
 * Inspect the shared Vercel Blob store used by pop-a-shot-tournament AND
 * mtg-dash (same BLOB_READ_WRITE_TOKEN → same store).
 *
 * Reports:
 *  - total size + count vs the 1 GB free-tier cap
 *  - breakdown by top-level prefix
 *  - breakdown by avatar leaf suffix (which app likely owns them)
 *  - 20 biggest individual objects + 20 oldest
 *  - blobs whose playerId is in neither project's DB (true orphans —
 *    safe to delete)
 *
 * Run: npx tsx scripts/inspect-blob.ts
 */
import { config as loadEnv } from "dotenv";
import { list } from "@vercel/blob";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { players as popPlayers } from "../src/db/schema";
import { existsSync } from "node:fs";
import { join } from "node:path";

loadEnv({ path: ".env.local" });

const POP_DATABASE_URL = process.env.DATABASE_URL;
// Override with the mtg-dash DB at run time:
//   MTG_DATABASE_URL=$(grep ^DATABASE_URL= ../mtg-dash/.env.local | cut -d= -f2- | tr -d '"') npx tsx scripts/inspect-blob.ts
const MTG_DATABASE_URL = process.env.MTG_DATABASE_URL;

type BlobEntry = {
  pathname: string;
  size: number;
  uploadedAt: Date;
};

const POP_LEAVES = new Set(["neutral", "defeated"]);
const MTG_LEAVES = new Set(["fresh", "wounded", "critical", "defeat"]);
// "victory" and "selfie" exist in both projects — can't attribute from path alone.

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

async function listAll(): Promise<BlobEntry[]> {
  const out: BlobEntry[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await list({ cursor, limit: 1000 });
    for (const b of page.blobs) {
      out.push({
        pathname: b.pathname,
        size: b.size,
        uploadedAt: new Date(b.uploadedAt),
      });
    }
    cursor = page.hasMore ? page.cursor : undefined;
    pages++;
    process.stderr.write(`\rfetched ${out.length} blobs (${pages} pages)…`);
  } while (cursor);
  process.stderr.write("\n");
  return out;
}

function leaf(pathname: string): string {
  const last = pathname.split("/").pop() ?? "";
  return last.replace(/\.jpg$/, "");
}

function extractAvatarPlayerId(pathname: string): string | null {
  const m = pathname.match(/^avatars\/([^/]+)\//);
  return m ? m[1] : null;
}

function attributeProject(pathname: string): "pop" | "mtg" | "ambiguous" | "other" {
  if (!pathname.startsWith("avatars/")) return "other";
  const l = leaf(pathname);
  if (POP_LEAVES.has(l)) return "pop";
  if (MTG_LEAVES.has(l)) return "mtg";
  return "ambiguous";
}

async function fetchPlayerIds(connStr: string | undefined, label: string): Promise<Set<string>> {
  if (!connStr) {
    console.log(`  (${label}: skipped — no connection string)`);
    return new Set();
  }
  const db = drizzle(neon(connStr));
  const rows = await db.select({ id: popPlayers.id }).from(popPlayers);
  console.log(`  ${label}: ${rows.length} players in DB`);
  return new Set(rows.map((r) => r.id));
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set in .env.local");
    process.exit(1);
  }

  console.log("\nFetching blob inventory…");
  const blobs = await listAll();
  const total = blobs.reduce((a, b) => a + b.size, 0);
  console.log(`Total: ${blobs.length} blobs, ${fmtBytes(total)} (free tier cap: 1.00 GB)`);

  // ---------- by top-level prefix ----------
  const byPrefix = new Map<string, { count: number; bytes: number }>();
  for (const b of blobs) {
    const p = b.pathname.split("/")[0] ?? "(root)";
    const row = byPrefix.get(p) ?? { count: 0, bytes: 0 };
    row.count++;
    row.bytes += b.size;
    byPrefix.set(p, row);
  }
  console.log("\nBy top-level prefix:");
  for (const [p, r] of [...byPrefix].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${p.padEnd(20)} ${String(r.count).padStart(6)} files  ${fmtBytes(r.bytes).padStart(10)}`);
  }

  // ---------- by leaf suffix (app attribution) ----------
  const byLeaf = new Map<string, { count: number; bytes: number; app: string }>();
  for (const b of blobs) {
    if (!b.pathname.startsWith("avatars/")) continue;
    const l = leaf(b.pathname);
    const app = attributeProject(b.pathname);
    const row = byLeaf.get(l) ?? { count: 0, bytes: 0, app };
    row.count++;
    row.bytes += b.size;
    byLeaf.set(l, row);
  }
  console.log("\nBy avatar state (leaf suffix):");
  for (const [l, r] of [...byLeaf].sort((a, b) => b[1].bytes - a[1].bytes)) {
    const avg = r.bytes / r.count;
    const tag = r.app === "pop" ? "[pop]" : r.app === "mtg" ? "[mtg]" : "[shared]";
    console.log(
      `  ${l.padEnd(12)} ${tag.padEnd(9)} ${String(r.count).padStart(6)} files  ${fmtBytes(r.bytes).padStart(10)}  (avg ${fmtBytes(avg)})`,
    );
  }

  // ---------- rough per-project totals ----------
  const projTotals: Record<string, { count: number; bytes: number }> = {
    pop: { count: 0, bytes: 0 },
    mtg: { count: 0, bytes: 0 },
    ambiguous: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 },
  };
  for (const b of blobs) {
    const proj = attributeProject(b.pathname);
    projTotals[proj].count++;
    projTotals[proj].bytes += b.size;
  }
  console.log("\nAttribution by leaf suffix:");
  for (const [proj, r] of Object.entries(projTotals)) {
    console.log(`  ${proj.padEnd(12)} ${String(r.count).padStart(6)} files  ${fmtBytes(r.bytes).padStart(10)}`);
  }
  console.log("  (\"ambiguous\" = victory.jpg or selfie.jpg — both apps use these names)");

  // ---------- biggest ----------
  console.log("\nTop 20 biggest blobs:");
  for (const b of [...blobs].sort((a, b) => b.size - a.size).slice(0, 20)) {
    console.log(`  ${b.pathname.padEnd(70)} ${fmtBytes(b.size).padStart(10)}  ${b.uploadedAt.toISOString().slice(0, 10)}`);
  }

  // ---------- oldest ----------
  console.log("\n20 oldest blobs:");
  for (const b of [...blobs].sort((a, b) => +a.uploadedAt - +b.uploadedAt).slice(0, 20)) {
    console.log(`  ${b.pathname.padEnd(70)} ${fmtBytes(b.size).padStart(10)}  ${b.uploadedAt.toISOString().slice(0, 10)}`);
  }

  // ---------- orphan check ----------
  console.log("\nLooking up live player IDs in both DBs…");
  const popIds = await fetchPlayerIds(POP_DATABASE_URL, "pop-a-shot");
  const mtgIds = await fetchPlayerIds(MTG_DATABASE_URL, "mtg-dash");

  if (popIds.size === 0 && mtgIds.size === 0) {
    console.log("\n(both DBs empty/skipped — cannot identify orphans)");
    return;
  }
  if (mtgIds.size === 0) {
    const hint = existsSync(join(process.cwd(), "..", "mtg-dash", ".env.local"))
      ? "  hint: re-run with MTG_DATABASE_URL=$(grep ^DATABASE_URL= ../mtg-dash/.env.local | cut -d= -f2- | tr -d '\"') npx tsx scripts/inspect-blob.ts"
      : "";
    console.log("\nWARNING: mtg-dash DB not checked — blobs in pop-a-shot that look orphaned may belong to mtg-dash.");
    if (hint) console.log(hint);
  }

  const orphans: BlobEntry[] = [];
  for (const b of blobs) {
    const pid = extractAvatarPlayerId(b.pathname);
    if (!pid) continue;
    if (popIds.has(pid) || mtgIds.has(pid)) continue;
    orphans.push(b);
  }
  const orphanBytes = orphans.reduce((a, b) => a + b.size, 0);
  console.log(
    `\nOrphan avatar blobs (playerId in neither DB): ${orphans.length} files, ${fmtBytes(orphanBytes)}`,
  );
  if (orphans.length > 0) {
    const sample = orphans.slice(0, 15);
    for (const o of sample) {
      console.log(`  ${o.pathname.padEnd(70)} ${fmtBytes(o.size).padStart(10)}  ${o.uploadedAt.toISOString().slice(0, 10)}`);
    }
    if (orphans.length > 15) console.log(`  … and ${orphans.length - 15} more`);
    console.log(
      `\nTo delete orphans: pipe these pathnames into \`del()\` from @vercel/blob.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
