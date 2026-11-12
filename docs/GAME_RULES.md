# Local demo rules

All coins are fictional, with no purchases, transfers, prizes, redemption or real-money value.

## Puzzle

Each new test player receives 1,000 coins and a six-guess original mock puzzle. Its five-letter answer is deterministic from the save's UTC-date puzzle identifier. It is not the Wordle answer. Any five letters are accepted; repeated guesses are rejected. Green/yellow/gray feedback accounts for duplicate letters. The sixth incorrect guess loses the puzzle; a matching guess completes it. Progress and all resulting market changes commit in one local save.

The day is pinned for repeatable testing. Existing players cannot replay a finished puzzle in that save. To start fresh, remove only the `riskle.demo.v1` storage entry; see TESTING.md. There are no weekly seasons or automatic day rollover.

## Markets and provisional multipliers

Available predictions are solve within six, solve in three or fewer, and solve in exactly each of one through six guesses. These can be self or friend wagers. Friend wagers require shared league membership and the subject's explicit live-progress opt-in. This setting defaults off for new players. The seeded mock friend Sarah starts opted in.

Let `g` be guesses already used. The toy model gives equal weight to each remaining solve count and one loss outcome:

- Remaining outcomes `n = 7 - g`.
- Favorable outcomes `k = 6 - g` for solve; `3 - g` for the threshold; `1` for an eligible exact guess.
- Multiplier `max(1.05, floor(90 × n / k) / 100)`.

These are simulation weights, not calibrated probabilities or player history. Each quote includes an ID, market version, creation time and two-minute expiration. Every accepted guess refreshes eligible markets. A refresh invalidates earlier quotes even if their multipliers happen to match. Refreshing a quote never reopens a decided market.

After an unsuccessful guess at an exact target, that exact market closes and loses immediately. The threshold closes and loses after the third unsuccessful guess. All remaining markets close when the puzzle is solved or lost. Settlement is idempotent and cannot be supplied an arbitrary winning outcome.

## Wagers and exposure

A stake is a positive safe integer. Each placement debits the available wallet and increases exposure by that stake. Payouts include returned stake. New positions preserve their original stake, odds, prediction, quote, version, puzzle ID and timestamp. **Add Stake creates a separate position containing only the added amount at the currently quoted odds.** Hold keeps the existing position unchanged and reports its remaining stake and potential return.

All new placements, including added stakes, require available funds, a fresh matching quote, an eligible live market, and these limits:

- Total outstanding stake ≤ 70% of available bankroll + outstanding stake.
- Outstanding stake on any one subject ≤ 50% of the same capital base.
- Outstanding stake on any one puzzle ID ≤ 60% of the same capital base.

The capital base is computed before the new stake is debited. Limits apply to remaining stake after partial exits. Placement/cash-out request IDs prevent replaying the same request; different requests can deliberately place multiple wagers on the same market. Changed inputs cannot reuse a request ID.

## Partial and full cash-outs

Cash-outs require an open position and an eligible live market. They are unavailable after completion, market resolution, suspension, lost progress availability, expired quotes, or revoked friend eligibility. Cash-out quotes expire after 15 seconds (or earlier if the market quote expires) and are invalidated by a changed market version or position remainder.

For a requested release of `s` original stake out of remaining stake `S`, with remaining potential payout `L`:

1. Released liability `R = floor(L × s / S)`, or all of `L` when releasing all of `S`.
2. Cash-out credit `C = floor(R × 90 / current multiplier in hundredths)`.
3. Credit `C`, reduce exposure and remaining stake by `s`, and reduce remaining potential payout by `R`.

Integer arithmetic is used for coin calculations. A partial exit leaves the rest open. The final full exit consumes any rounding remainder. The original wager terms never change. A cash-out credit is final; a later winning outcome pays only the remaining liability. A losing remainder receives zero. A fully cashed-out position never receives another settlement payout. Net position result is total credits received minus its original stake.

Example before any guesses: stake 100 on solve ≤3 at 2.10× has potential return 210. Release 40 stake: liability released 84, cash-out credit 36, remaining stake 60, remaining potential return 126. If the subject later wins the prediction, total credit is 162 and the position's net profit is 62. From a 1,000 starting balance with no other positions, available coins end at 1,062. If the remainder loses, available coins end at 936.

## Ledger and rankings

Starting credits, stake debits, partial/full exits, winning payouts and zero-credit losing settlements all have ledger entries. Invariants: available bankroll equals the sum of ledger amounts; exposure equals all open remaining stakes. No negative wallets or fractional coins are allowed.

Demo profit = available bankroll + remaining original stake − starting credits. Open stakes are valued at cost, not speculative cash-out value. This prevents a new wager from falsely appearing as an immediate loss; realized losses remain negative. Rankings sort by profit descending, equity descending, then name and ID. The UI labels this as demo profit; legacy daily/weekly fields share the same single-day calculation and do not imply implemented seasons.
