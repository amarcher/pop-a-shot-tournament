import { describe, expect, it } from "vitest";
import {
  nextPow2,
  roundRobinSchedule,
  seedToBracketSlots,
  standardSeedPositions,
} from "./pairings";

describe("standardSeedPositions", () => {
  it("returns the canonical seed orderings", () => {
    expect(standardSeedPositions(1)).toEqual([1]);
    expect(standardSeedPositions(2)).toEqual([1, 2]);
    expect(standardSeedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(standardSeedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(standardSeedPositions(16)).toEqual([
      1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
    ]);
  });
});

describe("seedToBracketSlots", () => {
  it("fills slots in seed order and uses null for byes", () => {
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const slots = seedToBracketSlots(players, 8);
    // positions = [1, 8, 4, 5, 2, 7, 3, 6]; seed 8 doesn't exist → null
    expect(slots).toEqual([
      "p1", null, "p4", "p5", "p2", "p7", "p3", "p6",
    ]);
  });

  it("returns all players when N is a power of 2", () => {
    const players = ["a", "b", "c", "d"];
    expect(seedToBracketSlots(players, 4)).toEqual(["a", "d", "b", "c"]);
  });
});

describe("nextPow2", () => {
  it("returns 2, 4, 8, 16 for typical small inputs", () => {
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(8)).toBe(8);
    expect(nextPow2(9)).toBe(16);
  });
});

describe("roundRobinSchedule", () => {
  it("4 players → 3 rounds of 2 matches each, every pair exactly once", () => {
    const sched = roundRobinSchedule(["a", "b", "c", "d"]);
    expect(sched).toHaveLength(3);
    for (const r of sched) expect(r).toHaveLength(2);

    const pairs = new Set<string>();
    for (const r of sched) {
      for (const m of r) {
        const key = [m.playerAId, m.playerBId].sort().join("|");
        expect(pairs.has(key)).toBe(false);
        pairs.add(key);
      }
    }
    expect(pairs.size).toBe(6); // C(4, 2)
  });

  it("3 players → 3 rounds with a bye each round", () => {
    const sched = roundRobinSchedule(["a", "b", "c"]);
    expect(sched).toHaveLength(3);
    let byeCount = 0;
    for (const r of sched) {
      for (const m of r) {
        if (m.playerBId === null) byeCount++;
      }
    }
    expect(byeCount).toBe(3); // one bye per round
  });

  it("each player appears in every round (even N)", () => {
    const players = ["a", "b", "c", "d", "e", "f"];
    const sched = roundRobinSchedule(players);
    expect(sched).toHaveLength(5);
    for (const r of sched) {
      const seen = new Set<string>();
      for (const m of r) {
        seen.add(m.playerAId);
        if (m.playerBId) seen.add(m.playerBId);
      }
      expect(seen.size).toBe(players.length);
    }
  });
});
