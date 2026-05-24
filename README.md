# Pop-a-Shot Tournament

A backyard pop-a-shot tournament runner. Players claim a profile, upload a
selfie, and get re-imagined as an NBA-Jam-style baller — complete with a
neutral pre-game portrait, a flames-erupting "ON FIRE!" victory pose, and a
dejected-but-dignified defeat. Matches are binary (operator clicks the
winner — pop-a-shot itself is 30 seconds of basket-counting offline).

Sister app to [`mtg-dash`](../mtg-dash) — same Next.js 16 + Drizzle + Neon
+ Vercel Blob + Upstash Realtime stack, same identity model, same
background-job pattern for image generation.

## Features

- Four tournament formats: **single elimination**, **double elimination**
  (with bracket reset), **round robin**, **Swiss pairings**
- AI-generated NBA-Jam baller portraits in three outcome states (8
  archetypes: street baller, all-star starter, retro 90s sharpshooter,
  sky-walking dunker, bench gunner, defensive brick wall, globe-trotting
  showman, old-school coach player)
- TV-friendly broadcast view with live SSE updates and on-fire celebration
- Phone-friendly operator view for clicking winners
- League-scoped identity (no real auth — friends-only)

## Getting started

```sh
npm install
vercel env pull .env.local   # or set DATABASE_URL + FAL_KEY + BLOB_READ_WRITE_TOKEN by hand
npm run db:migrate           # apply schema to Neon
npm run db:seed              # creates the "demo" league
npm run dev
```

Visit `http://localhost:3000` → redirects to `/leagues/demo` → claim your
baller → create a tournament → pick a format and roster → start →
operator clicks winners.

## Tournament walk-through

1. **Claim a baller** at `/leagues/<slug>/claim`. Enter a display name; you
   get redirected to `/players/<id>` where you upload a selfie and pick an
   archetype. Generation runs in the background (~6s on fal, ~90s on local
   mflux) and the page polls until the three portraits land.
2. **Create a tournament** at `/leagues/<slug>/events/new`. Name it, pick a
   format, check the roster, click create. You land on the event page in
   "draft" status.
3. **Start the tournament**. The bracket / pairings get materialized and
   the event flips to "active".
4. **Click winners** at `/events/<id>/play` (phone-friendly). For Swiss,
   come back to `/events/<id>` between rounds to click "Pair next round".
5. **Broadcast** at `/events/<id>/broadcast` for the TV. Auto-updates via
   SSE when winners are clicked.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm test` — vitest unit tests
- `npm run lint` — ESLint
- `npm run verify` — end-to-end format walk-through (no FLUX)
- `npm run db:generate` / `db:migrate` / `db:seed` — Drizzle workflow

See [AGENTS.md](./AGENTS.md) for the full architecture and conventions.
