/**
 * Crypto-random base64url token used for both league sessions (player.leagueToken)
 * and per-event seat claims (eventPlayers.joinToken). Pure function — safe to
 * import from scripts that can't pull in `next/headers`.
 */
export function generateJoinToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
