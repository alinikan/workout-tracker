create table if not exists public.workout_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"days": {}, "metrics": {}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_progress enable row level security;

revoke all on table public.workout_progress from anon, authenticated;
grant select, insert, update, delete on table public.workout_progress to authenticated;

drop policy if exists "Users can read their own workout progress." on public.workout_progress;
create policy "Users can read their own workout progress."
on public.workout_progress
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own workout progress." on public.workout_progress;
create policy "Users can create their own workout progress."
on public.workout_progress
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workout progress." on public.workout_progress;
create policy "Users can update their own workout progress."
on public.workout_progress
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own workout progress." on public.workout_progress;
create policy "Users can delete their own workout progress."
on public.workout_progress
for delete
to authenticated
using ((select auth.uid()) = user_id);

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
