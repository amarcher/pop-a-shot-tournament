import type { Match, Player } from "@/db/schema";
import { pickMatchOutcomeAvatar, pickPlayerAvatar } from "@/lib/avatar";

function PlayerSlot({
  player,
  outcomeAvatar,
  isWinner,
  size = "md",
}: {
  player: Player | null;
  outcomeAvatar: string | null;
  isWinner: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const heightClass =
    size === "lg" ? "aspect-square" : size === "sm" ? "h-14" : "h-20";
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden rounded-xl border bg-black/40 px-3 py-2 ${
        isWinner
          ? "border-jam-yellow bg-jam-red/20"
          : "border-jam-blue/60"
      } ${heightClass}`}
    >
      {outcomeAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={outcomeAvatar}
          alt={player?.displayName ?? "TBD"}
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br from-orange-900/40 to-amber-950/40" />
      )}
      <div className="flex-1 truncate">
        <p
          className={`truncate text-sm font-bold ${
            player ? "text-foreground" : "text-jam-cyan/50 italic"
          }`}
        >
          {player?.displayName ?? "TBD"}
        </p>
      </div>
      {isWinner && (
        <span className="arcade-sm text-xs shrink-0">WIN</span>
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
  size,
}: {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
  showActions?: boolean;
  // Server action invoked by the report-winner form. Caller injects so the
  // component stays a pure server-rendered RSC.
  actionFormAction?: (formData: FormData) => void | Promise<void>;
  eventId?: string;
  size?: "sm" | "md" | "lg";
}) {
  const aAvatar = playerA
    ? pickMatchOutcomeAvatar(playerA, match.winnerId)
    : null;
  const bAvatar = playerB
    ? pickMatchOutcomeAvatar(playerB, match.winnerId)
    : null;
  const neutralA = playerA ? pickPlayerAvatar(playerA, "neutral") : null;
  const neutralB = playerB ? pickPlayerAvatar(playerB, "neutral") : null;

  const canReport =
    showActions &&
    actionFormAction &&
    match.status !== "complete" &&
    playerA &&
    playerB;

  return (
    <div className="scoreboard p-3">
      <div className="space-y-2">
        <PlayerSlot
          player={playerA}
          outcomeAvatar={match.status === "complete" ? aAvatar : neutralA}
          isWinner={match.winnerId === playerA?.id}
          size={size}
        />
        <PlayerSlot
          player={playerB}
          outcomeAvatar={match.status === "complete" ? bAvatar : neutralB}
          isWinner={match.winnerId === playerB?.id}
          size={size}
        />
      </div>
      {canReport && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <form action={actionFormAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="winnerId" value={playerA!.id} />
            {eventId && (
              <input type="hidden" name="eventId" value={eventId} />
            )}
            <button
              type="submit"
              className="w-full rounded-lg jam-button text-xs"
            >
              {playerA!.displayName.split(" ")[0]} won
            </button>
          </form>
          <form action={actionFormAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="winnerId" value={playerB!.id} />
            {eventId && (
              <input type="hidden" name="eventId" value={eventId} />
            )}
            <button
              type="submit"
              className="w-full rounded-lg jam-button text-xs"
            >
              {playerB!.displayName.split(" ")[0]} won
            </button>
          </form>
        </div>
      )}
      {match.status === "complete" && (
        <p className="mt-2 text-center text-xs text-jam-cyan/70">
          {match.bracketSide !== "none" &&
            `${match.bracketSide.replace("_", " ")} · `}
          complete
        </p>
      )}
    </div>
  );
}
