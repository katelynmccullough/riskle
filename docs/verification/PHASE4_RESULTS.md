# Phase 4 verification — November 13, 2026

## Implemented

Riskle now shares a light design system across the side panel, account companion, authentication, sheets, notifications and legacy local lab. The extension uses Play / Friends / Bets / Profile navigation. Play separates prediction selection, coin selection and final review; the companion emphasizes accounts, leagues, statistics, history, wallet and settings. Onboarding is optional and available from Profile/Help.

The wager review freezes the selected backend quote and shows stake, multiplier, total payout, net profit and maximum loss. Changed, suspended, expired or closed quotes disable confirmation. Added stakes create separate positions through the existing command API. Partial/full cash-out sheets request an actual server quote and show returned coins, expiry, remaining stake and realized cash-out gain/loss before confirmation. Original wager terms remain immutable.

Confirmed ledger entries drive outcome feedback. Initial sign-in/refresh is silent. A per-user IndexedDB acknowledgement transaction prevents the same ledger event replaying across same-origin tabs, refreshes and reconnects; older snapshots cannot rewind the checkpoint. If acknowledgement storage fails, animations are suppressed and persisted results remain visible. Cross-device and website-versus-extension acknowledgements are separate. Routine events are bounded to three visible notices to avoid a notification backlog. Bets/history retain the actual outcomes.

Coin counters follow the confirmed wallet balance. Stake reservation is a reservation message, settlement losses do not subtract the reserved stake again, cash-outs are distinct exits, and voids are neutral refunds. Reduced motion disables confetti and transitions without hiding results. Native modal dialogs support keyboard dismissal and keep financial errors inside the review.

Friends use actual league memberships, invitation commands, privacy settings and eligible shared progress. Rankings come from the existing RPC; movement describes the change between observed confirmed rankings, without invented historical arrows or podiums. Head-to-head predictions use existing server markets; a separate challenge acceptance/inbox system was not added.

Completed own games transition to results. Daily net/rank/history use backend data; wager counts and biggest outcomes are omitted when the RPC's 200-closed-position cap makes them incomplete. Share cards whitelist puzzle identity, result count, available profit/rank and branding. PNG download, copy and supported native sharing are optional. No guessed words, tile colors or answers are included.

The real Wordle observer, Manifest V3 permissions, Supabase authentication, transactional SQL/RLS and deterministic local engine are preserved. No dependencies or migrations were added. No hosted data was changed, and nothing was pushed or deployed. The pre-existing `.env.example` edit was retained.

## Actual checks

- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: **81 tests passed across seven files**, including 20 actual PostgreSQL migration tests, 32 local-engine tests, observer/config regressions, 14 event/experience tests and four rendered-component tests.
- `pnpm format:check`: passed.
- `pnpm build`: passed (Next.js production app and bundled Manifest V3 extension, also executed by `test:e2e`).
- `pnpm build:extension`: passed.
- `pnpm test:e2e`: **13 browser tests passed**, including the eight earlier regressions and five new UX flows.
- `git diff --check`: passed.

Browser coverage includes quoted payout/profit/loss, immutable added stakes, server-quoted partial/full exits, stale/expired reviews, backend rejection, single-event win/loss/refund feedback, refresh without replay, confirmed balance invariants, authenticated bundled panel at 320/380/480px, privacy, reduced motion, results/PNG export, web history/settings/onboarding at desktop/mobile widths, Auth fixtures, concurrent local tabs and observed Wordle fixture completion. Desktop, mobile, panel, coin selector, confirmation, friends and results screenshots were rendered; representative final desktop/mobile/panel/review screenshots were visually inspected. Screenshots are ignored artifacts in `test-results/phase4-*.png` and depict fictional test fixtures.

## Live official Wordle

The actual unpacked observer passed against **Wordle #1973**, November 13, 2026, in an isolated signed-out Chromium profile. It observed guesses 0 through 6, a losing terminal result, and the completed game after reload through normal controls. [Privacy-safe evidence](phase4-wordle-live.json). The profile was deleted afterward. A live winning completion remains unverified; synthetic winning/return fixtures pass. This check verifies observation, not hosted settlement or honest play.

## Supabase and remaining limits

A read-only check using only the configured publishable key reached public Auth settings (HTTP 200). Anonymous `riskle_state` returned HTTP 401 / PostgreSQL `42501`, denying anonymous execution. [Endpoint evidence](phase4-supabase-readonly.json). This does not establish the full migration state or prove signed-in behavior. No admin connection, privileged key or hosted mutation was used in Phase 4.

Real hosted signup/confirmation/recovery delivery, two signed-in accounts, Realtime synchronization and hosted wagers/cash-outs remain unverified. Browser Auth/financial UI tests explicitly use HTTP fixtures; SQL tests run the real migration in local PGlite with a simulated Auth identity. No fake accounts or successful wagers are inserted into the product to conceal that distinction.

The existing provisional/browser-observed trust model, toy odds, closed-history/ledger pagination limit, HTTPS-avatar URLs and incomplete moderation/adjustment workflow remain unchanged. Screen-reader testing, broader browsers and store distribution were not performed. Browser push is not requested. There is no real money or publisher affiliation.

See [TESTING.md](../../TESTING.md) for exact run commands and the manual walkthrough.
