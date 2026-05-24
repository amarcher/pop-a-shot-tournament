import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeagueBySlug, listLeaguePlayers } from "@/db/queries";
import { createEventAction } from "@/app/events/actions";

const FORMATS = [
  {
    id: "single_elim",
    label: "Single elimination",
    blurb: "One loss and you're out. Classic bracket.",
  },
  {
    id: "double_elim",
    label: "Double elimination",
    blurb: "One loss drops you to the losers' bracket — second chance.",
  },
  {
    id: "round_robin",
    label: "Round robin",
    blurb: "Everyone plays everyone once. Best for 4-8 players.",
  },
  {
    id: "swiss",
    label: "Swiss pairings",
    blurb:
      "Fixed rounds, paired by record. Great for big fields where round-robin would take all night.",
  },
] as const;

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) notFound();
  const roster = await listLeaguePlayers(league.id);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <p className="arcade-sm text-xs">
        <Link href={`/leagues/${league.slug}`} className="hover:text-jam-yellow">
          ← {league.name}
        </Link>
      </p>
      <h1 className="arcade on-fire mt-2 text-4xl">New tournament</h1>

      <form action={createEventAction} className="mt-8 space-y-8">
        <input type="hidden" name="leagueId" value={league.id} />

        <label className="block">
          <span className="arcade-sm text-sm">
            Tournament name
          </span>
          <input
            name="name"
            required
            autoComplete="off"
            placeholder="e.g. Friday Night Pop-a-Shot Slam"
            className="mt-2 w-full scoreboard px-3 py-2 text-foreground placeholder:text-foreground/30 focus:border-jam-yellow focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="arcade-sm text-sm">Format</legend>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FORMATS.map((f, idx) => (
              <li key={f.id}>
                <label className="block cursor-pointer scoreboard px-4 py-3 hover:border-jam-cyan has-[:checked]:border-jam-yellow has-[:checked]:bg-jam-red/20">
                  <input
                    type="radio"
                    name="format"
                    value={f.id}
                    required
                    defaultChecked={idx === 0}
                    className="sr-only"
                  />
                  <span className="block font-bold uppercase tracking-wider text-foreground">
                    {f.label}
                  </span>
                  <span className="mt-1 block text-xs text-jam-cyan/85">
                    {f.blurb}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <label className="block">
          <span className="arcade-sm text-sm">
            Swiss rounds (ignored for other formats)
          </span>
          <input
            type="number"
            name="totalRounds"
            min={1}
            max={9}
            placeholder="auto: ceil(log₂ players)"
            className="mt-2 w-40 scoreboard px-3 py-2 text-foreground placeholder:text-foreground/30 focus:border-jam-yellow focus:outline-none"
          />
        </label>

        <fieldset>
          <legend className="arcade-sm text-sm">
            Roster — tick players who are in
          </legend>
          {roster.length === 0 ? (
            <p className="mt-3 text-foreground/75">
              No ballers in this league yet.{" "}
              <Link
                href={`/leagues/${league.slug}/claim`}
                className="underline decoration-jam-cyan underline-offset-4"
              >
                Add one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {roster.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 scoreboard px-3 py-2 text-foreground hover:border-jam-cyan has-[:checked]:border-jam-yellow has-[:checked]:bg-jam-red/20">
                    <input
                      type="checkbox"
                      name="playerId"
                      value={p.id}
                      defaultChecked
                      className="h-4 w-4 accent-jam-yellow"
                    />
                    <span className="text-sm">{p.displayName}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <button
          type="submit"
          className="rounded-full jam-button"
        >
          Create tournament →
        </button>
      </form>
    </main>
  );
}
