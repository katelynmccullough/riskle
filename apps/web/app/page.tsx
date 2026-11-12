"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { type RiskleGameEngine } from "@riskle/game-engine";
import type { CashoutQuote } from "@riskle/shared";
import { PuzzlePanel } from "../components/puzzle-panel";
import { Position, Stat } from "../components/positions";
import {
  loadDemo,
  SAVE_KEY,
  CHANNEL,
  DATABASE,
  transact,
} from "../lib/demo-store";

const requestId = () => crypto.randomUUID();
export default function Page() {
  const [engine, setEngine] = useState<RiskleGameEngine>();
  const [active, setActive] = useState("mara");
  const [leagueId, setLeagueId] = useState("group-chat");
  const [subject, setSubject] = useState("mara");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [playerName, setPlayerName] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [friendId, setFriendId] = useState("");
  const [stake, setStake] = useState(50);
  const [cashout, setCashout] = useState<CashoutQuote>();
  const [now, setNow] = useState(Date.now());
  const [sharingOverride, setSharingOverride] = useState<{
    playerId: string;
    value: boolean;
  }>();
  useEffect(() => {
    const update = (next: RiskleGameEngine) =>
      setEngine((previous) =>
        previous && previous.revision > next.revision ? previous : next,
      );
    const failed = (e: unknown) =>
      setFatal(
        `Could not load the demo: ${String(e)}. The saved data has been kept.`,
      );
    const reload = () => {
      void loadDemo().then(update).catch(failed);
    };
    void transact(() => undefined)
      .then(({ engine: next }) => update(next))
      .catch(failed);
    try {
      setActive(localStorage.getItem("riskle.player") ?? "mara");
    } catch {
      /* Default player remains available. */
    }
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = reload;
    window.addEventListener("focus", reload);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(interval);
      channel.close();
      window.removeEventListener("focus", reload);
    };
  }, []);
  async function run<T>(
    operation: (e: RiskleGameEngine) => T,
    message: (result: T) => string = () => "",
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { engine: next, result } = await transact(operation);
      setEngine((previous) =>
        previous && previous.revision > next.revision ? previous : next,
      );
      setNotice(message(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (fatal)
    return (
      <main className="shell">
        <h1>Riskle save needs attention</h1>
        <p role="alert">{fatal}</p>
        <p>
          To start over, delete the “{DATABASE}” IndexedDB database and any
          legacy “{SAVE_KEY}” localStorage entry in browser storage. This erases
          the local demo.
        </p>
      </main>
    );
  if (!engine)
    return (
      <main className="shell" aria-busy="true">
        Loading your local table…
      </main>
    );
  const player = engine.players.get(active) ?? [...engine.players.values()][0];
  if (!player)
    return <main className="shell">The saved demo has no players.</main>;
  const currentId = player.id;
  const progress = engine.progressByPlayer.get(currentId)!;
  const session = engine.sessions.get(currentId)!;
  const leagues = [...engine.leagues.values()].filter((l) =>
    l.members.includes(currentId),
  );
  const league = leagues.find((l) => l.id === leagueId) ?? leagues[0];
  const members = league?.members ?? [currentId];
  const subjectId = members.includes(subject) ? subject : currentId;
  const subjectPlayer = engine.players.get(subjectId)!;
  const subjectProgress = engine.progressByPlayer.get(subjectId)!;
  const canView =
    subjectId === currentId || subjectPlayer.privacy.shareProgress;
  const wagers = [...engine.wagers.values()]
    .filter((w) => w.userId === currentId)
    .reverse();
  const open = wagers.filter((w) => w.status === "open");
  const events = engine.walletEvents.get(currentId) ?? [];
  const profit =
    player.bankroll +
    player.exposure -
    events.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
  const markets = [...engine.markets.values()].filter(
    (m) => m.subjectId === subjectId,
  );
  const leagueBoard = league ? engine.getLeaderboard(league.id) : [];
  const submit = (f: () => void) => (event: FormEvent) => {
    event.preventDefault();
    f();
  };
  function switchPlayer(value: string) {
    setActive(value);
    setSubject(value);
    try {
      localStorage.setItem("riskle.player", value);
    } catch {
      setError("Player switched, but the preference could not be saved.");
    }
    setCashout(undefined);
    setNotice("");
    setError("");
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <a href="#" className="brand">
            riskle<span>●</span>
          </a>
          <p>Your games. Your wagers. Your friends.</p>
        </div>
        <div className="local-badge">
          LOCAL DEMO <span>•</span> Virtual coins only
        </div>
      </header>
      <div className="notice-bar">
        A puzzle lab for friendly stakes. Provisional simulation odds. All
        players and balances live in this browser.
      </div>
      <section className="player-bar panel" aria-label="Local players">
        <label>
          Playing as
          <select
            aria-label="Active player"
            value={currentId}
            onChange={(e) => switchPlayer(e.target.value)}
          >
            {[...engine.players.values()].map((p) => (
              <option key={p.id} value={p.id}>
                {p.username}
              </option>
            ))}
          </select>
        </label>
        <form
          onSubmit={submit(() => {
            const newId = requestId();
            void run(
              (e) => {
                const p = e.createUser({ id: newId, username: playerName });
                e.startPuzzle(p.id, session.puzzleId);
                return p.username;
              },
              (name) => {
                setPlayerName("");
                return `Created ${name}. Select them to play or opt into sharing.`;
              },
            );
          })}
        >
          <label>
            New test player
            <input
              aria-label="New player name"
              placeholder="Name"
              value={playerName}
              maxLength={24}
              onChange={(e) => setPlayerName(e.target.value)}
              required
            />
          </label>
          <button disabled={busy}>Create player</button>
        </form>
        <label className="check">
          <input
            type="checkbox"
            checked={
              sharingOverride?.playerId === currentId
                ? sharingOverride.value
                : player.privacy.shareProgress
            }
            disabled={busy}
            onChange={(event) => {
              const checked = event.target.checked;
              setSharingOverride({ playerId: currentId, value: checked });
              void run((e) => {
                e.players.get(currentId)!.privacy.shareProgress = checked;
              }).finally(() => setSharingOverride(undefined));
            }}
          />
          Share my progress with league friends
        </label>
      </section>
      <div className="feedback" aria-live="polite">
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <section className="wallet-grid" aria-label="Wallet">
        <Stat
          label="Available bankroll"
          value={player.bankroll.toLocaleString()}
          note="Fictional Riskle Coins"
          accent
        />
        <Stat
          label="Coins at risk"
          value={String(player.exposure)}
          note={`${open.length} open positions`}
        />
        <Stat
          label="Demo profit / loss"
          value={`${profit >= 0 ? "+" : ""}${profit}`}
          note="Available + open stake − starting coins"
        />
        <Stat
          label="Exposure limits"
          value="70% / 50% / 60%"
          note="Total / subject / puzzle, of bankroll + risk"
        />
      </section>
      <div className="play-grid">
        <PuzzlePanel
          key={currentId}
          session={session}
          progress={progress}
          busy={busy}
          onGuess={async (word) => {
            let succeeded = false;
            await run(
              (e) => e.submitGuess(currentId, word, session.guesses.length),
              () => {
                succeeded = true;
                return "Guess recorded. Markets and positions updated.";
              },
            );
            return succeeded;
          }}
        />
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Live prediction desk</p>
              <h2>Back yourself. Back a friend.</h2>
            </div>
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  (e) => {
                    for (const m of e.markets.values())
                      if (m.subjectId === subjectId) e.refreshQuote(m.id);
                  },
                  () => "Current eligible quotes refreshed.",
                )
              }
            >
              Refresh quotes
            </button>
          </div>
          <div className="market-controls">
            <label>
              Wager on
              <select
                aria-label="Market subject"
                value={subjectId}
                onChange={(e) => setSubject(e.target.value)}
              >
                {members.map((member) => (
                  <option key={member} value={member}>
                    {engine.players.get(member)?.username}
                    {member === currentId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stake / add amount
              <input
                aria-label="Wager stake"
                type="number"
                min="1"
                step="1"
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="muted">
            {canView
              ? `${subjectPlayer.username}: ${subjectProgress.status.replace("_", " ")} · ${subjectProgress.guessesUsed}/6 guesses`
              : `${subjectPlayer.username} has not opted into progress sharing. Switch to their player to enable it.`}
          </p>
          <div className="markets">
            {markets.map((m) => {
              const available =
                canView &&
                m.status === "active" &&
                m.currentQuote.expiryTs > now &&
                subjectProgress.isLive;
              return (
                <article className="market" key={m.id}>
                  <div>
                    <strong>{m.title}</strong>
                    <div className="muted small">
                      {m.status === "closed"
                        ? `Closed · ${m.outcome === "yes" ? "prediction won" : "prediction lost"}`
                        : `v${m.currentQuote.version} · ${m.currentQuote.expiryTs <= now ? "quote expired" : `${Math.max(0, Math.ceil((m.currentQuote.expiryTs - now) / 1000))}s left`}`}
                    </div>
                  </div>
                  <div className="market-price">
                    <strong>{m.currentQuote.multiplier.toFixed(2)}×</strong>
                    <span className="small muted">
                      returns{" "}
                      {Number.isSafeInteger(stake) && stake > 0
                        ? Math.floor(
                            (stake *
                              Math.round(m.currentQuote.multiplier * 100)) /
                              100,
                          )
                        : "—"}
                    </span>
                  </div>
                  <button
                    disabled={busy || !available}
                    className="primary"
                    onClick={() =>
                      void run(
                        (e) =>
                          e.placeWager({
                            userId: currentId,
                            marketId: m.id,
                            stake,
                            quoteId: m.currentQuote.id,
                            requestId: requestId(),
                          }),
                        (w) =>
                          `Placed ${w.stake} on ${w.subjectLabel} at ${w.odds}×.`,
                      )
                    }
                  >
                    Wager
                  </button>
                </article>
              );
            })}
          </div>
          <p className="muted small">
            Multipliers include the returned stake. Odds use equal weights for
            remaining guess outcomes plus loss, with a 10% margin. Simulation
            only.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your portfolio</p>
            <h2>Positions & outcomes</h2>
          </div>
          <span className="pill">{open.length} open</span>
        </div>
        {!wagers.length && (
          <p className="empty">
            No positions yet. Pick a prediction and place your first virtual
            wager.
          </p>
        )}
        <div className="positions">
          {wagers.map((w) => (
            <Position
              key={w.id}
              wager={w}
              title={engine.markets.get(w.marketId)!.title}
              busy={busy}
              addAmount={stake}
              onHold={() => {
                const held = engine.hold(w.id);
                setNotice(
                  `Holding ${held.remainingStake} coins on ${w.subjectLabel}; potential remaining return ${held.potentialPayout}. No coins moved.`,
                );
              }}
              onAdd={() =>
                void run(
                  (e) =>
                    e.addStake(
                      w.id,
                      stake,
                      engine.markets.get(w.marketId)!.currentQuote.id,
                      requestId(),
                    ),
                  (added) =>
                    `Added a separate ${added.stake}-coin position at ${added.odds}×. Original position preserved.`,
                )
              }
              onCash={(portion) =>
                void run(
                  (e) => e.quoteCashOut(w.id, portion),
                  (quote) => {
                    setCashout(quote);
                    return "Review the cash-out quote below before confirming.";
                  },
                )
              }
            />
          ))}
        </div>
        {cashout && (
          <div
            className="cashout-review"
            role="region"
            aria-label="Review cash out"
          >
            <h3>Confirm cash out</h3>
            <p>
              Release {cashout.stake} coins of stake for{" "}
              <strong>{cashout.quote} coins</strong>. Remaining stake:{" "}
              {cashout.remainingStake - cashout.stake}. Quote expires in{" "}
              {Math.max(0, Math.ceil((cashout.expiryTs - now) / 1000))}s.
            </p>
            <button
              className="primary"
              disabled={busy || now >= cashout.expiryTs}
              onClick={() =>
                void run(
                  (e) => e.cashOut(cashout.id, requestId()),
                  (result) => {
                    setCashout(undefined);
                    return `Cash-out complete: ${result.payout} coins credited.`;
                  },
                )
              }
            >
              Confirm cash out
            </button>{" "}
            <button onClick={() => setCashout(undefined)}>Cancel</button>
          </div>
        )}
      </section>
      <div className="social-grid">
        <section className="panel">
          <p className="eyebrow">Private tables</p>
          <h2>Your friend leagues</h2>
          <label>
            League
            <select
              aria-label="League"
              value={league?.id ?? ""}
              onChange={(e) => setLeagueId(e.target.value)}
            >
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <form
            className="inline-form"
            onSubmit={submit(
              () =>
                void run(
                  (e) =>
                    e.createLeague({
                      id: requestId(),
                      name: leagueName,
                      members: [currentId],
                    }),
                  (l) => {
                    setLeagueId(l.id);
                    setLeagueName("");
                    return `Created ${l.name}. Add local friends below.`;
                  },
                ),
            )}
          >
            <label>
              New league
              <input
                aria-label="New league name"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                required
                maxLength={48}
              />
            </label>
            <button disabled={busy}>Create league</button>
          </form>
          <form
            className="inline-form"
            onSubmit={submit(
              () =>
                void run(
                  (e) => {
                    if (!league) throw new Error("Create a league first");
                    e.addMember(league.id, friendId);
                  },
                  () => {
                    setFriendId("");
                    return "Local friend added to the league.";
                  },
                ),
            )}
          >
            <label>
              Add existing local friend
              <select
                aria-label="Friend to add"
                value={friendId}
                onChange={(e) => setFriendId(e.target.value)}
                required
              >
                <option value="">Choose a player</option>
                {[...engine.players.values()]
                  .filter((p) => !members.includes(p.id))
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.username}
                    </option>
                  ))}
              </select>
            </label>
            <button disabled={busy || !friendId || !league}>Add friend</button>
          </form>
          <p className="muted small">
            Create test players above, then add them here. League members can
            wager on friends who opt into sharing. Local simulation has no
            invitations or account security.
          </p>
          <h3>Activity</h3>
          <ul className="activity">
            {(engine.leagueActivity.get(league?.id ?? "") ?? [])
              .slice(0, 8)
              .map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
          </ul>
        </section>
        <section className="panel">
          <p className="eyebrow">{league?.name ?? "Your table"}</p>
          <h2>Leaderboard</h2>
          <p className="muted small">
            Ranked by demo profit, then equity, name and ID. Open stakes valued
            at cost.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Available</th>
                  <th>At risk</th>
                  <th>Profit</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {leagueBoard.map((entry, index) => (
                  <tr key={entry.userId}>
                    <td>
                      {index + 1}. {entry.username}
                    </td>
                    <td>{entry.bankroll}</td>
                    <td>{entry.totalAtRisk}</td>
                    <td>
                      {entry.dailyProfit >= 0 ? "+" : ""}
                      {entry.dailyProfit}
                    </td>
                    <td>{entry.openPositions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            This demo tracks one saved puzzle day, with no weekly reset or
            allowances.
          </p>
        </section>
      </div>
      <section className="panel">
        <p className="eyebrow">Every coin accounted for</p>
        <h2>Wallet ledger</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Coins</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {[...events].reverse().map((event) => (
                <tr key={event.id}>
                  <td>{event.type.replaceAll("_", " ")}</td>
                  <td>
                    {event.amount >= 0 ? "+" : ""}
                    {event.amount}
                  </td>
                  <td>{event.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer>
        Riskle · Local puzzle simulation · No real money, prizes or Wordle
        integration. Saved in this browser, synchronized across its tabs.
      </footer>
      <div
        id="riskle-extension-state"
        hidden
        data-state={JSON.stringify({
          game: "riskle-mock",
          player: player.username,
          puzzleId: session.puzzleId,
          status: progress.status,
          guessesUsed: progress.guessesUsed,
          maxGuesses: 6,
          bankroll: player.bankroll,
          exposure: player.exposure,
          source: "mock",
        })}
      />
    </main>
  );
}
