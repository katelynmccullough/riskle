-- Phase 3. New authenticated tables are deliberately separate from the unsafe prototype scaffold.
-- Apply through the Supabase SQL editor after review. No privileged key belongs in a client.
create schema if not exists riskle_internal;
revoke all on schema riskle_internal from public;
create table public.rk_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null check(length(display_name) between 1 and 48),
 avatar_url text check(avatar_url is null or (length(avatar_url)<=2048 and avatar_url like 'https://%')),
 share_progress boolean not null default false, public_rankings boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.rk_wallets (
 user_id uuid primary key references public.rk_profiles(id),
 balance bigint not null default 1000 check(balance between 0 and 9000000000000),
 exposure bigint not null default 0 check(exposure between 0 and 9000000000000)
);
create table public.rk_leagues (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 48), owner_id uuid not null references public.rk_profiles(id), created_at timestamptz not null default now());
create table public.rk_members (league_id uuid references public.rk_leagues(id) on delete cascade, user_id uuid references public.rk_profiles(id), joined_at timestamptz not null default now(), primary key(league_id,user_id));
create table public.rk_invites (league_id uuid primary key references public.rk_leagues(id) on delete cascade, code text not null unique default replace(gen_random_uuid()::text,'-',''), expires_at timestamptz not null default now()+interval '7 days');
create table public.rk_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.rk_profiles(id),
 game_id text not null default 'wordle' check(game_id='wordle'), puzzle_id text not null,
 puzzle_date date not null, status text not null check(status in('not_started','in_progress','completed','lost')),
 guesses integer not null check(guesses between 0 and 6), version integer not null default 1,
 live boolean not null default true, trust text not null default 'extension_observed' check(trust in('extension_observed','disputed')),
 started_at timestamptz, completed_at timestamptz, last_seen timestamptz not null default now(),
 unique(user_id,game_id,puzzle_id), unique(user_id,game_id,puzzle_date),
 check((status='not_started' and guesses=0) or (status='in_progress' and guesses between 1 and 5) or (status='completed' and guesses between 1 and 6) or (status='lost' and guesses=6))
);
create table public.rk_progress_events (id uuid primary key, user_id uuid not null references public.rk_profiles(id), session_id uuid not null references public.rk_sessions(id), guesses integer not null, status text not null, observed_at timestamptz not null, received_at timestamptz not null default now(), gap boolean not null default false);
create table public.rk_markets (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.rk_sessions(id),
 kind text not null check(kind in('solve','threshold','exact','head_to_head')), target integer not null default 0 check(target between 0 and 6),
 opponent_id uuid references public.rk_sessions(id), title text not null,
 status text not null default 'open' check(status in('open','closed')), outcome text check(outcome in('yes','no','void')),
 odds integer not null default 105 check(odds>=100), version integer not null default 0,
 quote_id uuid not null default gen_random_uuid(), expires_at timestamptz not null default now()+interval '2 minutes',
 unique nulls not distinct(session_id,kind,target,opponent_id)
);
create table public.rk_positions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.rk_profiles(id), market_id uuid not null references public.rk_markets(id),
 stake bigint not null check(stake>0), odds integer not null check(odds>=100), potential bigint not null check(potential>=0), quote_id uuid not null,
 remaining_stake bigint not null check(remaining_stake>=0), remaining_payout bigint not null check(remaining_payout>=0),
 paid bigint not null default 0 check(paid>=0), status text not null default 'open' check(status in('open','won','lost','cashout','void')),
 created_at timestamptz not null default now(), closed_at timestamptz,
 check(remaining_stake<=stake), check(status='open' or (remaining_stake=0 and remaining_payout=0))
);
create table public.rk_ledger (id bigint generated always as identity primary key, user_id uuid not null references public.rk_profiles(id), amount bigint not null, kind text not null, position_id uuid references public.rk_positions(id), created_at timestamptz not null default now());
create table public.rk_cashout_quotes (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.rk_profiles(id), position_id uuid not null references public.rk_positions(id), stake bigint not null check(stake>0), remaining_stake bigint not null, liability bigint not null check(liability>=0), credit bigint not null check(credit>=0), market_version integer not null, expires_at timestamptz not null, used boolean not null default false);
create table public.rk_cashouts (id uuid primary key default gen_random_uuid(), quote_id uuid not null unique references public.rk_cashout_quotes(id), user_id uuid not null references public.rk_profiles(id), position_id uuid not null references public.rk_positions(id), stake bigint not null, credit bigint not null, created_at timestamptz not null default now());
create table public.rk_receipts (user_id uuid references public.rk_profiles(id), request_id uuid not null, command text not null, payload jsonb not null, result jsonb not null, primary key(user_id,request_id));
create table public.rk_disputes (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.rk_profiles(id), session_id uuid not null references public.rk_sessions(id), reason text not null check(length(reason) between 10 and 1000), created_at timestamptz not null default now(), unique(user_id,session_id));
create index on public.rk_sessions(user_id,puzzle_date);
create index on public.rk_positions(user_id,status);
create index on public.rk_positions(market_id,status);
create index on public.rk_ledger(user_id,created_at);
create index on public.rk_members(user_id,league_id);

