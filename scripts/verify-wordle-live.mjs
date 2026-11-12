import { chromium, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const profile = await mkdtemp(join(tmpdir(), "riskle-wordle-check-"));
const extension = resolve("apps/extension");
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  timezoneId: "America/New_York",
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
});
const report = {
  checkedAt: new Date().toISOString(),
  url: "https://www.nytimes.com/games/wordle/index.html",
  observations: [],
  returnedCompleted: false,
  error: null,
};
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const read = () =>
    worker.evaluate(
      'chrome.storage.local.get("wordleObservation").then(x=>x.wordleObservation)',
    );
  const page = await context.newPage();
  async function enter() {
    const play = page.getByRole("button", { name: /^(Play|Admire Puzzle)$/ });
    const board = page.locator('[data-testid="game-wrapper"]');
    const next = page.getByRole("button", { name: /Continue to Wordle/ });
    await expect
      .poll(
        async () =>
          (await play.isVisible()) ||
          (await board.isVisible()) ||
          (await next.isVisible()),
        { timeout: 30000 },
      )
      .toBe(true);
    if (await play.isVisible()) await play.click();
    await expect
      .poll(async () => (await board.isVisible()) || (await next.isVisible()), {
        timeout: 30000,
      })
      .toBe(true);
    if (await next.isVisible()) await next.click({ timeout: 30000 });
    await board.waitFor({ timeout: 30000 });
  }
  await page.goto(report.url, { waitUntil: "domcontentloaded" });
  await enter();
  await expect
    .poll(async () => Boolean(await read()), { timeout: 10000 })
    .toBe(true);
  report.observations.push(await read());
  // Synthetic inputs in an isolated, signed-out verification profile. No guessed words are exported.
  for (const word of ["CRANE", "STOMP", "BUILD", "FJORD", "WAVES", "QUICK"]) {
    const previous = await read();
    if (["completed", "lost"].includes(previous.status)) break;
    await page.keyboard.type(word);
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await read())?.guessesUsed, { timeout: 15000 })
      .toBe(previous.guessesUsed + 1);
    report.observations.push(await read());
  }
  const final = await read();
  if (!["completed", "lost"].includes(final.status))
    throw new Error("No terminal visible result was observed");
  await worker.evaluate('chrome.storage.local.remove("wordleObservation")');
  await page.reload({ waitUntil: "domcontentloaded" });
  await enter();
  await expect
    .poll(async () => (await read())?.status, { timeout: 15000 })
    .toBe(final.status);
  report.returnedCompleted = true;
} catch (e) {
  report.error = String(e);
  const lastPage = context.pages().at(-1);
  if (lastPage)
    report.returnButtons = await lastPage.getByRole("button").allTextContents();
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
await writeFile(
  "docs/verification/wordle-live.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (report.error) process.exitCode = 1;
