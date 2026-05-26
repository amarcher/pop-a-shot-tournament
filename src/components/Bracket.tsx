import type { Match, Player, Round } from "@/db/schema";
import { pickMatchOutcomeAvatar, pickPlayerAvatar } from "@/lib/avatar";
import { MatchCard } from "./MatchCard";

interface HydratedMatch {
  match: Match;
  playerA: Player | null;
  playerB: Player | null;
}

type FormAction = (formData: FormData) => void | Promise<void>;

function isByeMatch(m: HydratedMatch): boolean {
  return (
    m.match.status === "complete" &&
    (m.playerA === null) !== (m.playerB === null)
  );
}

// Undo is safe only when nothing downstream has already locked in. Once a
// child match is complete, the user has to undo that one first.
function canUndoFn(
  matchById: Map<string, HydratedMatch>
): (cell: HydratedMatch) => boolean {
  return (cell) => {
    if (cell.match.status !== "complete" || !cell.match.winnerId) return false;
    if (cell.match.nextMatchWinId) {
      const next = matchById.get(cell.match.nextMatchWinId);
      const isResetSlot =
        next?.match.bracketSide === "grand_final" &&
        next?.match.slotIndex === 1;
      if (next?.match.status === "complete" && !isResetSlot) return false;
    }
    if (cell.match.nextMatchLoseId) {
      const nextL = matchById.get(cell.match.nextMatchLoseId);
      if (nextL?.match.status === "complete") return false;
    }
    return true;
  };
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
}

const COL_GAP = 28;
const HALF_GAP = COL_GAP / 2;
const LINE = "rgba(109, 240, 251, 0.85)";

