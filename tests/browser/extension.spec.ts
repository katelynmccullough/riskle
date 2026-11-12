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
    await page.goto("http://127.0.0.1:3000");
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
      popup.getByText("Actual Wordle detection", { exact: false }),
    ).toBeVisible();
    await popup.screenshot({ path: "test-results/extension-popup.png" });
  } finally {
    await context.close();
  }
});
