-- ============================================================================
-- EVA Nutricion — T2.1 F2: overrides de macros por coach
-- Spec: docs/specs/nutrition-food-overrides/SPEC.md · Tarea: TASKS.md F2
-- ----------------------------------------------------------------------------
-- PROBLEMA. El coach no puede corregir los macros de un alimento del catalogo
-- que considera errados, ni fijarle una medida casera propia. La unica salida
-- hoy es clonar el alimento como `coach_custom`: el clon deja de recibir las
-- correcciones del catalogo y el buscador muestra dos filas iguales. El repo ya
-- documenta los 104 duplicados de julio como consecuencia directa.
--
-- FORMA. Una fila por (coach, alimento) con los CINCO macros y la base
-- declarada. El merge NO vive aca: lo hace `private.food_catalog_v2_item_json`
-- (F3) con un left join sobre la pagina final, de modo que buscador, scanner,
-- sugerencias y detalle heredan la correccion de una sola vez.
--
-- POR QUE macros_basis ES NOT NULL. El catalogo tiene dos convenciones vivas
-- (`per_100` del importado y `per_serving` del seed de intercambios) y hoy el
-- freeze de publicacion asume per_100 sin declararlo. Un override por porcion
-- sin base declarada se congelaria con numeros equivocados y el error solo se
-- veria cuando el alumno mira su plan — con el snapshot ya inmutable.
--
-- ADITIVA / forward-only: tabla nueva, cero DROP, cero cambio sobre tablas
-- existentes. No toca read models (eso es F3) ni el freeze (F4). Rollback al pie.
--
-- DESVIO ANOTADO vs SPEC (codigo gana, con razon): la SPEC pedia `force row
-- level security`. NO se aplica. Ninguna tabla del repo la usa, y aca romperia
-- la feature entera: `food_catalog_v2_item_json` es SECURITY DEFINER y corre
-- como el dueño de la tabla; con FORCE el dueño queda sujeto a RLS y, siendo
-- todas las policies `to authenticated`, no matchearia NINGUNA => el merge
-- devolveria cero overrides EN SILENCIO. El aislamiento del merge lo da el
-- `p_coach_id` resuelto server-side (leccion B1), no la RLS del definer.
-- ============================================================================

-- ── 1) Tabla ────────────────────────────────────────────────────────────────
create table public.coach_food_overrides (
  id               uuid primary key default gen_random_uuid(),

  -- Dueño. JAMAS viene del payload: la capa web lo deriva del actor (patron F2
  -- de exchange-lists). No hay `org_id`: los overrides a nivel organizacion son
  -- una migracion aditiva futura, fuera del alcance v1.
  coach_id         uuid not null references public.coaches(id) on delete cascade,
  food_id          uuid not null references public.foods(id) on delete cascade,

  -- Set COMPLETO de macros. El merge es reemplazo total, no coalesce por campo:
  -- un override parcial deja el alimento internamente incoherente (kcal
  -- corregidas contra macros viejos que no suman) y el coach no tiene como
  -- notarlo. El sheet de edicion (T2.2) prellena los cinco valores vigentes.
  calories         numeric not null,
  protein_g        numeric not null,
  carbs_g          numeric not null,
  fats_g           numeric not null,
  fiber_g          numeric not null,

  -- Base de los macros de ARRIBA (NUT-001). Ver cabecera: es el gotcha central.
  macros_basis     text not null,

  -- Medida casera propia del coach ("1 pocillo"). Opcional, pero indivisible.
  household_label  text,
  household_grams  numeric,

  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Un solo override por coach y alimento: el merge es un probe por unique, no
  -- una resolucion por precedencia (a diferencia de exchange_group_foods, que
  -- si tiene catalogo global). Sin dueños NULL no hace falta NULLS NOT DISTINCT.
  constraint cfo_coach_food_uq unique (coach_id, food_id),

  -- Sanidad: nadie escribe 40.000 kcal por 100 g a mano sin equivocarse.
  constraint cfo_macros_range check (
    calories  >= 0 and calories  <= 9999 and
    protein_g >= 0 and protein_g <= 9999 and
    carbs_g   >= 0 and carbs_g   <= 9999 and
    fats_g    >= 0 and fats_g    <= 9999 and
    fiber_g   >= 0 and fiber_g   <= 9999
  ),
  constraint cfo_macros_basis_valid check (macros_basis in ('per_100', 'per_serving')),
  constraint cfo_household_label_len check (
    household_label is null or char_length(household_label) <= 40
  ),
  constraint cfo_household_grams_positive check (household_grams is null or household_grams > 0),
  -- Etiqueta y gramos viajan JUNTOS: "1 taza" sin gramos no convierte nada, y
  -- unos gramos sin etiqueta no se pueden mostrar.
  constraint cfo_household_pair check (
    (household_label is null) = (household_grams is null)
  )
);

