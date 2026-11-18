import type {
  PlatformMarket,
  PlatformPosition,
  PlatformState,
  History,
} from "../../apps/web/lib/platform-client";
import { localDate } from "../../apps/web/lib/game-experience";
export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const userId = uuid(1),
  friendId = uuid(2),
  privateId = uuid(3),
  sessionId = uuid(11),
  friendSession = uuid(12),
  leagueId = uuid(30);
export function fixtureState(): PlatformState {
  const date = localDate(),
    last_seen = new Date().toISOString();
  const profile = {
    id: userId,
    username: "mara",
    display_name: "Mara",
    avatar_url: null,
    share_progress: true,
    public_rankings: true,
  };
  const make = (subject: string, base: number): PlatformMarket[] =>
    [
      ["solve", 0, "Solve within 6"],
      ["threshold", 3, "Solve in 3 or fewer"],
      ...[1, 2, 3, 4, 5, 6].map((n) => ["exact", n, `Solve in exactly ${n}`]),
    ].map(([kind, target, title], i) => ({
      id: uuid(base + i),
      session_id: subject,
      opponent_id: null,
      kind: String(kind),
      target: Number(target),
      title: String(title),
      odds: kind === "exact" ? 450 : kind === "threshold" ? 210 : 105,
      quote_id: uuid(base + 100 + i),
      version: 1,
      eligible: true,
      status: "open",
      outcome: null,
      expires_at: new Date(Date.now() + 120000).toISOString(),
    }));
  return {
    profile,
    wallet: { balance: 1000, exposure: 0 },
    profiles: [
      profile,
      { ...profile, id: friendId, username: "sarah", display_name: "Sarah" },
      {
        ...profile,
        id: privateId,
        username: "private_friend",
        display_name: "Private Pal",
        share_progress: false,
      },
    ],
    sessions: [
      {
        id: sessionId,
        user_id: userId,
        puzzle_id: `wordle:${Math.round((Date.parse(date) - Date.parse("2021-06-19")) / 86400000)}`,
        puzzle_date: date,
        guesses: 0,
        status: "not_started",
        live: true,
        trust: "extension_observed",
        last_seen,
      },
      {
        id: friendSession,
        user_id: friendId,
        puzzle_id: `wordle:${Math.round((Date.parse(date) - Date.parse("2021-06-19")) / 86400000)}`,
        puzzle_date: date,
        guesses: 1,
        status: "in_progress",
        live: true,
        trust: "extension_observed",
        last_seen,
      },
      {
        id: uuid(13),
        user_id: privateId,
        puzzle_id: "wordle:private",
        puzzle_date: date,
        guesses: 4,
        status: "in_progress",
        live: true,
        trust: "extension_observed",
        last_seen,
      },
    ],
    markets: [...make(sessionId, 100), ...make(friendSession, 200)],
    positions: [],
    leagues: [{ id: leagueId, name: "The Group Chat", owner_id: userId }],
    members: [userId, friendId, privateId].map((user_id) => ({
      league_id: leagueId,
      user_id,
    })),
    invites: [
      {
        league_id: leagueId,
        code: "abcdef123456abcdef123456abcdef12",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
    ],
    ledger: [
      {
        id: 1,
        amount: 1000,
        kind: "starting_credit",
        created_at: new Date().toISOString(),
      },
    ],
  };
}
export function fixtureHistory(state: PlatformState): History {
  const own = state.sessions.find((s) => s.user_id === state.profile.id)!;
  const profit = state.wallet.balance + state.wallet.exposure - 1000;
  return {
    days: [{ ...own, profit, daily_rank: 1 }],
    stats: {
      games: ["completed", "lost"].includes(own.status) ? 1 : 0,
      wins: own.status === "completed" ? 1 : 0,
      average: own.status === "completed" ? own.guesses : null,
      streak: own.status === "completed" ? 1 : 0,
      longestStreak: own.status === "completed" ? 1 : 0,
    },
  };
}
export function fixturePosition(
  state: PlatformState,
  stake = 50,
): PlatformPosition {
  const market = state.markets.find(
    (m) => m.session_id === sessionId && m.kind === "exact" && m.target === 3,
  )!;
  return {
    id: uuid(500 + state.positions.length),
    market_id: market.id,
    subject_id: userId,
    title: market.title,
    puzzle_date: state.sessions[0].puzzle_date,
    stake,
    odds: market.odds,
    potential: Math.floor((stake * market.odds) / 100),
    remaining_stake: stake,
    remaining_payout: Math.floor((stake * market.odds) / 100),
    paid: 0,
    status: "open",
  };
}
