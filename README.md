# Riskle

Riskle is an unofficial, extension-first Wordle companion using fictional coins. Wordle stays on its official NYT page. The extension observes visible evaluated tile states and shows Riskle in Chrome's side panel; the companion website provides account, league, history and wallet views.

Phase 3 adds Supabase email accounts, persistent profiles/history, private league invitations, RLS-protected progress subscriptions, provisional live markets, immutable additional stakes, partial/full cash-outs and transactional backend settlement. The working local mock lab remains at `/demo` strictly for repeatable tests and uses separate browser-local identities and balances.

**Hosted activation is not automatic.** The prepared migration must be reviewed and applied to the configured Supabase project before account wallets/leagues/history work. No remote database migration, push or deployment has been performed in Phase 3. See [Phase 3 setup](docs/PHASE3_SETUP.md).

## Run locally

Use Node.js 22+ and pnpm 12.18.0. Configure the two public Supabase values in ignored `apps/web/.env.local` (see `.env.example`). No secret or service-role key is needed or accepted by the extension.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build:extension
```

Open <http://localhost:3000> for the real account companion and <http://localhost:3000/demo> for the testing lab. In Chrome, enable Developer mode at `chrome://extensions`, load the `apps/extension` directory unpacked, and click Riskle to open its side panel. Connect the same Supabase project and sign in. The configured extension communicates directly with Supabase and does not depend on localhost.

The extension requests `storage` and `sidePanel`. It injects only on the official daily Wordle URL and loopback test pages; its runtime guards reject other paths/ports. Backend host access is optional and granted for the single configured project when you connect it. Tokens remain in trusted extension storage, never in the NYT DOM or messages from a website. The observer does not read guessed words, answers, publisher storage or internal game state.

## Checks

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm exec playwright install chromium
pnpm test:e2e
```

`test:e2e` builds the production application and extension, then uses isolated browser storage and port 3100. App tests use installed Chrome; unpacked-extension tests use Playwright Chromium.

An explicit live-page verification command submits synthetic guesses in an isolated signed-out profile and records only puzzle identity, counts and status:

```sh
node scripts/verify-wordle-live.mjs
```

Actual evidence and remaining verification gaps: [TESTING.md](TESTING.md), [live report](docs/verification/wordle-live.json).

## Architecture

- `apps/extension/src`: visible-state Wordle observer, authenticated background synchronization and React side panel.
- `apps/web`: account companion at `/`, separate mock test lab at `/demo`.
- `apps/web/lib/platform-client.ts`: shared Supabase client/API boundary used by website and extension builds.
- `supabase/migrations/002_authenticated_platform.sql`: authenticated tables, RLS, financial RPCs, game history and rankings. The original scaffold is quarantined if present, not used for real accounts.
- `packages/game-engine` and `packages/shared`: retained deterministic local test engine and domain types.
- `tests/backend`: actual PostgreSQL migration/accounting/RLS tests through PGlite, with a test-only Auth identity boundary.

## Trust and limits

Every real-game result is labeled browser-observed and provisional. This does not prove honest play or prevent a signed-in user fabricating observations. Stale progress suspends live wagering; unresolved event gaps void unresolved stake at cost. Odds use a transparent toy outcome model and are not calibrated probabilities. There is no real money, redemption, purchasing coins or prizes.

Live loading, six submitted guesses, a losing completion and a completed return were verified against the current official page. Winning tiles are tested with synthetic fixtures; a live winning game is not yet verified. Actual email confirmation, recovery delivery, two hosted accounts, Realtime and separate-computer operation remain unverified until the migration is approved/applied and real accounts are exercised.

Disputes can be reported, but a moderation/adjustment workflow remains incomplete. Profile pictures currently use HTTPS URLs rather than uploads. Weekly rankings cover seven puzzle dates, with no bankroll reset; historical periods can be selected. Browser-store packaging, production hardening and other game adapters remain future work. See [setup and policy](docs/PHASE3_SETUP.md).
