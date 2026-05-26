"use client";

import { useState, useTransition } from "react";
import type { Match, Player } from "@/db/schema";
import { pickMatchOutcomeAvatar, pickPlayerAvatar } from "@/lib/avatar";

/**
 * Big two-portrait "now playing" view for the broadcast page. Used both
 * pre-match (both neutral) and post-match (winner victory, loser defeated).
 * Designed for projector / large TV display, not phone.
 *
 * When `reportAction` is provided and the match is in progress, the portraits
 * become buttons: tap one to preview that player as the winner (victory state,
 * opponent shown defeated), then tap the confirm button to commit.
 */
export function HeadToHead({
  match,
  playerA,
  playerB,
  reportAction,
  eventId,
}: {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
  reportAction?: (formData: FormData) => void | Promise<void>;
  eventId?: string;
}) {
  const completed = match.status === "complete";
  const canReport = !completed && !!reportAction && !!playerA && !!playerB;
  const [pendingWinnerId, setPendingWinnerId] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const displayWinnerId = completed ? match.winnerId : pendingWinnerId;
  const aIsWinner = displayWinnerId !== null && displayWinnerId === playerA?.id;
  const bIsWinner = displayWinnerId !== null && displayWinnerId === playerB?.id;

  const aAvatar = playerA
    ? displayWinnerId
      ? pickMatchOutcomeAvatar(playerA, displayWinnerId)
      : pickPlayerAvatar(playerA, "neutral")
    : null;
  const bAvatar = playerB
    ? displayWinnerId
      ? pickMatchOutcomeAvatar(playerB, displayWinnerId)
      : pickPlayerAvatar(playerB, "neutral")
    : null;

  const pendingPlayer =
    pendingWinnerId === playerA?.id
      ? playerA
      : pendingWinnerId === playerB?.id
        ? playerB
        : null;

  function pick(playerId: string) {
    if (!canReport || isSubmitting) return;
    setPendingWinnerId((cur) => (cur === playerId ? null : playerId));
  }

  function handleSubmit(formData: FormData) {
    if (!reportAction) return;
    startSubmit(async () => {
      await reportAction(formData);
    });
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex justify-end">
          <Portrait
            player={playerA}
            avatar={aAvatar}
            isWinner={aIsWinner}
            showWinBadge={completed}
            onPick={canReport && playerA ? () => pick(playerA.id) : undefined}
            disabled={isSubmitting}
          />
        </div>
        <span
          className="arcade shrink-0 leading-none text-5xl sm:text-7xl"
          style={
            completed || pendingWinnerId !== null
              ? { color: "transparent" }
              : undefined
          }
        >
          VS
        </span>
        <div className="flex justify-start">
          <Portrait
            player={playerB}
            avatar={bAvatar}
            isWinner={bIsWinner}
            showWinBadge={completed}
            onPick={canReport && playerB ? () => pick(playerB.id) : undefined}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-8 text-center">
        <p
          className={`arcade text-2xl sm:text-3xl ${
            aIsWinner ? "on-fire" : ""
          } ${playerA ? "" : "italic text-jam-cyan/50"}`}
        >
          {playerA?.displayName.split(" ").slice(-1)[0].toUpperCase() ?? "TBD"}
        </p>
        <p
          className={`arcade text-2xl sm:text-3xl ${
            bIsWinner ? "on-fire" : ""
          } ${playerB ? "" : "italic text-jam-cyan/50"}`}
        >
          {playerB?.displayName.split(" ").slice(-1)[0].toUpperCase() ?? "TBD"}
        </p>
      </div>

      {completed && (
        <p className="mt-4 text-center arcade on-fire text-4xl sm:text-6xl animate-pulse">
          ON FIRE!
        </p>
      )}

      {canReport && pendingPlayer && (
        <div className="mt-6 flex justify-center">
          <form action={handleSubmit}>
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="winnerId" value={pendingPlayer.id} />
            {eventId && (
              <input type="hidden" name="eventId" value={eventId} />
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="jam-button px-10 text-base sm:text-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingPlayer.displayName.split(" ")[0]} won
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Portrait({
  player,
  avatar,
  isWinner,
  showWinBadge,
  onPick,
  disabled,
}: {
  player: Player | null;
  avatar: string | null;
  isWinner: boolean;
  showWinBadge: boolean;
  onPick?: () => void;
  disabled?: boolean;
}) {
  const bevelStyle: React.CSSProperties = isWinner
    ? {
        borderTopColor: "#ffe87a",
        borderLeftColor: "#ffe87a",
        borderBottomColor: "#c25400",
        borderRightColor: "#c25400",
        boxShadow:
          "0 5px 0 var(--jam-blue-deep), 0 0 80px -5px var(--jam-orange)",
      }
    : {
        borderTopColor: "#6df0fb",
        borderLeftColor: "#6df0fb",
        borderBottomColor: "var(--jam-cyan-deep)",
        borderRightColor: "var(--jam-cyan-deep)",
        boxShadow: "0 5px 0 var(--jam-blue-deep), 0 12px 22px rgba(0,0,0,0.4)",
      };

  const inner = (
    <>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={player?.displayName ?? "TBD"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/40 to-amber-950/40" />
      )}
      {isWinner && showWinBadge && (
        <span className="arcade-sm absolute right-2 top-2 rounded bg-bezel/85 px-2 py-1 text-xs leading-none">
          WIN
        </span>
      )}
    </>
  );

  const baseClass =
    "relative aspect-[3/4] w-full max-w-md overflow-hidden border-[5px] border-solid bg-[#7a4a1a] transition";

  if (onPick) {
    return (
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={`${baseClass} cursor-pointer p-0 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60`}
        style={bevelStyle}
        aria-label={
          player ? `Pick ${player.displayName} as winner` : "Pick winner"
        }
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={baseClass} style={bevelStyle}>
      {inner}
    </div>
  );
}
