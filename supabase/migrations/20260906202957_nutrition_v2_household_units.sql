-- ============================================================================
-- EVA Nutricion V2 — W2 «Cantidades honestas»: medida casera de verdad
-- (SPEC docs/specs/nutrition-cantidades-honestas/SPEC.md §5.3/§5.4/§5.7,
--  auditoria AUDIT-W2.0-unit-paths.md §3.a — filas a1..a7)
-- ----------------------------------------------------------------------------
-- POR QUE
--   Caso Jean (06-09): «Huevo revuelto 30 un» = 30 porciones de 100 g = 4.470 kcal
--   en un solo item. La unidad «un» significa «una porcion de serving_size» y nadie
--   lo dice; la medida casera del catalogo (foods.household_label/household_grams,
--   275 alimentos) hoy es decorativa y se descarta al congelar el plan.
--   Arquitectura elegida (SPEC §5.1): **los gramos son la verdad, la medida casera
--   es interfaz**. La cantidad persistida de un item prescrito sigue siendo g/ml;
--   el par (etiqueta, gramos) se CONGELA en el item al publicar y viaja por los
--   read models para que la UI rotule «2 huevos (122 g)» sin volver al catalogo.
--
-- QUE HACE (todo aditivo / idempotente / forward-only)
--   a1  nutrition_prescription_items_v2: columnas household_label / household_grams
--       + CHECK de rango [1, 1000] + CHECK de par indivisible.
--   a2  nutrition_prescription_items_v2: CHECK unit <> 'casera' (not valid + validate).
--   a3  foods: CHECK foods_household_grams_range (not valid + validate).
--   R4  coach_food_overrides: CHECK cfo_household_grams_range (not valid + validate)
--       — cfo_household_grams_positive solo exige > 0 y un override con hg = 5000
--       congelaria una fila que el CHECK de a1 rechaza (auditoria §4 R4).
--   a4  persist_and_publish_nutrition_plan_v2: escribe las dos columnas nuevas.
--   a5  private.nutrition_v2_build_prescription_snapshot: emite el par en el item.
--   a6  public.get_nutrition_plan_read_v2: emite el par en prescriptionItems.
--   a7  private.nutrition_v2_intake_item_json: emite el par resuelto desde el item
--       prescrito del registro (null-safe, igual que `category`).
--
-- POR QUE EL CHECK `unit <> 'casera'` ES EL CIERRE REAL (no un cinturon)
--   `nutrition_prescription_items_v2.unit` solo valida longitud
--   (20260714190000:124) y `persist_and_publish` inserta el literal del JSON sin
--   whitelist (20260728140000:426). Si 'casera' se filtrara a la fila, las TRES
--   formulas de macros caen en la rama contable `qty × serving_size / 100`:
--     · computeItemMacros            packages/nutrition-v2/editor-food.ts:96-128
--     · calculateFoodItemMacros      packages/nutrition-engine/macros.ts:120-135
--     · intakeEntryFactor            packages/nutrition-v2/intake-normalize.ts:112-135
--       (espejo SQL private.nutrition_v2_entry_factor, 20260728120000:110-147)
--   y ademas el alumno NO podria registrar ese item: NutritionIntakeUnitSchema
--   (packages/nutrition-v2/contracts.ts:40-47) rechaza 'casera' en «Lo comi».
--   Ver AUDIT-W2.0-unit-paths.md §2. La unidad `casera` (HOUSEHOLD_UNIT de
--   packages/nutrition-v2/intake-units.ts) vive SOLO en el editor y el borrador;
--   `buildItemInsertRow` la traduce a g/ml antes de persistir.
--
-- CERO CAMBIO DE FORMULA
--   El SQL prescrito es passthrough puro (auditoria §2.1): esta migracion solo
--   AGREGA claves al JSON y columnas nullable. `totals` de intake_item_json y las
--   claves condicionales de porciones quedan intactas. Sin UPDATE de datos.
--
-- PRE-CHECKS EN LIVE (solo SELECT, corridos por el jefe antes de aplicar —
-- consultas Q1/Q1b/Q2 de AUDIT-W2.0-unit-paths.md §5): 0 filas violan ninguno de
-- los CHECKs nuevos.
--
-- GRANTS: ninguno nuevo. `nutrition_prescription_items_v2` tiene grants a nivel de
-- TABLA (20260714190500:1125), asi que las columnas nuevas heredan el INSERT/UPDATE;
-- ademas quien escribe es la RPC (security definer).
--
-- TIPOS: tras aplicar en LIVE hay que regenerar apps/web/src/lib/database.types.ts.
-- ============================================================================

-- ── a1) Par casero congelado en el item prescrito ────────────────────────────
alter table public.nutrition_prescription_items_v2
  add column if not exists household_label text,
  add column if not exists household_grams numeric;

comment on column public.nutrition_prescription_items_v2.household_label is
  'Medida casera CONGELADA desde el alimento al publicar («huevo», «taza»). Es display: '
  'la cantidad del item SIEMPRE queda en g/ml (unit nunca es «casera»). Par indivisible '
  'con household_grams. El drift posterior del catalogo no mueve el plan, igual que los snapshot_*.';
comment on column public.nutrition_prescription_items_v2.household_grams is
  'Gramos que pesa una unidad de household_label, CONGELADOS al publicar. Sirven para '
  'rehidratar el editor en modo casera (cuenta = quantity / household_grams) y para rotular '
  '«2 huevos (122 g)» sin volver al catalogo. Par indivisible con household_label.';

-- Los CHECKs se agregan protegidos por pg_constraint (no existe `add constraint if not
-- exists`). Las columnas nacen 100 % NULL en esta misma migracion, asi que el escaneo del
-- ALTER no puede fallar ni encontrar trabajo: no hace falta `not valid` aca.
do $chk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_prescription_items_v2'
      and c.conname = 'nutrition_prescription_items_v2_household_grams_range'
  ) then
    alter table public.nutrition_prescription_items_v2
      add constraint nutrition_prescription_items_v2_household_grams_range
      check (household_grams is null or (household_grams >= 1 and household_grams <= 1000));
  end if;
end;
$chk$;

