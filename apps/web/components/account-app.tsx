"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlatformPosition, PlatformSession } from "../lib/platform-client";
import {
  dailySummary,
  localDate,
  playerSessions,
  terminal,
  type DailySummary,
} from "../lib/game-experience";
import { useRiskleAccount } from "./riskle/use-riskle-account";
import { AuthGate } from "./riskle/auth-gate";
import {
  Avatar,
  Celebration,
  CoinBalance,
  EmptyState,
  EventToast,
  Icon,
  Pill,
  SectionTitle,
  Wordmark,
} from "./riskle/primitives";
import {
  CashOutSheet,
  GuidedWager,
  WagerConfirmation,
  type WagerReview,
} from "./riskle/wager-flow";
import {
  ActiveBetCard,
  AddStakeSheet,
  BetsView,
  ResultSummary,
  ShareResultSheet,
} from "./riskle/bets-and-results";
import { FriendsView } from "./riskle/friends";
import {
  HelpView,
  HistoryView,
  Onboarding,
  ProfileView,
  SettingsView,
  WalletView,
} from "./riskle/profile-and-history";
type View =
  | "overview"
  | "play"
  | "friends"
  | "bets"
  | "profile"
  | "history"
  | "wallet"
  | "settings"
  | "help";
const extensionTabs: [View, string, string][] = [
  ["play", "Play", "play"],
  ["friends", "Friends", "friends"],
  ["bets", "Bets", "bets"],
  ["profile", "Profile", "profile"],
];
const webTabs: [View, string, string][] = [
  ["overview", "Your corner", "play"],
  ["friends", "Your people", "friends"],
  ["bets", "Your bets", "bets"],
  ["history", "Puzzle history", "history"],
  ["wallet", "Coin trail", "wallet"],
  ["settings", "Settings", "settings"],
  ["help", "A little help", "help"],
];
export function AccountApp({
  client,
  extension = false,
  onConnectionSettings,
}: {
  client: SupabaseClient | null;
  extension?: boolean;
  onConnectionSettings?: () => void;
}) {
  const account = useRiskleAccount(client),
    [view, setView] = useState<View>(extension ? "play" : "overview"),
    [selectedId, setSelectedId] = useState(""),
    [review, setReview] = useState<WagerReview>(),
    [adding, setAdding] = useState<PlatformPosition>(),
    [cashing, setCashing] = useState<PlatformPosition>(),
    [sharing, setSharing] = useState<DailySummary>(),
    [menu, setMenu] = useState(false),
    [tour, setTour] = useState(false),
    [tourDismissed, setTourDismissed] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!extension) {
      const requested = new URLSearchParams(location.search).get("view");
      if (
        requested &&
        [
          "overview",
          "play",
          "friends",
          "bets",
          "profile",
          "history",
          "wallet",
          "settings",
          "help",
        ].includes(requested)
      )
        setView(requested as View);
    }
    try {
      setTourDismissed(
        localStorage.getItem("riskle.tour.dismissed") === "true",
      );
    } catch {
      setTourDismissed(false);
    }
  }, [extension]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);
  useEffect(() => {
    if (!account.events.length) return;
    const ids = account.events.map((e) => e.id);
    const timeout = setTimeout(() => ids.forEach(account.dismissEvent), 10000);
    return () => clearTimeout(timeout);
  }, [account.events]);
  function navigate(next: View) {
    setView(next);
    setMenu(false);
    account.setError("");
  }
  function finishTour() {
    setTour(false);
    setTourDismissed(true);
    try {
      localStorage.setItem("riskle.tour.dismissed", "true");
    } catch {
      /* This preference does not affect account data. */
    }
  }
  async function logout() {
    const result = await client?.auth.signOut();
    if (result?.error) account.setError(result.error.message);
    setMenu(false);
  }
  if (!account.session || account.recovery)
    return <AuthGate account={account} extension={extension} />;
  const state = account.state,
    profile = state?.profile;
  const sessions = state
    ? playerSessions(state).filter((s) => s.puzzle_date === localDate())
    : [];
  const own = sessions.find((s) => s.user_id === profile?.id),
    selected = sessions.find((s) => s.id === selectedId) ?? own ?? sessions[0];
  const summary =
    state && own
      ? dailySummary(
          state,
          own,
          account.todayHistory,
          account.rankings,
          account.league,
          account.weekly,
          account.rankingDate,
        )
      : undefined;
  const major = account.events.find(
    (e) => e.kind === "won" || e.kind === "lost",
  );
  const activeTab = ["history", "settings", "wallet", "help"].includes(view)
    ? "profile"
    : view;
  const onFriend = (s: PlatformSession) => {
    setSelectedId(s.id);
    navigate("play");
  };
  return (
    <div className={`rk-app ${extension ? "rk-extension" : "rk-web"}`}>
      {!extension && (
        <aside className="rk-sidebar">
          <a href="/" className="rk-sidebar-brand" aria-label="Riskle home">
            <Wordmark />
          </a>
          <span className="rk-sidebar-tagline">
            A little friendly competition.
          </span>
          <nav aria-label="Website navigation">
            {webTabs.map(([key, label, icon]) => (
              <button
                key={key}
                aria-label={label}
                className={view === key ? "is-active" : ""}
                aria-current={view === key ? "page" : undefined}
                onClick={() => navigate(key)}
              >
                <Icon name={icon} />
                {label}
                {key === "bets" &&
                  state &&
                  state.positions.some((p) => p.status === "open") && (
                    <span className="rk-nav-count">
                      {
                        state.positions.filter((p) => p.status === "open")
                          .length
                      }
                    </span>
                  )}
              </button>
            ))}
          </nav>
          <div className="rk-sidebar-note">
            <Icon name="spark" size={26} />
            <strong>Keep it friendly.</strong>
            <p>
              Just-for-fun coins.
              <br />
              No real-money stakes.
            </p>
            <a className="rk-link" href="/demo">
              Visit the test lab <Icon name="arrow" size={14} />
            </a>
          </div>
          <span className="rk-sidebar-footer">Unofficial. Unbothered.</span>
        </aside>
      )}
      <div className="rk-main">
        <header className="rk-header">
          {extension ? (
            <Wordmark />
          ) : (
            <span className="rk-header-breadcrumb">
              {webTabs.find(([key]) => key === view)?.[1] ?? "Your play desk"}
            </span>
          )}
          <div className="rk-header-actions">
            <button
              className="rk-icon-button"
              aria-label="Refresh account"
              disabled={account.busy}
              onClick={() => void account.reload()}
            >
              <Icon name="history" size={18} />
            </button>
            <div className="rk-account-menu" ref={menuRef}>
              <button
                className="rk-avatar-button"
                aria-label="Account menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Avatar
                  name={profile?.display_name ?? "You"}
                  url={profile?.avatar_url}
                  size="small"
                />
              </button>
              {menu && (
                <div className="rk-menu-popover">
                  <strong>
                    {profile?.display_name ?? account.session.user.email}
                  </strong>
                  <button onClick={() => navigate("profile")}>
                    Your profile
                  </button>
                  <button onClick={() => navigate("settings")}>Settings</button>
                  <button onClick={() => void logout()}>Log out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="rk-content" id="main-content">
          {account.error && (
            <div className="rk-error-banner" role="alert">
              <Icon name="help" size={18} />
              <p>{account.error}</p>
              <button
                className="rk-icon-button"
                aria-label="Dismiss error"
                onClick={() => account.setError("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {account.notice && (
            <div className="rk-inline-notice" role="status">
              <Icon name="check" size={17} />
              <p>{account.notice}</p>
              <button
                className="rk-icon-button"
                aria-label="Dismiss message"
                onClick={() => account.setNotice("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {!state || !profile ? (
            <>
              {account.loading ? (
                <div
                  aria-busy="true"
                  aria-label="Loading your account"
                  className="rk-loading-layout"
                >
                  <div className="rk-skeleton" />
                  <div className="rk-skeleton" />
                </div>
              ) : (
                <div className="rk-card">
                  <EmptyState
                    icon="settings"
                    title="Your account is signed in."
                  >
                    Your game space will appear when the database is ready. Your
                    existing account and history are not changed by this screen.
                  </EmptyState>
                  <button
                    className="rk-button rk-button-secondary rk-full"
                    onClick={() => void account.reload()}
                  >
                    Try again
                  </button>
                  <button
                    className="rk-button rk-button-quiet rk-full"
                    onClick={() => void logout()}
                  >
                    Log out
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {extension && (
                <CoinBalance
                  balance={state.wallet.balance}
                  exposure={state.wallet.exposure}
                  profit={summary?.profit}
                />
              )}
              {major && (
                <Celebration
                  event={major}
                  dismiss={() => account.dismissEvent(major.id)}
                  onView={() => {
                    navigate("bets");
                    account.dismissEvent(major.id);
                  }}
                />
              )}
              {!tourDismissed &&
                (view === "overview" || view === "profile") && (
                  <div className="rk-tour-banner">
                    <div>
                      <strong>New around here?</strong>
                      <span>Six tiny steps. Then it’s your call.</span>
                    </div>
                    <button className="rk-link" onClick={() => setTour(true)}>
                      Quick tour <Icon name="arrow" size={14} />
                    </button>
                    <button
                      className="rk-icon-button"
                      aria-label="Dismiss onboarding"
                      onClick={finishTour}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                )}
              {view === "overview" && (
                <>
                  <div className="rk-page-intro">
                    <span className="rk-eyebrow">Good to have you here.</span>
                    <h1>{profile.display_name}</h1>
                    <p>Your puzzle habit has good company.</p>
                  </div>
                  <div className="rk-overview-grid">
                    <section className="rk-web-hero">
                      <Pill tone="purple">Your daily side quest</Pill>
                      <h2>
                        A good guess.
                        <br />
                        <em>An even better rivalry.</em>
                      </h2>
                      <p>
                        The fun lives beside Wordle. Open Riskle’s Chrome side
                        panel to make a call while you play.
                      </p>
                      <div className="rk-hero-actions">
                        <a
                          className="rk-button rk-button-primary"
                          href="https://www.nytimes.com/games/wordle/index.html"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open Wordle <Icon name="arrow" size={17} />
                        </a>
                        <button
                          className="rk-button rk-button-quiet"
                          onClick={() => navigate("help")}
                        >
                          Set up the extension
                        </button>
                      </div>
                      <div className="rk-web-hero-art" aria-hidden="true">
                        <span>
                          <Icon name="play" size={38} />
                        </span>
                        <span>
                          <Icon name="coin" size={48} />
                        </span>
                        <span>
                          <Icon name="friends" size={36} />
                        </span>
                      </div>
                    </section>
                    <div className="rk-overview-coins">
                      <CoinBalance
                        balance={state.wallet.balance}
                        exposure={state.wallet.exposure}
                        profit={summary?.profit}
                      />
                      <div className="rk-web-stat-row">
                        <span>
                          <strong>
                            {account.todayHistory?.stats.streak ?? "—"}
                          </strong>
                          day streak
                        </span>
                        <span>
                          <strong>{state.leagues.length}</strong>
                          {state.leagues.length === 1 ? "league" : "leagues"}
                        </span>
                        <span>
                          <strong>
                            {account.todayHistory?.stats.average ?? "—"}
                          </strong>
                          avg. guesses
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rk-overview-bottom">
                    <section>
                      <SectionTitle
                        title="Your recent calls."
                        action={
                          <button
                            className="rk-link"
                            onClick={() => navigate("bets")}
                          >
                            All bets <Icon name="arrow" size={14} />
                          </button>
                        }
                      />
                      {state.positions.length ? (
                        <div className="rk-bet-list">
                          {state.positions.slice(0, 3).map((p) => (
                            <ActiveBetCard
                              key={p.id}
                              position={p}
                              account={account}
                              onAdd={(p) => {
                                account.setError("");
                                setAdding(p);
                              }}
                              onCash={(p) => {
                                account.setError("");
                                setCashing(p);
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rk-card">
                          <EmptyState
                            icon="bets"
                            title="A good call is waiting."
                          >
                            Make your first prediction in the side panel while
                            you play. We’ll keep the receipts here.
                          </EmptyState>
                        </div>
                      )}
                    </section>
                    <section className="rk-card rk-overview-friends">
                      <Icon name="friends" size={32} />
                      <h2>
                        Your people.
                        <br />A little more competitive.
                      </h2>
                      <p>
                        Make a league, send an invite, and find out who backs
                        their instincts.
                      </p>
                      <button
                        className="rk-button rk-button-secondary"
                        onClick={() => navigate("friends")}
                      >
                        Find your crew <Icon name="arrow" size={16} />
                      </button>
                      <button
                        className="rk-link"
                        onClick={() => navigate("play")}
                      >
                        Open the play desk
                      </button>
                    </section>
                  </div>
                </>
              )}
              {view === "play" && (
                <>
                  <div className="rk-play-intro">
                    <span className="rk-eyebrow">
                      {selected && selected.user_id !== profile.id
                        ? `${state.profiles.find((p) => p.id === selected.user_id)?.display_name}’s game`
                        : "Today on Wordle"}
                    </span>
                    <h1>
                      {own &&
                      terminal(own.status) &&
                      selected?.user_id === profile.id
                        ? "A day worth talking about."
                        : "Trust your next good guess."}
                    </h1>
                    <div className="rk-game-status">
                      <span
                        className={`rk-status-dot ${selected && !terminal(selected.status) && selected.live && account.now - Date.parse(selected.last_seen) < 12000 ? "is-live" : ""}`}
                      />
                      <span>
                        {selected
                          ? `${selected.puzzle_id.replace("wordle:", "#")} · ${selected.status === "completed" ? `Solved in ${selected.guesses}/6` : selected.status === "lost" ? "Puzzle finished · X/6" : selected.live && account.now - Date.parse(selected.last_seen) < 12000 ? `${selected.guesses} of 6 guesses submitted` : "Waiting for fresh progress"}`
                          : "No game detected yet"}
                      </span>
                      {selected && (
                        <Pill>
                          {terminal(selected.status)
                            ? "Finished"
                            : selected.live &&
                                account.now - Date.parse(selected.last_seen) <
                                  12000
                              ? "Live"
                              : "Paused"}
                        </Pill>
                      )}
                    </div>
                  </div>
                  {selected && terminal(selected.status) ? (
                    selected.user_id === profile.id && summary ? (
                      <>
                        <ResultSummary
                          result={summary}
                          onShare={() => setSharing(summary)}
                        />
                        <button
                          className="rk-button rk-button-secondary rk-full"
                          onClick={() => navigate("friends")}
                        >
                          There’s still time to back a friend{" "}
                          <Icon name="friends" size={18} />
                        </button>
                      </>
                    ) : (
                      <div className="rk-card">
                        <EmptyState
                          icon="check"
                          title={`${state.profiles.find((p) => p.id === selected.user_id)?.display_name ?? "Your friend"} is done.`}
                        >
                          {selected.status === "completed"
                            ? `${selected.guesses}/6. A good little plot twist.`
                            : "Six guesses. There’s always tomorrow."}{" "}
                          Your confirmed bet outcomes are in Bets.
                        </EmptyState>
                        <button
                          className="rk-button rk-button-primary rk-full"
                          onClick={() => navigate("bets")}
                        >
                          See your bets
                        </button>
                        <button
                          className="rk-button rk-button-quiet rk-full"
                          onClick={() => navigate("friends")}
                        >
                          Choose another friend
                        </button>
                      </div>
                    )
                  ) : (
                    <GuidedWager
                      account={account}
                      selected={selected}
                      onSelect={setSelectedId}
                      onReview={(r) => {
                        account.setError("");
                        setReview(r);
                      }}
                    />
                  )}
                </>
              )}
              {view === "friends" && (
                <FriendsView
                  account={account}
                  extension={extension}
                  onWager={onFriend}
                />
              )}
              {view === "bets" && (
                <BetsView
                  account={account}
                  onAdd={(p) => {
                    account.setError("");
                    setAdding(p);
                  }}
                  onCash={(p) => {
                    account.setError("");
                    setCashing(p);
                  }}
                  onPlay={() => navigate("play")}
                />
              )}
              {view === "profile" && (
                <ProfileView
                  account={account}
                  onHistory={() => navigate("history")}
                  onSettings={() => navigate("settings")}
                  onHelp={() => navigate("help")}
                  onLogout={() => void logout()}
                />
              )}
              {view === "settings" && (
                <>
                  <SettingsView key={profile.id} account={account} />
                  {onConnectionSettings && (
                    <button className="rk-link" onClick={onConnectionSettings}>
                      Connection settings
                    </button>
                  )}
                </>
              )}
              {view === "history" && <HistoryView account={account} />}
              {view === "wallet" && <WalletView account={account} />}
              {view === "help" && <HelpView onTour={() => setTour(true)} />}
            </>
          )}
          <footer className="rk-footer">
            For bragging rights. Never real money.
            <br />
            Unofficial Wordle companion · provisional results
          </footer>
        </main>
        {extension && (
          <nav className="rk-bottom-nav" aria-label="Main navigation">
            {extensionTabs.map(([key, label, icon]) => (
              <button
                key={key}
                aria-current={activeTab === key ? "page" : undefined}
                className={activeTab === key ? "is-active" : ""}
                onClick={() => navigate(key)}
              >
                <span>
                  <Icon name={icon} size={21} />
                  {key === "bets" &&
                    state &&
                    state.positions.some((p) => p.status === "open") && (
                      <i className="rk-nav-dot" />
                    )}
                </span>
                {label}
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="rk-toast-stack" aria-live="polite" aria-atomic="false">
        {account.events
          .filter((e) => e.kind !== "won" && e.kind !== "lost")
          .slice(-2)
          .map((event) => (
            <EventToast
              key={event.id}
              event={event}
              dismiss={() => account.dismissEvent(event.id)}
            />
          ))}
      </div>
      {review && state && (
        <WagerConfirmation
          review={review}
          account={account}
          onClose={() => setReview(undefined)}
        />
      )}
      {adding && state && (
        <AddStakeSheet
          position={adding}
          account={account}
          onClose={() => setAdding(undefined)}
          onReview={(r) => {
            setAdding(undefined);
            setReview(r);
          }}
        />
      )}
      {cashing && state && (
        <CashOutSheet
          position={cashing}
          account={account}
          onClose={() => setCashing(undefined)}
        />
      )}
      {sharing && (
        <ShareResultSheet
          result={sharing}
          onClose={() => setSharing(undefined)}
          onNotice={account.setNotice}
          onError={account.setError}
        />
      )}
      {tour && <Onboarding onClose={finishTour} />}
    </div>
  );
}
