# Riskle

**A Chrome side panel and web dashboard for making Wordle predictions with friends.** Predict your result with fictional coins, follow your friends’ progress in a private league, and see how your picks played out over time.

[Run the demo](#run-locally) · [Architecture](docs/ARCHITECTURE.md) · [Test results](docs/verification/PHASE4_RESULTS.md)

The demo uses simulated puzzle progress and local balances. Riskle is an unofficial companion to the New York Times’ Wordle. Coins have no cash value, and the game offers no purchases, cash redemption, or prizes.

## How it works

1. **Observe.** A Manifest V3 content script reads visible tile evaluation states on the official Wordle page and derives progress and outcome. It leaves guesses and answers on the Wordle page.
2. **Play.** The React side panel lets players review a server quote, commit fictional coins, and see confirmed results. The Next.js dashboard shows league standings, wallet activity, and history.
3. **Settle.** Supabase Auth identifies players. PostgreSQL functions enforce quote validity and update positions and ledger entries transactionally. Row-level security limits access to private league data.

| Layer | Implementation |
| --- | --- |
| Browser | [Chrome extension](apps/extension/src) with a page observer, background sync, and React side panel |
| Web | [Next.js companion](apps/web) with account, league, and history views and a standalone demo |
| Backend | [Supabase migration](supabase/migrations/002_authenticated_platform.sql) for Auth-linked data, access controls, and settlement |
| Simulation | [TypeScript game engine](packages/game-engine) for deterministic local gameplay and tests |

## Engineering decisions

- **Provisional observations.** The browser reports visible progress, so the system treats results as provisional. Stale progress suspends markets, and unresolved observation gaps can cause outstanding positions to be voided. Odds come from a simple simulation model.
- **Consistent balances.** Quotes can expire, added stakes create separate positions, and cash-outs use server quotes. The UI shows confirmed ledger events and uses IndexedDB to avoid repeating the same notification across refreshes and same-origin tabs.
- **Layered tests.** Vitest covers game and UI logic. PGlite runs PostgreSQL migration, accounting, and access-control tests. Playwright covers the dashboard and bundled extension. The [verification report](docs/verification/PHASE4_RESULTS.md) records 81 unit and database tests, 13 browser tests, and the remaining hosted sign-up and settlement checks.

## Run locally

Use Node.js 22+ and pnpm 12.18.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000/demo](http://localhost:3000/demo) to try the simulation. For real accounts, configure the public Supabase values from [.env.example](.env.example) in `apps/web/.env.local` and follow the [backend setup](docs/PHASE3_SETUP.md).

Run `pnpm build:extension`, then load `apps/extension` unpacked at `chrome://extensions` with Developer mode enabled. Open the official Wordle page and click Riskle to open the side panel. See [TESTING.md](TESTING.md) for the full test commands and manual verification steps.