create function riskle_internal.initialize_account() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
begin
 insert into public.rk_profiles(id,username,display_name) values(new.id,lower(new.raw_user_meta_data->>'username'),coalesce(nullif(new.raw_user_meta_data->>'display_name',''),new.raw_user_meta_data->>'username'));
 insert into public.rk_wallets(user_id) values(new.id);
 insert into public.rk_ledger(user_id,amount,kind) values(new.id,1000,'starting_credit');
 return new;
end $$;
create trigger rk_new_account after insert on auth.users for each row execute function riskle_internal.initialize_account();
-- Supports accounts created before this migration, without rewriting existing prototype identities.
do $$ declare account record; chosen text; label text; begin
 for account in select id,raw_user_meta_data from auth.users loop
  if exists(select 1 from public.rk_profiles where id=account.id) then continue; end if;
  chosen:=lower(account.raw_user_meta_data->>'username');
  if chosen is null or chosen !~ '^[a-z0-9_]{3,24}$' then chosen:='user_'||replace(account.id::text,'-','')::varchar(16); end if;
  while exists(select 1 from public.rk_profiles where username=chosen) loop chosen:='user_'||replace(gen_random_uuid()::text,'-','')::varchar(16); end loop;
  label:=left(coalesce(nullif(account.raw_user_meta_data->>'display_name',''),nullif(account.raw_user_meta_data->>'username',''),'Riskle player'),48);
  insert into public.rk_profiles(id,username,display_name) values(account.id,chosen,label);
 end loop;
end $$;
insert into public.rk_wallets(user_id) select id from public.rk_profiles on conflict do nothing;
insert into public.rk_ledger(user_id,amount,kind) select id,1000,'starting_credit' from public.rk_profiles p where not exists(select 1 from public.rk_ledger l where l.user_id=p.id);

