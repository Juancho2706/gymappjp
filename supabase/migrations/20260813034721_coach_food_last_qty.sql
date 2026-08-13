-- ============================================================================
-- EVA Nutricion — T2.6 F3: memoria de la ultima cantidad por alimento
-- Spec: docs/specs/nutrition-authoring-speed/SPEC.md · Tarea: TASKS.md F3
-- ----------------------------------------------------------------------------
-- PROBLEMA. Al agregar un alimento al plan, la cantidad precargada sale del
-- catalogo (`foods.serving_size`), que casi nunca es la que ese coach usa: el
-- que siempre prescribe 150 g de pollo reescribe "150" cada vez, para cada
-- alumno, en cada version del plan. Es el gesto mas repetido de la autoria.
--
-- FORMA. Una fila por (coach, alimento, alumno) con la ultima cantidad fijada.
-- `client_id` NULL = la memoria general del coach para ese alimento; con valor,
-- la memoria para ESE alumno. Conviven, y la lectura las ordena por precedencia
-- (alumno primero, coach despues, catalogo si no hay ninguna).
--
-- POR QUE `nulls not distinct` EN EL UNIQUE. A diferencia de
-- `coach_food_overrides`, aca el NULL es un valor con significado ("sin alumno",
-- la memoria general). Con la regla por defecto de Postgres, dos NULL son
-- distintos entre si y la tabla aceptaria N filas de memoria general para el
-- mismo (coach, alimento): el upsert dejaria de emparejar y la precedencia
-- devolveria cualquiera de ellas.
--
-- POR QUE ES UNA SUGERENCIA Y NO UN DATO DEL PLAN. Nada de esto se congela ni
-- viaja al alumno: solo precarga un campo que el coach ve y puede cambiar antes
-- de guardar. Por eso el check de rango es amplio pero existe — una cantidad
-- absurda guardada por error no puede envenenar la proxima prescripcion.
--
-- ADITIVA / forward-only: tabla nueva, cero DROP, cero cambio sobre tablas
-- existentes, cero read model tocado. Rollback al pie.
-- ============================================================================

-- ── 1) Tabla ────────────────────────────────────────────────────────────────
create table public.coach_food_last_qty (
  id         uuid primary key default gen_random_uuid(),

  -- Dueño. JAMAS viene del payload: la capa web lo deriva del actor (mismo
  -- patron que coach_food_overrides).
  coach_id   uuid not null references public.coaches(id) on delete cascade,
  food_id    uuid not null references public.foods(id) on delete cascade,

  -- NULL = memoria general del coach para ese alimento. Ver cabecera: es el
  -- gotcha central de esta tabla.
  client_id  uuid references public.clients(id) on delete cascade,

  -- Cantidad y unidad viajan JUNTAS: "150" sin unidad no significa nada.
  quantity   numeric not null,
  unit       text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cflq_coach_food_client_uq unique nulls not distinct (coach_id, food_id, client_id),

  -- Sanidad: es una sugerencia que se precarga sola, no puede venir en cualquier
  -- estado. 0 no es una prescripcion y 9999 ya es un error de tipeo.
  constraint cflq_quantity_range check (quantity > 0 and quantity <= 9999),
  -- Mismo dominio que el builder (`BUILDER_UNITS`): g / ml / un.
  constraint cflq_unit_valid check (unit in ('g', 'ml', 'un'))
);

comment on table public.coach_food_last_qty is
  'Ultima cantidad que un coach fijo para un alimento, por alumno (client_id) o '
  'en general (client_id null). Solo precarga el campo del builder: no se congela, '
  'no viaja al alumno y no participa de la publicacion. T2.6.';
comment on column public.coach_food_last_qty.client_id is
  'NULL = memoria general del coach para ese alimento. El unique es NULLS NOT '
  'DISTINCT a proposito: sin eso habria N filas de memoria general por alimento.';

-- FK sin indice = advisor. El unique ya cubre los barridos por coach.
create index cflq_food_id_idx on public.coach_food_last_qty (food_id);
create index cflq_client_id_idx on public.coach_food_last_qty (client_id);

create trigger coach_food_last_qty_set_updated_at
before update on public.coach_food_last_qty
for each row execute function private.nutrition_v2_set_updated_at();

-- ── 2) Grants: REVOKE total + explicitos. UPDATE es column-level (AGENTS.md):
--       la identidad de la fila (coach, alimento, alumno) es inmutable desde la
--       app — "recordar otra cosa" es escribir otra fila, no mover esta.
alter table public.coach_food_last_qty enable row level security;
revoke all on public.coach_food_last_qty from public, anon, authenticated;
grant select, insert, delete on public.coach_food_last_qty to authenticated;
grant update (quantity, unit) on public.coach_food_last_qty to authenticated;
grant all on public.coach_food_last_qty to service_role;

-- ── 3) RLS ──────────────────────────────────────────────────────────────────
-- Tabla privada del coach: el alumno NO la lee (a diferencia de los overrides,
-- que le llegan en el catalogo). Es memoria de autoria, no contenido del plan.
create policy cflq_select_own on public.coach_food_last_qty
for select to authenticated
using (coach_id = (select auth.uid()));

-- Escritura: filas propias, sobre alimentos que el actor PUEDE VER y —cuando la
-- memoria es por alumno— sobre un alumno PROPIO. Sin el guard del alumno, un
-- coach podria escribir filas apuntando al alumno de otro y confirmar su
-- existencia por el error del unique.
create policy cflq_insert_own on public.coach_food_last_qty
for insert to authenticated
with check (
  coach_id = (select auth.uid())
  and private.food_catalog_v2_can_read_food(food_id)
  and (
    client_id is null
    or exists (
      select 1 from public.clients c
      where c.id = coach_food_last_qty.client_id and c.coach_id = (select auth.uid())
    )
  )
);

create policy cflq_update_own on public.coach_food_last_qty
for update to authenticated
using (coach_id = (select auth.uid()))
with check (coach_id = (select auth.uid()));

create policy cflq_delete_own on public.coach_food_last_qty
for delete to authenticated
using (coach_id = (select auth.uid()));

create policy cflq_service_role on public.coach_food_last_qty
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta aca):
--   drop table if exists public.coach_food_last_qty cascade;
-- ============================================================================
