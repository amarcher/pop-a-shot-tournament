import { describe, expect, it } from "vitest";
import { buildRecords, rankRoundRobin, rankSwiss } from "./standings";
import type { Match } from "@/db/schema";

function fakeMatch(
  partial: Partial<Match> & {
    playerAId: string | null;
    playerBId: string | null;
  }
): Match {
  return {
    id: crypto.randomUUID(),
    roundId: "r",
    eventId: "e",
    bracketSide: "none",
    slotIndex: 0,
    tableNumber: null,
    nextMatchWinId: null,
    nextMatchLoseId: null,
    nextSlot: null,
    nextLoseSlot: null,
    status: "complete",
    winnerId: null,
    completedAt: new Date(),
    ...partial,
  };
}

describe("buildRecords", () => {
  it("counts wins, losses, opponents from completed matches", () => {
    const matches = [
      fakeMatch({ playerAId: "a", playerBId: "b", winnerId: "a" }),
      fakeMatch({ playerAId: "a", playerBId: "c", winnerId: "c" }),
      fakeMatch({ playerAId: "b", playerBId: "c", winnerId: "b" }),
    ];
    const recs = buildRecords(["a", "b", "c"], new Map(), matches);
    const a = recs.find((r) => r.playerId === "a")!;
    const b = recs.find((r) => r.playerId === "b")!;
    const c = recs.find((r) => r.playerId === "c")!;
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(a.opponents.sort()).toEqual(["b", "c"]);
    expect(b.wins).toBe(1);
    expect(b.losses).toBe(1);
    expect(c.wins).toBe(1);
    expect(c.losses).toBe(1);
  });

  it("treats a null player_b as a bye = win, no opponent", () => {
    const matches = [
      fakeMatch({ playerAId: "a", playerBId: null, winnerId: "a" }),
    ];
    const recs = buildRecords(["a"], new Map(), matches);
    expect(recs[0].wins).toBe(1);
    expect(recs[0].opponents).toEqual([]);
  });

  it("skips incomplete matches", () => {
    const matches = [
      fakeMatch({
        playerAId: "a",
        playerBId: "b",
        winnerId: null,
        status: "in_progress",
      }),
    ];
    const recs = buildRecords(["a", "b"], new Map(), matches);
    expect(recs.every((r) => r.wins === 0)).toBe(true);
  });
});

describe("rankRoundRobin", () => {
  it("orders by wins desc, then losses asc, then seed asc", () => {
    const recs = [
      {
        playerId: "low-seed",
        seed: 5,
        wins: 2,
        losses: 0,
        opponents: [],
      },
      {
        playerId: "high-seed",
        seed: 1,
        wins: 2,
        losses: 0,
        opponents: [],
      },
      {
        playerId: "loser",
        seed: 3,
        wins: 0,
        losses: 2,
        opponents: [],
      },
    ];
    const ranked = rankRoundRobin(recs);
    expect(ranked.map((r) => r.playerId)).toEqual([
      "high-seed",
      "low-seed",
      "loser",
    ]);
  });
});

describe("rankSwiss", () => {
  it("orders by match points then OMW%", () => {
    // Two players tied at 2-1 (6 MP). The one whose opponents won more
    // should rank higher.
    const recs = [
      {
        playerId: "p1",
        seed: 1,
        wins: 2,
        losses: 1,
        opponents: ["weakOpp", "weakOpp", "weakOpp"],
      },
      {
        playerId: "p2",
        seed: 2,
        wins: 2,
        losses: 1,
        opponents: ["strongOpp", "strongOpp", "strongOpp"],
      },
      {
        playerId: "weakOpp",
        seed: 3,
        wins: 0,
        losses: 3,
        opponents: [],
      },
      {
        playerId: "strongOpp",
        seed: 4,
        wins: 3,
        losses: 0,
        opponents: [],
      },
    ];
    const ranked = rankSwiss(recs);
    expect(ranked[0].playerId).toBe("strongOpp"); // 9 MP > 6
    expect(ranked[1].playerId).toBe("p2"); // tied 6 MP with p1, higher OMW%
    expect(ranked[2].playerId).toBe("p1");
    expect(ranked[3].playerId).toBe("weakOpp");
  });

  it("applies the 33% floor to opponent match win pct", () => {
    const recs = [
      {
        playerId: "p1",
        seed: 1,
        wins: 1,
        losses: 0,
        opponents: ["weakOpp"],
      },
      {
        playerId: "weakOpp",
        seed: 2,
        wins: 0,
        losses: 5,
        opponents: [],
      },
    ];
    const ranked = rankSwiss(recs);
    const p1 = ranked.find((r) => r.playerId === "p1")!;
    // weakOpp's actual mwPct is 0; should be floored to 1/3.
    expect(p1.opponentMatchWinPct).toBeCloseTo(1 / 3, 5);
  });
});
