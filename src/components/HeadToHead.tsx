import type { Match, Player } from "@/db/schema";
import { pickMatchOutcomeAvatar, pickPlayerAvatar } from "@/lib/avatar";

/**
 * Big two-portrait "now playing" view for the broadcast page. Used both
 * pre-match (both neutral) and post-match (winner victory, loser defeated).
 * Designed for projector / large TV display, not phone.
 */
export function HeadToHead({
  match,
  playerA,
  playerB,
}: {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
}) {
  const aIsWinner = match.winnerId !== null && match.winnerId === playerA?.id;
  const bIsWinner = match.winnerId !== null && match.winnerId === playerB?.id;
  const aAvatar = playerA
    ? match.winnerId
      ? pickMatchOutcomeAvatar(playerA, match.winnerId)
      : pickPlayerAvatar(playerA, "neutral")
    : null;
  const bAvatar = playerB
    ? match.winnerId
      ? pickMatchOutcomeAvatar(playerB, match.winnerId)
      : pickPlayerAvatar(playerB, "neutral")
    : null;

  return (
    <div className="relative grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
      <Portrait
        player={playerA}
        avatar={aAvatar}
        isWinner={aIsWinner}
        align="right"
      />
      <div className="text-center">
        <span
          className={`arcade text-6xl ${
            match.winnerId ? "on-fire" : "text-jam-cyan/50"
          }`}
        >
          VS
        </span>
      </div>
      <Portrait
        player={playerB}
        avatar={bAvatar}
        isWinner={bIsWinner}
        align="left"
      />
      {match.winnerId && (
        <p className="col-span-1 md:col-span-3 -mt-2 text-center arcade on-fire text-4xl animate-pulse">
          ON FIRE!
        </p>
      )}
    </div>
  );
}

function Portrait({
  player,
  avatar,
  isWinner,
  align,
}: {
  player: Player | null;
  avatar: string | null;
  isWinner: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-col gap-3 ${
        align === "right" ? "items-end" : "items-start"
      }`}
    >
      <div
        className={`relative aspect-square w-full max-w-md overflow-hidden rounded-3xl border-4 transition ${
          isWinner
            ? "border-jam-yellow shadow-[0_0_80px_-5px_var(--jam-orange)]"
            : "border-jam-blue/60"
        }`}
      >
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
      </div>
      <p
        className={`arcade text-2xl ${
          player
            ? isWinner
              ? "on-fire"
              : "text-foreground"
            : "text-jam-cyan/50 italic"
        }`}
      >
        {player?.displayName ?? "TBD"}
      </p>
    </div>
  );
}
