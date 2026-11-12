# Riskle

Riskle is a local MVP for a live virtual wagering layer around daily puzzle games. This repository contains a Next.js web app, a Chrome extension skeleton, shared types, and a deterministic game engine with tests covering live wagering, market updates, and cash-out logic.

## Local setup

1. Install pnpm if needed:
   `corepack enable && corepack prepare pnpm@12.18.0 --activate`
2. Install dependencies:
   `pnpm install`
3. Run the app:
   `pnpm dev`
4. Run tests:
   `pnpm test`
5. Build the app:
   `pnpm build`

## Included modules

- `apps/web`: demo betting dashboard and profile UI
- `apps/extension`: Manifest V3 extension skeleton for live puzzle progress
- `packages/shared`: core domain types and validation helpers
- `packages/game-engine`: deterministic odds, wagering, cash-out, and leaderboard logic
- `supabase/migrations`: schema for prediction markets, wagers, wallets, and league events
- `docs`: product architecture notes

## Notes

- This version intentionally uses a mock puzzle and local deterministic logic so it can run completely in development without external secrets.
- No real-money or redeemable currency is used anywhere in the project.