do $chk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_prescription_items_v2'
      and c.conname = 'nutrition_prescription_items_v2_household_pair'
  ) then
    alter table public.nutrition_prescription_items_v2
      add constraint nutrition_prescription_items_v2_household_pair
      check ((household_label is null) = (household_grams is null));
  end if;
end;
$chk$;

-- ── a2) El cierre real: `casera` nunca se persiste como unidad ───────────────
--    NOT VALID + VALIDATE: el ALTER no escanea (lock corto) y el VALIDATE toma
--    SHARE UPDATE EXCLUSIVE. Pre-check Q2 en LIVE: 0 filas con unit = 'casera'.
do $chk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_prescription_items_v2'
      and c.conname = 'nutrition_prescription_items_v2_unit_not_casera'
  ) then
    alter table public.nutrition_prescription_items_v2
      add constraint nutrition_prescription_items_v2_unit_not_casera
      check (lower(btrim(unit)) <> 'casera')
      not valid;
  end if;
end;
$chk$;

do $chk$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_prescription_items_v2'
      and c.conname = 'nutrition_prescription_items_v2_unit_not_casera'
      and not c.convalidated
  ) then
    alter table public.nutrition_prescription_items_v2
      validate constraint nutrition_prescription_items_v2_unit_not_casera;
  end if;
end;
$chk$;

-- ── a3) Rango de la medida casera en el catalogo ─────────────────────────────
--    foods.household_grams existe desde 20260618180000:13 SIN cota. `foodUnitOptions`
--    solo ofrece `casera` con hg ∈ [1, 1000] (SPEC §5.2); el CHECK evita que un
--    alimento nuevo entre fuera de rango y termine congelando un item invalido.
--    Pre-check Q1 en LIVE: 0 filas fuera de rango.
do $chk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'foods'
      and c.conname = 'foods_household_grams_range'
  ) then
    alter table public.foods
      add constraint foods_household_grams_range
      check (household_grams is null or household_grams between 1 and 1000)
      not valid;
  end if;
end;
$chk$;

do $chk$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'foods'
      and c.conname = 'foods_household_grams_range'
      and not c.convalidated
  ) then
    alter table public.foods validate constraint foods_household_grams_range;
  end if;
end;
$chk$;

-- ── R4) Mismo rango en los overrides del coach ───────────────────────────────
--    `cfo_household_grams_positive` (20260807220000:82) solo exige > 0, y el override
--    GANA sobre el catalogo al congelar (resolveFoodMacros,
--    packages/nutrition-v2/food-overrides.ts:163-183; espejo SQL
--    private.food_catalog_v2_item_json, 20260807223000:83-88). Sin esta cota, un
--    override con hg = 5000 congelaria un item que el CHECK de a1 rechaza y la
--    publicacion entera moriria con un 23514 opaco (auditoria §4 R4/R13).
--    Pre-check Q1b en LIVE: 0 filas fuera de rango.
do $chk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'coach_food_overrides'
      and c.conname = 'cfo_household_grams_range'
  ) then
    alter table public.coach_food_overrides
      add constraint cfo_household_grams_range
      check (household_grams is null or household_grams between 1 and 1000)
      not valid;
  end if;
end;
$chk$;

do $chk$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'coach_food_overrides'
      and c.conname = 'cfo_household_grams_range'
      and not c.convalidated
  ) then
    alter table public.coach_food_overrides validate constraint cfo_household_grams_range;
  end if;
end;
$chk$;

-- ============================================================================
-- a4) persist_and_publish_nutrition_plan_v2 — cuerpo VERBATIM de
--     20260728140000_nutrition_v2_persist_and_publish_transactional.sql
--     (ultima definicion viva). UNICO cambio: `household_label` / `household_grams`
--     en la lista de columnas y en los values del INSERT de items (:396-441).
--     Sin herencia server-side del par por `id`: el builder genera ids nuevos en
--     cada publicacion, asi que no habria a quien heredarle (decision R2, SPEC §5.7 —
--     una build RN vieja que republica deja la fila en gramos honestos, sin rotulo).
-- ============================================================================

