import type { Match, Player } from "@/db/schema";
import { pickMatchOutcomeAvatar, pickPlayerAvatar } from "@/lib/avatar";

type Size = "sm" | "md" | "lg";

function PlayerPortrait({
  player,
  avatar,
  isWinner,
  isLoser,
  size,
}: {
  player: Player | null;
  avatar: string | null;
  isWinner: boolean;
  isLoser: boolean;
  size: Size;
}) {
  const widthClass =
    size === "lg"
      ? "max-w-32 sm:max-w-44"
      : size === "sm"
        ? "max-w-20 sm:max-w-24"
        : "max-w-24 sm:max-w-32";

  // Beveled border: light cyan top/left, deep cyan bottom/right by default.
  // Winners flip to a gold→orange bevel + orange ambient glow.
  const bevelStyle: React.CSSProperties = isWinner
    ? {
        borderTopColor: "#ffe87a",
        borderLeftColor: "#ffe87a",
        borderBottomColor: "#c25400",
        borderRightColor: "#c25400",
        boxShadow:
          "0 4px 0 var(--jam-blue-deep), 0 0 36px -4px var(--jam-orange)",
      }
    : {
        borderTopColor: "#6df0fb",
        borderLeftColor: "#6df0fb",
        borderBottomColor: "var(--jam-cyan-deep)",
        borderRightColor: "var(--jam-cyan-deep)",
        boxShadow: "0 4px 0 var(--jam-blue-deep), 0 8px 14px rgba(0,0,0,0.4)",
      };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden border-4 border-solid bg-[#7a4a1a] transition ${
          isLoser ? "opacity-75 grayscale-[40%]" : ""
        } ${widthClass}`}
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
          <span className="arcade-sm absolute right-1 top-1 rounded bg-bezel/85 px-1.5 py-0.5 text-[10px] leading-none">
            WIN
          </span>
        )}
      </div>
      <p
        className={`w-full truncate text-center text-xs font-bold uppercase sm:text-sm ${
          player ? "text-foreground" : "italic text-jam-cyan/40"
        }`}
      >
        {player?.displayName ?? "TBD"}
      </p>
      {player?.nickname && (
        <p className="w-full truncate text-center text-[10px] font-bold uppercase text-jam-yellow/80">
          {player.nickname}
        </p>
      )}
    </div>
  );
}

export function MatchCard({
  match,
  playerA,
  playerB,
  showActions = false,
  actionFormAction,
  eventId,
  size = "md",
}: {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
  showActions?: boolean;
  actionFormAction?: (formData: FormData) => void | Promise<void>;
  eventId?: string;
  size?: Size;
}) {
  const completed = match.status === "complete";
  const winnerId = match.winnerId;
  const aWon = !!winnerId && winnerId === playerA?.id;
  const bWon = !!winnerId && winnerId === playerB?.id;

  const aAvatar = playerA
    ? completed
      ? pickMatchOutcomeAvatar(playerA, winnerId)
      : pickPlayerAvatar(playerA, "neutral")
    : null;
  const bAvatar = playerB
    ? completed
      ? pickMatchOutcomeAvatar(playerB, winnerId)
      : pickPlayerAvatar(playerB, "neutral")
    : null;

  const canReport =
    showActions && actionFormAction && !completed && playerA && playerB;

  const vsSizeClass =
    size === "lg"
      ? "text-3xl sm:text-5xl"
      : size === "sm"
        ? "text-xl sm:text-2xl"
        : "text-2xl sm:text-4xl";

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-items-center gap-2 sm:gap-3">
        <PlayerPortrait
          player={playerA}
          avatar={aAvatar}
          isWinner={aWon}
          isLoser={completed && !aWon}
          size={size}
        />
        <span
          className={`arcade shrink-0 leading-none ${vsSizeClass} ${
            winnerId ? "text-jam-yellow" : ""
          }`}
        >
          VS
        </span>
        <PlayerPortrait
          player={playerB}
          avatar={bAvatar}
          isWinner={bWon}
          isLoser={completed && !bWon}
          size={size}
        />
      </div>

      {canReport && (
        <div className="match-action-grid mt-4">
          <form action={actionFormAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="winnerId" value={playerA!.id} />
            {eventId && (
              <input type="hidden" name="eventId" value={eventId} />
            )}
            <button type="submit" className="jam-button w-full text-[11px] sm:text-xs">
              {playerA!.displayName.split(" ")[0]} WON
            </button>
          </form>
          <form action={actionFormAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="winnerId" value={playerB!.id} />
            {eventId && (
              <input type="hidden" name="eventId" value={eventId} />
            )}
            <button type="submit" className="jam-button w-full text-[11px] sm:text-xs">
              {playerB!.displayName.split(" ")[0]} WON
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
