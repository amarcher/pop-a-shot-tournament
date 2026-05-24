<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working in this repo

This is a Next.js 16 App Router app for running pop-a-shot tournaments at home. It runs against Neon Postgres via Drizzle, generates NBA-Jam-style baller portraits by editing user selfies with FLUX.2 Klein (hosted via fal.ai by default, or self-hosted mflux), and uses Server-Sent Events for real-time broadcast updates.

Architecture mirrors the sister app at `/Users/archer/Programs/mtg-dash` — same patterns for identity (league-scoped cookies, no real auth), background jobs (selfie → 3 state portraits via `after()`), and pub/sub fan-out (Upstash Realtime in prod, in-process Map in dev).

## Verification gate

Before reporting any non-trivial change as done, run **all four**:

```sh
npm test            # unit tests (swiss, materialize, pairings) — must stay ≥14 passing
npm run lint        # ESLint
npm run build       # production build (catches RSC/client-boundary issues lint misses)
npm run verify      # end-to-end harness — see scripts/verify-bracket.ts
```

`npm run verify` creates `_verify_`-prefixed leagues and walks every tournament format end-to-end: single elim with a bye, double elim (both winners-side and losers-side grand-final outcomes including bracket reset), round robin, Swiss across three rounds. Cleans up after itself; re-running after a crashed run wipes leftovers automatically. Does NOT exercise the FLUX baller-generation pipeline (would burn fal credits on every run) — that's smoke-tested manually via the UI.

## Conventions

- **Identity is league-scoped.** `players.league_token` is the durable per-league session cookie; `event_players.join_token` is finer-grained for per-event seat claims. New entry points must funnel through one of `setLeagueCookie(leagueId, leagueToken)` or `setPlayerCookie(eventId, joinToken)` in `src/lib/auth.ts`.
- **Server actions** live in `src/app/events/actions.ts`. The file is `"use server"` so it can only export async functions. Constants go in adjacent non-`"use server"` modules — `src/lib/baller-types.ts` is the canonical pattern.
- **Client/server boundary**: anything that imports `sharp`, `heic-convert`, `@fal-ai/client`, or `cookies()` must NOT be reachable from a Client Component. `src/lib/baller.ts` and `src/lib/image-gen.ts` carry `import "server-only"` to enforce this at build time. `src/lib/auth.ts` deliberately does NOT — see "server-only and verify scripts" below.
- **DB access**: typed query helpers live in `src/db/queries.ts`. Extend them rather than running ad-hoc Drizzle in components. The `hydrateMatches(eventId, filter?)` helper joins matches → players in one call; reuse it across `/play`, `/bracket`, and `/broadcast` instead of re-implementing.
- **Real-time**: every mutation that changes user-visible state should `await publish(eventId, ...)` from `src/lib/pubsub.ts` so the broadcast view auto-updates. The `EventMessage` discriminated union in `src/lib/realtime-schema.ts` is the contract. When Upstash env (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) is set, publishes route through `@upstash/realtime` over Redis Streams; reconnecting clients replay the last 50 events automatically. When unset, the fallback is an in-process `Map` — fine for single-instance local dev and LAN demos.
- **Generated image storage**: `src/lib/baller.ts` writes to Vercel Blob with the stable key `avatars/<playerId>/<state>.jpg` (`allowOverwrite: true`) and stores the absolute Blob URL in the DB with a `?v=<timestamp>` cache-buster. Requires `BLOB_READ_WRITE_TOKEN` from the Vercel Blob Marketplace integration.
- **`import "server-only"` and verify scripts**: the `server-only` package always throws when imported outside Next's webpack runtime, including under `tsx` / `vitest`. We keep `server-only` ONLY on files that import truly browser-hostile deps (`sharp`, `heic-convert`, `fal`). For files that just want server-y semantics (cookies, Drizzle DB), we lean on the dep itself to fail loudly on the client. Otherwise verify scripts and unit tests can't import them.
- **Don't add comments** that explain *what* code does — names should already do that. Comments are for the *why* (a non-obvious constraint, a workaround, a reason a hot path is structured oddly).
- **Don't add backwards-compat shims** when you can just change the call sites. The codebase is small.

## What not to break

