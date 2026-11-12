import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
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
      if (config?.url !== c.url)
        await chrome.storage.local.remove("riskle.auth");
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
        <main className="shell">
          <h1>Connect Riskle</h1>
          <p>
            Use the same Supabase project as the companion website. Only its
            public key is needed.
          </p>
          <form className="account-form" onSubmit={(e) => void connect(e)}>
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
            <button className="primary">Connect project</button>
          </form>
        </main>
      ) : (
        <>
          <AccountApp client={client} extension />
          <button
            onClick={() => {
              void client?.auth.signOut();
              setConfig(null);
            }}
          >
            Change project
          </button>
        </>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Panel />);
