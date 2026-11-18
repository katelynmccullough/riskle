"use client";
import { useEffect, useRef, useState } from "react";
import type {
  PlatformMarket,
  PlatformPosition,
  PlatformSession,
} from "../../lib/platform-client";
import {
  localDate,
  marketAvailable,
  playerSessions,
  wagerPreview,
  terminal,
} from "../../lib/game-experience";
import type { AccountController } from "./use-riskle-account";
import { Avatar, EmptyState, Icon, Pill, Sheet } from "./primitives";
export type WagerReview = {
  market: PlatformMarket;
  stake: number;
  subject: string;
  positionId?: string;
};
export function WagerAmountPicker({
  value,
  onChange,
  balance,
  label = "Your stake",
}: {
  value: number;
  onChange: (value: number) => void;
  balance: number;
  label?: string;
}) {
  return (
    <div className="rk-amount-picker">
      <div className="rk-label-row">
        <label htmlFor="wager-stake">{label}</label>
        <small>{balance.toLocaleString()} coins available</small>
      </div>
      <div className="rk-amount-input">
        <Icon name="coin" size={24} />
        <input
          id="wager-stake"
          aria-label="Stake"
          type="number"
          min={1}
          max={balance}
          step={1}
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span>coins</span>
      </div>
      <div className="rk-presets" aria-label="Stake presets">
        {[10, 25, 50, 100].map((amount) => (
          <button
            key={amount}
            aria-pressed={value === amount}
            onClick={() => onChange(amount)}
            disabled={amount > balance}
          >
            {amount}
          </button>
        ))}
      </div>
    </div>
  );
}
export function GuidedWager({
  account,
  selected,
  onSelect,
  onReview,
}: {
  account: AccountController;
  selected: PlatformSession | undefined;
  onSelect: (id: string) => void;
  onReview: (review: WagerReview) => void;
}) {
  const state = account.state!;
  const [stage, setStage] = useState("prediction"),
    amountHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (stage === "amount") amountHeading.current?.focus();
  }, [stage]);
  const [category, setCategory] = useState("exact"),
    [exact, setExact] = useState(3),
    [stake, setStake] = useState(50),
    [opponent, setOpponent] = useState("");
  const sessions = playerSessions(state).filter(
      (s) => s.puzzle_date === localDate(),
    ),
    markets = state.markets.filter((m) => m.session_id === selected?.id);
  const market = markets.find(
    (m) =>
      m.kind ===
        (category === "finish"
          ? "solve"
          : category === "under"
            ? "threshold"
            : category === "head"
              ? "head_to_head"
              : "exact") &&
      (category !== "exact" ||
        m.target === exact ||
        m.title === `Solve in exactly ${exact}`) &&
      (category !== "head" || m.opponent_id === opponent),
  );
  const available = !!market && marketAvailable(market, selected, account.now),
    preview = market ? wagerPreview(stake, market.odds) : null;
  useEffect(() => {
    setOpponent("");
    setStage("prediction");
  }, [selected?.id]);
  if (!selected)
    return (
      <div className="rk-card">
        <EmptyState
          title="Your puzzle, with a little extra."
          icon="play"
          action={
            <a
              className="rk-button rk-button-primary"
              href="https://www.nytimes.com/games/wordle/index.html"
              target="_blank"
              rel="noreferrer"
            >
              Open Wordle <Icon name="arrow" size={18} />
            </a>
          }
        >
          Open today’s Wordle with Riskle installed. Your live game will show up
          here—no puzzle answers or guessed words shared.
        </EmptyState>
      </div>
    );
  const name =
    state.profiles.find((p) => p.id === selected.user_id)?.display_name ??
    "Your player";
  return (
    <div className="rk-guided">
      <div className="rk-player-section">
        <div className="rk-label-row">
          <h2>Who’s your money on?</h2>
          <span className="rk-step">01</span>
        </div>
        <div className="rk-player-chips" aria-label="Choose a player">
          {sessions.map((s) => {
            const p = state.profiles.find((p) => p.id === s.user_id)!;
            return (
              <button
                key={s.id}
                className={`rk-player-chip ${selected.id === s.id ? "is-selected" : ""}`}
                aria-pressed={selected.id === s.id}
                onClick={() => onSelect(s.id)}
              >
                <Avatar name={p.display_name} url={p.avatar_url} size="small" />
                <span>
                  {p.id === state.profile.id ? "Me" : p.display_name}
                  <small>
                    {terminal(s.status)
                      ? s.status === "completed"
                        ? `${s.guesses}/6 · done`
                        : "6/6 · done"
                      : !s.live ||
                          account.now - Date.parse(s.last_seen) >= 12000
                        ? "Paused"
                        : s.guesses
                          ? `${s.guesses} guesses in`
                          : "Ready to play"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {stage === "prediction" && (
        <section className="rk-card rk-prediction-card">
          <div className="rk-label-row">
            <h2>Make your call.</h2>
            <span className="rk-step">02</span>
          </div>
          <div
            className="rk-prediction-categories"
            aria-label="Prediction category"
          >
            {[
              ["exact", "Exact guesses"],
              ["under", "3 or fewer"],
              ["finish", "Finish it"],
              ["head", "Head-to-head"],
            ].map(([key, label]) => (
              <button
                aria-pressed={category === key}
                key={key}
                onClick={() => setCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {category === "exact" && (
            <>
              <p className="rk-muted">
                How many guesses will{" "}
                {selected.user_id === state.profile.id ? "you" : name} need?
              </p>
              <div className="rk-exact-options" aria-label="Exact guess count">
                {[1, 2, 3, 4, 5, 6].map((n) => {
                  const candidate = markets.find(
                    (m) =>
                      m.kind === "exact" &&
                      (m.target === n || m.title === `Solve in exactly ${n}`),
                  );
                  const closed = !candidate || candidate.status === "closed";
                  return (
                    <button
                      key={n}
                      aria-label={`Exactly ${n} guesses${closed ? " · closed" : ""}`}
                      aria-pressed={exact === n}
                      disabled={closed}
                      onClick={() => setExact(n)}
                    >
                      {n}
                      {closed && <span>Closed</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {category === "under" && (
            <div className="rk-prediction-copy">
              <Icon name="spark" />
              <h3>Three guesses. Big confidence.</h3>
              <p>{name} solves in 3 guesses or fewer.</p>
            </div>
          )}
          {category === "finish" && (
            <div className="rk-prediction-copy">
              <Icon name="check" />
              <h3>Bring it home.</h3>
              <p>{name} solves before all six guesses run out.</p>
            </div>
          )}
          {category === "head" && (
            <div className="rk-head-to-head">
              <p>
                Who will {name} finish ahead of? Ties return your remaining
                stake.
              </p>
              <label>
                Opponent
                <select
                  aria-label="Head-to-head opponent"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                >
                  <option value="">Choose a player</option>
                  {sessions
                    .filter(
                      (s) =>
                        s.user_id !== selected.user_id &&
                        s.puzzle_id === selected.puzzle_id,
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {
                          state.profiles.find((p) => p.id === s.user_id)
                            ?.display_name
                        }
                      </option>
                    ))}
                </select>
              </label>
              {opponent && !market && (
                <button
                  className="rk-button rk-button-secondary"
                  disabled={account.busy}
                  onClick={() =>
                    void account.mutate(
                      "head_to_head",
                      { sessionId: selected.id, opponentId: opponent },
                      "Your head-to-head prediction is ready.",
                    )
                  }
                >
                  Create this prediction
                </button>
              )}
              {sessions.filter(
                (s) =>
                  s.user_id !== selected.user_id &&
                  s.puzzle_id === selected.puzzle_id,
              ).length === 0 && (
                <p className="rk-muted">
                  A league friend needs to share progress on the same puzzle
                  first.
                </p>
              )}
            </div>
          )}
          <div className="rk-quote-strip">
            <div>
              <span>Provisional multiplier</span>
              <strong>
                {market ? `${(market.odds / 100).toFixed(2)}×` : "—"}
              </strong>
            </div>
            <Pill tone={available ? "green" : "neutral"}>
              {market?.status === "closed"
                ? "Closed"
                : available
                  ? "Open for bets"
                  : "Paused"}
            </Pill>
          </div>
          {!available && (
            <p className="rk-muted rk-small">
              {market?.status === "closed"
                ? "That outcome is already decided. Choose another prediction."
                : "Waiting for fresh, shared progress and a current quote."}{" "}
              <button
                className="rk-link"
                disabled={account.busy}
                onClick={() =>
                  void account.mutate(
                    "refresh",
                    {},
                    "Available odds refreshed.",
                  )
                }
              >
                Refresh odds
              </button>
            </p>
          )}
          <button
            className="rk-button rk-button-primary rk-full"
            disabled={!available || account.busy}
            onClick={() => setStage("amount")}
          >
            Choose stake <Icon name="arrow" size={17} />
          </button>
        </section>
      )}
      {stage === "amount" && (
        <section className="rk-card rk-amount-stage">
          <div className="rk-label-row">
            <h2 tabIndex={-1} ref={amountHeading}>
              How much confidence?
            </h2>
            <span className="rk-step">03</span>
          </div>
          <div className="rk-chosen-call">
            <span>
              <strong>{market?.title}</strong>
              <small>
                {name} ·{" "}
                {market ? `${(market.odds / 100).toFixed(2)}×` : "Unavailable"}
              </small>
            </span>
            <button className="rk-link" onClick={() => setStage("prediction")}>
              Change
            </button>
          </div>
          <WagerAmountPicker
            value={stake}
            onChange={setStake}
            balance={state.wallet.balance}
          />
          <div className="rk-payout-preview">
            <span>
              Total return
              <strong>
                {preview?.payout ?? "—"} <small>coins</small>
              </strong>
            </span>
            <span>
              Net profit
              <strong className="rk-positive">
                {preview ? `+${preview.profit}` : "—"}
              </strong>
            </span>
          </div>
          <p className="rk-small rk-muted">
            Maximum loss: {preview?.maxLoss ?? 0} coins. Exposure limits also
            apply.
          </p>
          <button
            className="rk-button rk-button-primary rk-full"
            disabled={
              !available ||
              !preview ||
              stake > state.wallet.balance ||
              account.busy
            }
            onClick={() =>
              market &&
              onReview({ market: { ...market }, stake, subject: name })
            }
          >
            Review prediction <Icon name="arrow" size={18} />
          </button>
        </section>
      )}
      <p className="rk-fineprint">
        Multipliers are a published simulation, not calibrated probabilities. No
        real money or prizes.
      </p>
    </div>
  );
}
export function WagerConfirmation({
  review,
  account,
  onClose,
}: {
  review: WagerReview;
  account: AccountController;
  onClose: () => void;
}) {
  const live = account.state?.markets.find((m) => m.id === review.market.id),
    session = account.state?.sessions.find(
      (s) => s.id === review.market.session_id,
    ),
    preview = wagerPreview(review.stake, review.market.odds);
  const valid =
    !!live &&
    live.quote_id === review.market.quote_id &&
    marketAvailable(live, session, account.now) &&
    !!preview &&
    review.stake <= account.state!.wallet.balance;
  return (
    <Sheet
      title={review.positionId ? "A little more conviction?" : "One last look."}
      onClose={onClose}
      dismissible={!account.busy}
    >
      {account.error && (
        <p className="rk-error" role="alert">
          {account.error}
        </p>
      )}
      <div className="rk-confirm-prediction">
        <span className="rk-confirm-icon">
          <Icon name="bets" size={28} />
        </span>
        <p>
          You think <strong>{review.subject}</strong> will
        </p>
        <h3>{review.market.title.replace(/^Solve/, "solve")}</h3>
        {review.positionId && (
          <p className="rk-small">
            This creates a new, separate position at the current odds. Your
            original bet stays as it was.
          </p>
        )}
      </div>
      <dl className="rk-breakdown">
        <div>
          <dt>Stake</dt>
          <dd>{review.stake} coins</dd>
        </div>
        <div>
          <dt>Locked multiplier</dt>
          <dd>{(review.market.odds / 100).toFixed(2)}×</dd>
        </div>
        <div>
          <dt>Potential total payout</dt>
          <dd>{preview?.payout ?? "—"} coins</dd>
        </div>
        <div className="rk-positive">
          <dt>Potential net profit</dt>
          <dd>+{preview?.profit ?? 0} coins</dd>
        </div>
        <div>
          <dt>Maximum loss</dt>
          <dd>−{review.stake} coins</dd>
        </div>
      </dl>
      {!valid && (
        <p className="rk-error" role="alert">
          This quote changed, expired, or is no longer available. Close this
          sheet to review the latest odds.
        </p>
      )}
      <button
        className="rk-button rk-button-primary rk-full"
        disabled={!valid || account.busy}
        onClick={async () => {
          const result = await account.mutate(
            review.positionId ? "add_stake" : "place",
            {
              ...(review.positionId
                ? { positionId: review.positionId }
                : { marketId: review.market.id }),
              quoteId: review.market.quote_id,
              stake: review.stake,
            },
          );
          if (result) onClose();
        }}
      >
        {account.busy
          ? "Confirming…"
          : review.positionId
            ? "Confirm added stake"
            : "Confirm prediction"}
        <Icon name="check" size={18} />
      </button>
      <button
        className="rk-button rk-button-quiet rk-full"
        disabled={account.busy}
        onClick={onClose}
      >
        Cancel
      </button>
    </Sheet>
  );
}
export type CashoutQuote = {
  id: string;
  position_id: string;
  stake: number;
  remaining_stake: number;
  liability: number;
  credit: number;
  market_version: number;
  expires_at: string;
};
export function CashOutSheet({
  position,
  account,
  onClose,
}: {
  position: PlatformPosition;
  account: AccountController;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(position.remaining_stake),
    [quote, setQuote] = useState<CashoutQuote>();
  const current = account.state?.positions.find((p) => p.id === position.id),
    market = account.state?.markets.find((m) => m.id === position.market_id),
    session = account.state?.sessions.find((s) => s.id === market?.session_id);
  const available =
    !!market &&
    marketAvailable(market, session, account.now) &&
    current?.status === "open";
  const valid =
    !!quote &&
    available &&
    quote.stake === amount &&
    quote.remaining_stake === current?.remaining_stake &&
    quote.market_version === market?.version &&
    Date.parse(quote.expires_at) > account.now;
  return (
    <Sheet
      title="Your exit, your call."
      description="Get a confirmed quote before releasing all or part of your remaining stake."
      onClose={onClose}
      dismissible={!account.busy}
    >
      {account.error && (
        <p className="rk-error" role="alert">
          {account.error}
        </p>
      )}
      <div className="rk-cashout-position">
        <strong>{position.title}</strong>
        <span>
          {position.remaining_stake} stake remaining · {position.stake}{" "}
          originally
        </span>
      </div>
      <label>
        Stake to release
        <input
          aria-label="Stake to cash out"
          type="number"
          min={1}
          max={current?.remaining_stake ?? position.remaining_stake}
          step={1}
          value={amount || ""}
          onChange={(e) => {
            setAmount(Number(e.target.value));
            setQuote(undefined);
          }}
        />
      </label>
      <div className="rk-presets">
        <button
          aria-pressed={
            amount === Math.max(1, Math.floor(position.remaining_stake / 2))
          }
          onClick={() => {
            setAmount(Math.max(1, Math.floor(position.remaining_stake / 2)));
            setQuote(undefined);
          }}
        >
          Half
        </button>
        <button
          aria-pressed={amount === position.remaining_stake}
          onClick={() => {
            setAmount(position.remaining_stake);
            setQuote(undefined);
          }}
        >
          All remaining
        </button>
      </div>
      {quote && (
        <>
          <div className="rk-cashout-offer">
            <span>Server-confirmed return</span>
            <strong>
              {quote.credit}
              <small> coins</small>
            </strong>
            <Pill tone={valid ? "yellow" : "neutral"}>
              {valid
                ? `${Math.max(0, Math.ceil((Date.parse(quote.expires_at) - account.now) / 1000))}s to confirm`
                : "Quote no longer valid"}
            </Pill>
          </div>
          <dl className="rk-breakdown">
            <div>
              <dt>Stake released</dt>
              <dd>{quote.stake}</dd>
            </div>
            <div>
              <dt>
                Realized cash-out{" "}
                {quote.credit - quote.stake >= 0 ? "gain" : "loss"}
              </dt>
              <dd
                className={
                  quote.credit - quote.stake < 0 ? "rk-negative" : "rk-positive"
                }
              >
                {quote.credit - quote.stake >= 0 ? "+" : ""}
                {quote.credit - quote.stake}
              </dd>
            </div>
            <div>
              <dt>Stake left in play</dt>
              <dd>{quote.remaining_stake - quote.stake}</dd>
            </div>
          </dl>
        </>
      )}
      {!available && (
        <p className="rk-error">
          This position is closed or its live market is unavailable. No coins
          have been moved.
        </p>
      )}
      {!quote || !valid ? (
        <button
          className="rk-button rk-button-primary rk-full"
          disabled={
            account.busy ||
            !available ||
            !Number.isSafeInteger(amount) ||
            amount < 1 ||
            amount > (current?.remaining_stake ?? 0)
          }
          onClick={async () => {
            const q = await account.mutate<CashoutQuote>("cashout_quote", {
              positionId: position.id,
              stake: amount,
            });
            if (q) setQuote(q);
          }}
        >
          {account.busy
            ? "Getting quote…"
            : quote
              ? "Get a fresh quote"
              : "Get cash-out quote"}
        </button>
      ) : (
        <button
          className="rk-button rk-button-primary rk-full"
          disabled={account.busy}
          onClick={async () => {
            const result = await account.mutate("cashout", {
              quoteId: quote.id,
            });
            if (result) onClose();
          }}
        >
          {account.busy ? "Confirming…" : "Confirm cash out"}
        </button>
      )}
      <button
        className="rk-button rk-button-quiet rk-full"
        onClick={onClose}
        disabled={account.busy}
      >
        Keep my position
      </button>
    </Sheet>
  );
}
