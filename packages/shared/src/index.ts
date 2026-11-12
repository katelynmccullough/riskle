export type MarketType =
  | 'self-performance'
  | 'friend-performance'
  | 'head-to-head'
  | 'exact-outcome'
  | 'threshold'
  | 'group-prediction';

export type GameStatus = 'not_started' | 'in_progress' | 'completed' | 'lost';
export type WagerStatus = 'open' | 'settled' | 'cashout' | 'cancelled';
export type QuoteStatus = 'active' | 'expired' | 'closed';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bankroll: number;
  exposure: number;
  joinDate: string;
  privacy: {
    shareProgress: boolean;
    shareStats: boolean;
  };
}

export interface PlayerProgress {
  playerId: string;
  puzzleId: string;
  status: GameStatus;
  guessesUsed: number;
  maxGuesses: number;
  isLive: boolean;
  source: 'mock' | 'browser' | 'manual';
  finalGuesses?: number;
  lastUpdated: number;
}

export interface PredictionMarket {
  id: string;
  title: string;
  subjectId: string;
  subjectLabel: string;
  marketType: MarketType;
  prediction: string;
  outcome?: string;
  status: 'active' | 'closed' | 'suspended';
  currentQuote: MarketQuote;
  createdAt: number;
  expiresAt: number;
}

export interface MarketQuote {
  id: string;
  marketId: string;
  version: number;
  multiplier: number;
  quoteTs: number;
  expiryTs: number;
  status: QuoteStatus;
  notes: string;
}

export interface WagerPosition {
  id: string;
  userId: string;
  marketId: string;
  subjectId: string;
  subjectLabel: string;
  predictionType: MarketType;
  prediction: string;
  stake: number;
  odds: number;
  expectedPayout: number;
  createdAt: number;
  status: WagerStatus;
  marketVersion: number;
  quoteId: string;
  isImmutable: true;
}

export interface CashoutQuote {
  id: string;
  wagerId: string;
  marketId: string;
  quote: number;
  quoteTs: number;
  expiryTs: number;
  isValid: boolean;
}

export interface WalletEvent {
  id: string;
  userId: string;
  amount: number;
  type: 'credit' | 'debit' | 'wager' | 'market_settlement' | 'cashout';
  reason: string;
  createdAt: number;
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

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function formatCoins(value: number) {
  return `${Math.round(value)} coins`;
}
