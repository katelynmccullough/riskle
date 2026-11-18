# Riskle architecture

Riskle is a pnpm workspace with a Chrome extension, a Next.js dashboard, and a standalone browser simulation. The extension and dashboard use the same Supabase project and shared platform client.

## Live companion

| Boundary | Responsibility |
| --- | --- |
| Wordle content script | Observes visible puzzle identity and evaluated tile states. Emits puzzle ID, guess count, and outcome without sending guesses or answers. |
| Extension service worker | Validates the sender, frame, and message shape. Keeps the authenticated session in trusted extension storage and forwards accepted observations. |
| React side panel and web dashboard | Display account state and submit commands for predictions, exits, and league participation. Render wallet changes from confirmed ledger entries. |
| Supabase and PostgreSQL | Authenticate players, enforce row-level security, and process commands in transactions. Request receipts deduplicate retries, and private league subscriptions are scoped by membership. |

The observer uses a MutationObserver and a heartbeat while the puzzle page is visible. A first observation of an already played board is history-only. Stale progress suspends markets. An unresolved event gap can mark the session disputed and void unsettled positions at their remaining original cost. These rules keep the UI from presenting stale quotes and the backend from settling incomplete event sequences. Browser-reported outcomes remain provisional.

Original position terms stay fixed. Additional stake creates a separate position. Partial exits use a server quote and reduce the remaining exposure proportionally. Transactional ledger entries reconcile stakes, payouts, exits, and refunds. The interface uses IndexedDB acknowledgements so refreshes and same-origin tabs do not replay confirmed notifications.

## Standalone demo

The `/demo` route uses the TypeScript game engine with fictional players and a mock puzzle. A single IndexedDB transaction restores the latest snapshot, executes each command, and saves the result. BroadcastChannel keeps other tabs up to date. The demo runs entirely in the browser with independent balances and history.

## Further reading

- [Backend setup and schema](PHASE3_SETUP.md)
- [Game rules](GAME_RULES.md)
- [Verification results](verification/PHASE4_RESULTS.md)
