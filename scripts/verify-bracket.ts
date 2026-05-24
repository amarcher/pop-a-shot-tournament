// Drives every tournament format end-to-end against the real Neon DB so
// regressions show up without needing a browser. Run via `npm run verify`.
//
// Cleans up after itself by prefixing the throwaway league slug with
// `_verify_`. Re-running after a crashed run wipes leftovers automatically.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { eq, like } from "drizzle-orm";
import { db } from "../src/db/client";
import {
  eventPlayers,
  events,
  leagues,
  matches,
  players,
  rounds,
  type Event,
} from "../src/db/schema";
import { generateJoinToken } from "../src/lib/tokens";
import { advanceMatch } from "../src/lib/bracket/advance";
import {
  pairNextSwissRound,
  seedDoubleElim,
  seedRoundRobin,
  seedSingleElim,
} from "../src/lib/bracket/materialize";

const PREFIX = "_verify_";

async function cleanup() {
  // Cascade deletes from leagues will clean everything below.
  const stale = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(like(leagues.slug, `${PREFIX}%`));
  for (const row of stale) {
    await db.delete(leagues).where(eq(leagues.id, row.id));
  }
  if (stale.length) console.log(`cleaned ${stale.length} stale leagues`);
}

async function makeLeagueWithPlayers(name: string, n: number) {
  const slug = `${PREFIX}${name}-${Date.now()}`;
  const [league] = await db
    .insert(leagues)
    .values({ slug, name: `verify-${name}` })
    .returning();
  const inserted = await db
    .insert(players)
    .values(
      Array.from({ length: n }, (_, i) => ({
        leagueId: league.id,
        leagueToken: generateJoinToken(),
        displayName: `P${i + 1}`,
      }))
    )
    .returning();
  return { league, players: inserted };
}

async function createEvent(
  leagueId: string,
  format: Event["format"],
  playerIds: string[]
) {
  const [event] = await db
    .insert(events)
    .values({
      leagueId,
      name: `verify-${format}`,
      format,
      status: "active",
    })
    .returning();
  await db.insert(eventPlayers).values(
    playerIds.map((pid, idx) => ({
      eventId: event.id,
      playerId: pid,
      seed: idx + 1,
      joinToken: generateJoinToken(),
    }))
  );
  return event;
}

async function walkEverything(eventId: string) {
  // Repeatedly pick any pending/in-progress match with both players set and
  // declare playerA the winner. Should eventually reach 0 open matches.
  let safety = 200;
  while (safety-- > 0) {
    const open = await db
      .select()
      .from(matches)
      .where(eq(matches.eventId, eventId));
    const next = open.find(
      (m) =>
        m.status !== "complete" && m.playerAId !== null && m.playerBId !== null
    );
    if (!next) break;
    await advanceMatch(next.id, next.playerAId!);
  }
  if (safety <= 0) throw new Error("walkEverything exceeded safety counter");
}

async function assertEventComplete(eventId: string) {
  const [e] = await db.select().from(events).where(eq(events.id, eventId));
  if (e.status !== "complete") {
    const open = await db
      .select()
      .from(matches)
      .where(eq(matches.eventId, eventId));
    throw new Error(
      `Event ${e.name} not complete: ${open.filter((m) => m.status !== "complete").length} open matches`
    );
  }
}

async function checkSingleElim() {
  console.log("→ single_elim, 7 players (bye for seed 1)");
  const { league, players } = await makeLeagueWithPlayers("se7", 7);
  const event = await createEvent(
    league.id,
    "single_elim",
    players.map((p) => p.id)
  );
  await seedSingleElim(event.id, players.map((p) => p.id));
  await walkEverything(event.id);
  await assertEventComplete(event.id);

  // 8-bracket single elim: 4 R1 + 2 R2 + 1 R3 = 7 matches
  const ms = await db.select().from(matches).where(eq(matches.eventId, event.id));
  if (ms.length !== 7) throw new Error(`expected 7 matches, got ${ms.length}`);

  const rs = await db.select().from(rounds).where(eq(rounds.eventId, event.id));
  if (rs.length !== 3) throw new Error(`expected 3 rounds, got ${rs.length}`);
  console.log("  ✓ 7 matches, 3 rounds, all complete");
}

