-- ============================================================================
-- BREAK ROOM ARCADE: SUPABASE DATABASE INITIALIZATION SCRIPT
-- ============================================================================
-- Version: 1.0
-- Database: PostgreSQL 15+ (Supabase)
-- Includes: Extensions, Tables, Indexes, RLS Policies, RPC Functions, Realtime Setup
-- ============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- 2. TABLES & CONSTRAINTS
-- ============================================================================

-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  avatar_id text not null default 'avatar-01',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rooms table
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 5),
  password_hash text not null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'in_game', 'ended')),
  settings jsonb not null default '{"max_players": 8, "testing_mode": false, "rounds": 1}'::jsonb,
  current_game text default null,
  phase text not null default 'lobby',
  game_state jsonb not null default '{}'::jsonb,
  phase_started_at timestamptz not null default now(),
  phase_ends_at timestamptz default null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- Room Players table
create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_spectator boolean not null default false,
  total_score int not null default 0,
  primary key (room_id, user_id)
);

-- Game Sessions table (one per match played in a room)
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game text not null,
  options jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz default null,
  results jsonb default null
);

-- Round Secrets table (strictly filtered via RLS so clients only see what is intended for them)
create table if not exists public.round_secrets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  session_id uuid references public.game_sessions(id) on delete cascade,
  round_no int not null default 1,
  visible_to uuid references public.profiles(id) on delete cascade default null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Score Events table (audit trail for points)
create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points int not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Content Items table (bank for Quiz, Pictionary, Charades, Typing)
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('quiz', 'pictionary', 'charades', 'typing')),
  payload jsonb not null,
  category text not null,
  difficulty smallint not null check (difficulty between 1 and 3),
  content_hash text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint uq_game_content_hash unique (game, content_hash)
);

-- Room Content Used table (prevent repeats within a room)
create table if not exists public.room_content_used (
  room_id uuid not null references public.rooms(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (room_id, content_id)
);

-- Rate limiting tracking table for failed room joins
create table if not exists public.join_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempt_time timestamptz not null default now()
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

create index if not exists idx_rooms_code on public.rooms(code);
create index if not exists idx_rooms_last_active on public.rooms(last_active_at);
create index if not exists idx_room_players_user on public.room_players(user_id);
create index if not exists idx_round_secrets_room_user on public.round_secrets(room_id, visible_to);
create index if not exists idx_score_events_session on public.score_events(session_id);
create index if not exists idx_content_game_cat on public.content_items(game, category, difficulty);
create index if not exists idx_join_rate_limits on public.join_rate_limits(user_id, attempt_time);

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.game_sessions enable row level security;
alter table public.round_secrets enable row level security;
alter table public.score_events enable row level security;
alter table public.content_items enable row level security;
alter table public.room_content_used enable row level security;
alter table public.join_rate_limits enable row level security;

-- Profiles: Authenticated users can view all profiles; users can update only their own
create policy "Allow authenticated users to read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Allow users to insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Allow users to update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Rooms: Room members can view room details
create policy "Room members can view room"
  on public.rooms for select
  to authenticated
  using (
    exists (
      select 1 from public.room_players
      where room_players.room_id = rooms.id
        and room_players.user_id = auth.uid()
    )
  );

-- Room Players: Room members can see other players in their room
create policy "Room players viewable by fellow room members"
  on public.room_players for select
  to authenticated
  using (
    exists (
      select 1 from public.room_players as rp
      where rp.room_id = room_players.room_id
        and rp.user_id = auth.uid()
    )
  );

-- Game Sessions: Viewable by room members
create policy "Sessions viewable by room members"
  on public.game_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.room_players
      where room_players.room_id = game_sessions.room_id
        and room_players.user_id = auth.uid()
    )
  );

-- Round Secrets: A player can ONLY see secrets specifically addressed to them!
create policy "Users can only read round secrets visible to them"
  on public.round_secrets for select
  to authenticated
  using (visible_to is not null and visible_to = auth.uid());