create or replace function public.persist_and_publish_nutrition_plan_v2(
  p_draft jsonb,
  p_effective_from date,
  p_idempotency_key text,
  p_expected_current_version_id uuid default null,
  p_plan_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_client public.clients%rowtype;
  v_name text;
  v_strategy text;
  v_timezone text;
  v_permissions jsonb;
  v_variants jsonb;
  v_plan_id uuid;
  v_version_id uuid;
  v_version_number integer;
  v_current_version_id uuid;
  v_existing_version_id uuid;
  v_existing_plan_id uuid;
  v_reused_root boolean := false;
  v_published_id uuid;
  v_variant jsonb;
  v_slot jsonb;
  v_item jsonb;
  v_sub jsonb;
  v_target jsonb;
  v_variant_id uuid;
  v_slot_id uuid;
  v_item_id uuid;
begin
  -- ── 1) Autenticacion + forma del payload ──────────────────────────────────
  if v_actor is null then
    raise exception 'nutrition_v2_auth_required' using errcode = '42501';
  end if;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'nutrition_v2_persist_invalid_draft' using errcode = '22023';
  end if;

  v_client_id := nullif(btrim(coalesce(p_draft ->> 'clientId', '')), '')::uuid;
  if v_client_id is null then
    raise exception 'nutrition_v2_persist_invalid_draft' using errcode = '22023';
  end if;

  v_name := btrim(coalesce(p_draft ->> 'name', ''));
  if char_length(v_name) not between 1 and 180 then
    raise exception 'nutrition_v2_persist_invalid_draft' using errcode = '22023';
  end if;

  v_strategy := nullif(btrim(coalesce(p_draft ->> 'strategy', '')), '');
  if v_strategy is null or v_strategy not in ('structured', 'flexible', 'hybrid') then
    raise exception 'nutrition_v2_persist_invalid_draft' using errcode = '22023';
  end if;

  v_timezone := coalesce(nullif(btrim(coalesce(p_draft ->> 'timezone', '')), ''), 'America/Santiago');

  v_permissions := coalesce(p_draft -> 'permissions', '{}'::jsonb);
  if jsonb_typeof(v_permissions) <> 'object' then
    v_permissions := '{}'::jsonb;
  end if;

  v_variants := coalesce(p_draft -> 'variants', '[]'::jsonb);
  if jsonb_typeof(v_variants) <> 'array' or jsonb_array_length(v_variants) = 0 then
    -- Mismo mensaje que el publish para que el mapeo de errores del cliente no se bifurque.
    raise exception 'nutrition_v2_publish_requires_variant' using errcode = '22023';
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'nutrition_v2_invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_effective_from is null then
    raise exception 'nutrition_v2_effective_date_required' using errcode = '22023';
  end if;

  -- ── 2) Scope: el MISMO predicado de la RLS, verificado a mano (definer) ────
  if not private.nutrition_v2_can_manage_client(v_client_id) then
    raise exception 'nutrition_v2_persist_scope_denied' using errcode = '42501';
  end if;

  select * into v_client from public.clients c where c.id = v_client_id;
  if v_client.id is null then
    raise exception 'nutrition_v2_persist_client_not_found' using errcode = 'P0002';
  end if;

  -- ── 3) Idempotencia total: la misma clave nunca produce una segunda version ─
  --    Acotada al alumno (no filtra existencia de claves de otros pools). Corre ANTES de
  --    cualquier escritura y ANTES del CAS: un reintento de algo YA aplicado devuelve el
  --    resultado previo y jamas puede fallar stale contra si mismo.
  select v.id, v.plan_id into v_existing_version_id, v_existing_plan_id
  from public.nutrition_plan_versions_v2 v
  join public.nutrition_plans_v2 p on p.id = v.plan_id
  where v.publish_idempotency_key = p_idempotency_key
    and p.client_id = v_client_id
  limit 1;
  if v_existing_version_id is not null then
    return jsonb_build_object(
      'versionId', v_existing_version_id,
      'planId', v_existing_plan_id,
      'reusedIdempotencyKey', true
    );
  end if;

  -- ── 4) Lock por ALUMNO ────────────────────────────────────────────────────
  --    El advisory cubre el caso "todavia no hay ninguna raiz" (dos publicaciones
  --    simultaneas creaban dos raices activas — NUT-004); el `for update` cubre las
  --    existentes y es el mismo lock que despues toma publish_nutrition_plan_v2.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nutrition_v2_plan:' || v_client_id::text, 0)
  );
  perform 1
  from public.nutrition_plans_v2 p
  where p.client_id = v_client_id
  for update;

  -- ── 5) Resolucion de la raiz ──────────────────────────────────────────────
  if p_plan_id is not null then
    -- Edicion / append explicito (builder con plan existente, quick-edit, assign).
    select p.id into v_plan_id
    from public.nutrition_plans_v2 p
    where p.id = p_plan_id
      and p.client_id = v_client_id;
    if v_plan_id is null then
      raise exception 'nutrition_v2_persist_plan_not_found' using errcode = 'P0002';
    end if;
  else
    -- Reuso de raiz HUERFANA — PORT LITERAL de `resolveReusableUnpublishedPlanId`: se mira
    -- el plan ACTIVO mas reciente del alumno y se reutiliza SOLO si todavia no tiene version
    -- publicada. Que el filtro `current_published_version_id is null` NO este en el WHERE es
    -- deliberado: mover el predicado ahi cambiaria la semantica (saltaria por encima de un
    -- plan vivo para reciclar uno huerfano mas viejo). Nunca se reutiliza un plan vivo: esa
    -- ruta va por `p_plan_id` explicito. `, p.id desc` solo agrega desempate determinista.
    select p.id into v_plan_id
    from public.nutrition_plans_v2 p
    where p.client_id = v_client_id
      and p.lifecycle_status = 'active'
      and p.current_published_version_id is null
      and p.id = (
        select p2.id
        from public.nutrition_plans_v2 p2
        where p2.client_id = v_client_id
          and p2.lifecycle_status = 'active'
        order by p2.updated_at desc, p2.id desc
        limit 1
      );

    if v_plan_id is not null then
      v_reused_root := true;
      -- Limpieza del arbol parcial que dejo el intento fallido anterior: las versiones
      -- `draft` sin publicar de ESA raiz se borran antes de reinsertar (el cascade se lleva
      -- variantes/franjas/items/reemplazos/porciones). Asi el hub deja de mostrar
      -- "borrador pendiente" fantasma y la numeracion no se dispara por basura.
      -- Solo alcanza drafts JAMAS publicados: published/superseded/archived quedan intactos.
      delete from public.nutrition_plan_versions_v2 v
      where v.plan_id = v_plan_id
        and v.status = 'draft'
        and v.published_at is null
        and v.publish_idempotency_key is null;
    else
      insert into public.nutrition_plans_v2 (
        client_id, coach_id, org_id, team_id, name, strategy, created_by, updated_by
      ) values (
        v_client_id, v_client.coach_id, v_client.org_id, v_client.team_id,
        v_name, v_strategy, v_actor, v_actor
      )
      returning id into v_plan_id;
    end if;
  end if;

  -- ── 6) CAS fail-fast (el autoritativo lo repite el publish, bajo su propio lock) ──
  if p_expected_current_version_id is not null then
    select v.id into v_current_version_id
    from public.nutrition_plan_versions_v2 v
    where v.plan_id = v_plan_id
      and v.status = 'published'
      and v.effective_to is null;
    if v_current_version_id is distinct from p_expected_current_version_id then
      raise exception 'nutrition_v2_publish_stale_base' using errcode = '22023';
    end if;
  end if;

  -- ── 7) Version nueva: numeracion EN SQL, bajo el lock ─────────────────────
  select coalesce(max(v.version_number), 0) + 1 into v_version_number
  from public.nutrition_plan_versions_v2 v
  where v.plan_id = v_plan_id;

  insert into public.nutrition_plan_versions_v2 (
    plan_id,
    version_number,
    status,
    strategy,
    timezone,
    student_permissions,
    visible_notes,
    protocol_notes,
    created_by,
    updated_by
  ) values (
    v_plan_id,
    v_version_number,
    'draft',
    v_strategy,
    v_timezone,
    v_permissions,
    p_draft ->> 'visibleNotes',
    p_draft ->> 'protocolNotes',
    v_actor,
    v_actor
  )
  returning id into v_version_id;

  -- ── 8) Arbol completo (variantes -> franjas -> items -> reemplazos / porciones) ──
  for v_variant in select value from jsonb_array_elements(v_variants)
  loop
    insert into public.nutrition_day_variants_v2 (
      version_id,
      variant_key,
      label,
      day_of_week,
      is_default,
      target_calories,
      target_protein_g,
      target_carbs_g,
      target_fats_g,
      target_fiber_g,
      target_sodium_mg,
      target_water_ml,
      order_index
    ) values (
      v_version_id,
      v_variant ->> 'variant_key',
      v_variant ->> 'label',
      nullif(v_variant ->> 'day_of_week', '')::smallint,
      coalesce((v_variant ->> 'is_default')::boolean, false),
      nullif(v_variant ->> 'target_calories', '')::numeric,
      nullif(v_variant ->> 'target_protein_g', '')::numeric,
      nullif(v_variant ->> 'target_carbs_g', '')::numeric,
      nullif(v_variant ->> 'target_fats_g', '')::numeric,
      nullif(v_variant ->> 'target_fiber_g', '')::numeric,
      nullif(v_variant ->> 'target_sodium_mg', '')::numeric,
      nullif(v_variant ->> 'target_water_ml', '')::numeric,
      coalesce(nullif(v_variant ->> 'order_index', '')::integer, 0)
    )
    returning id into v_variant_id;

    for v_slot in select value from jsonb_array_elements(
      case when jsonb_typeof(v_variant -> 'mealSlots') = 'array' then v_variant -> 'mealSlots' else '[]'::jsonb end
    )
    loop
      insert into public.nutrition_meal_slots_v2 (
        version_id,
        day_variant_id,
        slot_code,
        name,
        start_time,
        end_time,
        slot_mode,
        is_required,
        target_calories,
        target_protein_g,
        target_carbs_g,
        target_fats_g,
        instructions,
        order_index
      ) values (
        v_version_id,
        v_variant_id,
        v_slot ->> 'slot_code',
        v_slot ->> 'name',
        nullif(v_slot ->> 'start_time', '')::time,
        nullif(v_slot ->> 'end_time', '')::time,
        coalesce(nullif(v_slot ->> 'slot_mode', ''), 'anchor'),
        coalesce((v_slot ->> 'is_required')::boolean, false),
        nullif(v_slot ->> 'target_calories', '')::numeric,
        nullif(v_slot ->> 'target_protein_g', '')::numeric,
        nullif(v_slot ->> 'target_carbs_g', '')::numeric,
        nullif(v_slot ->> 'target_fats_g', '')::numeric,
        v_slot ->> 'instructions',
        coalesce(nullif(v_slot ->> 'order_index', '')::integer, 0)
      )
      returning id into v_slot_id;

      for v_item in select value from jsonb_array_elements(
        case when jsonb_typeof(v_slot -> 'items') = 'array' then v_slot -> 'items' else '[]'::jsonb end
      )
      loop
        -- El id viaja desde el llamador (igual que hoy) para poder colgar los reemplazos sin
        -- un RETURNING por item; si no viene, lo genera la base.
        v_item_id := coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid());

        insert into public.nutrition_prescription_items_v2 (
          id,
          version_id,
          meal_slot_id,
          food_id,
          recipe_id,
          custom_name,
          quantity,
          unit,
          -- [W2] Par casero congelado. `quantity`/`unit` YA llegan traducidos a g/ml por
          -- buildItemInsertRow (plan-draft-rows.ts): aca solo se copian las dos columnas.
          household_label,
          household_grams,
          minimum_quantity,
          maximum_quantity,
          is_optional,
          substitution_group_id,
          notes,
          order_index,
          snapshot_name,
          snapshot_brand,
          snapshot_calories,
          snapshot_protein_g,
          snapshot_carbs_g,
          snapshot_fats_g,
          snapshot_fiber_g
        ) values (
          v_item_id,
          v_version_id,
          v_slot_id,
          nullif(v_item ->> 'food_id', '')::uuid,
          nullif(v_item ->> 'recipe_id', '')::uuid,
          v_item ->> 'custom_name',
          nullif(v_item ->> 'quantity', '')::numeric,
          v_item ->> 'unit',
          v_item ->> 'household_label',
          nullif(v_item ->> 'household_grams', '')::numeric,
          nullif(v_item ->> 'minimum_quantity', '')::numeric,
          nullif(v_item ->> 'maximum_quantity', '')::numeric,
          coalesce((v_item ->> 'is_optional')::boolean, false),
          nullif(v_item ->> 'substitution_group_id', '')::uuid,
          v_item ->> 'notes',
          coalesce(nullif(v_item ->> 'order_index', '')::integer, 0),
          v_item ->> 'snapshot_name',
          v_item ->> 'snapshot_brand',
          nullif(v_item ->> 'snapshot_calories', '')::numeric,
          nullif(v_item ->> 'snapshot_protein_g', '')::numeric,
          nullif(v_item ->> 'snapshot_carbs_g', '')::numeric,
          nullif(v_item ->> 'snapshot_fats_g', '')::numeric,
          nullif(v_item ->> 'snapshot_fiber_g', '')::numeric
        );

        for v_sub in select value from jsonb_array_elements(
          case when jsonb_typeof(v_item -> 'substitutions') = 'array' then v_item -> 'substitutions' else '[]'::jsonb end
        )
        loop
          insert into public.nutrition_item_substitutions_v2 (
            version_id,
            prescription_item_id,
            food_id,
            recipe_id,
            custom_name,
            quantity,
            unit,
            order_index,
            snapshot_name,
            snapshot_brand,
            snapshot_calories,
            snapshot_protein_g,
            snapshot_carbs_g,
            snapshot_fats_g,
            snapshot_fiber_g
          ) values (
            v_version_id,
            v_item_id,
            nullif(v_sub ->> 'food_id', '')::uuid,
            nullif(v_sub ->> 'recipe_id', '')::uuid,
            v_sub ->> 'custom_name',
            nullif(v_sub ->> 'quantity', '')::numeric,
            v_sub ->> 'unit',
            coalesce(nullif(v_sub ->> 'order_index', '')::integer, 0),
            v_sub ->> 'snapshot_name',
            v_sub ->> 'snapshot_brand',
            nullif(v_sub ->> 'snapshot_calories', '')::numeric,
            nullif(v_sub ->> 'snapshot_protein_g', '')::numeric,
            nullif(v_sub ->> 'snapshot_carbs_g', '')::numeric,
            nullif(v_sub ->> 'snapshot_fats_g', '')::numeric,
            nullif(v_sub ->> 'snapshot_fiber_g', '')::numeric
          );
        end loop;
      end loop;

      for v_target in select value from jsonb_array_elements(
        case when jsonb_typeof(v_slot -> 'exchangeTargets') = 'array' then v_slot -> 'exchangeTargets' else '[]'::jsonb end
      )
      loop
        insert into public.nutrition_slot_exchange_targets_v2 (
          version_id,
          meal_slot_id,
          exchange_group_id,
          portions,
          notes,
          order_index,
          snapshot_group_code,
          snapshot_group_name,
          snapshot_ref_calories,
          snapshot_ref_protein_g,
          snapshot_ref_carbs_g,
          snapshot_ref_fats_g,
          snapshot_composed_of,
          snapshot_macros_confirmed
        ) values (
          v_version_id,
          v_slot_id,
          nullif(v_target ->> 'exchange_group_id', '')::uuid,
          nullif(v_target ->> 'portions', '')::numeric,
          v_target ->> 'notes',
          coalesce(nullif(v_target ->> 'order_index', '')::integer, 0),
          v_target ->> 'snapshot_group_code',
          v_target ->> 'snapshot_group_name',
          nullif(v_target ->> 'snapshot_ref_calories', '')::numeric,
          nullif(v_target ->> 'snapshot_ref_protein_g', '')::numeric,
          nullif(v_target ->> 'snapshot_ref_carbs_g', '')::numeric,
          nullif(v_target ->> 'snapshot_ref_fats_g', '')::numeric,
          -- JSON null -> SQL NULL (guardar 'null'::jsonb rompería el read-model de porciones).
          nullif(v_target -> 'snapshot_composed_of', 'null'::jsonb),
          (v_target ->> 'snapshot_macros_confirmed')::boolean
        );
      end loop;
    end loop;
  end loop;

  -- ── 9) Publish delegado (INTACTO: supersede intra-dia + CAS + auditoria + rederive) ──
  v_published_id := public.publish_nutrition_plan_v2(
    v_version_id,
    p_effective_from,
    p_idempotency_key,
    p_expected_current_version_id
  );

  return jsonb_build_object(
    'versionId', v_published_id,
    'planId', v_plan_id,
    'versionNumber', v_version_number,
    'reusedRoot', v_reused_root,
    'reusedIdempotencyKey', false
  );
