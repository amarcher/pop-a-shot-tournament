import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getLeagueById,
  getRoster,
  listActiveMatches,
  listRounds,
} from "@/db/queries";
import {
  advanceSwissRoundAction,
  startEventAction,
} from "@/app/events/actions";
import { EventNav } from "@/components/EventNav";
import { PageHeader } from "@/components/PageHeader";

export default async function EventLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const [league, roster, activeMatches, allRounds] = await Promise.all([
    getLeagueById(event.leagueId),
    getRoster(event.id),
    listActiveMatches(event.id),
    listRounds(event.id),
  ]);

  // Swiss: show "Pair next round" only when (a) format is swiss, (b) every
  // existing round is complete, and (c) we haven't hit totalRounds.
  const swissRoundsPlayed = allRounds.filter(
    (r) => r.status === "complete"
  ).length;
  const swissNextAvailable =
    event.format === "swiss" &&
    event.status === "active" &&
    event.totalRounds !== null &&
    swissRoundsPlayed < event.totalRounds &&
    allRounds.every((r) => r.status === "complete");

  const formatLabel = event.format.replace("_", " ");
  const supportsBracket =
    event.format === "single_elim" || event.format === "double_elim";

  return (
    <main className="court-shell">
      <PageHeader
        title={event.name}
        back={
          league
            ? { href: `/leagues/${league.slug}`, label: league.name }
            : undefined
        }
        subtitle={
          <>
            <span className="arcade-sm page-kicker">{formatLabel}</span>
            <span className="mx-2 text-jam-yellow/70">·</span>
            <span className="font-bold uppercase text-foreground">
              {event.status}
            </span>
          </>
        }
        actions={
          <>
          <Link
            href={`/events/${event.id}/play`}
            className="jam-button text-xs"
          >
            Operator
          </Link>
          <Link
            href={`/events/${event.id}/broadcast`}
            className="jam-button-secondary text-xs"
          >
            Broadcast (TV)
          </Link>
          </>
        }
      >
        <EventNav
          eventId={event.id}
          supportsBracket={supportsBracket}
          active="overview"
        />
      </PageHeader>

      {event.status === "draft" && (
        <section className="mt-8 scoreboard p-6">
          <h2 className="arcade-sm text-sm">
            Ready to start?
          </h2>
          <p className="mt-2 text-foreground/85">
            Once you start, the {formatLabel} bracket is materialized and
            roster changes lock in.
          </p>
          <form action={startEventAction} className="mt-4">
            <input type="hidden" name="eventId" value={event.id} />
            <button
              type="submit"
              className="jam-button"
            >
              Start tournament →
            </button>
          </form>
        </section>
      )}

      <section className="mt-10">
        <h2 className="arcade-sm text-sm">
          Roster · {roster.length} {roster.length === 1 ? "baller" : "ballers"}
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {roster.map((r) => (
            <li
              key={r.playerId}
              className={`rounded-lg border px-3 py-2 text-sm ${
                r.withdrawn
                  ? "border-jam-red bg-black/40 text-foreground/60 line-through"
                  : "scoreboard text-foreground"
              }`}
            >
              <span className="text-jam-yellow/80">#{r.seed}</span>{" "}
              {r.player.displayName}
            </li>
          ))}
        </ul>
      </section>

      {swissNextAvailable && (
        <section className="mt-8 scoreboard p-6">
          <h2 className="arcade-sm text-sm">
            Round {swissRoundsPlayed} complete
          </h2>
          <p className="mt-2 text-foreground/85">
            Ready for Swiss round {swissRoundsPlayed + 1} of{" "}
            {event.totalRounds}.
          </p>
          <form action={advanceSwissRoundAction} className="mt-4">
            <input type="hidden" name="eventId" value={event.id} />
            <button
              type="submit"
              className="jam-button"
            >
              Pair next round →
            </button>
          </form>
        </section>
      )}

      {event.status === "active" && activeMatches.length > 0 && (
        <section className="mt-10">
          <h2 className="arcade-sm text-sm">
            Now playing · {activeMatches.length}
          </h2>
          <p className="mt-2 text-sm text-foreground/75">
            Head to the{" "}
            <Link
              href={`/events/${event.id}/play`}
              className="underline decoration-jam-cyan underline-offset-4"
            >
              operator screen
            </Link>{" "}
            to report a winner.
          </p>
        </section>
      )}

      {event.status === "complete" && (
        <section className="mt-10 scoreboard p-6 text-center">
          <p className="arcade on-fire break-words text-sm sm:text-2xl">
            Tournament complete
          </p>
          <p className="mt-2 text-foreground/85">
            Final standings on the{" "}
            <Link
              href={
                supportsBracket
                  ? `/events/${event.id}/bracket`
                  : `/events/${event.id}/standings`
              }
              className="underline decoration-jam-cyan underline-offset-4"
            >
              results page
            </Link>
            .
          </p>
        </section>
      )}
    </main>
  );
}
