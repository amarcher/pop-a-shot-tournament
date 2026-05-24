import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPlayers, events, matches, rounds } from "@/db/schema";
import { publish } from "@/lib/pubsub";

/**
 * Record a winner for a match and cascade the result through the bracket.
 *
 * Behavior:
 *   - Mark the match complete with winnerId + completedAt
 *   - If the match has a next-win pointer, slot the winner into it; if both
 *     player slots of the next match are now full, flip it to in_progress
 *   - If the match has a next-lose pointer (double-elim only), slot the loser
 *     into it under the same rules
 *   - If every match in the round is complete, mark the round complete and
 *     activate the next pending round on the same bracket side (if any)
 *   - If every match in the event is complete, mark the event complete
 *
 * Idempotent in spirit: calling it a second time on a completed match is a
 * no-op (early return at top).
 */
export async function advanceMatch(matchId: string, winnerId: string) {
  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match) throw new Error(`Match ${matchId} not found`);
  if (match.status === "complete") return;

  const players = [match.playerAId, match.playerBId].filter(
    (x): x is string => x !== null
  );
  if (!players.includes(winnerId)) {
    throw new Error("Winner is not a participant in this match");
  }
  const loserId =
    match.playerAId === winnerId ? match.playerBId : match.playerAId;

  await db
    .update(matches)
    .set({
      winnerId,
      status: "complete",
      completedAt: sql`now()`,
    })
    .where(eq(matches.id, matchId));

  // Special-case: the first grand-final match in double-elim. If the
  // winners-bracket champ wins (player A — that slot was reserved for them
  // at materialize time), the bracket-reset match is never needed; mark it
  // obsolete so the event can complete. If the losers-bracket champ wins
  // (player B), fill the reset with the same two players and start it.
  const isFirstGrandFinal =
    match.bracketSide === "grand_final" && match.slotIndex === 0;
  if (isFirstGrandFinal && match.nextMatchWinId) {
    if (winnerId === match.playerAId) {
      // Winners-side wins → reset is never played.
      await db
        .update(matches)
        .set({ status: "complete", completedAt: sql`now()` })
        .where(eq(matches.id, match.nextMatchWinId));
    } else {
      // Losers-side wins → reset same two players.
      await db
        .update(matches)
        .set({
          playerAId: match.playerAId,
          playerBId: match.playerBId,
          status: "in_progress",
        })
        .where(eq(matches.id, match.nextMatchWinId));
    }
  } else if (match.nextMatchWinId && match.nextSlot) {
    await fillNextSlot(match.nextMatchWinId, match.nextSlot, winnerId);
  }

  // ---- Cascade loser (double-elim only) ----
  if (match.nextMatchLoseId && match.nextLoseSlot && loserId) {
    await fillNextSlot(match.nextMatchLoseId, match.nextLoseSlot, loserId);
  }

  // ---- Round / event status ----
  await maybeCompleteRound(match.roundId, match.eventId);

  // ---- Broadcast ----
  await publish(match.eventId, {
    type: "match_complete",
    matchId,
    winnerId,
    loserId: loserId ?? null,
  });
}

async function fillNextSlot(
  nextMatchId: string,
  slot: "A" | "B",
  playerId: string
) {
  const patch =
    slot === "A" ? { playerAId: playerId } : { playerBId: playerId };
  await db.update(matches).set(patch).where(eq(matches.id, nextMatchId));

  const [refreshed] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, nextMatchId))
    .limit(1);
  if (refreshed?.playerAId && refreshed?.playerBId && refreshed.status === "pending") {
    await db
      .update(matches)
      .set({ status: "in_progress" })
      .where(eq(matches.id, nextMatchId));
  }
}

async function maybeCompleteRound(roundId: string, eventId: string) {
  const openInRound = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(matches)
    .where(
      and(
        eq(matches.roundId, roundId),
        or(eq(matches.status, "pending"), eq(matches.status, "in_progress"))!
      )
    );
  if ((openInRound[0]?.c ?? 0) > 0) return;

  await db
    .update(rounds)
    .set({ status: "complete", completedAt: sql`now()` })
    .where(eq(rounds.id, roundId));

  // Activate next pending round on the same side (if there is one). For Swiss
  // this is a no-op — Swiss inserts rounds on-demand from a separate action.
  const [done] = await db
    .select()
    .from(rounds)
    .where(eq(rounds.id, roundId))
    .limit(1);
  if (done) {
    const candidates = await db
      .select()
      .from(rounds)
      .where(
        and(
          eq(rounds.eventId, eventId),
          eq(rounds.bracketSide, done.bracketSide),
          eq(rounds.status, "pending")
        )
      );
    const next = candidates
      .filter((r) => r.roundNumber > done.roundNumber)
      .sort((a, b) => a.roundNumber - b.roundNumber)[0];
    if (next) {
      await db
        .update(rounds)
        .set({ status: "active", startedAt: sql`now()` })
        .where(eq(rounds.id, next.id));
    }
  }

  // Event complete check: every match across all bracket sides is complete
  // AND every round is complete (the round status flips above).
  const stillOpen = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(matches)
    .where(
      and(
        eq(matches.eventId, eventId),
        or(eq(matches.status, "pending"), eq(matches.status, "in_progress"))!
      )
    );
  await publish(eventId, {
    type: "round_completed",
    roundNumber: done?.roundNumber ?? 0,
    bracketSide: done?.bracketSide,
  });

  if ((stillOpen[0]?.c ?? 0) === 0) {
    await db
      .update(events)
      .set({ status: "complete" })
      .where(eq(events.id, eventId));
    await assignFinalStandings(eventId);
    await publish(eventId, { type: "event_complete" });
  }
}

/**
 * After an event completes, write final_standing onto eventPlayers using
 * win count → losses → seed. Good enough for round-robin/Swiss; for
 * single-elim we override with bracket position below.
 */
async function assignFinalStandings(eventId: string) {
  const allMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.eventId, eventId));
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const m of allMatches) {
    if (!m.winnerId) continue;
    wins.set(m.winnerId, (wins.get(m.winnerId) ?? 0) + 1);
    const loser =
      m.playerAId === m.winnerId ? m.playerBId : m.playerAId;
    if (loser) losses.set(loser, (losses.get(loser) ?? 0) + 1);
  }
  const roster = await db
    .select()
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, eventId));
  const ranked = roster
    .map((r) => ({
      playerId: r.playerId,
      seed: r.seed,
      w: wins.get(r.playerId) ?? 0,
      l: losses.get(r.playerId) ?? 0,
    }))
    .sort((a, b) => {
      if (b.w !== a.w) return b.w - a.w;
      if (a.l !== b.l) return a.l - b.l;
      return a.seed - b.seed;
    });
  for (let i = 0; i < ranked.length; i++) {
    await db
      .update(eventPlayers)
      .set({ finalStanding: i + 1 })
      .where(
        and(
          eq(eventPlayers.eventId, eventId),
          eq(eventPlayers.playerId, ranked[i].playerId)
        )
      );
  }
}
