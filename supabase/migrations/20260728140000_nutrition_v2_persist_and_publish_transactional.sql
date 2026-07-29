-- ============================================================================
-- EVA Nutricion V2 — NUT-011: persistir + publicar un plan en UNA transaccion
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G3): `persistAndPublishDraft`
-- (apps/web/.../nutrition-v2/_actions/plan-persistence.ts) escribia el arbol del plan en
-- llamadas PostgREST SEPARADAS — plan -> version -> por variante: variante -> por franja:
-- franja -> items -> reemplazos -> porciones -> y recien al final el RPC
-- `publish_nutrition_plan_v2`. Un plan de 7 variantes x 5 franjas x 4 items son >100
-- round-trips sin transaccion. Consecuencias verificadas:
--   · cualquier fallo intermedio (red, 42501, timeout) dejaba una version `draft` con arbol
--     PARCIAL colgando para siempre — el hub la cuenta y muestra "borrador pendiente"
--     fantasma (20260716120000:92-96,241-244);
--   · `version_number` se calculaba en JS con `max+1` SIN lock: dos publicaciones
--     concurrentes sobre la misma raiz calculaban el mismo numero y la perdedora moria en
--     el unique `(plan_id, version_number)` con un WRITE_FAILED opaco;
--   · el reuso de raiz huerfana (`resolveReusableUnpublishedPlanId`) evitaba acumular
--     PLANES, pero no limpiaba la version draft ni su arbol parcial.
--
-- Esta funcion mueve TODO el bloque a una sola invocacion: o queda el plan completo
-- publicado, o no queda nada (la funcion corre en la transaccion implicita del statement;
-- cualquier excepcion revierte hasta el INSERT del plan).
--
-- ── QUE VIAJA EN `p_draft` Y QUE SE RESUELVE AQUI (decision deliberada) ─────────
-- El payload llega con el arbol YA CONGELADO: cada item / reemplazo / target de porciones
-- trae sus `snapshot_*` calculados por el llamador server-side, con los MISMOS builders
-- puros que hoy alimentan a PostgREST (`draft-builder.ts`: buildItemInsertRow,
-- buildItemSubstitutionInsertRow, buildExchangeTargetInsertRow). El freeze NO se movio aca
-- a proposito, por dos razones duras:
--   1. SEGURIDAD: hoy `foods` y `exchange_groups` se leen con el cliente RLS-scoped del
--      coach (un alimento privado de otro coach NO resuelve y el item queda con snapshot
--      NULL; un grupo soft-borrado falla explicito). Resolverlos aca, en SECURITY DEFINER,
--      BYPASSEARIA esas policies — habria que reimplementar `foods_select` y `xg_select`
--      dentro de la funcion, que es exactamente el tipo de duplicacion que produce drift.
--   2. FIDELIDAD: las macros congeladas salen de `calculateFoodItemMacros`
--      (@eva/nutrition-engine) con aritmetica IEEE-754 y `Math.round(x*10)/10`. Reescribirla
--      con `numeric` cambiaria decimos en casos borde entre el preview del builder y lo
--      persistido. El motor sigue siendo uno solo.
-- Consecuencia de superficie: un coach podria forjar `snapshot_*` llamando esta RPC a mano.
-- NO es superficie nueva: hoy `authenticated` tiene INSERT directo sobre esas mismas tablas
-- (20260714190500:1123-1127, 20260718140000:85, 20260721150000:76) con las mismas policies
-- por `can_edit_version`, asi que el forjado ya era posible sin pasar por aca.
--
-- Forma de `p_draft` (envelope camelCase; las FILAS hoja usan los NOMBRES DE COLUMNA reales
-- porque las emite verbatim el builder puro compartido):
--   {
--     "clientId": uuid, "name": text, "strategy": text, "timezone": text,
--     "permissions": {...}, "visibleNotes": text|null, "protocolNotes": text|null,
--     "variants": [ { variant_key,label,day_of_week,is_default,target_*,order_index,
--       "mealSlots": [ { slot_code,name,start_time,end_time,slot_mode,is_required,target_*,
--         instructions,order_index,
--         "items": [ { id?,food_id,recipe_id,custom_name,quantity,unit,minimum_quantity,
--           maximum_quantity,is_optional,substitution_group_id,notes,order_index,snapshot_*,
--           "substitutions": [ { food_id,recipe_id,custom_name,quantity,unit,order_index,
--             snapshot_* } ] } ],
--         "exchangeTargets": [ { exchange_group_id,portions,notes,order_index,
--           snapshot_group_code,snapshot_group_name,snapshot_ref_*,snapshot_composed_of,
--           snapshot_macros_confirmed } ] } ] } ]
--   }
-- `privateNotes` NO existe en el envelope (NUT-007): la columna same-row esta deprecada e
-- ilegible para `authenticated`, y ahora ni siquiera es alcanzable desde este camino.
--
-- ── AUTORIZACION ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER (necesario: el DELETE de drafts huerfanos no tiene grant para
-- `authenticated` sobre `nutrition_plan_versions_v2`, y el arbol se escribe en una sola
-- transaccion sin depender del orden de evaluacion de N policies). Por eso re-verifica
-- EXPLICITAMENTE lo que la RLS verificaba fila por fila:
--   · `auth.uid()` presente;
--   · `private.nutrition_v2_can_manage_client(clientId)` — mismo predicado de
--     `nutrition_plans_v2_insert` / `can_edit_version`;
--   · la raiz indicada (`p_plan_id`) pertenece al alumno;
--   · el scope del plan nuevo (coach_id/org_id/team_id) se COPIA de `public.clients`, no del
--     payload — `plan_scope_matches_client` se cumple por construccion;
--   · `created_by`/`updated_by` = `auth.uid()` (NUT-034: nunca del payload).
-- El gate comercial (Nutricion Pro) y el rollout NO viven aca: los aplica el llamador
-- (server action web / endpoint movil) ANTES, igual que hoy.
--
-- ── ATOMICIDAD / CONCURRENCIA ───────────────────────────────────────────────────
--   · `pg_advisory_xact_lock` por alumno: serializa dos publicaciones del mismo alumno
--     INCLUSO cuando todavia no existe ninguna fila de plan que bloquear (el `for update`
--     no puede lockear filas inexistentes — ahi nacian las raices duplicadas).
--   · `for update` sobre los planes del alumno (mismo lock que despues toma el publish).
--   · `version_number = coalesce(max,0)+1` calculado EN SQL bajo ese lock.
--   · idempotencia: misma `p_idempotency_key` ya publicada para ese alumno => devuelve la
--     version existente sin escribir nada (cinturon ADEMAS del que ya tiene
--     `publish_nutrition_plan_v2` por `(plan_id, publish_idempotency_key)`).
--   · el publish se DELEGA en `public.publish_nutrition_plan_v2` (intacto): supersede
--     intra-dia, CAS, auditoria y rederive del snapshot del dia siguen viviendo ahi.
--
-- ADITIVA / forward-only: funcion NUEVA (nombre nuevo). No toca tablas, RLS, policies,
-- indices ni ninguna firma existente. El camino viejo (INSERTs directos por PostgREST)
-- sigue funcionando para los binarios RN ya publicados.
--
-- ROLLBACK (una pasada):
--   drop function if exists public.persist_and_publish_nutrition_plan_v2(jsonb, date, text, uuid, uuid);
--   -- y revertir el thin caller de plan-persistence.ts al camino por PostgREST.
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
  'publish en publish_nutrition_plan_v2.';
