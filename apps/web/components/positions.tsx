"use client";
import { useState } from "react";
import type { WagerPosition } from "@riskle/shared";
export function Stat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className={`stat panel ${accent ? "accent" : ""}`}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <p className="muted small">{note}</p>
    </div>
  );
}
export function Position({
  wager: w,
  title,
  busy,
  addAmount,
  onHold,
  onAdd,
  onCash,
}: {
  wager: WagerPosition;
  title: string;
  busy: boolean;
  addAmount: number;
  onHold: () => void;
  onAdd: () => void;
  onCash: (stake: number) => void;
}) {
  const [portion, setPortion] = useState(25);
  return (
    <article className="position">
      <div className="section-heading">
        <div>
          <strong>
            {w.subjectLabel} · {title}
          </strong>
          <p className="muted small">
            Original {w.stake} at {w.odds}× · return {w.expectedPayout} ·{" "}
            {w.id.slice(-8)}
          </p>
        </div>
        <span className="pill">{w.status === "open" ? "Open" : w.result}</span>
      </div>
      <p>
        Remaining stake <strong>{w.remainingStake}</strong> · potential
        remaining return <strong>{w.remainingPayout}</strong> · paid so far{" "}
        <strong>{w.payout}</strong>
        {w.status !== "open" && (
          <>
            {" "}
            · net{" "}
            <strong>
              {w.payout - w.stake >= 0 ? "+" : ""}
              {w.payout - w.stake}
            </strong>
          </>
        )}
      </p>
      {w.status === "open" && (
        <div className="position-actions">
          <button disabled={busy} onClick={onHold}>
            Hold
          </button>
          <button disabled={busy} onClick={onAdd}>
            Add {addAmount} stake
          </button>
          <button disabled={busy} onClick={() => onCash(w.remainingStake)}>
            Full cash out
          </button>
          <label>
            Stake to release
            <input
              aria-label={`Partial stake ${w.id.slice(-8)}`}
              type="number"
              min={1}
              max={w.remainingStake}
              step={1}
              value={portion}
              onChange={(e) => setPortion(Number(e.target.value))}
            />
          </label>
          <button
            disabled={
              busy ||
              portion <= 0 ||
              portion > w.remainingStake ||
              !Number.isSafeInteger(portion)
            }
            onClick={() => onCash(portion)}
          >
            Quote partial
          </button>
        </div>
      )}
    </article>
  );
}