async function checkDoubleElim() {
  console.log("→ double_elim, 8 players (winners champ wins grand final)");
  const { league, players } = await makeLeagueWithPlayers("de8", 8);
  const event = await createEvent(
    league.id,
    "double_elim",
    players.map((p) => p.id)
  );
  await seedDoubleElim(event.id, players.map((p) => p.id));
  await walkEverything(event.id);
  await assertEventComplete(event.id);

  const ms = await db.select().from(matches).where(eq(matches.eventId, event.id));
  // 7 winners + 6 losers + 2 grand (final + reset) = 15
  if (ms.length !== 15) {
    throw new Error(`expected 15 matches, got ${ms.length}`);
  }
  console.log("  ✓ 15 matches, all complete");

  // Now drive the *bracket-reset* branch: losers champ wins first grand final,
  // resetting the bracket and forcing a second grand final.
  console.log("→ double_elim, 8 players (losers champ wins → bracket reset)");
  const { league: l2, players: ps2 } = await makeLeagueWithPlayers("de8r", 8);
  const event2 = await createEvent(
    l2.id,
    "double_elim",
    ps2.map((p) => p.id)
  );
  await seedDoubleElim(event2.id, ps2.map((p) => p.id));

  // Walk everything except the grand final — advance any pending match,
  // pick player A as winner.
  let safety = 50;
  while (safety-- > 0) {
    const open = await db
      .select()
      .from(matches)
      .where(eq(matches.eventId, event2.id));
    const next = open.find(
      (m) =>
        m.status !== "complete" &&
        m.bracketSide !== "grand_final" &&
        m.playerAId !== null &&
        m.playerBId !== null
    );
    if (!next) break;
    await advanceMatch(next.id, next.playerAId!);
  }

  // Find grand final (slotIndex 0) and pick player B (losers champ) as winner.
  const all = await db.select().from(matches).where(eq(matches.eventId, event2.id));
  const grandFinal = all.find(
    (m) => m.bracketSide === "grand_final" && m.slotIndex === 0
  );
  if (!grandFinal?.playerBId) {
    throw new Error("grand final missing player B (losers champ)");
  }
  await advanceMatch(grandFinal.id, grandFinal.playerBId);

  // Now the reset (slotIndex 1) should be in_progress with both players set.
  const reset = (
    await db.select().from(matches).where(eq(matches.id, grandFinal.nextMatchWinId!))
  )[0];
  if (reset.status !== "in_progress") {
    throw new Error(`reset should be in_progress, got ${reset.status}`);
  }
  if (!reset.playerAId || !reset.playerBId) {
    throw new Error("reset missing both players");
  }

  // Finish the reset.
  await advanceMatch(reset.id, reset.playerAId);
  await assertEventComplete(event2.id);
  console.log("  ✓ reset triggered + completed");
}

async function checkRoundRobin() {
  console.log("→ round_robin, 4 players");
  const { league, players } = await makeLeagueWithPlayers("rr4", 4);
  const event = await createEvent(
    league.id,
    "round_robin",
    players.map((p) => p.id)
  );
  await seedRoundRobin(event.id, players.map((p) => p.id));
  await walkEverything(event.id);
  await assertEventComplete(event.id);

  // C(4, 2) = 6 matches
  const ms = await db.select().from(matches).where(eq(matches.eventId, event.id));
  if (ms.length !== 6) {
    throw new Error(`expected 6 matches, got ${ms.length}`);
  }
  console.log("  ✓ 6 matches, all complete");
}

async function checkSwiss() {
  console.log("→ swiss, 8 players, 3 rounds");
  const { league, players } = await makeLeagueWithPlayers("sw8", 8);
  const event = await createEvent(
    league.id,
    "swiss",
    players.map((p) => p.id)
  );
  // Set totalRounds for swiss explicitly.
  await db
    .update(events)
    .set({ totalRounds: 3 })
    .where(eq(events.id, event.id));

  // Round 1
  await pairNextSwissRound(event.id, 3);
  await walkRoundOnly(event.id);

  // Round 2
  await pairNextSwissRound(event.id, 3);
  await walkRoundOnly(event.id);

  // Round 3
  await pairNextSwissRound(event.id, 3);
  await walkRoundOnly(event.id);

  await assertEventComplete(event.id);

  // 8 players, 3 rounds = 4 matches per round = 12 matches.
  const ms = await db.select().from(matches).where(eq(matches.eventId, event.id));
  if (ms.length !== 12) {
    throw new Error(`expected 12 matches, got ${ms.length}`);
  }
  console.log("  ✓ 12 matches across 3 rounds, all complete");
}

// Walk only the currently-active round (don't auto-pair the next one).
async function walkRoundOnly(eventId: string) {
  let safety = 50;
  while (safety-- > 0) {
    const open = await db
      .select()
      .from(matches)
      .where(eq(matches.eventId, eventId));
    const next = open.find(
      (m) =>
        m.status !== "complete" &&
        m.playerAId !== null &&
        m.playerBId !== null
    );
    if (!next) break;
    await advanceMatch(next.id, next.playerAId!);
  }
}

async function main() {
  await cleanup();
  try {
    await checkSingleElim();
    await checkDoubleElim();
    await checkRoundRobin();
    await checkSwiss();
    console.log("\n✓ verify-bracket: ALL FORMATS PASS");
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
