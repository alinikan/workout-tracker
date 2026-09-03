-- Supabase schema for Workout Tracker cloud sync.
--
-- The React app saves one JSON document per authenticated user. That keeps migrations simple for a
-- personal tracker whose workout, diet, and metric shapes can grow over time.
create table if not exists public.workout_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"days": {}, "metrics": {}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security is the important safety boundary: browser clients use a publishable key, so
-- the database itself must enforce "users can only touch their own row."
alter table public.workout_progress enable row level security;

revoke all on table public.workout_progress from anon, authenticated;
grant select, insert, update, delete on table public.workout_progress to authenticated;

-- SELECT: a signed-in user can read exactly the row whose user_id matches auth.uid().
drop policy if exists "Users can read their own workout progress." on public.workout_progress;
create policy "Users can read their own workout progress."
on public.workout_progress
for select
to authenticated
using ((select auth.uid()) = user_id);

-- INSERT: a signed-in user can create only their own row.
drop policy if exists "Users can create their own workout progress." on public.workout_progress;
create policy "Users can create their own workout progress."
on public.workout_progress
for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- UPDATE: both the old row and the new row must belong to the signed-in user.
drop policy if exists "Users can update their own workout progress." on public.workout_progress;
create policy "Users can update their own workout progress."
on public.workout_progress
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- DELETE: included for completeness if the app later adds account/data reset.
drop policy if exists "Users can delete their own workout progress." on public.workout_progress;
create policy "Users can delete their own workout progress."
on public.workout_progress
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- The trigger keeps updated_at trustworthy so the app can reason about local-vs-cloud freshness.
create or replace function public.set_workout_progress_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_workout_progress_updated_at on public.workout_progress;
create trigger set_workout_progress_updated_at
before update on public.workout_progress
for each row
execute function public.set_workout_progress_updated_at();
