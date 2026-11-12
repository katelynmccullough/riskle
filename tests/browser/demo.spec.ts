import { expect, test, type Page } from "@playwright/test";
import { createDemo } from "../../packages/game-engine/src/index";
const save = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<
        import("../../packages/game-engine/src/index").EngineSnapshot
      >((resolve, reject) => {
        const open = indexedDB.open("riskle-demo", 1);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction("state")
            .objectStore("state")
            .get("riskle.demo.v1");
          request.onsuccess = () => {
            resolve(
              request.result as import("../../packages/game-engine/src/index").EngineSnapshot,
            );
            db.close();
          };
          request.onerror = () => {
            reject(request.error);
            db.close();
          };
        };
        open.onerror = () => reject(open.error);
      }),
  );
const ready = async (page: Page) => {
  await page.goto("/demo");
  await expect(page.getByLabel("Active player")).toBeVisible();
  await expect.poll(async () => (await save(page))?.version).toBe(1);
};
const firstMarket = (page: Page) =>
  page.locator(".market").filter({ hasText: "Solve in 3 or fewer" });
const position = (page: Page) => page.locator(".position").first();
async function solve(page: Page) {
  await page.getByRole("button", { name: "Reveal test answer" }).click();
  const text = await page
    .getByText("Test answer:", { exact: false })
    .textContent();
  const answer = text!.match(/Test answer: ([A-Z]{5})/)![1];
  await page.getByLabel("Five-letter guess").fill(answer);
  await page.getByRole("button", { name: "Submit guess" }).click();
  await expect(page.getByText(/Solved in [1-6]!/)).toBeVisible();
}
test("plays friend markets, adds stake, partially cashes out, persists and settles every position", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.getByLabel("Market subject").selectOption("sarah");
  await page.getByLabel("Wager stake").fill("100");
  await firstMarket(page)
    .getByRole("button", { name: "Wager", exact: true })
    .click();
  await expect(page.locator(".position")).toHaveCount(1);
  await position(page)
    .getByRole("button", { name: "Hold", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Holding 100");
  await page.getByLabel("Active player").selectOption("sarah");
  await page.getByLabel("Five-letter guess").fill("ZZZZZ");
  await page.getByRole("button", { name: "Submit guess" }).click();
  await expect(page.getByLabel("Five-letter guess")).toHaveValue("");
  await page.getByLabel("Active player").selectOption("mara");
  await page.getByLabel("Market subject").selectOption("sarah");
  await expect(firstMarket(page)).toContainText("2.70×");
  await expect(
    page.locator(".market").filter({ hasText: "Solve in exactly 1" }),
  ).toContainText("Closed");
  await page.getByLabel("Wager stake").fill("50");
  await position(page).getByRole("button", { name: "Add 50 stake" }).click();
  await expect(page.locator(".position")).toHaveCount(2);
  let state = await save(page);
  expect(state.wagers.map((w: { stake: number }) => w.stake)).toEqual([
    100, 50,
  ]);
  expect(
    state.players.find((p: { id: string }) => p.id === "mara")!.bankroll,
  ).toBe(850);
  const original = page
    .locator(".position")
    .filter({ hasText: "Original 100 at" });
  await original.getByLabel(/Partial stake/).fill("40");
  await original.getByRole("button", { name: "Quote partial" }).click();
  await page
    .getByRole("button", { name: "Confirm cash out", exact: true })
    .click();
  await expect(original).toContainText("Remaining stake 60");
  await page.reload();
  await expect(page.locator(".position")).toHaveCount(2);
  state = await save(page);
  expect(
    state.players.find((p: { id: string }) => p.id === "mara")!.exposure,
  ).toBe(110);
  await page.getByLabel("Active player").selectOption("sarah");
  await solve(page);
  await page.getByLabel("Active player").selectOption("mara");
  await expect(
    page.locator(".position .pill").filter({ hasText: "won" }),
  ).toHaveCount(2);
  state = await save(page);
  const mara = state.players.find((p: { id: string }) => p.id === "mara")!;
  expect(mara.exposure).toBe(0);
  expect(mara.bankroll).toBe(
    1000 -
      150 +
      state.wagers.reduce(
        (s: number, w: { payout: number }) => s + w.payout,
        0,
      ),
  );
  await page.screenshot({
    path: "test-results/demo-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("creates players and leagues, enforces sharing, cashes out fully and reports a loss", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("New player name").fill("Alex");
  await page
    .getByRole("button", { name: "Create player", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Created Alex");
  const alex = await page
    .getByLabel("Active player")
    .locator("option")
    .filter({ hasText: "Alex" })
    .getAttribute("value");
  await page.getByLabel("New league name").fill("QA League");
  await page
    .getByRole("button", { name: "Create league", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Created QA League");
  await page.getByLabel("Friend to add").selectOption(alex!);
  await page.getByRole("button", { name: "Add friend", exact: true }).click();
  await page.getByLabel("Market subject").selectOption(alex!);
  await expect(
    firstMarket(page).getByRole("button", { name: "Wager", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Active player").selectOption(alex!);
  await page.getByLabel("Share my progress").check();
  await expect(page.getByLabel("Share my progress")).toBeChecked();
  await page.getByLabel("Active player").selectOption("mara");
  await page.getByLabel("Market subject").selectOption(alex!);
  await firstMarket(page)
    .getByRole("button", { name: "Wager", exact: true })
    .click();
  await position(page)
    .getByRole("button", { name: "Full cash out", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cash out", exact: true })
    .click();
  await expect(position(page)).toContainText("cashed-out");
  expect(
    (await save(page)).players.find((p: { id: string }) => p.id === "mara")!
      .exposure,
  ).toBe(0);
  await page.getByLabel("Market subject").selectOption("mara");
  await page
    .locator(".market")
    .filter({ hasText: "Solve within 6" })
    .getByRole("button", { name: "Wager", exact: true })
    .click();
  for (const word of ["ZZZZZ", "YYYYY", "XXXXX", "VVVVV", "QQQQQ", "JJJJJ"]) {
    await page.getByLabel("Five-letter guess").fill(word);
    await page.getByRole("button", { name: "Submit guess" }).click();
    if (word === "JJJJJ")
      await expect(
        page.getByText("Six guesses used.", { exact: false }),
      ).toBeVisible();
    else await expect(page.getByLabel("Five-letter guess")).toHaveValue("");
  }
  await expect(
    page.getByText("Six guesses used.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator(".position .pill").filter({ hasText: "lost" }),
  ).toHaveCount(1);
  const state = await save(page);
  expect(
    state.players.find((p: { id: string }) => p.id === "mara")!.exposure,
  ).toBe(0);
});
test("serializes two tabs and rejects exposure excess without losing wallet changes", async ({
  page,
  context,
}) => {
  await ready(page);
  const other = await context.newPage();
  await ready(other);
  await page.getByLabel("Wager stake").fill("100");
  await other.getByLabel("Wager stake").fill("100");
  await Promise.all([
    firstMarket(page)
      .getByRole("button", { name: "Wager", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click()),
    firstMarket(other)
      .getByRole("button", { name: "Wager", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click()),
  ]);
  await expect
    .poll(
      async () =>
        `${(await save(page)).wagers.length} | ${await page.locator(".feedback").innerText()} | ${await other.locator(".feedback").innerText()}`,
    )
    .toMatch(/^2 \|/);
  await expect(page.locator(".position")).toHaveCount(2);
  await expect(other.locator(".position")).toHaveCount(2);
  expect(
    (await save(page)).players.find((p: { id: string }) => p.id === "mara")!,
  ).toMatchObject({ bankroll: 800, exposure: 200 });
  await page.getByLabel("Wager stake").fill("400");
  await firstMarket(page)
    .getByRole("button", { name: "Wager", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Per-player exposure",
  );
  expect((await save(page)).wagers).toHaveLength(2);
});
test("mobile layout fits the viewport and preserves a failed storage write", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/demo-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await firstMarket(page)
    .getByRole("button", { name: "Wager", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText("Quota exceeded");
  expect((await save(page)).wagers).toHaveLength(0);
  await expect(page.locator(".position")).toHaveCount(0);
});

test("migrates an existing localStorage demo without losing its wagers", async ({
  page,
}) => {
  const engine = createDemo("2026-11-11");
  const market = engine.markets.get("sarah:2026-11-11:under3")!;
  engine.placeWager({
    userId: "mara",
    marketId: market.id,
    stake: 100,
    quoteId: market.currentQuote.id,
    requestId: "migration-bet",
  });
  await page.addInitScript(
    (snapshot) =>
      localStorage.setItem("riskle.demo.v1", JSON.stringify(snapshot)),
    engine.snapshot(),
  );
  await ready(page);
  await expect(page.locator(".position")).toHaveCount(1);
  expect((await save(page)).players.find((p) => p.id === "mara")).toMatchObject(
    { bankroll: 900, exposure: 100 },
  );
  expect(
    await page.evaluate(() => localStorage.getItem("riskle.demo.v1")),
  ).toBeNull();
});