end;
$$;

revoke all on function public.persist_and_publish_nutrition_plan_v2(jsonb, date, text, uuid, uuid)
  from public, anon;

grant execute on function public.persist_and_publish_nutrition_plan_v2(jsonb, date, text, uuid, uuid)
  to authenticated;

comment on function public.persist_and_publish_nutrition_plan_v2(jsonb, date, text, uuid, uuid) is
  'Persiste el arbol completo de un plan V2 (raiz -> version -> variantes -> franjas -> items '
  '-> reemplazos -> porciones) y lo publica en UNA sola transaccion (NUT-011). Lock por alumno '
  '(advisory + for update), version_number = max+1 en SQL, reuso + limpieza de la raiz huerfana, '
  'CAS opcional e idempotencia por clave. Los snapshot_* llegan congelados por el llamador '
  'server-side (el freeze depende de lecturas RLS-scoped de foods/exchange_groups). Delega el '
  'publish en publish_nutrition_plan_v2. W2: congela household_label/household_grams del item '
  '(la cantidad SIEMPRE llega en g/ml; unit = «casera» lo rechaza el CHECK de la tabla).';

-- ============================================================================
-- a5) private.nutrition_v2_build_prescription_snapshot — cuerpo VERBATIM de
--     20260718140000_nutrition_portions_v2.sql:497-612 (ultima definicion viva).
--     UNICO cambio: 'householdLabel' / 'householdGrams' en el objeto del item.
--     El snapshot del dia es la verdad congelada, asi que el par viaja gratis a
--     get_nutrition_today_v2 (copia el item verbatim, 20260720120000:402-412).
-- ============================================================================