create function riskle_internal.member_of(l uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.rk_members where league_id=l and user_id=auth.uid())$$;
create function riskle_internal.shares_league(other uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select other=auth.uid() or exists(select 1 from public.rk_members a join public.rk_members b using(league_id) where a.user_id=auth.uid() and b.user_id=other)$$;
create function riskle_internal.visible_subject(other uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select other=auth.uid() or (exists(select 1 from public.rk_profiles where id=other and share_progress) and riskle_internal.shares_league(other))$$;

create function riskle_internal.guard_position() returns trigger language plpgsql set search_path=public,pg_temp as $$
#variable_conflict use_column
begin if (new.id,new.user_id,new.market_id,new.stake,new.odds,new.potential,new.quote_id,new.created_at) is distinct from (old.id,old.user_id,old.market_id,old.stake,old.odds,old.potential,old.quote_id,old.created_at) then raise exception 'Original position terms are immutable'; end if; return new; end $$;
create trigger rk_immutable_position before update on public.rk_positions for each row execute function riskle_internal.guard_position();

create function riskle_internal.settle(mid uuid, outcome text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare p public.rk_positions; credit bigint;
begin
 update public.rk_markets set status='closed',outcome=settle.outcome where id=mid and status='open';
 if not found then return; end if;
 for p in select * from public.rk_positions where market_id=mid and status='open' for update loop
  credit:=case outcome when 'yes' then p.remaining_payout when 'void' then p.remaining_stake else 0 end;
  update public.rk_wallets set balance=balance+credit,exposure=exposure-p.remaining_stake where user_id=p.user_id;
  update public.rk_positions set remaining_stake=0,remaining_payout=0,paid=paid+credit,status=case outcome when 'yes' then 'won' when 'void' then 'void' else 'lost' end,closed_at=now() where id=p.id;
  insert into public.rk_ledger(user_id,amount,kind,position_id) values(p.user_id,credit,'settlement_'||outcome,p.id);
 end loop;
end $$;
create function riskle_internal.reprice(sid uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare m public.rk_markets; s public.rk_sessions; opponent public.rk_sessions; n integer; k integer; a integer; b integer; outcomes_a integer[]; outcomes_b integer[];
begin
 for m in select * from public.rk_markets where status='open' and (session_id=sid or opponent_id=sid) loop
  select * into s from public.rk_sessions where id=m.session_id;
  if m.kind='head_to_head' then
   select * into opponent from public.rk_sessions where id=m.opponent_id;
   if s.trust='disputed' or opponent.trust='disputed' then perform riskle_internal.settle(m.id,'void'); continue; end if;
   if s.status in('completed','lost') and opponent.status in('completed','lost') then
    a:=case when s.status='lost' then 7 else s.guesses end; b:=case when opponent.status='lost' then 7 else opponent.guesses end;
    perform riskle_internal.settle(m.id,case when a=b then 'void' when a<b then 'yes' else 'no' end); continue;
   end if;
   if s.status in('completed','lost') then outcomes_a:=array[case when s.status='lost' then 7 else s.guesses end]; else select array_agg(x) into outcomes_a from generate_series(s.guesses+1,7) x; end if;
   if opponent.status in('completed','lost') then outcomes_b:=array[case when opponent.status='lost' then 7 else opponent.guesses end]; else select array_agg(x) into outcomes_b from generate_series(opponent.guesses+1,7) x; end if;
   select count(*),count(*) filter(where x<y) into n,k from unnest(outcomes_a) x cross join unnest(outcomes_b) y;
   if k=0 then update public.rk_markets set expires_at=now() where id=m.id; continue; end if;
  else
   if s.trust='disputed' then perform riskle_internal.settle(m.id,'void'); continue; end if;
   if s.status in('completed','lost') then
    perform riskle_internal.settle(m.id,case when s.status='completed' and (m.kind='solve' or (m.kind='exact' and s.guesses=m.target) or (m.kind='threshold' and s.guesses<=m.target)) then 'yes' else 'no' end); continue;
   end if;
   if m.kind<>'solve' and s.guesses>=m.target then perform riskle_internal.settle(m.id,'no'); continue; end if;
   n:=7-s.guesses; k:=case m.kind when 'solve' then 6-s.guesses when 'exact' then 1 else m.target-s.guesses end;
  end if;
  update public.rk_markets set odds=greatest(105,floor(90.0*n/k)::integer),version=version+1,quote_id=gen_random_uuid(),expires_at=now()+interval '2 minutes' where id=m.id;
 end loop;
end $$;
create function riskle_internal.eligible(mid uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.rk_markets m join public.rk_sessions s on s.id=m.session_id left join public.rk_sessions o on o.id=m.opponent_id
 where m.id=mid and m.status='open' and m.expires_at>now() and s.live and s.trust='extension_observed' and s.last_seen>now()-interval '12 seconds'
 and riskle_internal.visible_subject(s.user_id) and (m.opponent_id is null or (o.live and o.trust='extension_observed' and o.last_seen>now()-interval '12 seconds' and riskle_internal.visible_subject(o.user_id))))
$$;

-- Lazy expiry runs on authenticated reads/commands; it refunds remaining cost, never invents a game result.
create function riskle_internal.expire_abandoned() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare expired record;
begin
 perform pg_advisory_xact_lock(8124513);
 for expired in select id from public.rk_sessions where status not in('completed','lost') and trust<>'disputed'
  and (last_seen<now()-interval '48 hours' or puzzle_date<current_date-3) loop
  update public.rk_sessions set live=false,trust='disputed' where id=expired.id;
  perform riskle_internal.reprice(expired.id);
 end loop;
end $$;

create function public.riskle_command(command text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); previous public.rk_receipts; result jsonb; s public.rk_sessions; m public.rk_markets; w public.rk_wallets; p public.rk_positions; q public.rk_cashout_quotes; league public.rk_leagues; other public.rk_sessions;
 g integer; state text; day date; offset_min integer; stamp timestamptz; stake_amount bigint; liability bigint; credit bigint; sid uuid; lid uuid; capital bigint; current_date_local date; gap boolean; i integer;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Request ID and payload required'; end if;
 -- MVP serializes mutations globally. The lock is held until the entire RPC commits or aborts.
 perform pg_advisory_xact_lock(8124513);
 perform riskle_internal.expire_abandoned();
 select * into previous from public.rk_receipts where user_id=actor and rk_receipts.request_id=riskle_command.request_id;
 if found then if previous.command<>command or previous.payload<>payload then raise exception 'Request ID reused with different input'; end if; return previous.result; end if;
 if command='profile' then
  update public.rk_profiles set username=coalesce(payload->>'username',username),display_name=coalesce(payload->>'displayName',display_name),avatar_url=case when payload ? 'avatarUrl' then nullif(payload->>'avatarUrl','') else avatar_url end,share_progress=coalesce((payload->>'shareProgress')::boolean,share_progress),public_rankings=coalesce((payload->>'publicRankings')::boolean,public_rankings) where id=actor returning to_jsonb(rk_profiles.*) into result;
 elsif command='create_league' then
  insert into public.rk_leagues(name,owner_id) values(trim(payload->>'name'),actor) returning * into league;
  insert into public.rk_members values(league.id,actor,now()); insert into public.rk_invites(league_id) values(league.id); result:=to_jsonb(league);
 elsif command='join_league' then
  select league_id into lid from public.rk_invites where code=payload->>'code' and expires_at>now(); if lid is null then raise exception 'Invite is invalid or expired'; end if;
  insert into public.rk_members(league_id,user_id) values(lid,actor) on conflict do nothing; result:=jsonb_build_object('leagueId',lid);
 elsif command='leave_league' then
  lid:=(payload->>'leagueId')::uuid; if not riskle_internal.member_of(lid) then raise exception 'League membership required' using errcode='42501'; end if;
  select * into league from public.rk_leagues where id=lid;
  if league.owner_id=actor then
   select user_id into sid from public.rk_members where league_id=lid and user_id<>actor order by joined_at,user_id limit 1;
   if sid is null then delete from public.rk_leagues where id=lid; else update public.rk_leagues set owner_id=sid where id=lid; end if;
  end if;
  delete from public.rk_members where league_id=lid and user_id=actor; result:='{}';
 elsif command='regenerate_invite' then
  lid:=(payload->>'leagueId')::uuid; if not exists(select 1 from public.rk_leagues where id=lid and owner_id=actor) then raise exception 'League owner required' using errcode='42501'; end if;
  update public.rk_invites set code=replace(gen_random_uuid()::text,'-',''),expires_at=now()+interval '7 days' where league_id=lid returning to_jsonb(rk_invites.*) into result;
 elsif command='observe' then
  if (payload->>'source') is distinct from 'extension_observed' or (payload->>'game') is distinct from 'wordle' then raise exception 'Unsupported source'; end if;
  g:=(payload->>'guessesUsed')::integer; state:=payload->>'status'; day:=(payload->>'puzzleDate')::date; offset_min:=(payload->>'offsetMinutes')::integer; stamp:=(payload->>'observedAt')::timestamptz;
  if g is null or state is null or day is null or offset_min is null or stamp is null or offset_min not between -840 and 840 or stamp<now()-interval '15 seconds' or stamp>now()+interval '5 seconds' then raise exception 'Stale or invalid observation'; end if;
  current_date_local:=(now()-make_interval(mins=>offset_min))::date;
  if day>current_date_local or day<'2021-06-19' or payload->>'puzzleId'<>'wordle:'||(day-'2021-06-19'::date)::text then raise exception 'Invalid visible puzzle identity/date'; end if;
  if not ((state='not_started' and g=0) or (state='in_progress' and g between 1 and 5) or (state='completed' and g between 1 and 6) or (state='lost' and g=6)) then raise exception 'Inconsistent progress'; end if;
  select * into s from public.rk_sessions where user_id=actor and puzzle_id=payload->>'puzzleId';
  if not found then
   insert into public.rk_sessions(user_id,puzzle_id,puzzle_date,status,guesses,live,started_at,completed_at) values(actor,payload->>'puzzleId',day,state,g,g=0 and day=current_date_local,case when g>0 or coalesce((payload->>'hasStarted')::boolean,false) then stamp end,case when state in('completed','lost') then stamp end) returning * into s;
   insert into public.rk_markets(session_id,kind,target,title) values(s.id,'solve',0,'Solve within 6'),(s.id,'threshold',3,'Solve in 3 or fewer');
   for i in 1..6 loop insert into public.rk_markets(session_id,kind,target,title) values(s.id,'exact',i,'Solve in exactly '||i); end loop;
  else
   if s.status in('completed','lost') then
    if s.status<>state or s.guesses<>g then raise exception 'Canonical result cannot be overwritten'; end if; update public.rk_sessions set last_seen=now(),live=live and day=current_date_local,started_at=case when coalesce((payload->>'hasStarted')::boolean,false) then coalesce(started_at,stamp) else started_at end where id=s.id returning * into s; result:=to_jsonb(s);
   elsif g<s.guesses then raise exception 'Out-of-order progress';
   elsif g=s.guesses then
    if state<>s.status then raise exception 'Conflicting observation'; end if;
    update public.rk_sessions set last_seen=now(),live=live and day=current_date_local,started_at=case when coalesce((payload->>'hasStarted')::boolean,false) then coalesce(started_at,stamp) else started_at end where id=s.id returning * into s; result:=to_jsonb(s);
   else
    gap:=g<>s.guesses+1;
    update public.rk_sessions set guesses=g,status=state,version=version+1,last_seen=now(),live=live and not gap and day=current_date_local,trust=case when gap then 'disputed' else trust end,started_at=coalesce(started_at,stamp),completed_at=case when state in('completed','lost') then stamp end where id=s.id returning * into s;
   end if;
  end if;
  if result is null then
   insert into public.rk_progress_events(id,user_id,session_id,guesses,status,observed_at,gap) values(request_id,actor,s.id,g,state,stamp,coalesce(gap,false));
   perform riskle_internal.reprice(s.id); result:=to_jsonb(s);
  end if;
 elsif command='head_to_head' then
  select * into s from public.rk_sessions where id=(payload->>'sessionId')::uuid; select * into other from public.rk_sessions where id=(payload->>'opponentId')::uuid;
  if s.id=other.id or s.id is null or other.id is null or s.user_id=other.user_id or s.puzzle_id<>other.puzzle_id or not riskle_internal.visible_subject(s.user_id) or not riskle_internal.visible_subject(other.user_id) then raise exception 'Two eligible league players on the same puzzle required'; end if;
  insert into public.rk_markets(session_id,kind,target,opponent_id,title) values(s.id,'head_to_head',0,other.id,'Fewer guesses than opponent (ties void)') on conflict do nothing;
  perform riskle_internal.reprice(s.id); result:='{}';
 elsif command='refresh' then
  for sid in select id from public.rk_sessions where riskle_internal.visible_subject(user_id) and last_seen>now()-interval '12 seconds' loop perform riskle_internal.reprice(sid); end loop; result:='{}';
 elsif command='place' or command='add_stake' then
  if command='add_stake' then
   select * into p from public.rk_positions where id=(payload->>'positionId')::uuid and user_id=actor and status='open'; if not found then raise exception 'Open owned position required'; end if;
   select * into m from public.rk_markets where id=p.market_id;
  else select * into m from public.rk_markets where id=(payload->>'marketId')::uuid; end if;
  if m.id is null or not riskle_internal.eligible(m.id) then raise exception 'Market closed, private or stale; live wagering suspended'; end if;
  if m.quote_id is distinct from (payload->>'quoteId')::uuid then raise exception 'Stale quote'; end if;
  if coalesce(payload->>'stake','') !~ '^[0-9]+$' then raise exception 'Positive whole-coin stake required'; end if;
  stake_amount:=(payload->>'stake')::bigint; if stake_amount<=0 or stake_amount>9000000000 or (payload->>'stake')::numeric<>stake_amount then raise exception 'Positive whole-coin stake required'; end if;
  select * into s from public.rk_sessions where id=m.session_id;
  select * into w from public.rk_wallets where user_id=actor for update; capital:=w.balance+w.exposure;
  if stake_amount>w.balance then raise exception 'Insufficient balance'; end if;
  if w.exposure+stake_amount>floor(capital*.7) then raise exception 'Total exposure limit (70%%)'; end if;
  if (select coalesce(sum(p.remaining_stake),0) from public.rk_positions p join public.rk_markets m2 on m2.id=p.market_id join public.rk_sessions s2 on s2.id=m2.session_id where p.user_id=actor and p.status='open' and (s2.user_id=s.user_id or exists(select 1 from public.rk_sessions rival where rival.id=m2.opponent_id and rival.user_id=s.user_id)))+stake_amount>floor(capital*.5) then raise exception 'Subject exposure limit (50%%)'; end if;
  if m.opponent_id is not null then
   select * into other from public.rk_sessions where id=m.opponent_id;
   if (select coalesce(sum(p.remaining_stake),0) from public.rk_positions p join public.rk_markets m2 on m2.id=p.market_id join public.rk_sessions s2 on s2.id=m2.session_id where p.user_id=actor and p.status='open' and (s2.user_id=other.user_id or exists(select 1 from public.rk_sessions rival where rival.id=m2.opponent_id and rival.user_id=other.user_id)))+stake_amount>floor(capital*.5) then raise exception 'Opponent exposure limit (50%%)'; end if;
  end if;
  if (select coalesce(sum(p.remaining_stake),0) from public.rk_positions p join public.rk_markets m2 on m2.id=p.market_id join public.rk_sessions s2 on s2.id=m2.session_id where p.user_id=actor and p.status='open' and s2.puzzle_id=s.puzzle_id)+stake_amount>floor(capital*.6) then raise exception 'Puzzle exposure limit (60%%)'; end if;
  credit:=floor(stake_amount::numeric*m.odds/100);
  insert into public.rk_positions(user_id,market_id,stake,odds,potential,quote_id,remaining_stake,remaining_payout) values(actor,m.id,stake_amount,m.odds,credit,m.quote_id,stake_amount,credit) returning * into p;
  update public.rk_wallets set balance=balance-stake_amount,exposure=exposure+stake_amount where user_id=actor;
  insert into public.rk_ledger(user_id,amount,kind,position_id) values(actor,-stake_amount,'stake',p.id); result:=to_jsonb(p);
 elsif command='hold' then
  select * into p from public.rk_positions where id=(payload->>'positionId')::uuid and user_id=actor and status='open'; if not found then raise exception 'Open owned position required'; end if; result:=to_jsonb(p);
 elsif command='cashout_quote' then
  select * into p from public.rk_positions where id=(payload->>'positionId')::uuid and user_id=actor and status='open'; if not found then raise exception 'Open owned position required'; end if;
  select * into m from public.rk_markets where id=p.market_id; if not riskle_internal.eligible(m.id) then raise exception 'Market closed, private or stale'; end if;
  if coalesce(payload->>'stake','') !~ '^[0-9]+$' then raise exception 'Positive whole-coin stake required'; end if;
  stake_amount:=(payload->>'stake')::bigint;
  if stake_amount<=0 or stake_amount>p.remaining_stake or (payload->>'stake')::numeric<>stake_amount then raise exception 'Invalid stake to release'; end if;
  liability:=case when stake_amount=p.remaining_stake then p.remaining_payout else floor(p.remaining_payout::numeric*stake_amount/p.remaining_stake) end;
  credit:=floor(liability::numeric*90/m.odds);
  insert into public.rk_cashout_quotes(user_id,position_id,stake,remaining_stake,liability,credit,market_version,expires_at) values(actor,p.id,stake_amount,p.remaining_stake,liability,credit,m.version,least(now()+interval '15 seconds',m.expires_at)) returning * into q; result:=to_jsonb(q);
 elsif command='cashout' then
  select * into q from public.rk_cashout_quotes where id=(payload->>'quoteId')::uuid and user_id=actor and not used and expires_at>now(); if not found then raise exception 'Cash-out quote expired or already used'; end if;
  select * into p from public.rk_positions where id=q.position_id and user_id=actor and status='open';
  select * into m from public.rk_markets where id=p.market_id;
  if p.id is null or p.remaining_stake<>q.remaining_stake or m.version<>q.market_version or not riskle_internal.eligible(m.id) then raise exception 'Position or market changed'; end if;
  update public.rk_positions set remaining_stake=remaining_stake-q.stake,remaining_payout=remaining_payout-q.liability,paid=paid+q.credit,status=case when remaining_stake=q.stake then 'cashout' else status end,closed_at=case when remaining_stake=q.stake then now() else null end where id=p.id;
  update public.rk_wallets set balance=balance+q.credit,exposure=exposure-q.stake where user_id=actor;
  update public.rk_cashout_quotes set used=true where id=q.id;
  insert into public.rk_cashouts(quote_id,user_id,position_id,stake,credit) values(q.id,actor,p.id,q.stake,q.credit);
  insert into public.rk_ledger(user_id,amount,kind,position_id) values(actor,q.credit,'cashout',p.id); result:=jsonb_build_object('credit',q.credit);
 elsif command='dispute' then
  select * into s from public.rk_sessions where id=(payload->>'sessionId')::uuid;
  if s.id is null or (s.user_id<>actor and not exists(select 1 from public.rk_positions p join public.rk_markets m on m.id=p.market_id where p.user_id=actor and (m.session_id=s.id or m.opponent_id=s.id))) then raise exception 'Only involved players may report a result'; end if;
  insert into public.rk_disputes(user_id,session_id,reason) values(actor,s.id,payload->>'reason'); result:=jsonb_build_object('status','recorded_for_review');
 else raise exception 'Unsupported command'; end if;
 insert into public.rk_receipts values(actor,request_id,command,payload,coalesce(result,'{}'));
 return coalesce(result,'{}');
end $$;

-- RLS also protects direct PostgREST queries and Realtime subscriptions. No client can write tables.
do $$ declare t text; begin
 foreach t in array array['rk_profiles','rk_wallets','rk_leagues','rk_members','rk_invites','rk_sessions','rk_progress_events','rk_markets','rk_positions','rk_ledger','rk_cashout_quotes','rk_cashouts','rk_receipts','rk_disputes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
 -- Quarantine legacy prototype tables if they were previously applied.
 foreach t in array array['profiles','player_game_sessions','prediction_markets','market_quotes','wager_positions','cashout_transactions','game_progress_events','friend_prediction_preferences'] loop
  if to_regclass('public.'||t) is not null then execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); end if;
 end loop;
end $$;
create policy rk_profile_read on public.rk_profiles for select to authenticated using(id=auth.uid() or public_rankings or riskle_internal.shares_league(id));
create policy rk_wallet_read on public.rk_wallets for select to authenticated using(user_id=auth.uid());
create policy rk_league_read on public.rk_leagues for select to authenticated using(riskle_internal.member_of(id));
create policy rk_members_read on public.rk_members for select to authenticated using(riskle_internal.member_of(league_id));
create policy rk_invite_read on public.rk_invites for select to authenticated using(exists(select 1 from public.rk_leagues where id=league_id and owner_id=auth.uid()));
create policy rk_session_read on public.rk_sessions for select to authenticated using(riskle_internal.visible_subject(user_id));
create policy rk_progress_read on public.rk_progress_events for select to authenticated using(user_id=auth.uid());
create policy rk_market_read on public.rk_markets for select to authenticated using(exists(select 1 from public.rk_sessions where id=session_id and riskle_internal.visible_subject(user_id)) and (opponent_id is null or exists(select 1 from public.rk_sessions where id=opponent_id and riskle_internal.visible_subject(user_id))));
create policy rk_position_read on public.rk_positions for select to authenticated using(user_id=auth.uid());
create policy rk_ledger_read on public.rk_ledger for select to authenticated using(user_id=auth.uid());
create policy rk_cashquote_read on public.rk_cashout_quotes for select to authenticated using(user_id=auth.uid());
create policy rk_cashout_read on public.rk_cashouts for select to authenticated using(user_id=auth.uid());
create policy rk_receipt_read on public.rk_receipts for select to authenticated using(user_id=auth.uid());
create policy rk_dispute_read on public.rk_disputes for select to authenticated using(user_id=auth.uid());

create function public.riskle_rankings(league_id uuid default null,period_start date default current_date,period_days integer default 1) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
begin
 if auth.uid() is null or period_days not in(1,7) then raise exception 'Invalid ranking request' using errcode='42501'; end if;
 if league_id is not null and not riskle_internal.member_of(league_id) then raise exception 'League membership required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(r) order by r.profit desc,r.username,r.id),'[]') from (
 select p.id,p.username,p.avatar_url,w.balance,w.exposure,
 coalesce((select sum(x.paid-(x.stake-x.remaining_stake)) from public.rk_positions x join public.rk_markets m on m.id=x.market_id join public.rk_sessions s on s.id=m.session_id where x.user_id=p.id and s.puzzle_date>=period_start and s.puzzle_date<period_start+period_days),0) profit,
 (select count(*) from public.rk_positions where user_id=p.id and status='open') open_positions
 from public.rk_profiles p join public.rk_wallets w on w.user_id=p.id
 where (league_id is null and p.public_rankings) or (league_id is not null and exists(select 1 from public.rk_members where rk_members.league_id=riskle_rankings.league_id and user_id=p.id))
 ) r);
end $$;
create function public.riskle_history(month_start date default date_trunc('month',current_date)::date,offset_minutes integer default 0) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
declare s public.rk_sessions; last_day date; run integer:=0; longest integer:=0; local_today date;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if offset_minutes not between -840 and 840 then raise exception 'Invalid timezone offset'; end if;
 local_today:=(now()-make_interval(mins=>offset_minutes))::date;
 for s in select * from public.rk_sessions where user_id=auth.uid() and status in('completed','lost') order by puzzle_date loop
  if s.status='completed' then run:=case when last_day=s.puzzle_date-1 then run+1 else 1 end; else run:=0; end if;
  longest:=greatest(longest,run); last_day:=s.puzzle_date;
 end loop;
 if last_day<local_today-1 then run:=0; end if;
 return jsonb_build_object('days',(
  select coalesce(jsonb_agg(to_jsonb(h) order by h.puzzle_date),'[]') from (
   select base.*,case when own.public_rankings then (
    select 1+count(*) from public.rk_profiles competitor
    cross join lateral (
     select coalesce(sum(p.paid-(p.stake-p.remaining_stake)),0) profit from public.rk_positions p
     join public.rk_markets m on m.id=p.market_id join public.rk_sessions subject on subject.id=m.session_id
     where p.user_id=competitor.id and subject.puzzle_date=base.puzzle_date
    ) score
    where competitor.public_rankings and (score.profit>base.profit or
     (score.profit=base.profit and (competitor.username<own.username or (competitor.username=own.username and competitor.id<own.id))))
   ) end daily_rank
   from (
    select s.*,coalesce((select sum(p.paid-(p.stake-p.remaining_stake)) from public.rk_positions p
     join public.rk_markets m on m.id=p.market_id join public.rk_sessions subject on subject.id=m.session_id
     where p.user_id=auth.uid() and subject.puzzle_date=s.puzzle_date),0) profit
    from public.rk_sessions s where s.user_id=auth.uid() and s.puzzle_date>=date_trunc('month',month_start)::date
     and s.puzzle_date<(date_trunc('month',month_start)+interval '1 month')::date
   ) base join public.rk_profiles own on own.id=auth.uid()
  ) h),
 'stats',(select jsonb_build_object('games',count(*),'wins',count(*) filter(where status='completed'),
  'winRate',case when count(*)=0 then 0 else round(100.0*(count(*) filter(where status='completed'))/count(*),1) end,
  'average',round(avg(guesses) filter(where status='completed'),2),'streak',run,'longestStreak',longest)
  from public.rk_sessions where user_id=auth.uid() and status in('completed','lost')));
end $$;
create function public.riskle_state() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
#variable_conflict use_column
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform riskle_internal.expire_abandoned();
 return jsonb_build_object(
 'profile',(select to_jsonb(p) from public.rk_profiles p where id=auth.uid()),
 'wallet',(select to_jsonb(w) from public.rk_wallets w where user_id=auth.uid()),
 'profiles',(select coalesce(jsonb_agg(p),'[]') from public.rk_profiles p where riskle_internal.shares_league(p.id)),
 'leagues',(select coalesce(jsonb_agg(l),'[]') from public.rk_leagues l where riskle_internal.member_of(l.id)),
 'members',(select coalesce(jsonb_agg(m),'[]') from public.rk_members m where riskle_internal.member_of(m.league_id)),
 'invites',(select coalesce(jsonb_agg(i),'[]') from public.rk_invites i join public.rk_leagues l on l.id=i.league_id where l.owner_id=auth.uid()),
 'sessions',(select coalesce(jsonb_agg(s),'[]') from public.rk_sessions s where riskle_internal.visible_subject(s.user_id) and s.puzzle_date>=current_date-2),
 'markets',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('eligible',riskle_internal.eligible(m.id))),'[]') from public.rk_markets m join public.rk_sessions s on s.id=m.session_id where riskle_internal.visible_subject(s.user_id) and s.puzzle_date>=current_date-2 and (m.opponent_id is null or exists(select 1 from public.rk_sessions o where o.id=m.opponent_id and riskle_internal.visible_subject(o.user_id)))),
 'positions',(select coalesce(jsonb_agg(p order by p.created_at desc),'[]') from (select p.*,m.title,s.puzzle_date,s.user_id subject_id from public.rk_positions p join public.rk_markets m on m.id=p.market_id join public.rk_sessions s on s.id=m.session_id where p.user_id=auth.uid() and (p.status='open' or p.id in(select recent.id from public.rk_positions recent where recent.user_id=auth.uid() and recent.status<>'open' order by recent.created_at desc limit 200)) order by p.created_at desc) p),
 'ledger',(select coalesce(jsonb_agg(l order by l.id desc),'[]') from (select * from public.rk_ledger where user_id=auth.uid() order by id desc limit 200) l)
 );
end $$;

revoke all on all functions in schema riskle_internal from public,anon,authenticated;
grant usage on schema riskle_internal to authenticated;
grant execute on function riskle_internal.member_of(uuid),riskle_internal.shares_league(uuid),riskle_internal.visible_subject(uuid) to authenticated;
revoke all on function public.riskle_command(text,jsonb,uuid),public.riskle_state(),public.riskle_history(date,integer),public.riskle_rankings(uuid,date,integer) from public,anon;
grant execute on function public.riskle_command(text,jsonb,uuid),public.riskle_state(),public.riskle_history(date,integer),public.riskle_rankings(uuid,date,integer) to authenticated;
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['rk_sessions','rk_wallets','rk_positions','rk_members','rk_markets','rk_profiles'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename=t and schemaname='public') then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
 end if;
end $$;
