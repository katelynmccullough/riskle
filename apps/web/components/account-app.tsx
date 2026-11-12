"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  command,
  loadPlatform,
  type PlatformState,
  type PlatformPosition,
  type History,
  type Ranking,
} from "../lib/platform-client";
const submit = (operation: () => void) => (event: FormEvent) => {
  event.preventDefault();
  operation();
};
export function AccountApp({
  client,
  extension = false,
}: {
  client: SupabaseClient | null;
  extension?: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [state, setState] = useState<PlatformState>(),
    [history, setHistory] = useState<History>(),
    [rankings, setRankings] = useState<Ranking[]>([]);
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [username, setUsername] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [stake, setStake] = useState(50),
    [subject, setSubject] = useState("");
  const [rankingDate, setRankingDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );
  const [league, setLeague] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [weekly, setWeekly] = useState(false);
  const [month, setMonth] = useState(
      new Date().toLocaleDateString("en-CA").slice(0, 7),
    ),
    [quote, setQuote] = useState<{
      id: string;
      credit: number;
      stake: number;
      expires_at: string;
    }>();
  const [now, setNow] = useState(Date.now()),
    [opponent, setOpponent] = useState("");
  const seq = useRef(0),
    mounted = useRef(true);
  const reload = useCallback(async () => {
    if (!client) return;
    const version = ++seq.current;
    try {
      const data = await loadPlatform(client);
      if (mounted.current && version === seq.current) {
        setState(data);
        setError("");
      }
    } catch (e) {
      if (mounted.current && version === seq.current)
        setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);
  useEffect(() => {
    const invite = new URLSearchParams(location.search).get("invite");
    if (invite && /^[a-f0-9]{32}$/.test(invite)) setCode(invite);
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!client) return;
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      if (data.session) void reload();
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setMode("password");
      if (!next) {
        setState(undefined);
        setHistory(undefined);
        setRankings([]);
      } else setTimeout(() => void reload(), 0);
    });
    const channel = client
      .channel("riskle-account")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_sessions" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_wallets" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_positions" },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_members" },
        () => void reload(),
      )
      .subscribe();
    // Authenticated polling also detects missed Realtime events and expiry of progress freshness.
    const interval = setInterval(
        () =>
          void client.auth.getSession().then(({ data }) => {
            if (data.session) void reload();
          }),
        5000,
      ),
      clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      subscription.unsubscribe();
      void client.removeChannel(channel);
      clearInterval(interval);
      clearInterval(clock);
    };
  }, [client, reload]);
  useEffect(() => {
    if (!client || !session || !state) return;
    let valid = true;
    void client
      .rpc("riskle_history", {
        month_start: `${month}-01`,
        offset_minutes: new Date().getTimezoneOffset(),
      })
      .then(({ data, error }) => {
        if (valid && !error) setHistory(data as History);
      });
    const day = new Date(`${rankingDate}T12:00:00`);
    if (weekly) day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    void client
      .rpc("riskle_rankings", {
        league_id: league || null,
        period_start: date,
        period_days: weekly ? 7 : 1,
      })
      .then(({ data, error }) => {
        if (valid) {
          if (error) setError(error.message);
          else setRankings(data as Ranking[]);
        }
      });
    return () => {
      valid = false;
    };
  }, [client, session, state, month, league, weekly, rankingDate]);
  async function act<T = Record<string, unknown>>(
    action: string,
    payload: Record<string, unknown>,
    success?: (data: T) => string,
  ) {
    if (!client || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await command<T>(client, action, payload);
      await reload();
      if (success) setNotice(success(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function authenticate() {
    if (!client) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.toLowerCase(), display_name: username },
            emailRedirectTo: extension ? undefined : location.origin,
          },
        });
        if (error) throw error;
        setNotice(
          data.session
            ? "Account created and signed in."
            : "Signup accepted. Confirm the email before signing in.",
        );
      } else if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: extension ? undefined : `${location.origin}/?recovery=1`,
        });
        if (error) throw error;
        setNotice(
          "Reset request accepted. Check your email if the account exists.",
        );
      } else if (mode === "password") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMode("login");
        setNotice("Password updated.");
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const profile = state?.profile;
  const visibleSessions = (state?.sessions ?? []).filter(
    (s) =>
      !league ||
      state?.members.some(
        (m) => m.league_id === league && m.user_id === s.user_id,
      ),
  );
  const selected =
    visibleSessions.find((s) => s.id === subject) ??
    visibleSessions.find((s) => s.user_id === profile?.id) ??
    visibleSessions[0];
  const markets = (state?.markets ?? []).filter(
    (m) => m.session_id === selected?.id,
  );
  const friendName = (id: string) =>
    state?.profiles.find((p) => p.id === id)?.display_name ?? "League member";
  return (
    <main className={`shell account-shell ${extension ? "extension-app" : ""}`}>
      <header className="masthead">
        <div>
          <a
            className="brand"
            href={
              extension
                ? "https://www.nytimes.com/games/wordle/index.html"
                : "/"
            }
            target={extension ? "_blank" : undefined}
          >
            riskle<span>●</span>
          </a>
          <p>Play Wordle there. Bring the stakes here.</p>
        </div>
        {!extension && (
          <a className="pill" href="/demo">
            Mock test lab
          </a>
        )}
      </header>
      <div className="notice-bar">
        Unofficial companion. Fictional coins only. Browser-observed results and
        simulation odds are provisional.
      </div>
      <div className="feedback" aria-live="polite">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
      {!client ? (
        <section className="panel">
          <h1>Connect your Supabase project</h1>
          <p>
            Configure the project URL and publishable key. No secret key is
            needed. See docs/PHASE3_SETUP.md.
          </p>
        </section>
      ) : !session || mode === "password" ? (
        <section className="panel auth-panel">
          <h1>
            {mode === "signup"
              ? "Create your Riskle account"
              : mode === "reset"
                ? "Reset your password"
                : mode === "password"
                  ? "Choose a new password"
                  : "Welcome back"}
          </h1>
          <form
            className="account-form"
            onSubmit={submit(() => void authenticate())}
          >
            {mode !== "password" && (
              <label>
                Email
                <input
                  aria-label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
            )}
            {mode === "signup" && (
              <label>
                Unique username
                <input
                  aria-label="Username"
                  pattern="[a-zA-Z0-9_]{3,24}"
                  maxLength={24}
                  minLength={3}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Password
                <input
                  aria-label="Password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {mode === "signup"
                ? "Sign up"
                : mode === "reset"
                  ? "Send reset email"
                  : mode === "password"
                    ? "Update password"
                    : "Log in"}
            </button>
          </form>
          <div className="position-actions">
            {["login", "signup", "reset"]
              .filter((v) => v !== mode)
              .map((v) => (
                <button
                  key={v}
                  disabled={busy}
                  onClick={() => {
                    setMode(v);
                    setError("");
                    setNotice("");
                  }}
                >
                  {v === "login"
                    ? "Log in"
                    : v === "signup"
                      ? "Create account"
                      : "Forgot password"}
                </button>
              ))}
          </div>
        </section>
      ) : (
        <>
          <section className="panel section-heading">
            <div>
              <h1>{profile?.display_name ?? session.user.email}</h1>
              <p className="muted">
                {profile
                  ? `@${profile.username}`
                  : "Account signed in. Waiting for database setup."}
              </p>
            </div>
            <button
              onClick={() =>
                void client.auth.signOut().then(({ error }) => {
                  if (error) setError(error.message);
                })
              }
            >
              Log out
            </button>
            <button onClick={() => void reload()}>Refresh account</button>
          </section>
          {state && profile && (
            <>
              <section className="wallet-grid">
                <div className="stat panel accent">
                  <p className="eyebrow">Available coins</p>
                  <strong>{state.wallet.balance}</strong>
                </div>
                <div className="stat panel">
                  <p className="eyebrow">At risk</p>
                  <strong>{state.wallet.exposure}</strong>
                </div>
                <div className="stat panel">
                  <p className="eyebrow">Career profit</p>
                  <strong>
                    {state.wallet.balance + state.wallet.exposure - 1000}
                  </strong>
                </div>
              </section>
              <section className="panel">
                <h2>Live Wordle desk</h2>
                <p className="muted small">
                  Open the official Wordle intro with the extension loaded. It
                  observes only revealed tile states and visible puzzle
                  identity. Missing or stale progress suspends wagers.
                </p>
                <div className="market-controls">
                  <label>
                    Player / puzzle
                    <select
                      aria-label="Live player"
                      value={selected?.id ?? ""}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      <option value="" disabled>
                        No observed games yet
                      </option>
                      {visibleSessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {friendName(s.user_id)} · {s.puzzle_date} ·{" "}
                          {s.guesses}/6
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Stake
                    <input
                      aria-label="Stake"
                      type="number"
                      min="1"
                      step="1"
                      value={stake}
                      onChange={(e) => setStake(Number(e.target.value))}
                    />
                  </label>
                  <button
                    disabled={busy}
                    onClick={() => void act("refresh", {})}
                  >
                    Refresh odds
                  </button>
                </div>
                {selected && (
                  <p>
                    {selected.puzzle_id} · {selected.status} · {selected.trust}{" "}
                    ·{" "}
                    {selected.live &&
                    now - Date.parse(selected.last_seen) < 12000
                      ? "Live progress"
                      : "Live wagering suspended"}
                  </p>
                )}
                {!selected && (
                  <p className="empty">
                    No games observed for this account yet. Play on the official
                    Wordle website; this dashboard does not host Wordle.
                  </p>
                )}
                <div className="markets">
                  {markets.map((m) => (
                    <article className="market" key={m.id}>
                      <div>
                        <strong>{m.title}</strong>
                        {m.opponent_id && (
                          <p className="small">
                            Opponent:{" "}
                            {friendName(
                              state.sessions.find((s) => s.id === m.opponent_id)
                                ?.user_id ?? "",
                            )}
                          </p>
                        )}
                        <p className="small muted">
                          {m.status === "closed"
                            ? m.outcome
                            : !m.eligible
                              ? "Suspended / private / stale"
                              : "Provisional simulation"}
                        </p>
                      </div>
                      <strong>{(m.odds / 100).toFixed(2)}×</strong>
                      <button
                        className="primary"
                        disabled={
                          busy || !m.eligible || Date.parse(m.expires_at) <= now
                        }
                        onClick={() =>
                          void act(
                            "place",
                            { marketId: m.id, quoteId: m.quote_id, stake },
                            (p) => `Position ${String(p.id).slice(-8)} placed.`,
                          )
                        }
                      >
                        Wager
                      </button>
                    </article>
                  ))}
                </div>
                {selected && (
                  <form
                    className="inline-form"
                    onSubmit={submit(
                      () =>
                        void act(
                          "head_to_head",
                          { sessionId: selected.id, opponentId: opponent },
                          () =>
                            "Head-to-head market created from the observed sessions.",
                        ),
                    )}
                  >
                    <label>
                      Head-to-head opponent
                      <select
                        value={opponent}
                        onChange={(e) => setOpponent(e.target.value)}
                        required
                      >
                        <option value="">Choose a league player</option>
                        {visibleSessions
                          .filter(
                            (s) =>
                              s.user_id !== selected.user_id &&
                              s.puzzle_id === selected.puzzle_id,
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {friendName(s.user_id)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button disabled={busy || !opponent}>
                      Create prediction
                    </button>
                  </form>
                )}
              </section>
              <section className="panel">
                <h2>Your positions</h2>
                {!state.positions.length && (
                  <p className="empty">No positions yet.</p>
                )}
                <div className="positions">
                  {state.positions.map((p) => (
                    <RemotePosition
                      key={p.id}
                      position={p}
                      name={friendName(p.subject_id)}
                      busy={busy}
                      addAmount={stake}
                      onHold={() =>
                        void act<PlatformPosition>(
                          "hold",
                          { positionId: p.id },
                          (held) =>
                            `Holding ${held.remaining_stake} stake; remaining potential return ${held.remaining_payout}.`,
                        )
                      }
                      onAdd={() => {
                        const m = state.markets.find(
                          (m) => m.id === p.market_id,
                        );
                        if (m)
                          void act(
                            "add_stake",
                            { positionId: p.id, quoteId: m.quote_id, stake },
                            () =>
                              "Additional stake entered as a separate position.",
                          );
                        else setError("Underlying market is unavailable.");
                      }}
                      onQuote={(amount) =>
                        void act<typeof quote>(
                          "cashout_quote",
                          { positionId: p.id, stake: amount },
                          (q) => {
                            setQuote(q);
                            return "Review the cash-out quote before confirming.";
                          },
                        )
                      }
                    />
                  ))}
                </div>
                {quote && (
                  <div className="cashout-review">
                    <h3>Confirm cash out</h3>
                    <p>
                      Release {quote.stake} stake for {quote.credit} coins ·
                      expires in{" "}
                      {Math.max(
                        0,
                        Math.ceil((Date.parse(quote.expires_at) - now) / 1000),
                      )}
                      s.
                    </p>
                    <button
                      className="primary"
                      disabled={busy || Date.parse(quote.expires_at) <= now}
                      onClick={() =>
                        void act("cashout", { quoteId: quote.id }, () => {
                          setQuote(undefined);
                          return "Cash-out committed by the database.";
                        })
                      }
                    >
                      Confirm cash out
                    </button>
                    <button onClick={() => setQuote(undefined)}>Cancel</button>
                  </div>
                )}
              </section>
              <div className="social-grid">
                <section className="panel">
                  <h2>Your leagues</h2>
                  <label>
                    Selected league
                    <select
                      value={league}
                      onChange={(e) => setLeague(e.target.value)}
                    >
                      <option value="">Global opt-in rankings</option>
                      {state.leagues.map((l) => (
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
                        void act("create_league", { name }, (l) => {
                          setLeague(String(l.id));
                          setName("");
                          return "League created.";
                        }),
                    )}
                  >
                    <label>
                      League name
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
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
                        void act("join_league", { code }, (l) => {
                          setLeague(String(l.leagueId));
                          setCode("");
                          return "Joined the league.";
                        }),
                    )}
                  >
                    <label>
                      Invitation code
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.trim())}
                        required
                      />
                    </label>
                    <button disabled={busy}>Join league</button>
                  </form>
                  {league && (
                    <>
                      <h3>Members</h3>
                      <ul>
                        {state.members
                          .filter((m) => m.league_id === league)
                          .map((m) => (
                            <li key={m.user_id}>{friendName(m.user_id)}</li>
                          ))}
                      </ul>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act("leave_league", { leagueId: league }, () => {
                            setLeague("");
                            return "Left the league.";
                          })
                        }
                      >
                        Leave league
                      </button>
                      {state.invites
                        .filter((i) => i.league_id === league)
                        .map((invite) => (
                          <div key={invite.league_id}>
                            <p>
                              Invite code:{" "}
                              <code className="invite-code">{invite.code}</code>
                            </p>
                            <button
                              onClick={() =>
                                void navigator.clipboard
                                  .writeText(
                                    extension
                                      ? invite.code
                                      : `${location.origin}/?invite=${invite.code}`,
                                  )
                                  .then(
                                    () => setNotice("Invitation link copied."),
                                    () =>
                                      setError(
                                        "Clipboard unavailable. Copy the code above.",
                                      ),
                                  )
                              }
                            >
                              Copy invitation
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act("regenerate_invite", {
                                  leagueId: league,
                                })
                              }
                            >
                              Regenerate invite
                            </button>
                          </div>
                        ))}
                    </>
                  )}
                </section>
                <section className="panel">
                  <h2>{weekly ? "Weekly" : "Daily"} rankings</h2>
                  <label>
                    Ranking date
                    <input
                      type="date"
                      value={rankingDate}
                      onChange={(e) => setRankingDate(e.target.value)}
                      required
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={weekly}
                      onChange={(e) => setWeekly(e.target.checked)}
                    />
                    Use weekly profit
                  </label>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Available</th>
                          <th>Risk</th>
                          <th>Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankings.map((r, i) => (
                          <tr key={r.id}>
                            <td>
                              {i + 1}. {r.username}
                            </td>
                            <td>{r.balance}</td>
                            <td>{r.exposure}</td>
                            <td>{r.profit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="small muted">
                    Global rankings include only members who opt in. League
                    rankings include their members.
                  </p>
                </section>
              </div>
              <section className="panel">
                <h2>Your game calendar</h2>
                <label>
                  Month
                  <input
                    aria-label="History month"
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </label>
                {history && (
                  <>
                    <p>
                      {history.stats.wins}/{history.stats.games} wins (
                      {history.stats.games
                        ? Math.round(
                            (100 * history.stats.wins) / history.stats.games,
                          )
                        : 0}
                      %) · average winning guesses{" "}
                      {history.stats.average ?? "—"} · streak{" "}
                      {history.stats.streak} · longest{" "}
                      {history.stats.longestStreak}
                    </p>
                    <PerformanceTrend days={history.days} />
                    <div className="calendar">
                      {Array.from(
                        {
                          length: new Date(
                            Number(month.slice(0, 4)),
                            Number(month.slice(5)),
                            0,
                          ).getDate(),
                        },
                        (_, index) => {
                          const date = `${month}-${String(index + 1).padStart(2, "0")}`,
                            entry = history.days.find(
                              (d) => d.puzzle_date === date,
                            );
                          return (
                            <div
                              className={`calendar-day ${entry?.status === "completed" ? "won" : ""}`}
                              key={date}
                            >
                              <strong>{index + 1}</strong>
                              <span>
                                {entry
                                  ? `${entry.status} ${entry.guesses}/6`
                                  : "—"}
                              </span>
                              {entry?.daily_rank && (
                                <span>
                                  Provisional rank #{entry.daily_rank}
                                </span>
                              )}
                              {entry && (
                                <span>
                                  {entry.profit} coins · {entry.trust}
                                </span>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                    <ul>
                      {history.days.map((day) => (
                        <li key={day.id}>
                          {day.puzzle_date}: {day.status} in {day.guesses} ·
                          provisional{" "}
                          <button
                            className="text-button"
                            onClick={() => {
                              const reason = prompt(
                                "Describe the issue (10–1000 characters). Reports are reviewed; they do not automatically refund losses.",
                              );
                              if (reason)
                                void act(
                                  "dispute",
                                  { sessionId: day.id, reason },
                                  () => "Dispute recorded for review.",
                                );
                            }}
                          >
                            Report issue
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
              <section className="panel">
                <h2>Account settings</h2>
                <ProfileSettings
                  key={`${profile.id}:${profile.username}:${profile.share_progress}`}
                  profile={profile}
                  busy={busy}
                  save={(payload) =>
                    void act("profile", payload, () => "Profile saved.")
                  }
                />
              </section>
              <section className="panel">
                <h2>Wallet ledger</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Action</th>
                        <th>Coins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.ledger.map((e) => (
                        <tr key={e.id}>
                          <td>{new Date(e.created_at).toLocaleString()}</td>
                          <td>{e.kind}</td>
                          <td>{e.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
      <footer>
        Wordle is played on The New York Times website. Riskle is unofficial. No
        real-money value, prizes or guaranteed result verification.
      </footer>
    </main>
  );
}
function ProfileSettings({
  profile,
  busy,
  save,
}: {
  profile: PlatformState["profile"];
  busy: boolean;
  save: (payload: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(profile.display_name),
    [username, setUsername] = useState(profile.username),
    [avatar, setAvatar] = useState(profile.avatar_url ?? ""),
    [sharing, setSharing] = useState(profile.share_progress),
    [publicRanking, setPublic] = useState(profile.public_rankings);
  return (
    <form
      className="account-form"
      onSubmit={submit(() =>
        save({
          displayName: name,
          username,
          avatarUrl: avatar,
          shareProgress: sharing,
          publicRankings: publicRanking,
        }),
      )}
    >
      {profile.avatar_url && (
        <img
          className="profile-avatar"
          src={profile.avatar_url}
          alt={`${profile.display_name}'s avatar`}
          referrerPolicy="no-referrer"
        />
      )}
      <label>
        Display name
        <input
          value={name}
          maxLength={48}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label>
        Username
        <input
          value={username}
          pattern="[a-z0-9_]{3,24}"
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </label>
      <label>
        Profile picture HTTPS URL
        <input
          value={avatar}
          type="url"
          pattern="https://.*"
          onChange={(e) => setAvatar(e.target.value)}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={sharing}
          onChange={(e) => setSharing(e.target.checked)}
        />
        Share live progress with league members
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={publicRanking}
          onChange={(e) => setPublic(e.target.checked)}
        />
        Appear in global rankings
      </label>
      <button className="primary" disabled={busy}>
        Save settings
      </button>
    </form>
  );
}
function RemotePosition({
  position: p,
  name,
  busy,
  addAmount,
  onHold,
  onAdd,
  onQuote,
}: {
  position: PlatformPosition;
  name: string;
  busy: boolean;
  addAmount: number;
  onHold: () => void;
  onAdd: () => void;
  onQuote: (amount: number) => void;
}) {
  const [portion, setPortion] = useState(25);
  return (
    <article className="position">
      <div className="section-heading">
        <strong>
          {name} · {p.title}
        </strong>
        <span className="pill">{p.status}</span>
      </div>
      <p>
        {p.puzzle_date} · original {p.stake} at {(p.odds / 100).toFixed(2)}× ·
        potential {p.potential}
      </p>
      <p>
        Remaining stake {p.remaining_stake} · remaining payout{" "}
        {p.remaining_payout} · paid {p.paid} · realized net{" "}
        {p.paid - (p.stake - p.remaining_stake)}
      </p>
      {p.status === "open" && (
        <div className="position-actions">
          <button disabled={busy} onClick={onHold}>
            Hold
          </button>
          <button disabled={busy} onClick={onAdd}>
            Add {addAmount} stake
          </button>
          <button disabled={busy} onClick={() => onQuote(p.remaining_stake)}>
            Full cash out
          </button>
          <label>
            Stake to release
            <input
              type="number"
              value={portion}
              min={1}
              max={p.remaining_stake}
              step={1}
              onChange={(e) => setPortion(Number(e.target.value))}
            />
          </label>
          <button
            disabled={
              busy ||
              !Number.isInteger(portion) ||
              portion < 1 ||
              portion > p.remaining_stake
            }
            onClick={() => onQuote(portion)}
          >
            Quote partial
          </button>
        </div>
      )}
    </article>
  );
}

function PerformanceTrend({ days }: { days: History["days"] }) {
  const finished = days.filter(
    (day) => day.status === "completed" || day.status === "lost",
  );
  if (finished.length < 2)
    return (
      <p className="muted small">
        Play on two puzzle dates to see a performance trend.
      </p>
    );
  const point = (index: number, guesses: number) =>
    `${20 + (index * 460) / Math.max(1, finished.length - 1)},${15 + (guesses - 1) * 20}`;
  return (
    <figure>
      <figcaption>
        Guess count over the selected month (lower is better)
      </figcaption>
      <svg
        role="img"
        aria-label="Guess counts by puzzle date"
        viewBox="0 0 500 150"
        style={{ width: "100%", maxWidth: 700 }}
      >
        <line x1="20" y1="125" x2="480" y2="125" stroke="#666" />
        <polyline
          fill="none"
          stroke="#f4e65c"
          strokeWidth="2"
          points={finished.map((day, i) => point(i, day.guesses)).join(" ")}
        />
        {finished.map((day, i) => {
          const [x, y] = point(i, day.guesses).split(",");
          return (
            <g key={day.id}>
              <circle
                cx={x}
                cy={y}
                r="4"
                fill={day.status === "completed" ? "#22c55e" : "#ef4444"}
              >
                <title>
                  {day.puzzle_date}: {day.status}, {day.guesses} guesses
                </title>
              </circle>
              {(i === 0 ||
                i === finished.length - 1 ||
                i % Math.ceil(finished.length / 6) === 0) && (
                <text
                  x={x}
                  y="145"
                  textAnchor="middle"
                  fill="#aaa"
                  fontSize="8"
                >
                  {day.puzzle_date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
