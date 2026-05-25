import type { Player } from "@/db/schema";
import { pickPlayerAvatar } from "@/lib/avatar";

export interface StandingRow {
  rank: number;
  player: Player;
  wins: number;
  losses: number;
  matchPoints?: number;
  opponentMatchWinPct?: number;
}

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="scoreboard px-4 py-3 text-foreground/75">
        No standings yet — first match hasn&apos;t been reported.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-jam-blue/60 overflow-hidden scoreboard">
      {rows.map((r) => {
        const isFirst = r.rank === 1;
        const isLast = r.rank === rows.length;
        const outcome = isFirst ? "victory" : isLast ? "defeated" : "neutral";
        const avatar = pickPlayerAvatar(r.player, outcome);
        return (
          <li
            key={r.player.id}
            className={`flex items-center gap-4 px-4 py-3 ${
              isFirst ? "bg-jam-red/20" : ""
            }`}
          >
            <span
              className={`arcade w-8 text-right text-lg ${
                isFirst ? "on-fire" : "text-jam-cyan/85"
              }`}
            >
              {r.rank}
            </span>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt={r.player.displayName}
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-orange-900/40 to-amber-950/40" />
            )}
            <span className="flex-1 truncate text-foreground">
              {r.player.displayName}
              {r.player.nickname && (
                <span className="ml-2 hidden text-xs font-bold uppercase text-jam-yellow/70 sm:inline">
                  {r.player.nickname}
                </span>
              )}
            </span>
            <span className="text-sm text-jam-cyan">
              <span className="font-bold text-foreground">{r.wins}</span>
              {" - "}
              <span>{r.losses}</span>
            </span>
            {r.opponentMatchWinPct !== undefined && (
              <span className="hidden text-xs text-jam-yellow/50 sm:inline">
                OMW {(r.opponentMatchWinPct * 100).toFixed(0)}%
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
