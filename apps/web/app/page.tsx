import { createEngine } from '@riskle/game-engine';

const engine = createEngine();
const player = engine.createUser({ id: 'p1', username: 'mara' });
const friend = engine.createUser({ id: 'p2', username: 'sarah' });
engine.createLeague({ id: 'league-demo', name: 'The Group Chat', members: [player.id, friend.id] });
const market = engine.createMarket({
  id: 'demo-market',
  title: 'Sarah solves in 3 or fewer',
  subjectId: friend.id,
  subjectLabel: 'Sarah',
  marketType: 'friend-performance',
  prediction: 'under-3',
});
const wager = engine.placeWager({ userId: player.id, marketId: market.id, prediction: 'under-3', stake: 100 });
engine.recordProgress({ playerId: friend.id, puzzleId: 'demo-puzzle', status: 'in_progress', guessesUsed: 2, maxGuesses: 6 });
engine.refreshQuote(market.id, 2);

export default function Page() {
  const leaderboard = engine.getLeaderboard('league-demo');

  return (
    <main className="min-h-screen bg-riskle-bg px-6 py-10 text-riskle-foreground">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-riskle-panel p-6 shadow-glow">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-riskle-accent">Riskle</p>
            <h1 className="mt-2 text-4xl font-black">Your games. Your wagers. Your friends.</h1>
          </div>
          <div className="rounded-xl bg-riskle-accent px-4 py-3 text-sm font-bold text-black">
            Bankroll {player.bankroll} coins
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.3fr,0.7fr]">
          <div className="rounded-2xl border border-white/10 bg-riskle-panel p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">Featured market</p>
                <h2 className="mt-3 text-2xl font-bold">{market.title}</h2>
              </div>
              <div className="rounded-full border border-riskle-accent/50 px-3 py-1 text-sm font-semibold text-riskle-accent">
                {market.currentQuote.multiplier}x odds
              </div>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Stat label="Player" value={market.subjectLabel} />
              <Stat label="Current state" value="Guess 2 of 6" />
              <Stat label="Open wager" value={`${wager.stake} coins`} />
            </div>
            <div className="mt-8 flex gap-3">
              <button className="rounded-xl bg-riskle-accent px-4 py-2 font-bold text-black transition hover:brightness-110">
                Hold
              </button>
              <button className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-white transition hover:bg-white/10">
                Add 50 coins
              </button>
              <button className="rounded-xl border border-riskle-success/40 bg-riskle-success/10 px-4 py-2 font-semibold text-riskle-success">
                Cash out
              </button>
            </div>
          </div>

          <aside className="rounded-2xl border border-white/10 bg-riskle-panel p-6">
            <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">Wallet</p>
            <div className="mt-4 text-4xl font-black text-riskle-accent">{player.bankroll}</div>
            <div className="mt-6 space-y-3 text-sm text-zinc-300">
              <Row label="Exposure" value={`${player.exposure} coins`} />
              <Row label="Daily profit" value="+120" />
              <Row label="Open bets" value="2" />
            </div>
          </aside>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-riskle-panel p-6">
            <h3 className="text-xl font-bold">Active bets</h3>
            <div className="mt-6 space-y-4">
              <BetRow title="Sarah solves in 3 or fewer" amount="100" price="1.8x" status="live" />
              <BetRow title="Emma gets it in 2" amount="50" price="2.6x" status="watch" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-riskle-panel p-6">
            <h3 className="text-xl font-bold">Leaderboard</h3>
            <div className="mt-6 space-y-3">
              {leaderboard.map((entry, index) => (
                <div key={entry.userId} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-riskle-accent text-xs font-bold text-black">
                      {index + 1}
                    </span>
                    <div>
                      <div className="font-semibold">{entry.username}</div>
                      <div className="text-xs text-zinc-400">{entry.openPositions} open positions</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-riskle-accent">{entry.bankroll}</div>
                    <div className="text-xs text-zinc-400">coins</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">{label}</div>
      <div className="mt-3 text-lg font-bold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function BetRow({ title, amount, price, status }: { title: string; amount: string; price: string; status: 'live' | 'watch' }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-zinc-400">{amount} coins at {price}</div>
      </div>
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${status === 'live' ? 'bg-riskle-success/10 text-riskle-success' : 'bg-yellow-500/10 text-yellow-300'}`}>
        {status === 'live' ? 'Live' : 'Watching'}
      </span>
    </div>
  );
}
