# Riskle verification and testing

## Phase 3 — extension and persistent accounts

Final local results: **63 unit/database tests and 8 browser tests passed**, plus TypeScript, lint, formatting and production/extension builds. The actual live page check passed through all six guesses, a loss and a completed return. [Detailed verified/unverified results](docs/verification/PHASE3_RESULTS.md).

The real-account companion is now at `/`; the preserved mock lab moved to `/demo`. Its existing testing walkthrough below still applies at `/demo`, with separate browser-local state.

Read [PHASE3_SETUP.md](docs/PHASE3_SETUP.md) before testing real accounts. Configure the public Supabase URL/publishable key and apply the reviewed `002_authenticated_platform.sql` migration only after approval. No privileged key is used. The migration is approved but has not been applied remotely because the Supabase administration app is not installed/connected here yet.

The new observer was inspected and tested on the official NYT daily page. See [wordle-live.json](docs/verification/wordle-live.json): visible puzzle identity, all six submitted guesses, a losing result and a completed return passed. No guessed words or answer are included in that report. Winning-state fixtures pass, but a live win is not yet verified.

Automated tests additionally execute the actual SQL migration in PGlite, checking wallet integrity, duplicate requests, immutable added stakes, partial/full cash-outs, exposure, stale quotes/events, market closure, head-to-head ties, privacy, direct-write rejection and historical records. The Auth identity boundary is simulated in these SQL tests. Browser signup/login/reset/logout tests use explicit HTTP fixtures, not real email delivery. Real Supabase email/auth, Realtime and separate-computer play remain pending hosted activation and account testing.

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm test:e2e`. Build the unpacked extension with `pnpm build:extension`. The primary extension UI is now the Chrome side panel, not the legacy mock popup.

The remainder of this document records the prior local-MVP test procedure/results. Its statements that Wordle/accounts are absent refer to that earlier version; current scope and limitations are documented above and in PHASE3_SETUP.md.

## Prior local test lab walkthrough

## Prerequisites and installation

Use Node.js 22+ and pnpm 12.18.0. The verification environment used Node 24.20.0, pnpm 12.18.0 and macOS with Google Chrome installed. No account, `.env`, Supabase instance or deployment credentials are needed.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Visit <http://localhost:3000>. `dev` builds the shared packages before starting Next.js. If 3000 is occupied, Next may choose another port; use the displayed URL. The extension only connects to port 3000. Development output is isolated in `.next-dev`, and production output uses `.next`, so an open development server does not overwrite a production build.

To run production locally:

```sh
pnpm build
pnpm --dir apps/web start --hostname 127.0.0.1 --port 3000
```

Stop your dev server first if using the same port. Use one hostname consistently; `localhost` and `127.0.0.1` have separate browser saves.

## Automated checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

Browser prerequisites (one-time): install Google Chrome for the app tests and Playwright Chromium for the isolated extension test:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

`test:e2e` builds the actual production application and runs Playwright against a server on `127.0.0.1:3100`. Keep that port free. It does not reuse a running server. Each test gets isolated browser storage. The extension test routes its isolated browser's port-3000 requests to the test server on 3100, preserving the extension's normal origin restrictions without touching an existing server on 3000. Test servers and browser profiles are closed after testing.

To rerun only browsers after an unchanged successful build:

```sh
pnpm exec playwright test
```

For interactive debugging:

```sh
pnpm exec playwright test tests/browser/demo.spec.ts --headed
```

Screenshots and failed-test traces are written to ignored `test-results/`. Open a failed trace with `pnpm exec playwright show-trace <path-to-trace.zip>`.

## Manual play and exact accounting example

Start with a fresh save for this example. In browser developer tools → Application → IndexedDB, delete the `riskle-demo` database, remove any legacy `riskle.demo.v1` Local Storage entry, then refresh. Close other Riskle tabs first. This deletes that local demo's players, wagers and history; it does not affect repository files. Do not clear data you want to retain.

1. Start as **Mara**, with 1,000 available coins and zero at risk. Sarah is a seeded mock friend who has opted into sharing.
2. Choose **Sarah** in **Wager on**. Set stake to **100** and wager on **Solve in 3 or fewer**. Before any guesses, odds are **2.10×**, potential return **210**, available balance **900**, at risk **100**, and demo profit **0**.
3. Click **Hold**. The UI reports the actual remaining stake and return; balances stay unchanged.
4. Set the add amount to **50**, then click **Add 50 stake** on the position. There must now be two separate positions: **100 at 2.10×** and **50 at 2.10×**, with returns **210** and **105**. Available balance is **850**, risk **150**. The first position is unchanged.
5. In the original 100-coin position, set **Stake to release** to **40** and click **Quote partial**. The review must quote **36 coins** for releasing **40 stake**, leaving **60 stake**. Confirm within 15 seconds. Available balance becomes **886**, risk **110**. The original position remains open with **126** potential return. Demo profit is **−4**.
6. Refresh. Both positions, the partial exit, balances, memberships and ledger remain intact.
7. Switch to **Sarah**. Click **Reveal test answer**, enter that answer and submit it. Sarah completes in one guess; all Sarah markets close and the remaining positions settle.
8. Switch back to **Mara**. Available balance must be **1,117**, risk **0**, and demo profit **+117**. The original position paid **36 + 126 = 162**, net **+62**. The added position paid **105**, net **+55**. Both outcomes, all wallet entries and the leaderboard agree.

Changing quotes or advancing Sarah before the add/cash-out changes the expected values. Expired quotes require **Refresh quotes**. No action may reopen a decided market.

## Test live updates, losses and full cash-outs

With a fresh save, place a wager on Sarah finishing in three or fewer. Switch to Sarah and submit `ZZZZZ`. Switch back to Mara and choose Sarah again: threshold odds change from **2.10×** to **2.70×**; exactly-one is closed as a loss. Add Stake uses **2.70×**, preserving the earlier **2.10×** position.

To test a full exit, click **Full cash out**, review and confirm. Remaining stake and liability become zero. A later solved puzzle must not credit that position again. Reusing a quote must not credit twice; a progress change, another exit, expiry or suspension invalidates its quote.

To test losing a game, place a solve-within-six wager, then play six distinct incorrect guesses: `ZZZZZ`, `YYYYY`, `XXXXX`, `VVVVV`, `QQQQQ`, `JJJJJ`. None is an answer in the mock answer list. Exactly-N predictions close after their missed guess; the ≤3 threshold loses after the third incorrect guess. After the sixth, the game is lost, all markets are closed, all remaining positions have outcomes, risk is zero and losses remain negative in the leaderboard.

## Players, friend groups and privacy

1. Create **Alex** in the top player bar. Alex receives a separate 1,000-coin wallet and an unstarted puzzle.
2. Create a league as Mara, then choose Alex under **Add existing local friend** and click **Add friend**. Use the league selector to switch between leagues.
3. Choose Alex as the wager subject. Wager buttons are disabled because new players default to private progress.
4. Switch the active player to Alex and enable **Share my progress with league friends**. Switch back to Mara, select the league and Alex, and place multiple wagers.
5. Switch to Alex to advance or complete the puzzle. Switch back to Mara to inspect settlement and the league ranking. Every player's wagers/wallet are separate. The UI only displays the active player's individual wager history.

These are local simulated identities, not authenticated accounts or remote friends.

## Exposure and concurrent tabs

Open the same origin in two tabs. Place 100-coin wagers from both tabs on the same active player. Both wagers must persist, leaving 800 available and 200 at risk; the second tab must not overwrite the first. Try another 400 on that subject: the 50% per-subject limit rejects it without debiting anything. Total exposure and per-puzzle limits are 70% and 60% respectively, based on available coins plus outstanding original stake.

The engine tests cover all three caps, insufficient funds, fractional/NaN/negative stakes, stale quote IDs, changed request IDs, duplicate requests, unavailable progress, privacy and suspensions.

## Chrome extension

1. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose the repository's `apps/extension` directory.
2. Visit <http://localhost:3000/> or <http://127.0.0.1:3000/>. Refresh if the page was open before loading the extension.
3. Open the extension popup. It should show the current player, puzzle ID, available coins, guess count/status and last-observed time.
4. Submit a mock guess or switch player in the app, then reopen the popup. The observed snapshot updates. The popup's **Open local dashboard** button opens localhost:3000; use that hostname for this workflow.
5. The extension does not inject into NYT, unrelated sites or all browser pages. Its match patterns are loopback-only. Its script additionally refuses ports other than 3000 and paths other than `/`. Its only requested API permission is `storage`.

The popup is a timestamped, read-only observation and may be stale if the app is closed. **Actual Wordle detection is absent and was not tested.** The automated extension test loads the real Manifest V3 extension in Chromium, observes an actual mock guess and checks the actual popup.

## Actual verification results

The final verification run completed:

- Frozen-lockfile installation successfully (after using the local package store outside the network-restricted sandbox).
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm test`: **34 passed** across two files, including 32 engine tests and two extension boundary tests.
- `pnpm format:check`: passed.
- `pnpm test:e2e`: production build passed; **6 browser tests passed**, covering friend live wagers/add/partial cash-out/refresh/settlement, players/leagues/privacy/full cash-out/loss, simultaneous tabs/exposure, mobile layout/storage failure, actual unpacked extension/popup updates, and migration of an earlier localStorage save.
- Repeated simultaneous-tab test: **10/10 passed** after the IndexedDB fix.
- Desktop, 390px mobile and extension screenshots were rendered and visually reviewed.

