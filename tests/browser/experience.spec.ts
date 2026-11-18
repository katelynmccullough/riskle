import { expect, test } from "@playwright/test";
import {
  installExperienceApi,
  panelExtension,
  project,
  authSession,
  signInFixture,
} from "./experience-fixture";
import { fixturePosition, sessionId } from "../fixtures/platform-state";
test("guided placement, stale review, immutable add and server-quoted partial/full cash out", async ({
  page,
  context,
}) => {
  const api = await installExperienceApi(context);
  await signInFixture(page);
  await page.goto("/?view=play");
  await expect(
    page.getByRole("heading", { name: "Make your call." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exactly 3 guesses", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose stake", exact: true }).click();
  await page.getByRole("button", { name: "50", exact: true }).click();
  await page.getByRole("button", { name: "Review prediction" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Potential total payout");
  await expect(dialog).toContainText("225 coins");
  await expect(dialog).toContainText("+175 coins");
  await expect(dialog).toContainText("−50 coins");
  await page.screenshot({ path: "test-results/phase4-web-confirmation.png" });
  await page
    .getByRole("button", { name: "Confirm prediction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(api.state.positions[0].stake).toBe(50);
  await expect(page.getByText("You’re in.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Losing wager" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Your bets", exact: true }).click();
  await page.getByRole("button", { name: "Add stake", exact: true }).click();
  await page.getByLabel("Stake", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Review added stake" }).click();
  await expect(dialog).toContainText("new, separate position");
  await page
    .getByRole("button", { name: "Confirm added stake", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(api.state.positions.map((p) => p.stake)).toEqual([25, 50]);
  expect(api.state.wallet.balance).toBe(925);
  const originalId = api.state.positions.find((p) => p.stake === 50)!.id,
    card = page.locator(`[data-position-id="${originalId}"]`);
  await card.getByRole("button", { name: "Cash out", exact: true }).click();
  await page.getByLabel("Stake to cash out").fill("20");
  await page
    .getByRole("button", { name: "Get cash-out quote", exact: true })
    .click();
  await expect(dialog).toContainText("Server-confirmed return");
  await expect(dialog).toContainText("Realized cash-out loss");
  expect(api.requests.at(-1)?.action).toBe("cashout_quote");
  expect(api.state.wallet.balance).toBe(925);
  await page
    .getByRole("button", { name: "Confirm cash out", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    api.state.positions.find((p) => p.id === originalId)!.remaining_stake,
  ).toBe(30);
  expect(api.state.positions.find((p) => p.id === originalId)!.stake).toBe(50);
  await card.getByRole("button", { name: "Cash out", exact: true }).click();
  await page
    .getByRole("button", { name: "Get cash-out quote", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cash out", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(api.state.positions.find((p) => p.id === originalId)!.status).toBe(
    "cashout",
  );
  expect(api.state.wallet.exposure).toBe(25);
  // The review retains the original quote and refuses to silently switch to a new one.
  await page.getByRole("button", { name: "Your corner", exact: true }).click();
  await page
    .getByRole("button", { name: "Open the play desk", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose stake", exact: true }).click();
  await page.getByRole("button", { name: "Review prediction" }).click();
  api.state.markets.forEach((m) => {
    m.quote_id = "changed-quote";
    m.version++;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Confirm prediction", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("changed");
  await page.getByRole("button", { name: "Close dialog" }).press("Escape");
  await expect(dialog).not.toBeVisible();
});
test("new confirmed settlements animate once, survive refresh without replay, and keep losses distinct from refunds", async ({
  page,
  context,
}) => {
  const api = await installExperienceApi(context),
    p = fixturePosition(api.state);
  api.state.positions = [p];
  api.state.wallet = { balance: 950, exposure: 50 };
  api.state.ledger.push({
    id: 2,
    amount: -50,
    kind: "stake",
    position_id: p.id,
    created_at: new Date().toISOString(),
  });
  await signInFixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mara", exact: true }),
  ).toBeVisible();
  api.settle(p.id, "won");
  await page.getByRole("button", { name: "Refresh account" }).click();
  await expect(page.getByLabel("Winning wager")).toBeVisible();
  await expect(page.getByLabel("Winning wager")).toContainText("+175");
  await expect(
    page.getByLabel("Available coins", { exact: true }),
  ).toHaveAttribute("data-value", "1175");
  await page.getByRole("button", { name: "Dismiss result" }).click();
  await page.getByRole("button", { name: "Refresh account" }).click();
  await expect(page.getByLabel("Winning wager")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Mara", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Winning wager")).toHaveCount(0);
  const loser = { ...fixturePosition(api.state), id: "losing-position" };
  api.state.positions.unshift(loser);
  api.state.wallet.balance -= 50;
  api.state.wallet.exposure += 50;
  api.state.ledger.push({
    id: 4,
    amount: -50,
    kind: "stake",
    position_id: loser.id,
    created_at: new Date().toISOString(),
  });
  await page.getByRole("button", { name: "Refresh account" }).click();
  await expect(
    page.getByLabel("Available coins", { exact: true }),
  ).toHaveAttribute("data-value", "1125");
  api.settle(loser.id, "lost");
  await page.getByRole("button", { name: "Refresh account" }).click();
  await expect(page.getByLabel("Losing wager")).toContainText("-50");
  await expect(
    page.getByLabel("Available coins", { exact: true }),
  ).toHaveAttribute("data-value", "1125");
  await page.getByRole("button", { name: "Dismiss result" }).click();
  await page.getByRole("button", { name: "Refresh account" }).click();
  await expect(page.getByLabel("Losing wager")).toHaveCount(0);
  const refund = { ...fixturePosition(api.state), id: "void-position" };
  api.state.positions.unshift(refund);
  api.state.wallet.balance -= 50;
  api.state.wallet.exposure += 50;
  api.state.ledger.push({
    id: 6,
    amount: -50,
    kind: "stake",
    position_id: refund.id,
    created_at: new Date().toISOString(),
  });
  await page.getByRole("button", { name: "Refresh account" }).click();
  api.settle(refund.id, "void");
  await page.getByRole("button", { name: "Refresh account" }).click();
  await expect(page.getByText("No contest.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Winning wager")).toHaveCount(0);
  await expect(page.getByLabel("Losing wager")).toHaveCount(0);
});
test("review closes safely on expired quotes and reports backend rejection inside the dialog", async ({
  page,
  context,
}) => {
  const api = await installExperienceApi(context);
  await signInFixture(page);
  await page.goto("/?view=play");
  await page.getByRole("button", { name: "Choose stake", exact: true }).click();
  await page.getByRole("button", { name: "Review prediction" }).click();
  api.reject("Subject exposure limit (50%)");
  await page
    .getByRole("button", { name: "Confirm prediction", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Subject exposure",
  );
  expect(api.state.positions).toHaveLength(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Review prediction" }).click();
  const firstQuote = api.state.markets.find(
    (m) => m.kind === "exact" && m.target === 3 && m.session_id === sessionId,
  )!;
  firstQuote.expires_at = new Date(Date.now() - 1).toISOString();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Confirm prediction", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "expired",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("actual bundled side panel fits 320–480px, respects privacy and reduced motion, and transitions to shareable results", async ({
  playwright,
}, info) => {
  const extension = await panelExtension(info.outputPath("extension"));
  const context = await playwright.chromium.launchPersistentContext(
    info.outputPath("profile"),
    {
      channel: "chromium",
      headless: true,
      viewport: { width: 320, height: 900 },
      reducedMotion: "reduce",
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    const api = await installExperienceApi(context),
      worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
    await worker.evaluate(
      ({ session, config }) =>
        chrome.storage.local.set({
          "riskle.auth": JSON.stringify(session),
          platformConfig: config,
        }),
      { session: authSession(), config: project },
    );
    const page = await context.newPage();
    await page.goto(
      `chrome-extension://${new URL(worker.url()).hostname}/panel.html`,
    );
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Make your call." }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Private Pal/ })).toHaveCount(
      0,
    );
    for (const width of [320, 380, 480]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 380, height: 900 });
    const chooseStake = page.getByRole("button", {
      name: "Choose stake",
      exact: true,
    });
    const actionBounds = await chooseStake.boundingBox();
    const navigationBounds = await page
      .getByRole("navigation", { name: "Main navigation" })
      .boundingBox();
    expect(actionBounds!.y + actionBounds!.height).toBeLessThan(
      navigationBounds!.y,
    );

    await page.screenshot({
      path: "test-results/phase4-panel-play.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Choose stake", exact: true })
      .click();
    await page.screenshot({
      path: "test-results/phase4-panel-amount.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Review prediction" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({
      path: "test-results/phase4-panel-confirmation.png",
    });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      page.getByText("Progress private", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Wager on Private Pal" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "The bragging order." }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/phase4-panel-friends.png",
      fullPage: true,
    });
    const own = api.state.sessions.find((s) => s.id === sessionId)!;
    own.status = "completed";
    own.guesses = 4;
    api.state.markets
      .filter((m) => m.session_id === sessionId)
      .forEach((m) => {
        m.status = "closed";
        m.eligible = false;
      });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Refresh account" }).click();
    await expect(
      page.getByRole("heading", { name: "That’s a wrap." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review prediction" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Share your day" }).click();
    await expect(page.getByRole("dialog")).toContainText("4/6");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download card" }).click();
    expect((await download).suggestedFilename()).toMatch(/^riskle-.*\.png$/);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.screenshot({
      path: "test-results/phase4-panel-results.png",
      fullPage: true,
    });
    const p = fixturePosition(api.state);
    api.state.positions = [p];
    api.state.wallet = { balance: 950, exposure: 50 };
    api.state.ledger.push({
      id: 2,
      amount: -50,
      kind: "stake",
      position_id: p.id,
      created_at: new Date().toISOString(),
    });
    await page.getByRole("button", { name: "Refresh account" }).click();
    api.settle(p.id, "won");
    await page.getByRole("button", { name: "Refresh account" }).click();
    await expect(page.getByLabel("Winning wager")).toBeVisible();
    expect(
      await page
        .locator(".rk-outcome")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    expect(
      await page
        .locator(".rk-confetti")
        .evaluate((el) => getComputedStyle(el).display),
    ).toBe("none");
    await page.screenshot({
      path: "test-results/phase4-panel-win.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("web companion offers account history, settings and optional onboarding at desktop and mobile sizes", async ({
  page,
  context,
}) => {
  await installExperienceApi(context);
  await signInFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Mara", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open the play desk", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/phase4-web-overview.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Puzzle history", exact: true })
    .click();
  await expect(page.locator(".rk-calendar")).toBeVisible();
  await page.screenshot({
    path: "test-results/phase4-web-history-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "A little help", exact: true })
    .click();
  await page.getByRole("button", { name: "Take the quick tour" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
