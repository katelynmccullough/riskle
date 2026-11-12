// Browser-observed local state is informational. It never authorizes wallet mutations.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  let url;
  try {
    url = new URL(sender.url);
  } catch {
    respond({ ok: false });
    return false;
  }
  const p = message?.payload;
  const valid =
    ["http://localhost:3000", "http://127.0.0.1:3000"].includes(url.origin) &&
    url.pathname === "/" &&
    message?.type === "MOCK_STATE_UPDATE" &&
    p?.game === "riskle-mock" &&
    p.source === "mock" &&
    typeof p.player === "string" &&
    p.player.length <= 24 &&
    typeof p.puzzleId === "string" &&
    p.puzzleId.length <= 100 &&
    ["not_started", "in_progress", "completed", "lost"].includes(p.status) &&
    p.maxGuesses === 6 &&
    Number.isInteger(p.guessesUsed) &&
    p.guessesUsed >= 0 &&
    p.guessesUsed <= 6 &&
    Number.isSafeInteger(p.bankroll) &&
    p.bankroll >= 0 &&
    Number.isSafeInteger(p.exposure) &&
    p.exposure >= 0 &&
    ((p.status === "not_started" && p.guessesUsed === 0) ||
      (p.status === "in_progress" && p.guessesUsed > 0 && p.guessesUsed < 6) ||
      (p.status === "completed" && p.guessesUsed > 0) ||
      (p.status === "lost" && p.guessesUsed === 6));
  if (!valid) {
    respond({ ok: false });
    return false;
  }
  const activeGame = {
    game: p.game,
    player: p.player,
    puzzleId: p.puzzleId,
    status: p.status,
    guessesUsed: p.guessesUsed,
    maxGuesses: 6,
    bankroll: p.bankroll,
    exposure: p.exposure,
    source: "mock",
    receivedAt: Date.now(),
  };
  chrome.storage.local.set({ activeGame }).then(
    () => respond({ ok: true }),
    () => respond({ ok: false }),
  );
  return true;
});
