import { notFound } from "next/navigation";
import {
  getLeagueById,
  getPlayer,
  sweepStaleBallerJobs,
} from "@/db/queries";
import { isBallerArchetype } from "@/lib/baller-types";
import { renamePlayerAction } from "@/app/events/actions";
import { BallerForm } from "./BallerForm";
import { BallerGallery } from "./BallerGallery";
import { PollWhileGenerating } from "./PollWhileGenerating";
import { PageHeader } from "@/components/PageHeader";

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
    player.selfieUrl ||
    player.avatarNeutralUrl ||
    player.avatarVictoryUrl ||
    player.avatarDefeatedUrl;

  return (
    <main className="court-shell">
      <PageHeader
        title={player.displayName}
        back={
          league
            ? { href: `/leagues/${league.slug}`, label: league.name }
            : undefined
        }
        subtitle={
          player.nickname
            ? `"${player.nickname}" · Baller portrait, selfie generation, and player identity.`
            : "Baller portrait, selfie generation, and player identity."
        }
      />

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

      <section className="scoreboard mt-8 p-6">
        <h2 className="arcade-sm text-sm">Edit name</h2>
        <form
          action={renamePlayerAction}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="playerId" value={player.id} />
          <label className="flex-1">
            <span className="block text-xs uppercase tracking-wider text-jam-yellow">
              Display name
            </span>
            <input
              name="name"
              required
              maxLength={80}
              autoComplete="off"
              defaultValue={player.displayName}
              className="mt-1 w-full rounded-lg border-2 border-jam-blue bg-black/60 px-3 py-2 text-foreground placeholder:text-foreground/30 focus:border-jam-cyan focus:outline-none"
            />
          </label>
          <button type="submit" className="jam-button text-xs">
            Save
          </button>
        </form>
      </section>

      <section className="scoreboard mt-8 p-6">
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
            hasSeedImage={!!player.selfieUrl}
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
