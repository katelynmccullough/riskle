create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  avatar_url text,
  bankroll integer not null default 1000,
  exposure integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.player_game_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.profiles(id) on delete cascade,
  puzzle_id text not null,
  game_status text not null default 'not_started',
  guesses_used integer not null default 0,
  max_guesses integer not null default 6,
  source text not null default 'mock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_markets (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.profiles(id),
  title text not null,
  market_type text not null,
  prediction text not null,
  status text not null default 'active',
  current_quote jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.market_quotes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid references public.prediction_markets(id) on delete cascade,
  version integer not null,
  multiplier numeric(6,2) not null,
  quote_ts timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active',
  notes text
);

create table if not exists public.wager_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  market_id uuid references public.prediction_markets(id) on delete cascade,
  subject_id uuid references public.profiles(id),
  prediction text not null,
  stake integer not null,
  odds numeric(6,2) not null,
  expected_payout integer not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  is_immutable boolean not null default true
);

create table if not exists public.cashout_transactions (
  id uuid primary key default gen_random_uuid(),
  wager_id uuid references public.wager_positions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  amount integer not null,
  quote numeric(10,2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.game_progress_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.profiles(id) on delete cascade,
  puzzle_id text not null,
  guesses_used integer not null,
  status text not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (player_id, puzzle_id, guesses_used)
);

create table if not exists public.friend_prediction_preferences (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.profiles(id) on delete cascade,
  friend_id uuid references public.profiles(id) on delete cascade,
  share_live_progress boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_prediction_markets_status on public.prediction_markets(status);
create index if not exists idx_wager_positions_user on public.wager_positions(user_id);
create index if not exists idx_wager_positions_market on public.wager_positions(market_id);
create index if not exists idx_game_progress_events_player on public.game_progress_events(player_id);
