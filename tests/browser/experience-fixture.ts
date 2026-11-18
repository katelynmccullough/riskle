import type { BrowserContext, Page, Route } from "@playwright/test";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  fixtureState,
  fixtureHistory,
  fixturePosition,
  uuid,
  userId,
} from "../fixtures/platform-state";
import type { PlatformPosition } from "../../apps/web/lib/platform-client";
export const project = {
  url: "https://riskle-ui-test.supabase.co",
  key: "sb_publishable_fixture",
};
export function authSession() {
  const user = {
    id: userId,
    email: "mara@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
    user_metadata: { username: "mara" },
  };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
  return {
    access_token: token,
    refresh_token: "fixture-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
}
export async function installExperienceApi(
  context: BrowserContext,
  state = fixtureState(),
) {
  const requests: { action: string; payload: Record<string, unknown> }[] = [];
  const quotes = new Map<
    string,
    {
      id: string;
      position_id: string;
      stake: number;
      remaining_stake: number;
      liability: number;
      credit: number;
      market_version: number;
      expires_at: string;
    }
  >();
  let rejectNext = "";
  const ledger = (kind: string, amount: number, p?: PlatformPosition) =>
    state.ledger.push({
      id: Math.max(0, ...state.ledger.map((l) => l.id)) + 1,
      kind,
      amount,
      position_id: p?.id,
      created_at: new Date().toISOString(),
    });
  const json = (route: Route, data: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  await context.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await context.route("https://*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url()),
      body =
        route.request().method() === "POST"
          ? (route.request().postDataJSON() ?? {})
          : {};
    if (url.pathname.includes("/auth/")) {
      if (url.pathname.endsWith("/logout"))
        return route.fulfill({ status: 204 });
      if (url.pathname.endsWith("/user"))
        return json(route, authSession().user);
      return json(route, authSession());
    }
    if (url.pathname.endsWith("/riskle_state")) {
      for (const s of state.sessions)
        if (s.live) s.last_seen = new Date().toISOString();
      return json(route, state);
    }
    if (url.pathname.endsWith("/riskle_history"))
      return json(route, fixtureHistory(state));
    if (url.pathname.endsWith("/riskle_rankings"))
      return json(
        route,
        state.profiles
          .filter((p) => p.id !== uuid(3))
          .map((p) => ({
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            balance: p.id === state.profile.id ? state.wallet.balance : 1000,
            exposure: p.id === state.profile.id ? state.wallet.exposure : 0,
            profit:
              p.id === state.profile.id
                ? state.wallet.balance + state.wallet.exposure - 1000
                : 0,
            open_positions: state.positions.filter(
              (pos) => pos.status === "open",
            ).length,
          }))
          .sort(
            (a, b) =>
              b.profit - a.profit || a.username.localeCompare(b.username),
          ),
      );
    if (!url.pathname.endsWith("/riskle_command"))
      return json(route, { message: "Unexpected fixture API" }, 404);
    const { command: action, payload } = body as {
      command: string;
      payload: Record<string, unknown>;
    };
    requests.push({ action, payload });
    if (rejectNext) {
      const message = rejectNext;
      rejectNext = "";
      return json(route, { message, code: "P0001" }, 400);
    }
    const original = state.positions.find((p) => p.id === payload.positionId),
      market = state.markets.find(
        (m) =>
          m.id ===
          (action === "add_stake" ? original?.market_id : payload.marketId),
      );
    if (action === "place" || action === "add_stake") {
      if (
        !market ||
        market.quote_id !== payload.quoteId ||
        market.status !== "open" ||
        !market.eligible
      )
        return json(route, { message: "Stale quote", code: "P0001" }, 400);
      const stake = Number(payload.stake),
        p = {
          ...fixturePosition(state, stake),
          market_id: market.id,
          title: market.title,
          subject_id: state.sessions.find((s) => s.id === market.session_id)!
            .user_id,
          odds: market.odds,
          potential: Math.floor((stake * market.odds) / 100),
          remaining_payout: Math.floor((stake * market.odds) / 100),
        };
      state.positions.unshift(p);
      state.wallet.balance -= stake;
      state.wallet.exposure += stake;
      ledger("stake", -stake, p);
      return json(route, p);
    }
    if (action === "hold") return json(route, original);
    if (action === "cashout_quote" && original) {
      const m = state.markets.find((m) => m.id === original.market_id)!,
        stake = Number(payload.stake),
        liability =
          stake === original.remaining_stake
            ? original.remaining_payout
            : Math.floor(
                (original.remaining_payout * stake) / original.remaining_stake,
              ),
        credit = Math.floor((liability * 90) / m.odds),
        q = {
          id: uuid(800 + quotes.size),
          position_id: original.id,
          stake,
          remaining_stake: original.remaining_stake,
          liability,
          credit,
          market_version: m.version,
          expires_at: new Date(Date.now() + 15000).toISOString(),
        };
      quotes.set(q.id, q);
      return json(route, q);
    }
    if (action === "cashout") {
      const q = quotes.get(String(payload.quoteId)),
        p = state.positions.find((p) => p.id === q?.position_id);
      if (!q || !p) return json(route, { message: "Expired quote" }, 400);
      p.remaining_stake -= q.stake;
      p.remaining_payout -= q.liability;
      p.paid += q.credit;
      if (!p.remaining_stake) p.status = "cashout";
      state.wallet.balance += q.credit;
      state.wallet.exposure -= q.stake;
      ledger("cashout", q.credit, p);
      quotes.delete(q.id);
      return json(route, { credit: q.credit });
    }
    if (action === "refresh") {
      for (const m of state.markets) {
        m.version++;
        m.quote_id = uuid(2000 + m.version * 10 + state.markets.indexOf(m));
        m.expires_at = new Date(Date.now() + 120000).toISOString();
      }
      return json(route, {});
    }
    if (action === "profile") {
      Object.assign(state.profile, {
        display_name: payload.displayName ?? state.profile.display_name,
        username: payload.username ?? state.profile.username,
        avatar_url: payload.avatarUrl ?? null,
        share_progress: payload.shareProgress ?? state.profile.share_progress,
        public_rankings:
          payload.publicRankings ?? state.profile.public_rankings,
      });
      return json(route, state.profile);
    }
    return json(route, {});
  });
  return {
    state,
    requests,
    reject: (message: string) => {
      rejectNext = message;
    },
    settle: (id: string, outcome: "won" | "lost" | "void") => {
      const p = state.positions.find((p) => p.id === id)!;
      const amount =
        outcome === "won"
          ? p.remaining_payout
          : outcome === "void"
            ? p.remaining_stake
            : 0;
      state.wallet.balance += amount;
      state.wallet.exposure -= p.remaining_stake;
      p.paid += amount;
      p.remaining_stake = 0;
      p.remaining_payout = 0;
      p.status = outcome;
      ledger(
        outcome === "won"
          ? "settlement_yes"
          : outcome === "lost"
            ? "settlement_no"
            : "settlement_void",
        amount,
        p,
      );
    },
  };
}
export async function signInFixture(page: Page) {
  await page.addInitScript(
    (session) => localStorage.setItem("riskle.auth", JSON.stringify(session)),
    authSession(),
  );
}
export async function panelExtension(output: string) {
  await mkdir(output, { recursive: true });
  for (const file of [
    "panel.html",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "popup.css",
  ])
    await cp(resolve("apps/extension", file), join(output, file));
  await cp(resolve("apps/extension/dist"), join(output, "dist"), {
    recursive: true,
  });
  const manifest = JSON.parse(
    await readFile("apps/extension/manifest.json", "utf8"),
  );
  manifest.host_permissions = [`${project.url}/*`];
  await writeFile(join(output, "manifest.json"), JSON.stringify(manifest));
  return output;
}
