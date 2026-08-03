-- ============================================================================
-- EVA Nutricion — F2: listas de equivalencia PROPIAS del coach
-- Spec: specs/nutrition-exchange-lists/SPEC.md (AD-1) · Tarea: TASKS.md T1.1
-- ----------------------------------------------------------------------------
-- PROBLEMA. `foods.exchange_group_id` / `exchange_portion_grams` /
-- `exchange_portion_label` son columnas de la FILA DEL ALIMENTO: hay una sola
-- verdad global por alimento. El coach no puede tocar el arroz del catalogo
-- (`foods_update_own` exige coach_id = auth.uid()), no puede discrepar con otro
-- coach, y no puede sacar un alimento de la lista que ve su alumno.
--
-- FORMA. Tabla grupo x alimento x dueno. El catalogo global son filas SIN dueno
-- (las escribe el backfill con service_role); el coach escribe ENCIMA con su
-- propia fila; la lectura resuelve por precedencia coach > org > global.
-- `is_excluded` es la fila-lapida que retira un alimento global de la lista del
-- coach sin tocar el catalogo.
--
-- DESCARTADO: clonar filas de `foods` por coach — reintroduce exactamente los
-- 104 duplicados que se limpiaron en julio.
--
-- OWNERSHIP: espejo de `foods` (coach_id / org_id, nunca los dos). `exchange_
-- groups` se llavea por team_id, pero el read-model del alumno solo conoce
-- coach_id/org_id (ver 20260803194000), asi que la LISTA se llavea como foods.
--
-- ADITIVA / forward-only: cero DROP, cero cambio sobre tablas existentes. Esta
-- migracion NO toca read models (eso es T1.3) ni mueve datos (eso es T1.2).
-- Rollback al pie.
-- ============================================================================

-- ── 0) Helpers de visibilidad (la RLS de una tabla no puede consultar la RLS de
--       otra; estos SECURITY DEFINER son el espejo auditado de `xg_select` y de
--       las policies SELECT de `foods`). Se usan en los WITH CHECK de escritura:
--       sin ellos un coach podria meter en SU lista el alimento privado de otro
--       coach (filtracion de nombre) o colgarla de un grupo que no ve.
-- ---------------------------------------------------------------------------
create or replace function private.exchange_group_visible_to_actor(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exchange_groups g
    where g.id = p_group_id
      and g.deleted_at is null
      and (
        g.is_system
        or g.coach_id = (select auth.uid())
        or g.team_id in (select public.current_user_team_ids())
      )
  );
$$;

comment on function private.exchange_group_visible_to_actor(uuid) is
  'Espejo de la policy exchange_groups.xg_select para usar dentro de WITH CHECK '
  'de otras tablas (RLS no puede consultar RLS ajena).';

create or replace function private.food_visible_to_actor(p_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.foods f
    where f.id = p_food_id
      and (
        (f.coach_id is null and f.org_id is null)
        or (f.coach_id = (select auth.uid()) and f.org_id is null)
        or (f.org_id is not null and public.is_active_org_member(f.org_id))
      )
  );
$$;

comment on function private.food_visible_to_actor(uuid) is
  'Espejo de las policies SELECT de foods para el actor autenticado (global, '
  'propio, o de una org donde es miembro activo). No incluye la vista de alumno: '
  'quien escribe listas de equivalencia es siempre coach u org.';

revoke all on function private.exchange_group_visible_to_actor(uuid) from public, anon;
revoke all on function private.food_visible_to_actor(uuid) from public, anon;
grant execute on function private.exchange_group_visible_to_actor(uuid) to authenticated;
grant execute on function private.food_visible_to_actor(uuid) to authenticated;

-- ── 1) Tabla ────────────────────────────────────────────────────────────────
create table public.exchange_group_foods (
  id                uuid primary key default gen_random_uuid(),
  exchange_group_id uuid not null references public.exchange_groups(id) on delete cascade,
  food_id           uuid not null references public.foods(id) on delete cascade,

  -- Dueno de la fila. Ambos NULL = catalogo global (solo lo escribe el backfill
  -- con service_role: ninguna policy de authenticated deja crear filas globales).
  coach_id          uuid references public.coaches(id) on delete cascade,
  org_id            uuid references public.organizations(id) on delete cascade,

  -- Cuanto pesa 1 porcion de ESTE alimento en ESTE grupo. NULL solo cuando la
  -- fila es una lapida de exclusion.
  portion_grams     numeric,
  -- Medida casera ("1 taza", "3 cdas"). Hint corto, no descripcion.
  portion_label     text,
  -- Fila-lapida: retira un alimento (global o de la org) de la lista del dueno.
  is_excluded       boolean not null default false,

  source            text not null default 'coach',
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Una fila pertenece a un coach, o a una org, o a nadie. Nunca a los dos.
  constraint egf_owner_exclusive check (coach_id is null or org_id is null),
  constraint egf_portion_grams_range check (
    portion_grams is null or (portion_grams > 0 and portion_grams <= 5000)
  ),
  -- Una fila viva SIEMPRE dice cuantos gramos son 1 porcion; solo la lapida puede
  -- omitirlo. Sin esto entrarian filas mudas que el alumno veria como "1 porcion = —".
  constraint egf_grams_required_when_visible check (is_excluded or portion_grams is not null),
  constraint egf_portion_label_len check (portion_label is null or char_length(portion_label) <= 40),
  constraint egf_source_valid check (source in ('catalog', 'coach', 'import')),

  -- PG 17.6 en LIVE: NULLS NOT DISTINCT hace que las filas globales (los dos
  -- dueños NULL) colisionen entre si, que es justo lo que queremos. Sin esto
  -- harian falta tres indices unicos parciales.
  constraint egf_group_food_owner_uq
    unique nulls not distinct (exchange_group_id, food_id, coach_id, org_id)
);