The original eight tests and original build passed after dependency repair, but the original tests encoded duplicated-stake behavior. Those assertions were replaced with accounting invariants. Lint originally had no ESLint 9 configuration; that configuration is now present. Early browser runs exposed the checkbox flicker and test focus/selector issues; a later repeated two-tab test also exposed lost updates in the localStorage approach. Persistence now uses a single IndexedDB transaction for each read and write. The final run is the result reported above.

## Known limits and incomplete features

- Everything is local and user-editable. There is no authentication, remote multiplayer, server-authoritative settlement, fraud prevention or production security boundary.
- Only solve, threshold and exact markets are playable. Head-to-head and group-winner markets are not implemented.
- One UTC-date puzzle is pinned to each save. Automatic daily rollover, archived days, weekly seasons/resets, allowances and dictionary validation are not implemented.
- Leagues support local membership and rankings, not invitation links, role permissions, account security or remote friend discovery.
- The retained Supabase migrations are inactive scaffolding, not a verified backend. No new authentication or deployment dependency was added.
- Wordle/other third-party adapters and real-world detection remain unimplemented and unverified. No publisher page, hidden solution or real guessed words were inspected.
- Browser coverage is Chrome plus Chromium; other browsers, screen readers and browser-store distribution were not verified.

No repository push, deployment or publication was performed.
