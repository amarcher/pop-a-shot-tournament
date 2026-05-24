import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLeagueById,
  getPlayer,
  sweepStaleBallerJobs,
} from "@/db/queries";
import { isBallerArchetype } from "@/lib/baller-types";
import { BallerForm } from "./BallerForm";
import { BallerGallery } from "./BallerGallery";
import { PollWhileGenerating } from "./PollWhileGenerating";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await sweepStaleBallerJobs();
  const player = await getPlayer(id);
  if (!player) notFound();
  const league = await getLeagueById(player.leagueId);

  const generating = player.jobStartedAt !== null;
  const hasPortraits =
    player.avatarNeutralUrl ||
    player.avatarVictoryUrl ||
    player.avatarDefeatedUrl;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      {league && (
        <p className="arcade-sm text-xs">
          <Link
            href={`/leagues/${league.slug}`}
            className="hover:text-jam-cyan"
          >
            ← {league.name}
          </Link>
        </p>
      )}
      <h1 className="arcade mt-3 text-5xl">{player.displayName}</h1>

      {generating && (
        <>
          <PollWhileGenerating />
          <div className="scoreboard mt-6 px-5 py-4">
            <p className="arcade-sm text-sm">Painting your baller</p>
            <p className="mt-2 text-sm text-cyan-100">
              Generating three states: neutral, on-fire victory, dejected
              defeat. Hold tight — usually ~10s on hosted, ~90s on local FLUX.
            </p>
          </div>
        </>
      )}

      {player.jobError && (
        <div className="scoreboard mt-6 border-jam-red px-5 py-4">
          <p className="arcade-sm text-sm" style={{ color: "#ff8a90" }}>
            Last generation failed
          </p>
          <code className="mt-1 block whitespace-pre-wrap break-words text-sm text-foreground/85">
            {player.jobError}
          </code>
          <p className="mt-2 text-xs text-foreground/60">
            Fix the underlying issue and resubmit below.
          </p>
        </div>
      )}

      {hasPortraits && (
        <section className="mt-8">
          <h2 className="arcade-sm text-sm">Your baller</h2>
          <div className="mt-4">
            <BallerGallery player={player} />
          </div>
        </section>
      )}

      <section className="scoreboard mt-12 p-6">
        <h2 className="arcade-sm text-sm">
          {hasPortraits ? "Regenerate" : "Upload selfie + pick archetype"}
        </h2>
        <p className="mt-2 text-sm text-foreground/70">
          Three portraits get generated: a neutral pre-game look, an{" "}
          <span className="arcade-sm text-xs" style={{ color: "var(--jam-orange)" }}>on fire</span>{" "}
          victory pose, and a
          dejected defeat.
        </p>
        <div className="mt-6">
          <BallerForm
            playerId={player.id}
            defaultArchetype={
              isBallerArchetype(player.ballerArchetype ?? "")
                ? (player.ballerArchetype as Parameters<
                    typeof BallerForm
                  >[0]["defaultArchetype"])
                : undefined
            }
          />
        </div>
      </section>
    </main>
  );
}
