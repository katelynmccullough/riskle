import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Wordmark, Icon } from "../../web/components/riskle/primitives";
import { AccountApp } from "../../web/components/account-app";
import {
  platformClient,
  validateConfig,
  permissionOrigin,
  type PlatformConfig,
} from "../../web/lib/platform-client";
import type { WordleObservation } from "./wordle-observer";
import { authStorage } from "./storage";
declare const __RISKLE_CONFIG__: PlatformConfig | null;
function Panel() {
  const [config, setConfig] = useState<PlatformConfig | null>(null),
    [url, setUrl] = useState(__RISKLE_CONFIG__?.url ?? ""),
    [key, setKey] = useState(__RISKLE_CONFIG__?.key ?? ""),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Waiting for a Wordle observation.");
  const client = useMemo(
    () => (config ? platformClient(config, authStorage) : null),
    [config],
  );
  useEffect(() => {
    void chrome.storage.local
      .get([
        "platformConfig",
        "wordleObservation",
        "wordleUnsupported",
        "wordleSync",
      ])
      .then(async (stored) => {
        update(
          Object.fromEntries(
            Object.entries(stored).map(([key, newValue]) => [
              key,
              { newValue },
            ]),
          ),
        );
        const { platformConfig } = stored;
        if (platformConfig) {
          const c = validateConfig(platformConfig as PlatformConfig);
          setUrl(c.url);
          setKey(c.key);
          if (
            await chrome.permissions.contains({
              origins: [permissionOrigin(c)],
            })
          )
            setConfig(c);
        }
      })
      .catch((e) => setError(String(e)));
    const update = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.wordleUnsupported?.newValue)
        setStatus(String(changes.wordleUnsupported.newValue));
      if (changes.wordleObservation?.newValue) {
        const p = changes.wordleObservation.newValue as WordleObservation;
        setStatus(
          `${p.puzzleId} · ${p.guessesUsed}/6 · ${p.status} · browser observed`,
        );
      }
      if (changes.wordleSync?.newValue) {
        const sync = changes.wordleSync.newValue as {
          ok: boolean;
          error: string;
        };
        if (!sync.ok) setError(String(sync.error));
        else setError("");
      }
    };
    chrome.storage.onChanged.addListener(update);
    return () => chrome.storage.onChanged.removeListener(update);
  }, []);
  async function connect(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const c = validateConfig({ url, key });
      if (
        !(await chrome.permissions.request({ origins: [permissionOrigin(c)] }))
      )
        throw new Error("Backend access was not granted.");
      const { platformConfig: previous } =
        await chrome.storage.local.get("platformConfig");
      if (previous && (previous as PlatformConfig).url !== c.url) {
        await client?.auth.signOut({ scope: "local" });
        await chrome.storage.local.remove("riskle.auth");
      }
      await chrome.storage.local.set({ platformConfig: c });
      setConfig(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <>
      <div className="extension-status" role="status">
        {status}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!config ? (
        <main className="rk-connect">
          <Wordmark />
          <section className="rk-connect-card">
            <span className="rk-connect-icon">
              <Icon name="friends" size={38} />
            </span>
            <h1>Connect Riskle</h1>
            <p>
              Your Wordle, with company. Connect once to keep your account,
              coins, and friendly rivalries together.
            </p>
            <form className="rk-form" onSubmit={(e) => void connect(e)}>
              {__RISKLE_CONFIG__ ? (
                <details className="rk-connection-details">
                  <summary>Connection settings</summary>
                  <label>
                    Project URL
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Publishable key
                    <input
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      required
                    />
                  </label>
                </details>
              ) : (
                <>
                  <label>
                    Project URL
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Publishable key
                    <input
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      required
                    />
                    <small>
                      Use your project’s public key. Never a secret key.
                    </small>
                  </label>
                </>
              )}
              <button className="rk-button rk-button-primary">
                Continue to sign in <Icon name="arrow" size={17} />
              </button>
            </form>
            <p className="rk-fineprint">
              Chrome will ask to connect to your configured account service. No
              browsing history or unrelated pages.
            </p>
          </section>
          <p className="rk-fineprint">
            Fictional coins. Real bragging rights.
            <br />
            An unofficial Wordle companion.
          </p>
        </main>
      ) : (
        <AccountApp
          client={client}
          extension
          onConnectionSettings={() => setConfig(null)}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Panel />);
