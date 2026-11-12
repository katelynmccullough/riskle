import {
  clamp,
  type CashoutQuote,
  type League,
  type LeaderboardEntry,
  type MarketQuote,
  type MarketType,
  type PlayerProgress,
  type PredictionMarket,
  type UserProfile,
  type WagerPosition,
  type WalletEvent,
} from '@riskle/shared';

const DEFAULT_BANKROLL = 1000;
const DEFAULT_MAX_RISK_PERCENT = 0.7;

export class RiskleGameEngine {
  players = new Map<string, UserProfile>();
  leagues = new Map<string, League>();
  markets = new Map<string, PredictionMarket>();
  wagers = new Map<string, WagerPosition>();
  walletEvents = new Map<string, WalletEvent[]>();
  progressByPlayer = new Map<string, PlayerProgress>();
  marketWagers = new Map<string, string[]>();
  leagueActivity = new Map<string, string[]>();

  createUser({
    id,
    username,
    displayName,
    avatar = '🧢',
    bankroll = DEFAULT_BANKROLL,
  }: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
    bankroll?: number;
  }): UserProfile {
    const profile: UserProfile = {
      id,
      username,
      displayName: displayName ?? username,
      avatar,
      bankroll,
      exposure: 0,
      joinDate: new Date().toISOString(),
      privacy: {
        shareProgress: true,
        shareStats: true,
      },
    };
    this.players.set(id, profile);
    this.walletEvents.set(id, []);
    return profile;
  }

  createLeague({
    id,
    name,
    members,
  }: {
    id: string;
    name: string;
    members: string[];
  }): League {
    const league: League = {
      id,
      name,
      members,
      createdAt: Date.now(),
    };
    this.leagues.set(id, league);
    this.leagueActivity.set(id, []);
    return league;
  }

  recordProgress({
    playerId,
    puzzleId,
    status,
    guessesUsed,
    maxGuesses = 6,
    isLive = true,
    source = 'mock',
    finalGuesses,
  }: {
    playerId: string;
    puzzleId: string;
    status: PlayerProgress['status'];
    guessesUsed: number;
    maxGuesses?: number;
    isLive?: boolean;
    source?: PlayerProgress['source'];
    finalGuesses?: number;
  }): PlayerProgress {
    const profile = this.players.get(playerId);
    if (!profile) throw new Error(`Player ${playerId} not found`);

    const previous = this.progressByPlayer.get(playerId);
    const stamp = Date.now();
    if (previous && previous.lastUpdated > stamp) {
      return previous;
    }

    const nextProgress: PlayerProgress = {
      playerId,
      puzzleId,
      status,
      guessesUsed,
      maxGuesses,
      isLive,
      source,
      finalGuesses,
      lastUpdated: stamp,
    };

    this.progressByPlayer.set(playerId, nextProgress);
    return nextProgress;
  }

  createMarket({
    id,
    title,
    subjectId,
    subjectLabel,
    marketType,
    prediction,
    status = 'active',
    createdAt = Date.now(),
  }: {
    id: string;
    title: string;
    subjectId: string;
    subjectLabel: string;
    marketType: MarketType;
    prediction: string;
    status?: 'active' | 'closed' | 'suspended';
    createdAt?: number;
  }): PredictionMarket {
    const quote = this.buildQuote({
      marketId: id,
      version: 1,
      multiplier: this.calculateMultiplier({
        marketType,
        guessCount: 0,
      }),
      quoteTs: createdAt,
      expiryTs: createdAt + 1000 * 60 * 20,
      status: 'active',
      notes: 'Provisional quote generated from mock game state.',
    });

    const market: PredictionMarket = {
      id,
      title,
      subjectId,
      subjectLabel,
      marketType,
      prediction,
      status,
      currentQuote: quote,
      createdAt,
      expiresAt: createdAt + 1000 * 60 * 20,
    };

    this.markets.set(id, market);
    this.marketWagers.set(id, []);
    return market;
  }

  refreshQuote(marketId: string, guessCount: number): MarketQuote {
    const market = this.markets.get(marketId);
    if (!market) throw new Error(`Market ${marketId} not found`);

    const version = market.currentQuote.version + 1;
    const nextQuote = this.buildQuote({
      marketId,
      version,
      multiplier: this.calculateMultiplier({
        marketType: market.marketType,
        guessCount,
      }),
      quoteTs: Date.now(),
      expiryTs: Date.now() + 1000 * 60 * 10,
      status: 'active',
      notes:
        guessCount === 0
          ? 'Initial market quote.'
          : `Market updated after ${guessCount} guesses.`,
    });

    market.currentQuote = nextQuote;
    market.expiresAt = nextQuote.expiryTs;
    return nextQuote;
  }

  placeWager({
    userId,
    marketId,
    prediction,
    stake,
  }: {
    userId: string;
    marketId: string;
    prediction: string;
    stake: number;
  }): WagerPosition {
    const player = this.players.get(userId);
    const market = this.markets.get(marketId);
    if (!player) throw new Error(`Player ${userId} not found`);
    if (!market) throw new Error(`Market ${marketId} not found`);
    if (market.status !== 'active') throw new Error('Market is not accepting wagers');
    if (stake <= 0) throw new Error('Stake must be greater than zero');
    this.syncQuoteStatus(market);
    if (market.currentQuote.status !== 'active') throw new Error('Quote expired or closed');

    const exposureLimit = Math.max(10, player.bankroll * DEFAULT_MAX_RISK_PERCENT);
    if (player.exposure + stake > exposureLimit) {
      throw new Error('Aggregate exposure limit exceeded');
    }
    if (player.bankroll < stake) {
      throw new Error('Insufficient available balance');
    }

    const wager: WagerPosition = {
      id: this.makeId('wager'),
      userId,
      marketId,
      subjectId: market.subjectId,
      subjectLabel: market.subjectLabel,
      predictionType: market.marketType,
      prediction,
      stake,
      odds: market.currentQuote.multiplier,
      expectedPayout: stake * market.currentQuote.multiplier,
      createdAt: Date.now(),
      status: 'open',
      marketVersion: market.currentQuote.version,
      quoteId: market.currentQuote.id,
      isImmutable: true,
    };

    this.wagers.set(wager.id, wager);
    player.bankroll -= stake;
    player.exposure += stake;
    this.marketWagers.get(marketId)?.push(wager.id);
    return wager;
  }

  addStake(positionId: string, additionalStake: number): WagerPosition {
    const existing = this.wagers.get(positionId);
    if (!existing) throw new Error(`Wager ${positionId} not found`);
    if (existing.status !== 'open') throw new Error('Only open wagers can be increased');

    const player = this.players.get(existing.userId);
    const market = this.markets.get(existing.marketId);
    if (!player || !market) throw new Error('Player or market missing');
    if (additionalStake <= 0) throw new Error('Increase must be positive');

    this.syncQuoteStatus(market);
    if (market.currentQuote.status !== 'active') throw new Error('Quote expired or closed');

    const exposureLimit = Math.max(10, player.bankroll * DEFAULT_MAX_RISK_PERCENT);
    if (player.exposure + additionalStake > exposureLimit) {
      throw new Error('Aggregate exposure limit exceeded');
    }
    if (player.bankroll < additionalStake) {
      throw new Error('Insufficient available balance');
    }

    const added: WagerPosition = {
      ...existing,
      id: this.makeId('wager'),
      stake: existing.stake + additionalStake,
      odds: market.currentQuote.multiplier,
      expectedPayout: (existing.stake + additionalStake) * market.currentQuote.multiplier,
      createdAt: Date.now(),
      marketVersion: market.currentQuote.version,
      quoteId: market.currentQuote.id,
      isImmutable: true,
    };

    this.wagers.set(added.id, added);
    player.bankroll -= additionalStake;
    player.exposure += additionalStake;
    this.marketWagers.get(existing.marketId)?.push(added.id);
    return added;
  }

  cashOut(positionId: string, amount?: number): { cashout: CashoutQuote; payout: number } {
    const wager = this.wagers.get(positionId);
    if (!wager) throw new Error(`Wager ${positionId} not found`);
    if (wager.status !== 'open') throw new Error('Only open wagers can be cashed out');

    const market = this.markets.get(wager.marketId);
    if (!market) throw new Error('Underlying market missing');
    if (market.status !== 'active') throw new Error('Market is closed or suspended');

    const decisiveQuote = this.calculateCashoutQuote({
      stake: wager.stake,
      odds: wager.odds,
      progress: this.progressByPlayer.get(wager.subjectId)?.guessesUsed ?? 0,
      maxGuesses: this.progressByPlayer.get(wager.subjectId)?.maxGuesses ?? 6,
    });

    const payout = amount ?? decisiveQuote.quote;
    if (payout < 0) throw new Error('Cash-out amount cannot be negative');
    if (payout > decisiveQuote.quote) throw new Error('Cash-out exceeds published quote');

    const player = this.players.get(wager.userId);
    if (!player) throw new Error('Player missing');

    player.bankroll += payout;
    player.exposure -= wager.stake;
    wager.status = 'cashout';

    return {
      cashout: {
        id: this.makeId('cashout'),
        wagerId: positionId,
        marketId: wager.marketId,
        quote: decisiveQuote.quote,
        quoteTs: Date.now(),
        expiryTs: Date.now() + 60_000,
        isValid: true,
      },
      payout,
    };
  }

  settleMarket(marketId: string, outcome: string): string[] {
    const market = this.markets.get(marketId);
    if (!market) throw new Error(`Market ${marketId} not found`);

    market.status = 'closed';
    market.prediction = outcome;
    const ids = this.marketWagers.get(marketId) ?? [];
    const settledIds: string[] = [];

    for (const wagerId of ids) {
      const wager = this.wagers.get(wagerId);
      if (!wager || wager.status !== 'open') continue;

      const player = this.players.get(wager.userId);
      if (!player) continue;

      const wins = wager.prediction === outcome;
      if (wins) {
        player.bankroll += wager.expectedPayout;
      }
      player.exposure -= wager.stake;
      wager.status = 'settled';
      settledIds.push(wagerId);
    }

    return settledIds;
  }

  getLeaderboard(leagueId: string): LeaderboardEntry[] {
    const league = this.leagues.get(leagueId);
    if (!league) throw new Error(`League ${leagueId} not found`);

    return league.members.map((memberId) => {
      const player = this.players.get(memberId);
      if (!player) {
        return {
          userId: memberId,
          username: memberId,
          bankroll: 0,
          dailyProfit: 0,
          weeklyProfit: 0,
          totalAtRisk: 0,
          openPositions: 0,
          topWin: 0,
          bestFriendPrediction: 0,
        };
      }

      const openPositions = [...this.wagers.values()].filter(
        (wager) => wager.userId === memberId && wager.status === 'open',
      ).length;

      return {
        userId: player.id,
        username: player.username,
        bankroll: player.bankroll,
        dailyProfit: Math.max(0, player.bankroll - DEFAULT_BANKROLL),
        weeklyProfit: Math.max(0, player.bankroll - DEFAULT_BANKROLL),
        totalAtRisk: player.exposure,
        openPositions,
        topWin: Math.max(0, player.bankroll - DEFAULT_BANKROLL),
        bestFriendPrediction: Math.max(0, player.bankroll - DEFAULT_BANKROLL),
      };
    });
  }

  private buildQuote({
    marketId,
    version,
    multiplier,
    quoteTs,
    expiryTs,
    status,
    notes,
  }: {
    marketId: string;
    version: number;
    multiplier: number;
    quoteTs: number;
    expiryTs: number;
    status: 'active' | 'expired' | 'closed';
    notes: string;
  }): MarketQuote {
    return {
      id: this.makeId('quote'),
      marketId,
      version,
      multiplier,
      quoteTs,
      expiryTs,
      status,
      notes,
    };
  }

  private calculateMultiplier({
    marketType,
    guessCount,
  }: {
    marketType: MarketType;
    guessCount: number;
  }): number {
    const dynamic = 1.7 + Math.max(0, 6 - guessCount) * 0.35;

    switch (marketType) {
      case 'self-performance':
        return Number((dynamic * 1.1).toFixed(2));
      case 'friend-performance':
        return Number((dynamic * 1.25).toFixed(2));
      case 'head-to-head':
        return Number((dynamic * 1.45).toFixed(2));
      case 'exact-outcome':
        return Number((dynamic * 1.8).toFixed(2));
      case 'threshold':
        return Number((dynamic * 1.35).toFixed(2));
      case 'group-prediction':
        return Number((dynamic * 1.9).toFixed(2));
      default:
        return 1.9;
    }
  }

  private calculateCashoutQuote({
    stake,
    odds,
    progress,
    maxGuesses,
  }: {
    stake: number;
    odds: number;
    progress: number;
    maxGuesses: number;
  }): CashoutQuote {
    const progressRatio = clamp(progress / Math.max(1, maxGuesses), 0, 1);
    const quote = Math.max(0, stake * odds * (0.25 + (1 - progressRatio) * 0.75));
    return {
      id: this.makeId('cashout-quote'),
      wagerId: this.makeId('wager'),
      marketId: this.makeId('market'),
      quote: Number(quote.toFixed(2)),
      quoteTs: Date.now(),
      expiryTs: Date.now() + 60_000,
      isValid: true,
    };
  }

  private syncQuoteStatus(market: PredictionMarket) {
    if (Date.now() > market.currentQuote.expiryTs) {
      market.currentQuote.status = 'expired';
      market.status = 'closed';
    }
  }

  private makeId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
  }
}

export function createEngine() {
  return new RiskleGameEngine();
}
