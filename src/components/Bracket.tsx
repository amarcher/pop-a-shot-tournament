import { Fragment } from "react";
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

const LINE = "#1cc8d8"; // jam-cyan, full opacity — NBA-Jam neon
const LINE_PX = 4;
const LINE_GLOW = "0 0 6px rgba(28, 200, 216, 0.55)";
// Each grid row is exactly ROW_PX tall. Avatars cap at AVATAR_MAX so they
// fit within the row pair (matchSpan rows × ROW_PX) with breathing room.
// Fixed row heights mean hidden R1 bye matches still reserve their rows,
// which (a) keeps next-round connectors landing precisely on the right
// avatar and (b) creates a natural gap between paired R1 matches.
const ROW_PX = 110;
const AVATAR_MAX = 100;

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

  // Alternating tracks: avatar (1fr), gap (2fr), avatar (1fr), gap (2fr), ...,
  // avatar (1fr). This means each gap column is twice the width of an avatar
  // column — exactly enough to draw an outgoing connector whose two horizontal
  // legs (the "]" and the mid-line to the next round) each span one avatar
  // width.
  const numRounds = sideRounds.length;
  const trackParts: string[] = [];
  for (let i = 0; i < numRounds - 1; i++) trackParts.push("1fr 2fr");
  trackParts.push("1fr");
  const trackSpec = trackParts.join(" ");

  return (
    <section>
      <h3 className="arcade-sm text-sm">{title}</h3>

      {/* Mobile: linear stack. */}
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

      {/* Desktop tree. */}
      <div
        className="mt-3 hidden pb-4 md:grid"
        style={{
          gridTemplateColumns: trackSpec,
          gridTemplateRows: `repeat(${bracketRows}, ${ROW_PX}px)`,
          columnGap: 0,
        }}
      >
        {sideRounds.map((round, roundIdx) => {
          const cells = matchesByRound[roundIdx];
          const parents = roundIdx > 0 ? matchesByRound[roundIdx - 1] : null;
          const matchSpan = Math.pow(2, roundIdx + 1);
          const avatarColumn = 2 * roundIdx + 1;
          const outgoingColumn = avatarColumn + 1;
          const isLastRound = roundIdx === numRounds - 1;

          return cells.map((cell, cellIdx) => {
            if (roundIdx === 0 && isByeMatch(cell)) return null;
            const rowStart = cellIdx * matchSpan + 1;
            const parentAbove = parents?.[cellIdx * 2] ?? null;
            const parentBelow = parents?.[cellIdx * 2 + 1] ?? null;

            return (
              <Fragment key={cell.match.id}>
                <BracketMatch
                  cell={cell}
                  gridColumn={avatarColumn}
                  rowStart={rowStart}
                  rowSpan={matchSpan}
                  canUndo={canUndo(cell)}
                  parentForA={parentAbove}
                  parentForB={parentBelow}
                  reportAction={reportAction}
                  clearAction={clearAction}
                  cascadeClearAction={cascadeClearAction}
                  invertAction={invertAction}
                  eventId={eventId}
                />
                {!isLastRound && !skipConnectors && (
                  <OutgoingConnector
                    gridColumn={outgoingColumn}
                    rowStart={rowStart}
                    rowSpan={matchSpan}
                    hasTop={!!cell.playerA}
                    hasBottom={!!cell.playerB}
                  />
                )}
              </Fragment>
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

  const renderSlot = (
    player: Player | null,
    isWinner: boolean,
    isLoser: boolean,
    parent: HydratedMatch | null
  ) => (
    <PlayerSlot
      player={player}
      isWinner={isWinner}
      isLoser={isLoser}
      matchComplete={completed}
      winnerId={winnerId}
      eventId={eventId}
      action={chooseAction({
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
      })}
    />
  );

  return (
    <div
      className="flex flex-col"
      style={{
        gridColumn,
        gridRow: `${rowStart} / span ${rowSpan}`,
      }}
    >
      <div className="flex flex-1 items-center justify-center px-1">
        {renderSlot(playerA, aWon, completed && !aWon, parentForA)}
      </div>
      <div className="flex flex-1 items-center justify-center px-1">
        {renderSlot(playerB, bWon, completed && !bWon, parentForB)}
      </div>
    </div>
  );
}

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
      className={`relative mx-auto aspect-square w-full overflow-hidden border-[3px] border-solid bg-[#1a0e07] ${
        isLoser ? "grayscale-[65%]" : ""
      }`}
      style={{ ...bevelStyle, maxWidth: `${AVATAR_MAX}px` }}
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
          className={`truncate text-center font-black uppercase leading-none tracking-tight text-[10px] sm:text-xs ${
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
      <form action={action.fn} className="block w-full">
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

/** Outgoing connector from a single match. Rendered in the gap column to the
 *  match's right, spanning the same row range. The two horizontals exit from
 *  each avatar's vertical center (25% / 75% of the cell), drop to a vertical
 *  at the gap's midpoint, then a single horizontal continues right to the
 *  next round's avatar. */
function OutgoingConnector({
  gridColumn,
  rowStart,
  rowSpan,
  hasTop,
  hasBottom,
}: {
  gridColumn: number;
  rowStart: number;
  rowSpan: number;
  hasTop: boolean;
  hasBottom: boolean;
}) {
  if (!hasTop && !hasBottom) return null;
  const verticalTop = hasTop ? "25%" : "50%";
  const verticalBot = hasBottom ? "75%" : "50%";
  const half = LINE_PX / 2;

  return (
    <div
      className="relative"
      style={{
        gridColumn,
        gridRow: `${rowStart} / span ${rowSpan}`,
      }}
    >
      {hasTop && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: `calc(25% - ${half}px)`,
            width: "50%",
            height: LINE_PX,
            background: LINE,
            boxShadow: LINE_GLOW,
          }}
        />
      )}
      {hasBottom && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: `calc(75% - ${half}px)`,
            width: "50%",
            height: LINE_PX,
            background: LINE,
            boxShadow: LINE_GLOW,
          }}
        />
      )}
      {verticalTop !== verticalBot && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `calc(50% - ${half}px)`,
            top: verticalTop,
            height: `calc(${verticalBot} - ${verticalTop})`,
            width: LINE_PX,
            background: LINE,
            boxShadow: LINE_GLOW,
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: `calc(50% - ${half}px)`,
          width: "50%",
          height: LINE_PX,
          background: LINE,
          boxShadow: LINE_GLOW,
        }}
      />
    </div>
  );
}
