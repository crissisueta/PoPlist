create extension if not exists pgcrypto;

drop function if exists public.submit_vote(uuid, text, date);

alter table public.votes
  add column if not exists vote_value integer not null default 1,
  add column if not exists vote_type text not null default 'upvote';

alter table public.votes
  drop constraint if exists votes_vote_value_check;

alter table public.votes
  add constraint votes_vote_value_check check (vote_value in (-1, 1));

alter table public.votes
  drop constraint if exists votes_vote_type_check;

alter table public.votes
  add constraint votes_vote_type_check check (vote_type in ('upvote', 'downvote'));

create table if not exists public.suggested_people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  votes_count integer not null default 0,
  cycle_start_date date not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint suggested_people_status_check check (status in ('active', 'archived', 'promoted'))
);

create table if not exists public.suggestion_votes (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.suggested_people(id) on delete cascade,
  voter_token text not null,
  cycle_start_date date not null,
  created_at timestamptz not null default now(),
  constraint suggestion_votes_voter_token_cycle_key unique (voter_token, cycle_start_date)
);

create table if not exists public.suggestion_cycles (
  cycle_start_date date primary key,
  processed_at timestamptz,
  winning_suggestion_id uuid references public.suggested_people(id),
  created_at timestamptz not null default now()
);

create or replace function public.current_suggestion_cycle_start(
  p_reference_date date default current_date
)
returns date
language sql
immutable
as $$
  select date '2026-01-01'
    + (((p_reference_date - date '2026-01-01') / 2) * 2);
$$;

