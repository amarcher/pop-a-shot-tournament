import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEvent,
  getRoster,
  listCompletedMatches,
} from "@/db/queries";
import { buildRecords, rankRoundRobin, rankSwiss } from "@/lib/standings";
import { StandingsTable } from "@/components/StandingsTable";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [roster, matches] = await Promise.all([
    getRoster(event.id),
    listCompletedMatches(event.id),
  ]);

  const seeds = new Map(roster.map((r) => [r.playerId, r.seed]));
  const records = buildRecords(
    roster.map((r) => r.playerId),
    seeds,
    matches
  );

  const isSwiss = event.format === "swiss";
  const ranked = isSwiss ? rankSwiss(records) : rankRoundRobin(records);

  const rows = ranked.map((r, i) => {
    const player = roster.find((p) => p.playerId === r.playerId)!.player;
    return {
      rank: i + 1,
      player,
      wins: r.wins,
      losses: r.losses,
      opponentMatchWinPct: isSwiss
        ? (r as ReturnType<typeof rankSwiss>[number]).opponentMatchWinPct
        : undefined,
      matchPoints: isSwiss
        ? (r as ReturnType<typeof rankSwiss>[number]).matchPoints
        : undefined,
    };
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <p className="arcade-sm text-xs">
        <Link href={`/events/${event.id}`} className="hover:text-jam-yellow">
          ← {event.name}
        </Link>
      </p>
      <h1 className="arcade on-fire mt-2 text-4xl">Standings</h1>
      <p className="mt-2 text-sm text-jam-cyan/85">
        {event.format.replace("_", " ")} ·{" "}
        {isSwiss ? "match points + OMW%" : "wins · losses · seed"}
      </p>

      <div className="mt-8">
        <StandingsTable rows={rows} />
      </div>
    </main>
  );
}
