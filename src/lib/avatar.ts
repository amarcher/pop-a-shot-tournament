import type { Player } from "@/db/schema";

export type AvatarOutcome = "neutral" | "victory" | "defeated";

/**
 * Pick the best avatar URL for a player given the outcome state.
 * Cascades to other URLs (then selfie) so a player who hasn't finished
 * baller generation still renders something visible.
 */
export function pickPlayerAvatar(
  player: Pick<
    Player,
    | "avatarNeutralUrl"
    | "avatarVictoryUrl"
    | "avatarDefeatedUrl"
    | "selfieUrl"
  >,
  outcome: AvatarOutcome = "neutral"
): string | null {
  const { avatarNeutralUrl, avatarVictoryUrl, avatarDefeatedUrl, selfieUrl } =
    player;
  if (outcome === "victory") {
    return avatarVictoryUrl ?? avatarNeutralUrl ?? selfieUrl ?? null;
  }
  if (outcome === "defeated") {
    return avatarDefeatedUrl ?? avatarNeutralUrl ?? selfieUrl ?? null;
  }
  return avatarNeutralUrl ?? selfieUrl ?? null;
}

/**
 * Given a player and a match where they appeared, return the outcome avatar.
 * Pre-match (no winner): neutral. Post-match: victory if they won, defeated if not.
 */
export function pickMatchOutcomeAvatar(
  player: Pick<
    Player,
    | "id"
    | "avatarNeutralUrl"
    | "avatarVictoryUrl"
    | "avatarDefeatedUrl"
    | "selfieUrl"
  >,
  winnerId: string | null
): string | null {
  if (!winnerId) return pickPlayerAvatar(player, "neutral");
  return pickPlayerAvatar(
    player,
    winnerId === player.id ? "victory" : "defeated"
  );
}
