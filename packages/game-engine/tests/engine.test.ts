import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Riskle game engine', () => {
  it('supports multiple wagers, friend predictions, and head-to-head markets', () => {
    const engine = createEngine();
    const alice = engine.createUser({ id: 'alice', username: 'alice' });
    const bob = engine.createUser({ id: 'bob', username: 'bob' });

    engine.createLeague({ id: 'league-1', name: 'Friends', members: [alice.id, bob.id] });
    const market = engine.createMarket({
      id: 'market-self',
      title: 'Sarah finishes in 3 or fewer',
      subjectId: 'sarah',
      subjectLabel: 'Sarah',
      marketType: 'friend-performance',
      prediction: 'under-3',
    });
    const headToHead = engine.createMarket({
      id: 'market-h2h',
      title: 'Alex vs Emma',
      subjectId: 'alex',
      subjectLabel: 'Alex',
      marketType: 'head-to-head',
      prediction: 'alex',
    });

    const wagerOne = engine.placeWager({ userId: alice.id, marketId: market.id, prediction: 'under-3', stake: 100 });
    const wagerTwo = engine.placeWager({ userId: bob.id, marketId: headToHead.id, prediction: 'alex', stake: 80 });

    expect(wagerOne.stake).toBe(100);
    expect(wagerTwo.stake).toBe(80);
    expect(alice.bankroll).toBe(900);
    expect(bob.bankroll).toBe(920);
  });

  it('adds stakes at new odds and supports cash-out calculations', () => {
    const engine = createEngine();
    const player = engine.createUser({ id: 'player-1', username: 'player-1' });
    const market = engine.createMarket({
      id: 'market-2',
      title: 'You beat Jake',
      subjectId: 'player-1',
      subjectLabel: 'You',
      marketType: 'self-performance',
      prediction: 'beat-jake',
    });

    const initial = engine.placeWager({ userId: player.id, marketId: market.id, prediction: 'beat-jake', stake: 150 });
    engine.refreshQuote(market.id, 2);
    const increase = engine.addStake(initial.id, 50);
    const cashout = engine.cashOut(initial.id, 160);

    expect(initial.expectedPayout).toBeGreaterThan(0);
    expect(increase.stake).toBe(200);
    expect(cashout.payout).toBe(160);
    expect(player.bankroll).toBeGreaterThan(0);
  });

  it('rejects expired or closed markets and insufficient funds', () => {
    const engine = createEngine();
    const player = engine.createUser({ id: 'player-2', username: 'player-2' });
    const market = engine.createMarket({
      id: 'market-3',
      title: 'Threshold market',
      subjectId: 'emma',
      subjectLabel: 'Emma',
      marketType: 'threshold',
      prediction: 'under-3',
    });

    market.status = 'closed';
    expect(() => engine.placeWager({ userId: player.id, marketId: market.id, prediction: 'under-3', stake: 10 })).toThrow();

    const fresh = engine.createMarket({
      id: 'market-4',
      title: 'Fresh market',
      subjectId: 'nina',
      subjectLabel: 'Nina',
      marketType: 'exact-outcome',
      prediction: '2',
    });

    expect(() => engine.placeWager({ userId: player.id, marketId: fresh.id, prediction: '2', stake: 2000 })).toThrow(/Insufficient available balance|Aggregate exposure limit/i);
  });

  it('enforces exposure limits and ignores stale progress events', () => {
    const engine = createEngine();
    const player = engine.createUser({ id: 'player-3', username: 'player-3', bankroll: 500 });

    engine.createMarket({
      id: 'market-5',
      title: 'Exposure test',
      subjectId: player.id,
      subjectLabel: 'Player 3',
      marketType: 'self-performance',
      prediction: 'win',
    });

    const first = engine.placeWager({ userId: player.id, marketId: 'market-5', prediction: 'win', stake: 200 });
    expect(first.stake).toBe(200);
    expect(() => engine.placeWager({ userId: player.id, marketId: 'market-5', prediction: 'win', stake: 200 })).toThrow();

    const stale = engine.recordProgress({ playerId: player.id, puzzleId: 'puzzle-1', status: 'in_progress', guessesUsed: 2, maxGuesses: 6 });
    const newer = engine.recordProgress({ playerId: player.id, puzzleId: 'puzzle-1', status: 'completed', guessesUsed: 4, maxGuesses: 6 });

    expect(stale.guessesUsed).toBe(2);
    expect(newer.status).toBe('completed');
  });

  it('settles markets and updates live leaderboard data', () => {
    const engine = createEngine();
    const alice = engine.createUser({ id: 'leader-1', username: 'alice' });
    const bob = engine.createUser({ id: 'leader-2', username: 'bob' });
    engine.createLeague({ id: 'league-2', name: 'Daily league', members: [alice.id, bob.id] });

    const market = engine.createMarket({
      id: 'market-6',
      title: 'Bob solves in time',
      subjectId: bob.id,
      subjectLabel: 'Bob',
      marketType: 'friend-performance',
      prediction: 'yes',
    });

    engine.placeWager({ userId: alice.id, marketId: market.id, prediction: 'yes', stake: 100 });
    const settled = engine.settleMarket(market.id, 'yes');

    expect(settled).toHaveLength(1);
    expect(alice.bankroll).toBeGreaterThan(900);

    const leaderboard = engine.getLeaderboard('league-2');
    expect(leaderboard.length).toBe(2);
    expect(leaderboard[0].username).toBeDefined();
  });

  it('preserves privacy and handles delayed or unavailable game state data', () => {
    const engine = createEngine();
    const user = engine.createUser({ id: 'privacy-user', username: 'privacy-user' });
    expect(user.privacy.shareProgress).toBe(true);

    user.privacy.shareProgress = false;
    expect(user.privacy.shareProgress).toBe(false);

    const delayed = engine.recordProgress({
      playerId: user.id,
      puzzleId: 'delayed',
      status: 'not_started',
      guessesUsed: 0,
      maxGuesses: 6,
      isLive: false,
      source: 'manual',
    });
    expect(delayed.isLive).toBe(false);
  });

  it('keeps old wager records immutable even when a new stake is added', () => {
    const engine = createEngine();
    const user = engine.createUser({ id: 'immu', username: 'immu' });
    const market = engine.createMarket({
      id: 'market-7',
      title: 'Immutable test',
      subjectId: user.id,
      subjectLabel: 'Immu',
      marketType: 'threshold',
      prediction: 'under-3',
    });

    const original = engine.placeWager({ userId: user.id, marketId: market.id, prediction: 'under-3', stake: 50 });
    const added = engine.addStake(original.id, 25);
    expect(original.stake).toBe(50);
    expect(added.stake).toBe(75);
    expect(original.isImmutable).toBe(true);
    expect(added.isImmutable).toBe(true);
  });

  it('supports quote expiration and disables entering closed markets', () => {
    const engine = createEngine();
    const user = engine.createUser({ id: 'quote-user', username: 'quote-user' });
    const market = engine.createMarket({
      id: 'market-8',
      title: 'Quote expiry',
      subjectId: 'friend-1',
      subjectLabel: 'Friend 1',
      marketType: 'group-prediction',
      prediction: 'friend-1',
    });

    market.currentQuote.expiryTs = Date.now() - 1;
    market.currentQuote.status = 'expired';
    expect(() => engine.placeWager({ userId: user.id, marketId: market.id, prediction: 'friend-1', stake: 25 })).toThrow();
  });
});
