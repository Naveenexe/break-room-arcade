-- ============================================================================
-- BREAK ROOM ARCADE: SRS v2 ENGINE & ARCHITECTURE MIGRATION
-- ============================================================================
-- Date: 14 November 2026
-- Specification: docs/SRS_v2_Game_Rules_and_Redesign.md (Sections 1, 2, 4)
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. NEW TABLES & INDEXES
-- ----------------------------------------------------------------------------

-- 1.1 Round Submissions (E-11)
-- Stores durable player submissions so refreshes/reconnects restore state
create table if not exists public.round_submissions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_no int not null default 1,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, -- 'quiz_answer', 'reaction_tap', 'typing_result', 'guess', 'word'
  payload jsonb not null default '{}'::jsonb,
  arrived_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_round_submissions_lookup
  on public.round_submissions(room_id, round_no, kind);

create index if not exists idx_round_submissions_user
  on public.round_submissions(room_id, round_no, user_id);

-- 1.2 Round Canvas Strokes (E-12, PIC-3)
-- Persists batched drawing strokes every 3 seconds for refresh survival
create table if not exists public.round_strokes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_no int not null default 1,
  batch_seq int not null default 0,
  strokes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_round_strokes_lookup
  on public.round_strokes(room_id, round_no, batch_seq);

-- ----------------------------------------------------------------------------
-- 2. SECURITY DEFINER HELPER & RLS POLICIES (D7 Fix)
-- ----------------------------------------------------------------------------

-- Helper: checks room membership non-recursively for authenticated users
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = p_room_id
      and user_id = auth.uid()
  );
$$;

-- Enable RLS
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.round_submissions enable row level security;
alter table public.round_strokes enable row level security;
alter table public.round_secrets enable row level security;

-- Rooms RLS: Only room members and the room host can view the room; anon gets nothing
drop policy if exists "Allow read rooms" on public.rooms;
drop policy if exists "Room members can view room" on public.rooms;
create policy "Room members can view room"
  on public.rooms for select
  to authenticated
  using (
    host_id = auth.uid() or public.is_room_member(id)
  );

drop policy if exists "Allow hosts to update their rooms" on public.rooms;
create policy "Allow hosts to update their rooms"
  on public.rooms for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

-- Room Players RLS: Only fellow room members can view player roster
drop policy if exists "Allow authenticated to view room players" on public.room_players;
drop policy if exists "Room members can view room players" on public.room_players;
create policy "Room members can view room players"
  on public.room_players for select
  to authenticated
  using (
    public.is_room_member(room_id)
  );

-- Round Submissions RLS: Viewable only by room members
drop policy if exists "Room members can view round submissions" on public.round_submissions;
create policy "Room members can view round submissions"
  on public.round_submissions for select
  to authenticated
  using (
    public.is_room_member(room_id)
  );

-- Round Strokes RLS: Viewable only by room members
drop policy if exists "Room members can view round strokes" on public.round_strokes;
create policy "Room members can view round strokes"
  on public.round_strokes for select
  to authenticated
  using (
    public.is_room_member(room_id)
  );

-- Round Secrets RLS: Visible strictly to entitled user (visible_to = auth.uid())
drop policy if exists "Users can only read round secrets visible to them" on public.round_secrets;
create policy "Users can only read round secrets visible to them"
  on public.round_secrets for select
  to authenticated
  using (
    visible_to is not null and visible_to = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 3. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players'
  ) then
    alter publication supabase_realtime add table public.room_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_submissions'
  ) then
    alter publication supabase_realtime add table public.round_submissions;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_strokes'
  ) then
    alter publication supabase_realtime add table public.round_strokes;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. CORE ENGINE RPCS (Sections 2 & 4)
-- ----------------------------------------------------------------------------

