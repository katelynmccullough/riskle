import "../background.js"; // Retains the isolated local mock bridge for regression tests.
import {
  isWordle,
  type WordleObservation,
  type PuzzleIdentity,
} from "./wordle-observer";
import {
  platformClient,
  command,
  validateConfig,
  permissionOrigin,
  type PlatformConfig,
} from "../../web/lib/platform-client";
import { authStorage } from "./storage";
void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
let queue: Promise<void> = Promise.resolve();
let backendClient: ReturnType<typeof platformClient> | undefined;
let backendConfig = "";
export function validObservation(value: unknown): value is WordleObservation {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<WordleObservation>;
  return (
    p.game === "wordle" &&
    typeof p.hasStarted === "boolean" &&
    p.source === "extension_observed" &&
    typeof p.puzzleId === "string" &&
    /^wordle:\d+$/.test(p.puzzleId) &&
    typeof p.puzzleDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.puzzleDate) &&
    typeof p.observedAt === "string" &&
    Number.isFinite(Date.parse(p.observedAt)) &&
    Number.isInteger(p.offsetMinutes) &&
    p.offsetMinutes! >= -840 &&
    p.offsetMinutes! <= 840 &&
    Number.isInteger(p.guessesUsed) &&
    p.guessesUsed! >= 0 &&
    p.guessesUsed! <= 6 &&
    ((p.status === "not_started" && p.guessesUsed === 0) ||
      (p.status === "in_progress" &&
        p.guessesUsed! > 0 &&
        p.guessesUsed! < 6) ||
      (p.status === "completed" && p.guessesUsed! > 0) ||
      (p.status === "lost" && p.guessesUsed === 6))
  );
}
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (
    !sender.url ||
    !isWordle(sender.url) ||
    sender.frameId !== 0 ||
    !message ||
    typeof message !== "object"
  )
    return false;
  const m = message as {
    type?: string;
    payload?: unknown;
    reason?: unknown;
    puzzleDate?: unknown;
  };
  if (m.type === "WORDLE_IDENTITY" && typeof m.puzzleDate === "string") {
    void chrome.storage.local
      .get("wordleIdentity")
      .then(({ wordleIdentity: stored }) => {
        const identity = stored as PuzzleIdentity | undefined;
        respond({
          identity:
            identity?.puzzleDate === m.puzzleDate &&
            typeof identity?.puzzleId === "string"
              ? identity
              : null,
        });
      });
    return true;
  }
  if (m.type === "WORDLE_UNSUPPORTED" && typeof m.reason === "string") {
    void chrome.storage.local.set({
      wordleUnsupported: m.reason.slice(0, 300),
    });
    respond({ ok: true });
    return false;
  }
  if (m.type !== "WORDLE_PROGRESS" || !validObservation(m.payload)) {
    respond({ ok: false, error: "Invalid visible progress message" });
    return false;
  }
  const p = m.payload;
  const payload: WordleObservation = {
    game: "wordle",
    hasStarted: p.hasStarted,
    puzzleId: p.puzzleId,
    puzzleDate: p.puzzleDate,
    guessesUsed: p.guessesUsed,
    status: p.status,
    observedAt: p.observedAt,
    offsetMinutes: p.offsetMinutes,
    source: "extension_observed",
  };
  queue = queue
    .catch(() => undefined)
    .then(async () => {
      await chrome.storage.local.set({
        wordleObservation: payload,
        wordleIdentity: {
          puzzleId: payload.puzzleId,
          puzzleDate: payload.puzzleDate,
        },
        wordleUnsupported: null,
      });
      try {
        const { platformConfig } =
          await chrome.storage.local.get("platformConfig");
        if (!platformConfig)
          throw new Error(
            "Connect a Supabase project in the Riskle side panel.",
          );
        const config = validateConfig(platformConfig as PlatformConfig);
        if (
          !(await chrome.permissions.contains({
            origins: [permissionOrigin(config)],
          }))
        )
          throw new Error("Backend connection permission is missing.");
        const configKey = JSON.stringify(config);
        if (!backendClient || backendConfig !== configKey) {
          backendClient?.auth.stopAutoRefresh();
          backendClient = platformClient(config, authStorage);
          backendConfig = configKey;
        }
        const client = backendClient;
        try {
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          if (!data.session)
            throw new Error("Sign in to Riskle in the side panel.");
          const result = await command(
            client,
            "observe",
            payload as unknown as Record<string, unknown>,
          );
          await chrome.storage.local.set({
            wordleSync: {
              ok: true,
              at: new Date().toISOString(),
              sessionId: result.id,
            },
          });
          respond({ ok: true });
        } finally {
          client.auth.stopAutoRefresh();
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await chrome.storage.local.set({
          wordleSync: {
            ok: false,
            at: new Date().toISOString(),
            error: reason,
          },
        });
        respond({ ok: false, error: reason });
      }
    });
  return true;
});
