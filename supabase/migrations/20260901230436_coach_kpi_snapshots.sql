-- coach_kpi_snapshots — foto diaria de los KPI del panel del coach (Ola de orden, 7C fase 2).
--
-- Una fila por (coach_id, day). `day` es la fecha calendario en America/Santiago al correr el cron
-- `/api/cron/coach-kpi-snapshot` (04:30 UTC ≈ 00:30/01:30 Santiago): la fila describe el estado al
-- INICIO de ese día. El dashboard lee la fila de hace 7 días para el delta de «En riesgo» y el
-- saldo neto de «Alumnos»; sin fila el delta es `null` (honesto), nunca inventado.
--
-- Los valores se calculan con el MISMO camino TypeScript que el dashboard y el endpoint móvil
-- (scope preferido + pulse + splitRiskClients + countCoachClients): no hay fórmula en SQL a
-- propósito (regla: no duplicar lógica de negocio).
--
-- Seguridad: RLS. Escribe solo service_role (sin policy de INSERT/UPDATE/DELETE para
-- authenticated); el coach lee únicamente sus filas. Sin columnas user-editable ⇒ sin
-- column-level grants (AGENTS.md). anon sin privilegios.
--
-- Aditiva e idempotente. Sin retención automática por ahora (91 coaches × 365 d ≈ 33k filas/año).
-- Aplicada en LIVE el 2026-09-01 vía MCP (tx-rollback previo + advisors sin hallazgos).

create table if not exists public.coach_kpi_snapshots (
  coach_id       uuid        not null references public.coaches(id) on delete cascade,
  day            date        not null,
  risk_count     integer     not null default 0,
  active_clients integer     not null default 0,
  avg_adherence  integer     not null default 0,
  sessions_7d    integer     not null default 0,
  created_at     timestamptz not null default now(),
  primary key (coach_id, day),
  constraint coach_kpi_snapshots_counts_nonneg
    check (risk_count >= 0 and active_clients >= 0 and sessions_7d >= 0),
  constraint coach_kpi_snapshots_adherence_pct
    check (avg_adherence between 0 and 100)
);

comment on table public.coach_kpi_snapshots is
  'Foto diaria de los KPI del dashboard del coach (7C fase 2). Escribe el cron coach-kpi-snapshot con service_role; el coach lee lo suyo. day = fecha calendario America/Santiago (estado al inicio del día).';
comment on column public.coach_kpi_snapshots.risk_count is
  'Alumnos con flag SIN_CHECKIN_1M o SIN_EJERCICIO_7D (splitRiskClients), conteo completo sin tope.';
comment on column public.coach_kpi_snapshots.active_clients is
  'countCoachClients: no archivados, sin demo, en el scope preferido del coach (= KPI «Alumnos»).';
comment on column public.coach_kpi_snapshots.avg_adherence is
  'Promedio redondeado (0-100) del % de adherencia semanal del pulse (= KPI «Adherencia»).';
comment on column public.coach_kpi_snapshots.sessions_7d is
  'Sesiones únicas (alumno + día Santiago) de workout_logs en los últimos 7 días.';

alter table public.coach_kpi_snapshots enable row level security;

drop policy if exists coach_kpi_snapshots_select_own on public.coach_kpi_snapshots;
create policy coach_kpi_snapshots_select_own
  on public.coach_kpi_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = coach_id);

-- Los default privileges de Supabase dan ALL a authenticated: se recorta a lectura. anon nada.
revoke all on public.coach_kpi_snapshots from anon, authenticated;
grant select on public.coach_kpi_snapshots to authenticated;