-- 4.1 heartbeat(p_room_id uuid) (E-14)
create or replace function public.heartbeat(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  update public.room_players
  set last_seen_at = clock_timestamp()
  where room_id = p_room_id and user_id = v_user_id;

  update public.rooms
  set last_active_at = clock_timestamp()
  where id = p_room_id;

  return jsonb_build_object(
    'status', 'ok',
    'server_time', clock_timestamp()
  );
end;
$$;

-- 4.2 start_game(p_room_id uuid, p_game text, p_options jsonb) (HC-2, E-28)
create or replace function public.start_game(
  p_room_id uuid,
  p_game text,
  p_options jsonb default '{}'::jsonb
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
  v_min_players int;
  v_testing_mode boolean;
  v_total_rounds int;
  v_participants uuid[];
  v_turn_order uuid[];
  v_session_id uuid;
  v_needed int;
  v_available int;
  v_content_cursor record;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Room not found';
  end if;

  if v_room.host_id != v_user_id then
    raise exception 'Only the room host can start the game.';
  end if;

  if p_game not in ('quiz', 'typing', 'reaction', 'pictionary', 'charades', 'wordchain') then
    raise exception 'Invalid game: %', p_game;
  end if;

  v_testing_mode := coalesce((v_room.settings->>'testing_mode')::boolean, false);
  v_min_players := case when v_testing_mode then 2 else 4 end;

  -- Select active connected participants (last_seen within 25 seconds)
  select array_agg(user_id order by random()), count(*)
  into v_turn_order, v_player_count
  from public.room_players
  where room_id = p_room_id
    and is_spectator = false
    and last_seen_at >= (clock_timestamp() - interval '25 seconds');

  if v_player_count < v_min_players then
    raise exception 'Need at least % connected players to start (currently % connected).', v_min_players, coalesce(v_player_count, 0);
  end if;

  v_participants := v_turn_order;

  -- Configure total rounds (Section 3 specs)
  if p_game = 'reaction' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 7);
    if v_total_rounds < 5 or v_total_rounds > 10 then v_total_rounds := 7; end if;
  elsif p_game = 'typing' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 3);
    if v_total_rounds < 1 or v_total_rounds > 5 then v_total_rounds := 3; end if;
  elsif p_game = 'quiz' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 10);
    if v_total_rounds < 5 or v_total_rounds > 20 then v_total_rounds := 10; end if;
  elsif p_game in ('pictionary', 'charades') then
    declare
      v_cycles int := coalesce((p_options->>'cycles')::int, case when v_player_count <= 4 then 2 else 1 end);
    begin
      if v_cycles < 1 or v_cycles > 3 then v_cycles := 1; end if;
      v_total_rounds := v_player_count * v_cycles;
    end;
  elsif p_game = 'wordchain' then
    v_total_rounds := coalesce((p_options->>'rounds')::int, 3);
    if v_total_rounds < 1 or v_total_rounds > 5 then v_total_rounds := 3; end if;
  end if;

  -- Content reservation pre-checks (E-28)
  if p_game = 'quiz' then
    v_needed := v_total_rounds;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'quiz'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);
    
    if v_available < v_needed then
      -- If room has used all content, reset or raise shortage
      if v_available = 0 then
        delete from public.room_content_used where room_id = p_room_id;
        select count(*) into v_available from public.content_items where game = 'quiz';
      end if;
      if v_available < v_needed then
        raise exception 'Needs % Quiz questions, only % unused available', v_needed, v_available;
      end if;
    end if;

    -- Reserve items in room_content_used
    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'quiz'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by ci.difficulty asc, random()
    limit v_needed;

  elsif p_game = 'typing' then
    v_needed := v_total_rounds;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'typing'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);

    if v_available < v_needed then
      if v_available = 0 then
        delete from public.room_content_used where room_id = p_room_id;
        select count(*) into v_available from public.content_items where game = 'typing';
      end if;
      if v_available < v_needed then
        raise exception 'Needs % Typing passages, only % unused available', v_needed, v_available;
      end if;
    end if;

    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'typing'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by ci.difficulty asc, random()
    limit v_needed;

  elsif p_game = 'pictionary' then
    v_needed := v_total_rounds * 3;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'pictionary'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);

    if v_available < v_needed then
      if v_available = 0 then
        delete from public.room_content_used where room_id = p_room_id;
        select count(*) into v_available from public.content_items where game = 'pictionary';
      end if;
      if v_available < v_needed then
        raise exception 'Needs % Pictionary words, only % unused available', v_needed, v_available;
      end if;
    end if;

    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'pictionary'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by random()
    limit v_needed;

  elsif p_game = 'charades' then
    v_needed := v_total_rounds * 2;
    select count(*) into v_available
    from public.content_items ci
    where ci.game = 'charades'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id);

    if v_available < v_needed then
      if v_available = 0 then
        delete from public.room_content_used where room_id = p_room_id;
        select count(*) into v_available from public.content_items where game = 'charades';
      end if;
      if v_available < v_needed then
        raise exception 'Needs % Charades prompts, only % unused available', v_needed, v_available;
      end if;
    end if;

    insert into public.room_content_used (room_id, content_id)
    select p_room_id, ci.id
    from public.content_items ci
    where ci.game = 'charades'
      and ci.id not in (select content_id from public.room_content_used where room_id = p_room_id)
    order by random()
    limit v_needed;
  end if;

  -- Create game session
  insert into public.game_sessions (room_id, game, options, started_at)
  values (p_room_id, p_game, p_options, clock_timestamp())
  returning id into v_session_id;

  -- Clear previous submissions and transient records for this room
  delete from public.round_submissions where room_id = p_room_id;
  delete from public.round_strokes where room_id = p_room_id;
  delete from public.round_secrets where room_id = p_room_id;

  -- Build initial game state
  update public.rooms
  set status = 'in_game',
      current_game = p_game,
      phase = 'countdown',
      phase_started_at = clock_timestamp(),
      phase_ends_at = clock_timestamp() + interval '3 seconds',
      version = version + 1,
      last_active_at = clock_timestamp(),
      game_state = jsonb_build_object(
        'game', p_game,
        'settings', p_options,
        'sessionId', v_session_id,
        'round', 1,
        'totalRounds', v_total_rounds,
        'turnOrder', to_jsonb(v_turn_order),
        'participants', to_jsonb(v_participants),
        'raw', '{}'::jsonb,
        'arcade', '{}'::jsonb,
        'history', '[]'::jsonb,
        'current', '{}'::jsonb
      )
  where id = p_room_id;

  return jsonb_build_object(
    'success', true,
    'game', p_game,
    'total_rounds', v_total_rounds,
    'session_id', v_session_id
  );
