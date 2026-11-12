chrome.storage.local.get("activeGame", ({ activeGame: game }) => {
  if (!game) return;
  document.getElementById("connection").textContent =
    `${game.player} · ${game.puzzleId}`;
  document.getElementById("bankroll").textContent = String(game.bankroll);
  document.getElementById("progress").textContent =
    `${game.guessesUsed}/6 · ${game.status.replace("_", " ")}`;
  document.getElementById("observed").textContent =
    `Last observed ${new Date(game.receivedAt).toLocaleString()}. Refresh the dashboard to update; this may be stale.`;
});
document
  .getElementById("open")
  .addEventListener("click", () =>
    chrome.tabs.create({ url: "http://localhost:3000" }),
  );
