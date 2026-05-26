import type { Match, Player, Round } from "@/db/schema";
import { pickMatchOutcomeAvatar, pickPlayerAvatar } from "@/lib/avatar";
import { MatchCard } from "./MatchCard";

interface HydratedMatch {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
}

// R1 bye: a completed R1 match where exactly one of the two players is null.
// Materialize auto-advances the present player to R2, so the R2 match already
// shows the bye-er as the opponent. We hide the R1 bye entry itself.
function isByeMatch(m: HydratedMatch): boolean {
  return (
    m.match.status === "complete" &&
    (m.playerA === null) !== (m.playerB === null)
  );
}

const CONNECTOR_COLOR = "rgba(109, 240, 251, 0.85)";
const CONNECTOR_PAD = 36;
const CONNECTOR_HALF = CONNECTOR_PAD / 2;

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
        skipConnectors
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
  skipConnectors = false,
}: {
  title: string;
  side: "winners" | "losers" | "none";
  matches: HydratedMatch[];
  rounds: Round[];
  reportAction?: (formData: FormData) => void | Promise<void>;
  eventId: string;
  skipConnectors?: boolean;
}) {
  const sideRounds = rounds
    .filter((r) => r.bracketSide === side)
    .sort((a, b) => a.roundNumber - b.roundNumber);
  if (sideRounds.length === 0) return null;

  const matchesByRound = sideRounds.map((r) =>
    matches
      .filter((m) => m.match.roundId === r.id)
      .sort((a, b) => a.match.slotIndex - b.match.slotIndex)
  );
  // 2 player slots per R1 match → the bracket's row count.
  const bracketRows = (matchesByRound[0]?.length ?? 0) * 2;

  return (
    <section>
      <h3 className="arcade-sm text-sm">{title}</h3>

      {/* Mobile: stack rounds linearly. Tree shape doesn't fit small screens. */}
      <div className="mt-3 space-y-6 md:hidden">
        {sideRounds.map((round, roundIdx) => {
          const cells = matchesByRound[roundIdx].filter(
            (c) => roundIdx !== 0 || !isByeMatch(c)
          );
          if (cells.length === 0) return null;
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

      {/* Desktop tree: each match is a 2-row tall flex column with one player
          stacked above the other. Round-N matches span 2·2^(N-1) rows so the
          two players sit at 25% / 75% of the cell — i.e., centered on the two
          parent matches in round N-1. */}
      <div
        className="mt-3 hidden md:grid overflow-x-auto pb-4"
        style={{
          gridTemplateColumns: `repeat(${sideRounds.length}, minmax(220px, 1fr))`,
          gridTemplateRows: `repeat(${bracketRows}, minmax(64px, auto))`,
        }}
      >
        {sideRounds.map((round, roundIdx) => {
          const cells = matchesByRound[roundIdx];
          const parents = roundIdx > 0 ? matchesByRound[roundIdx - 1] : null;
          const matchSpan = Math.pow(2, roundIdx + 1);
          return cells.map((cell, cellIdx) => {
            if (roundIdx === 0 && isByeMatch(cell)) return null;
            const rowStart = cellIdx * matchSpan + 1;
            const parentAbove = parents?.[cellIdx * 2] ?? null;
            const parentBelow = parents?.[cellIdx * 2 + 1] ?? null;
            const aboveBye = parentAbove ? isByeMatch(parentAbove) : true;
            const belowBye = parentBelow ? isByeMatch(parentBelow) : true;

            return (
              <BracketMatch
                key={cell.match.id}
                cell={cell}
                gridColumn={roundIdx + 1}
                rowStart={rowStart}
                rowSpan={matchSpan}
                roundIdx={roundIdx}
                aboveBye={aboveBye}
                belowBye={belowBye}
                reportAction={reportAction}
                eventId={eventId}
                skipConnectors={skipConnectors}
              />
            );
          });
        })}
      </div>
    </section>
  );
}

function BracketMatch({
  cell,
  gridColumn,
  rowStart,
  rowSpan,
  roundIdx,
  aboveBye,
  belowBye,
  reportAction,
  eventId,
  skipConnectors,
}: {
  cell: HydratedMatch;
  gridColumn: number;
  rowStart: number;
  rowSpan: number;
  roundIdx: number;
  aboveBye: boolean;
  belowBye: boolean;
  reportAction?: (formData: FormData) => void | Promise<void>;
  eventId: string;
  skipConnectors: boolean;
}) {
  const { match, playerA, playerB } = cell;
  const completed = match.status === "complete";
  const winnerId = match.winnerId;
  const aWon = !!winnerId && winnerId === playerA?.id;
  const bWon = !!winnerId && winnerId === playerB?.id;
  const canReport = !completed && !!reportAction && !!playerA && !!playerB;

  return (
    <div
      className="relative flex flex-col"
      style={{
        gridColumn,
        gridRow: `${rowStart} / span ${rowSpan}`,
        paddingLeft: roundIdx === 0 ? 0 : `${CONNECTOR_PAD}px`,
      }}
    >
      {roundIdx > 0 && !skipConnectors && (
        <BracketConnector aboveBye={aboveBye} belowBye={belowBye} />
      )}
      <div className="flex flex-1 flex-col gap-1.5 py-1">
        <div className="flex flex-1 items-center">
          <PlayerSlot
            player={playerA}
            isWinner={aWon}
            isLoser={completed && !aWon}
            matchComplete={completed}
            winnerId={winnerId}
            matchId={match.id}
            eventId={eventId}
            canReport={canReport}
            reportAction={reportAction}
          />
        </div>
        <div className="flex flex-1 items-center">
          <PlayerSlot
            player={playerB}
            isWinner={bWon}
            isLoser={completed && !bWon}
            matchComplete={completed}
            winnerId={winnerId}
            matchId={match.id}
            eventId={eventId}
            canReport={canReport}
            reportAction={reportAction}
          />
        </div>
      </div>
    </div>
  );
}

function PlayerSlot({
  player,
  isWinner,
  isLoser,
  matchComplete,
  winnerId,
  matchId,
  eventId,
  canReport,
  reportAction,
}: {
  player: Player | null;
  isWinner: boolean;
  isLoser: boolean;
  matchComplete: boolean;
  winnerId: string | null;
  matchId: string;
  eventId?: string;
  canReport: boolean;
  reportAction?: (formData: FormData) => void | Promise<void>;
}) {
  const avatar = player
    ? matchComplete
      ? pickMatchOutcomeAvatar(player, winnerId)
      : pickPlayerAvatar(player, "neutral")
    : null;

  const bevelStyle: React.CSSProperties = isWinner
    ? {
        borderTopColor: "#ffe87a",
        borderLeftColor: "#ffe87a",
        borderBottomColor: "#c25400",
        borderRightColor: "#c25400",
        boxShadow:
          "0 3px 0 var(--jam-blue-deep), 0 0 18px -4px var(--jam-orange)",
      }
    : {
        borderTopColor: "#6df0fb",
        borderLeftColor: "#6df0fb",
        borderBottomColor: "var(--jam-cyan-deep)",
        borderRightColor: "var(--jam-cyan-deep)",
        boxShadow: "0 3px 0 var(--jam-blue-deep), 0 4px 8px rgba(0,0,0,0.4)",
      };

  return (
    <div className="flex w-full items-center gap-2">
      <div
        className={`relative h-14 w-14 shrink-0 overflow-hidden border-[3px] border-solid bg-[#7a4a1a] ${
          isLoser ? "opacity-60 grayscale-[60%]" : ""
        }`}
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
          <span className="arcade-sm absolute left-0.5 top-0.5 rounded bg-bezel/90 px-1 text-[8px] leading-none">
            W
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-bold uppercase leading-tight ${
            player ? "text-foreground" : "italic text-jam-cyan/40"
          } ${isLoser ? "opacity-70" : ""}`}
        >
          {player?.displayName ?? "TBD"}
        </p>
        {player?.nickname && (
          <p
            className={`truncate text-[10px] font-bold uppercase leading-tight text-jam-yellow/80 ${
              isLoser ? "opacity-70" : ""
            }`}
          >
            {player.nickname}
          </p>
        )}
        {canReport && player && (
          <form action={reportAction} className="mt-1">
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="winnerId" value={player.id} />
            {eventId && <input type="hidden" name="eventId" value={eventId} />}
            <button
              type="submit"
              className="rounded-full border-2 border-jam-blue bg-gradient-to-b from-jam-yellow to-jam-orange px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-bezel hover:brightness-110 active:translate-y-px"
            >
              Won
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function BracketConnector({
  aboveBye,
  belowBye,
}: {
  aboveBye: boolean;
  belowBye: boolean;
}) {
  if (aboveBye && belowBye) return null;
  const verticalTop = aboveBye ? "50%" : "25%";
  const verticalBot = belowBye ? "50%" : "75%";
  return (
    <>
      {!aboveBye && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: "calc(25% - 1.5px)",
            width: `${CONNECTOR_HALF}px`,
            height: "3px",
            background: CONNECTOR_COLOR,
          }}
        />
      )}
      {!belowBye && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: "calc(75% - 1.5px)",
            width: `${CONNECTOR_HALF}px`,
            height: "3px",
            background: CONNECTOR_COLOR,
          }}
        />
      )}
      {verticalTop !== verticalBot && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `${CONNECTOR_HALF - 1.5}px`,
            top: verticalTop,
            height: `calc(${verticalBot} - ${verticalTop})`,
            width: "3px",
            background: CONNECTOR_COLOR,
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: `${CONNECTOR_HALF}px`,
          top: "calc(50% - 1.5px)",
          width: `${CONNECTOR_HALF}px`,
          height: "3px",
          background: CONNECTOR_COLOR,
        }}
      />
    </>
  );
}
