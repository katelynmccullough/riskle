import type {
  CashoutQuote,
  League,
  LeaderboardEntry,
  MarketQuote,
  MockSession,
  PlayerProgress,
  PredictionMarket,
  UserProfile,
  WagerPosition,
  WalletEvent,
} from "@riskle/shared";

export const LIMITS = { total: 0.7, subject: 0.5, puzzle: 0.6 };
export const STORAGE_VERSION = 1;
export interface EngineSnapshot {
  version: 1;
  revision: number;
  players: UserProfile[];
  leagues: League[];
  markets: PredictionMarket[];
  wagers: WagerPosition[];
  walletEvents: WalletEvent[];
  progress: PlayerProgress[];
  sessions: MockSession[];
  activity: [string, string[]][];
  cashoutQuotes: CashoutQuote[];
  receipts: [string, { fingerprint: string; result: unknown }][];
}
const terminal = (p: PlayerProgress) =>
  p.status === "completed" || p.status === "lost";
const coins = (n: number) => Number.isSafeInteger(n) && n > 0;
function mulDiv(a: number, b: number, divisor: number) {
  const value = (BigInt(a) * BigInt(b)) / BigInt(divisor);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Coin amount is too large");
  return Number(value);
}
const id = (prefix: string) => `${prefix}_${globalThis.crypto.randomUUID()}`;
export function mockAnswer(puzzleId: string): string {
  const words = ["CRANE", "PLANT", "SHORE", "BRICK", "GHOST", "FLAME", "ROUND"];
  return words[
    [...puzzleId].reduce((sum, c) => sum + c.charCodeAt(0), 0) % words.length
  ];
}
export function scoreGuess(
  guess: string,
  answer: string,
): ("correct" | "present" | "absent")[] {
  const result: ("correct" | "present" | "absent")[] = Array(5).fill("absent");
  const available = answer.split("");
  [...guess].forEach((c, i) => {
    if (c === answer[i]) {
      result[i] = "correct";
      available[i] = "";
    }
  });
  [...guess].forEach((c, i) => {
    const j = available.indexOf(c);
    if (result[i] !== "correct" && j >= 0) {
      result[i] = "present";
      available[j] = "";
    }
  });
  return result;
}

/** Synchronous local simulation. No network, authentication or production trust boundary. */
export class RiskleGameEngine {
  revision = 0;
  players = new Map<string, UserProfile>();
  leagues = new Map<string, League>();
  markets = new Map<string, PredictionMarket>();
  wagers = new Map<string, WagerPosition>();
  walletEvents = new Map<string, WalletEvent[]>();
  progressByPlayer = new Map<string, PlayerProgress>();
  sessions = new Map<string, MockSession>();
  leagueActivity = new Map<string, string[]>();
  cashoutQuotes = new Map<string, CashoutQuote>();
  receipts = new Map<string, { fingerprint: string; result: unknown }>();

