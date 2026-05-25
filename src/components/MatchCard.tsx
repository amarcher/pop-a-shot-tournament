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
  const dim =
    size === "lg"
      ? "h-32 w-32 sm:h-44 sm:w-44"
      : size === "sm"
        ? "h-20 w-20 sm:h-24 sm:w-24"
        : "h-24 w-24 sm:h-32 sm:w-32";

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        className={`relative overflow-hidden rounded-xl border-4 transition sm:rounded-2xl ${
          isWinner
            ? "border-jam-yellow shadow-[0_0_40px_-8px_var(--jam-orange)]"
            : isLoser
              ? "border-jam-blue/40 opacity-60 grayscale-[40%]"
              : "border-jam-blue"
        } ${dim}`}
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
          <span className="arcade-sm absolute right-1 top-1 rounded bg-bezel/80 px-1.5 py-0.5 text-[10px] leading-none">
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

  // Pre-match: both portraits show neutral. Post-match: winner shows victory,
  // loser shows defeated.
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

  return (
    <div className="scoreboard p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start justify-center gap-2 sm:gap-3">
        <PlayerPortrait
          player={playerA}
          avatar={aAvatar}
          isWinner={aWon}
          isLoser={completed && !aWon}
          size={size}
        />
        <span
          className={`arcade-sm mt-10 shrink-0 text-base sm:mt-14 sm:text-xl ${
            winnerId ? "text-jam-yellow" : "text-jam-cyan/60"
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
