import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
let db: PGlite;
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222",
  eve = "33333333-3333-4333-8333-333333333333";
let actor = alice;
async function rpc(
  command: string,
  payload: Record<string, unknown> = {},
  requestId = randomUUID(),
) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  const r = await db.query<{ result: Record<string, unknown> }>(
    "select public.riskle_command($1,$2::jsonb,$3::uuid) result",
    [command, JSON.stringify(payload), requestId],
  );
  return r.rows[0].result;
}
async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
const observation = (
  g = 0,
  status = g ? "in_progress" : "not_started",
  date = new Date().toISOString().slice(0, 10),
) => ({
  game: "wordle",
  source: "extension_observed",
  puzzleId: `wordle:${(Date.parse(date) - Date.parse("2021-06-19")) / 86400000}`,
  puzzleDate: date,
  guessesUsed: g,
  status,
  observedAt: new Date().toISOString(),
  offsetMinutes: 0,
});
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    "create table public.profiles(id uuid); grant all on public.profiles to anon,authenticated;",
  );
  await db.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
    [
      "44444444-4444-4444-8444-444444444444",
      JSON.stringify({
        username: "preexisting",
        display_name: "Existing account",
      }),
    ],
  );
  await db.exec(
    readFileSync("supabase/migrations/002_authenticated_platform.sql", "utf8"),
  );
  for (const [id, name] of [
    [alice, "alice"],
    [bob, "bob"],
    [eve, "eve"],
  ])
    await db.query(
      "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
      [id, JSON.stringify({ username: name, display_name: name })],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("actual PostgreSQL authenticated platform", () => {
  it("initializes wallets once and restricts direct writes", async () => {
    expect(
      (
        await rows<{ balance: number }>(
          "select balance from public.rk_wallets where user_id=$1",
          [alice],
        )
      )[0].balance,
    ).toBe(1000);
    await db.exec("set role authenticated");
    await expect(
      db.query("update public.rk_wallets set balance=999999 where user_id=$1", [
        alice,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.profiles")).rejects.toThrow(
      /permission denied/,
    );
    await db.exec("reset role");
  });
  it("creates real league memberships and rejects bad invitations", async () => {
    actor = alice;
    const league = await rpc("create_league", { name: "Friends" });
    await expect(rpc("join_league", { code: "not-a-code" })).rejects.toThrow(
      /invalid/,
    );
    const invite = (
      await rows<{ code: string }>(
        "select code from public.rk_invites where league_id=$1",
        [league.id],
      )
    )[0].code;
    actor = bob;
    await rpc("join_league", { code: invite });
    await rpc("profile", { shareProgress: true });
    expect(
      (
        await rows("select * from public.rk_members where league_id=$1", [
          league.id,
        ])
      ).length,
    ).toBe(2);
  });
  it("validates progress and places immutable stakes with exact cash-out accounting", async () => {
    actor = bob;
    await rpc("observe", observation());
    const market = (
      await rows<{ id: string; quote_id: string; odds: number }>(
        "select * from public.rk_markets where kind='threshold'",
      )
    )[0];
    actor = alice;
    const original = await rpc("place", {
      marketId: market.id,
      quoteId: market.quote_id,
      stake: 100,
    });
    const added = await rpc("add_stake", {
      positionId: original.id,
      quoteId: market.quote_id,
      stake: 50,
    });
    expect(added.stake).toBe(50);
    expect(original.potential).toBe(210);
    const quote = await rpc("cashout_quote", {
      positionId: original.id,
      stake: 40,
    });
    expect(quote.credit).toBe(36);
    const request = randomUUID();
    await rpc("cashout", { quoteId: quote.id }, request);
    await rpc("cashout", { quoteId: quote.id }, request);
    expect(
      (
        await rows<{ balance: number; exposure: number }>(
          "select balance,exposure from public.rk_wallets where user_id=$1",
          [alice],
        )
      )[0],
    ).toEqual({ balance: 886, exposure: 110 });
    actor = bob;
    await rpc("observe", observation(1, "completed"));
    expect(
      (
        await rows<{ balance: number; exposure: number }>(
          "select balance,exposure from public.rk_wallets where user_id=$1",
          [alice],
        )
      )[0],
    ).toEqual({ balance: 1117, exposure: 0 });
    expect(
      (
        await rows<{ stake: number }>(
          "select stake from public.rk_positions where id=$1",
          [original.id],
        )
      )[0].stake,
    ).toBe(100);
    await expect(rpc("observe", observation(2, "completed"))).rejects.toThrow(
      /Canonical/,
    );
  });
  it("keeps private sessions and positions out of unauthorized readers", async () => {
    actor = eve;
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      eve,
    ]);
    await db.exec("set role authenticated");
    expect((await rows("select * from public.rk_sessions")).length).toBe(0);
    expect((await rows("select * from public.rk_positions")).length).toBe(0);
    await db.exec("reset role");
  });
  it("preserves daily history across new days and rejects expired observations", async () => {
    actor = alice;
    await expect(
      rpc("observe", { ...observation(), observedAt: "2020-01-01T00:00:00Z" }),
    ).rejects.toThrow(/Stale/);
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    await rpc("observe", observation(3, "completed", yesterday));
    await rpc("observe", observation());
    expect(
      (await rows("select * from public.rk_sessions where user_id=$1", [alice]))
        .length,
    ).toBe(2);
    const history = await rows<{ result: { days: unknown[] } }>(
      "select public.riskle_history(current_date) result",
    );
    expect(history[0].result.days.length).toBeGreaterThanOrEqual(1);
  });
});

async function fresh(name: string) {
  const id = randomUUID();
  await db.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
    [id, JSON.stringify({ username: name, display_name: name })],
  );
  return id;
}
async function pair() {
  const left = await fresh(`u_${randomUUID().slice(0, 8)}`),
    right = await fresh(`u_${randomUUID().slice(0, 8)}`);
  actor = left;
  const league = await rpc("create_league", { name: "Test league" });
  const invite = (
    await rows<{ code: string }>(
      "select code from public.rk_invites where league_id=$1",
      [league.id],
    )
  )[0].code;
  await rpc("profile", { shareProgress: true });
  await rpc("observe", observation());
  actor = right;
  await rpc("join_league", { code: invite });
  await rpc("profile", { shareProgress: true });
  await rpc("observe", observation());
  const sessions = await rows<{ id: string; user_id: string }>(
    "select id,user_id from public.rk_sessions where user_id=any($1::uuid[])",
    [[left, right]],
  );
  actor = left;
  return { left, right, league: league.id, sessions };
}
async function marketFor(user: string) {
  return (
    await rows<{ id: string; quote_id: string; odds: number }>(
      "select m.* from public.rk_markets m join public.rk_sessions s on s.id=m.session_id where s.user_id=$1 and m.kind='threshold'",
      [user],
    )
  )[0];
}
async function wallet(user: string) {
  return (
    await rows<{ balance: number; exposure: number }>(
      "select balance,exposure from public.rk_wallets where user_id=$1",
      [user],
    )
  )[0];
}
describe("backend accounting, freshness and authorization regression cases", () => {
  it("rejects missing and stale quote IDs, fractional stakes and forged balances", async () => {
    const { left, right } = await pair();
    const m = await marketFor(right);
    await expect(rpc("place", { marketId: m.id, stake: 20 })).rejects.toThrow(
      /Stale quote/,
    );
    await expect(
      rpc("place", { marketId: m.id, quoteId: randomUUID(), stake: 20 }),
    ).rejects.toThrow(/Stale quote/);
    await expect(
      rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 1.5 }),
    ).rejects.toThrow(/whole-coin/);
    await rpc("place", {
      marketId: m.id,
      quoteId: m.quote_id,
      stake: 20,
      balance: 999999,
      payout: 999999,
      userId: right,
    });
    expect(await wallet(left)).toEqual({ balance: 980, exposure: 20 });
  });
  it("applies aggregate, subject and puzzle exposure caps without negative wallets", async () => {
    const { left, right } = await pair();
    let m = await marketFor(right);
    await rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 500 });
    await expect(
      rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 1 }),
    ).rejects.toThrow(/Subject exposure/);
    m = await marketFor(left);
    await rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 100 });
    await expect(
      rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 1 }),
    ).rejects.toThrow(/Puzzle exposure/);
    await expect(
      rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 200 }),
    ).rejects.toThrow(/Total exposure/);
    expect(await wallet(left)).toEqual({ balance: 400, exposure: 600 });
  });
  it("full cash-outs cannot receive duplicate cash-out or settlement credits", async () => {
    const { left, right } = await pair();
    const m = await marketFor(right);
    const p = await rpc("place", {
      marketId: m.id,
      quoteId: m.quote_id,
      stake: 100,
    });
    const q = await rpc("cashout_quote", { positionId: p.id, stake: 100 });
    const id = randomUUID();
    await rpc("cashout", { quoteId: q.id }, id);
    await rpc("cashout", { quoteId: q.id }, id);
    await expect(rpc("cashout", { quoteId: q.id })).rejects.toThrow(
      /expired or already used/,
    );
    expect(await wallet(left)).toEqual({ balance: 990, exposure: 0 });
    actor = right;
    await rpc("observe", observation(1, "completed"));
    expect(await wallet(left)).toEqual({ balance: 990, exposure: 0 });
  });
  it("rejects expired markets and invalidates cash-out quotes after progress changes", async () => {
    const { left, right } = await pair();
    const m = await marketFor(right);
    const p = await rpc("place", {
      marketId: m.id,
      quoteId: m.quote_id,
      stake: 100,
    });
    const q = await rpc("cashout_quote", { positionId: p.id, stake: 40 });
    actor = right;
    await rpc("observe", observation(1));
    actor = left;
    await expect(rpc("cashout", { quoteId: q.id })).rejects.toThrow(/changed/);
    await db.query(
      "update public.rk_markets set expires_at=now()-interval '1 second' where id=$1",
      [m.id],
    );
    await expect(
      rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 20 }),
    ).rejects.toThrow(/stale/);
    expect(await wallet(left)).toEqual({ balance: 900, exposure: 100 });
  });
  it("suspends stale subjects, closes impossible markets and audits duplicate progress once", async () => {
    const { left, right } = await pair();
    let m = await marketFor(right);
    actor = right;
    const event = randomUUID(),
      payload = observation(1);
    await rpc("observe", payload, event);
    await rpc("observe", payload, event);
    expect(
      (
        await rows("select * from public.rk_progress_events where id=$1", [
          event,
        ])
      ).length,
    ).toBe(1);
    actor = left;
    await db.query(
      "update public.rk_sessions set last_seen=now()-interval '30 seconds' where user_id=$1",
      [right],
    );
    m = await marketFor(right);
    await expect(
      rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 10 }),
    ).rejects.toThrow(/suspended/);
    actor = right;
    await rpc("observe", observation(2));
    await rpc("observe", observation(3));
    expect(
      (
        await rows<{ status: string }>(
          "select status from public.rk_markets where id=$1",
          [m.id],
        )
      )[0].status,
    ).toBe("closed");
    await expect(rpc("observe", observation(2))).rejects.toThrow(
      /Out-of-order/,
    );
    expect(await wallet(left)).toEqual({ balance: 1000, exposure: 0 });
  });
  it("voids unresolved liabilities at cost after an unresolvable event gap", async () => {
    const { left, right } = await pair();
    const m = await marketFor(right);
    await rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 100 });
    actor = right;
    await rpc("observe", observation(2));
    expect(await wallet(left)).toEqual({ balance: 1000, exposure: 0 });
    expect(
      (
        await rows<{ trust: string }>(
          "select trust from public.rk_sessions where user_id=$1",
          [right],
        )
      )[0].trust,
    ).toBe("disputed");
  });
  it("enforces private progress and league administration permissions", async () => {
    const { left, right, league } = await pair();
    actor = right;
    await rpc("profile", { shareProgress: false });
    actor = left;
    const m = await marketFor(right);
    await expect(
      rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 10 }),
    ).rejects.toThrow(/private/);
    actor = eve;
    await expect(
      rpc("regenerate_invite", { leagueId: league }),
    ).rejects.toThrow(/owner/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      eve,
    ]);
    await expect(
      db.query("select public.riskle_rankings($1,current_date,1)", [league]),
    ).rejects.toThrow(/membership/);
  });
  it("settles head-to-head ties as refunds and protects both subjects from excess exposure", async () => {
    const { left, right, sessions } = await pair();
    const a = sessions.find((s) => s.user_id === left)!,
      b = sessions.find((s) => s.user_id === right)!;
    await rpc("head_to_head", { sessionId: a.id, opponentId: b.id });
    const m = (
      await rows<{ id: string; quote_id: string }>(
        "select * from public.rk_markets where session_id=$1 and kind='head_to_head'",
        [a.id],
      )
    )[0];
    await rpc("place", { marketId: m.id, quoteId: m.quote_id, stake: 100 });
    await rpc("observe", observation(1, "completed"));
    actor = right;
    await rpc("observe", observation(1, "completed"));
    expect(await wallet(left)).toEqual({ balance: 1000, exposure: 0 });
    expect(
      (
        await rows<{ status: string }>(
          "select status from public.rk_positions where market_id=$1",
          [m.id],
        )
      )[0].status,
    ).toBe("void");
  });
  it("requires authenticated users even when calling internal helpers directly", async () => {
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await expect(db.query("select public.riskle_state()")).rejects.toThrow(
      /Authentication/,
    );
    await db.exec("set role authenticated");
    await expect(
      db.query("select riskle_internal.settle(gen_random_uuid(),'yes')"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
  it("reconciles every wallet against its ledger and remaining positions after all scenarios", async () => {
    const totals = await rows<{
      balance: number;
      exposure: number;
      ledger: number;
      risk: number;
    }>(
      `select w.balance,w.exposure,(select coalesce(sum(amount),0)::bigint from public.rk_ledger l where l.user_id=w.user_id) ledger,(select coalesce(sum(remaining_stake),0)::bigint from public.rk_positions p where p.user_id=w.user_id and p.status='open') risk from public.rk_wallets w`,
    );
    for (const w of totals) {
      expect(w.balance).toBe(w.ledger);
      expect(w.exposure).toBe(w.risk);
      expect(w.balance).toBeGreaterThanOrEqual(0);
    }
  });
});

it("preserves existing Auth account metadata and backfills exactly one starting wallet", async () => {
  const old = (
    await rows<{ username: string; balance: number }>(
      "select p.username,w.balance from public.rk_profiles p join public.rk_wallets w on w.user_id=p.id where p.id='44444444-4444-4444-8444-444444444444'",
    )
  )[0];
  expect(old).toEqual({ username: "preexisting", balance: 1000 });
});
it("applies opponent exposure limits to head-to-head positions", async () => {
  const { left, right, sessions } = await pair();
  const market = await marketFor(right);
  await rpc("place", {
    marketId: market.id,
    quoteId: market.quote_id,
    stake: 500,
  });
  const lhs = sessions.find((s) => s.user_id === left)!,
    rhs = sessions.find((s) => s.user_id === right)!;
  await rpc("head_to_head", { sessionId: lhs.id, opponentId: rhs.id });
  const h2h = (
    await rows<{ id: string; quote_id: string }>(
      "select * from public.rk_markets where session_id=$1 and kind='head_to_head'",
      [lhs.id],
    )
  )[0];
  await expect(
    rpc("place", { marketId: h2h.id, quoteId: h2h.quote_id, stake: 1 }),
  ).rejects.toThrow(/Opponent exposure/);
  expect(await wallet(left)).toEqual({ balance: 500, exposure: 500 });
});
it("returns month history, opt-in daily positions and timezone-aware statistics", async () => {
  actor = alice;
  await rpc("profile", { publicRankings: true });
  const result = (
    await rows<{
      result: {
        days: { daily_rank: number | null }[];
        stats: { winRate: number };
      };
    }>("select public.riskle_history(current_date,0) result")
  )[0].result;
  expect(result.days.length).toBeGreaterThan(0);
  expect(result.days.every((day) => day.daily_rank === 1)).toBe(true);
  expect(result.stats.winRate).toBe(100);
  await expect(
    db.query("select public.riskle_history(current_date,999)"),
  ).rejects.toThrow(/timezone/);
});
it("returns every open position even beyond the closed-history display limit", async () => {
  const { left, right } = await pair();
  const market = await marketFor(right);
  for (let i = 0; i < 205; i++)
    await rpc("place", {
      marketId: market.id,
      quoteId: market.quote_id,
      stake: 1,
    });
  const state = (
    await rows<{ result: { positions: unknown[] } }>(
      "select public.riskle_state() result",
    )
  )[0].result;
  expect(state.positions).toHaveLength(205);
  expect(await wallet(left)).toEqual({ balance: 795, exposure: 205 });
});
it("refunds abandoned remaining stake without fabricating a completed game", async () => {
  const { left, right } = await pair();
  const market = await marketFor(right);
  await rpc("place", {
    marketId: market.id,
    quoteId: market.quote_id,
    stake: 100,
  });
  await db.query(
    "update public.rk_sessions set last_seen=now()-interval '49 hours' where user_id=$1",
    [right],
  );
  await db.query("select public.riskle_state()");
  expect(await wallet(left)).toEqual({ balance: 1000, exposure: 0 });
  expect(
    (
      await rows<{ status: string; guesses: number; trust: string }>(
        "select status,guesses,trust from public.rk_sessions where user_id=$1",
        [right],
      )
    )[0],
  ).toEqual({ status: "not_started", guesses: 0, trust: "disputed" });
});
