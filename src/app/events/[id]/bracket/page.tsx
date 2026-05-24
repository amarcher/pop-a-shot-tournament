import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  hydrateMatches,
  listRounds,
} from "@/db/queries";
import { Bracket } from "@/components/Bracket";
import { reportMatchWinnerAction } from "@/app/events/actions";

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

  const [matches, rounds] = await Promise.all([
    hydrateMatches(event.id),
    listRounds(event.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <p className="arcade-sm text-xs">
        <Link href={`/events/${event.id}`} className="hover:text-jam-yellow">
          ← {event.name}
        </Link>
      </p>
      <h1 className="arcade on-fire mt-2 text-4xl">Bracket</h1>

      <div className="mt-8">
        <Bracket
          matches={matches}
          rounds={rounds}
          format={event.format}
          reportAction={
            event.status === "active" ? reportMatchWinnerAction : undefined
          }
          eventId={event.id}
        />
      </div>
    </main>
  );
}
