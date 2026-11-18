import { describe, expect, it } from "vitest";
import {
  fixtureState,
  fixturePosition,
  userId,
  friendId,
  privateId,
  sessionId,
} from "./fixtures/platform-state";
import { confirmedEvents, checkpoint } from "../apps/web/lib/confirmed-events";
import {
  dailySummary,
  marketAvailable,
  playerSessions,
  shareText,
  shareSvg,
  wagerPreview,
} from "../apps/web/lib/game-experience";
describe("guided wager math and privacy", () => {
  it("distinguishes total payout, net profit and reserved loss using integer odds", () => {
    expect(wagerPreview(50, 450)).toEqual({
      stake: 50,
      payout: 225,
      profit: 175,
      maxLoss: 50,
    });
    expect(wagerPreview(100, 230)?.payout).toBe(230);
    for (const n of [0, -1, 1.5, NaN, Infinity])
      expect(wagerPreview(n, 450)).toBeNull();
  });
  it("filters private progress even if an unexpected response includes it", () => {
    const s = fixtureState();
    expect(playerSessions(s).map((p) => p.user_id)).toEqual([userId, friendId]);
    expect(playerSessions(s).some((p) => p.user_id === privateId)).toBe(false);
    s.profiles.find((p) => p.id === friendId)!.share_progress = false;
    expect(playerSessions(s).map((p) => p.user_id)).toEqual([userId]);
  });
  it("closes stale, suspended and completed predictions", () => {
    const s = fixtureState(),
      m = s.markets[0],
      session = s.sessions[0],
      now = Date.now();
    expect(marketAvailable(m, session, now)).toBe(true);
    expect(marketAvailable({ ...m, status: "closed" }, session, now)).toBe(
      false,
    );
    expect(marketAvailable({ ...m, eligible: false }, session, now)).toBe(
      false,
    );
    expect(marketAvailable(m, { ...session, status: "completed" }, now)).toBe(
      false,
    );
    expect(
      marketAvailable(
        m,
        { ...session, last_seen: new Date(now - 13000).toISOString() },
        now,
      ),
    ).toBe(false);
  });
  it("omits daily totals when the closed history is potentially truncated", () => {
    const s = fixtureState();
    s.positions = Array.from({ length: 200 }, () => ({
      ...fixturePosition(s),
      status: "won",
    }));
    const summary = dailySummary(
      s,
      s.sessions[0],
      undefined,
      [],
      "",
      false,
      s.sessions[0].puzzle_date,
    );
    expect(summary.betCount).toBeUndefined();
    expect(summary.profit).toBeUndefined();
  });
  it("builds optional share cards from an explicit safe whitelist", () => {
    const summary = {
      puzzleId: "wordle:1973",
      date: "2026-11-13",
      status: "completed",
      guesses: 4,
      profit: 175,
      rank: 2,
      rankLabel: "League rank",
      pending: 0,
      guessedWords: ["SECRET"],
      answer: "HIDDEN",
    };
    const text = shareText(summary),
      svg = shareSvg(summary);
    expect(text).toContain("Wordle: 4/6");
    expect(text).toContain("Daily profit: +175");
    expect(text).toContain("League rank: #2");
    expect(text + svg).not.toMatch(/SECRET|HIDDEN|guessedWords|answer/);
  });
});
describe("confirmed outcome feedback", () => {
  it("never celebrates historical or first-load settlements", () => {
    const s = fixtureState();
    s.ledger.push({
      id: 2,
      kind: "settlement_yes",
      amount: 225,
      created_at: new Date().toISOString(),
    });
    expect(confirmedEvents(undefined, s).events).toEqual([]);
    expect(confirmedEvents(checkpoint(fixtureState()), s, true).events).toEqual(
      [],
    );
  });
  it("does not treat reserving a stake as a wager loss", () => {
    const s = fixtureState(),
      before = checkpoint(s),
      p = fixturePosition(s);
    s.positions = [p];
    s.wallet = { balance: 950, exposure: 50 };
    s.ledger.push({
      id: 2,
      kind: "stake",
      amount: -50,
      position_id: p.id,
      created_at: new Date().toISOString(),
    });
    expect(confirmedEvents(before, s).events.map((e) => e.kind)).toEqual([
      "placed",
    ]);
  });
  it("announces a confirmed win once and distinguishes profit from returned coins", () => {
    const s = fixtureState(),
      p = fixturePosition(s);
    s.positions = [p];
    s.wallet = { balance: 950, exposure: 50 };
    s.ledger.push({
      id: 2,
      kind: "stake",
      amount: -50,
      position_id: p.id,
      created_at: new Date().toISOString(),
    });
    const before = checkpoint(s);
    Object.assign(p, {
      status: "won",
      remaining_stake: 0,
      remaining_payout: 0,
      paid: 225,
    });
    s.wallet = { balance: 1175, exposure: 0 };
    s.ledger.push({
      id: 3,
      kind: "settlement_yes",
      amount: 225,
      position_id: p.id,
      created_at: new Date().toISOString(),
    });
    const result = confirmedEvents(before, s);
    expect(result.events[0]).toMatchObject({
      kind: "won",
      amount: 175,
      returned: 225,
      positionId: p.id,
    });
    expect(confirmedEvents(result.next, s).events).toEqual([]);
  });
  it("requires a ledger settlement before showing a calculated winning position", () => {
    const s = fixtureState(),
      before = checkpoint(s);
    s.positions = [
      { ...fixturePosition(s), status: "won", paid: 225, remaining_stake: 0 },
    ];
    expect(
      confirmedEvents(before, s).events.some((e) => e.kind === "won"),
    ).toBe(false);
  });
  it("shows a losing result without inventing another wallet debit", () => {
    const s = fixtureState(),
      p = fixturePosition(s);
    s.positions = [p];
    s.wallet = { balance: 950, exposure: 50 };
    s.ledger.push({
      id: 2,
      kind: "stake",
      amount: -50,
      position_id: p.id,
      created_at: new Date().toISOString(),
    });
    const before = checkpoint(s);
    Object.assign(p, {
      status: "lost",
      remaining_stake: 0,
      remaining_payout: 0,
    });
    s.wallet.exposure = 0;
    s.ledger.push({
      id: 3,
      kind: "settlement_no",
      amount: 0,
      position_id: p.id,
      created_at: new Date().toISOString(),
    });
    const result = confirmedEvents(before, s);
    expect(result.events[0]).toMatchObject({
      kind: "lost",
      amount: -50,
      returned: 0,
    });
    expect(s.wallet.balance).toBe(950);
    expect(confirmedEvents(result.next, s).events).toEqual([]);
  });
  it("keeps refunds neutral and cash-out losses separate from wager losses", () => {
    const s = fixtureState(),
      p = fixturePosition(s);
    s.positions = [p];
    const before = checkpoint(s);
    Object.assign(p, {
      status: "cashout",
      remaining_stake: 0,
      remaining_payout: 0,
      paid: 45,
    });
    s.ledger.push({
      id: 2,
      kind: "cashout",
      amount: 45,
      position_id: p.id,
      created_at: new Date().toISOString(),
    });
    expect(confirmedEvents(before, s).events[0]).toMatchObject({
      kind: "cashout",
      amount: -5,
    });
    s.ledger[1].kind = "settlement_void";
    expect(confirmedEvents(before, s).events[0].kind).toBe("refund");
  });
  it("never rewinds acknowledgement on a stale response or refresh", () => {
    const s = fixtureState(),
      saved = { ...checkpoint(s), lastLedger: 30 };
    expect(confirmedEvents(saved, s, true).next.lastLedger).toBe(30);
    expect(confirmedEvents(saved, s).events).toEqual([]);
  });
  it("only emits friend completion for opted-in progress", () => {
    const s = fixtureState(),
      before = checkpoint(s);
    s.sessions.find((p) => p.user_id === friendId)!.status = "completed";
    expect(
      confirmedEvents(before, s).events.some(
        (e) => e.kind === "friend_finished",
      ),
    ).toBe(true);
    s.profiles.find((p) => p.id === friendId)!.share_progress = false;
    expect(
      confirmedEvents(before, s).events.some(
        (e) => e.kind === "friend_finished",
      ),
    ).toBe(false);
  });
  it("uses backend history profit and rank instead of inventing daily performance", () => {
    const s = fixtureState(),
      own = s.sessions.find((p) => p.id === sessionId)!;
    const history = {
      days: [{ ...own, profit: 123, daily_rank: 4 }],
      stats: { games: 1, wins: 1, average: 3, streak: 1, longestStreak: 1 },
    };
    expect(
      dailySummary(s, own, history, [], "", false, own.puzzle_date),
    ).toMatchObject({ profit: 123, rank: 4, streak: 1 });
  });
});
