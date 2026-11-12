# Phase 3 setup and deployment boundary

The companion website is now at `/`. The preserved local mock lab is at `/demo` and does not share wallets, identities or results with authenticated accounts.

## Supabase configuration

Use an existing Supabase project. Only these client variables are needed in the ignored `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
```

No secret/service-role key is used anywhere in the app or extension. If one was disclosed, rotate it in Supabase Settings → API Keys. Never paste it into the extension, browser configuration, committed source or client environment.

The project public Auth endpoint was reachable and email confirmation was enabled. This verifies connectivity, not a completed account/database integration.

## Review and apply the database migration

Review `supabase/migrations/002_authenticated_platform.sql`. It creates the `rk_` authenticated tables, an Auth signup trigger, RLS policies, and authenticated RPCs. It initializes wallets with exactly 1,000 virtual coins; clients cannot directly write wallets, ledger entries, positions or results. It also revokes anonymous/authenticated access to the original insecure prototype tables if present. It does not drop their data.

Applying this file changes your remote database. The Phase 3 brief prohibits deployment without approval; this migration is prepared and tested locally but has **not** been applied to your project automatically. Approval has been given for this project, but the administration connection is still missing. Install/connect the Supabase app to let the agent apply it, or open the project's SQL Editor, paste the complete file, and run it once. Do not run the inactive original seed as production account data. The Phase 3 migration can be applied directly to a new project; the original prototype migration is not required.

After the migration, the public RPCs are:

- `riskle_command(command, payload, request_id)` — authenticated, transactional mutations with idempotency receipts.
- `riskle_state()` — scoped account, league, progress, market and wallet data.
- `riskle_history(month_start)` — month-by-month calendar and lifetime statistics.
- `riskle_rankings(league_id, period_start, period_days)` — daily/weekly league or public opt-in standings.

Supabase Auth settings should use your companion web URL as Site URL, and allow its callback/reset URL (for local development, `http://localhost:3000/`). Email/password signup must be enabled. Confirmation and recovery emails require the project's normal email delivery setup. Do not disable confirmation merely for this application.

## Run the companion and build the extension

```sh
pnpm install --frozen-lockfile
pnpm dev
# In another terminal:
pnpm build:extension
```

Open the companion website, create a real account, confirm the email and log in. A duplicate username is rejected by the database. Account settings support display names, usernames, a user-provided HTTPS profile-picture URL, private-league progress sharing and public-ranking opt-in.

In Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `apps/extension`. The build must exist first. Click Riskle to open Chrome's side panel. It is outside Wordle's viewport controls and is collapsible through Chrome.

Connect the same Supabase project in the panel. The build can prefill the public configuration from `.env.local`; otherwise enter it. Grant access only to that project's origin. Log in with the same account as the website. The extension keeps its own persistent session in extension storage restricted to trusted extension contexts. It does not copy tokens from Wordle or from a webpage. Neither a running localhost server nor a deployed Riskle website is required for the configured extension's API calls.

## Play and synchronize

Visit the official daily URL: `https://www.nytimes.com/games/wordle/index.html`. Start at the intro so Riskle can read the visible date and puzzle number. A same-day cache of a previously observed identity supports direct returns to the completed board. Without visible or previously observed same-day identity, the adapter reports unsupported rather than assigning a guessed date.

Riskle reads only the visible `[data-testid=tile]` elements' evaluated state attributes, never their letters, scripts, puzzle answer, NYT localStorage or internal application state. A partial tile-reveal animation does not count as a guess. A stable row of five evaluated states does; all-correct wins, and six evaluated nonwinning rows lose. Unknown markup, missing metadata or hidden/inconsistent boards suspend observation.

Progress goes to the authenticated RPC associated with the signed-in account. A five-second observation heartbeat keeps live eligibility fresh. The server suspends live wagers when the last accepted observation is over twelve seconds old. Stale event timestamps, mismatched puzzle IDs/dates, conflicting terminal results and out-of-order events are rejected. An unresolved sequence gap marks the session disputed, voids unresolved positions at remaining cost and closes those markets; no speculative winnings are credited. An already-played board first observed late is recorded for history with live wagering disabled. Unfinished sessions inactive for 48 hours, or with puzzle dates more than three UTC calendar days old, void unresolved positions at remaining cost on the next authenticated account read/command. This never invents a win/loss or rewrites the guessed count.

Create a league, copy its invitation code/link, and have a second account join from a separate browser/computer. New accounts default to private progress. Each subject must opt into sharing before friends can wager. Realtime subscriptions are protected by RLS; five-second authenticated refreshes recover missed notifications. Other people's individual wager histories and wallets are not exposed through the account state; league rankings deliberately expose member totals.

## Financial and dispute policy

The hosted implementation preserves immutable entry terms and the local demo's whole-coin accounting. Additional stake creates a separate position. Partial exits consume proportional remaining stake and payout liability; a full exit consumes all rounding remainder. Cash-out quotes expire in fifteen seconds or earlier on market expiry and become invalid when progress or remaining stake changes. Mutation request IDs prevent duplicate credit/debit, including retried settlement.

Solve, threshold, exact and head-to-head predictions are supported. Head-to-head requires the same puzzle; ties void at original remaining cost. Provisional multipliers use equal weights for remaining final guess outcomes plus loss, with a published 10% model margin and a minimum 1.05 multiplier. They are not empirically calibrated probabilities. Exposure limits are 70% aggregate, 50% per involved subject and 60% per puzzle. The backend derives balances, odds, payouts, eligibility and outcomes; client-supplied balances/payouts are ignored.

Browser observation is not proof of honest play. Outcomes/rankings remain provisional. Users may report an involved result for review; a report does not automatically refund a losing stake. A moderation workflow and reversible post-settlement adjustments are not implemented, so disputes remain recorded for manual review. There are no real-money deposits, redemption, prizes or guaranteed cheat prevention.

The monthly calendar also includes provisional opt-in daily ranks and a native guess-count trend plot.

Daily records are identified by the publisher's visible puzzle date, not server midnight. Historical data is never overwritten by a new day. Wallets are continuous; weekly standings use profit for the selected seven puzzle dates, with no weekly bankroll reset. Month-by-month calendars, win counts, average winning guesses and streaks are database backed. The single-day mock lab still has its separate pinned-day behavior.

## Verification commands and boundaries

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
# Explicit live-page verification; submits synthetic guesses in an isolated signed-out profile:
node scripts/verify-wordle-live.mjs
```

PostgreSQL authorization and accounting tests run the actual migration in PGlite, with a test-only Auth identity boundary. These verify SQL behavior and RLS but do not replace testing Supabase Auth, email delivery, Realtime and separate-computer play against the configured project after migration. See `docs/verification/` for the actual live observation report. A live losing result and return visit can be verified without reading any hidden answer; a live winning result is only verified if explicitly reported as such. Synthetic fixtures cover winning tiles independently.

Latest actual outcomes and hosted activation status: [PHASE3_RESULTS.md](verification/PHASE3_RESULTS.md).
