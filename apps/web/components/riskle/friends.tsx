"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { AccountController } from "./use-riskle-account";
import type { PlatformSession, Ranking } from "../../lib/platform-client";
import { playerSessions, terminal } from "../../lib/game-experience";
import { Avatar, EmptyState, Icon, Pill, SectionTitle } from "./primitives";
const form = (action: () => void) => (e: FormEvent) => {
  e.preventDefault();
  action();
};
export function LeagueLeaderboard({
  rankings,
  currentId,
  weekly,
}: {
  rankings: Ranking[];
  currentId: string;
  weekly: boolean;
}) {
  return (
    <section className="rk-card rk-leaderboard">
      <SectionTitle
        eyebrow={weekly ? "The weekly picture" : "Today’s friendly rivalry"}
        title="The bragging order."
      />
      {rankings.length ? (
        <ol className="rk-rank-list">
          {rankings.map((r, i) => (
            <li key={r.id} className={r.id === currentId ? "is-you" : ""}>
              <span className="rk-rank-number">{i + 1}</span>
              <Avatar name={r.username} url={r.avatar_url} size="small" />
              <span className="rk-rank-name">
                {r.username}
                {r.id === currentId && <small>You</small>}
              </span>
              <strong className={r.profit < 0 ? "rk-negative" : "rk-positive"}>
                {r.profit >= 0 ? "+" : ""}
                {r.profit}
                <small>coins</small>
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon="trophy" title="The top spot is wide open.">
          No eligible rankings here yet. Global rankings include only people who
          opt in.
        </EmptyState>
      )}
      <p className="rk-fineprint">
        Ranked by confirmed virtual profit, then username and ID. All standings
        are provisional.
      </p>
    </section>
  );
}
export function FriendsView({
  account,
  onWager,
  extension,
}: {
  account: AccountController;
  onWager: (session: PlatformSession) => void;
  extension: boolean;
}) {
  const state = account.state!,
    [create, setCreate] = useState(false),
    [join, setJoin] = useState(false),
    [name, setName] = useState(""),
    [code, setCode] = useState(() =>
      typeof location !== "undefined"
        ? (new URLSearchParams(location.search).get("invite") ?? "")
        : "",
    ),
    [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    if (
      state.leagues.length &&
      !state.leagues.some((l) => l.id === account.league)
    )
      account.setLeague(state.leagues[0].id);
  }, [state.leagues, account.league]);
  const sessions = playerSessions(state),
    selectedLeague =
      state.leagues.find((l) => l.id === account.league) ?? state.leagues[0],
    members = selectedLeague
      ? state.members.filter((m) => m.league_id === selectedLeague.id)
      : [],
    invite = state.invites.find((i) => i.league_id === selectedLeague?.id);
  return (
    <>
      <SectionTitle
        eyebrow="Better with your people"
        title="A good group chat, upgraded."
        action={
          <button
            className="rk-icon-button"
            aria-label="Create a league"
            onClick={() => setCreate(!create)}
          >
            <Icon name="friends" />
          </button>
        }
      />
      <div className="rk-league-tools">
        <button
          className="rk-button rk-button-secondary"
          onClick={() => {
            setCreate(!create);
            setJoin(false);
          }}
        >
          Create league <Icon name="arrow" size={16} />
        </button>
        <button
          className="rk-button rk-button-quiet"
          onClick={() => {
            setJoin(!join);
            setCreate(false);
          }}
        >
          Join with a code
        </button>
      </div>
      {create && (
        <section className="rk-card">
          <h3>Name your crew.</h3>
          <form
            className="rk-form"
            onSubmit={form(() => {
              void account
                .mutate<{ id: string }>(
                  "create_league",
                  { name },
                  "Your league is ready. Time to invite the good guessers.",
                )
                .then((result) => {
                  if (result) {
                    account.setLeague(result.id);
                    setName("");
                    setCreate(false);
                  }
                });
            })}
          >
            <label>
              League name
              <input
                aria-label="League name"
                value={name}
                maxLength={48}
                onChange={(e) => setName(e.target.value)}
                placeholder="The Group Chat"
                required
              />
            </label>
            <button
              className="rk-button rk-button-primary"
              disabled={account.busy}
            >
              Create league
            </button>
          </form>
        </section>
      )}
      {(join || !!code) && (
        <section className="rk-card">
          <h3>Your seat is waiting.</h3>
          <form
            className="rk-form"
            onSubmit={form(
              () =>
                void account
                  .mutate<{ leagueId: string }>(
                    "join_league",
                    { code: code.trim() },
                    "You’re in. Let the friendly rivalry begin.",
                  )
                  .then((result) => {
                    if (result) {
                      account.setLeague(result.leagueId);
                      setCode("");
                      setJoin(false);
                    }
                  }),
            )}
          >
            <label>
              Invitation code
              <input
                aria-label="Invitation code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <button
              className="rk-button rk-button-primary"
              disabled={account.busy}
            >
              Join league
            </button>
          </form>
        </section>
      )}
      {!state.leagues.length && !create && !join && (
        <div className="rk-card">
          <EmptyState
            icon="friends"
            title="Every great rivalry starts somewhere."
            action={
              <button
                className="rk-button rk-button-primary"
                onClick={() => setCreate(true)}
              >
                Start your first league
              </button>
            }
          >
            Make a private league, share the invite, and put a little friendly
            pressure on puzzle time.
          </EmptyState>
        </div>
      )}
      {!!state.leagues.length && (
        <>
          <label className="rk-select-label">
            Your league
            <select
              aria-label="Selected league"
              value={selectedLeague?.id ?? ""}
              onChange={(e) => {
                account.setLeague(e.target.value);
                setConfirmLeave(false);
              }}
            >
              {state.leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rk-friend-list">
            {members.map((member) => {
              const p = state.profiles.find((p) => p.id === member.user_id);
              if (!p) return null;
              const game = sessions.find((s) => s.user_id === p.id),
                rank = account.rankings.findIndex((r) => r.id === p.id),
                live =
                  !!game &&
                  game.live &&
                  account.now - Date.parse(game.last_seen) < 12000 &&
                  !terminal(game.status);
              return (
                <article className="rk-friend-card" key={p.id}>
                  <Avatar name={p.display_name} url={p.avatar_url} />
                  <div>
                    <h3>
                      {p.display_name}
                      {p.id === state.profile.id && <small> · you</small>}
                    </h3>
                    <span className="rk-small rk-muted">
                      {game
                        ? terminal(game.status)
                          ? game.status === "completed"
                            ? `Finished in ${game.guesses}/6`
                            : "Finished · X/6"
                          : live
                            ? `${game.guesses} guesses in · live`
                            : "Progress paused"
                        : p.share_progress
                          ? "No shared game yet"
                          : "Progress private"}
                    </span>
                    {rank >= 0 && account.league === selectedLeague?.id && (
                      <span className="rk-small rk-muted">
                        {" "}
                        · #{rank + 1} {account.weekly ? "this week" : "today"}
                      </span>
                    )}
                  </div>
                  {live ? (
                    <button
                      className="rk-icon-button rk-friend-wager"
                      aria-label={`Wager on ${p.display_name}`}
                      onClick={() => onWager(game!)}
                    >
                      <Icon name="arrow" />
                    </button>
                  ) : (
                    <Pill>
                      {game && terminal(game.status)
                        ? "Done"
                        : !p.share_progress
                          ? "Private"
                          : "Waiting"}
                    </Pill>
                  )}
                </article>
              );
            })}
          </div>
          <div className="rk-standing-controls">
            <div className="rk-segmented">
              <button
                aria-pressed={!account.weekly}
                onClick={() => account.setWeekly(false)}
              >
                Today
              </button>
              <button
                aria-pressed={account.weekly}
                onClick={() => account.setWeekly(true)}
              >
                This week
              </button>
            </div>
            <label>
              <span className="rk-sr-only">Ranking date</span>
              <input
                aria-label="Ranking date"
                type="date"
                value={account.rankingDate}
                onChange={(e) => account.setRankingDate(e.target.value)}
              />
            </label>
          </div>
          <LeagueLeaderboard
            rankings={
              account.league === selectedLeague?.id ? account.rankings : []
            }
            currentId={state.profile.id}
            weekly={account.weekly}
          />
          {invite && (
            <section className="rk-card rk-invite">
              <Icon name="friends" />
              <h3>Save a seat for someone.</h3>
              <p className="rk-muted">
                This invite is just for your league. It expires{" "}
                {new Date(invite.expires_at).toLocaleDateString()}.
              </p>
              <code>{invite.code}</code>
              <button
                className="rk-button rk-button-secondary rk-full"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(
                      extension
                        ? invite.code
                        : `${location.origin}/?invite=${invite.code}`,
                    )
                    .then(
                      () =>
                        account.setNotice(
                          extension
                            ? "Invite code copied. Pass it on."
                            : "Invite link copied. Pass it on.",
                        ),
                      () =>
                        account.setError(
                          "Clipboard unavailable. You can select and copy the code.",
                        ),
                    )
                }
              >
                Copy invite {extension ? "code" : "link"}{" "}
                <Icon name="share" size={16} />
              </button>
              <button
                className="rk-link"
                disabled={account.busy}
                onClick={() =>
                  void account.mutate(
                    "regenerate_invite",
                    { leagueId: selectedLeague.id },
                    "Invite updated. The previous code no longer works.",
                  )
                }
              >
                Replace invite code
              </button>
            </section>
          )}
          {confirmLeave ? (
            <div className="rk-card">
              <p>
                Leave {selectedLeague?.name}? Existing bets stay in your
                account. If you own the league, ownership passes to another
                member.
              </p>
              <div className="rk-share-actions">
                <button
                  className="rk-button rk-button-danger"
                  disabled={account.busy}
                  onClick={() =>
                    void account
                      .mutate(
                        "leave_league",
                        { leagueId: selectedLeague?.id },
                        "You left the league.",
                      )
                      .then((result) => {
                        if (result) {
                          account.setLeague("");
                          setConfirmLeave(false);
                        }
                      })
                  }
                >
                  Confirm leave
                </button>
                <button
                  className="rk-button rk-button-quiet"
                  onClick={() => setConfirmLeave(false)}
                >
                  Stay
                </button>
              </div>
            </div>
          ) : (
            <button
              className="rk-link rk-muted"
              onClick={() => setConfirmLeave(true)}
            >
              Leave this league
            </button>
          )}
        </>
      )}
      <p className="rk-fineprint">
        Only opted-in progress is shared. Words, tile colors, and answers stay
        out of Riskle.
      </p>
    </>
  );
}
