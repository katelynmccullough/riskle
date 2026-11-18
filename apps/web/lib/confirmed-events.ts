import type { PlatformState } from "./platform-client";
export type FeedbackKind =
  | "placed"
  | "won"
  | "lost"
  | "cashout"
  | "refund"
  | "friend_finished"
  | "new_day"
  | "balance"
  | "suspended"
  | "rank";
export type FeedbackEvent = {
  id: string;
  kind: FeedbackKind;
  title: string;
  detail: string;
  positionId?: string;
  amount?: number;
  returned?: number;
};
export type EventCheckpoint = {
  lastLedger: number;
  sessions: Record<string, { status: string; date: string }>;
  positionNet: Record<string, number>;
  balance: number;
  suspended: boolean;
};
export function checkpoint(state: PlatformState): EventCheckpoint {
  return {
    lastLedger: Math.max(0, ...state.ledger.map((l) => l.id)),
    sessions: Object.fromEntries(
      state.sessions.map((s) => [
        s.id,
        { status: s.status, date: s.puzzle_date },
      ]),
    ),
    positionNet: Object.fromEntries(
      state.positions.map((p) => [p.id, p.paid - p.stake + p.remaining_stake]),
    ),
    balance: state.wallet.balance,
    suspended: state.sessions.some(
      (s) =>
        s.user_id === state.profile.id &&
        !["completed", "lost"].includes(s.status) &&
        (!s.live || Date.now() - Date.parse(s.last_seen) >= 12000),
    ),
  };
}
/** Pure reducer: only persisted, server-returned ledger entries can produce a wager outcome. */
export function confirmedEvents(
  previous: EventCheckpoint | undefined,
  state: PlatformState,
  bootstrap = false,
): { events: FeedbackEvent[]; next: EventCheckpoint } {
  const next = checkpoint(state);
  if (previous && next.lastLedger < previous.lastLedger)
    return { events: [], next: previous };
  if (!previous || bootstrap) return { events: [], next };
  const events: FeedbackEvent[] = [];
  for (const entry of [...state.ledger].sort((a, b) => a.id - b.id)) {
    if (entry.id <= previous.lastLedger) continue;
    const position = state.positions.find((p) => p.id === entry.position_id);
    const name = position
      ? state.profiles.find((p) => p.id === position.subject_id)?.display_name
      : undefined;
    const net = position ? position.paid - position.stake : undefined;
    const base = {
      id: `ledger:${entry.id}`,
      positionId: position?.id,
      returned: entry.amount,
    };
    if (entry.kind === "stake")
      events.push({
        ...base,
        kind: "placed",
        title: "You’re in.",
        detail: `${-entry.amount} coins reserved for your prediction.`,
        amount: -entry.amount,
      });
    else if (entry.kind === "settlement_yes")
      events.push({
        ...base,
        kind: "won",
        title: entry.id % 2 ? "You called it." : "Big brain move.",
        detail: `${name ?? "Your player"} came through. ${entry.amount} coins returned.`,
        amount: net,
      });
    else if (entry.kind === "settlement_no")
      events.push({
        ...base,
        kind: "lost",
        title: entry.id % 2 ? "Ouch." : "Well, that happened.",
        detail:
          "That prediction didn’t land. Your stake was already reserved; no extra coins were deducted.",
        amount: net,
      });
    else if (entry.kind === "settlement_void")
      events.push({
        ...base,
        kind: "refund",
        title: "No contest.",
        detail: `${entry.amount} coins refunded. This prediction was voided.`,
        amount: entry.amount,
      });
    else if (entry.kind === "cashout")
      events.push({
        ...base,
        kind: "cashout",
        title: "Called your exit.",
        detail: `${entry.amount} coins returned from a cash-out.`,
        amount: position?.status === "cashout" ? net : undefined,
      });
  }
  for (const s of state.sessions) {
    const before = previous.sessions[s.id];
    const friend = state.profiles.find((p) => p.id === s.user_id);
    if (
      before &&
      !["completed", "lost"].includes(before.status) &&
      ["completed", "lost"].includes(s.status) &&
      s.user_id !== state.profile.id &&
      friend?.share_progress
    )
      events.push({
        id: `finished:${s.id}`,
        kind: "friend_finished",
        title: `${friend.display_name} finished.`,
        detail:
          s.status === "completed"
            ? `${s.guesses}/6. The league has something to talk about.`
            : "Six guesses. That one was a tough crowd.",
      });
    if (
      s.user_id === state.profile.id &&
      !before &&
      Object.values(previous.sessions).some((old) => old.date < s.puzzle_date)
    )
      events.push({
        id: `day:${s.puzzle_date}`,
        kind: "new_day",
        title: "A fresh puzzle. A fresh take.",
        detail: "Today’s game is ready for your predictions.",
      });
  }
  if (!previous.suspended && next.suspended)
    events.push({
      id: `suspended:${next.lastLedger}`,
      kind: "suspended",
      title: "Taking a quick pause.",
      detail:
        "Live progress is unavailable. Bets and cash-outs resume only when the server allows them.",
    });
  if (
    next.balance !== previous.balance &&
    !events.some((e) => e.returned || e.kind === "placed")
  )
    events.push({
      id: `balance:${next.lastLedger}:${next.balance}`,
      kind: "balance",
      title: "Coins updated.",
      detail: `Your confirmed balance is ${next.balance} coins.`,
    });
  return { events, next };
}
const DATABASE = "riskle-feedback-v1";
/** An IndexedDB transaction makes acknowledging notifications atomic across same-origin tabs. */
export async function acknowledgeEvents(
  state: PlatformState,
  bootstrap: boolean,
): Promise<FeedbackEvent[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DATABASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("checkpoints");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction("checkpoints", "readwrite"),
      store = tx.objectStore("checkpoints");
    let events: FeedbackEvent[] = [];
    const read = store.get(state.profile.id);
    read.onsuccess = () => {
      const result = confirmedEvents(
        read.result as EventCheckpoint | undefined,
        state,
        bootstrap,
      );
      events = result.events;
      store.put(result.next, state.profile.id);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(events);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