comment on table public.coach_food_overrides is
  'Correccion de macros y medida casera de un alimento del catalogo, por coach. '
  'Una fila por (coach, alimento). El merge lo hace private.food_catalog_v2_item_json '
  'en discovery y el freeze de publicacion en TS; los planes ya publicados conservan '
  'los numeros viejos por diseño (republicar propaga).';
comment on column public.coach_food_overrides.macros_basis is
  'Base de los macros de esta fila: per_100 (por 100 g/ml) o per_serving (por la '
  'porcion descrita en foods.serving_size/serving_unit). NOT NULL a proposito: un '
  'override sin base declarada se congela con numeros equivocados. NUT-001.';
comment on column public.coach_food_overrides.household_grams is
  'Gramos que pesa la medida casera del label. Par indivisible con household_label.';

-- FK sin indice = advisor. El unique ya cubre los barridos por coach.
create index cfo_food_id_idx on public.coach_food_overrides (food_id);

create trigger coach_food_overrides_set_updated_at
before update on public.coach_food_overrides
for each row execute function private.nutrition_v2_set_updated_at();

-- ── 2) Grants: REVOKE total + explicitos. UPDATE es column-level (AGENTS.md):
--       la identidad de la fila (coach, alimento) es inmutable desde la app —
--       "corregir otro alimento" es borrar y crear, no mover la fila.
alter table public.coach_food_overrides enable row level security;
revoke all on public.coach_food_overrides from public, anon, authenticated;
grant select, insert, delete on public.coach_food_overrides to authenticated;
grant update (
  calories, protein_g, carbs_g, fats_g, fiber_g,
  macros_basis, household_label, household_grams
) on public.coach_food_overrides to authenticated;
grant all on public.coach_food_overrides to service_role;

-- ── 3) RLS ──────────────────────────────────────────────────────────────────
-- Las 4 RPC del catalogo son SECURITY DEFINER y no dependen de estas policies
-- (resuelven el coach server-side). Existen para las lecturas DIRECTAS por
-- PostgREST: la gestion del coach (T2.2) y los tests con JWT real.
create policy cfo_select_own on public.coach_food_overrides
for select to authenticated
using (coach_id = (select auth.uid()));

-- El alumno lee los overrides de SU coach: espejo de egf_select_client_coach.
-- Sin esta policy, una lectura directa del alumno veria el catalogo sin corregir
-- mientras su plan muestra el numero corregido.
create policy cfo_select_client_coach on public.coach_food_overrides
for select to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = (select auth.uid()) and c.coach_id = coach_food_overrides.coach_id
  )
);

-- Escritura: solo filas propias, y solo sobre alimentos que el actor PUEDE VER.
-- Sin el segundo guard, un coach podria crear un override sobre el alimento
-- privado de otro coach y confirmar su existencia por el error del unique.
-- Se usa `food_catalog_v2_can_read_food` (no `food_visible_to_actor`): la regla
-- correcta aca es "puedo leer este alimento en el catalogo".
create policy cfo_insert_own on public.coach_food_overrides
for insert to authenticated
with check (
  coach_id = (select auth.uid())
  and private.food_catalog_v2_can_read_food(food_id)
);

create policy cfo_update_own on public.coach_food_overrides
for update to authenticated
using (coach_id = (select auth.uid()))
with check (coach_id = (select auth.uid()));

-- Restaurar el original ES un delete. 0 filas afectadas no es error.
create policy cfo_delete_own on public.coach_food_overrides
for delete to authenticated
using (coach_id = (select auth.uid()));

create policy cfo_service_role on public.coach_food_overrides
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta aca):
--   drop table if exists public.coach_food_overrides cascade;
-- ============================================================================
