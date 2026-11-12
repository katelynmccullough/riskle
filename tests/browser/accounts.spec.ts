import { expect, test } from "@playwright/test";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profile = {
  id,
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
  share_progress: false,
  public_rankings: false,
};
const user = {
  id,
  email: "alice@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  created_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: { username: "alice" },
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
test("account UI uses Supabase signup/login/reset and persists/logout sessions (HTTP fixtures)", async ({
  page,
}) => {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  let failLogin = true;
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const body =
      request.method() === "POST" ? (request.postDataJSON() ?? {}) : {};
    requests.push({ path: url.pathname, body });
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (url.pathname.endsWith("/signup")) return json({ user, session: null });
    if (url.pathname.endsWith("/token")) {
      if (failLogin)
        return json(
          { msg: "Invalid login credentials", code: "invalid_credentials" },
          400,
        );
      return json({
        access_token: token,
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    }
    if (url.pathname.endsWith("/user")) return json(user);
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/recover")) return json({});
    if (url.pathname.endsWith("/riskle_state"))
      return json({
        profile,
        wallet: { balance: 1000, exposure: 0 },
        profiles: [profile],
        sessions: [],
        markets: [],
        positions: [],
        leagues: [],
        members: [],
        invites: [],
        ledger: [
          {
            id: 1,
            amount: 1000,
            kind: "starting_credit",
            created_at: new Date().toISOString(),
          },
        ],
      });
    if (url.pathname.endsWith("/riskle_history"))
      return json({
        days: [],
        stats: {
          games: 0,
          wins: 0,
          average: null,
          streak: 0,
          longestStreak: 0,
        },
      });
    if (url.pathname.endsWith("/riskle_rankings")) return json([]);
    return json({ message: "Unexpected fixture request" }, 400);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mock test lab" }),
  ).toHaveAttribute("href", "/demo");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("alice@example.invalid");
  await page.getByLabel("Username", { exact: true }).fill("alice");
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Confirm the email");
  expect(requests.find((r) => r.path.endsWith("/signup"))?.body).toMatchObject({
    email: "alice@example.invalid",
    data: { username: "alice", display_name: "alice" },
  });
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("test-password-123");
  await page
    .locator("form")
    .getByRole("button", { name: "Log in", exact: true })
    .click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Invalid login credentials",
  );
  failLogin = false;
  await page
    .locator("form")
    .getByRole("button", { name: "Log in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alice", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stat").first()).toContainText("1000");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Alice", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Forgot password", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("alice@example.invalid");
  await page
    .getByRole("button", { name: "Send reset email", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Reset request accepted",
  );
  expect(requests.some((r) => r.path.endsWith("/recover"))).toBe(true);
});