- The `setPlayerCookie` / `getCurrentPlayer` cookie scheme (per-event) and `setLeagueCookie` / `getCurrentLeaguePlayer` (per-league, durable) in `src/lib/auth.ts`. The `pst_event_<id>` and `pst_league_<id>` prefix scheme.
- `pickPlayerAvatar` and `pickMatchOutcomeAvatar` in `src/lib/avatar.ts` — both cascade through neutral → selfie so players who haven't finished baller-gen still render.
- The `revalidatePath` wrapper at the top of `src/app/events/actions.ts` — it swallows errors so the verify script can drive server actions outside a request scope.
- The baller-gen background-job pattern in `generateBallerAction`. The action sets `players.job_started_at` and returns in <1s, then `after()` runs the ~6s (fal) or ~90s (local mflux) pipeline past the response. Don't inline the work — Vercel kills functions at 300s and Cloudflare's free tier kills HTTP at 100s.
- `pairings/swiss.ts` is a verbatim port from mtg-dash — keep it pure (no DB, no IO) so it stays trivially testable.
- The grand-final-reset special case in `advanceMatch` (src/lib/bracket/advance.ts). Pre-creating the reset match at materialize time means the event-complete check fires correctly when the winners-side wins (the unused reset is marked complete on the spot); when losers-side wins, the reset is hydrated with the same two players and flipped to in_progress.

## When changing the schema

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` (creates a numbered SQL file under `drizzle/`).
3. `npm run db:migrate` (applies to Neon).
4. Update the relevant query helpers in `src/db/queries.ts`.
5. Migrations are additive only — never drop or rename a column without an explicit user request.

## When adding a new server action

1. Add to `src/app/events/actions.ts` as an async export.
2. Validate inputs at the top, throwing `Error` with a user-facing message on failure.
3. Mutate the DB.
4. `await publish(eventId, ...)` a typed `EventMessage` if any view should re-render in response.
5. Call `revalidatePath` for any page route whose data changed.
6. Add coverage to `scripts/verify-bracket.ts` so the action is exercised end-to-end.

## Tournament formats

- **single_elim** (any N ≥ 2): standard seed-order pairing with byes for non-power-of-2. Materialized as one `rounds` row per bracket round (side="none") and matches wired by self-FK `nextMatchWinId`.
- **double_elim** (only N where ⌈log₂N⌉ ∈ {2, 3} — i.e. 2-8 players): winners + losers + grand_final sides, with explicit `bracketSide` enum on rounds + matches. Bracket reset pre-created in `pending`; activated only when losers-side wins the first grand final. For 9+ players, throw with a friendly "use Swiss" message — extending to 16+ is mechanical but deferred.
- **round_robin** (any N ≥ 2): circle-method schedule. N-1 rounds for even N; N rounds for odd N with a rotating bye.
- **swiss** (any N ≥ 2): mtg-dash's backtracking pairing algorithm. Round 1 paired by seed; subsequent rounds paired from current standings via `advanceSwissRoundAction`. `totalRounds` defaults to `ceil(log2(N))` if omitted at event creation.

Standings (`src/lib/standings.ts`) cover round_robin (wins → losses → seed) and Swiss (MP + OMW% with 33% floor). Elim formats don't need a standings table — the bracket IS the standings.

## Required env vars

Pull with `vercel env pull .env.local` after linking the project (when on Vercel).

- `DATABASE_URL` — Neon Postgres. Provisioned in the user's personal Neon org under project `pop-a-shot-tournament` (NOT the Vercel-managed org — that one rejected API creation).
- `IMAGE_GEN_PROVIDER` — `"fal"` (default, hosted) or `"local"` (Mac mflux at `IMAGE_GEN_URL`, default `http://127.0.0.1:8000`). Differs from mtg-dash which defaults to `local`.
- `FAL_KEY` — required when `IMAGE_GEN_PROVIDER=fal`. From [fal.ai dashboard](https://fal.ai/dashboard/keys).
- `BLOB_READ_WRITE_TOKEN` — required for baller-gen. From the Vercel Blob marketplace integration.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — optional. When set, cross-instance pub/sub via Upstash Redis Streams. When unset, in-process fan-out (single-instance only).

## Deferred for v2

- Per-page dynamic OG images (events, players, leagues). The scaffold is ready — `src/app/.../opengraph-image.tsx` files using `next/og`.
- Capacitor mobile wrapper.
- 30s match timer UI (operator paces in v1).
- Double-elim for 16+ players (mechanical extension of the existing 4-/8-player code).
- Final-standing computation for single_elim that uses bracket depth instead of raw win count (current `assignFinalStandings` works but isn't as informative as "lost in round X").
