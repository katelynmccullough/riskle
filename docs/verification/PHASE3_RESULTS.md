# Phase 3 verification — November 12, 2026

## Completed locally

- `pnpm test`: **63 tests passed** across five files. This includes the 32 original local-engine regressions, two local extension-boundary tests, six visible-Wordle observer tests, three configuration/permission tests, and 20 PostgreSQL backend tests.
- `pnpm typecheck`: passed for the web app, shared engine, browser tests and extension source.
- `pnpm lint`: passed.
- `pnpm format:check`: passed.
- `pnpm test:e2e`: production Next.js and Manifest V3 builds passed; **8 browser tests passed**. These preserve all six earlier local-lab/extension workflows and add account-client HTTP fixtures and an unpacked Wordle winning/return fixture with a rendered side panel.
- `git diff --check`: passed.

The backend tests execute the actual migration in PGlite/PostgreSQL with a test-only Auth identity boundary. They cover authorization, quarantining the old insecure scaffold, account/wallet backfill, two-user league membership, private reads, financial invariants, immutable added stakes, partial/full exits, stale/duplicate requests and progress, all exposure caps, gap voids, head-to-head ties, historical dates, opt-in daily rank, timezone validation, more than 200 open positions, and abandoned-session refunds without fabricated game completion.

## Current official Wordle page

The unpacked extension was exercised on the official daily URL in an isolated, signed-out Chromium profile. On November 12, 2026, it observed the visible identity **Wordle 1972**, guesses **0 through 6**, the final **lost** status, and a return through the normal **Admire Puzzle** control. The latest live run completed successfully. The evidence is `wordle-live.json`.

Only public puzzle metadata, counts, status, observation times and timezone offset were saved. No actual guessed words, hidden answer, publisher storage or internal application state were exported. Synthetic guesses affected only the isolated verification profile, which was removed afterward.

A live winning completion has **not** been verified. Evaluated all-correct winning tiles, partial animations, missing/changed boards and returning to a winning board are covered by synthetic fixtures. This verifies observer behavior, not authentic human performance or cheat prevention.

## Hosted project and activation

The supplied project URL and publishable key are configured only in ignored local configuration. Its public Auth settings returned HTTP 200; email signup is enabled and confirmation is required. The public client returned `PGRST202` for `riskle_state`, confirming the migration was not installed at the time checked.

The user approved applying the migration. **It has not been applied:** the Supabase administration app still reports not installed in this chat, so there is no connected SQL administration capability. No secret key was stored or used. Installing/connecting the Supabase app is the remaining activation step; no repeat migration approval is required for the prepared change.

Until activation and real-user tests, the following remain **unverified**: live Supabase signup/confirmation/login/logout/recovery, actual two-account and separate-computer synchronization, hosted Realtime delivery and hosted wagers/cash-outs. The account browser test uses HTTP fixtures explicitly and does not claim those real service outcomes.

## Other limits

- All observed results/rankings and payout models are provisional. The model is not statistically calibrated.
- Disputes are recorded for review; a moderation and post-settlement adjustment workflow is not implemented.
- Avatars use HTTPS URLs; uploads are not implemented.
- Every open position is returned; closed positions and ledger views currently show the latest 200, without pagination. Historical monthly financial totals still use all persisted rows.
- Publisher-terms review, browser-store preparation and broader accessibility/browser testing remain necessary before distribution. No publisher endorsement is implied.
- No GitHub push, site deployment, publication or remote database mutation was performed during Phase 3.
