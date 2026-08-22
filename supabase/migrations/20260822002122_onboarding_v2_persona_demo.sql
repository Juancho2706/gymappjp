-- Onboarding del coach v2 (docs/specs/coach-onboarding-v2/, W1 F1.1-F1.4): señal de PERSONA del
-- coach, alumno de ejemplo fuera del cupo, y telemetría de onboarding que deja de mentir.
-- Aditiva, idempotente y sin DDL destructiva. Sin backfill de datos.
--
-- Las tres piezas y por qué van juntas:
--   1. `coaches.persona` + `persona_also_other` + `persona_set_at`: la respuesta a «¿a qué te
--      dedicas?». COLUMNA propia (decisión D7 del owner), no una key del jsonb `onboarding_guide`,
--      porque segmenta correos y funnel y se consulta desde crons.
--   2. `clients.is_demo`: el alumno de ejemplo sembrado por el onboarding. PRERREQUISITO DURO del
--      plan Free de pricing v3 (cupo = 1): si el demo comiera el cupo, el onboarding se convertiría
--      en un muro. Todos los conteos de cupo/KPIs/correos lo excluyen en el mismo cambio.
--   3. `coach_onboarding_events`: el CHECK del baseline (:886) solo admite 3 tipos, así que
--      `guide_engagement` —que la UI ya emite— muere en 500; y sin índice único el checklist
--      re-emitió 2.293 filas de `first_client` para 19 coaches.
--
-- Validada con BEGIN ... ROLLBACK contra LIVE el 2026-08-21 (ver reporte de la tarea): columnas,
-- constraints e índices creados y revertidos sin tocar filas. NO aplicada todavía.

-- ---------------------------------------------------------------------------
-- 1. coaches: la persona del coach
-- ---------------------------------------------------------------------------

alter table public.coaches
  add column if not exists persona text,
  add column if not exists persona_also_other boolean not null default false,
  add column if not exists persona_set_at timestamptz;

-- El CHECK va aparte y guardado por catálogo: `add constraint` no tiene `if not exists`, así que
-- re-correr la migración entera reventaría con 42710 sin este guard.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.coaches'::regclass
      and conname = 'coaches_persona_check'
  ) then
    alter table public.coaches
      add constraint coaches_persona_check
      check (persona is null or persona in ('strength', 'nutrition', 'rehab', 'endurance', 'other'));
  end if;
end $$;

-- `coaches` usa régimen de grants COLUMN-LEVEL para UPDATE (outage 42501 del creador de marca:
-- columnas nuevas sin grant ⇒ el update entero falla). Las tres las edita el propio coach desde la
-- pantalla de persona y desde Opciones › Mi panel. SELECT no necesita grant: `authenticated` tiene
-- SELECT a nivel TABLA sobre coaches. `anon` NO recibe nada: la persona no es branding y no se lee
-- pre-login (a diferencia de instagram_handle, que sí está en BRANDING_COLS_RICH).
grant update (persona, persona_also_other, persona_set_at) on public.coaches to authenticated;

comment on column public.coaches.persona is 'Persona del coach elegida en el onboarding v2: strength | nutrition | rehab | endurance | other. NULL = todavía no la eligió (dispara la pantalla «¿A qué te dedicas?»).';
comment on column public.coaches.persona_also_other is 'Respuesta a la segunda pregunta: nutrición para strength/rehab/endurance, entrenamiento para nutrition. Amplía el set de dominios visibles del panel.';
comment on column public.coaches.persona_set_at is 'Momento en que el coach eligió (o cambió) su persona. Ancla de la medición de activación por cohorte.';

-- ---------------------------------------------------------------------------
-- 2. clients: el alumno de ejemplo
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists is_demo boolean not null default false;

-- Índice PARCIAL: las filas demo son ~1 por coach y las consultas siempre preguntan «¿cuál es el
-- demo de este coach?» (borrarlo, re-sembrarlo, etiquetarlo). Los conteos de cupo filtran
-- `is_demo = false`, que es el 99,9% de la tabla y sigue resolviéndose por los índices de coach_id.
create index if not exists clients_coach_demo_idx on public.clients (coach_id) where is_demo;

comment on column public.clients.is_demo is 'Alumno de ejemplo sembrado por el onboarding v2; NUNCA cuenta para el cupo ni para KPIs ni recibe correos.';

