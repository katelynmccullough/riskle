"use client";
import { useState } from "react";
import type { PlatformPosition } from "../../lib/platform-client";
import {
  marketAvailable,
  positionNet,
  shareSvg,
  shareText,
  type DailySummary,
} from "../../lib/game-experience";
import type { AccountController } from "./use-riskle-account";
import {
  Avatar,
  EmptyState,
  Icon,
  Pill,
  SectionTitle,
  Sheet,
} from "./primitives";
import { WagerAmountPicker, type WagerReview } from "./wager-flow";
export function ActiveBetCard({
  position: p,
  account,
  onAdd,
  onCash,
}: {
  position: PlatformPosition;
  account: AccountController;
  onAdd: (position: PlatformPosition) => void;
  onCash: (position: PlatformPosition) => void;
}) {
  const state = account.state!,
    subject = state.profiles.find((profile) => profile.id === p.subject_id),
    market = state.markets.find((m) => m.id === p.market_id),
    session = state.sessions.find((s) => s.id === market?.session_id),
    available = !!market && marketAvailable(market, session, account.now),
    open = p.status === "open";
  const label: Record<string, string> = {
    open: "In play",
    won: "Won",
    lost: "Lost",
    cashout: "Cashed out",
    void: "Refunded",
  };
  return (
    <article
      className={`rk-bet-card rk-bet-${p.status}`}
      data-position-id={p.id}
    >
      <div className="rk-bet-heading">
        <Avatar
          name={subject?.display_name ?? "Player"}
          url={subject?.avatar_url}
          size="small"
        />
        <div>
          <span>
            {subject?.display_name ?? "Player"}
            <small> · {p.puzzle_date}</small>
          </span>
          <h3>{p.title}</h3>
        </div>
        <Pill
          tone={
            p.status === "won"
              ? "green"
              : p.status === "lost"
                ? "coral"
                : p.status === "cashout"
                  ? "yellow"
                  : "neutral"
          }
        >
          {label[p.status] ?? p.status}
        </Pill>
      </div>
      <div className="rk-bet-stats">
        <span>
          Original stake<strong>{p.stake}</strong>
        </span>
        <span>
          Locked odds<strong>{(p.odds / 100).toFixed(2)}×</strong>
        </span>
        <span>
          {open ? "Potential return" : "Coins returned"}
          <strong>{open ? p.remaining_payout : p.paid}</strong>
        </span>
      </div>
      {open ? (
        <>
          <p className="rk-position-remainder">
            {p.remaining_stake} stake still in play
            {p.remaining_stake !== p.stake && (
              <>
                {" "}
                · {p.paid} coins returned so far · realized{" "}
                {positionNet(p) >= 0 ? "+" : ""}
                {positionNet(p)}
              </>
            )}
          </p>
          <div className="rk-bet-actions">
            <button
              className="rk-button rk-button-quiet"
              disabled={account.busy}
              onClick={() =>
                void account.mutate<PlatformPosition>(
                  "hold",
                  { positionId: p.id },
                  "Holding this position. Your coins stay in play.",
                )
              }
            >
              Hold
            </button>
            <button
              className="rk-button rk-button-secondary"
              disabled={account.busy || !available}
              onClick={() => onAdd(p)}
            >
              Add stake
            </button>
            <button
              className="rk-button rk-button-primary"
              disabled={account.busy || !available}
              onClick={() => onCash(p)}
            >
              Cash out
            </button>
          </div>
          {!available && (
            <p className="rk-small rk-muted">
              <Icon name="pause" size={13} /> Live actions paused. Waiting for a
              fresh, eligible quote.
            </p>
          )}
        </>
      ) : (
        <div
          className={`rk-bet-net ${positionNet(p) < 0 ? "rk-negative" : "rk-positive"}`}
        >
          <span>
            {p.status === "void" ? "Refund outcome" : "Total realized result"}
          </span>
          <strong>
            {positionNet(p) >= 0 ? "+" : ""}
            {positionNet(p)} coins
          </strong>
        </div>
      )}
    </article>
  );
}
export function BetsView({
  account,
  onAdd,
  onCash,
  onPlay,
}: {
  account: AccountController;
  onAdd: (p: PlatformPosition) => void;
  onCash: (p: PlatformPosition) => void;
  onPlay: () => void;
}) {
  const [filter, setFilter] = useState("open"),
    positions = account.state!.positions.filter((p) =>
      filter === "open" ? p.status === "open" : p.status !== "open",
    );
  return (
    <>
      <SectionTitle eyebrow="Your calls" title="A little skin in the game." />
      <div className="rk-segmented" aria-label="Bet history">
        <button
          aria-pressed={filter === "open"}
          onClick={() => setFilter("open")}
        >
          In play{" "}
          <span>
            {account.state!.positions.filter((p) => p.status === "open").length}
          </span>
        </button>
        <button
          aria-pressed={filter === "closed"}
          onClick={() => setFilter("closed")}
        >
          Settled
        </button>
      </div>
      {positions.length ? (
        <div className="rk-bet-list">
          {positions.map((p) => (
            <ActiveBetCard
              key={p.id}
              position={p}
              account={account}
              onAdd={onAdd}
              onCash={onCash}
            />
          ))}
        </div>
      ) : (
        <div className="rk-card">
          <EmptyState
            icon="bets"
            title={
              filter === "open"
                ? "A clean slate. A good feeling."
                : "Your story starts with a call."
            }
            action={
              <button className="rk-button rk-button-primary" onClick={onPlay}>
                Make a prediction <Icon name="arrow" size={16} />
              </button>
            }
          >
            {filter === "open"
              ? "No coins in play right now. Find a prediction you believe in."
              : "Wins, losses, and exits will land here after they’re confirmed."}
          </EmptyState>
        </div>
      )}
      <p className="rk-fineprint">
        Every original stake and multiplier stays locked. All open bets and the
        latest 200 closed bets are shown.
      </p>
    </>
  );
}
export function AddStakeSheet({
  position,
  account,
  onReview,
  onClose,
}: {
  position: PlatformPosition;
  account: AccountController;
  onReview: (r: WagerReview) => void;
  onClose: () => void;
}) {
  const [stake, setStake] = useState(50),
    market = account.state?.markets.find((m) => m.id === position.market_id),
    session = account.state?.sessions.find((s) => s.id === market?.session_id),
    available = !!market && marketAvailable(market, session, account.now);
  return (
    <Sheet
      title="Feeling even more confident?"
      description="Your original position stays locked. This stake becomes a separate bet at today’s current multiplier."
      onClose={onClose}
    >
      <div className="rk-mini-position">
        <strong>{position.title}</strong>
        <span>
          Original: {position.stake} coins at {(position.odds / 100).toFixed(2)}
          ×
        </span>
        <span>
          New multiplier:{" "}
          {market ? `${(market.odds / 100).toFixed(2)}×` : "Unavailable"}
        </span>
      </div>
      <WagerAmountPicker
        value={stake}
        onChange={setStake}
        balance={account.state!.wallet.balance}
        label="Additional stake"
      />
      {!available && (
        <p className="rk-error">This market is currently unavailable.</p>
      )}
      <button
        className="rk-button rk-button-primary rk-full"
        disabled={
          !available ||
          !Number.isSafeInteger(stake) ||
          stake < 1 ||
          stake > account.state!.wallet.balance ||
          account.busy
        }
        onClick={() => {
          if (market)
            onReview({
              market: { ...market },
              stake,
              positionId: position.id,
              subject:
                account.state!.profiles.find(
                  (p) => p.id === position.subject_id,
                )?.display_name ?? "Your player",
            });
        }}
      >
        Review added stake <Icon name="arrow" size={16} />
      </button>
    </Sheet>
  );
}
export function ResultSummary({
  result,
  onShare,
}: {
  result: DailySummary;
  onShare: () => void;
}) {
  const won = result.status === "completed";
  return (
    <section
      className={`rk-results rk-card ${won ? "rk-results-win" : "rk-results-loss"}`}
    >
      <div className="rk-results-art" aria-hidden="true">
        <Icon name={won ? "spark" : "bets"} size={40} />
      </div>
      <Pill tone={won ? "green" : "coral"}>
        {won ? "Puzzle complete" : "Six guesses. One plot twist."}
      </Pill>
      <h2>{won ? "That’s a wrap." : "Tomorrow gets a rematch."}</h2>
      <p>
        Wordle #{result.puzzleId.replace(/^wordle:/, "")} ·{" "}
        {won ? `${result.guesses}/6` : "X/6"} · {result.date}
      </p>
      {result.profit !== undefined && (
        <div
          className={`rk-result-profit ${result.profit < 0 ? "rk-negative" : "rk-positive"}`}
        >
          {result.profit >= 0 ? "+" : ""}
          {result.profit}
          <span> net coins today</span>
        </div>
      )}
      <div className="rk-results-metrics">
        {result.betCount !== undefined && (
          <span>
            <strong>{result.betCount}</strong>bets made
          </span>
        )}
        {result.rank && (
          <span>
            <strong>#{result.rank}</strong>
            {result.rankLabel}
          </span>
        )}
        {result.streak !== undefined && (
          <span>
            <strong>{result.streak}</strong>day streak
          </span>
        )}
      </div>
      {(result.biggestWin !== undefined ||
        result.biggestLoss !== undefined) && (
        <div className="rk-results-highlights">
          {result.biggestWin !== undefined && (
            <p>
              Best call{" "}
              <strong
                className={
                  result.biggestWin < 0 ? "rk-negative" : "rk-positive"
                }
              >
                {result.biggestWin >= 0 ? "+" : ""}
                {result.biggestWin} coins
              </strong>
            </p>
          )}
          {result.biggestLoss !== undefined && (
            <p>
              Costliest miss{" "}
              <strong className="rk-negative">
                {result.biggestLoss} coins
              </strong>
            </p>
          )}
        </div>
      )}
      {result.pending > 0 && (
        <p className="rk-small">
          {result.pending} {result.pending === 1 ? "bet is" : "bets are"} still
          waiting on another player. Today’s net can change.
        </p>
      )}
      <button
        className="rk-button rk-button-secondary rk-full"
        onClick={onShare}
      >
        <Icon name="share" size={17} />
        Share your day
      </button>
      <p className="rk-fineprint">
        Browser-observed result · provisional rankings
      </p>
    </section>
  );
}
export function ShareResultSheet({
  result,
  onClose,
  onNotice,
  onError,
}: {
  result: DailySummary;
  onClose: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText(result));
      onNotice("Your result is copied. Brag responsibly.");
    } catch {
      onError(
        "Clipboard access wasn’t available. You can download the card instead.",
      );
    }
  }
  async function download() {
    try {
      const svg = new Blob([shareSvg(result)], { type: "image/svg+xml" }),
        url = URL.createObjectURL(svg);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1080;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Unable to create a share card.");
        context.drawImage(img, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("Unable to export your card.")),
            "image/png",
          ),
        );
        const png = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = png;
        link.download = `riskle-${result.date}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(png), 1000);
        onNotice("Your share card is ready.");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <Sheet
      title="A little friendly bragging."
      description="Only your result and virtual coin totals. No guessed words, tile colors, or puzzle answer."
      onClose={onClose}
    >
      <div className="rk-share-preview" aria-label="Result share card">
        <span className="rk-share-wordmark">riskle.</span>
        <p>Wordle #{result.puzzleId.replace(/^wordle:/, "")}</p>
        <strong>
          {result.status === "completed" ? result.guesses : "X"}/6
        </strong>
        {result.profit !== undefined && (
          <p>
            {result.profit >= 0 ? "+" : ""}
            {result.profit} coins today
          </p>
        )}
        {result.rank && (
          <p>
            {result.rankLabel} #{result.rank}
          </p>
        )}
        <small>Your Wordle just got competitive.</small>
      </div>
      <div className="rk-share-actions">
        <button
          className="rk-button rk-button-primary"
          onClick={() => void copy()}
        >
          Copy result
        </button>
        <button
          className="rk-button rk-button-secondary"
          onClick={() => void download()}
        >
          Download card
        </button>
      </div>
      {typeof navigator.share === "function" && (
        <button
          className="rk-button rk-button-quiet rk-full"
          onClick={() =>
            void navigator
              .share({ text: shareText(result), title: "My Riskle day" })
              .catch((e) => {
                if (e.name !== "AbortError")
                  onError("Sharing wasn’t available. Try copying your result.");
              })
          }
        >
          <Icon name="share" size={16} />
          Share…
        </button>
      )}
    </Sheet>
  );
}
