"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  command,
  loadPlatform,
  type History,
  type PlatformState,
  type Ranking,
} from "../../lib/platform-client";
import {
  acknowledgeEvents,
  type FeedbackEvent,
} from "../../lib/confirmed-events";
import { localDate } from "../../lib/game-experience";
export type Mutate = <T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown>,
  message?: string,
) => Promise<T | undefined>;
export function useRiskleAccount(client: SupabaseClient | null) {
  const [session, setSession] = useState<Session | null>(null),
    [state, setState] = useState<PlatformState>(),
    [history, setHistory] = useState<History>(),
    [todayHistory, setTodayHistory] = useState<History>(),
    [rankings, setRankings] = useState<Ranking[]>([]);
  const [loading, setLoading] = useState(!!client),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [recovery, setRecovery] = useState(false),
    [events, setEvents] = useState<FeedbackEvent[]>([]);
  const [month, setMonth] = useState(localDate().slice(0, 7)),
    [league, setLeague] = useState(""),
    [weekly, setWeekly] = useState(false),
    [rankingDate, setRankingDate] = useState(localDate()),
    [now, setNow] = useState(Date.now());
  const mounted = useRef(true),
    seq = useRef(0),
    owner = useRef<string>(),
    bootstrap = useRef(true),
    pending = useRef(false),
    rankBefore = useRef<{ scope: string; rank: number }>();
  const reload = useCallback(async () => {
    if (!client) return;
    const version = ++seq.current;
    try {
      const data = await loadPlatform(client);
      if (!mounted.current || version !== seq.current) return;
      if (owner.current && data.profile.id !== owner.current) return;
      const first = bootstrap.current;
      bootstrap.current = false;
      setState(data);
      setLoading(false);
      try {
        const incoming = await acknowledgeEvents(data, first);
        if (
          mounted.current &&
          data.profile.id === owner.current &&
          incoming.length
        )
          setEvents((old) => [...old, ...incoming].slice(-3));
      } catch {
        /* No durable acknowledgement means no animation. The confirmed results remain visible. */
      }
    } catch (e) {
      if (mounted.current && version === seq.current) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }
  }, [client]);
  useEffect(() => {
    mounted.current = true;
    if (!client) {
      setLoading(false);
      return;
    }
    function accept(next: Session | null, event?: string) {
      if (!mounted.current) return;
      const id = next?.user.id;
      if (owner.current !== id) {
        owner.current = id;
        seq.current++;
        bootstrap.current = true;
        setState(undefined);
        setHistory(undefined);
        setTodayHistory(undefined);
        setRankings([]);
        setEvents([]);
        setLoading(!!next);
        setError("");
      }
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (next) setTimeout(() => void reload(), 0);
      else setLoading(false);
    }
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      accept(data.session);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => accept(next, event));
    let debounce: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void reload(), 90);
    };
    window.addEventListener("focus", changed);
    const channel = client
      .channel("riskle-account")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_sessions" },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_wallets" },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_positions" },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_members" },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rk_profiles" },
        changed,
      )
      .subscribe();
    const poll = setInterval(() => {
        if (owner.current) void reload();
      }, 5000),
      clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      seq.current++;
      clearInterval(poll);
      clearInterval(clock);
      clearTimeout(debounce);
      window.removeEventListener("focus", changed);
      subscription.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [client, reload]);
  useEffect(() => {
    if (!client || !state || !session) return;
    let valid = true;
    const uid = state.profile.id;
    async function getMonth(value: string) {
      const { data, error } = await client!.rpc("riskle_history", {
        month_start: `${value}-01`,
        offset_minutes: new Date().getTimezoneOffset(),
      });
      if (error) throw new Error(error.message);
      return data as History;
    }
    const current = localDate().slice(0, 7);
    void Promise.all([
      getMonth(month),
      month === current ? Promise.resolve(undefined) : getMonth(current),
    ])
      .then(([chosen, today]) => {
        if (valid && uid === owner.current) {
          setHistory(chosen);
          setTodayHistory(today ?? chosen);
        }
      })
      .catch((e) => {
        if (valid) setError(String(e));
      });
    const date = new Date(`${rankingDate}T12:00:00`);
    if (weekly) date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    void client
      .rpc("riskle_rankings", {
        league_id: league || null,
        period_start: localDate(date),
        period_days: weekly ? 7 : 1,
      })
      .then(({ data, error }) => {
        if (valid && uid === owner.current) {
          if (error) setError(error.message);
          else {
            const next = data as Ranking[];
            setRankings(next);
            const rank = next.findIndex((row) => row.id === uid),
              scope = `${uid}:${league}:${rankingDate}:${weekly}`;
            const previous = rankBefore.current;
            if (
              previous?.scope === scope &&
              previous.rank >= 0 &&
              rank >= 0 &&
              previous.rank !== rank
            )
              setEvents((old) =>
                [
                  ...old,
                  {
                    id: `rank:${scope}:${previous.rank}:${rank}`,
                    kind: "rank",
                    title:
                      rank < previous.rank
                        ? "Making moves."
                        : "The league is keeping you honest.",
                    detail: `You moved from #${previous.rank + 1} to #${rank + 1} since the previous confirmed update.`,
                  } as FeedbackEvent,
                ].slice(-3),
              );
            rankBefore.current = { scope, rank };
          }
        }
      });
    return () => {
      valid = false;
    };
  }, [client, state, session, month, league, weekly, rankingDate]);
  const mutate: Mutate = async <T>(
    action: string,
    payload: Record<string, unknown>,
    message?: string,
  ) => {
    if (!client || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await command<T>(client, action, payload);
      await reload();
      if (message) setNotice(message);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const dismissEvent = (id: string) =>
    setEvents((old) => old.filter((e) => e.id !== id));
  return {
    client,
    session,
    state,
    history,
    todayHistory,
    rankings,
    loading,
    busy,
    error,
    notice,
    recovery,
    events,
    month,
    setMonth,
    league,
    setLeague,
    weekly,
    setWeekly,
    rankingDate,
    setRankingDate,
    now,
    mutate,
    reload,
    setError,
    setNotice,
    setRecovery,
    dismissEvent,
  };
}
export type AccountController = ReturnType<typeof useRiskleAccount>;