create or replace function private.nutrition_v2_build_prescription_snapshot(
  p_version_id uuid,
  p_variant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', jsonb_build_object(
      'id', v.id,
      'number', v.version_number,
      'strategy', v.strategy,
      'effectiveFrom', v.effective_from,
      'timezone', v.timezone
    ),
    'variant', case
      when dv.id is null then null
      else jsonb_build_object(
        'id', dv.id,
        'key', dv.variant_key,
        'label', dv.label,
        'dayOfWeek', dv.day_of_week,
        'isDefault', dv.is_default,
        'targets', jsonb_build_object(
          'calories', dv.target_calories,
          'proteinG', dv.target_protein_g,
          'carbsG', dv.target_carbs_g,
          'fatsG', dv.target_fats_g,
          'fiberG', dv.target_fiber_g,
          'sodiumMg', dv.target_sodium_mg,
          'waterMl', dv.target_water_ml
        )
      )
    end,
    'mealSlots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ms.id,
          'code', ms.slot_code,
          'name', ms.name,
          'startTime', case when ms.start_time is null then null else to_char(ms.start_time, 'HH24:MI') end,
          'endTime', case when ms.end_time is null then null else to_char(ms.end_time, 'HH24:MI') end,
          'mode', ms.slot_mode,
          'required', ms.is_required,
          'instructions', ms.instructions,
          'targets', jsonb_build_object(
            'calories', ms.target_calories,
            'proteinG', ms.target_protein_g,
            'carbsG', ms.target_carbs_g,
            'fatsG', ms.target_fats_g
          ),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', pi.id,
                'foodId', pi.food_id,
                'recipeId', pi.recipe_id,
                'name', coalesce(pi.snapshot_name, pi.custom_name),
                'brand', pi.snapshot_brand,
                'quantity', pi.quantity,
                'unit', pi.unit,
                -- [W2] Medida casera congelada en el item: la UI rotula «2 huevos (122 g)»
                -- sin volver al catalogo. Claves SIEMPRE presentes (null cuando no hay par);
                -- NutritionPrescriptionItemReadSchema las declara .nullable().optional().
                'householdLabel', pi.household_label,
                'householdGrams', pi.household_grams,
                'minimumQuantity', pi.minimum_quantity,
                'maximumQuantity', pi.maximum_quantity,
                'optional', pi.is_optional,
                'substitutionGroupId', pi.substitution_group_id,
                'notes', pi.notes,
                'macros', jsonb_build_object(
                  'calories', pi.snapshot_calories,
                  'proteinG', pi.snapshot_protein_g,
                  'carbsG', pi.snapshot_carbs_g,
                  'fatsG', pi.snapshot_fats_g,
                  'fiberG', pi.snapshot_fiber_g
                )
              ) order by pi.order_index, pi.created_at
            )
            from public.nutrition_prescription_items_v2 pi
            where pi.meal_slot_id = ms.id
          ), '[]'::jsonb),
          -- Capa de porciones: targets congelados de la franja. Ref y composedOf
          -- enriquecido salen de los snapshot_* (nunca del catalogo vivo).
          'exchangeTargets', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', et.id,
                'exchangeGroupId', et.exchange_group_id,
                'code', et.snapshot_group_code,
                'name', et.snapshot_group_name,
                'portions', et.portions,
                'notes', et.notes,
                'macrosConfirmed', et.snapshot_macros_confirmed,
                'ref', jsonb_build_object(
                  'calories', et.snapshot_ref_calories,
                  'proteinG', et.snapshot_ref_protein_g,
                  'carbsG', et.snapshot_ref_carbs_g,
                  'fatsG', et.snapshot_ref_fats_g
                ),
                'composedOf', et.snapshot_composed_of
              ) order by et.order_index, et.created_at
            )
            from public.nutrition_slot_exchange_targets_v2 et
            where et.meal_slot_id = ms.id
          ), '[]'::jsonb)
        ) order by ms.order_index, ms.created_at
      )
      from public.nutrition_meal_slots_v2 ms
      where ms.day_variant_id = dv.id
    ), '[]'::jsonb)
  )
  from public.nutrition_plan_versions_v2 v
  left join public.nutrition_day_variants_v2 dv
    on dv.id = p_variant_id
   and dv.version_id = v.id
  where v.id = p_version_id;
