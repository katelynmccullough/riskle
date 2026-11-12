# Riskle

A playable, browser-local MVP for virtual puzzle wagers. No accounts, services, secrets, real money, deployments, or database setup are required.

Create local players, form friend leagues, play an original five-letter mock puzzle, and wager on your own or an opted-in friend's progress. Multiple wagers, changing provisional odds, additional stakes, partial/full cash-outs, settlement, rankings, and an auditable wallet ledger work together. The app saves state in IndexedDB transactions, synchronizes tabs with BroadcastChannel, and migrates earlier localStorage demo saves.

## Run locally

Use Node.js 22+ and the repository's pnpm version (12.18.0). Verification was performed with Node 24.20.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. Starting from a clean checkout, `pnpm dev` builds the two shared packages first. After editing a shared package, restart `pnpm dev` to rebuild it.

For the production build:

```sh
pnpm build
pnpm --dir apps/web start --hostname 127.0.0.1 --port 3000
```

Use the same hostname consistently: `localhost` and `127.0.0.1` have separate browser saves. No `.env` file is needed. The original Supabase files are retained as unused scaffolding.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm exec playwright install chromium
pnpm test:e2e
```

The application browser tests use installed Google Chrome. The unpacked-extension test uses Playwright Chromium in an isolated profile. Keep port 3100 free for `test:e2e`; it starts its own production server there. The extension test forwards its isolated browser’s port-3000 requests to that server. See [TESTING.md](TESTING.md) for exact walkthroughs, expected accounting, and verification results.

## Local extension

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension`. Open the demo on port 3000, then the extension popup. It shows the most recently observed active player's mock progress and bankroll, with a timestamp. It is read-only.

Only the `storage` API permission is requested. Content scripts match `http://localhost/*` and `http://127.0.0.1/*`; Chrome match patterns cannot specify a port, so the script additionally checks port 3000 and path `/` before reading anything. There is no all-site or NYT injection, no `tabs` permission, no guessed-word transmission, and no hidden-answer inspection. The popup can open the local dashboard using `chrome.tabs.create`, which does not require the broad `tabs` permission.

**Actual Wordle detection is not implemented or verified.** This repository uses its own mock game only.

## Project structure

- `apps/web`: Next.js/React client application and transactional browser save layer.
- `packages/shared`: shared domain types.
- `packages/game-engine`: deterministic mock puzzle, odds, immutable entry terms, positions, ledger and rankings.
- `apps/extension`: local-only Manifest V3 companion.
- `tests`: extension boundary tests and production browser workflows.
- `supabase`: original, inactive schema scaffolding; not a production backend.

## Boundaries

All identities are local test players. Anyone with access to the browser can switch players, reveal the mock answer, or edit storage. The demo is not authenticated, cheat resistant, server authoritative, or multiplayer across devices. Friends explicitly opt into live sharing (the seeded mock friend Sarah starts opted in).

One UTC-date puzzle is chosen when a save is first created and stays pinned to that date on refresh. There is no automatic day rollover, weekly reset, allowance, head-to-head/group market, invitation system, or production Wordle integration. Delete the `riskle-demo` IndexedDB database (and any legacy `riskle.demo.v1` localStorage entry) in browser developer tools to start a fresh demo with the current UTC-date puzzle. This erases that demo's history.

Rules and limitations: [docs/GAME_RULES.md](docs/GAME_RULES.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ROADMAP.md](docs/ROADMAP.md).
