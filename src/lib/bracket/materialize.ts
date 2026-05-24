import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { eventPlayers, matches, rounds, type Match } from "@/db/schema";
import { advanceMatch } from "./advance";
import {
  nextPow2,
  roundRobinSchedule,
  seedToBracketSlots,
} from "./pairings";
import {
  generateSwissPairings,
  type PlayerStanding,
} from "@/lib/pairings/swiss";

export { nextPow2, roundRobinSchedule, seedToBracketSlots };
export { standardSeedPositions } from "./pairings";

// ============================================================
// Single elimination
// ============================================================

export async function seedSingleElim(
  eventId: string,
  playerIds: string[]
): Promise<void> {
  if (playerIds.length < 2) throw new Error("Need at least 2 players");
  const B = nextPow2(playerIds.length);
  const numRounds = Math.log2(B);
  const slots = seedToBracketSlots(playerIds, B);

  // Create rounds (R1 active, rest pending).
  const roundIds: string[] = [];
  for (let r = 1; r <= numRounds; r++) {
    const [row] = await db
      .insert(rounds)
      .values({
        eventId,
        roundNumber: r,
        bracketSide: "none",
        status: r === 1 ? "active" : "pending",
        startedAt: r === 1 ? sql`now()` : null,
      })
      .returning({ id: rounds.id });
    roundIds.push(row.id);
  }

  // Create all matches, leaving next pointers NULL for the second pass.
  const matchIds: string[][] = [];
  for (let r = 1; r <= numRounds; r++) {
    const numMatches = B / Math.pow(2, r);
    const row: string[] = [];
    for (let s = 0; s < numMatches; s++) {
      const playerA = r === 1 ? slots[s * 2] : null;
      const playerB = r === 1 ? slots[s * 2 + 1] : null;
      // R1 matches with both players set go in_progress immediately so the
      // operator can pick a winner. Bye matches (one side null) stay pending
      // until we auto-advance them below.
      const status: "pending" | "in_progress" =
        r === 1 && playerA && playerB ? "in_progress" : "pending";
      const [m] = await db
        .insert(matches)
        .values({
          roundId: roundIds[r - 1],
          eventId,
          bracketSide: "none",
          slotIndex: s,
          playerAId: playerA,
          playerBId: playerB,
          status,
        })
        .returning({ id: matches.id });
      row.push(m.id);
    }
    matchIds.push(row);
  }

  // Second pass: wire next-win pointers (no losers bracket in single elim).
  for (let r = 0; r < numRounds - 1; r++) {
    for (let s = 0; s < matchIds[r].length; s++) {
      await db
        .update(matches)
        .set({
          nextMatchWinId: matchIds[r + 1][Math.floor(s / 2)],
          nextSlot: s % 2 === 0 ? "A" : "B",
        })
        .where(eq(matches.id, matchIds[r][s]));
    }
  }

  // Auto-advance R1 byes synchronously so R2 doesn't render with phantom
  // unfilled slots. Use the slot pattern directly — we know which slots had
  // a null counterpart.
  for (let s = 0; s < matchIds[0].length; s++) {
    const playerA = slots[s * 2];
    const playerB = slots[s * 2 + 1];
    if (playerA && !playerB) await advanceMatch(matchIds[0][s], playerA);
    else if (!playerA && playerB) await advanceMatch(matchIds[0][s], playerB);
  }
}

// ============================================================
// Double elimination — supports B in {4, 8}
// (extending to 16+ is mechanical; deferred to v2 to keep this tight)
// ============================================================