$$;

-- Firma identica => sin drop; grants ya vigentes (20260714190500). Re-asercion
-- idempotente del privilegio (funcion privada, solo owner/definer).
revoke all on function private.nutrition_v2_build_prescription_snapshot(uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- a6) public.get_nutrition_plan_read_v2 — cuerpo VERBATIM de
--     20260902220850_nutrition_v2_plan_read_substitutions.sql (ultima definicion
--     viva). UNICO cambio: 'householdLabel' / 'householdGrams' en prescriptionItems.
--     Los REEMPLAZOS no lo llevan a proposito: su unidad la resuelve
--     substituteNaturalUnit (packages/nutrition-v2/substitution-intake.ts:141-144)
--     y nunca es casera (auditoria §3.d fila d3).
-- ============================================================================

create or replace function public.get_nutrition_plan_read_v2(
  p_client_id uuid,
  p_as_of_date date,
  p_timezone text default 'America/Santiago'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.nutrition_plans_v2%rowtype;
  v_version public.nutrition_plan_versions_v2%rowtype;
  v_variants jsonb := '[]'::jsonb;
  v_plan_summary jsonb;
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_plan_read_scope_denied' using errcode = '42501';
  end if;
  if p_as_of_date is null or p_timezone is null or char_length(p_timezone) not between 1 and 80 then
    raise exception 'nutrition_v2_plan_read_invalid_input' using errcode = '22023';
  end if;

  select v.* into v_version
  from public.nutrition_plan_versions_v2 v
  join public.nutrition_plans_v2 p on p.id = v.plan_id
  where p.client_id = p_client_id
    and p.lifecycle_status = 'active'
    and v.status in ('published', 'superseded')
    and v.effective_from <= p_as_of_date
    and (v.effective_to is null or v.effective_to >= p_as_of_date)
  order by v.effective_from desc, v.published_at desc nulls last, v.version_number desc, v.id desc
  limit 1;

  if v_version.id is null then
    return jsonb_build_object(
      'schemaVersion', 1,
      'generatedAt', now(),
      'asOfDate', p_as_of_date,
      'timezone', p_timezone,
      'plan', null,
      'visibleNotes', null,
      'protocolNotes', null,
      'permissions', private.nutrition_v2_default_permissions(),
      'dayVariants', '[]'::jsonb,
      'syncToken', md5(concat_ws(':', p_client_id::text, p_as_of_date::text, 'empty'))
    );
  end if;

  select p.* into v_plan
  from public.nutrition_plans_v2 p
  where p.id = v_version.plan_id;

  v_plan_summary := jsonb_build_object(
    'id', v_plan.id,
    'name', v_plan.name,
    'strategy', v_version.strategy,
    'versionId', v_version.id,
    'versionNumber', v_version.version_number,
    'status', v_version.status,
    'effectiveFrom', v_version.effective_from,
    'effectiveTo', v_version.effective_to
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', dv.id,
      'key', dv.variant_key,
      'label', dv.label,
      'dayOfWeek', dv.day_of_week,
      'isDefault', dv.is_default,
      'targets', private.nutrition_v2_targets_json(
        dv.target_calories,
        dv.target_protein_g,
        dv.target_carbs_g,
        dv.target_fats_g,
        dv.target_fiber_g,
        dv.target_sodium_mg,
        dv.target_water_ml
      ),
      'mealSlots', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ms.id,
            'code', ms.slot_code,
            'name', ms.name,
            'startTime', case when ms.start_time is null then null else to_char(ms.start_time, 'HH24:MI') end,
            'endTime', case when ms.end_time is null then null else to_char(ms.end_time, 'HH24:MI') end,
            'mode', ms.slot_mode,
            'required', ms.is_required,
            'instructions', ms.instructions,
            'targets', private.nutrition_v2_targets_json(
              ms.target_calories,
              ms.target_protein_g,
              ms.target_carbs_g,
              ms.target_fats_g,
              null,
              null,
              null
            ),
            'prescriptionItems', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', pi.id,
                  'foodId', pi.food_id,
                  'recipeId', pi.recipe_id,
                  'name', coalesce(pi.snapshot_name, pi.custom_name),
                  'brand', pi.snapshot_brand,
                  'quantity', pi.quantity,
                  'unit', pi.unit,
                  -- [W2] Medida casera congelada en el item (misma clave y semantica que en
                  -- el snapshot del dia, a5). Solo display: la cantidad ya esta en g/ml.
                  'householdLabel', pi.household_label,
                  'householdGrams', pi.household_grams,
                  'minimumQuantity', pi.minimum_quantity,
                  'maximumQuantity', pi.maximum_quantity,
                  'optional', pi.is_optional,
                  'substitutionGroupId', pi.substitution_group_id,
                  'notes', pi.notes,
                  -- [media/category] resueltos en lectura por pi.food_id (null-safe:
                  -- food custom => media/category null).
                  'media', private.food_catalog_v2_media_json(pi.food_id),
                  'category', (select f.category from public.foods f where f.id = pi.food_id),
                  'macros', jsonb_build_object(
                    'calories', pi.snapshot_calories,
                    'proteinG', pi.snapshot_protein_g,
                    'carbsG', pi.snapshot_carbs_g,
                    'fatsG', pi.snapshot_fats_g,
                    'fiberG', pi.snapshot_fiber_g
                  ),
                  -- [substitutions] reemplazos autorizados por el coach (F-02) en la MISMA
                  -- lectura: hasta aqui web y RN hacian un select extra RLS-scoped por version
                  -- sobre nutrition_item_substitutions_v2. Mismo contrato que
                  -- NutritionItemSubstitutionReadSchema (packages/nutrition-v2/read-models.ts).
                  -- SIEMPRE presente (array vacio si no hay filas) para que el cliente distinga
                  -- "RPC nuevo sin reemplazos" ([]) de "RPC viejo" (clave ausente => fallback).
                  'substitutions', coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', s.id,
                        'prescriptionItemId', s.prescription_item_id,
                        'foodId', s.food_id,
                        'recipeId', s.recipe_id,
                        'name', coalesce(s.snapshot_name, s.custom_name, 'Reemplazo'),
                        'brand', s.snapshot_brand,
                        'quantity', s.quantity,
                        'unit', s.unit,
                        'macros', jsonb_build_object(
                          'calories', s.snapshot_calories,
                          'proteinG', s.snapshot_protein_g,
                          'carbsG', s.snapshot_carbs_g,
                          'fatsG', s.snapshot_fats_g,
                          'fiberG', s.snapshot_fiber_g
                        )
                      ) order by s.order_index, s.created_at
                    )
                    from public.nutrition_item_substitutions_v2 s
                    where s.prescription_item_id = pi.id
                  ), '[]'::jsonb)
                ) order by pi.order_index, pi.created_at
              )
              from public.nutrition_prescription_items_v2 pi
              where pi.meal_slot_id = ms.id
            ), '[]'::jsonb)
          )
          -- Capa de porciones (T2.0 fix 2): 'exchangeTargets' SOLO si la franja tiene
          -- filas (espejo de v_has_portions del Today). Plan sin porciones => cero llaves
          -- nuevas => byte-identico (Q1). Mapeo READ igual al Today pero SIN cobertura y
          -- con orderIndex = et.order_index (aqui SI existe la columna, no posicional).
          || case when exists (
               select 1
               from public.nutrition_slot_exchange_targets_v2 et
               where et.meal_slot_id = ms.id
             ) then jsonb_build_object(
               'exchangeTargets', coalesce((
                 select jsonb_agg(
                   jsonb_build_object(
                     'id', et.id,
                     'exchangeGroupId', et.exchange_group_id,
                     'groupCode', et.snapshot_group_code,
                     'groupName', et.snapshot_group_name,
                     'color', null,
                     'portions', et.portions,
                     'notes', et.notes,
                     'orderIndex', et.order_index,
                     'ref', jsonb_build_object(
                       'calories', et.snapshot_ref_calories,
                       'proteinG', et.snapshot_ref_protein_g,
                       'carbsG', et.snapshot_ref_carbs_g,
                       'fatsG', et.snapshot_ref_fats_g
                     ),
                     'composedOf', et.snapshot_composed_of,
                     'macrosConfirmed', coalesce(et.snapshot_macros_confirmed, false)
                   ) order by et.order_index, et.created_at
                 )
                 from public.nutrition_slot_exchange_targets_v2 et
                 where et.meal_slot_id = ms.id
               ), '[]'::jsonb)
             ) else '{}'::jsonb end
          order by ms.order_index, ms.created_at
        )
        from public.nutrition_meal_slots_v2 ms
        where ms.day_variant_id = dv.id
      ), '[]'::jsonb)
    ) order by dv.order_index, dv.created_at
  ), '[]'::jsonb)
  into v_variants
  from public.nutrition_day_variants_v2 dv
  where dv.version_id = v_version.id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'asOfDate', p_as_of_date,
    'timezone', p_timezone,
    'plan', v_plan_summary,
    'visibleNotes', v_version.visible_notes,
    'protocolNotes', v_version.protocol_notes,
    'permissions', private.nutrition_v2_default_permissions()
      || coalesce(v_version.student_permissions, '{}'::jsonb),
    'dayVariants', v_variants,
    'syncToken', md5(concat_ws(':',
      v_version.id::text,
      v_version.lock_version::text,
      v_version.updated_at::text
    ))
  );
