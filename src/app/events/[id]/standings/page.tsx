import { notFound } from "next/navigation";
import {
  getEvent,
  getLeagueById,
  getRoster,
  listCompletedMatches,
} from "@/db/queries";
import { buildRecords, rankRoundRobin, rankSwiss } from "@/lib/standings";
import { EventNav } from "@/components/EventNav";
import { PageHeader } from "@/components/PageHeader";
import { StandingsTable } from "@/components/StandingsTable";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  const [league, roster, matches] = await Promise.all([
    getLeagueById(event.leagueId),
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
    <main className="court-shell">
      <PageHeader
        title="Standings"
        back={{ href: `/events/${event.id}`, label: event.name }}
        subtitle={
          <>
            <span>{event.format.replace("_", " ")}</span>
            <span className="mx-2 text-jam-yellow/70">·</span>
            <span>
              {isSwiss ? "match points + OMW%" : "wins · losses · seed"}
            </span>
            {league && (
              <>
                <span className="mx-2 text-jam-yellow/70">·</span>
                <span className="font-bold text-jam-yellow">{league.name}</span>
              </>
            )}
          </>
        }
      >
        <EventNav
          eventId={event.id}
          supportsBracket={false}
          active="standings"
        />
      </PageHeader>

      <div className="mt-8">
        <StandingsTable rows={rows} />
      </div>
    </main>
  );
}
