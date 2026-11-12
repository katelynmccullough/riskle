# Riskle local architecture

The existing pnpm workspace, Next.js 14/React 18 application, shared types package and TypeScript game-engine package are retained. No authentication, remote database, deployment service or API credentials are needed for this local MVP.

## State and transactions

`RiskleGameEngine` owns players, sessions, progress, markets, quotes, positions, wallet entries, league membership, activity and duplicate-request receipts. Methods execute synchronously. The engine derives market outcomes from validated progress; callers cannot pass a settlement outcome. Guess events must advance one step, with duplicate, older and terminal progress ignored.

`apps/web/lib/demo-store.ts` is the browser transaction boundary. One IndexedDB read/write transaction serializes each mutation across tabs for the same origin. Each command restores the latest saved engine, applies the command and stores a versioned snapshot in that same transaction. Only a successful write updates the command's displayed state. A failed command or quota failure aborts the transaction, leaving the committed snapshot unchanged. BroadcastChannel messages and window-focus events update other tabs. Monotonic revisions prevent a delayed read from replacing a newer displayed state. No persisted asynchronous work or external side effects are part of these transactions.

The snapshot preserves the ledger, immutable entry terms, remaining stake/liability, progress, guessed words for this original mock puzzle, quotes, memberships and idempotency receipts. Restore checks wallet/position accounting and rejects corrupt or incompatible saves without silently replacing them. This is validation for accidental corruption, not tamper resistance. Snapshots contain no credentials. Storage is per browser origin, not shared across devices or hostnames. IndexedDB must be available. Earlier localStorage snapshots are migrated during the first successful IndexedDB commit, then their legacy entry is removed. Browser localStorage is otherwise used only for the selected-player preference.

Storage-level transactions are used so competing tabs cannot read the same pre-mutation snapshot and overwrite each other’s committed changes.

## Accounting

Original wager entry terms remain unchanged; lifecycle fields track remaining stake, remaining payout liability, total credits and outcome. Additional stake always enters as a distinct wager. Partial cash-out consumes only proportional liability and exposure. Payout calculations use integer division, with the final exit consuming any remaining rounding liability. The wallet ledger records every movement and zero-credit loss settlements.

The engine has no production authorization boundary. Browser code and storage remain editable by the user. Local test-player switching intentionally provides access to every simulated identity. No server-authoritative security, production atomicity, authenticated leagues, fraud prevention or cheat-proof settlement is claimed.

## UI and extension

The dashboard is a React client. Dedicated puzzle and position components render guess feedback and position controls. The save layer and shared engine keep UI state separate from wagering rules. Form errors and confirmed command results are accessible live messages. Mobile tables scroll within their panels.

The Manifest V3 extension reads a minimal hidden DOM snapshot from the local dashboard. Its content script checks port/path, observes changes, and sends only current player label, puzzle ID, public status/count and virtual wallet totals. The service worker validates sender origin/path and payload, strips extra fields, and stores a timestamped read-only snapshot. Popup rendering uses textContent. It never changes the app's balances or receives guessed words/answers.

Only localhost/loopback content-script matches and the storage permission are used. No third-party content scripts, broad tabs access, credentials, cookies or browsing history are required. Wordle detection was removed because the previous row-count heuristic was unverified.

## Retained scaffolding

The existing `supabase` migration and seed are inactive historical scaffolding. They have not been validated as a functioning, secure production backend and do not mirror the new local snapshot model. No migration was applied or database provisioned. Shared legacy market-category names are retained for future use, while the engine only creates and settles supported solve, threshold and exact markets.
