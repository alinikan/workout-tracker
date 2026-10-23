-- Non-destructive update: no rows, tables, policies or owner grants are changed.
-- Apply before deploying the simplified Momentum setup. Safe to rerun.
begin;
-- Writes remain account-bound and compare-and-swap protected. Setup only
-- chooses a calendar start; it does not collect or require additional approvals.
create or replace function public.momentum_save(p_expected_revision bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_row public.momentum_progress%rowtype;
  active_id text := p_data->>'activeJourneyId';
  start_date date;
begin
  if owner_id is null or not public.momentum_access() then
    raise exception 'Momentum access denied' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
     or p_data is null or jsonb_typeof(p_data) <> 'object'
     or (p_data->>'schemaVersion') not in ('1','2')
     or p_data->>'schemaVersion' is null
     or jsonb_typeof(p_data->'journeys') is distinct from 'object'
     or jsonb_typeof(p_data->'profile') is distinct from 'object'
     or octet_length(p_data::text) > 524288 then
    raise exception 'Invalid Momentum document' using errcode = '22023';
  end if;
  insert into public.momentum_progress(user_id) values(owner_id) on conflict do nothing;
  select * into current_row from public.momentum_progress where user_id = owner_id for update;
  if current_row.revision <> p_expected_revision then
    return jsonb_build_object('conflict',true,'data',current_row.data,'revision',current_row.revision);
  end if;
  if active_id is not null then
    if jsonb_typeof(p_data->'journeys'->active_id) is distinct from 'object'
       or ((p_data->'journeys'->active_id->>'startedOn') ~ '^\d{4}-\d{2}-\d{2}$') is distinct from true then
      raise exception 'Choose a valid journey and start date' using errcode = '22023';
    end if;
    start_date := (p_data->'journeys'->active_id->>'startedOn')::date;
    -- Existing journeys may keep their historical start. Only activation or
    -- changing the start validates the current Vancouver date and Monday slot.
    if active_id is distinct from current_row.data->>'activeJourneyId'
       or p_data->'journeys'->active_id->>'startedOn' is distinct from current_row.data->'journeys'->active_id->>'startedOn' then
      if extract(isodow from start_date) <> 1
         or start_date < (now() at time zone 'America/Vancouver')::date then
        raise exception 'Choose today or a future Monday' using errcode = '22023';
      end if;
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