export async function seedDoubleElim(
  eventId: string,
  playerIds: string[]
): Promise<void> {
  if (playerIds.length < 2) throw new Error("Need at least 2 players");
  const B = nextPow2(playerIds.length);
  if (B !== 4 && B !== 8) {
    throw new Error(
      `Double-elim v1 supports 3-8 players (bracket size 4 or 8). ` +
        `For ${playerIds.length} players, use Swiss instead.`
    );
  }
  const slots = seedToBracketSlots(playerIds, B);
  const wRounds = Math.log2(B); // 2 for B=4, 3 for B=8

  // ---- Create winners rounds + matches ----
  const wRoundIds: string[] = [];
  for (let r = 1; r <= wRounds; r++) {
    const [row] = await db
      .insert(rounds)
      .values({
        eventId,
        roundNumber: r,
        bracketSide: "winners",
        status: r === 1 ? "active" : "pending",
        startedAt: r === 1 ? sql`now()` : null,
      })
      .returning({ id: rounds.id });
    wRoundIds.push(row.id);
  }
  const wMatchIds: string[][] = [];
  for (let r = 1; r <= wRounds; r++) {
    const num = B / Math.pow(2, r);
    const row: string[] = [];
    for (let s = 0; s < num; s++) {
      const playerA = r === 1 ? slots[s * 2] : null;
      const playerB = r === 1 ? slots[s * 2 + 1] : null;
      const status =
        r === 1 && playerA && playerB ? "in_progress" : "pending";
      const [m] = await db
        .insert(matches)
        .values({
          roundId: wRoundIds[r - 1],
          eventId,
          bracketSide: "winners",
          slotIndex: s,
          playerAId: playerA,
          playerBId: playerB,
          status,
        })
        .returning({ id: matches.id });
      row.push(m.id);
    }
    wMatchIds.push(row);
  }

  // ---- Create losers rounds + matches ----
  // For B=4: L-R1 (1 match), L-R2 (1 match, "L-final")
  // For B=8: L-R1 (2 matches), L-R2 (2 matches), L-R3 (1), L-R4 (1, "L-final")
  const lRoundCount = 2 * (wRounds - 1);
  const lRoundIds: string[] = [];
  for (let r = 1; r <= lRoundCount; r++) {
    const [row] = await db
      .insert(rounds)
      .values({
        eventId,
        roundNumber: r,
        bracketSide: "losers",
        status: "pending",
      })
      .returning({ id: rounds.id });
    lRoundIds.push(row.id);
  }
  const lMatchIds: string[][] = [];
  for (let r = 1; r <= lRoundCount; r++) {
    // Round size: L-R1 = B/4 (winners-R1-loser pairs), L-R2 same,
    // L-R3 = B/8, L-R4 same, …. In general:
    //   odd r:  ceil(r/2) → matches = B / 2^(ceil(r/2)+1)
    //   even r: r/2     → matches = B / 2^(r/2+1)
    const tier = Math.ceil(r / 2);
    const num = B / Math.pow(2, tier + 1);
    const row: string[] = [];
    for (let s = 0; s < num; s++) {
      const [m] = await db
        .insert(matches)
        .values({
          roundId: lRoundIds[r - 1],
          eventId,
          bracketSide: "losers",
          slotIndex: s,
          status: "pending",
        })
        .returning({ id: matches.id });
      row.push(m.id);
    }
    lMatchIds.push(row);
  }

  // ---- Grand final round + match (+ pre-created reset) ----
  const [grandRoundRow] = await db
    .insert(rounds)
    .values({
      eventId,
      roundNumber: 1,
      bracketSide: "grand_final",
      status: "pending",
    })
    .returning({ id: rounds.id });
  const [grandFinalRow] = await db
    .insert(matches)
    .values({
      roundId: grandRoundRow.id,
      eventId,
      bracketSide: "grand_final",
      slotIndex: 0,
      status: "pending",
    })
    .returning({ id: matches.id });
  const [grandResetRow] = await db
    .insert(matches)
    .values({
      roundId: grandRoundRow.id,
      eventId,
      bracketSide: "grand_final",
      slotIndex: 1,
      status: "pending",
    })
    .returning({ id: matches.id });

  // ---- Wire winners bracket → winners + losers drops ----
  // W-R r match s: winner → W-R(r+1)[floor(s/2)] slot (s%2==0?A:B)
  //                loser  → L-R(matching) match (varies by r) slot (varies)
  for (let r = 0; r < wRounds; r++) {
    for (let s = 0; s < wMatchIds[r].length; s++) {
      const isLastWRound = r === wRounds - 1;
      const nextWin = isLastWRound
        ? grandFinalRow.id
        : wMatchIds[r + 1][Math.floor(s / 2)];
      const nextWinSlot: "A" | "B" = isLastWRound
        ? "A" // winners champ takes A in grand final
        : s % 2 === 0
          ? "A"
          : "B";

      // Losers drop:
      // W-R1 losers → L-R1 (pair adjacent W-R1 losers)
      // W-R(>=2) losers → L-R(2(r-0)) — even losers rounds — with cross-pair
      let nextLose: string;
      let nextLoseSlot: "A" | "B";
      if (r === 0) {
        // W-R1[s] loser → L-R1[floor(s/2)] slot (s%2==0?A:B)
        nextLose = lMatchIds[0][Math.floor(s / 2)];
        nextLoseSlot = s % 2 === 0 ? "A" : "B";
      } else {
        // W-R(r+1) loser → L-R(2r) with cross-pair: L-R(2r)[s] slot A,
        // but cross to the OPPOSITE half to avoid an immediate rematch.
        // The simplest cross is: lose-target = (numMatches - 1 - s).
        const lRoundIdx = 2 * r - 1; // 0-indexed: r=1 → idx 1 (L-R2), r=2 → idx 3 (L-R4)
        const targetMatches = lMatchIds[lRoundIdx];
        const crossSlot = targetMatches.length - 1 - s;
        nextLose = targetMatches[crossSlot];
        nextLoseSlot = "A"; // W-R loser always drops into slot A
      }

      await db
        .update(matches)
        .set({
          nextMatchWinId: nextWin,
          nextSlot: nextWinSlot,
          nextMatchLoseId: nextLose,
          nextLoseSlot,
        })
        .where(eq(matches.id, wMatchIds[r][s]));
    }
  }

  // ---- Wire losers bracket → losers + losers final → grand final A side ----
  // odd L-R r winner → L-R(r+1) consolidation (slot B, since W loser fills A)
  // even L-R r winner → L-R(r+1) pairing (slot A or B based on s)
  for (let r = 0; r < lRoundCount; r++) {
    for (let s = 0; s < lMatchIds[r].length; s++) {
      const isLastLRound = r === lRoundCount - 1;
      if (isLastLRound) {
        // L-final winner → grand final slot B
        await db
          .update(matches)
          .set({
            nextMatchWinId: grandFinalRow.id,
            nextSlot: "B",
          })
          .where(eq(matches.id, lMatchIds[r][s]));
        continue;
      }
      // Otherwise: next losers round
      const isOddRound = (r + 1) % 2 === 1; // r is 0-indexed, so r=0 is L-R1 (odd)
      let nextMatchId: string;
      let nextSlot: "A" | "B";
      if (isOddRound) {
        // Odd L-R winners go into the even L-R below, slot B (slot A reserved
        // for the W-R loser dropping in).
        nextMatchId = lMatchIds[r + 1][s];
        nextSlot = "B";
      } else {
        // Even L-R winners go into the odd L-R below, paired up.
        nextMatchId = lMatchIds[r + 1][Math.floor(s / 2)];
        nextSlot = s % 2 === 0 ? "A" : "B";
      }
      await db
        .update(matches)
        .set({
          nextMatchWinId: nextMatchId,
          nextSlot,
        })
        .where(eq(matches.id, lMatchIds[r][s]));
    }
  }

  // ---- Wire grand final → reset (only used if losers-side wins) ----
  await db
    .update(matches)
    .set({
      nextMatchWinId: grandResetRow.id,
      nextSlot: "A",
    })
    .where(eq(matches.id, grandFinalRow.id));

  // ---- Auto-advance any R1 winners-bracket byes ----
  for (let s = 0; s < wMatchIds[0].length; s++) {
    const playerA = slots[s * 2];
    const playerB = slots[s * 2 + 1];
    if (playerA && !playerB) await advanceMatch(wMatchIds[0][s], playerA);
    else if (!playerA && playerB) await advanceMatch(wMatchIds[0][s], playerB);
  }
}

