import type { Player } from "@/db/schema";

const STATES = [
  {
    key: "selfie",
    label: "Seed image",
    urlField: "selfieUrl" as const,
  },
  {
    key: "neutral",
    label: "Pre-game",
    urlField: "avatarNeutralUrl" as const,
  },
  {
    key: "victory",
    label: "On FIRE!",
    urlField: "avatarVictoryUrl" as const,
  },
  {
    key: "defeated",
    label: "Rejected",
    urlField: "avatarDefeatedUrl" as const,
  },
] as const;

export function BallerGallery({ player }: { player: Player }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STATES.map((s) => {
        const url = player[s.urlField];
        return (
          <li
            key={s.key}
            className="overflow-hidden scoreboard"
          >
            <div className="relative aspect-square w-full bg-gradient-to-br from-orange-900/40 to-amber-950/40">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={`${player.displayName} — ${s.label}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-jam-cyan/50">
                  pending
                </div>
              )}
            </div>
            <div
              className={`border-t border-jam-blue/60 px-3 py-2 ${
                s.key === "victory"
                  ? "bg-jam-red/20"
                  : s.key === "defeated"
                    ? "bg-jam-blue/40"
                    : "bg-black/30"
              }`}
            >
              <p className="arcade-sm text-sm">{s.label}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
