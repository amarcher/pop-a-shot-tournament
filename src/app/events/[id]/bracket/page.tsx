import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getLeagueById,
  hydrateMatches,
  listRounds,
} from "@/db/queries";
import { Bracket } from "@/components/Bracket";
import {
  cascadeClearMatchAction,
  clearMatchWinnerAction,
  invertMatchWinnerAction,
  reportMatchWinnerAction,
} from "@/app/events/actions";
import { EventNav } from "@/components/EventNav";
import { PageHeader } from "@/components/PageHeader";

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  if (event.format !== "single_elim" && event.format !== "double_elim") {
    // Round-robin / Swiss → redirect to standings.
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-10 text-center">
        <p className="text-foreground/85">
          This is a {event.format.replace("_", " ")} event — no bracket.
        </p>
        <Link
          href={`/events/${event.id}/standings`}
          className="mt-4 inline-block rounded-full jam-button"
        >
          View standings →
        </Link>
      </main>
    );
  }

  const [league, matches, rounds] = await Promise.all([
    getLeagueById(event.leagueId),
    hydrateMatches(event.id),
    listRounds(event.id),
  ]);

  return (
    <main className="court-shell-wide">
      <PageHeader
        title="Bracket"
        back={{ href: `/events/${event.id}`, label: event.name }}
        subtitle={
          league ? (
            <span>
              {event.format.replace("_", " ")} in{" "}
              <span className="font-bold text-jam-yellow">{league.name}</span>
            </span>
          ) : (
            event.format.replace("_", " ")
          )
        }
      >
        <EventNav eventId={event.id} supportsBracket active="bracket" />
      </PageHeader>

      <div className="mt-8">
        <Bracket
          matches={matches}
          rounds={rounds}
          format={event.format}
          reportAction={
            event.status === "active" ? reportMatchWinnerAction : undefined
          }
          clearAction={
            event.status !== "draft" ? clearMatchWinnerAction : undefined
          }
          cascadeClearAction={
            event.status !== "draft" ? cascadeClearMatchAction : undefined
          }
          invertAction={
            event.status !== "draft" ? invertMatchWinnerAction : undefined
          }
          eventId={event.id}
        />
      </div>
    </main>
  );
}
