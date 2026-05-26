"use server";

import { after } from "next/server";
import { revalidatePath as _revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  eventPlayers,
  events,
  leagues,
  players,
  type Event,
} from "@/db/schema";
import {
  generateJoinToken,
  setLeagueCookie,
} from "@/lib/auth";
import {
  getEvent,
  getLeagueById,
  getRoster,
  listLeaguePlayers,
  setBallerJobError,
  setBallerJobStarted,
  setBallerPortraits,
  setEventStatus,
} from "@/db/queries";
import {
  generateBallerAvatarVariants,
  normalizeSelfieToSquareJpeg,
  uploadBallerSelfie,
} from "@/lib/baller";
import { isBallerArchetype } from "@/lib/baller-types";
import { generateBallerNickname } from "@/lib/nickname";
import {
  pairNextSwissRound,
  seedDoubleElim,
  seedRoundRobin,
  seedSingleElim,
} from "@/lib/bracket/materialize";
import {
  advanceMatch,
  cascadeClearMatch,
  clearMatch,
} from "@/lib/bracket/advance";

// Revalidation is request-scoped; in scripts (verify, seeds) we don't have
// a request, so swallow the throw rather than crash.
function revalidatePath(path: string) {
  try {
    _revalidatePath(path);
  } catch {
    /* no-op outside request context */
  }
}

// ---------------- Identity ----------------

export async function createLeaguePlayerAction(formData: FormData) {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!leagueSlug) throw new Error("League required");
  if (!name) throw new Error("Display name required");

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, leagueSlug));
  if (!league) throw new Error("League not found");

  const token = generateJoinToken();
  const [player] = await db
    .insert(players)
    .values({
      leagueId: league.id,
      leagueToken: token,
      displayName: name,
      nickname: generateBallerNickname(name),
    })
    .returning();

  await setLeagueCookie(league.id, token);
  revalidatePath(`/leagues/${league.slug}`);
  redirect(`/players/${player.id}`);
}

export async function claimLeaguePlayerAction(formData: FormData) {
  const leagueSlug = String(formData.get("leagueSlug") ?? "").trim();
  const playerId = String(formData.get("playerId") ?? "").trim();
  if (!leagueSlug) throw new Error("League required");
  if (!playerId) throw new Error("Player required");

  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.slug, leagueSlug));
  if (!league) throw new Error("League not found");

  const [player] = await db
    .select()
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.leagueId, league.id)));
  if (!player) throw new Error("Player is not in this league");

  await setLeagueCookie(league.id, player.leagueToken);
  revalidatePath(`/leagues/${league.slug}`);
  redirect(`/leagues/${league.slug}`);
}

/**
 * Rename a player's display name. Nickname stays put — it's deterministic
 * from the original name and the user may have grown attached to it.
 */
export async function renamePlayerAction(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!playerId) throw new Error("playerId required");
  if (!name) throw new Error("Display name required");
  if (name.length > 80) throw new Error("Display name too long (max 80 chars)");

  const [updated] = await db
    .update(players)
    .set({ displayName: name })
    .where(eq(players.id, playerId))
    .returning({ leagueId: players.leagueId });
  if (!updated) throw new Error("Player not found");

  revalidatePath(`/players/${playerId}`);
  const league = await getLeagueById(updated.leagueId);
  if (league) revalidatePath(`/leagues/${league.slug}`);
}

// ---------------- Baller image generation ----------------

/**
 * Kick off the FLUX baller pipeline. Flips the player's job_started_at flag
 * and returns in <1s; the actual ~6s (fal) or ~90s (local) work runs after
 * the response via Next's after() so the form submit isn't blocked by it.
 */
