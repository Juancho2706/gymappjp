-- ============================================================================
-- EVA Nutrition V2 — Reemplazos autorizados por el coach, por alimento prescrito.
-- Feature F-02: el coach elige, por item del plan, alimentos de reemplazo que el
-- alumno ve como opciones autorizadas (SOLO structured/hybrid; en flexible el
-- alumno ya elige libremente). Reemplaza el texto legado "Alternativas: ..." que
-- venía congelado en `notes` (relicto de la conversión V1) por estructura real.
-- ----------------------------------------------------------------------------
-- 100% ADITIVA / forward-only: una única tabla nueva + su RLS/grants/indices.
-- CERO DROP/rename; NO toca tablas, funciones, RLS ni grants existentes. El freeze
-- del snapshot lo hace la capa de persistencia del draft (espejo EXACTO de
-- nutrition_slot_exchange_targets_v2 / items). El publish RPC y los read-models
-- quedan INTACTOS: el read del reemplazo va por lectura directa RLS-scoped del
-- cliente (can_read_version), no por las funciones del hot-path.
--
-- RLS (lección incidente 2026-06-09 + bug private_notes 2026-07-21): espejo EXACTO
-- de nutrition_prescription_items_v2 / nutrition_slot_exchange_targets_v2 — helpers
-- STABLE SECURITY DEFINER private.nutrition_v2_can_read_version / _can_edit_version
-- sobre version_id (re-derivan scope version->plan->client), grants a NIVEL TABLA
-- (no por-columna: columnas nuevas nunca requieren grant, evita el 42501).
--
-- ROLLBACK (una pasada): drop table ... cascade (al pie).
-- ============================================================================

create table public.nutrition_item_substitutions_v2 (
  id                   uuid primary key default gen_random_uuid(),
  version_id           uuid not null,
  -- FK simple al item (id es PK). version_id va denormalizado para la RLS (la
  -- persistencia lo fija = version del item). Cascade: descartar un draft o
  -- borrar el item limpia sus reemplazos.
  prescription_item_id uuid not null
                       references public.nutrition_prescription_items_v2(id) on delete cascade,
  -- Fuente del reemplazo: alimento del catálogo (food_id), receta (recipe_id,
  -- forward-compat sin FK) o nombre libre (custom_name). Al menos una presente.
  food_id              uuid references public.foods(id) on delete restrict,
  recipe_id            uuid,
  custom_name          text,
  -- Cantidad/unidad opcionales: null = "misma porción que el prescrito".
  quantity             numeric check (quantity is null or quantity > 0),
  unit                 text,
  order_index          integer not null default 0 check (order_index >= 0),
  -- Snapshot congelado al persistir (decisión CEO: macros congeladas, como items).
  snapshot_name        text,
  snapshot_brand       text,
  snapshot_calories    numeric,
  snapshot_protein_g   numeric,
  snapshot_carbs_g     numeric,
  snapshot_fats_g      numeric,
  snapshot_fiber_g     numeric,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint nis_source_present
    check (num_nonnulls(food_id, recipe_id, custom_name) >= 1)
);

-- Indices: FK sin indice = advisor. El reemplazo se lee por (prescription_item_id)
-- y se persiste/borra por (version_id).
create index nis_prescription_item_id_idx
  on public.nutrition_item_substitutions_v2 (prescription_item_id, order_index);
create index nis_version_id_idx
  on public.nutrition_item_substitutions_v2 (version_id);
create index nis_food_id_idx
  on public.nutrition_item_substitutions_v2 (food_id);

comment on table public.nutrition_item_substitutions_v2 is
  'Reemplazos autorizados por el coach por item prescrito (F-02). Solo structured/hybrid. '
  'snapshot_* congelados al persistir el draft (mismo criterio que items/exchange-targets). '
  'El alumno los ve como opciones; lectura directa RLS-scoped (can_read_version).';

create trigger nutrition_item_substitutions_v2_set_updated_at
before update on public.nutrition_item_substitutions_v2
for each row execute function private.nutrition_v2_set_updated_at();

-- Grants a NIVEL TABLA (revoke total + grants explícitos). anon sin privilegios.
alter table public.nutrition_item_substitutions_v2 enable row level security;
revoke all on public.nutrition_item_substitutions_v2 from public, anon, authenticated;
grant select, insert, update, delete on public.nutrition_item_substitutions_v2 to authenticated;
grant all on public.nutrition_item_substitutions_v2 to service_role;

-- RLS espejo EXACTO de nutrition_slot_exchange_targets_v2: read por can_read_version
-- (coach de su pool O el propio alumno sobre versiones published/superseded);
-- insert/update/delete por can_edit_version (solo coach, solo draft).
create policy nutrition_item_substitutions_v2_select
on public.nutrition_item_substitutions_v2
for select
to authenticated
using (private.nutrition_v2_can_read_version(version_id));

create policy nutrition_item_substitutions_v2_insert
on public.nutrition_item_substitutions_v2
for insert
to authenticated
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_item_substitutions_v2_update
on public.nutrition_item_substitutions_v2
for update
to authenticated
using (private.nutrition_v2_can_edit_version(version_id))
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_item_substitutions_v2_delete
on public.nutrition_item_substitutions_v2
for delete
to authenticated
using (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_item_substitutions_v2_service
on public.nutrition_item_substitutions_v2
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

-- ============================================================================
-- ROLLBACK (una pasada — referencia de operación):
--   drop table if exists public.nutrition_item_substitutions_v2 cascade;
-- ============================================================================
