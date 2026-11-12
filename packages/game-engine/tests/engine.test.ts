import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDemo,
  createEngine,
  mockAnswer,
  restoreEngine,
  scoreGuess,
} from "../src/index";

const setup = () => createDemo("2026-11-11");
type Engine = ReturnType<typeof setup>;
let sequence = 0;
const bet = (
  e: Engine,
  marketId = "sarah:2026-11-11:under3",
  stake = 100,
  userId = "mara",
  requestId = `request-${++sequence}`,
) =>
  e.placeWager({
    userId,
    marketId,
    stake,
    quoteId: e.markets.get(marketId)!.currentQuote.id,
    requestId,
  });
const guess = (e: Engine, word = "ZZZZZ", player = "sarah") =>
  e.submitGuess(player, word, e.sessions.get(player)!.guesses.length);
const checkLedger = (e: Engine) => {
  for (const p of e.players.values()) {
    expect(p.bankroll).toBe(
      e.walletEvents.get(p.id)!.reduce((a, x) => a + x.amount, 0),
    );
    expect(p.exposure).toBe(
      [...e.wagers.values()]
        .filter((w) => w.userId === p.id && w.status === "open")
        .reduce((a, w) => a + w.remainingStake, 0),
    );
    expect(Number.isSafeInteger(p.bankroll)).toBe(true);
    expect(p.bankroll).toBeGreaterThanOrEqual(0);
  }
};
afterEach(() => vi.useRealTimers());
describe("wallets and exposure", () => {
  it("issues one starting balance and refuses duplicate players", () => {
    const e = setup();
    expect(e.players.get("mara")!.bankroll).toBe(1000);
    expect(() => e.createUser({ id: "mara", username: "Mara" })).toThrow();
    checkLedger(e);
  });
  it("places multiple friend and self wagers with distinct immutable prices", () => {
    const e = setup();
    const original = bet(e);
    const terms = { ...original };
    guess(e);
    const added = e.addStake(
      original.id,
      50,
      e.markets.get(original.marketId)!.currentQuote.id,
      "add",
    );
    expect(original).toEqual(terms);
    expect(added.stake).toBe(50);
    expect(added.expectedPayout).toBe(Math.floor(50 * added.odds));
    expect(added.odds).not.toBe(original.odds);
    expect(e.players.get("mara")).toMatchObject({
      bankroll: 850,
      exposure: 150,
    });
    guess(e, mockAnswer("2026-11-11"));
    expect(e.players.get("mara")!.bankroll).toBe(
      850 + original.expectedPayout + added.expectedPayout,
    );
    checkLedger(e);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid stake %s without a debit",
    (stake) => {
      const e = setup();
      expect(() => bet(e, undefined, stake)).toThrow();
      expect(e.players.get("mara")!.bankroll).toBe(1000);
      checkLedger(e);
    },
  );
  it("rejects insufficient available balance", () => {
    const e = setup();
    expect(() => bet(e, undefined, 1001)).toThrow(/Insufficient/);
    checkLedger(e);
  });
  it("enforces per-subject and per-puzzle exposure on a consistent capital base", () => {
    const e = setup();
    bet(e, undefined, 500);
    expect(() => bet(e, undefined, 1)).toThrow(/Per-player/);
    bet(e, "mara:2026-11-11:solve", 100);
    expect(() => bet(e, "mara:2026-11-11:solve", 1)).toThrow(/Per-puzzle/);
    checkLedger(e);
  });
  it("enforces total exposure across puzzle IDs", () => {
    const e = setup();
    e.createUser({ id: "third", username: "Third" });
    e.players.get("third")!.privacy.shareProgress = true;
    e.addMember("group-chat", "third");
    e.startPuzzle("third", "other-day");
    bet(e, undefined, 500);
    bet(e, "third:other-day:solve", 200);
    expect(() => bet(e, "third:other-day:solve", 1)).toThrow(/Aggregate/);
    checkLedger(e);
  });
  it("deduplicates request IDs, including after restoring a save", () => {
    const e = setup();
    const first = bet(e, undefined, 100, "mara", "same");
    expect(bet(e, undefined, 100, "mara", "same").id).toBe(first.id);
    const restored = restoreEngine(e.snapshot());
    expect(bet(restored, undefined, 100, "mara", "same").id).toBe(first.id);
    expect(restored.wagers.size).toBe(1);
    expect(() => bet(e, undefined, 101, "mara", "same")).toThrow(/reused/);
    checkLedger(restored);
  });
  it("Hold preserves all financial records", () => {
    const e = setup();
    const w = bet(e);
    const before = e.snapshot();
    expect(e.hold(w.id).remainingStake).toBe(100);
    expect(e.snapshot()).toEqual(before);
  });
});
describe("cash-out accounting", () => {
  it("calculates decimal multipliers without floating-point coin loss", () => {
    const e = setup();
    e.markets.get("sarah:2026-11-11:under3")!.currentQuote.multiplier = 2.3;
    const w = bet(e);
    expect(w.expectedPayout).toBe(230);
    expect(e.quoteCashOut(w.id).quote).toBe(90);
    checkLedger(e);
  });

  it("keeps the remainder open, and only settles its remaining liability", () => {
    const e = setup();
    const w = bet(e);
    const original = {
      stake: w.stake,
      odds: w.odds,
      expectedPayout: w.expectedPayout,
    };
    const quote = e.quoteCashOut(w.id, 40);
    const released = Math.floor(w.expectedPayout * 0.4);
    expect(quote.quote).toBe(Math.floor((released / w.odds) * 0.9));
    e.cashOut(quote.id, "cash");
    expect(w.remainingStake).toBe(60);
    expect(w.remainingPayout).toBe(w.expectedPayout - released);
    expect(w.status).toBe("open");
    expect(e.players.get("mara")!.exposure).toBe(60);
    const remaining = w.remainingPayout;
    guess(e, mockAnswer("2026-11-11"));
    expect(w.payout).toBe(quote.quote + remaining);
    expect(e.players.get("mara")!.bankroll).toBe(900 + quote.quote + remaining);
    expect(w).toMatchObject(original);
    expect(w.result).toBe("won");
    checkLedger(e);
  });
  it("fully closes a position, with no later payout or duplicate credit", () => {
    const e = setup();
    const w = bet(e);
    const q = e.quoteCashOut(w.id);
    const result = e.cashOut(q.id, "cash");
    expect(e.cashOut(q.id, "cash")).toEqual(result);
    expect(() => e.cashOut(q.id, "another")).toThrow();
    expect(w).toMatchObject({
      status: "cashout",
      remainingStake: 0,
      remainingPayout: 0,
      result: "cashed-out",
    });
    const balance = e.players.get("mara")!.bankroll;
    guess(e, mockAnswer("2026-11-11"));
    expect(e.players.get("mara")!.bankroll).toBe(balance);
    checkLedger(e);
  });
  it("rejects stale, expired, oversized and fractional cash-out requests", () => {
    const e = setup();
    const w = bet(e);
    for (const amount of [0, -1, 101, 2.5, NaN])
      expect(() => e.quoteCashOut(w.id, amount)).toThrow();
    const stale = e.quoteCashOut(w.id);
    guess(e);
    expect(() => e.cashOut(stale.id, "stale")).toThrow(/changed/);
    const q = e.quoteCashOut(w.id);
    vi.useFakeTimers();
    vi.setSystemTime(q.expiryTs);
    expect(() => e.cashOut(q.id, "expired")).toThrow(/expired/);
    checkLedger(e);
  });
  it("invalidates competing cash-out quotes after partial execution", () => {
    const e = setup();
    const w = bet(e);
    const a = e.quoteCashOut(w.id, 25);
    const b = e.quoteCashOut(w.id, 25);
    e.cashOut(a.id, "a");
    expect(() => e.cashOut(b.id, "b")).toThrow(/changed/);
    checkLedger(e);
  });
  it("handles repeated integer partial exits without negative exposure or excess payout", () => {
    const e = setup();
    const w = bet(e, undefined, 7);
    let paid = 0;
    for (let i = 0; i < 7; i++) {
      const q = e.quoteCashOut(w.id, 1);
      paid += e.cashOut(q.id, `cash-${i}`).payout;
      checkLedger(e);
    }
    expect(w.remainingPayout).toBe(0);
    expect(w.payout).toBe(paid);
    expect(paid).toBeLessThanOrEqual(w.expectedPayout);
  });
  it("preserves quoted exits across a refresh", () => {
    const e = setup();
    const w = bet(e);
    const q = e.quoteCashOut(w.id, 40);
    const restored = restoreEngine(e.snapshot());
    restored.cashOut(q.id, "restored-cash");
    expect(restored.wagers.get(w.id)!.remainingStake).toBe(60);
    checkLedger(restored);
  });
});
describe("markets and puzzle lifecycle", () => {
  it("updates prices after guesses, rejects stale prices and closes impossible outcomes immediately", () => {
    const e = setup();
    const exact = "sarah:2026-11-11:exact1";
    const w = bet(e, exact);
    const market = e.markets.get(w.marketId)!;
    const old = e.markets.get("sarah:2026-11-11:under3")!.currentQuote;
    guess(e);
    expect(w.result).toBe("lost");
    expect(market.status).toBe("closed");
    expect(() => bet(e, exact)).toThrow(/closed/);
    expect(() => e.addStake(w.id, 50, old.id, "add")).toThrow();
    expect(() =>
      e.placeWager({
        userId: "mara",
        marketId: old.marketId,
        stake: 10,
        quoteId: old.id,
        requestId: "stale",
      }),
    ).toThrow(/Stale/);
    checkLedger(e);
  });
  it("settles a missed threshold before puzzle completion and refuses cash-out", () => {
    const e = setup();
    const w = bet(e);
    guess(e);
    guess(e, "YYYYY");
    guess(e, "XXXXX");
    expect(w.result).toBe("lost");
    expect(() => e.quoteCashOut(w.id)).toThrow();
    expect(e.markets.get(w.marketId)!.prediction).toBe("yes");
    expect(e.markets.get(w.marketId)!.outcome).toBe("no");
    checkLedger(e);
  });
  it("settles every winning and losing prediction exactly once on a solve", () => {
    const e = setup();
    const a = bet(e);
    const b = bet(e, "sarah:2026-11-11:exact2", 50);
    guess(e, mockAnswer("2026-11-11"));
    expect(a.result).toBe("won");
    expect(b.result).toBe("lost");
    expect(e.players.get("mara")!.bankroll).toBe(850 + a.expectedPayout);
    const before = e.snapshot();
    expect(e.settleMarket(a.marketId)).toEqual([]);
    expect(e.snapshot()).toEqual(before);
    expect(
      [...e.markets.values()]
        .filter((m) => m.subjectId === "sarah")
        .every((m) => m.status === "closed"),
    ).toBe(true);
    expect(() => guess(e)).toThrow(/finished/);
    checkLedger(e);
  });
  it("loses all surviving wagers after six wrong guesses", () => {
    const e = setup();
    const w = bet(e, "sarah:2026-11-11:solve");
    for (const word of ["ZZZZZ", "YYYYY", "XXXXX", "VVVVV", "QQQQQ", "JJJJJ"])
      guess(e, word);
    expect(e.progressByPlayer.get("sarah")!.status).toBe("lost");
    expect(w.result).toBe("lost");
    expect(e.players.get("mara")!.bankroll).toBe(900);
    expect(e.players.get("mara")!.exposure).toBe(0);
    checkLedger(e);
  });
  it("ignores duplicate and old progress; rejects skipped and inconsistent progress", () => {
    const e = setup();
    guess(e);
    const p = e.progressByPlayer.get("sarah")!;
    const quote = e.markets.get("sarah:2026-11-11:solve")!.currentQuote.id;
    e.recordProgress({ ...p });
    e.recordProgress({
      ...p,
      guessesUsed: 0,
      status: "not_started",
      lastUpdated: p.lastUpdated - 1,
    });
    expect(e.markets.get("sarah:2026-11-11:solve")!.currentQuote.id).toBe(
      quote,
    );
    expect(() =>
      e.recordProgress({
        ...p,
        guessesUsed: 3,
        lastUpdated: p.lastUpdated + 1,
      }),
    ).toThrow(/Out-of-order/);
    expect(() =>
      e.recordProgress({
        ...p,
        guessesUsed: 2,
        status: "completed",
        lastUpdated: p.lastUpdated + 1,
      }),
    ).toThrow(/Inconsistent/);
  });
  it("expires quotes and supports refreshing eligible markets", () => {
    const e = setup();
    const m = e.markets.get("sarah:2026-11-11:under3")!;
    vi.useFakeTimers();
    vi.setSystemTime(m.currentQuote.expiryTs);
    expect(() => bet(e)).toThrow(/expired/);
    e.refreshQuote(m.id);
    expect(bet(e).stake).toBe(100);
  });
  it("enforces friend sharing, membership, unavailable progress and suspensions", () => {
    const e = setup();
    e.players.get("sarah")!.privacy.shareProgress = false;
    expect(() => bet(e)).toThrow(/share/);
    e.players.get("sarah")!.privacy.shareProgress = true;
    e.leagues.get("group-chat")!.members = ["mara"];
    expect(() => bet(e)).toThrow(/league/);
    e.addMember("group-chat", "sarah");
    e.progressByPlayer.get("sarah")!.isLive = false;
    expect(() => bet(e)).toThrow(/unavailable/);
    e.progressByPlayer.get("sarah")!.isLive = true;
    e.markets.get("sarah:2026-11-11:under3")!.status = "suspended";
    expect(() => bet(e)).toThrow(/suspended/);
    checkLedger(e);
  });
  it("rejects invalid and duplicate guesses without changing the game", () => {
    const e = setup();
    expect(() => guess(e, "NO")).toThrow();
    guess(e);
    expect(() => guess(e)).toThrow(/different/);
    expect(() => e.submitGuess("sarah", "YYYYY", 0)).toThrow(/changed/);
    expect(e.sessions.get("sarah")!.guesses).toEqual(["ZZZZZ"]);
  });
  it("scores repeated letters using only available occurrences", () => {
    expect(scoreGuess("AAAAA", "CRANE")).toEqual([
      "absent",
      "absent",
      "correct",
      "absent",
      "absent",
    ]);
  });
});
describe("leagues, rankings and saved state", () => {
  it("creates leagues, adds local friends once and ranks negative profits correctly", () => {
    const e = setup();
    e.createLeague({ id: "second", name: "Second", members: ["mara"] });
    e.addMember("second", "sarah");
    e.addMember("second", "sarah");
    expect(e.leagues.get("second")!.members).toHaveLength(2);
    const w = bet(e);
    expect(
      e.getLeaderboard("second").find((x) => x.userId === "mara")!.dailyProfit,
    ).toBe(0);
    const q = e.quoteCashOut(w.id);
    e.cashOut(q.id, "cash");
    const board = e.getLeaderboard("second");
    expect(board[0].userId).toBe("sarah");
    expect(board[1].dailyProfit).toBe(q.quote - w.stake);
    expect(e.leagueActivity.get("second")!.length).toBeGreaterThan(0);
    checkLedger(e);
  });
  it("round-trips complete games and rejects corrupt wallets without resetting them", () => {
    const e = setup();
    bet(e);
    guess(e, mockAnswer("2026-11-11"));
    const snapshot = e.snapshot();
    const restored = restoreEngine(
      JSON.parse(JSON.stringify(snapshot)) as unknown,
    );
    expect(restored.snapshot()).toEqual(snapshot);
    checkLedger(restored);
    const corrupt = e.snapshot();
    corrupt.players[0].bankroll++;
    expect(() => restoreEngine(corrupt)).toThrow(/wallet/);
    expect(() => restoreEngine({ version: 99 })).toThrow(/Unsupported/);
  });
  it("creates no external accounts or external state", () => {
    expect(createEngine().players.size).toBe(0);
  });
});