end;
$$;

-- 4.3 advance_phase(p_room_id uuid, p_expected_version int) (E-2, E-3, E-5)
create or replace function public.advance_phase(
  p_room_id uuid,
  p_expected_version int
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room record;
  v_game text;
  v_phase text;
  v_state jsonb;
  v_round int;
  v_total_rounds int;
  v_new_phase text;
  v_ends_at timestamptz;
  v_duration interval;
  v_early_end boolean := false;
  v_connected_count int;
  v_submissions_count int;
  v_participants jsonb;
  v_p uuid;
  v_raw jsonb;
  v_history jsonb;
  v_ranked_users record;
  v_rank int := 0;
  v_last_score int := -999999;
  v_arcade_pts int;
  v_session_id uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('advanced', false, 'reason', 'room_not_found');
  end if;

  if v_room.version != p_expected_version then
    return jsonb_build_object('advanced', false, 'reason', 'version_mismatch', 'current_version', v_room.version);
  end if;

  v_game := v_room.current_game;
  v_phase := v_room.phase;
  v_state := v_room.game_state;
  v_round := coalesce((v_state->>'round')::int, 1);
  v_total_rounds := coalesce((v_state->>'totalRounds')::int, 1);
  v_participants := coalesce(v_state->'participants', '[]'::jsonb);
  v_raw := coalesce(v_state->'raw', '{}'::jsonb);
  v_history := coalesce(v_state->'history', '[]'::jsonb);

  -- Count currently connected participants (within last 25s)
  select count(*) into v_connected_count
  from public.room_players
  where room_id = p_room_id
    and is_spectator = false
    and last_seen_at >= (clock_timestamp() - interval '25 seconds');

  -- Minimum 2 players check (E-18)
  if v_connected_count < 2 and v_phase not in ('podium', 'game_over') then
    -- End game early if opponents left
    update public.rooms
    set status = 'ended',
        phase = 'podium',
        phase_started_at = clock_timestamp(),
        phase_ends_at = null,
        version = version + 1
    where id = p_room_id;
    return jsonb_build_object('advanced', true, 'phase', 'podium', 'reason', 'not_enough_players');
  end if;

  -- Check early end conditions for active phases
  if v_game = 'quiz' and v_phase = 'answer' then
    select count(*) into v_submissions_count
    from public.round_submissions
    where room_id = p_room_id and round_no = v_round and kind = 'quiz_answer';
    if v_submissions_count >= v_connected_count and v_connected_count > 0 then
      v_early_end := true;
    end if;
  elsif v_game = 'reaction' and v_phase = 'go' then
    select count(*) into v_submissions_count
    from public.round_submissions
    where room_id = p_room_id and round_no = v_round and kind = 'reaction_tap';
    if v_submissions_count >= v_connected_count and v_connected_count > 0 then
      v_early_end := true;
    end if;
  elsif v_game = 'typing' and v_phase = 'typing' then
    select count(*) into v_submissions_count
    from public.round_submissions
    where room_id = p_room_id and round_no = v_round and kind = 'typing_result';
    if v_submissions_count >= v_connected_count and v_connected_count > 0 then
      v_early_end := true;
    end if;
  end if;

  -- Check if time expired or early-end met
  if not v_early_end and (v_room.phase_ends_at is not null and clock_timestamp() < v_room.phase_ends_at) then
    return jsonb_build_object('advanced', false, 'reason', 'timer_not_expired');
  end if;

  -- State machine transition logic
  if v_phase = 'countdown' then
    v_new_phase := 'intro';
    v_duration := interval '2 seconds';

  elsif v_game = 'quiz' then
    if v_phase = 'intro' then
      v_new_phase := 'answer';
      v_duration := interval '15 seconds';
    elsif v_phase = 'answer' then
      v_new_phase := 'reveal';
      v_duration := interval '6 seconds';
    elsif v_phase = 'reveal' then
      if v_round >= v_total_rounds then
        v_new_phase := 'podium';
        v_duration := null;
      else
        v_round := v_round + 1;
        v_new_phase := 'intro';
        v_duration := interval '1.5 seconds';
      end if;
    end if;

  elsif v_game = 'typing' then
    if v_phase = 'intro' then
      v_new_phase := 'typing';
      v_duration := interval '75 seconds';
    elsif v_phase = 'typing' then
      v_new_phase := 'result';
      v_duration := interval '8 seconds';
    elsif v_phase = 'result' then
      if v_round >= v_total_rounds then
        v_new_phase := 'podium';
        v_duration := null;
      else
        v_round := v_round + 1;
        v_new_phase := 'intro';
        v_duration := interval '3 seconds';
      end if;
    end if;

  elsif v_game = 'reaction' then
    if v_phase = 'intro' then
      v_new_phase := 'wait';
      v_duration := interval '9.5 seconds';
    elsif v_phase = 'wait' then
      -- Director did not signal go in 9.5s -> void rule (REA-5)
      v_new_phase := 'go';
      v_duration := interval '2.5 seconds';
    elsif v_phase = 'go' then
      v_new_phase := 'result';
      v_duration := interval '4.5 seconds';
    elsif v_phase = 'result' then
      if v_round >= v_total_rounds then
        v_new_phase := 'podium';
        v_duration := null;
      else
        v_round := v_round + 1;
        v_new_phase := 'intro';
        v_duration := interval '2 seconds';
      end if;
    end if;

  elsif v_game = 'pictionary' then
    if v_phase = 'intro' then
      v_new_phase := 'choose';
      v_duration := interval '12 seconds';
    elsif v_phase = 'choose' then
      v_new_phase := 'draw';
      v_duration := interval '80 seconds';
    elsif v_phase = 'draw' then
      v_new_phase := 'result';
      v_duration := interval '7 seconds';
    elsif v_phase = 'result' then
      if v_round >= v_total_rounds then
        v_new_phase := 'podium';
        v_duration := null;
      else
        v_round := v_round + 1;
        v_new_phase := 'choose';
        v_duration := interval '12 seconds';
      end if;
    end if;

  elsif v_game = 'charades' then
    if v_phase = 'intro' then
      v_new_phase := 'compose';
      v_duration := interval '60 seconds';
    elsif v_phase = 'compose' then
      v_new_phase := 'result';
      v_duration := interval '6 seconds';
    elsif v_phase = 'result' then
      if v_round >= v_total_rounds then
        v_new_phase := 'podium';
        v_duration := null;
      else
        v_round := v_round + 1;
        v_new_phase := 'compose';
        v_duration := interval '60 seconds';
      end if;
    end if;

  elsif v_game = 'wordchain' then
    if v_phase = 'intro' then
      v_new_phase := 'turn';
      v_duration := interval '12 seconds';
    elsif v_phase = 'turn' then
      v_new_phase := 'round_result';
      v_duration := interval '7 seconds';
    elsif v_phase = 'round_result' then
      if v_round >= v_total_rounds then
        v_new_phase := 'podium';
        v_duration := null;
      else
        v_round := v_round + 1;
        v_new_phase := 'intro';
        v_duration := interval '5 seconds';
      end if;
    end if;
  else
    v_new_phase := 'podium';
    v_duration := null;
  end if;

  -- Phase end timestamp
  if v_duration is not null then
    v_ends_at := clock_timestamp() + v_duration;
  else
    v_ends_at := null;
  end if;

  -- Handle game conclusion & Arcade Points (E-24)
  if v_new_phase = 'podium' then
    v_session_id := (v_state->>'sessionId')::uuid;

    -- Calculate Arcade Points by ranking
    for v_ranked_users in (
      select 
        rp.user_id,
        coalesce((v_raw->>(rp.user_id::text))::int, 0) as raw_score
      from public.room_players rp
      where rp.room_id = p_room_id
        and rp.is_spectator = false
      order by coalesce((v_raw->>(rp.user_id::text))::int, 0) desc, rp.joined_at asc
    ) loop
      if v_ranked_users.raw_score != v_last_score then
        v_rank := v_rank + 1;
        v_last_score := v_ranked_users.raw_score;
      end if;

      v_arcade_pts := case
        when v_rank = 1 then 10
        when v_rank = 2 then 7
        when v_rank = 3 then 5
        when v_rank = 4 then 4
        when v_rank = 5 then 3
        when v_rank = 6 then 2
        else 1
      end;

      -- Update cumulative total score
      update public.room_players
      set total_score = total_score + v_arcade_pts
      where room_id = p_room_id and user_id = v_ranked_users.user_id;

      -- Record score event audit
      if v_session_id is not null then
        insert into public.score_events (session_id, user_id, points, reason)
        values (v_session_id, v_ranked_users.user_id, v_arcade_pts, format('Arcade Points Rank %s', v_rank));
      end if;
    end loop;

    update public.rooms
    set status = 'ended',
        phase = 'podium',
        phase_started_at = clock_timestamp(),
        phase_ends_at = null,
        version = version + 1,
        last_active_at = clock_timestamp()
    where id = p_room_id;

    return jsonb_build_object('advanced', true, 'phase', 'podium', 'game_ended', true);
  end if;

  -- Update room phase and round state
  v_state := jsonb_set(v_state, '{round}', to_jsonb(v_round));

  update public.rooms
  set phase = v_new_phase,
      phase_started_at = clock_timestamp(),
      phase_ends_at = v_ends_at,
      version = version + 1,
      last_active_at = clock_timestamp(),
      game_state = v_state
  where id = p_room_id;

  return jsonb_build_object(
    'advanced', true,
    'phase', v_new_phase,
    'round', v_round,
    'version', v_room.version + 1,
    'phase_ends_at', v_ends_at
  );
end;
$$;

-- 4.4 skip_phase(p_room_id uuid) (HC-3) - Host only
create or replace function public.skip_phase(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.host_id != auth.uid() then
    raise exception 'Unauthorized: Only room host can skip phase';
  end if;

  -- Set phase_ends_at to past so advance_phase advances immediately
  update public.rooms
  set phase_ends_at = clock_timestamp() - interval '1 millisecond'
  where id = p_room_id;

  return public.advance_phase(p_room_id, v_room.version);
end;
$$;

-- 4.5 end_game(p_room_id uuid) (HC-3) - Host only
create or replace function public.end_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
begin
  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.host_id != auth.uid() then
    raise exception 'Unauthorized: Only room host can end game';
  end if;

  update public.rooms
  set status = 'ended',
      phase = 'podium',
      phase_started_at = clock_timestamp(),
      phase_ends_at = null,
      version = version + 1
  where id = p_room_id;

  return jsonb_build_object('success', true, 'status', 'ended');
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. GAME-SPECIFIC SUBMISSION RPCS (Section 2.10)
-- ----------------------------------------------------------------------------

-- 5.1 submit_answer(p_room_id uuid, p_question_no int, p_choice int, p_elapsed_ms int) (QZ-2)
create or replace function public.submit_answer(
  p_room_id uuid,
  p_question_no int,
  p_choice int,
  p_elapsed_ms int
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_room record;
  v_server_elapsed_ms int;
  v_elapsed_used int;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.status != 'in_game' or v_room.phase != 'answer' then
    raise exception 'Quiz answer phase is not active';
  end if;

  -- E-7: Late arrival grace window (400ms)
  if clock_timestamp() > v_room.phase_ends_at + interval '400 milliseconds' then
    raise exception 'Answer submitted past deadline';
  end if;

  -- E-6: Clamped latency
  v_server_elapsed_ms := round(extract(epoch from (clock_timestamp() - v_room.phase_started_at)) * 1000);
  v_elapsed_used := greatest(v_server_elapsed_ms - 600, least(p_elapsed_ms, v_server_elapsed_ms));

  -- Insert submission (idempotent: ignore if already locked in)
  insert into public.round_submissions (room_id, round_no, user_id, kind, payload, arrived_at)
  values (
    p_room_id,
    p_question_no,
    v_user_id,
    'quiz_answer',
    jsonb_build_object('choice', p_choice, 'elapsed_ms', v_elapsed_used),
    clock_timestamp()
  );

  return jsonb_build_object('status', 'locked', 'question_no', p_question_no);
exception when unique_violation then
  return jsonb_build_object('status', 'already_locked', 'question_no', p_question_no);
end;
$$;

-- 5.2 submit_reaction(p_room_id uuid, p_round_no int, p_ms int, p_kind text) (REA-2)
create or replace function public.submit_reaction(
  p_room_id uuid,
  p_round_no int,
  p_ms int,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_room record;
  v_server_elapsed_ms int;
  v_elapsed_used int;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.status != 'in_game' then
    raise exception 'Reaction duel is not active';
  end if;

  if p_kind = 'false_start' then
    insert into public.round_submissions (room_id, round_no, user_id, kind, payload)
    values (p_room_id, p_round_no, v_user_id, 'reaction_tap', jsonb_build_object('is_false_start', true, 'ms', null));
    return jsonb_build_object('status', 'recorded', 'false_start', true);
  end if;

  -- Check valid range (REA-4: 80ms - 2500ms / Target 3500ms)
  if p_ms < 80 then
    insert into public.round_submissions (room_id, round_no, user_id, kind, payload)
    values (p_room_id, p_round_no, v_user_id, 'reaction_tap', jsonb_build_object('is_false_start', true, 'ms', p_ms));
    return jsonb_build_object('status', 'recorded', 'false_start', true);
  end if;

  -- E-6 Latency clamping
  v_server_elapsed_ms := round(extract(epoch from (clock_timestamp() - v_room.phase_started_at)) * 1000);
  v_elapsed_used := greatest(v_server_elapsed_ms - 600, least(p_ms, v_server_elapsed_ms));

  insert into public.round_submissions (room_id, round_no, user_id, kind, payload)
  values (
    p_room_id,
    p_round_no,
    v_user_id,
    'reaction_tap',
    jsonb_build_object('is_false_start', false, 'ms', v_elapsed_used)
  );

  return jsonb_build_object('status', 'recorded', 'ms', v_elapsed_used);
exception when unique_violation then
  return jsonb_build_object('status', 'already_recorded');
end;
$$;

-- 5.3 signal_go(p_room_id uuid, p_round_no int) (REA-1)
create or replace function public.signal_go(
  p_room_id uuid,
  p_round_no int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_secret record;
  v_go_delay_ms int;
  v_wait_started timestamptz;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.phase != 'wait' then
    return jsonb_build_object('success', false, 'reason', 'not_in_wait_phase');
  end if;

  -- Check secret delay
  select * into v_secret from public.round_secrets
  where room_id = p_room_id and round_no = p_round_no and kind = 'go_delay';

  if found then
    v_go_delay_ms := (v_secret.payload->>'delay_ms')::int;
    v_wait_started := v_room.phase_started_at;
    if clock_timestamp() < v_wait_started + ((v_go_delay_ms - 150) * interval '1 millisecond') then
      return jsonb_build_object('success', false, 'reason', 'too_early');
    end if;
  end if;

  -- Transition immediately to 'go'
  update public.rooms
  set phase = 'go',
      phase_started_at = clock_timestamp(),
      phase_ends_at = clock_timestamp() + interval '2.5 seconds',
      version = version + 1,
      last_active_at = clock_timestamp()
  where id = p_room_id;

  return jsonb_build_object('success', true, 'phase', 'go');
end;
$$;

-- 5.4 submit_typing_result(p_room_id uuid, p_round_no int, p_payload jsonb) (TYP-6)
create or replace function public.submit_typing_result(
  p_room_id uuid,
  p_round_no int,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_room record;
  v_chars int;
  v_elapsed_s numeric;
  v_wpm numeric;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.phase != 'typing' then
    raise exception 'Typing phase not active';
  end if;

  v_chars := coalesce((p_payload->>'chars_typed')::int, 0);
  v_elapsed_s := greatest(0.5, extract(epoch from (clock_timestamp() - v_room.phase_started_at)));
  v_wpm := round(((v_chars / 5.0) / (v_elapsed_s / 60.0))::numeric, 1);

  -- Reject impossible speeds (> 250 WPM or < chars * 25ms)
  if v_wpm > 250 or (v_elapsed_s * 1000) < (v_chars * 25) then
    raise exception 'Invalid typing speed detected';
  end if;

  insert into public.round_submissions (room_id, round_no, user_id, kind, payload)
  values (
    p_room_id,
    p_round_no,
    v_user_id,
    'typing_result',
    jsonb_build_object(
      'wpm', v_wpm,
      'accuracy', coalesce((p_payload->>'accuracy')::numeric, 1.0),
      'finished', coalesce((p_payload->>'finished')::boolean, true),
      'elapsed_s', v_elapsed_s
    )
  );

  return jsonb_build_object('status', 'accepted', 'wpm', v_wpm);
exception when unique_violation then
  return jsonb_build_object('status', 'already_accepted');
end;
$$;

-- 5.5 save_strokes(p_room_id uuid, p_round_no int, p_batch_seq int, p_strokes jsonb) (PIC-3)
create or replace function public.save_strokes(
  p_room_id uuid,
  p_round_no int,
  p_batch_seq int,
  p_strokes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.round_strokes (room_id, round_no, batch_seq, strokes)
  values (p_room_id, p_round_no, p_batch_seq, p_strokes);

  return jsonb_build_object('success', true, 'batch_seq', p_batch_seq);
end;
$$;

-- 5.6 submit_guess(p_room_id uuid, p_round_no int, p_guess text) (PIC-5, EMO-5)
create or replace function public.submit_guess(
  p_room_id uuid,
  p_round_no int,
  p_guess text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_room record;
  v_secret record;
  v_target_word text;
  v_clean_guess text;
  v_clean_target text;
  v_is_correct boolean := false;
  v_is_close boolean := false;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found or v_room.status != 'in_game' then
    raise exception 'Game is not active';
  end if;

  -- Read secret word for round
  select * into v_secret from public.round_secrets
  where room_id = p_room_id and round_no = p_round_no and kind in ('pictionary_word', 'charades_prompt');

  if not found then
    return jsonb_build_object('result', 'wrong');
  end if;

  v_target_word := v_secret.payload->>'word';

  -- Normalize strings (lowercase, alphanumeric only, trimmed)
  v_clean_guess := lower(trim(regexp_replace(p_guess, '[^a-zA-Z0-9\s]', '', 'g')));
  v_clean_target := lower(trim(regexp_replace(v_target_word, '[^a-zA-Z0-9\s]', '', 'g')));

  if v_clean_guess = v_clean_target then
    v_is_correct := true;
  elsif length(v_clean_target) >= 5 and abs(length(v_clean_guess) - length(v_clean_target)) <= 1 then
    v_is_close := true;
  end if;

  if v_is_correct then
    insert into public.round_submissions (room_id, round_no, user_id, kind, payload)
    values (p_room_id, p_round_no, v_user_id, 'guess_correct', jsonb_build_object('guess', p_guess));
    return jsonb_build_object('result', 'correct');
  elsif v_is_close then
    return jsonb_build_object('result', 'close');
  else
    return jsonb_build_object('result', 'wrong');
  end if;
end;
$$;