end;
$$;

revoke all on function public.get_nutrition_plan_read_v2(uuid, date, text) from public, anon;
grant execute on function public.get_nutrition_plan_read_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_plan_read_v2(uuid, date, text) is
  'One-request immutable plan read model effective on a local date. exchangeTargets '
  'por franja presente solo si el plan tiene targets de porciones (Q1 byte-identico). '
  'Items prescritos incluyen media/category resueltos por food_id en lectura, su medida '
  'casera congelada (householdLabel/householdGrams, W2) y sus reemplazos autorizados '
  '(substitutions, siempre array). El selector de version desempata de forma '
  'determinista (effective_from, published_at, version_number, id) — NUT-004.';

-- ============================================================================
-- a7) private.nutrition_v2_intake_item_json — cuerpo VERBATIM de
--     20260728120000_nutrition_v2_macros_basis.sql:159-219 (ultima definicion viva).
--     UNICO cambio: 'householdLabel' / 'householdGrams' resueltos en LECTURA desde
--     el item prescrito del registro (subselect null-safe por prescription_item_id,
--     exactamente el patron de 'category'). El registro LIBRE no tiene item prescrito
--     => par null: limitacion declarada (SPEC §5.3, auditoria §2 «donde el par NO llega»).
--     `totals` y las claves condicionales de porciones quedan INTACTAS.
-- ============================================================================

