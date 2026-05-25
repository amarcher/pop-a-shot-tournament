import { notFound } from "next/navigation";
import { getLeagueBySlug, listLeaguePlayers } from "@/db/queries";
import { getCurrentLeaguePlayer } from "@/lib/auth";
import { pickPlayerAvatar } from "@/lib/avatar";
import {
  claimLeaguePlayerAction,
  createLeaguePlayerAction,
} from "@/app/events/actions";
import { PageHeader } from "@/components/PageHeader";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();

  const [roster, me] = await Promise.all([
    listLeaguePlayers(league.id),
    getCurrentLeaguePlayer(league.id),
  ]);

  return (
    <main className="court-shell">
      <PageHeader
        title="Pick your baller"
        back={{ href: `/leagues/${league.slug}`, label: league.name }}
        subtitle="Claim an existing identity or create a new one for this league."
      />

      {me && (
        <p className="mt-4 text-foreground/90">
          You&apos;re currently{" "}
          <span className="font-bold text-jam-yellow">{me.displayName}</span>.
          Tap another card below or create a new identity.
        </p>
      )}

      {roster.length > 0 && (
        <section className="mt-8">
          <h2 className="arcade-sm text-sm">Existing ballers</h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {roster.map((p) => {
              const avatar = pickPlayerAvatar(p, "neutral");
              return (
                <li key={p.id}>
                  <form action={claimLeaguePlayerAction}>
                    <input type="hidden" name="leagueSlug" value={league.slug} />
                    <input type="hidden" name="playerId" value={p.id} />
                    <button
                      type="submit"
                      className="scoreboard block w-full overflow-hidden p-0 text-left transition hover:brightness-110"
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
                        </div>
                      </div>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="scoreboard mt-12 p-6">
        <h2 className="arcade-sm text-sm">Create a new baller</h2>
        <form
          action={createLeaguePlayerAction}
            className="mt-4 flex flex-col gap-4 md:flex-row md:items-end"
        >
          <input type="hidden" name="leagueSlug" value={league.slug} />
          <label className="flex-1">
            <span className="block text-xs uppercase tracking-wider text-jam-yellow">
              Display name
            </span>
            <input
              name="name"
              required
              autoComplete="off"
              placeholder="e.g. Jamal '24 Karat' Brown"
              className="mt-1 w-full rounded-lg border-2 border-jam-blue bg-black/60 px-3 py-2 text-foreground placeholder:text-foreground/30 focus:border-jam-cyan focus:outline-none"
            />
          </label>
          <button type="submit" className="jam-button text-xs md:w-auto">
            Create baller →
          </button>
        </form>
        <p className="mt-3 text-xs text-foreground/60">
          You&apos;ll upload a selfie and pick a baller archetype on the next
          screen.
        </p>
      </section>
    </main>
  );
}
