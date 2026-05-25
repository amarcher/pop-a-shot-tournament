import type { Match, Player, Round } from "@/db/schema";
import { MatchCard } from "./MatchCard";

interface HydratedMatch {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
}

/**
 * Render an elim bracket (single or double). For double elim we split into
 * winners + losers + grand-final sections.
 *
 * No SVG connectors yet — the visual alignment (depth-doubled flex gaps and
 * top padding) carries the tree shape well enough. SVG enhancement deferred.
 */
export function Bracket({
  matches,
  rounds,
  format,
  reportAction,
  eventId,
}: {
  matches: HydratedMatch[];
  rounds: Round[];
  format: "single_elim" | "double_elim";
  reportAction?: (formData: FormData) => void | Promise<void>;
  eventId: string;
}) {
  if (format === "single_elim") {
    return (
      <BracketSide
        title="Bracket"
        side="none"
        matches={matches}
        rounds={rounds}
        reportAction={reportAction}
        eventId={eventId}
      />
    );
  }

  const grand = matches.filter(
    (m) => m.match.bracketSide === "grand_final"
  );

  return (
    <div className="space-y-12">
      <BracketSide
        title="Winners bracket"
        side="winners"
        matches={matches}
        rounds={rounds}
        reportAction={reportAction}
        eventId={eventId}
      />
      <BracketSide
        title="Losers bracket"
        side="losers"
        matches={matches}
        rounds={rounds}
        reportAction={reportAction}
        eventId={eventId}
      />
      {grand.length > 0 && (
        <section>
          <h3 className="arcade-sm text-sm">Grand final</h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {grand
              .slice()
              .sort((a, b) => a.match.slotIndex - b.match.slotIndex)
              .map(({ match, playerA, playerB }) => (
                <li key={match.id} className="space-y-1">
                  <p className="arcade-sm text-xs">
                    {match.slotIndex === 0
                      ? "Final"
                      : "Bracket reset (if losers win)"}
                  </p>
                  <MatchCard
                    match={match}
                    playerA={playerA}
                    playerB={playerB}
                    showActions={!!reportAction}
                    actionFormAction={reportAction}
                    eventId={eventId}
                  />
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BracketSide({
  title,
  side,
  matches,
  rounds,
  reportAction,
  eventId,
}: {
  title: string;
  side: "winners" | "losers" | "none";
  matches: HydratedMatch[];
  rounds: Round[];
  reportAction?: (formData: FormData) => void | Promise<void>;
  eventId: string;
}) {
  const sideRounds = rounds
    .filter((r) => r.bracketSide === side)
    .sort((a, b) => a.roundNumber - b.roundNumber);
  if (sideRounds.length === 0) return null;

  return (
    <section>
      <h3 className="arcade-sm text-sm">{title}</h3>
      <div className="mt-3 space-y-4 md:hidden">
        {sideRounds.map((round) => {
          const cells = matches
            .filter((m) => m.match.roundId === round.id)
            .sort((a, b) => a.match.slotIndex - b.match.slotIndex);
          return (
            <section key={round.id} className="space-y-2">
              <h4 className="text-xs font-black uppercase text-jam-yellow">
                Round {round.roundNumber}
              </h4>
              <div className="grid gap-3">
                {cells.map(({ match, playerA, playerB }) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    playerA={playerA}
                    playerB={playerB}
                    showActions={!!reportAction}
                    actionFormAction={reportAction}
                    eventId={eventId}
                    size="sm"
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div
        className="mt-3 hidden gap-8 overflow-x-auto pb-4 md:grid"
        style={{
          gridTemplateColumns: `repeat(${sideRounds.length}, minmax(360px, 1fr))`,
        }}
      >
        {sideRounds.map((round, roundIdx) => {
          const cells = matches
            .filter((m) => m.match.roundId === round.id)
            .sort((a, b) => a.match.slotIndex - b.match.slotIndex);
          // Spacing doubles per round; paired round-1 matches line up with
          // their round-2 parent visually. Bigger match cards → bigger gaps.
          const gap = 24 * Math.pow(2, roundIdx);
          const padTop = (Math.pow(2, roundIdx) - 1) * 110;
          return (
            <div
              key={round.id}
              className="flex flex-col"
              style={{ gap: `${gap}px`, paddingTop: `${padTop}px` }}
            >
              {cells.map(({ match, playerA, playerB }) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  playerA={playerA}
                  playerB={playerB}
                  showActions={!!reportAction}
                  actionFormAction={reportAction}
                  eventId={eventId}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