-- Deliberadamente SIN `grant update (is_demo)`: la marca la escribe solo el servidor al sembrar o
-- borrar el demo (service_role tiene UPDATE a nivel tabla). Un coach no debe poder marcar alumnos
-- reales como demo desde PostgREST para esquivar el cupo.
--
-- Pero el grant no alcanza: `clients` tiene INSERT a nivel tabla para `authenticated` y la policy
-- `clients_standalone_coach_manage` es FOR ALL con `coach_id = auth.uid()`, así que un coach podría
-- INSERTAR filas con `is_demo = true` por PostgREST y nacer con cupo infinito. El trigger de abajo
-- cierra ese hueco: solo `service_role` (el sembrador `seedDemoStudent` de W3 escribe con el cliente
-- admin) y los roles de sistema pueden poner o cambiar `is_demo`; cualquier otro rol queda forzado a
-- `false` en INSERT y no puede alterar el valor existente en UPDATE. Sin SECURITY DEFINER: corre con
-- el rol del llamador y solo lee `current_user`/`auth.role()`.
create or replace function public.clients_guard_is_demo()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  caller_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
begin
  if caller_role in ('service_role', 'postgres', 'supabase_admin') or current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_demo := false;
  elsif new.is_demo is distinct from old.is_demo then
    new.is_demo := old.is_demo;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_clients_guard_is_demo on public.clients;
create trigger trg_clients_guard_is_demo
  before insert or update of is_demo on public.clients
  for each row execute function public.clients_guard_is_demo();

comment on function public.clients_guard_is_demo() is 'Onboarding v2: solo service_role/roles de sistema pueden marcar un alumno como demo (is_demo). Evita que un coach esquive el cupo Free insertando demos por PostgREST.';

-- ---------------------------------------------------------------------------
-- 3. coach_onboarding_events: CHECK ampliado + fin del re-emit
-- ---------------------------------------------------------------------------

-- El CHECK del baseline solo admitía step_completed | step_reopened | aha_moment. La lista nueva es
-- un SUPERSET (ninguna fila existente la viola) y cubre los eventos del onboarding v2 más
-- `guide_engagement`, que la UI ya emitía y moría en 500.
alter table public.coach_onboarding_events
  drop constraint if exists coach_onboarding_events_event_type_check;

alter table public.coach_onboarding_events
  add constraint coach_onboarding_events_event_type_check
  check (event_type in (
    'step_completed',
    'step_reopened',
    'aha_moment',
    'guide_engagement',
    'persona_selected',
    'demo_seeded',
    'demo_deleted',
    'vive_tu_app_opened',
    'invite_link_copied',
    'invite_whatsapp_opened',
    'onboarding_dismissed',
    'first_module_opened'
  ));

-- Dedupe REAL de `step_completed`: un paso se completa UNA vez por coach. El dedupe por ventana de
-- 5 s del endpoint solo tapaba los re-renders de React; el re-emit en cada carga del dashboard dejó
-- 2.293 filas de `first_client` para 19 coaches y volvió inútil cualquier medición de activación.
--
-- El índice es PARCIAL POR FECHA a propósito: `created_at >= 2026-08-22` deja fuera todo el
-- historial duplicado (crear un índice único sobre las filas viejas fallaría con 23505 y no se
-- puede limpiar historial de eventos). Desde el corte, el insert duplicado devuelve 23505 y la ruta
-- lo traduce a `200 { ok: true, deduped: true }`.
create unique index if not exists coach_onboarding_events_step_completed_once
  on public.coach_onboarding_events (coach_id, step_key)
  where event_type = 'step_completed' and created_at >= '2026-08-22T00:00:00Z'::timestamptz;

-- ---------------------------------------------------------------------------
-- 4. KPI de plataforma: el demo tampoco cuenta ahí
-- ---------------------------------------------------------------------------

-- Único conteo de alumnos que vive en SQL (el resto son queries de la app, corregidas en el mismo
-- cambio). Hoy no tiene llamadores en el repo, pero es la definición canónica de «alumnos activos
-- de la plataforma» para el panel admin: si vuelve a usarse debe nacer ya sin demos. `create or
-- replace` conserva owner y grants; el resto del cuerpo es idéntico al vigente.
create or replace function public.get_platform_clients_count()
returns bigint
language sql
stable
set search_path to 'public'
as $function$
  select count(*)::bigint from public.clients where is_archived = false and is_demo = false;
$function$;