create or replace function private.nutrition_v2_intake_item_json(
  p_entry public.nutrition_intake_entries
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_entry.id,
    'foodId', p_entry.food_id,
    'customName', p_entry.custom_name,
    'quantity', p_entry.quantity,
    'unit', p_entry.unit,
    -- [W2] Medida casera del ITEM PRESCRITO al que apunta el registro (null-safe: sin
    -- prescription_item_id o item borrado => null). Se resuelve en LECTURA, igual que
    -- media/category: el snapshot congelado de la entry no se toca.
    'householdLabel', (
      select pi.household_label
      from public.nutrition_prescription_items_v2 pi
      where pi.id = p_entry.prescription_item_id
    ),
    'householdGrams', (
      select pi.household_grams
      from public.nutrition_prescription_items_v2 pi
      where pi.id = p_entry.prescription_item_id
    ),
    'mealSlot', coalesce(p_entry.meal_slot_v2, p_entry.meal_slot),
    'source', coalesce(p_entry.intake_source_v2, p_entry.source),
    'captureMethod', coalesce(p_entry.capture_method_v2, p_entry.capture_method),
    'occurredAt', coalesce(p_entry.occurred_at, p_entry.created_at),
    'status', p_entry.entry_status,
    'revision', p_entry.revision,
    'correctsEntryId', p_entry.corrects_entry_id,
    'prescriptionItemId', p_entry.prescription_item_id,
    -- [media/category] resueltos en lectura por food_id (null-safe: food custom => null).
    'media', private.food_catalog_v2_media_json(p_entry.food_id),
    'category', (select f.category from public.foods f where f.id = p_entry.food_id),
    'snapshot', jsonb_build_object(
      'name', coalesce(p_entry.snapshot_name, p_entry.custom_name, 'Alimento'),
      'brand', p_entry.snapshot_brand,
      'calories', p_entry.snapshot_calories,
      'proteinG', p_entry.snapshot_protein_g,
      'carbsG', p_entry.snapshot_carbs_g,
      'fatsG', p_entry.snapshot_fats_g,
      'fiberG', p_entry.snapshot_fiber_g,
      'servingSize', p_entry.snapshot_serving_size,
      'servingUnit', p_entry.snapshot_serving_unit,
      -- Base de escala congelada al registrar (NULL = fila legado, formula vieja).
      -- Imprescindible en lectura: buildCorrectionPayload la propaga para que una
      -- correccion no degrade la fila nueva a la formula legado.
      'macrosBasis', p_entry.snapshot_macros_basis
    ),
    'totals', jsonb_build_object(
      'calories', round(coalesce(p_entry.snapshot_calories, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'proteinG', round(coalesce(p_entry.snapshot_protein_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'carbsG', round(coalesce(p_entry.snapshot_carbs_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'fatsG', round(coalesce(p_entry.snapshot_fats_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'fiberG', round(coalesce(p_entry.snapshot_fiber_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1)
    )
  )
  -- Porciones (SPEC R4, Q1 byte-identico): las llaves exchangeGroupCode/exchangePortions
  -- se AGREGAN condicionalmente, SOLO cuando el intake las trae (sintetico de marcar-
  -- porcion: codigo de grupo congelado + porciones marcadas). Un intake real tiene ambas
  -- null => el objeto queda SIN esas llaves. NutritionIntakeReadItemSchema
  -- las declara .optional().nullable() => ambas formas (ausente / presente) parsean.
  || case
       when p_entry.exchange_group_code is not null or p_entry.exchange_portions is not null
         then jsonb_build_object(
           'exchangeGroupCode', p_entry.exchange_group_code,
           'exchangePortions', p_entry.exchange_portions
         )
       else '{}'::jsonb
     end;
$$;

revoke all on function private.nutrition_v2_intake_item_json(public.nutrition_intake_entries)
  from public, anon, authenticated;

-- ============================================================================
-- ROLLBACK MANUAL (una pasada — NO se aplica en el build; referencia de operacion).
-- Las COLUMNAS se dejan (aditivas, nullable, sin costo; borrarlas perderia el par
-- congelado de los planes ya publicados con W2). Solo se sueltan los CHECKs y se
-- re-aplican las cuatro funciones desde su definicion previa:
--
--   alter table public.nutrition_prescription_items_v2
--     drop constraint if exists nutrition_prescription_items_v2_unit_not_casera;
--   alter table public.nutrition_prescription_items_v2
--     drop constraint if exists nutrition_prescription_items_v2_household_pair;
--   alter table public.nutrition_prescription_items_v2
--     drop constraint if exists nutrition_prescription_items_v2_household_grams_range;
--   alter table public.foods
--     drop constraint if exists foods_household_grams_range;
--   alter table public.coach_food_overrides
--     drop constraint if exists cfo_household_grams_range;
--
--   -- a4: re-aplicar 20260728140000_nutrition_v2_persist_and_publish_transactional.sql
--   -- a5: re-aplicar 20260718140000_nutrition_portions_v2.sql (bloque 4)
--   -- a6: re-aplicar 20260902220850_nutrition_v2_plan_read_substitutions.sql
--   -- a7: re-aplicar 20260728120000_nutrition_v2_macros_basis.sql (bloque 4)
--
--   -- y regenerar apps/web/src/lib/database.types.ts.
-- ============================================================================
