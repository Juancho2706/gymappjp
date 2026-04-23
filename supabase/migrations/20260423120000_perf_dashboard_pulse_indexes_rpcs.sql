-- Dashboard / pulse performance: supporting indexes + RPCs for aggregations.
-- client_payments (coach_id, payment_date) already exists in 20260421120000.

-- workout_logs: pulse, 30d series, recent feed
create index if not exists idx_workout_logs_client_id_logged_at
  on public.workout_logs (client_id, logged_at desc);

-- check_ins: pulse
create index if not exists idx_check_ins_client_id_created_at
  on public.check_ins (client_id, created_at desc);

-- clients: growth, recent lists, coach scope
create index if not exists idx_clients_coach_id_created_at
  on public.clients (coach_id, created_at desc);

-- workout_programs: expiring list + pulse active programs
create index if not exists idx_workout_programs_coach_active_end_date
  on public.workout_programs (coach_id, is_active, end_date asc nulls last)
  where is_active = true and end_date is not null;

-- exercises catalog: coach custom rows
create index if not exists idx_exercises_coach_muscle_name
  on public.exercises (coach_id, muscle_group, name)
  where coach_id is not null;

-- global library rows
create index if not exists idx_exercises_global_muscle_name
  on public.exercises (muscle_group, name)
  where coach_id is null;

-- Sliding 6 calendar months (UTC month buckets) of client signups for coach dashboard bar chart.
create or replace function public.get_coach_client_signups_last_6_months(p_coach_id uuid)
returns table (ym text, client_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select date_trunc('month', timezone('utc', now())) - (interval '1 month' * generate_series(5, 0)) as m
  )
  select to_char(months.m, 'YYYY-MM') as ym,
         count(c.id)::bigint as client_count
  from months
  left join public.clients c
    on c.coach_id = p_coach_id
   and date_trunc('month', timezone('utc', c.created_at::timestamptz)) = months.m
  group by months.m
  order by months.m;
$$;

grant execute on function public.get_coach_client_signups_last_6_months(uuid) to authenticated;
grant execute on function public.get_coach_client_signups_last_6_months(uuid) to service_role;

-- Sum planned sets (workout_blocks.sets) per program for adherence denominator in directory pulse.
create or replace function public.get_workout_program_planned_set_totals(p_program_ids uuid[])
returns table (program_id uuid, total_planned_sets bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select wp.id as program_id,
         coalesce(sum(wb.sets), 0)::bigint as total_planned_sets
  from (select distinct unnest(p_program_ids) as pid) x
  join public.workout_programs wp on wp.id = x.pid
  left join public.workout_plans wpl on wpl.program_id = wp.id
  left join public.workout_blocks wb on wb.plan_id = wpl.id
  group by wp.id;
$$;

grant execute on function public.get_workout_program_planned_set_totals(uuid[]) to authenticated;
grant execute on function public.get_workout_program_planned_set_totals(uuid[]) to service_role;
