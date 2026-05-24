import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "./client";
import {
  eventPlayers,
  events,
  leagues,
  matches,
  players,
  rounds,
  type Event,
  type EventPlayer,
  type Match,
  type Player,
  type Round,
} from "./schema";

// ---------------- Leagues ----------------

export async function getLeagueBySlug(slug: string) {
  const rows = await db.select().from(leagues).where(eq(leagues.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getLeagueById(id: string) {
  const rows = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listLeagues() {
  return db.select().from(leagues).orderBy(asc(leagues.createdAt));
}

// ---------------- Players ----------------

export async function getPlayer(id: string): Promise<Player | null> {
  const rows = await db.select().from(players).where(eq(players.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPlayerByLeagueToken(
  leagueId: string,
  token: string
): Promise<Player | null> {
  const rows = await db
    .select()
    .from(players)
    .where(and(eq(players.leagueId, leagueId), eq(players.leagueToken, token)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLeaguePlayers(leagueId: string): Promise<Player[]> {
  return db
    .select()
    .from(players)
    .where(eq(players.leagueId, leagueId))
    .orderBy(asc(players.createdAt));
}

export async function setBallerJobStarted(playerId: string, archetype: string) {
  await db
    .update(players)
    .set({
      ballerArchetype: archetype,
      jobStartedAt: sql`now()`,
      jobError: null,
    })
    .where(eq(players.id, playerId));
}

export async function setBallerJobError(playerId: string, error: string) {
  await db
    .update(players)
    .set({ jobError: error, jobStartedAt: null })
    .where(eq(players.id, playerId));
}

export async function setBallerPortraits(
  playerId: string,
  urls: {
    selfieUrl: string;
    avatarNeutralUrl: string;
    avatarVictoryUrl: string;
    avatarDefeatedUrl: string;
  }
) {
  await db
    .update(players)
    .set({ ...urls, jobStartedAt: null, jobError: null })
    .where(eq(players.id, playerId));
}

// Clears stale job flags so users can retry after a crashed background job.
export async function sweepStaleBallerJobs(thresholdMs = 6 * 60 * 1000) {
  await db
    .update(players)
    .set({ jobStartedAt: null, jobError: "background job timed out" })
    .where(
      and(
        sql`${players.jobStartedAt} IS NOT NULL`,
        sql`${players.jobStartedAt} < now() - interval '${sql.raw(`${Math.floor(thresholdMs / 1000)} seconds`)}'`
      )
    );
}

// ---------------- Events ----------------

export async function getEvent(id: string): Promise<Event | null> {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listLeagueEvents(leagueId: string) {
  return db
    .select()
    .from(events)
    .where(eq(events.leagueId, leagueId))
    .orderBy(desc(events.createdAt));
}

export async function setEventStatus(
  eventId: string,
  status: "draft" | "active" | "complete"
) {
  await db.update(events).set({ status }).where(eq(events.id, eventId));
}

// ---------------- Event players (roster) ----------------

export interface RosterEntry {
  eventId: string;
  playerId: string;
  seed: number;
  finalStanding: number | null;
  withdrawn: boolean;
  joinToken: string;
  player: Player;
}

export async function getRoster(eventId: string): Promise<RosterEntry[]> {
  const rows = await db
    .select({
      eventId: eventPlayers.eventId,
      playerId: eventPlayers.playerId,
      seed: eventPlayers.seed,
      finalStanding: eventPlayers.finalStanding,
      withdrawn: eventPlayers.withdrawn,
      joinToken: eventPlayers.joinToken,
      player: players,
    })
    .from(eventPlayers)
    .innerJoin(players, eq(players.id, eventPlayers.playerId))
    .where(eq(eventPlayers.eventId, eventId))
    .orderBy(asc(eventPlayers.seed));
  return rows;
}

export async function getEventPlayerByToken(
  eventId: string,
  token: string
): Promise<EventPlayer | null> {
  const rows = await db
    .select()
    .from(eventPlayers)
    .where(
      and(eq(eventPlayers.eventId, eventId), eq(eventPlayers.joinToken, token))
    )
    .limit(1);
  return rows[0] ?? null;
}

// ---------------- Rounds ----------------

export async function listRounds(eventId: string): Promise<Round[]> {
  return db
    .select()
    .from(rounds)
    .where(eq(rounds.eventId, eventId))
    .orderBy(asc(rounds.roundNumber), asc(rounds.bracketSide));
}

export async function setRoundStatus(
  roundId: string,
  status: "pending" | "active" | "complete"
) {
  const patch: Record<string, unknown> = { status };
  if (status === "active") patch.startedAt = sql`now()`;
  if (status === "complete") patch.completedAt = sql`now()`;
  await db.update(rounds).set(patch).where(eq(rounds.id, roundId));
}

// ---------------- Matches ----------------

export async function getMatch(id: string): Promise<Match | null> {
  const rows = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listEventMatches(eventId: string): Promise<Match[]> {
  return db
    .select()
    .from(matches)
    .where(eq(matches.eventId, eventId))
    .orderBy(
      asc(matches.bracketSide),
      asc(matches.slotIndex)
    );
}

export async function listRoundMatches(roundId: string): Promise<Match[]> {
  return db
    .select()
    .from(matches)
    .where(eq(matches.roundId, roundId))
    .orderBy(asc(matches.slotIndex));
}

export async function countOpenMatchesInRound(roundId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(matches)
    .where(
      and(
        eq(matches.roundId, roundId),
        or(eq(matches.status, "pending"), eq(matches.status, "in_progress"))!
      )
    );
  return rows[0]?.c ?? 0;
}

// Active matches across the whole event (for the operator's "now playing" list).
export async function listActiveMatches(eventId: string): Promise<Match[]> {
  return db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.eventId, eventId),
        or(eq(matches.status, "pending"), eq(matches.status, "in_progress"))!,
        sql`${matches.playerAId} IS NOT NULL`,
        sql`${matches.playerBId} IS NOT NULL`
      )
    )
    .orderBy(asc(matches.bracketSide), asc(matches.slotIndex));
}

export interface MatchWithPlayers {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
}

/**
 * Fetch matches plus joined player rows in one place so /play, /bracket, and
 * /broadcast don't all re-implement the lookup.
 */
export async function hydrateMatches(
  eventId: string,
  filter?: (m: Match) => boolean
): Promise<MatchWithPlayers[]> {
  const [allMatches, allPlayers] = await Promise.all([
    listEventMatches(eventId),
    listRosterPlayers(eventId),
  ]);
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  const ms = filter ? allMatches.filter(filter) : allMatches;
  return ms.map((m) => ({
    match: m,
    playerA: m.playerAId ? byId.get(m.playerAId) ?? null : null,
    playerB: m.playerBId ? byId.get(m.playerBId) ?? null : null,
  }));
}

async function listRosterPlayers(eventId: string): Promise<Player[]> {
  const rows = await db
    .select({ p: players })
    .from(eventPlayers)
    .innerJoin(players, eq(players.id, eventPlayers.playerId))
    .where(eq(eventPlayers.eventId, eventId));
  return rows.map((r) => r.p);
}

// All completed matches for an event — used to compute standings (RR + Swiss).
export async function listCompletedMatches(eventId: string): Promise<Match[]> {
  return db
    .select()
    .from(matches)
    .where(
      and(eq(matches.eventId, eventId), eq(matches.status, "complete"))
    )
    .orderBy(asc(matches.completedAt));
}

// ---------------- Helpers ----------------

export async function getEventRosterAndMatches(eventId: string) {
  const [event, roster, allMatches, allRounds] = await Promise.all([
    getEvent(eventId),
    getRoster(eventId),
    listEventMatches(eventId),
    listRounds(eventId),
  ]);
  return { event, roster, matches: allMatches, rounds: allRounds };
}

export { isNull };
