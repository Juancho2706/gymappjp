-- Candado DB: alumno archivado (is_archived) o pausado (is_active=false) no puede escribir,
-- ademas del gate de suscripcion del coach ya existente (gracia 7d, PR #128).
-- Aditiva e idempotente: solo redefine private.student_write_allowed; las policies RESTRICTIVE
-- de workout_logs / check_ins / daily_nutrition_logs / nutrition_meal_logs y los guards de los
-- RPC record/correct_nutrition_intake_v2 ya la invocan, asi que el candado aplica en todas las
-- superficies (web, API mobile y PostgREST directo de la app RN) sin tocar policies.
-- Fail-open se conserva: sin fila de cliente -> true (mismo comportamiento previo).

create or replace function private.student_write_allowed(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select
      (cl.is_archived is not true and cl.is_active is not false)
      and (
        private.coach_has_effective_access(co.subscription_status, co.current_period_end)
        or now() < coalesce(co.paid_access_ended_at, co.current_period_end) + interval '7 days'
      )
    from public.clients cl
    join public.coaches co on co.id = cl.coach_id
    where cl.id = p_client_id
  ), true);
$$;
