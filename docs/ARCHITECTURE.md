# Riskle architecture

## Product direction

Riskle adds a virtual, social prediction layer around daily puzzle games such as Wordle. The platform keeps the original game on the publisher website and adds friend leagues, odds, and leaderboard competition around it.

## Core services

- `packages/shared`: shared domain model and validation primitives
- `packages/game-engine`: odds model, bankroll logic, wager ledger, and leaderboard calculations
- `apps/web`: product dashboard for leagues, wagers, and profiles
- `apps/extension`: local browser integration for live game-state detection and mock updates
- `supabase/migrations`: server-authoritative schema for production-ready storage

## Deterministic cash-out rule

The mock engine uses a deterministic cash-out formula based on progress remaining in the underlying puzzle:

`cashout = stake * odds * (0.25 + (1 - progressRatio) * 0.75)`

where `progressRatio = guessesUsed / maxGuesses` and is clamped between 0 and 1.

This keeps the mechanics transparent while still allowing live market adjustments as puzzle state changes.

## Security principles

- No real-money transactions or cash redemptions are allowed.
- Wallet changes are emitted through the same ledger logic used for wagers, settlements, and cash-outs.
- Client-side code is non-authoritative and should be treated as UI and convenience logic only.