export function Bracket({
  matches,
  rounds,
  format,
  reportAction,
  clearAction,
  cascadeClearAction,
  invertAction,
  eventId,
}: {
  matches: HydratedMatch[];
  rounds: Round[];
  format: "single_elim" | "double_elim";
  reportAction?: FormAction;
  clearAction?: FormAction;
  cascadeClearAction?: FormAction;
  invertAction?: FormAction;
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
        clearAction={clearAction}
        cascadeClearAction={cascadeClearAction}
        invertAction={invertAction}
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
        clearAction={clearAction}
        cascadeClearAction={cascadeClearAction}
        invertAction={invertAction}
        eventId={eventId}
      />
      <BracketSide
        title="Losers bracket"
        side="losers"
        matches={matches}
        rounds={rounds}
        reportAction={reportAction}
        clearAction={clearAction}
        cascadeClearAction={cascadeClearAction}
        invertAction={invertAction}
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
  clearAction,
  cascadeClearAction,
  invertAction,
  eventId,
  skipConnectors = false,
}: {
  title: string;
  side: "winners" | "losers" | "none";
  matches: HydratedMatch[];
  rounds: Round[];
  reportAction?: FormAction;
  clearAction?: FormAction;
  cascadeClearAction?: FormAction;
  invertAction?: FormAction;
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
  const bracketRows = (matchesByRound[0]?.length ?? 0) * 2;
  const canUndo = canUndoFn(new Map(matches.map((m) => [m.match.id, m])));

  return (
    <section>
      <h3 className="arcade-sm text-sm">{title}</h3>

      {/* Mobile: linear stack — tree shape doesn't fit. */}
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

      {/* Desktop tree. Fixed-width columns + column-gap so connector lines
          drawn in the gap visually originate at the parent box's right edge
          and terminate at the child box's left edge. Each round-N match
          spans 2·2^(N-1) leaf rows, sitting vertically centered between its
          two parents. */}
      <div
        className="mt-3 hidden pb-4 md:grid"
        style={{
          gridTemplateColumns: `repeat(${sideRounds.length}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${bracketRows}, minmax(60px, auto))`,
          columnGap: `${COL_GAP}px`,
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
                drawIncomingConnector={roundIdx > 0 && !skipConnectors}
                aboveBye={aboveBye}
                belowBye={belowBye}
                canUndo={canUndo(cell)}
                parentForA={parentAbove}
                parentForB={parentBelow}
                reportAction={reportAction}
                clearAction={clearAction}
                cascadeClearAction={cascadeClearAction}
                invertAction={invertAction}
                eventId={eventId}
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
  drawIncomingConnector,
  aboveBye,
  belowBye,
  canUndo,
  parentForA,
  parentForB,
  reportAction,
  clearAction,
  cascadeClearAction,
  invertAction,
  eventId,
}: {
  cell: HydratedMatch;
  gridColumn: number;
  rowStart: number;
  rowSpan: number;
  drawIncomingConnector: boolean;
  aboveBye: boolean;
  belowBye: boolean;
  canUndo: boolean;
  parentForA: HydratedMatch | null;
  parentForB: HydratedMatch | null;
  reportAction?: FormAction;
  clearAction?: FormAction;
  cascadeClearAction?: FormAction;
  invertAction?: FormAction;
  eventId: string;
}) {
  const { match, playerA, playerB } = cell;
  const completed = match.status === "complete";
  const inProgress = match.status === "in_progress";
  const winnerId = match.winnerId;
  const aWon = !!winnerId && winnerId === playerA?.id;
  const bWon = !!winnerId && winnerId === playerB?.id;

  const slotProps = (
    player: Player | null,
    isWinner: boolean,
    isLoser: boolean,
    parent: HydratedMatch | null
  ) => ({
    player,
    isWinner,
    isLoser,
    matchComplete: completed,
    winnerId,
    eventId,
    action: chooseAction({
      player,
      isWinner,
      cellMatch: match,
      inProgress,
      completed,
      canUndo,
      parent,
      reportAction,
      clearAction,
      cascadeClearAction,
      invertAction,
    }),
  });

  return (
    <div
      className="relative flex items-center"
      style={{
        gridColumn,
        gridRow: `${rowStart} / span ${rowSpan}`,
      }}
    >
      {drawIncomingConnector && (
        <BracketConnector aboveBye={aboveBye} belowBye={belowBye} />
      )}
      <div className="flex w-full flex-col gap-1 rounded-md border-2 border-jam-cyan/60 bg-bezel/40 p-1">
        <PlayerSlot {...slotProps(playerA, aWon, completed && !aWon, parentForA)} />
        <PlayerSlot {...slotProps(playerB, bWon, completed && !bWon, parentForB)} />
      </div>
    </div>
  );
}

/** Encodes which server action a single PlayerSlot's button should call,
 *  with the hidden form inputs needed to invoke it. `null` means the slot
 *  is not clickable. */
interface SlotAction {
  fn: FormAction;
  matchId: string;
  winnerId?: string;
  aria: string;
}

function chooseAction({
  player,
  isWinner,
  cellMatch,
  inProgress,
  completed,
  canUndo,
  parent,
  reportAction,
  clearAction,
  cascadeClearAction,
  invertAction,
}: {
  player: Player | null;
  isWinner: boolean;
  cellMatch: Match;
  inProgress: boolean;
  completed: boolean;
  canUndo: boolean;
  parent: HydratedMatch | null;
  reportAction?: FormAction;
  clearAction?: FormAction;
  cascadeClearAction?: FormAction;
  invertAction?: FormAction;
}): SlotAction | null {
  if (!player) return null;

  if (inProgress && reportAction) {
    return {
      fn: reportAction,
      matchId: cellMatch.id,
      winnerId: player.id,
      aria: `Pick ${player.displayName} as winner`,
    };
  }
  if (completed && isWinner && canUndo && clearAction) {
    return {
      fn: clearAction,
      matchId: cellMatch.id,
      aria: `Undo ${player.displayName}'s win`,
    };
  }
  if (completed && !isWinner && invertAction) {
    return {
      fn: invertAction,
      matchId: cellMatch.id,
      winnerId: player.id,
      aria: `Make ${player.displayName} the winner instead`,
    };
  }
  // "Advanced" portrait: this match is pending (waiting on the other slot)
  // and this player is here because they won the parent match. A click peels
  // back their win chain. Skip when the parent is a bye — that "win" is
  // structural; rolling it back would leave the bracket in a broken state
  // with no opponent to redo against.
  const isPending = cellMatch.status === "pending";
  if (
    isPending &&
    parent &&
    parent.match.status === "complete" &&
    parent.match.winnerId === player.id &&
    !isByeMatch(parent) &&
    cascadeClearAction
  ) {
    return {
      fn: cascadeClearAction,
      matchId: parent.match.id,
      aria: `Undo ${player.displayName}'s advance`,
    };
  }
  return null;
}

function PlayerSlot({
  player,
  isWinner,
  isLoser,
  matchComplete,
  winnerId,
  eventId,
  action,
}: {
  player: Player | null;
  isWinner: boolean;
  isLoser: boolean;
  matchComplete: boolean;
  winnerId: string | null;
  eventId?: string;
  action: SlotAction | null;
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
          "0 2px 0 var(--jam-blue-deep), 0 0 14px -2px var(--jam-orange)",
      }
    : {
        borderTopColor: "#6df0fb",
        borderLeftColor: "#6df0fb",
        borderBottomColor: "var(--jam-cyan-deep)",
        borderRightColor: "var(--jam-cyan-deep)",
        boxShadow: "0 2px 0 var(--jam-blue-deep), 0 3px 6px rgba(0,0,0,0.4)",
      };

  const clickable = !!action;

  const portrait = (
    <div
      className={`relative mx-auto aspect-square w-full max-w-[140px] overflow-hidden border-[3px] border-solid bg-[#7a4a1a] ${
        isLoser ? "opacity-55 grayscale-[55%]" : ""
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
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-0.5 pb-0.5 pt-2">
        <p
          className={`truncate text-center font-black uppercase leading-none tracking-tight text-[10px] ${
            player
              ? isWinner
                ? "text-jam-yellow"
                : "text-foreground"
              : "italic text-jam-cyan/40"
          }`}
        >
          {player ? firstName(player.displayName) : "TBD"}
        </p>
      </div>
      {isWinner && (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 rounded bg-bezel/90 px-1 text-[8px] font-black leading-none text-jam-yellow"
        >
          W
        </span>
      )}
    </div>
  );

  if (clickable && action) {
    return (
      <form action={action.fn} className="block">
        <input type="hidden" name="matchId" value={action.matchId} />
        {action.winnerId !== undefined && (
          <input type="hidden" name="winnerId" value={action.winnerId} />
        )}
        {eventId && <input type="hidden" name="eventId" value={eventId} />}
        <button
          type="submit"
          className="block w-full cursor-pointer p-0 transition hover:brightness-110 active:translate-y-px"
          aria-label={action.aria}
        >
          {portrait}
        </button>
      </form>
    );
  }

  return <div className="block w-full">{portrait}</div>;
}

/** Connector lines drawn in the column-gap to the LEFT of a round-N match.
 *  - parent_above's right edge sits at x=-COL_GAP, y=25% of the cell.
 *  - parent_below's right edge at x=-COL_GAP, y=75%.
 *  - The "]" joint sits at x=-HALF_GAP.
 *  - The outgoing horizontal goes from x=-HALF_GAP to x=0 (this match's left
 *    edge) at y=50%.
 *  - If one parent was a bye, that branch is suppressed and the vertical only
 *    spans from the live branch to y=50%.
 */
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
            left: `-${COL_GAP}px`,
            top: "calc(25% - 1.5px)",
            width: `${HALF_GAP}px`,
            height: "3px",
            background: LINE,
          }}
        />
      )}
      {!belowBye && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `-${COL_GAP}px`,
            top: "calc(75% - 1.5px)",
            width: `${HALF_GAP}px`,
            height: "3px",
            background: LINE,
          }}
        />
      )}
      {verticalTop !== verticalBot && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `calc(-${HALF_GAP}px - 1.5px)`,
            top: verticalTop,
            height: `calc(${verticalBot} - ${verticalTop})`,
            width: "3px",
            background: LINE,
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: `-${HALF_GAP}px`,
          top: "calc(50% - 1.5px)",
          width: `${HALF_GAP}px`,
          height: "3px",
          background: LINE,
        }}
      />
    </>
  );
}
