import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
test("loads the unpacked extension and mirrors only local mock progress in its popup", async ({
  playwright,
}, testInfo) => {
  const extension = resolve("apps/extension");
  const context = await playwright.chromium.launchPersistentContext(
    testInfo.outputPath("extension-profile"),
    {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    // Keep the extension's narrow port-3000 boundary while using our isolated test server.
    await context.route("http://127.0.0.1:3000/**", (route) =>
      route.continue({ url: route.request().url().replace(":3000", ":3100") }),
    );
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).hostname;
    const read = () =>
      worker.evaluate<{
        activeGame?: {
          game: string;
          player: string;
          bankroll: number;
          guessesUsed: number;
        };
      }>('chrome.storage.local.get("activeGame")');
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:3000/demo");
    await expect(page.getByLabel("Active player")).toBeVisible();
    await expect
      .poll(async () => (await read()).activeGame?.game)
      .toBe("riskle-mock");
    expect((await read()).activeGame).toMatchObject({
      player: "Mara",
      bankroll: 1000,
      guessesUsed: 0,
    });
    await page.getByLabel("Five-letter guess").fill("ZZZZZ");
    await page.getByRole("button", { name: "Submit guess" }).click();
    await expect
      .poll(async () => (await read()).activeGame?.guessesUsed)
      .toBe(1);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator("#bankroll")).toHaveText("1000");
    await expect(popup.locator("#progress")).toContainText("1/6");
    await expect(
      popup.getByText("Read-only snapshot", { exact: false }),
    ).toBeVisible();
    await popup.screenshot({ path: "test-results/extension-popup.png" });
  } finally {
    await context.close();
  }
});

test("observes inspected Wordle fixture states and a completed return without reading letters", async ({
  playwright,
}, testInfo) => {
  const extension = resolve("apps/extension");
  const context = await playwright.chromium.launchPersistentContext(
    testInfo.outputPath("wordle-fixture-profile"),
    {
      channel: "chromium",
      headless: true,
      timezoneId: "America/New_York",
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const current = new Date(),
      parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .formatToParts(current)
          .map((p) => [p.type, p.value]),
      );
    const date = `${parts.year}-${parts.month}-${parts.day}`,
      number = (Date.parse(date) - Date.parse("2021-06-19")) / 86400000;
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(current);
    await context.route(
      "https://www.nytimes.com/games/wordle/index.html*",
      (route) => {
        const completed = route.request().url().includes("completed=1");
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><body><section id="intro" style="display:${completed ? "none" : "block"}"><h1>Fixture: visible Wordle metadata</h1><p>${label}</p><p>No. ${number}</p><button onclick="document.getElementById('intro').style.display='none';document.getElementById('board').style.display='block'">Play</button></section><div data-testid="game-wrapper" id="board" style="display:${completed ? "block" : "none"}">${Array.from({ length: 30 }, (_, i) => `<span style="display:inline-block;width:20px;height:20px" data-testid="tile" data-state="${completed && i < 5 ? "correct" : "empty"}"></span>`).join("")}</div></body></html>`,
        });
      },
    );
    const page = await context.newPage();
    await page.goto("https://www.nytimes.com/games/wordle/index.html");
    const read = () =>
      worker.evaluate<{
        wordleObservation?: {
          status: string;
          guessesUsed: number;
          puzzleDate: string;
        };
        wordleUnsupported?: string;
      }>('chrome.storage.local.get(["wordleObservation","wordleUnsupported"])');
    await expect
      .poll(async () => (await read()).wordleUnsupported ?? "")
      .toContain("stable visible board");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(async () => (await read()).wordleObservation?.guessesUsed)
      .toBe(0);
    await page.evaluate(() =>
      document.querySelectorAll("[data-testid=tile]").forEach((el, i) => {
        if (i < 5) el.setAttribute("data-state", "correct");
      }),
    );
    await expect
      .poll(async () => (await read()).wordleObservation?.status)
      .toBe("completed");
    await worker.evaluate('chrome.storage.local.remove("wordleObservation")');
    await page.goto(
      "https://www.nytimes.com/games/wordle/index.html?completed=1",
    );
    await expect
      .poll(async () => (await read()).wordleObservation?.status)
      .toBe("completed");
    expect((await read()).wordleObservation?.puzzleDate).toBe(date);
    const panel = await context.newPage();
    const errors: string[] = [];
    panel.on("pageerror", (e) => errors.push(e.message));
    await panel.goto(
      `chrome-extension://${new URL(worker.url()).hostname}/panel.html`,
    );
    await expect(
      panel.getByRole("heading", { name: "Connect Riskle", exact: true }),
    ).toBeVisible();
    await expect(panel.locator(".extension-status")).toContainText("completed");
    expect(errors).toEqual([]);
    await panel.screenshot({
      path: "test-results/riskle-side-panel.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
