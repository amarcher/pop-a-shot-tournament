import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueBySlug,
  listLeagueEvents,
  listLeaguePlayers,
} from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { pickPlayerAvatar } from "@/lib/avatar";
import { PageHeader } from "@/components/PageHeader";

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [roster, events, me] = await Promise.all([
    listLeaguePlayers(league.id),
    listLeagueEvents(league.id),
    getCurrentLeaguePlayer(league.id),
  ]);

  return (
    <main className="court-shell">
      <PageHeader
        eyebrow="League"
        title={league.name}
        actions={
          <>
          <Link
            href={`/leagues/${league.slug}/claim`}
            className="jam-button-secondary text-xs"
          >
            {me ? "Switch baller" : "Claim baller"}
          </Link>
          <Link
            href={`/leagues/${league.slug}/events/new`}
            className="jam-button text-xs"
          >
            New tournament
          </Link>
          </>
        }
      />

      {me && (
        <p className="mt-4 text-sm text-foreground/90">
          You&apos;re signed in as{" "}
          <span className="font-bold text-jam-yellow">{me.displayName}</span>.
        </p>
      )}

      <section className="mt-10">
        <h2 className="arcade-sm text-sm">Roster</h2>
        {roster.length === 0 ? (
          <div className="scoreboard mt-4 px-5 py-4 text-cyan-100">
            No ballers yet — be the first to{" "}
            <Link
              href={`/leagues/${league.slug}/claim`}
              className="underline decoration-jam-cyan underline-offset-4 hover:text-jam-yellow"
            >
              claim yours
            </Link>
            .
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {roster.map((p) => {
              const avatar = pickPlayerAvatar(p, "neutral");
              return (
                <li key={p.id}>
                  <Link
                    href={`/players/${p.id}`}
                    className="scoreboard block overflow-hidden p-0 transition hover:brightness-110"
                  >
                    <div className="relative aspect-[3/4] w-full bg-gradient-to-br from-black/60 to-black/40">
                      {avatar && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar}
                          alt={p.displayName}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                        <p className="truncate text-sm font-black uppercase text-foreground">
                          {p.displayName}
                        </p>
                        {p.nickname && (
                          <p className="truncate text-xs font-bold uppercase text-jam-yellow">
                            {p.nickname}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="arcade-sm text-sm">Tournaments</h2>
        {events.length === 0 ? (
          <div className="scoreboard mt-4 px-5 py-4 text-cyan-100">
            No tournaments yet.{" "}
            <Link
              href={`/leagues/${league.slug}/events/new`}
              className="underline decoration-jam-cyan underline-offset-4 hover:text-jam-yellow"
            >
              Start one
            </Link>
            .
          </div>
        ) : (
          <ul className="mt-4 grid gap-3">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/events/${e.id}`}
                  className="scoreboard flex items-center justify-between gap-4 px-5 py-4 transition hover:brightness-110"
                >
                  <div>
                    <p className="font-bold text-foreground">{e.name}</p>
                    <p className="text-xs text-jam-cyan">
                      {e.format.replace("_", " ")} · {e.status}
                    </p>
                  </div>
                  <span aria-hidden className="text-jam-yellow text-xl">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
