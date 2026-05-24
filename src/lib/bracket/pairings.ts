// Pure functions only — no DB, no server-only. Imported by both the
// DB-touching materializer and by vitest unit tests.

/**
 * Standard tournament seed-order positions for a bracket of size B.
 * Recurrence: positions(2k) = interleave each p in positions(k) with (2k+1-p).
 *   positions(2) = [1, 2]
 *   positions(4) = [1, 4, 2, 3]
 *   positions(8) = [1, 8, 4, 5, 2, 7, 3, 6]
 */
export function standardSeedPositions(B: number): number[] {
  if (B === 1) return [1];
  const half = standardSeedPositions(B / 2);
  const out: number[] = [];
  for (const p of half) out.push(p, B + 1 - p);
  return out;
}

/**
 * Map seeded player IDs into bracket slots. Slots where the position exceeds
 * the actual player count are byes (null).
 */
export function seedToBracketSlots(
  playerIds: string[],
  B: number
): Array<string | null> {
  const positions = standardSeedPositions(B);
  return positions.map((seed) =>
    seed <= playerIds.length ? playerIds[seed - 1] : null
  );
}

export function nextPow2(n: number): number {
  let b = 1;
  while (b < n) b *= 2;
  return b;
}

/**
 * Circle-method round-robin schedule. For N players, generates N-1 rounds
 * (even N) or N rounds (odd N — every round one player gets a bye).
 * Each round has ⌊N/2⌋ matches.
 */
export function roundRobinSchedule(
  playerIds: string[]
): Array<Array<{ playerAId: string; playerBId: string | null }>> {
  const isOdd = playerIds.length % 2 === 1;
  const pool: Array<string | null> = isOdd
    ? [...playerIds, null]
    : [...playerIds];
  const N = pool.length;
  const numRounds = N - 1;
  const out: Array<Array<{ playerAId: string; playerBId: string | null }>> = [];
  for (let r = 0; r < numRounds; r++) {
    const round: Array<{ playerAId: string; playerBId: string | null }> = [];
    for (let i = 0; i < N / 2; i++) {
      const a = pool[i];
      const b = pool[N - 1 - i];
      if (a === null && b === null) continue;
      if (a === null) round.push({ playerAId: b!, playerBId: null });
      else round.push({ playerAId: a, playerBId: b });
    }
    out.push(round);
    const tail = pool.slice(1);
    tail.unshift(tail.pop()!);
    for (let i = 0; i < tail.length; i++) pool[i + 1] = tail[i];
  }
  return out;
}