create or replace function public.refresh_suggestion_cycle()
returns table (
  cycle_start_date date,
  cycle_end_date date,
  processed_winner_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_cycle_start date := public.current_suggestion_cycle_start(current_date);
  v_previous_cycle_start date := v_current_cycle_start - 2;
  v_winner public.suggested_people%rowtype;
  v_processed_winner_name text := null;
begin
  insert into public.suggestion_cycles (cycle_start_date)
  values (v_current_cycle_start)
  on conflict (cycle_start_date) do nothing;

  insert into public.suggestion_cycles (cycle_start_date)
  values (v_previous_cycle_start)
  on conflict (cycle_start_date) do nothing;

  if exists (
    select 1
    from public.suggestion_cycles
    where cycle_start_date = v_previous_cycle_start
      and processed_at is null
  ) then
    select *
    into v_winner
    from public.suggested_people
    where cycle_start_date = v_previous_cycle_start
      and status = 'active'
    order by votes_count desc, created_at asc
    limit 1;

    if found then
      insert into public.people (name, photo_url, active)
      values (v_winner.name, v_winner.photo_url, true);

      update public.suggested_people
      set status = 'archived'
      where cycle_start_date = v_previous_cycle_start
        and status = 'active';

      update public.suggested_people
      set status = 'promoted'
      where id = v_winner.id;

      v_processed_winner_name := v_winner.name;

      update public.suggestion_cycles
      set processed_at = now(),
          winning_suggestion_id = v_winner.id
      where cycle_start_date = v_previous_cycle_start;
    else
      update public.suggestion_cycles
      set processed_at = now()
      where cycle_start_date = v_previous_cycle_start;
    end if;
  end if;

  return query
  select
    v_current_cycle_start,
    v_current_cycle_start + 1,
    v_processed_winner_name;
end;
$$;

create or replace function public.submit_vote(
  p_person_id uuid,
  p_voter_token text,
  p_vote_date date,
  p_vote_value integer default 1,
  p_vote_type text default 'upvote'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_vote_value not in (-1, 1) then
    raise exception 'Invalid vote value';
  end if;

  if p_vote_type not in ('upvote', 'downvote') then
    raise exception 'Invalid vote type';
  end if;

  if not exists (
    select 1
    from public.people
    where id = p_person_id
      and active = true
  ) then
    raise exception 'Person not found or inactive';
  end if;

  insert into public.votes (person_id, voter_token, vote_date, vote_value, vote_type)
  values (p_person_id, p_voter_token, p_vote_date, p_vote_value, p_vote_type);

  update public.people
  set votes_count = votes_count + p_vote_value
  where id = p_person_id;

exception
  when unique_violation then
    raise exception 'User has already voted today';
end;
$$;

create or replace function public.submit_suggestion(
  p_name text,
  p_photo_url text default null,
  p_voter_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_start date;
  v_suggestion_id uuid;
begin
  perform public.refresh_suggestion_cycle();
  v_cycle_start := public.current_suggestion_cycle_start(current_date);

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Suggestion name is required';
  end if;

  if exists (
    select 1
    from public.suggested_people
    where cycle_start_date = v_cycle_start
      and status = 'active'
      and lower(name) = lower(trim(p_name))
  ) then
    raise exception 'This person is already in the current suggestion round';
  end if;

  insert into public.suggested_people (name, photo_url, cycle_start_date)
  values (trim(p_name), nullif(trim(p_photo_url), ''), v_cycle_start)
  returning id into v_suggestion_id;

  return v_suggestion_id;
end;
$$;

create or replace function public.submit_suggestion_vote(
  p_suggestion_id uuid,
  p_voter_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle_start date;
begin
  perform public.refresh_suggestion_cycle();
  v_cycle_start := public.current_suggestion_cycle_start(current_date);

  if not exists (
    select 1
    from public.suggested_people
    where id = p_suggestion_id
      and cycle_start_date = v_cycle_start
      and status = 'active'
  ) then
    raise exception 'Suggestion not found in current cycle';
  end if;

  insert into public.suggestion_votes (suggestion_id, voter_token, cycle_start_date)
  values (p_suggestion_id, p_voter_token, v_cycle_start);

  update public.suggested_people
  set votes_count = votes_count + 1
  where id = p_suggestion_id;

exception
  when unique_violation then
    raise exception 'User has already voted this cycle';
end;
$$;

revoke all on function public.refresh_suggestion_cycle() from public;
grant execute on function public.refresh_suggestion_cycle() to anon, authenticated;

revoke all on function public.submit_vote(uuid, text, date, integer, text) from public;
grant execute on function public.submit_vote(uuid, text, date, integer, text) to anon, authenticated;

revoke all on function public.submit_suggestion(text, text, text) from public;
grant execute on function public.submit_suggestion(text, text, text) to anon, authenticated;

revoke all on function public.submit_suggestion_vote(uuid, text) from public;
grant execute on function public.submit_suggestion_vote(uuid, text) to anon, authenticated;

alter table public.suggested_people enable row level security;
alter table public.suggestion_votes enable row level security;
alter table public.suggestion_cycles enable row level security;

drop policy if exists "public_can_read_active_suggestions" on public.suggested_people;
create policy "public_can_read_active_suggestions"
on public.suggested_people
for select
to anon, authenticated
using (status = 'active');

drop policy if exists "public_can_read_suggestion_votes_for_cycle_check" on public.suggestion_votes;
create policy "public_can_read_suggestion_votes_for_cycle_check"
on public.suggestion_votes
for select
to anon, authenticated
using (true);

drop policy if exists "admin_can_manage_suggested_people" on public.suggested_people;
create policy "admin_can_manage_suggested_people"
on public.suggested_people
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'cristianwalter30acd@gmail.com')
with check ((auth.jwt() ->> 'email') = 'cristianwalter30acd@gmail.com');

drop policy if exists "admin_can_manage_suggestion_votes" on public.suggestion_votes;
create policy "admin_can_manage_suggestion_votes"
on public.suggestion_votes
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'cristianwalter30acd@gmail.com')
with check ((auth.jwt() ->> 'email') = 'cristianwalter30acd@gmail.com');

drop policy if exists "admin_can_manage_suggestion_cycles" on public.suggestion_cycles;
create policy "admin_can_manage_suggestion_cycles"
on public.suggestion_cycles
for all
to authenticated
using ((auth.jwt() ->> 'email') = 'cristianwalter30acd@gmail.com')
with check ((auth.jwt() ->> 'email') = 'cristianwalter30acd@gmail.com');

create unique index if not exists suggested_people_cycle_name_key
on public.suggested_people (cycle_start_date, lower(name));