-- Score Events: Viewable by room members
create policy "Score events viewable by session room members"
  on public.score_events for select
  to authenticated
  using (
    exists (
      select 1 from public.game_sessions gs
      join public.room_players rp on rp.room_id = gs.room_id
      where gs.id = score_events.session_id
        and rp.user_id = auth.uid()
    )
  );

-- Content Items: Read by all authenticated users; insert/update/delete only by admins
create policy "Content items read by authenticated users"
  on public.content_items for select
  to authenticated
  using (true);

create policy "Content items modifiable only by admins"
  on public.content_items for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- Room Content Used: Viewable by room members
create policy "Used content viewable by room members"
  on public.room_content_used for select
  to authenticated
  using (
    exists (
      select 1 from public.room_players
      where room_players.room_id = room_content_used.room_id
        and room_players.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. REALTIME PUBLICATION
-- ============================================================================

-- Add primary tables to realtime publication
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.game_sessions;

-- ============================================================================
-- 6. CORE RPC FUNCTIONS (AUTHORITATIVE LOGIC)
-- ============================================================================

-- 6.1 server_now() - Returns current UTC server timestamp
create or replace function public.server_now()
returns timestamptz
language sql
security definer
stable
as $$
  select clock_timestamp();
$$;

-- 6.2 keepalive() - Ping function to keep Supabase free tier active
create or replace function public.keepalive()
returns jsonb
language plpgsql
security definer
as $$
begin
  return jsonb_build_object(
    'status', 'ok',
    'timestamp', clock_timestamp(),
    'message', 'Break Room Arcade is active.'
  );
end;
$$;

-- 6.3 Helper to generate random 5-character room code (no look-alikes)
create or replace function public.generate_room_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..5 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- 6.4 create_room(settings, room_password)
create or replace function public.create_room(
  p_settings jsonb default '{}'::jsonb,
  p_room_password text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_room_id uuid;
  v_salt text;
  v_password_hash text;
  v_clean_password text := trim(p_room_password);
begin
  if v_user_id is null then
    raise exception 'Unauthorized: Must be logged in to create a room.';
  end if;

  if char_length(v_clean_password) < 4 or char_length(v_clean_password) > 12 then
    raise exception 'Room password must be between 4 and 12 characters.';
  end if;

  -- Lazy clean up of rooms older than 24h with no activity
  delete from public.rooms where last_active_at < (now() - interval '24 hours');

  -- Generate unique code
  loop
    v_code := generate_room_code();
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  -- Hash password with pgcrypto bf (using extensions schema)
  v_salt := extensions.gen_salt('bf', 8);
  v_password_hash := extensions.crypt(v_clean_password, v_salt);

  -- Insert room
  insert into public.rooms (
    code,
    password_hash,
    host_id,
    status,
    settings,
    phase,
    version,
    created_at,
    last_active_at
  ) values (
    v_code,
    v_password_hash,
    v_user_id,
    'lobby',
    coalesce(p_settings, '{"max_players": 8, "testing_mode": false}'::jsonb),
    'lobby',
    1,
    now(),
    now()
  ) returning id into v_room_id;

  -- Insert host into room_players
  insert into public.room_players (
    room_id,
    user_id,
    joined_at,
    last_seen_at,
    is_spectator,
    total_score
  ) values (
    v_room_id,
    v_user_id,
    now(),
    now(),
    false,
    0
  );

  return jsonb_build_object(
    'room_id', v_room_id,
    'code', v_code,
    'host_id', v_user_id,
    'status', 'lobby'
  );
end;
$$;

-- 6.5 join_room(code, room_password)
create or replace function public.join_room(
  p_code text,
  p_room_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_room record;
  v_player_count int;
  v_max_players int;
  v_clean_code text := upper(trim(p_code));
  v_failed_attempts int;
  v_is_spectator boolean := false;
begin
  if v_user_id is null then
    raise exception 'Unauthorized: Must be logged in to join a room.';
  end if;

  -- Rate limit check: max 5 failed attempts in last 60 seconds
  select count(*) into v_failed_attempts
  from public.join_rate_limits
  where user_id = v_user_id
    and attempt_time > (now() - interval '60 seconds');

  if v_failed_attempts >= 5 then
    raise exception 'Too many failed join attempts. Please wait 1 minute before trying again.';
  end if;

  -- Find room
  select * into v_room from public.rooms where code = v_clean_code;
  if not found then
    insert into public.join_rate_limits (user_id, attempt_time) values (v_user_id, now());
    raise exception 'Room not found. Please verify the code.';
  end if;

  -- Verify password
  if v_room.password_hash != extensions.crypt(trim(p_room_password), v_room.password_hash) then
    insert into public.join_rate_limits (user_id, attempt_time) values (v_user_id, now());
    raise exception 'Incorrect room password.';
  end if;

  -- Check max players
  v_max_players := coalesce((v_room.settings->>'max_players')::int, 8);
  select count(*) into v_player_count from public.room_players where room_id = v_room.id and is_spectator = false;

  -- If already in room, update last seen and return
  if exists (select 1 from public.room_players where room_id = v_room.id and user_id = v_user_id) then
    update public.room_players set last_seen_at = now() where room_id = v_room.id and user_id = v_user_id;
    update public.rooms set last_active_at = now() where id = v_room.id;
    return jsonb_build_object(
      'room_id', v_room.id,
      'code', v_room.code,
      'status', v_room.status,
      'is_spectator', (select is_spectator from public.room_players where room_id = v_room.id and user_id = v_user_id)
    );
  end if;

  -- If room is full or in-game, assign spectator
  if v_player_count >= v_max_players then
    raise exception 'Room is full (maximum % players reached).', v_max_players;
  end if;

  if v_room.status = 'in_game' then
    v_is_spectator := true;
  end if;

  -- Add player
  insert into public.room_players (
    room_id,
    user_id,
    joined_at,
    last_seen_at,
    is_spectator,
    total_score
  ) values (
    v_room.id,
    v_user_id,
    now(),
    now(),
    v_is_spectator,
    0
  );

  update public.rooms set last_active_at = now() where id = v_room.id;

  return jsonb_build_object(
    'room_id', v_room.id,
    'code', v_room.code,
    'status', v_room.status,
    'is_spectator', v_is_spectator
  );
end;
$$;

-- 6.6 leave_room(room_id)
create or replace function public.leave_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room record;
  v_next_host uuid;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Room not found');
  end if;

  -- Remove player
  delete from public.room_players where room_id = p_room_id and user_id = v_user_id;

  -- If room is now empty, delete room
  if not exists (select 1 from public.room_players where room_id = p_room_id) then
    delete from public.rooms where id = p_room_id;
    return jsonb_build_object('success', true, 'room_closed', true);
  end if;

  -- If the leaving user was the host, migrate host to earliest-joined player
  if v_room.host_id = v_user_id then
    select user_id into v_next_host
    from public.room_players
    where room_id = p_room_id
    order by joined_at asc
    limit 1;

    update public.rooms
    set host_id = v_next_host, last_active_at = now(), version = version + 1
    where id = p_room_id;
  end if;

  return jsonb_build_object('success', true, 'new_host_id', v_next_host);
end;
$$;

-- 6.7 kick_player(room_id, user_id) - Host only
create or replace function public.kick_player(p_room_id uuid, p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host_id uuid;
begin
  select host_id into v_host_id from public.rooms where id = p_room_id;
  if v_host_id != auth.uid() then
    raise exception 'Only the room host can kick players.';
  end if;

  if p_target_user_id = v_host_id then
    raise exception 'The host cannot kick themselves.';
  end if;

  delete from public.room_players where room_id = p_room_id and user_id = p_target_user_id;

  update public.rooms
  set version = version + 1, last_active_at = now()
  where id = p_room_id;

  return jsonb_build_object('success', true, 'kicked_user_id', p_target_user_id);
end;
$$;

-- 6.8 update_settings(room_id, settings) - Host only
create or replace function public.update_settings(p_room_id uuid, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.rooms where id = p_room_id and host_id = auth.uid()) then
    raise exception 'Only the room host can modify settings.';
  end if;

  update public.rooms
  set settings = p_settings, version = version + 1, last_active_at = now()
  where id = p_room_id;

  return jsonb_build_object('success', true);
end;
$$;

-- 6.9 advance_phase(room_id, expected_version) - Idempotent phase progression
create or replace function public.advance_phase(p_room_id uuid, p_expected_version int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('advanced', false, 'reason', 'room_not_found');
  end if;

  -- Only advance if version matches and time has passed phase_ends_at
  if v_room.version != p_expected_version then
    return jsonb_build_object('advanced', false, 'reason', 'version_mismatch', 'current_version', v_room.version);
  end if;

  if v_room.phase_ends_at is not null and clock_timestamp() < v_room.phase_ends_at then
    return jsonb_build_object('advanced', false, 'reason', 'timer_not_expired');
  end if;

  -- Phase progression logic is handled dynamically per game in game-specific RPC modules
  return jsonb_build_object('advanced', true, 'room_id', p_room_id, 'version', v_room.version);
end;
$$;

-- 6.10 import_content(payload jsonb) - Admin only
create or replace function public.import_content(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_admin boolean;
  v_game text;
  v_items jsonb;
  v_item jsonb;
  v_hash text;
  v_inserted int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  -- Check admin permission
  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if v_is_admin is not true then
    raise exception 'Unauthorized: Only administrators can import content.';
  end if;

  v_game := p_payload->>'game';
  v_items := p_payload->'items';

  if v_game not in ('quiz', 'pictionary', 'charades', 'typing') then
    raise exception 'Invalid game type: %', v_game;
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    -- Compute normalized content hash
    if v_game = 'quiz' then
      v_hash := encode(extensions.digest(lower(trim(regexp_replace(v_item->>'question', '\s+', ' ', 'g'))), 'sha256'), 'hex');
    elsif v_game = 'pictionary' then
      v_hash := encode(extensions.digest(lower(trim(regexp_replace(v_item->>'word', '\s+', ' ', 'g'))), 'sha256'), 'hex');
    elsif v_game = 'charades' then
      v_hash := encode(extensions.digest(lower(trim(regexp_replace(v_item->>'prompt', '\s+', ' ', 'g'))), 'sha256'), 'hex');
    elsif v_game = 'typing' then
      v_hash := encode(extensions.digest(lower(trim(regexp_replace(v_item->>'text', '\s+', ' ', 'g'))), 'sha256'), 'hex');
    end if;

    begin
      insert into public.content_items (
        game,
        payload,
        category,
        difficulty,
        content_hash,
        created_by
      ) values (
        v_game,
        v_item,
        coalesce(v_item->>'category', 'general'),
        coalesce((v_item->>'difficulty')::smallint, 1),
        v_hash,
        auth.uid()
      );
      v_inserted := v_inserted + 1;
    exception when unique_violation then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'game', v_game,
    'inserted', v_inserted,
    'skipped', v_skipped
  );
end;
$$;

-- Trigger to create profile automatically on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  if char_length(v_display_name) < 2 then
    v_display_name := 'Player_' || substr(new.id::text, 1, 4);
  elsif char_length(v_display_name) > 20 then
    v_display_name := substr(v_display_name, 1, 20);
  end if;

  insert into public.profiles (id, display_name, avatar_id)
  values (
    new.id,
    v_display_name,
    coalesce(new.raw_user_meta_data->>'avatar_id', 'avatar-01')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