comment on table public.exchange_group_foods is
  'Lista de equivalencias por grupo de porciones: cuantos gramos de un alimento '
  'son 1 porcion de un grupo, con dueno. Filas sin dueno = catalogo global; el '
  'coach/org escriben encima. is_excluded retira un alimento de la lista del dueno.';
comment on column public.exchange_group_foods.is_excluded is
  'Lapida: el alimento existe en el catalogo global del grupo pero el dueno de '
  'esta fila NO quiere que aparezca en la lista de sus alumnos.';
comment on column public.exchange_group_foods.source is
  'catalog = backfill del seed historico; coach = lo escribio un humano; import = '
  'copia masiva al duplicar un grupo.';

-- Indices. El UNIQUE ya cubre los barridos por (exchange_group_id, ...), que es
-- el acceso del read-model. Faltan la FK a foods (los advisors marcan FK sin
-- indice) y los dos barridos de gestion "toda mi lista".
create index egf_food_id_idx on public.exchange_group_foods (food_id);
create index egf_coach_id_idx on public.exchange_group_foods (coach_id) where coach_id is not null;
create index egf_org_id_idx on public.exchange_group_foods (org_id) where org_id is not null;

create trigger exchange_group_foods_set_updated_at
before update on public.exchange_group_foods
for each row execute function private.nutrition_v2_set_updated_at();

-- ── 2) Grants: REVOKE total + explicitos. UPDATE es column-level (AGENTS.md):
--       identidad (grupo, alimento, dueno) y procedencia (source) son inmutables
--       desde la app; solo se editan gramos, medida casera y la lapida.
alter table public.exchange_group_foods enable row level security;
revoke all on public.exchange_group_foods from public, anon, authenticated;
grant select, insert, delete on public.exchange_group_foods to authenticated;
grant update (portion_grams, portion_label, is_excluded) on public.exchange_group_foods to authenticated;
grant all on public.exchange_group_foods to service_role;

-- ── 3) RLS ──────────────────────────────────────────────────────────────────
-- SELECT: espejo de las 5 policies de `foods` (global / propia / de mi coach /
-- de mi org como miembro / de mi org como alumno).
create policy egf_select_global on public.exchange_group_foods
for select to authenticated
using (coach_id is null and org_id is null);

create policy egf_select_own on public.exchange_group_foods
for select to authenticated
using (coach_id = (select auth.uid()));

create policy egf_select_client_coach on public.exchange_group_foods
for select to authenticated
using (
  coach_id is not null
  and org_id is null
  and exists (
    select 1 from public.clients c
    where c.id = (select auth.uid()) and c.coach_id = exchange_group_foods.coach_id
  )
);

create policy egf_select_org on public.exchange_group_foods
for select to authenticated
using (org_id is not null and public.is_active_org_member(org_id));

create policy egf_select_client_org on public.exchange_group_foods
for select to authenticated
using (
  org_id is not null
  and exists (
    select 1 from public.clients c
    where c.id = (select auth.uid()) and c.org_id = exchange_group_foods.org_id
  )
);

-- ESCRITURA: solo filas propias. `authenticated` NO puede crear filas globales
-- (ambas policies exigen dueno) — el catalogo global es territorio del backfill.
-- Los helpers de visibilidad impiden colgar la fila de un grupo o de un alimento
-- que el actor no ve.
create policy egf_insert_own on public.exchange_group_foods
for insert to authenticated
with check (
  coach_id = (select auth.uid())
  and org_id is null
  and private.exchange_group_visible_to_actor(exchange_group_id)
  and private.food_visible_to_actor(food_id)
);

create policy egf_insert_org on public.exchange_group_foods
for insert to authenticated
with check (
  org_id is not null
  and coach_id is null
  and public.is_org_admin_member(org_id)
  and private.exchange_group_visible_to_actor(exchange_group_id)
  and private.food_visible_to_actor(food_id)
);

create policy egf_update_own on public.exchange_group_foods
for update to authenticated
using (coach_id = (select auth.uid()) and org_id is null)
with check (coach_id = (select auth.uid()) and org_id is null);

create policy egf_update_org on public.exchange_group_foods
for update to authenticated
using (org_id is not null and public.is_org_admin_member(org_id))
with check (org_id is not null and coach_id is null);

create policy egf_delete_own on public.exchange_group_foods
for delete to authenticated
using (coach_id = (select auth.uid()) and org_id is null);

create policy egf_delete_org on public.exchange_group_foods
for delete to authenticated
using (org_id is not null and public.is_org_admin_member(org_id));

create policy egf_service on public.exchange_group_foods
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta acá):
--   drop table if exists public.exchange_group_foods cascade;
--   drop function if exists private.food_visible_to_actor(uuid);
--   drop function if exists private.exchange_group_visible_to_actor(uuid);
-- ============================================================================
