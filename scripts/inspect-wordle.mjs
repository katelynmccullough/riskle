import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const response = await page.goto(
    "https://www.nytimes.com/games/wordle/index.html",
    { waitUntil: "domcontentloaded", timeout: 30000 },
  );
  await page
    .getByRole("button", { name: "Play", exact: true })
    .waitFor({ timeout: 20000 })
    .catch(() => undefined);
  const intro = await page.locator("body").innerText();
  const play = page.getByRole("button", { name: "Play", exact: true });
  if (await play.isVisible()) await play.click();
  await page
    .getByRole("button", { name: "Enter", exact: true })
    .waitFor({ timeout: 15000 })
    .catch(() => undefined);
  const continueButton = page.getByRole("button", {
    name: /Continue to Wordle/,
  });
  if (await continueButton.isVisible())
    await continueButton.click({ timeout: 25000 }).catch(() => undefined);
  const signals = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '[data-state], [data-testid], [role="grid"], [role="row"]',
      ),
    ]
      .filter((el) => el.getClientRects().length)
      .slice(0, 80)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        state: el.getAttribute("data-state"),
        testId: el.getAttribute("data-testid"),
        role: el.getAttribute("role"),
        parentClass: el.parentElement?.className,
      })),
  );
  const report = {
    url: page.url(),
    status: response?.status(),
    title: await page.title(),
    headings: await page.locator("h1, h2").allTextContents(),
    buttons: await page.getByRole("button").allTextContents(),
    intro,
    visibleText: await page.locator("body").innerText(),
    signals,
    inspectedAt: new Date().toISOString(),
  };
  await mkdir("docs/verification", { recursive: true });
  await page.screenshot({ path: "docs/verification/wordle-initial.png" });
  await writeFile(
    "docs/verification/wordle-inspection.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
