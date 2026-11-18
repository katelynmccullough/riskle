import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CoinBalance, EventToast, Celebration } from "./primitives";
import { ResultSummary } from "./bets-and-results";
describe("shared experience components", () => {
  it("renders the actual available balance, exposure and daily net separately", () => {
    const html = renderToStaticMarkup(
      <CoinBalance balance={950} exposure={50} profit={0} />,
    );
    expect(html).toContain("950 available coins");
    expect(html).toContain("50 coins in play");
    expect(html).toContain("+0");
  });
  it("shows a neutral refund message without confetti", () => {
    const html = renderToStaticMarkup(
      <EventToast
        event={{
          id: "refund",
          kind: "refund",
          title: "No contest.",
          detail: "50 coins refunded.",
        }}
        dismiss={vi.fn()}
      />,
    );
    expect(html).toContain("50 coins refunded.");
    expect(html).not.toContain("rk-confetti");
  });
  it("keeps a loss readable and dismissible without decorative celebration", () => {
    const html = renderToStaticMarkup(
      <Celebration
        event={{
          id: "loss",
          kind: "lost",
          title: "Ouch.",
          detail: "Stake was already reserved.",
          amount: -50,
        }}
        dismiss={vi.fn()}
        onView={vi.fn()}
      />,
    );
    expect(html).toContain("Losing wager");
    expect(html).toContain("Dismiss result");
    expect(html).not.toContain("rk-confetti");
  });
  it("does not render unavailable metrics as made-up zeros", () => {
    const html = renderToStaticMarkup(
      <ResultSummary
        result={{
          puzzleId: "wordle:1973",
          date: "2026-11-13",
          status: "completed",
          guesses: 4,
          pending: 0,
        }}
        onShare={vi.fn()}
      />,
    );
    expect(html).toContain("4/6");
    expect(html).not.toContain("bets made");
    expect(html).not.toContain("day streak");
    expect(html).not.toContain("Global rank");
  });
});
