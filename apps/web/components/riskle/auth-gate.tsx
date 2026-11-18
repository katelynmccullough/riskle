"use client";
import { useState, type FormEvent } from "react";
import type { AccountController } from "./use-riskle-account";
import { Icon, Wordmark } from "./primitives";
export function AuthGate({
  account,
  extension,
}: {
  account: AccountController;
  extension: boolean;
}) {
  const [mode, setMode] = useState(account.recovery ? "password" : "login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [username, setUsername] = useState(""),
    [busy, setBusy] = useState(false);
  const current = account.recovery ? "password" : mode;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!account.client || busy) return;
    setBusy(true);
    account.setError("");
    account.setNotice("");
    try {
      if (current === "signup") {
        const { data, error } = await account.client.auth.signUp({
          email,
          password,
          options: {
            data: { username: username.toLowerCase(), display_name: username },
            emailRedirectTo: extension ? undefined : location.origin,
          },
        });
        if (error) throw error;
        account.setNotice(
          data.session
            ? "Account created and signed in."
            : "Signup accepted. Confirm the email before signing in.",
        );
      } else if (current === "reset") {
        const { error } = await account.client.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: extension
              ? undefined
              : `${location.origin}/?recovery=1`,
          },
        );
        if (error) throw error;
        account.setNotice(
          "Reset request accepted. Check your email if the account exists.",
        );
      } else if (current === "password") {
        const { error } = await account.client.auth.updateUser({ password });
        if (error) throw error;
        account.setRecovery(false);
        setMode("login");
        account.setNotice("Password updated.");
      } else {
        const { error } = await account.client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      setPassword("");
    } catch (e) {
      account.setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`rk-auth ${extension ? "rk-auth-extension" : ""}`}>
      <header className="rk-auth-header">
        <Wordmark />
        {!extension && (
          <a className="rk-link" href="/demo">
            Mock test lab <Icon name="arrow" size={16} />
          </a>
        )}
      </header>
      <div className="rk-auth-layout">
        {!extension && (
          <section className="rk-auth-story">
            <PillArtwork />
            <span className="rk-eyebrow">
              Your daily puzzle. A little more personal.
            </span>
            <h2>
              A side of
              <br />
              <em>friendly competition.</em>
            </h2>
            <p>
              Back your instincts. Root for your friends. Make your next Wordle
              a little more interesting.
            </p>
            <div className="rk-auth-points">
              <span>
                <Icon name="coin" />
                Just-for-fun coins
              </span>
              <span>
                <Icon name="friends" />
                Your people, your league
              </span>
              <span>
                <Icon name="play" />
                Played on the original Wordle
              </span>
            </div>
          </section>
        )}
        <section className="rk-auth-card">
          <span className="rk-kicker">Good guesses. Better company.</span>
          <h1>
            {current === "signup"
              ? "Make yourself at home."
              : current === "reset"
                ? "Let’s get you back in."
                : current === "password"
                  ? "A fresh password."
                  : "Welcome back"}
          </h1>
          <p className="rk-muted">
            {current === "signup"
              ? "One account for your side panel, your friends, and your daily bragging rights."
              : current === "reset"
                ? "We’ll send a reset link to your email."
                : "Your next good call is waiting."}
          </p>
          {!account.client ? (
            <div className="rk-setup-note">
              <Icon name="settings" />
              <h3>Connect your account service</h3>
              <p>
                Add your Supabase project’s public configuration to get started.
                Setup instructions are in docs/PHASE3_SETUP.md.
              </p>
            </div>
          ) : (
            <>
              <form className="rk-form" onSubmit={(e) => void submit(e)}>
                {current !== "password" && (
                  <label>
                    Email
                    <input
                      aria-label="Email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                )}
                {current === "signup" && (
                  <label>
                    Username
                    <input
                      aria-label="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      minLength={3}
                      maxLength={24}
                      pattern="[a-zA-Z0-9_]{3,24}"
                      autoComplete="username"
                      required
                    />
                    <small>3–24 letters, numbers, or underscores.</small>
                  </label>
                )}
                {current !== "reset" && (
                  <label>
                    Password
                    <input
                      aria-label="Password"
                      type="password"
                      autoComplete={
                        current === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </label>
                )}
                <button className="rk-button rk-button-primary" disabled={busy}>
                  {busy
                    ? "One moment…"
                    : current === "signup"
                      ? "Sign up"
                      : current === "reset"
                        ? "Send reset email"
                        : current === "password"
                          ? "Update password"
                          : "Log in"}
                  {!busy && <Icon name="arrow" size={18} />}
                </button>
              </form>
              <div className="rk-auth-switch">
                {["login", "signup", "reset"]
                  .filter((v) => v !== current)
                  .map((v) => (
                    <button
                      className="rk-link"
                      key={v}
                      disabled={busy}
                      onClick={() => {
                        setMode(v);
                        account.setRecovery(false);
                        account.setError("");
                        account.setNotice("");
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
            </>
          )}
          {account.error && (
            <p className="rk-error" role="alert">
              {account.error}
            </p>
          )}
          {account.notice && (
            <p className="rk-success-note" role="status">
              {account.notice}
            </p>
          )}
          <p className="rk-fineprint">
            Fictional coins. Real bragging rights.
            <br />
            An unofficial companion, not affiliated with The New York Times.
          </p>
        </section>
      </div>
    </main>
  );
}
function PillArtwork() {
  return (
    <div className="rk-auth-art" aria-hidden="true">
      <span className="rk-art-tag">A good call feels good.</span>
      <div className="rk-art-tiles">
        <b>r</b>
        <b>i</b>
        <b>s</b>
        <b>k</b>
        <b>?</b>
      </div>
      <span className="rk-art-coin">
        <Icon name="coin" size={50} />
      </span>
      <span className="rk-art-spark">
        <Icon name="spark" size={42} />
      </span>
      <div className="rk-art-underline" />
    </div>
  );
}
