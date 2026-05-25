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
  const completed = match.status === "complete";
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
    <div className="relative">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex justify-end">
          <Portrait player={playerA} avatar={aAvatar} isWinner={aIsWinner} />
        </div>
        <span
          className="arcade shrink-0 leading-none text-5xl sm:text-7xl"
          style={completed ? { color: "transparent" } : undefined}
        >
          VS
        </span>
        <div className="flex justify-start">
          <Portrait player={playerB} avatar={bAvatar} isWinner={bIsWinner} />
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
    </div>
  );
}

function Portrait({
  player,
  avatar,
  isWinner,
}: {
  player: Player | null;
  avatar: string | null;
  isWinner: boolean;
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

  return (
    <div
      className="relative aspect-[3/4] w-full max-w-md overflow-hidden border-[5px] border-solid bg-[#7a4a1a] transition"
      style={bevelStyle}
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
      {isWinner && (
        <span className="arcade-sm absolute right-2 top-2 rounded bg-bezel/85 px-2 py-1 text-xs leading-none">
          WIN
        </span>
      )}
    </div>
  );
}
