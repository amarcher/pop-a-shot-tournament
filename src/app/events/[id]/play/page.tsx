import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getLeagueById,
  hydrateMatches,
} from "@/db/queries";
import { reportMatchWinnerAction } from "@/app/events/actions";
import { MatchCard } from "@/components/MatchCard";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const league = await getLeagueById(event.leagueId);

  // Show pending + in-progress matches that have both players set.
  const matchesNow = await hydrateMatches(
    event.id,
    (m) =>
      m.status !== "complete" &&
      m.playerAId !== null &&
      m.playerBId !== null
  );

  // Also show completed matches at the bottom so the operator can confirm
  // they recorded the right winner (and double-elim brackets show who's
  // dropped to losers).
  const matchesDone = await hydrateMatches(
    event.id,
    (m) => m.status === "complete"
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      {league && (
        <p className="arcade-sm text-xs">
          <Link href={`/events/${event.id}`} className="hover:text-jam-yellow">
            ← {event.name}
          </Link>
        </p>
      )}
      <div className="mt-2 flex items-end justify-between gap-4">
        <h1 className="arcade on-fire text-3xl">Operator</h1>
        <Link
          href={`/events/${event.id}/broadcast`}
          className="jam-button-secondary text-xs"
        >
          Open broadcast
        </Link>
      </div>

      {event.status === "draft" && (
        <p className="mt-6 rounded-xl border border-jam-cyan/50 bg-jam-yellow/10 px-4 py-3 text-foreground">
          Tournament hasn&apos;t started yet —{" "}
          <Link
            href={`/events/${event.id}`}
            className="underline decoration-jam-cyan underline-offset-4"
          >
            start it
          </Link>{" "}
          to materialize the bracket.
        </p>
      )}

      {event.status === "active" && matchesNow.length === 0 && (
        <p className="mt-6 rounded-xl border border-jam-cyan/50 bg-jam-yellow/10 px-4 py-3 text-foreground">
          No matches currently waiting for a winner. The bracket may be
          between rounds — check back after the next round is paired.
        </p>
      )}

      {matchesNow.length > 0 && (
        <section className="mt-6">
          <h2 className="arcade-sm text-sm">
            Up next · click the winner
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {matchesNow.map(({ match, playerA, playerB }) => (
              <li key={match.id}>
                <MatchCard
                  match={match}
                  playerA={playerA}
                  playerB={playerB}
                  showActions
                  actionFormAction={reportMatchWinnerAction}
                  eventId={event.id}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {matchesDone.length > 0 && (
        <section className="mt-10">
          <h2 className="arcade-sm text-sm">
            Already played · {matchesDone.length}
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {matchesDone
              .slice()
              .reverse()
              .map(({ match, playerA, playerB }) => (
                <li key={match.id}>
                  <MatchCard
                    match={match}
                    playerA={playerA}
                    playerB={playerB}
                  />
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
