import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  share_progress: boolean;
  public_rankings: boolean;
};
export type PlatformSession = {
  id: string;
  user_id: string;
  puzzle_id: string;
  puzzle_date: string;
  guesses: number;
  status: string;
  live: boolean;
  trust: string;
  last_seen: string;
};
export type PlatformMarket = {
  id: string;
  session_id: string;
  opponent_id: string | null;
  kind: string;
  title: string;
  odds: number;
  quote_id: string;
  eligible: boolean;
  status: string;
  outcome: string | null;
  expires_at: string;
};
export type PlatformPosition = {
  id: string;
  market_id: string;
  subject_id: string;
  title: string;
  puzzle_date: string;
  stake: number;
  odds: number;
  potential: number;
  remaining_stake: number;
  remaining_payout: number;
  paid: number;
  status: string;
};
export type PlatformState = {
  profile: Profile;
  wallet: { balance: number; exposure: number };
  profiles: Profile[];
  sessions: PlatformSession[];
  markets: PlatformMarket[];
  positions: PlatformPosition[];
  leagues: { id: string; name: string; owner_id: string }[];
  members: { league_id: string; user_id: string }[];
  invites: { league_id: string; code: string; expires_at: string }[];
  ledger: { id: number; amount: number; kind: string; created_at: string }[];
};
export type History = {
  days: (PlatformSession & { profit: number; daily_rank?: number | null })[];
  stats: {
    games: number;
    wins: number;
    average: number | null;
    streak: number;
    longestStreak: number;
  };
};
export type Ranking = {
  id: string;
  username: string;
  avatar_url: string | null;
  balance: number;
  exposure: number;
  profit: number;
  open_positions: number;
};
export type PlatformConfig = { url: string; key: string };
export function validateConfig(config: PlatformConfig) {
  const u = new URL(config.url);
  if (!(
    (u.protocol === "https:" &&
      u.port === "" &&
      /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)) ||
    (u.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(u.hostname) &&
      u.port === "54321")
  ))
    throw new Error(
      "Use your HTTPS Supabase project URL (or localhost:54321 for local Supabase).",
    );
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.key))
    throw new Error(
      "Use a publishable key only. Secret/service-role keys are prohibited.",
    );
  return { url: u.origin, key: config.key };
}
export function platformClient(
  config: PlatformConfig,
  storage?: SupportedStorage,
) {
  const valid = validateConfig(config);
  return createClient(valid.url, valid.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl:
        typeof window !== "undefined" &&
        window.location.protocol !== "chrome-extension:",
      storage,
      storageKey: "riskle.auth",
    },
  });
}
export async function command<T = Record<string, unknown>>(
  client: SupabaseClient,
  action: string,
  payload: Record<string, unknown> = {},
  requestId = crypto.randomUUID(),
): Promise<T> {
  const { data, error } = await client.rpc("riskle_command", {
    command: action,
    payload,
    request_id: requestId,
  });
  if (error) throw new Error(error.message);
  return data as T;
}
export async function loadPlatform(
  client: SupabaseClient,
): Promise<PlatformState> {
  const { data, error } = await client.rpc("riskle_state");
  if (error)
    throw new Error(
      error.message.includes("riskle_state")
        ? "The Riskle database migration has not been applied yet. See docs/PHASE3_SETUP.md."
        : error.message,
    );
  return data as PlatformState;
}

export function permissionOrigin(config: PlatformConfig) {
  const u = new URL(validateConfig(config).url);
  return `${u.protocol}//${u.hostname}/*`;
}