// ============================================================
// Round robin
// ============================================================

export async function seedRoundRobin(
  eventId: string,
  playerIds: string[]
): Promise<void> {
  if (playerIds.length < 2) throw new Error("Need at least 2 players");
  const schedule = roundRobinSchedule(playerIds);

  for (let r = 0; r < schedule.length; r++) {
    const [round] = await db
      .insert(rounds)
      .values({
        eventId,
        roundNumber: r + 1,
        bracketSide: "none",
        status: r === 0 ? "active" : "pending",
        startedAt: r === 0 ? sql`now()` : null,
      })
      .returning({ id: rounds.id });

    for (let s = 0; s < schedule[r].length; s++) {
      const pair = schedule[r][s];
      const [m] = await db
        .insert(matches)
        .values({
          roundId: round.id,
          eventId,
          bracketSide: "none",
          slotIndex: s,
          playerAId: pair.playerAId,
          playerBId: pair.playerBId,
          status: pair.playerBId ? "in_progress" : "pending",
        })
        .returning({ id: matches.id });
      // Bye match: auto-record the present player as winner.
      if (!pair.playerBId) await advanceMatch(m.id, pair.playerAId);
    }
  }
}

// ============================================================
// Swiss
// ============================================================

/**
 * Pair the next Swiss round from current standings + insert it into the DB.
 * Returns the new round id (or null if every player has already played
 * `totalRounds` rounds).
 *
 * For round 1 we seed by event_players.seed (no prior results).
 */
