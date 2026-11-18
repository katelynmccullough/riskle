import type {
  History,
  PlatformMarket,
  PlatformPosition,
  PlatformSession,
  PlatformState,
  Ranking,
} from "./platform-client";
export const terminal = (status: string) =>
  ["completed", "lost"].includes(status);
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function playerSessions(state: PlatformState) {
  const allowed = new Set(
    state.profiles
      .filter(
        (p) =>
          p.id === state.profile.id ||
          (p.share_progress &&
            state.members.some(
              (m) =>
                m.user_id === p.id &&
                state.members.some(
                  (own) =>
                    own.user_id === state.profile.id &&
                    own.league_id === m.league_id,
                ),
            )),
      )
      .map((p) => p.id),
  );
  const latest = new Map<string, PlatformSession>();
  for (const s of state.sessions)
    if (allowed.has(s.user_id)) {
      const prev = latest.get(s.user_id);
      if (
        !prev ||
        s.puzzle_date > prev.puzzle_date ||
        (s.puzzle_date === prev.puzzle_date && s.last_seen > prev.last_seen)
      )
        latest.set(s.user_id, s);
    }
  return [...latest.values()].sort(
    (a, b) =>
      Number(b.user_id === state.profile.id) -
        Number(a.user_id === state.profile.id) ||
      a.user_id.localeCompare(b.user_id),
  );
}
export function marketAvailable(
  market: PlatformMarket,
  session: PlatformSession | undefined,
  now: number,
) {
  return (
    !!session &&
    (!terminal(session.status) || market.kind === "head_to_head") &&
    session.live &&
    now - Date.parse(session.last_seen) < 12000 &&
    market.status === "open" &&
    market.eligible &&
    Date.parse(market.expires_at) > now
  );
}
export function wagerPreview(stake: number, odds: number) {
  if (
    !Number.isSafeInteger(stake) ||
    stake < 1 ||
    !Number.isSafeInteger(odds) ||
    odds < 100
  )
    return null;
  const raw = (BigInt(stake) * BigInt(odds)) / 100n;
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const payout = Number(raw);
  return { stake, payout, profit: payout - stake, maxLoss: stake };
}
export function positionNet(p: PlatformPosition) {
  return p.paid - (p.stake - p.remaining_stake);
}
export type DailySummary = {
  puzzleId: string;
  date: string;
  status: string;
  guesses: number;
  profit?: number;
  betCount?: number;
  biggestWin?: number;
  biggestLoss?: number;
  rank?: number;
  rankLabel?: string;
  streak?: number;
  pending: number;
};
export function dailySummary(
  state: PlatformState,
  session: PlatformSession,
  history: History | undefined,
  rankings: Ranking[],
  league: string,
  weekly: boolean,
  rankingDate: string,
): DailySummary {
  const positions = state.positions.filter(
    (p) => p.puzzle_date === session.puzzle_date,
  );
  // The current RPC caps closed history at 200. Do not turn a partial list into an invented total.
  const complete =
    state.positions.filter((p) => p.status !== "open").length < 200;
  const day = history?.days.find((d) => d.puzzle_date === session.puzzle_date);
  const ownRank =
    !weekly && rankingDate === session.puzzle_date && league
      ? rankings.findIndex((r) => r.id === state.profile.id)
      : -1;
  const wins = positions.filter((p) => p.status === "won"),
    losses = positions.filter((p) => p.status === "lost");
  return {
    puzzleId: session.puzzle_id,
    date: session.puzzle_date,
    status: session.status,
    guesses: session.guesses,
    profit:
      day?.profit ??
      (complete
        ? positions.reduce((sum, p) => sum + positionNet(p), 0)
        : undefined),
    betCount: complete ? positions.length : undefined,
    biggestWin:
      complete && wins.length ? Math.max(...wins.map(positionNet)) : undefined,
    biggestLoss:
      complete && losses.length
        ? Math.min(...losses.map(positionNet))
        : undefined,
    rank: ownRank >= 0 ? ownRank + 1 : (day?.daily_rank ?? undefined),
    rankLabel: ownRank >= 0 ? "League rank" : "Global rank",
    streak: history?.stats.streak,
    pending: positions.filter((p) => p.status === "open").length,
  };
}
export function shareText(result: DailySummary) {
  return [
    `RISKLE #${result.puzzleId.replace(/^wordle:/, "")}`,
    `Wordle: ${result.status === "completed" ? result.guesses : "X"}/6`,
    result.profit !== undefined
      ? `Daily profit: ${result.profit >= 0 ? "+" : ""}${result.profit} virtual coins`
      : null,
    result.rank ? `${result.rankLabel ?? "Rank"}: #${result.rank}` : null,
    "Your Wordle just got competitive.",
    "Unofficial companion · virtual coins only",
  ]
    .filter(Boolean)
    .join("\n");
}
const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function shareSvg(result: DailySummary) {
  const lines = shareText(result).split("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#FAF9F6"/><rect x="60" y="60" width="960" height="960" rx="36" fill="#D5CBF5"/><circle cx="900" cy="170" r="46" fill="#F6E879"/><text x="120" y="200" font-family="Arial,sans-serif" font-size="82" font-weight="800" fill="#222222">riskle.</text>${lines.map((line, i) => `<text x="120" y="${330 + i * 105}" font-family="Arial,sans-serif" font-size="${i < 3 ? 50 : 32}" font-weight="${i < 3 ? 700 : 400}" fill="#382F4C">${xml(line)}</text>`).join("")}</svg>`;
}