export async function generateBallerAction(formData: FormData) {
  const playerId = String(formData.get("playerId") ?? "");
  const archetypeRaw = String(formData.get("archetype") ?? "");
  const freeform = String(formData.get("freeform") ?? "");
  const selfie = formData.get("selfie");

  if (!playerId) throw new Error("playerId required");
  if (!isBallerArchetype(archetypeRaw)) {
    throw new Error(`Unknown archetype: ${archetypeRaw}`);
  }
  if (!(selfie instanceof File) || selfie.size === 0) {
    throw new Error("Selfie file required");
  }

  const rawSelfie = Buffer.from(await selfie.arrayBuffer());
  const selfieBuf = await normalizeSelfieToSquareJpeg(rawSelfie);
  const selfieUrl = await uploadBallerSelfie(playerId, selfieBuf);

  await setBallerJobStarted(playerId, archetypeRaw, selfieUrl);

  const provider = process.env.IMAGE_GEN_PROVIDER ?? "fal";
  console.log(
    `[baller-gen] starting for ${playerId} archetype=${archetypeRaw} provider=${provider}`
  );

  after(async () => {
    const startedAt = Date.now();
    try {
      const avatars = await generateBallerAvatarVariants({
        playerId,
        selfieBuf,
        archetype: archetypeRaw,
        freeform: freeform || undefined,
        // Vercel kills functions at 300s; leave a 60s margin so we surface
        // a clean error rather than getting whacked mid-write.
        signal: AbortSignal.timeout(240_000),
      });
      const urls = { selfieUrl, ...avatars };
      await setBallerPortraits(playerId, urls);
      const ms = Date.now() - startedAt;
      console.log(`[baller-gen] done for ${playerId} in ${ms}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await setBallerJobError(playerId, msg);
      console.error(`[baller-gen] failed for ${playerId}:`, err);
    }
  });

  revalidatePath(`/players/${playerId}`);
}

// ---------------- Events ----------------

export async function createEventAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const formatRaw = String(formData.get("format") ?? "");
  const totalRoundsRaw = String(formData.get("totalRounds") ?? "");
  const playerIds = formData.getAll("playerId").map(String).filter(Boolean);

  if (!leagueId) throw new Error("League required");
  if (!name) throw new Error("Event name required");
  if (playerIds.length < 2) throw new Error("Need at least 2 players");

  const validFormats: Event["format"][] = [
    "single_elim",
    "double_elim",
    "round_robin",
    "swiss",
  ];
  if (!validFormats.includes(formatRaw as Event["format"])) {
    throw new Error(`Unknown format: ${formatRaw}`);
  }
  const format = formatRaw as Event["format"];

  // Verify all selected players belong to this league.
  const leaguePlayers = await listLeaguePlayers(leagueId);
  const ok = new Set(leaguePlayers.map((p) => p.id));
  for (const pid of playerIds) {
    if (!ok.has(pid)) throw new Error(`Player ${pid} not in this league`);
  }

  let totalRounds: number | null = null;
  if (format === "swiss") {
    const parsed = Number(totalRoundsRaw);
    totalRounds = Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : Math.max(3, Math.ceil(Math.log2(playerIds.length)));
  }

  const [created] = await db
    .insert(events)
    .values({ leagueId, name, format, totalRounds })
    .returning();

  await db.insert(eventPlayers).values(
    playerIds.map((pid, idx) => ({
      eventId: created.id,
      playerId: pid,
      seed: idx + 1,
      joinToken: generateJoinToken(),
    }))
  );

  const league = await getLeagueById(leagueId);
  if (league) revalidatePath(`/leagues/${league.slug}`);
  redirect(`/events/${created.id}`);
}

/**
 * Materialize the bracket / pairings for an event and flip it to "active".
 * For Swiss this is a no-op for pairings (those are generated round-by-round
 * via advanceSwissRoundAction) but still flips the event status.
 */
export async function startEventAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("eventId required");
  const event = await getEvent(eventId);
  if (!event) throw new Error("Event not found");
  if (event.status !== "draft") {
    throw new Error(`Event already ${event.status}`);
  }
  const roster = await getRoster(eventId);
  if (roster.length < 2) throw new Error("Need at least 2 players");
  const playerIds = roster.map((r) => r.playerId);

  await setEventStatus(eventId, "active");

  if (event.format === "single_elim") {
    await seedSingleElim(eventId, playerIds);
  } else if (event.format === "double_elim") {
    await seedDoubleElim(eventId, playerIds);
  } else if (event.format === "round_robin") {
    await seedRoundRobin(eventId, playerIds);
  } else {
    // Swiss: pair round 1 from seed order. Subsequent rounds are paired
    // explicitly via advanceSwissRoundAction once the operator confirms.
    if (event.totalRounds) {
      await pairNextSwissRound(eventId, event.totalRounds);
    }
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

/**
 * Generate the next Swiss round from current standings. The current round
 * must be complete (every match has a winner). Idempotent in spirit —
 * pairNextSwissRound short-circuits once we've hit totalRounds.
 */
export async function advanceSwissRoundAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) throw new Error("eventId required");
  const event = await getEvent(eventId);
  if (!event) throw new Error("Event not found");
  if (event.format !== "swiss") {
    throw new Error("Only Swiss events advance rounds this way");
  }
  if (!event.totalRounds) throw new Error("totalRounds not set");

  const newRoundId = await pairNextSwissRound(eventId, event.totalRounds);
  if (newRoundId === null) {
    // We've hit totalRounds — flip the event to complete if every match is done.
    // (advanceMatch already handles the case where the last match of the
    // last round completes; this catches the edge case where the operator
    // clicks "advance" after the last round is finished.)
    await setEventStatus(eventId, "complete");
  }

  revalidatePath(`/events/${eventId}`);
}

// ---------------- Match advancement (operator) ----------------

export async function reportMatchWinnerAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const winnerId = String(formData.get("winnerId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!matchId) throw new Error("matchId required");
  if (!winnerId) throw new Error("winnerId required");

  await advanceMatch(matchId, winnerId);

  if (eventId) {
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/bracket`);
    revalidatePath(`/events/${eventId}/play`);
    revalidatePath(`/events/${eventId}/broadcast`);
  }
}

/**
 * Undo a winner pick. Used by the bracket view — operator clicks the player
 * who's currently marked winner and the match flips back to in_progress.
 * Refuses if downstream matches have already completed.
 */
export async function clearMatchWinnerAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!matchId) throw new Error("matchId required");

  await clearMatch(matchId);

  if (eventId) {
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/bracket`);
    revalidatePath(`/events/${eventId}/play`);
    revalidatePath(`/events/${eventId}/broadcast`);
  }
}

/**
 * Cascade-undo: clear a match and every downstream match that's also
 * complete. Used when the operator clicks a player's "advanced" portrait in
 * a later round — that single click should peel back all of their wins from
 * that point forward.
 */
export async function cascadeClearMatchAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!matchId) throw new Error("matchId required");

  await cascadeClearMatch(matchId);

  if (eventId) {
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/bracket`);
    revalidatePath(`/events/${eventId}/play`);
    revalidatePath(`/events/${eventId}/broadcast`);
  }
}

/**
 * Invert a completed match's winner — operator clicks the player who's
 * currently marked the loser. The current winner's downstream wins are
 * cascade-cleared first, then the click-target is advanced as the new
 * winner.
 */
export async function invertMatchWinnerAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  const winnerId = String(formData.get("winnerId") ?? "");
  const eventId = String(formData.get("eventId") ?? "");
  if (!matchId) throw new Error("matchId required");
  if (!winnerId) throw new Error("winnerId required");

  await cascadeClearMatch(matchId);
  await advanceMatch(matchId, winnerId);

  if (eventId) {
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/bracket`);
    revalidatePath(`/events/${eventId}/play`);
    revalidatePath(`/events/${eventId}/broadcast`);
  }
}
