export type MarketType =
  | "self-performance"
  | "friend-performance"
  | "head-to-head"
  | "exact-outcome"
  | "threshold"
  | "group-prediction";
export type GameStatus = "not_started" | "in_progress" | "completed" | "lost";
export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bankroll: number;
  exposure: number;
  joinDate: string;
  privacy: { shareProgress: boolean; shareStats: boolean };
}
export interface PlayerProgress {
  playerId: string;
  puzzleId: string;
  status: GameStatus;
  guessesUsed: number;
  maxGuesses: number;
  isLive: boolean;
  source: "mock" | "browser" | "manual";
  finalGuesses?: number;
  lastUpdated: number;
}
export interface MarketQuote {
  id: string;
  marketId: string;
  version: number;
  multiplier: number;
  quoteTs: number;
  expiryTs: number;
  status: "active" | "expired" | "closed";
  notes: string;
}
export interface PredictionMarket {
  id: string;
  title: string;
  subjectId: string;
  subjectLabel: string;
  puzzleId: string;
  marketType: MarketType;
  prediction: string;
  rule: { kind: "solve" | "threshold" | "exact"; guesses?: number };
  outcome?: string;
  status: "active" | "closed" | "suspended";
  currentQuote: MarketQuote;
  createdAt: number;
  expiresAt: number;
}
export interface WagerPosition {
  readonly id: string;
  readonly userId: string;
  readonly marketId: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly puzzleId: string;
  readonly predictionType: MarketType;
  readonly prediction: string;
  readonly stake: number;
  readonly odds: number;
  readonly expectedPayout: number;
  readonly createdAt: number;
  status: "open" | "settled" | "cashout";
  remainingStake: number;
  remainingPayout: number;
  payout: number;
  result?: "won" | "lost" | "cashed-out";
  readonly marketVersion: number;
  readonly quoteId: string;
  readonly isImmutable: true;
}
export interface CashoutQuote {
  id: string;
  wagerId: string;
  marketId: string;
  quote: number;
  stake: number;
  remainingStake: number;
  marketVersion: number;
  quoteTs: number;
  expiryTs: number;
  isValid: boolean;
}
export interface WalletEvent {
  id: string;
  userId: string;
  amount: number;
  type: "credit" | "wager" | "market_settlement" | "cashout";
  reason: string;
  createdAt: number;
  wagerId?: string;
}
export interface LeaderboardEntry {
  userId: string;
  username: string;
  bankroll: number;
  dailyProfit: number;
  weeklyProfit: number;
  totalAtRisk: number;
  openPositions: number;
  topWin: number;
  bestFriendPrediction: number;
}
export interface League {
  id: string;
  name: string;
  members: string[];
  createdAt: number;
}
export interface MockSession {
  playerId: string;
  puzzleId: string;
  guesses: string[];
}
export function formatCoins(value: number) {
  return `${value.toLocaleString()} coins`;
}
