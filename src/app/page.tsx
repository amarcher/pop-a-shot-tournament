import { redirect } from "next/navigation";
import { listLeagues } from "@/db/queries";

export default async function HomePage() {
  const leagues = await listLeagues();
  if (leagues[0]) {
    redirect(`/leagues/${leagues[0].slug}`);
  }
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="arcade text-6xl">Pop-a-Shot</h1>
      <div className="scoreboard mt-10 px-6 py-8">
        <p className="text-cyan-100">
          No leagues yet. Run{" "}
          <code className="rounded bg-black/60 px-2 py-1 font-mono text-jam-yellow">
            npm run db:seed
          </code>{" "}
          to create the demo league.
        </p>
      </div>
    </main>
  );
}
