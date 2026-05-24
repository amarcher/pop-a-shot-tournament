import type { Match } from "@/db/schema";

export interface PlayerRecord {
  playerId: string;
  seed: number;
  wins: number;
  losses: number;
  /** Opponents this player has played (one entry per match, includes byes? no — byes skipped). */
  opponents: string[];
}

export function buildRecords(
  playerIds: string[],
  seeds: Map<string, number>,
  matches: Match[]
): PlayerRecord[] {
  const recs = new Map<string, PlayerRecord>(
    playerIds.map((id) => [
      id,
      {
        playerId: id,
        seed: seeds.get(id) ?? 0,
        wins: 0,
        losses: 0,
        opponents: [],
      },
    ])
  );
  for (const m of matches) {
    if (m.status !== "complete" || !m.winnerId) continue;
    const a = m.playerAId;
    const b = m.playerBId;
    // Real head-to-head (not a bye)
    if (a && b) {
      const ra = recs.get(a);
      const rb = recs.get(b);
      if (!ra || !rb) continue;
      ra.opponents.push(b);
      rb.opponents.push(a);
      if (m.winnerId === a) {
        ra.wins++;
        rb.losses++;
      } else {
        rb.wins++;
        ra.losses++;
      }
    } else if (a && !b) {
      // Bye — count as a win, no opponent.
      const ra = recs.get(a);
      if (ra) ra.wins++;
    }
  }
  return Array.from(recs.values());
}

/**
 * Round-robin tiebreakers: wins → losses (fewer better) → H2H → seed.
 */
export function rankRoundRobin(records: PlayerRecord[]): PlayerRecord[] {
  return records.slice().sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    // H2H: if exactly two players tied, look up who beat whom.
    const aBeatB = a.opponents.includes(b.playerId) && b.opponents.includes(a.playerId);
    if (aBeatB) {
      // We don't carry winner per opponent — fall back to seed.
    }
    return a.seed - b.seed;
  });
}

/**
 * Swiss MP + OMW%. With binary matches and no draws:
 *   MP = 3 * wins
 *   matchWinPct (per opponent) = wins / (wins + losses), floored at 0.33
 *   OMW% = mean(matchWinPct of all opponents)
 */
const TIEBREAKER_FLOOR = 1 / 3;

export interface SwissStanding extends PlayerRecord {
  matchPoints: number;
  opponentMatchWinPct: number;
}

export function rankSwiss(records: PlayerRecord[]): SwissStanding[] {
  const byId = new Map(records.map((r) => [r.playerId, r]));
  const mwPct = new Map<string, number>();
  for (const r of records) {
    const total = r.wins + r.losses;
    const pct = total === 0 ? 0 : r.wins / total;
    mwPct.set(r.playerId, Math.max(pct, TIEBREAKER_FLOOR));
  }
  const out: SwissStanding[] = records.map((r) => {
    const matchPoints = r.wins * 3;
    const opps = r.opponents
      .map((id) => mwPct.get(id))
      .filter((x): x is number => typeof x === "number");
    const omw = opps.length === 0 ? 0 : opps.reduce((s, v) => s + v, 0) / opps.length;
    return { ...r, matchPoints, opponentMatchWinPct: omw };
  });
  void byId;
  return out.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.opponentMatchWinPct !== a.opponentMatchWinPct)
      return b.opponentMatchWinPct - a.opponentMatchWinPct;
    return a.seed - b.seed;
  });
}