export async function pairNextSwissRound(
  eventId: string,
  totalRounds: number
): Promise<string | null> {
  const roster = await db
    .select()
    .from(eventPlayers)
    .where(eq(eventPlayers.eventId, eventId));
  const allMatches: Match[] = await db
    .select()
    .from(matches)
    .where(eq(matches.eventId, eventId));
  const swissRounds = await db
    .select()
    .from(rounds)
    .where(
      and(eq(rounds.eventId, eventId), eq(rounds.bracketSide, "none"))
    );

  if (swissRounds.length >= totalRounds) return null;

  // Build PlayerStanding[] from completed matches.
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const opponents = new Map<string, string[]>();
  const hasHadBye = new Map<string, boolean>();
  for (const r of roster) {
    wins.set(r.playerId, 0);
    losses.set(r.playerId, 0);
    opponents.set(r.playerId, []);
    hasHadBye.set(r.playerId, false);
  }
  for (const m of allMatches) {
    if (m.status !== "complete") continue;
    if (!m.winnerId) continue;
    if (m.playerAId && m.playerBId) {
      opponents.get(m.playerAId)?.push(m.playerBId);
      opponents.get(m.playerBId)?.push(m.playerAId);
      if (m.winnerId === m.playerAId) {
        wins.set(m.playerAId, (wins.get(m.playerAId) ?? 0) + 1);
        losses.set(m.playerBId, (losses.get(m.playerBId) ?? 0) + 1);
      } else {
        wins.set(m.playerBId, (wins.get(m.playerBId) ?? 0) + 1);
        losses.set(m.playerAId, (losses.get(m.playerAId) ?? 0) + 1);
      }
    } else if (m.playerAId && !m.playerBId) {
      // Bye
      wins.set(m.playerAId, (wins.get(m.playerAId) ?? 0) + 1);
      hasHadBye.set(m.playerAId, true);
    }
  }

  const seedById = new Map(roster.map((r) => [r.playerId, r.seed]));
  const standings: PlayerStanding[] = roster
    .filter((r) => !r.withdrawn)
    .map((r) => ({
      playerId: r.playerId,
      matchPoints: (wins.get(r.playerId) ?? 0) * 3,
      opponentsFaced: opponents.get(r.playerId) ?? [],
      hasHadBye: hasHadBye.get(r.playerId) ?? false,
    }))
    // Seed-stable secondary order so round 1 (everyone 0 MP) honors seeds.
    .sort((a, b) => (seedById.get(a.playerId) ?? 0) - (seedById.get(b.playerId) ?? 0));

  const pairings = generateSwissPairings(standings);
  const nextRoundNumber = swissRounds.length + 1;

  const [round] = await db
    .insert(rounds)
    .values({
      eventId,
      roundNumber: nextRoundNumber,
      bracketSide: "none",
      status: "active",
      startedAt: sql`now()`,
    })
    .returning({ id: rounds.id });

  for (let s = 0; s < pairings.length; s++) {
    const p = pairings[s];
    const [m] = await db
      .insert(matches)
      .values({
        roundId: round.id,
        eventId,
        bracketSide: "none",
        slotIndex: s,
        playerAId: p.playerAId,
        playerBId: p.playerBId,
        status: p.playerBId ? "in_progress" : "pending",
      })
      .returning({ id: matches.id });
    // Bye → auto-advance the present player.
    if (!p.playerBId) await advanceMatch(m.id, p.playerAId);
  }

  return round.id;
}
