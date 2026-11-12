export interface WordleObservation {
  game: "wordle";
  hasStarted: boolean;
  puzzleId: string;
  puzzleDate: string;
  guessesUsed: number;
  status: "not_started" | "in_progress" | "completed" | "lost";
  observedAt: string;
  offsetMinutes: number;
  source: "extension_observed";
}
export interface PuzzleIdentity {
  puzzleId: string;
  puzzleDate: string;
}
export const WORDLE_URL = "https://www.nytimes.com/games/wordle/index.html";
export function isWordle(url: string) {
  try {
    const u = new URL(url);
    return (
      u.origin === "https://www.nytimes.com" &&
      u.pathname === "/games/wordle/index.html"
    );
  } catch {
    return false;
  }
}
export function readIdentity(text: string): PuzzleIdentity | null {
  const number = text.match(/\bNo\.\s*([\d,]+)/);
  const date = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/,
  );
  if (!number || !date) return null;
  const parsed = new Date(`${date[1]} ${date[2]}, ${date[3]} 12:00:00 UTC`);
  if (Number.isNaN(parsed.valueOf())) return null;
  const puzzleDate = parsed.toISOString().slice(0, 10);
  const numericId = Number(number[1].replaceAll(",", ""));
  // The current page's visible No. 1971 / Nov 11 2026 agrees with this published numbering epoch.
  if (
    (Date.parse(puzzleDate) - Date.parse("2021-06-19")) / 86400000 !==
    numericId
  )
    return null;
  return { puzzleId: `wordle:${numericId}`, puzzleDate };
}
export function readWordle(
  doc: Document,
  identity: PuzzleIdentity | null,
  now = new Date(),
): WordleObservation | null {
  if (!identity) return null;
  const root = doc.querySelector('[data-testid="game-wrapper"]');
  if (!root) return null;
  const tiles = [...root.querySelectorAll('[data-testid="tile"]')].filter(
    (t) => (t as HTMLElement).getClientRects().length > 0,
  );
  if (tiles.length !== 30) return null; // Fail closed if the publisher changes the board structure.
  const states = tiles.map((t) => t.getAttribute("data-state"));
  if (
    states.some(
      (s) =>
        !["empty", "tbd", "correct", "present", "absent"].includes(s ?? ""),
    )
  )
    return null;
  let guessesUsed = 0;
  let won = false;
  for (let row = 0; row < 6; row++) {
    const values = states.slice(row * 5, row * 5 + 5);
    const evaluated = values.filter((s) =>
      ["correct", "present", "absent"].includes(s ?? ""),
    ).length;
    if (evaluated > 0 && evaluated < 5) return null; // Ignore tile-reveal animation halfway through a guess.
    if (evaluated === 5) {
      if (row !== guessesUsed || won) return null;
      guessesUsed++;
      won = values.every((s) => s === "correct");
    }
  }
  return {
    game: "wordle",
    hasStarted: guessesUsed > 0 || states.includes("tbd"),
    ...identity,
    guessesUsed,
    status: won
      ? "completed"
      : guessesUsed === 6
        ? "lost"
        : guessesUsed
          ? "in_progress"
          : "not_started",
    observedAt: now.toISOString(),
    offsetMinutes: now.getTimezoneOffset(),
    source: "extension_observed",
  };
}
export function observeWordle(
  doc: Document,
  url: string,
  publish: (observation: WordleObservation) => void,
  unsupported: (reason: string) => void,
  cachedIdentity: PuzzleIdentity | null = null,
) {
  if (!isWordle(url)) return () => undefined;
  let identity: PuzzleIdentity | null = cachedIdentity;
  let previous = "";
  let reportedUnsupported = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scan = () => {
    // The intro shows the date and puzzle number; only visible text is used. No scripts, storage or game internals.
    if (
      ![
        ...doc.querySelectorAll(
          '[data-testid="game-wrapper"] [data-testid="tile"]',
        ),
      ].some((t) => (t as HTMLElement).getClientRects().length)
    )
      identity = readIdentity(doc.body?.innerText ?? "") ?? identity;
    const observation = readWordle(doc, identity);
    if (!observation) {
      const reason = identity
        ? "Waiting for a stable visible board. Live markets unavailable."
        : "Visible puzzle date/number unavailable. Reopen Wordle from its intro screen.";
      if (reportedUnsupported !== reason) unsupported(reason);
      reportedUnsupported = reason;
      return;
    }
    reportedUnsupported = "";
    const key = `${observation.puzzleId}:${observation.guessesUsed}:${observation.status}`;
    if (key !== previous) {
      previous = key;
      publish(observation);
    }
  };
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 120);
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-state", "style", "class"],
  });
  scan();
  const heartbeat = setInterval(() => {
    if (doc.visibilityState !== "visible") return;
    const current = readWordle(doc, identity);
    if (current) publish(current);
  }, 5000);
  return () => {
    observer.disconnect();
    clearInterval(heartbeat);
    clearTimeout(timer);
  };
}