  createUser({
    id: playerId,
    username,
    displayName,
    avatar = "🧢",
    bankroll = 1000,
  }: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
    bankroll?: number;
  }): UserProfile {
    username = username.trim();
    if (!playerId || !username || username.length > 24 || !coins(bankroll))
      throw new Error(
        "Use a name of 1–24 characters and a positive integer bankroll",
      );
    if (
      this.players.has(playerId) ||
      [...this.players.values()].some(
        (p) => p.username.toLowerCase() === username.toLowerCase(),
      )
    )
      throw new Error("Player already exists");
    const player: UserProfile = {
      id: playerId,
      username,
      displayName: displayName ?? username,
      avatar,
      bankroll,
      exposure: 0,
      joinDate: new Date().toISOString(),
      privacy: { shareProgress: false, shareStats: true },
    };
    this.players.set(playerId, player);
    this.walletEvents.set(playerId, []);
    this.event(playerId, bankroll, "credit", "Starting virtual bankroll");
    return player;
  }
  createLeague({
    id: leagueId,
    name,
    members,
  }: {
    id: string;
    name: string;
    members: string[];
  }): League {
    if (this.leagues.has(leagueId)) throw new Error("League already exists");
    if (
      !name.trim() ||
      name.trim().length > 48 ||
      !members.length ||
      members.some((m) => !this.players.has(m))
    )
      throw new Error("League needs a name and valid members");
    const league = {
      id: leagueId,
      name: name.trim(),
      members: [...new Set(members)],
      createdAt: Date.now(),
    };
    this.leagues.set(leagueId, league);
    this.leagueActivity.set(leagueId, []);
    return league;
  }
  addMember(leagueId: string, playerId: string) {
    const league = this.leagues.get(leagueId);
    if (!league || !this.players.has(playerId))
      throw new Error("League or player missing");
    if (!league.members.includes(playerId)) league.members.push(playerId);
  }
  startPuzzle(playerId: string, puzzleId: string) {
    if (!this.players.has(playerId)) throw new Error("Player missing");
    if (this.progressByPlayer.has(playerId)) return;
    this.sessions.set(playerId, { playerId, puzzleId, guesses: [] });
    this.progressByPlayer.set(playerId, {
      playerId,
      puzzleId,
      status: "not_started",
      guessesUsed: 0,
      maxGuesses: 6,
      isLive: true,
      source: "mock",
      lastUpdated: Date.now(),
    });
    this.createMarket({
      id: `${playerId}:${puzzleId}:solve`,
      subjectId: playerId,
      puzzleId,
      rule: { kind: "solve" },
      title: "Solve within 6",
    });
    this.createMarket({
      id: `${playerId}:${puzzleId}:under3`,
      subjectId: playerId,
      puzzleId,
      rule: { kind: "threshold", guesses: 3 },
      title: "Solve in 3 or fewer",
    });
    for (let guesses = 1; guesses <= 6; guesses++)
      this.createMarket({
        id: `${playerId}:${puzzleId}:exact${guesses}`,
        subjectId: playerId,
        puzzleId,
        rule: { kind: "exact", guesses },
        title: `Solve in exactly ${guesses}`,
      });
  }
  submitGuess(playerId: string, word: string, expectedGuessCount: number) {
    const session = this.sessions.get(playerId);
    const previous = this.progressByPlayer.get(playerId);
    word = word.trim().toUpperCase();
    if (!session || !previous || terminal(previous))
      throw new Error("Puzzle is finished or missing");
    if (expectedGuessCount !== session.guesses.length)
      throw new Error("Progress changed; try again");
    if (!/^[A-Z]{5}$/.test(word)) throw new Error("Enter five letters");
    if (session.guesses.includes(word))
      throw new Error("Try a different guess");
    const guessesUsed = session.guesses.length + 1;
    const status =
      word === mockAnswer(session.puzzleId)
        ? "completed"
        : guessesUsed === 6
          ? "lost"
          : "in_progress";
    this.recordProgress({
      ...previous,
      status,
      guessesUsed,
      finalGuesses: status === "completed" ? guessesUsed : undefined,
      lastUpdated: Math.max(Date.now(), previous.lastUpdated + 1),
    });
    session.guesses.push(word);
  }
  recordProgress(next: PlayerProgress): PlayerProgress {
    if (!this.players.has(next.playerId)) throw new Error("Player missing");
    if (
      next.maxGuesses !== 6 ||
      !Number.isInteger(next.guessesUsed) ||
      next.guessesUsed < 0 ||
      next.guessesUsed > 6 ||
      !Number.isFinite(next.lastUpdated)
    )
      throw new Error("Invalid progress");
    if (
      !["not_started", "in_progress", "completed", "lost"].includes(
        next.status,
      ) ||
      (next.status === "not_started" && next.guessesUsed !== 0) ||
      (next.status === "in_progress" &&
        (next.guessesUsed < 1 || next.guessesUsed >= 6)) ||
      (next.status === "completed" &&
        (next.guessesUsed < 1 || next.finalGuesses !== next.guessesUsed)) ||
      (next.status === "lost" && next.guessesUsed !== 6)
    )
      throw new Error("Inconsistent progress");
    const previous = this.progressByPlayer.get(next.playerId);
    if (previous) {
      if (next.puzzleId !== previous.puzzleId)
        throw new Error("Puzzle mismatch");
      if (
        terminal(previous) ||
        next.lastUpdated <= previous.lastUpdated ||
        next.guessesUsed <= previous.guessesUsed
      )
        return previous;
      if (next.guessesUsed !== previous.guessesUsed + 1)
        throw new Error("Out-of-order progress");
    }
    this.progressByPlayer.set(next.playerId, { ...next });
    for (const market of this.markets.values())
      if (
        market.subjectId === next.playerId &&
        market.puzzleId === next.puzzleId &&
        market.status === "active"
      )
        this.refreshQuote(market.id);
    return next;
  }
  createMarket({
    id: marketId,
    subjectId,
    puzzleId,
    rule,
    title,
  }: {
    id: string;
    subjectId: string;
    puzzleId: string;
    rule: PredictionMarket["rule"];
    title: string;
  }): PredictionMarket {
    const player = this.players.get(subjectId);
    const progress = this.progressByPlayer.get(subjectId);
    if (
      !player ||
      !progress ||
      progress.puzzleId !== puzzleId ||
      this.markets.has(marketId)
    )
      throw new Error("Invalid market subject or duplicate market");
    if (
      !["solve", "threshold", "exact"].includes(rule.kind) ||
      (rule.kind !== "solve" &&
        (!Number.isInteger(rule.guesses) ||
          rule.guesses! < 1 ||
          rule.guesses! > 6))
    )
      throw new Error("Invalid market rule");
    const now = Date.now();
    const market: PredictionMarket = {
      id: marketId,
      subjectId,
      subjectLabel: player.username,
      puzzleId,
      rule: { ...rule },
      title,
      prediction: "yes",
      marketType: rule.kind === "exact" ? "exact-outcome" : "threshold",
      status: "active",
      createdAt: now,
      expiresAt: now + 120000,
      currentQuote: {
        id: "",
        marketId,
        version: 0,
        multiplier: 1,
        quoteTs: now,
        expiryTs: now,
        status: "active",
        notes: "",
      },
    };
    this.markets.set(marketId, market);
    this.refreshQuote(marketId);
    return market;
  }
  private possible(market: PredictionMarket, p: PlayerProgress) {
    return market.rule.kind === "solve" || p.guessesUsed < market.rule.guesses!;
  }
  private wins(market: PredictionMarket, p: PlayerProgress) {
    return (
      p.status === "completed" &&
      (market.rule.kind === "solve" ||
        (market.rule.kind === "exact"
          ? p.guessesUsed === market.rule.guesses
          : p.guessesUsed <= market.rule.guesses!))
    );
  }
  refreshQuote(marketId: string): MarketQuote {
    const market = this.market(marketId);
    const p = this.progressByPlayer.get(market.subjectId)!;
    if (market.status !== "active") return market.currentQuote;
    if (terminal(p) || !this.possible(market, p)) {
      this.settleMarket(marketId);
      return market.currentQuote;
    }
    const remaining = 7 - p.guessesUsed; // One equally weighted simulation outcome per remaining guess, plus loss.
    const favorable =
      market.rule.kind === "solve"
        ? 6 - p.guessesUsed
        : market.rule.kind === "exact"
          ? 1
          : market.rule.guesses! - p.guessesUsed;
    const now = Date.now();
    market.currentQuote = {
      id: id("quote"),
      marketId,
      version: market.currentQuote.version + 1,
      multiplier: Math.max(
        1.05,
        Math.floor((remaining / favorable) * 90) / 100,
      ),
      quoteTs: now,
      expiryTs: now + 120000,
      status: "active",
      notes:
        "Provisional simulation: equal weight for remaining guess outcomes and loss; 10% payout margin.",
    };
    market.expiresAt = market.currentQuote.expiryTs;
    return market.currentQuote;
  }
  private eligible(userId: string, market: PredictionMarket) {
    const p = this.progressByPlayer.get(market.subjectId);
    if (
      !p ||
      p.puzzleId !== market.puzzleId ||
      terminal(p) ||
      !p.isLive ||
      market.status !== "active" ||
      !this.possible(market, p)
    )
      throw new Error("Market is closed, suspended or unavailable");
    if (
      userId !== market.subjectId &&
      (!this.players.get(market.subjectId)?.privacy.shareProgress ||
        ![...this.leagues.values()].some(
          (l) =>
            l.members.includes(userId) && l.members.includes(market.subjectId),
        ))
    )
      throw new Error("Friend must share progress and belong to your league");
    if (
      market.currentQuote.status !== "active" ||
      Date.now() >= market.currentQuote.expiryTs
    )
      throw new Error("Quote expired; refresh markets");
  }
  placeWager({
    userId,
    marketId,
    stake,
    quoteId,
    requestId,
  }: {
    userId: string;
    marketId: string;
    stake: number;
    quoteId: string;
    requestId: string;
  }): WagerPosition {
    return this.once(
      requestId,
      ["wager", userId, marketId, stake, quoteId],
      () => {
        const player = this.players.get(userId);
        const market = this.market(marketId);
        if (!player) throw new Error("Player missing");
        if (!coins(stake))
          throw new Error("Stake must be a positive whole number");
        this.eligible(userId, market);
        if (quoteId !== market.currentQuote.id)
          throw new Error("Stale quote; review the new odds");
        if (player.bankroll < stake)
          throw new Error("Insufficient available balance");
        const capital = player.bankroll + player.exposure;
        const open = [...this.wagers.values()].filter(
          (w) => w.userId === userId && w.status === "open",
        );
        if (player.exposure + stake > Math.floor(capital * LIMITS.total))
          throw new Error("Aggregate exposure limit exceeded (70%)");
        if (
          open
            .filter((w) => w.subjectId === market.subjectId)
            .reduce((s, w) => s + w.remainingStake, 0) +
            stake >
          Math.floor(capital * LIMITS.subject)
        )
          throw new Error("Per-player exposure limit exceeded (50%)");
        if (
          open
            .filter((w) => w.puzzleId === market.puzzleId)
            .reduce((s, w) => s + w.remainingStake, 0) +
            stake >
          Math.floor(capital * LIMITS.puzzle)
        )
          throw new Error("Per-puzzle exposure limit exceeded (60%)");
        const payout = mulDiv(
          stake,
          Math.round(market.currentQuote.multiplier * 100),
          100,
        );
        if (!Number.isSafeInteger(payout))
          throw new Error("Stake is too large");
        const wager: WagerPosition = {
          id: id("wager"),
          userId,
          marketId,
          subjectId: market.subjectId,
          subjectLabel: market.subjectLabel,
          puzzleId: market.puzzleId,
          predictionType: market.marketType,
          prediction: market.prediction,
          stake,
          remainingStake: stake,
          odds: market.currentQuote.multiplier,
          expectedPayout: payout,
          remainingPayout: payout,
          payout: 0,
          createdAt: Date.now(),
          status: "open",
          marketVersion: market.currentQuote.version,
          quoteId,
          isImmutable: true,
        };
        this.wagers.set(wager.id, wager);
        player.bankroll -= stake;
        player.exposure += stake;
        this.event(
          userId,
          -stake,
          "wager",
          `${market.title} · ${market.subjectLabel}`,
          wager.id,
        );
        return wager;
      },
    );
  }
  addStake(
    positionId: string,
    stake: number,
    quoteId: string,
    requestId: string,
  ) {
    const existing = this.wager(positionId);
    if (existing.status !== "open")
      throw new Error("Only open wagers can be increased");
    return this.placeWager({
      userId: existing.userId,
      marketId: existing.marketId,
      stake,
      quoteId,
      requestId,
    });
  }
  hold(positionId: string) {
    const wager = this.wager(positionId);
    if (wager.status !== "open") throw new Error("Position is already closed");
    return {
      remainingStake: wager.remainingStake,
      potentialPayout: wager.remainingPayout,
    };
  }
  quoteCashOut(positionId: string, stake?: number): CashoutQuote {
    const wager = this.wager(positionId);
    const market = this.market(wager.marketId);
    if (wager.status !== "open")
      throw new Error("Only open wagers can be cashed out");
    this.eligible(wager.userId, market);
    const portion = stake ?? wager.remainingStake;
    if (!coins(portion) || portion > wager.remainingStake)
      throw new Error(
        "Choose a whole stake amount within the remaining position",
      );
    const releasedPayout =
      portion === wager.remainingStake
        ? wager.remainingPayout
        : mulDiv(wager.remainingPayout, portion, wager.remainingStake);
    const quote: CashoutQuote = {
      id: id("cashout"),
      wagerId: positionId,
      marketId: market.id,
      stake: portion,
      remainingStake: wager.remainingStake,
      marketVersion: market.currentQuote.version,
      quote: mulDiv(
        releasedPayout,
        90,
        Math.round(market.currentQuote.multiplier * 100),
      ),
      quoteTs: Date.now(),
      expiryTs: Math.min(Date.now() + 15000, market.currentQuote.expiryTs),
      isValid: true,
    };
    this.cashoutQuotes.set(quote.id, quote);
    return quote;
  }
  cashOut(
    quoteId: string,
    requestId: string,
  ): { cashout: CashoutQuote; payout: number } {
    return this.once(requestId, ["cashout", quoteId], () => {
      const quote = this.cashoutQuotes.get(quoteId);
      if (!quote || !quote.isValid || Date.now() >= quote.expiryTs)
        throw new Error("Cash-out quote expired; request another");
      const wager = this.wager(quote.wagerId);
      const market = this.market(wager.marketId);
      this.eligible(wager.userId, market);
      if (
        wager.status !== "open" ||
        wager.remainingStake !== quote.remainingStake ||
        market.currentQuote.version !== quote.marketVersion
      )
        throw new Error("Position or market changed; request another quote");
      const releasedPayout =
        quote.stake === wager.remainingStake
          ? wager.remainingPayout
          : mulDiv(wager.remainingPayout, quote.stake, wager.remainingStake);
      wager.remainingStake -= quote.stake;
      wager.remainingPayout -= releasedPayout;
      wager.payout += quote.quote;
      if (!wager.remainingStake) {
        wager.status = "cashout";
        wager.result = "cashed-out";
      }
      const player = this.players.get(wager.userId)!;
      player.bankroll += quote.quote;
      player.exposure -= quote.stake;
      quote.isValid = false;
      this.event(
        player.id,
        quote.quote,
        "cashout",
        `Cashed out ${quote.stake} stake for ${quote.quote}`,
        wager.id,
      );
      this.activity(
        player.id,
        `${player.username} cashed out ${quote.stake} stake for ${quote.quote} coins`,
      );
      return { cashout: quote, payout: quote.quote };
    });
  }
  settleMarket(marketId: string): string[] {
    const market = this.market(marketId);
    if (market.outcome !== undefined) return [];
    const progress = this.progressByPlayer.get(market.subjectId)!;
    if (!terminal(progress) && this.possible(market, progress))
      throw new Error("Outcome is not known");
    const wins = this.wins(market, progress);
    market.outcome = wins ? "yes" : "no";
    market.status = "closed";
    market.currentQuote.status = "closed";
    const settled: string[] = [];
    for (const wager of this.wagers.values()) {
      if (wager.marketId !== marketId || wager.status !== "open") continue;
      const payout = wins ? wager.remainingPayout : 0;
      const player = this.players.get(wager.userId)!;
      player.bankroll += payout;
      player.exposure -= wager.remainingStake;
      wager.payout += payout;
      wager.remainingStake = 0;
      wager.remainingPayout = 0;
      wager.status = "settled";
      wager.result = wins ? "won" : "lost";
      this.event(
        player.id,
        payout,
        "market_settlement",
        `${wins ? "Won" : "Lost"} · ${market.subjectLabel}: ${market.title}`,
        wager.id,
      );
      this.activity(
        player.id,
        `${player.username} ${wins ? "won" : "lost"} on ${market.subjectLabel}: ${market.title} · payout ${payout}`,
      );
      settled.push(wager.id);
    }
    return settled;
  }
  getLeaderboard(leagueId: string): LeaderboardEntry[] {
    const league = this.leagues.get(leagueId);
    if (!league) throw new Error("League missing");
    return league.members
      .map((userId) => {
        const p = this.players.get(userId)!;
        const wagers = [...this.wagers.values()].filter(
          (w) => w.userId === userId,
        );
        const starting = this.walletEvents
          .get(userId)!
          .filter((e) => e.type === "credit")
          .reduce((s, e) => s + e.amount, 0);
        const profit = p.bankroll + p.exposure - starting;
        const profits = wagers
          .filter((w) => w.status !== "open")
          .map((w) => ({ ...w, profit: w.payout - w.stake }));
        return {
          userId,
          username: p.username,
          bankroll: p.bankroll,
          dailyProfit: profit,
          weeklyProfit: profit,
          totalAtRisk: p.exposure,
          openPositions: wagers.filter((w) => w.status === "open").length,
          topWin: Math.max(0, ...profits.map((w) => w.profit)),
          bestFriendPrediction: Math.max(
            0,
            ...profits
              .filter((w) => w.subjectId !== userId)
              .map((w) => w.profit),
          ),
        };
      })
      .sort(
        (a, b) =>
          b.weeklyProfit - a.weeklyProfit ||
          b.bankroll + b.totalAtRisk - a.bankroll - a.totalAtRisk ||
          a.username.localeCompare(b.username) ||
          a.userId.localeCompare(b.userId),
      );
  }
  private event(
    userId: string,
    amount: number,
    type: WalletEvent["type"],
    reason: string,
    wagerId?: string,
  ) {
    this.walletEvents.get(userId)!.push({
      id: id("event"),
      userId,
      amount,
      type,
      reason,
      wagerId,
      createdAt: Date.now(),
    });
  }
  private activity(userId: string, message: string) {
    for (const league of this.leagues.values())
      if (league.members.includes(userId))
        this.leagueActivity.get(league.id)!.unshift(message);
  }
  private market(marketId: string) {
    const m = this.markets.get(marketId);
    if (!m) throw new Error("Market missing");
    return m;
  }
  private wager(wagerId: string) {
    const w = this.wagers.get(wagerId);
    if (!w) throw new Error("Wager missing");
    return w;
  }
  private once<T>(requestId: string, args: unknown[], operation: () => T): T {
    if (!requestId) throw new Error("Request ID required");
    const fingerprint = JSON.stringify(args);
    const previous = this.receipts.get(requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new Error("Request ID reused with different input");
      return previous.result as T;
    }
    const result = operation();
    this.receipts.set(requestId, { fingerprint, result });
    return result;
  }
  snapshot(): EngineSnapshot {
    return JSON.parse(
      JSON.stringify({
        version: STORAGE_VERSION,
        revision: this.revision,
        players: [...this.players.values()],
        leagues: [...this.leagues.values()],
        markets: [...this.markets.values()],
        wagers: [...this.wagers.values()],
        walletEvents: [...this.walletEvents.values()].flat(),
        progress: [...this.progressByPlayer.values()],
        sessions: [...this.sessions.values()],
        activity: [...this.leagueActivity],
        cashoutQuotes: [...this.cashoutQuotes.values()],
        receipts: [...this.receipts],
      }),
    ) as EngineSnapshot;
  }
}
export function restoreEngine(input: unknown): RiskleGameEngine {
  // Stored demo data is untrusted. Validate its shape and accounting before displaying it.
  const s = input as EngineSnapshot;
  if (
    !s ||
    s.version !== STORAGE_VERSION ||
    ![
      s.players,
      s.leagues,
      s.markets,
      s.wagers,
      s.walletEvents,
      s.progress,
      s.sessions,
      s.activity,
      s.cashoutQuotes,
      s.receipts,
    ].every(Array.isArray)
  )
    throw new Error("Unsupported or corrupt demo save");
  const e = new RiskleGameEngine();
  e.revision = s.revision ?? 0;
  if (!Number.isSafeInteger(e.revision) || e.revision < 0)
    throw new Error("Corrupt save revision");
  e.players = new Map(s.players.map((p) => [p.id, p]));
  e.leagues = new Map(s.leagues.map((l) => [l.id, l]));
  e.markets = new Map(s.markets.map((m) => [m.id, m]));
  e.wagers = new Map(s.wagers.map((w) => [w.id, w]));
  e.progressByPlayer = new Map(s.progress.map((p) => [p.playerId, p]));
  e.sessions = new Map(s.sessions.map((p) => [p.playerId, p]));
  e.leagueActivity = new Map(s.activity);
  e.cashoutQuotes = new Map(s.cashoutQuotes.map((q) => [q.id, q]));
  e.receipts = new Map(s.receipts);
  for (const p of s.players) {
    const events = s.walletEvents.filter((x) => x.userId === p.id);
    e.walletEvents.set(p.id, events);
    const atRisk = s.wagers
      .filter((w) => w.userId === p.id && w.status === "open")
      .reduce((a, w) => a + w.remainingStake, 0);
    if (
      !p.id ||
      typeof p.username !== "string" ||
      !p.privacy ||
      !Number.isSafeInteger(p.bankroll) ||
      p.bankroll < 0 ||
      !Number.isSafeInteger(p.exposure) ||
      atRisk !== p.exposure ||
      events.some((x) => !Number.isSafeInteger(x.amount)) ||
      events.reduce((a, x) => a + x.amount, 0) !== p.bankroll
    )
      throw new Error("Corrupt wallet save");
  }
  if (
    s.leagues.some(
      (l) =>
        !Array.isArray(l.members) || l.members.some((m) => !e.players.has(m)),
    ) ||
    s.wagers.some(
      (w) =>
        !e.players.has(w.userId) ||
        !e.markets.has(w.marketId) ||
        !coins(w.stake) ||
        !Number.isSafeInteger(w.remainingStake) ||
        w.remainingStake < 0 ||
        w.remainingStake > w.stake ||
        !Number.isSafeInteger(w.remainingPayout) ||
        w.remainingPayout < 0 ||
        (w.status !== "open" && w.remainingStake !== 0),
    ) ||
    s.markets.some(
      (m) => !e.players.has(m.subjectId) || !m.rule || !m.currentQuote,
    ) ||
    s.sessions.some(
      (p) =>
        !e.players.has(p.playerId) ||
        !Array.isArray(p.guesses) ||
        p.guesses.some((g) => !/^[A-Z]{5}$/.test(g)) ||
        p.guesses.length !== e.progressByPlayer.get(p.playerId)?.guessesUsed,
    )
  )
    throw new Error("Corrupt game save");
  return e;
}
export function createEngine() {
  return new RiskleGameEngine();
}
export function createDemo(puzzleId = new Date().toISOString().slice(0, 10)) {
  const e = createEngine();
  for (const [playerId, username] of [
    ["mara", "Mara"],
    ["sarah", "Sarah"],
  ]) {
    e.createUser({ id: playerId, username });
    e.startPuzzle(playerId, puzzleId);
  }
  e.players.get("sarah")!.privacy.shareProgress = true;
  e.createLeague({
    id: "group-chat",
    name: "The Group Chat",
    members: ["mara", "sarah"],
  });
  return e;
}
