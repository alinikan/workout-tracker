-- Additive migration. Does not change workout_progress or its policies/data.
-- Run once in the Supabase SQL Editor as the project administrator.
begin;
-- Use a dedicated schema so existing private schemas/grants are untouched.
create schema if not exists momentum_private;
revoke all on schema momentum_private from public, anon, authenticated;

-- A singleton grant deliberately supports exactly ONE private owner. Browser
-- users cannot read or change this table. Authorize the UUID separately.
create table if not exists momentum_private.momentum_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
revoke all on momentum_private.momentum_owner from public, anon, authenticated;

create or replace function public.momentum_access()
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and exists (
  select 1 from momentum_private.momentum_owner where user_id = auth.uid()
) $$;
revoke all on function public.momentum_access() from public, anon, authenticated;
grant execute on function public.momentum_access() to authenticated;

create table if not exists public.momentum_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.momentum_progress enable row level security;
revoke all on public.momentum_progress from public, anon, authenticated;
grant select on public.momentum_progress to authenticated;
drop policy if exists momentum_private_read on public.momentum_progress;
create policy momentum_private_read on public.momentum_progress for select to authenticated
  using ((select auth.uid()) = user_id and (select public.momentum_access()));

-- All writes go through compare-and-swap. The definer has table privileges,
-- but explicitly derives the owner from the validated session, never a parameter.
create or replace function public.momentum_save(p_expected_revision bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_row public.momentum_progress%rowtype;
  active_id text := p_data->>'activeJourneyId';
  assessment_date date;
  start_date date;
begin
  if owner_id is null or not public.momentum_access() then
    raise exception 'Momentum access denied' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
     or p_data is null or jsonb_typeof(p_data) <> 'object'
     or (p_data->>'schemaVersion') is distinct from '1'
     or jsonb_typeof(p_data->'journeys') is distinct from 'object'
     or jsonb_typeof(p_data->'profile') is distinct from 'object'
     or jsonb_typeof(p_data->'clearance') is distinct from 'object'
     or octet_length(p_data::text) > 524288 then
    raise exception 'Invalid Momentum document' using errcode = '22023';
  end if;
  insert into public.momentum_progress(user_id) values(owner_id) on conflict do nothing;
  select * into current_row from public.momentum_progress where user_id = owner_id for update;
  if current_row.revision <> p_expected_revision then
    return jsonb_build_object('conflict',true,'data',current_row.data,'revision',current_row.revision);
  end if;
  -- Defense in depth for activation: the UI is not the only guard. Ongoing
  -- medical pauses are allowed to save with an existing active ID, but opening
  -- a new month or changing its start requires recorded professional advice.
  if active_id is not null and (
    active_id is distinct from current_row.data->>'activeJourneyId'
    or p_data->'journeys'->active_id->>'startedOn' is distinct from current_row.data->'journeys'->active_id->>'startedOn'
  ) then
    if (p_data->'clearance'->>'assessed') is distinct from 'true'
       or (p_data->'clearance'->>'understood') is distinct from 'true'
       or (p_data->'clearance'->>'walk') is distinct from 'true'
       or (p_data->'clearance'->>'strength') is distinct from 'true'
       or (p_data->'clearance'->>'boxing') is distinct from 'true'
       or coalesce(p_data->'clearance'->>'recordedAt','') = ''
       or ((p_data->'clearance'->>'assessedOn') ~ '^\d{4}-\d{2}-\d{2}$') is distinct from true
       or ((p_data->'journeys'->active_id->>'startedOn') ~ '^\d{4}-\d{2}-\d{2}$') is distinct from true then
      raise exception 'Record professional guidance before activation' using errcode = '22023';
    end if;
    assessment_date := (p_data->'clearance'->>'assessedOn')::date;
    start_date := (p_data->'journeys'->active_id->>'startedOn')::date;
    -- A fresh journey may not discard a medical hold reported on another
    -- device. It must preserve that hold and close it after follow-up guidance.
    if exists (
      select 1 from jsonb_each(coalesce(current_row.data->'journeys','{}'::jsonb)) as j
      cross join lateral jsonb_each(coalesce(j.value->'pauses','{}'::jsonb)) as p
      where p.value->>'reason' = 'medical' and p.value->>'to' is null
        and (p_data->'journeys'->j.key->'pauses'->p.key->>'to' is null
             or assessment_date < (p.value->>'from')::date)
    ) or exists (
      select 1 from jsonb_each(p_data->'journeys') as j
      cross join lateral jsonb_each(coalesce(j.value->'pauses','{}'::jsonb)) as p
      where p.value->>'reason' = 'medical' and p.value->>'to' is null
    ) then
      raise exception 'Follow-up guidance must resolve the medical pause before activation' using errcode = '22023';
    end if;
    if assessment_date > (now() at time zone 'America/Vancouver')::date
       or start_date <= assessment_date or extract(isodow from start_date) <> 1
       or start_date < (now() at time zone 'America/Vancouver')::date then
      raise exception 'Choose a Monday after assessment, not a retroactive start' using errcode = '22023';
    end if;
  end if;
  update public.momentum_progress set data = p_data, revision = revision + 1, updated_at = now()
    where user_id = owner_id returning * into current_row;
  return jsonb_build_object('conflict',false,'data',current_row.data,'revision',current_row.revision);
end;
$$;
revoke all on function public.momentum_save(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.momentum_save(bigint,jsonb) to authenticated;
commit;

-- NEXT: follow docs/momentum.md to grant ONE real auth.users UUID. No UUID,
-- medical history or service-role secret belongs in this source file.
