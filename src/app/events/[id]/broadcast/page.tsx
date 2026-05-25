import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getRoster,
  hydrateMatches,
} from "@/db/queries";
import { pickPlayerAvatar } from "@/lib/avatar";
import { reportMatchWinnerAction } from "@/app/events/actions";
import { HeadToHead } from "@/components/HeadToHead";
import { BroadcastSubscriber } from "./BroadcastSubscriber";

export default async function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [hydrated, roster] = await Promise.all([
    hydrateMatches(event.id),
    getRoster(event.id),
  ]);

  // Pick the "headline" — first active match with both players, OR the most
  // recently completed match (so the post-result on-fire animation lingers
  // for a few seconds on the broadcast screen).
  const inProgress = hydrated.find(
    (m) =>
      m.match.status !== "complete" &&
      m.playerA !== null &&
      m.playerB !== null
  );
  const lastComplete = hydrated
    .filter((m) => m.match.status === "complete" && m.match.completedAt)
    .sort(
      (a, b) =>
        (b.match.completedAt!.valueOf() ?? 0) -
        (a.match.completedAt!.valueOf() ?? 0)
    )[0];
  const headline = inProgress ?? lastComplete ?? null;

  // Final ranking grid (when event is complete).
  const finalRanking = event.status === "complete" ? roster
        .slice()
        .sort(
          (a, b) =>
            (a.finalStanding ?? 999) - (b.finalStanding ?? 999) ||
            a.seed - b.seed
        )
    : [];

  return (
    <main className="mx-auto w-full max-w-7xl px-8 py-10">
      <BroadcastSubscriber eventId={event.id} />

      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="arcade-sm text-sm">{event.name}</p>
          <h1 className="broadcast-title mt-2 text-5xl leading-none">
            {event.format.replace("_", " ")}
          </h1>
        </div>
        <Link
          href={`/events/${event.id}`}
          className="text-sm font-bold text-foreground/75 hover:text-jam-yellow"
        >
          back to event
        </Link>
      </header>

      {event.status === "complete" && finalRanking.length > 0 ? (
        <section className="mt-12">
          <p className="broadcast-title text-center text-3xl">
            FINAL STANDINGS
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {finalRanking.map((r, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === finalRanking.length - 1;
              const outcome = isFirst
                ? "victory"
                : isLast
                  ? "defeated"
                  : "neutral";
              const avatar = pickPlayerAvatar(r.player, outcome);
              return (
                <li
                  key={r.playerId}
                  className={`broadcast-card overflow-hidden ${
                    isFirst ? "broadcast-card-champ" : ""
                  }`}
                >
                  <div className="relative aspect-square w-full bg-gradient-to-br from-orange-900/40 to-amber-950/40">
                    {avatar && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
                        alt={r.player.displayName}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3">
                      <p className="broadcast-title text-sm leading-tight">
                        #{idx + 1} {r.player.displayName}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : headline ? (
        <section className="mt-16">
          <HeadToHead
            match={headline.match}
            playerA={headline.playerA}
            playerB={headline.playerB}
            reportAction={
              headline === inProgress ? reportMatchWinnerAction : undefined
            }
            eventId={event.id}
          />
        </section>
      ) : (
        <p className="mt-16 scoreboard px-6 py-10 text-center text-foreground/75">
          Waiting for the first match…
        </p>
      )}
    </main>
  );
}
