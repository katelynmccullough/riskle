"use client";
import { useState, type FormEvent } from "react";
import type { AccountController } from "./use-riskle-account";
import type { History } from "../../lib/platform-client";
import { Avatar, EmptyState, Icon, SectionTitle, Sheet } from "./primitives";
export function ProfileView({
  account,
  onHistory,
  onSettings,
  onHelp,
  onLogout,
}: {
  account: AccountController;
  onHistory: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onLogout: () => void;
}) {
  const p = account.state!.profile,
    stats = account.todayHistory?.stats;
  return (
    <>
      <section className="rk-profile-card rk-card">
        <Avatar name={p.display_name} url={p.avatar_url} size="large" />
        <h1>{p.display_name}</h1>
        <p className="rk-muted">@{p.username}</p>
        <span className="rk-profile-tag">
          Daily puzzler. Occasional fortune teller.
        </span>
      </section>
      <div className="rk-profile-stats">
        <span>
          <strong>{stats ? stats.streak : "—"}</strong>current streak
        </span>
        <span>
          <strong>
            {stats?.games
              ? `${Math.round((100 * stats.wins) / stats.games)}%`
              : stats
                ? "0%"
                : "—"}
          </strong>
          solve rate
        </span>
        <span>
          <strong>{stats?.average ?? "—"}</strong>avg. guesses
        </span>
      </div>
      <section className="rk-card rk-menu-list">
        <button onClick={onHistory}>
          <Icon name="history" />
          <span>
            Your puzzle story<small>Calendar, streaks, and results</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button onClick={onSettings}>
          <Icon name="settings" />
          <span>
            Make it yours<small>Profile and sharing preferences</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button onClick={onHelp}>
          <Icon name="help" />
          <span>
            A quick tour<small>A few good things to know</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
        <button onClick={onLogout}>
          <Icon name="arrow" />
          <span>Log out</span>
        </button>
      </section>
    </>
  );
}
export function SettingsView({ account }: { account: AccountController }) {
  const profile = account.state!.profile,
    [name, setName] = useState(profile.display_name),
    [username, setUsername] = useState(profile.username),
    [avatar, setAvatar] = useState(profile.avatar_url ?? ""),
    [sharing, setSharing] = useState(profile.share_progress),
    [rankings, setRankings] = useState(profile.public_rankings);
  async function save(e: FormEvent) {
    e.preventDefault();
    await account.mutate(
      "profile",
      {
        displayName: name,
        username,
        avatarUrl: avatar,
        shareProgress: sharing,
        publicRankings: rankings,
      },
      "Profile saved. Looking good.",
    );
  }
  return (
    <>
      <SectionTitle eyebrow="Your corner" title="Make it yours." />
      <section className="rk-card">
        <div className="rk-settings-avatar">
          <Avatar
            name={profile.display_name}
            url={profile.avatar_url}
            size="large"
          />
          <span>
            <strong>{profile.display_name}</strong>
            <small>@{profile.username}</small>
          </span>
        </div>
        <form className="rk-form" onSubmit={(e) => void save(e)}>
          <label>
            Display name
            <input
              aria-label="Display name"
              value={name}
              maxLength={48}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Username
            <input
              aria-label="Username"
              pattern="[a-z0-9_]{3,24}"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Profile picture URL
            <input
              aria-label="Profile picture URL"
              value={avatar}
              type="url"
              pattern="https://.*"
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://…"
            />
            <small>
              Use a link to an HTTPS image. Uploads aren’t available yet.
            </small>
          </label>
          <label className="rk-toggle-row">
            <span>
              <strong>Let my league follow along</strong>
              <small>
                Share guess counts and game status. Words and answers stay
                private.
              </small>
            </span>
            <input
              aria-label="Share live progress with league members"
              type="checkbox"
              checked={sharing}
              onChange={(e) => setSharing(e.target.checked)}
            />
          </label>
          <label className="rk-toggle-row">
            <span>
              <strong>Join global rankings</strong>
              <small>
                Let other players see your username and virtual score.
              </small>
            </span>
            <input
              aria-label="Appear in global rankings"
              type="checkbox"
              checked={rankings}
              onChange={(e) => setRankings(e.target.checked)}
            />
          </label>
          <button
            className="rk-button rk-button-primary"
            disabled={account.busy}
          >
            {account.busy ? "Saving…" : "Save settings"}
            <Icon name="check" size={16} />
          </button>
        </form>
      </section>
    </>
  );
}
export function HistoryView({ account }: { account: AccountController }) {
  const history = account.history,
    [report, setReport] = useState<string>(),
    [reason, setReason] = useState("");
  const [year, month] = account.month.split("-").map(Number),
    count = new Date(year, month, 0).getDate(),
    offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  return (
    <>
      <SectionTitle eyebrow="One puzzle at a time" title="Your puzzle story." />
      <section className="rk-card">
        <label className="rk-month-picker">
          Take a look back
          <input
            aria-label="History month"
            type="month"
            value={account.month}
            onChange={(e) => e.target.value && account.setMonth(e.target.value)}
          />
        </label>
        {history ? (
          <>
            <div className="rk-profile-stats">
              <span>
                <strong>{history.stats.games}</strong>games played
              </span>
              <span>
                <strong>{history.stats.longestStreak}</strong>best streak
              </span>
              <span>
                <strong>{history.stats.average ?? "—"}</strong>avg. guesses
              </span>
            </div>
            <div className="rk-calendar" aria-label="Puzzle result calendar">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                <span className="rk-weekday" key={i}>
                  {day}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`blank${i}`} aria-hidden="true" />
              ))}
              {Array.from({ length: count }, (_, i) => {
                const date = `${account.month}-${String(i + 1).padStart(2, "0")}`,
                  entry = history.days.find((day) => day.puzzle_date === date);
                return (
                  <span
                    className={`rk-calendar-day ${entry?.status === "completed" ? "is-won" : entry?.status === "lost" ? "is-lost" : ""}`}
                    key={date}
                    title={
                      entry
                        ? `${date}: ${entry.status}, ${entry.guesses}/6, ${entry.profit} coins`
                        : date
                    }
                  >
                    <strong>{i + 1}</strong>
                    {entry ? (
                      <small>
                        {entry.status === "completed"
                          ? entry.guesses
                          : entry.status === "lost"
                            ? "X"
                            : "•"}
                        /6
                      </small>
                    ) : (
                      <small>—</small>
                    )}
                  </span>
                );
              })}
            </div>
            <div className="rk-calendar-legend">
              <span>
                <i className="rk-legend-win" />
                Solved
              </span>
              <span>
                <i className="rk-legend-loss" />
                Missed
              </span>
            </div>
            <PerformanceTrend days={history.days} />
            {history.days.length ? (
              <div className="rk-history-list">
                {history.days.map((day) => (
                  <article key={day.id}>
                    <div>
                      <strong>
                        {new Date(
                          `${day.puzzle_date}T12:00:00`,
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </strong>
                      <span>
                        {day.status === "completed"
                          ? `Solved in ${day.guesses}`
                          : day.status === "lost"
                            ? "A six-guess plot twist"
                            : `${day.guesses} guesses in`}{" "}
                        · provisional
                      </span>
                    </div>
                    <strong
                      className={day.profit < 0 ? "rk-negative" : "rk-positive"}
                    >
                      {day.profit >= 0 ? "+" : ""}
                      {day.profit}
                    </strong>
                    <button
                      className="rk-link"
                      aria-label={`Report result for ${day.puzzle_date}`}
                      onClick={() => setReport(day.id)}
                    >
                      Report
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon="history" title="A month of possibilities.">
                No observed games in this month. Your actual results will show
                up here as you play.
              </EmptyState>
            )}
          </>
        ) : (
          <div className="rk-skeleton" aria-label="Loading history" />
        )}
      </section>
      {report && (
        <Sheet
          title="Something look off?"
          description="Tell us what happened. Reports are recorded for review; they don’t automatically refund a result."
          onClose={() => setReport(undefined)}
        >
          <form
            className="rk-form"
            onSubmit={(e) => {
              e.preventDefault();
              void account
                .mutate(
                  "dispute",
                  { sessionId: report, reason },
                  "Your report is recorded for review.",
                )
                .then((result) => {
                  if (result) {
                    setReport(undefined);
                    setReason("");
                  }
                });
            }}
          >
            <label>
              Your report
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={10}
                maxLength={1000}
                required
                rows={4}
              />
            </label>
            <button
              className="rk-button rk-button-primary"
              disabled={account.busy}
            >
              Send report
            </button>
          </form>
        </Sheet>
      )}
    </>
  );
}
export function WalletView({ account }: { account: AccountController }) {
  return (
    <>
      <SectionTitle
        eyebrow="Every virtual coin has a story"
        title="Your coin trail."
      />
      <section className="rk-card">
        <div className="rk-wallet-totals">
          <span>
            Available
            <strong>{account.state!.wallet.balance.toLocaleString()}</strong>
          </span>
          <span>
            In play
            <strong>{account.state!.wallet.exposure.toLocaleString()}</strong>
          </span>
        </div>
        <ul className="rk-ledger">
          {account.state!.ledger.map((entry) => {
            const labels: Record<string, string> = {
              stake: "Prediction reserved",
              settlement_yes: "Winning prediction",
              settlement_no: "Prediction lost",
              settlement_void: "Stake refunded",
              cashout: "Cashed out",
              starting_credit: "Your starting coins",
            };
            return (
              <li key={entry.id}>
                <span
                  className={`rk-ledger-icon ${entry.kind === "settlement_no" ? "rk-coral" : entry.amount > 0 ? "rk-green" : "rk-neutral"}`}
                >
                  <Icon
                    name={
                      entry.kind === "stake"
                        ? "bets"
                        : entry.kind === "cashout"
                          ? "arrow"
                          : "coin"
                    }
                    size={18}
                  />
                </span>
                <span>
                  <strong>
                    {labels[entry.kind] ?? entry.kind.replaceAll("_", " ")}
                  </strong>
                  <small>{new Date(entry.created_at).toLocaleString()}</small>
                </span>
                <strong
                  className={
                    entry.kind === "stake"
                      ? "rk-muted"
                      : entry.kind === "settlement_no"
                        ? "rk-negative"
                        : entry.amount > 0
                          ? "rk-positive"
                          : ""
                  }
                >
                  {entry.amount >= 0 ? "+" : ""}
                  {entry.amount}
                </strong>
              </li>
            );
          })}
        </ul>
        <p className="rk-fineprint">
          Latest 200 ledger entries. A losing settlement records zero returned
          coins because the stake was reserved when placed.
        </p>
      </section>
    </>
  );
}
export function HelpView({ onTour }: { onTour: () => void }) {
  return (
    <>
      <SectionTitle
        eyebrow="Quick answers. Good instincts."
        title="A little know-how."
      />
      <section className="rk-card rk-help-intro">
        <Icon name="spark" size={32} />
        <h3>Wordle, with company.</h3>
        <p>
          You play on the official Wordle website. Riskle sits beside it, adding
          just-for-fun predictions and private leagues.
        </p>
        <button className="rk-button rk-button-primary" onClick={onTour}>
          Take the quick tour <Icon name="arrow" size={16} />
        </button>
      </section>
      <section className="rk-card rk-faq">
        {[
          [
            "Are these real coins?",
            "No. Coins are fictional: no deposits, purchases, cash redemption, or prizes. Just a little friendly competition.",
          ],
          [
            "What does the multiplier mean?",
            "A 3× multiplier means a 50-coin bet could return 150 coins in total, including the original 50. That is 100 coins of net profit. Multipliers use a provisional simulation, not calibrated probabilities.",
          ],
          [
            "Why did my market pause?",
            "The server needs fresh, eligible progress. An inactive tab, a connection gap, privacy settings, an expired quote, or a decided outcome can pause new bets and cash-outs.",
          ],
          [
            "What happens when I add stake?",
            "Your earlier bet stays exactly as it was. Additional stake is a new position at the latest quote, which you review before confirming.",
          ],
          [
            "Can I cash out anything?",
            "Only an open, eligible position. Ask for a server quote, then confirm before it expires. Partial exits leave the rest in play.",
          ],
          [
            "Can my friends see my words?",
            "No. Riskle receives counts and game status, never actual words, tile colors, or the hidden answer. You choose whether to share live progress.",
          ],
          [
            "Are results verified?",
            "Results are browser-observed and provisional. Riskle cannot prove an unaided solve. Reports are recorded for review; a full moderation workflow is still pending.",
          ],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <Icon name="chevron" size={16} />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
    </>
  );
}
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    [
      "A sidekick, not a new puzzle.",
      "Install the Riskle extension in Chrome. It lives in the side panel, beside your original Wordle.",
      "play",
    ],
    [
      "Make yourself at home.",
      "Create one account for the side panel and companion website. Your coins and history stay with it.",
      "profile",
    ],
    [
      "Open the original Wordle.",
      "Start from the Wordle intro screen so Riskle can see the public puzzle date and number.",
      "play",
    ],
    [
      "Go with your gut.",
      "Pick yourself or a sharing league friend, choose a prediction, and review the multiplier.",
      "spark",
    ],
    [
      "Just-for-fun stakes.",
      "Choose fictional coins, review potential payout and net profit, and confirm. No real money, purchases, or prizes.",
      "coin",
    ],
    [
      "Bring your people.",
      "Create a private league and share an invite. Friends opt into progress sharing, so the rivalry stays friendly.",
      "friends",
    ],
  ];
  return (
    <Sheet title="A little more fun in six steps." onClose={onClose}>
      <div className="rk-tour-progress" aria-label={`Step ${step + 1} of 6`}>
        {steps.map((_, i) => (
          <i key={i} className={i <= step ? "is-done" : ""} />
        ))}
      </div>
      <div className="rk-tour">
        <span>
          <Icon name={steps[step][2]} size={36} />
        </span>
        <h3>{steps[step][0]}</h3>
        <p>{steps[step][1]}</p>
      </div>
      <button
        className="rk-button rk-button-primary rk-full"
        onClick={() => (step === 5 ? onClose() : setStep(step + 1))}
      >
        {step === 5 ? "Let’s make a good call" : "Next"}
        <Icon name="arrow" size={16} />
      </button>
      <button className="rk-button rk-button-quiet rk-full" onClick={onClose}>
        Skip for now
      </button>
    </Sheet>
  );
}
function PerformanceTrend({ days }: { days: History["days"] }) {
  const finished = days.filter((d) => ["completed", "lost"].includes(d.status));
  if (finished.length < 2)
    return (
      <p className="rk-fineprint">
        Play on two puzzle dates to start a performance trend.
      </p>
    );
  const point = (i: number, g: number) => [
    20 + (i * 460) / Math.max(1, finished.length - 1),
    15 + (g - 1) * 20,
  ];
  return (
    <figure className="rk-trend">
      <figcaption>
        Your guesses, over time <small>Lower is better.</small>
      </figcaption>
      <svg
        role="img"
        aria-label="Guess counts by puzzle date"
        viewBox="0 0 500 150"
      >
        <line x1="20" y1="125" x2="480" y2="125" stroke="#E9E7E3" />
        <polyline
          fill="none"
          stroke="#6953A7"
          strokeWidth="2"
          points={finished
            .map((d, i) => point(i, d.guesses).join(","))
            .join(" ")}
        />
        {finished.map((day, i) => {
          const [x, y] = point(i, day.guesses);
          return (
            <g key={day.id}>
              <circle
                cx={x}
                cy={y}
                r="4"
                fill={day.status === "completed" ? "#236A42" : "#B63B45"}
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
                  fill="#686765"
                  fontSize="10"
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
