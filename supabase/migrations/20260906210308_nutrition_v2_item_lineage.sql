-- ============================================================================
-- EVA Nutricion V2 — W3.1 «Cantidades honestas»: linaje de items prescritos
-- (SPEC docs/specs/nutrition-cantidades-honestas/SPEC.md §1 Causa 2, §6.1, §8;
--  decision del owner D4 a)
-- ----------------------------------------------------------------------------
-- POR QUE
--   Republicar el MISMO dia rearma el snapshot de hoy
--   (private.nutrition_v2_rederive_day_snapshot, 20260716230000:24, llamado desde
--   publish_nutrition_plan_v2) con items cuyos ids son NUEVOS: el builder web genera
--   `crypto.randomUUID()` por item en cada publicacion (plan-persistence.ts:489) y
--   persist_and_publish los inserta tal cual. Los registros que el alumno ya hizo
--   quedan apuntando a un `prescription_item_id` que ya no esta en el snapshot:
--   la web los pinta como libres, RN los esconde y `consumed` los suma igual.
--   En 30 dias: 66 publicaciones, 17 el mismo dia de la vigente, 5 con registros
--   previos (2 alumnos). Caso Jean, 06-09: 5 registros huerfanos.
--
-- LA REGLA QUE NO SE TOCA (SPEC §2 y §8): CERO `update` sobre
-- `nutrition_intake_entries`. Los eventos V2 no se reescriben. El arreglo es de
-- LECTURA: el item nuevo declara de QUIEN es copia (`source_item_id`) y el read
-- model del Hoy traduce el id viejo del registro al id vigente.
--
-- QUE HACE (todo aditivo / idempotente / forward-only)
--   a) nutrition_prescription_items_v2.source_item_id + FK self-referencial
--      (on delete set null) + CHECK `source_item_id is distinct from id` + dos
--      indices parciales + comment.
--   b) private.nutrition_v2_item_alias_map(version_id) -> (ancestor_id, current_id):
--      CTE recursiva que sube por `source_item_id` (profundidad <= 20).
--   c) persist_and_publish_nutrition_plan_v2: escribe `source_item_id` VALIDADO
--      contra la base (mismo plan, no el propio item); si no valida => NULL.
--   d) get_nutrition_today_v2: `prescriptionItemId` resuelto por el mapa de alias y
--      `originalPrescriptionItemId` con el id original cuando difiere.
--   e) No hay un segundo emisor de `intakeItems`: `get_nutrition_history_detail_v2`
--      NO EXISTE en el repo (verificado con
--      `grep -rn "get_nutrition_history_detail_v2\|intakeItems" supabase/migrations/`
--      => solo 20260714210000 / 20260718150000 / 20260720120000, las tres son
--      get_nutrition_today_v2). Coincide con la resolucion R3 de la auditoria W2.0
--      (SPEC §5.7): el historial V2 solo trae agregados. Nada mas que aliasear.
--
-- CERO REINTERPRETACION (SPEC §2)
--   El alias NO mueve cantidades, unidades ni macros: solo cambia a QUE item apunta
--   un registro en el JSON de lectura. Un item MODIFICADO (30 un -> 3 un) no lleva
--   `source_item_id` (el editor lo anula ante cualquier cambio de contenido, W3.1 TS)
--   y por lo tanto sigue huerfano A PROPOSITO: es otra comida, y W1.4 lo deja visible
--   y retirable. Los totales (`consumed`, `totals` por registro) no cambian nunca.
--
-- POR QUE d) SE APLICA COMO PARCHE DE TEXTO Y NO COPIANDO EL CUERPO
--   La ULTIMA definicion COMPLETA de `get_nutrition_today_v2` en el repo es
--   20260720120000, pero NO es la que corre en LIVE: dos migraciones posteriores la
--   reescriben por texto sobre `pg_get_functiondef` —
--     · 20260803194000 (bloque exchangeFoods: filtro de tenant + orden por dueno +
--       cap 60) — cierra la FUGA CROSS-TENANT B1, verificada en LIVE el 03-08;
--     · 20260804091000 (exchangeFoods lee `exchange_group_foods` con precedencia).
--   Copiar el cuerpo de 20260720120000 con dos lineas cambiadas REVERTIRIA las dos
--   (reabriendo B1). Por eso esta migracion usa exactamente el mismo mecanismo que
--   ellas: reconstruye la definicion VIVA y empalma tres anclas exactas, con asserts
--   que fallan en voz alta si alguna no aparece la cantidad esperada de veces.
--
-- GRANTS: ninguno nuevo. `nutrition_prescription_items_v2` tiene grants a nivel de
-- TABLA (20260714190500:1125) y quien escribe la columna es la RPC (security definer).
-- El mapa de alias es `private` (revocado a public/anon/authenticated) y solo lo llama
-- el read model, que es security definer.
--
-- TIPOS: tras aplicar en LIVE hay que regenerar apps/web/src/lib/database.types.ts.
--
-- ORDEN: esta migracion va DESPUES de 20260906202957_nutrition_v2_household_units.sql
-- y parte de sus definiciones (el cuerpo de persist_and_publish que se copia acá es el
-- de W2, con household_label/household_grams ya adentro).
-- ============================================================================

-- ── a) Linaje en el item prescrito ───────────────────────────────────────────
alter table public.nutrition_prescription_items_v2
  add column if not exists source_item_id uuid;

comment on column public.nutrition_prescription_items_v2.source_item_id is
  'Linaje (W3.1): id del item de la version ANTERIOR del MISMO plan del que este item es '
  'copia SIN CAMBIOS de franja, alimento/nombre, cantidad ni unidad. Solo lo escribe '
  'persist_and_publish_nutrition_plan_v2, que lo VALIDA contra la base (si no existe, es de '
  'otro plan o es el propio item => NULL: el linaje es una ayuda de lectura, no un requisito '
  'de publicacion). Lo consume private.nutrition_v2_item_alias_map para que un registro hecho '
  'sobre el item viejo se siga viendo «Registrado» tras republicar el mismo dia, SIN tocar '
  'nutrition_intake_entries. Un item modificado NO lo lleva: sigue huerfano a proposito.';

-- FK self-referencial. `on delete set null` (mismo criterio que food_id/recipe_id de la
-- tabla y que nutrition_intake_entries.prescription_item_id, 20260714190000:235): borrar
-- una version vieja NO puede tumbar la publicacion vigente, solo pierde el linaje.
-- La columna nace 100 % NULL en esta misma migracion, asi que el escaneo del ALTER no
-- puede fallar ni encontrar trabajo: no hace falta `not valid` (mismo razonamiento que
-- los CHECKs de W2).
do $chk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_prescription_items_v2'
      and c.conname = 'nutrition_prescription_items_v2_source_item_fkey'
  ) then
    alter table public.nutrition_prescription_items_v2
      add constraint nutrition_prescription_items_v2_source_item_fkey
      foreign key (source_item_id)
      references public.nutrition_prescription_items_v2(id)
      on delete set null;
  end if;
end;
$chk$;

-- Auto-referencia prohibida: sin este CHECK un item podria declararse copia de si mismo
-- y el mapa de alias emitiria (X -> X), que es ruido puro. `is distinct from` para que la
-- fila con source_item_id NULL (el 99,9 %) pase sin ambiguedad de tres valores.
do $chk$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'nutrition_prescription_items_v2'
      and c.conname = 'nutrition_prescription_items_v2_source_item_not_self'
  ) then
    alter table public.nutrition_prescription_items_v2
      add constraint nutrition_prescription_items_v2_source_item_not_self
      check (source_item_id is distinct from id);
  end if;
end;
$chk$;

-- Indice de la FK: sin el, borrar un item padre obliga a un seq scan por fila para el
-- `on delete set null` (misma leccion que 20260805182135). Parcial porque solo una
-- minoria de items va a tener linaje. Tambien sirve para «quien desciende de X».
create index if not exists nutrition_prescription_items_v2_source_item_idx
  on public.nutrition_prescription_items_v2 (source_item_id)
  where source_item_id is not null;

-- Indice de la SEMILLA del mapa de alias. `get_nutrition_today_v2` es el hot path del
-- alumno y llama al mapa en CADA lectura: sin este indice la semilla
-- (`version_id = X and source_item_id is not null`) seria un Seq Scan de toda la tabla
-- (no hay indice por `version_id` solo: los existentes son (meal_slot_id, order_index) y
-- (meal_slot_id, version_id)). Parcial => pesa lo que pesan los items con linaje, y un
-- plan sin linaje resuelve con un index scan de 0 filas.
create index if not exists nutrition_prescription_items_v2_lineage_seed_idx
  on public.nutrition_prescription_items_v2 (version_id, source_item_id)
  where source_item_id is not null;

-- ============================================================================
-- b) private.nutrition_v2_item_alias_map — de id ANCESTRO a id VIGENTE
-- ============================================================================
create or replace function private.nutrition_v2_item_alias_map(p_version_id uuid)
returns table (ancestor_id uuid, current_id uuid)
language sql
stable
security definer
set search_path = ''
-- Nota de forma: las columnas internas se llaman `anc_id`/`cur_id`, NO `ancestor_id`/
-- `current_id`. En una funcion `language sql` con `returns table` esos dos nombres son
-- parametros de salida y compartirlos con columnas de la consulta invita a una ambiguedad
-- gratuita; el mapeo a los nombres de salida es posicional.
as $$
  with recursive chain as (
    -- Semilla: los items de ESTA version que declaran de quien son copia.
    -- (anc_id = el id viejo al que todavia apuntan los registros del alumno).
    select
      i.source_item_id as anc_id,
      i.id as cur_id,
      1 as depth
    from public.nutrition_prescription_items_v2 i
    where i.version_id = p_version_id
      and i.source_item_id is not null
    union all
    -- Y hacia arriba: si el ancestro a su vez era copia de otro, ESE tambien resuelve al
    -- mismo item vigente (republicar tres veces el mismo dia deja cadenas de 2-3 saltos).
    -- `depth < 20` es el freno duro: aunque un ciclo se colara (la FK + el CHECK
    -- `source_item_id is distinct from id` lo hacen improbable), la recursion termina.
    select
      prev.source_item_id,
      c.cur_id,
      c.depth + 1
    from chain c
    join public.nutrition_prescription_items_v2 prev on prev.id = c.anc_id
    where prev.source_item_id is not null
      and c.depth < 20
  )
  select x.anc_id, x.cur_id
  from (
    select
      c.anc_id,
      c.cur_id,
      -- Un mismo ancestro podria ser reclamado por dos items de la version vigente
      -- (dos copias del mismo item). Se elige de forma DETERMINISTA: el salto mas corto
      -- y, a igual profundidad, el id menor. Asi el mapa nunca tiene la misma clave dos
      -- veces y jsonb_object_agg del read model no depende del orden de las filas.
      row_number() over (
        partition by c.anc_id
        order by c.depth, c.cur_id
      ) as rn
    from chain c
    -- Cinturon: si el «ancestro» resulta ser un item VIVO de esta misma version, no se
    -- aliasea nada (redirigir un id que SI esta en el snapshot de hoy esconderia un
    -- registro legitimo). Solo puede pasar con un source_item_id apuntando a un hermano.
    where not exists (
      select 1
      from public.nutrition_prescription_items_v2 live
      where live.id = c.anc_id
        and live.version_id = p_version_id
    )
  ) x
  where x.rn = 1;
$$;

revoke all on function private.nutrition_v2_item_alias_map(uuid) from public, anon, authenticated;

comment on function private.nutrition_v2_item_alias_map(uuid) is
  'W3.1 (SPEC §6.1): mapa ancestor_id -> current_id para la version dada. Sube por '
  'nutrition_prescription_items_v2.source_item_id con una CTE recursiva acotada a 20 saltos, '
  'descarta ancestros que siguen vivos en la propia version y deja una sola fila por ancestro '
  '(salto mas corto, desempate por id). Lo usa get_nutrition_today_v2 para que un registro '
  'hecho sobre el item de una version anterior siga apuntando al item vigente SIN reescribir '
  'nutrition_intake_entries (regla dura del repo: cero UPDATE de eventos V2).';

-- ============================================================================
-- c) persist_and_publish_nutrition_plan_v2 — cuerpo VERBATIM de
--    20260906202957_nutrition_v2_household_units.sql (a4, la definicion inmediatamente
--    anterior, que ya trae household_label/household_grams).
--    UNICO cambio: `source_item_id` en la lista de columnas y en los values del INSERT
--    de items, con el valor VALIDADO en `v_source_item_id` justo antes del insert.
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
  -- [W3.1] Linaje del item: se resuelve por item, dentro del loop.
  v_source_item_id uuid;
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

        -- [W3.1] Linaje: de que item de una version ANTERIOR del MISMO plan es copia este.
        -- Se VALIDA contra la base y NUNCA se levanta excepcion: el linaje es una ayuda de
        -- lectura, no un requisito de publicacion (SPEC §6.1). Un id de otro plan, un id que
        -- ya no existe (version borrada) o el propio item => NULL, y la publicacion sigue.
        -- El cast es el mismo naive de `food_id`/`substitution_group_id` de este mismo
        -- INSERT: un uuid mal formado es un bug del cliente y revienta igual que ellos
        -- (el borrador ya lo valida con zod antes de llegar aca).
        v_source_item_id := nullif(v_item ->> 'source_item_id', '')::uuid;
        if v_source_item_id is not null then
          if v_source_item_id = v_item_id then
            v_source_item_id := null;
          elsif not exists (
            select 1
            from public.nutrition_prescription_items_v2 si
            join public.nutrition_plan_versions_v2 sv on sv.id = si.version_id
            where si.id = v_source_item_id
              and sv.plan_id = v_plan_id
          ) then
            v_source_item_id := null;
          end if;
        end if;

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
          -- [W3.1] Linaje validado arriba (NULL cuando no aplica o no valida).
          source_item_id,
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
          v_source_item_id,
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
  '(la cantidad SIEMPRE llega en g/ml; unit = «casera» lo rechaza el CHECK de la tabla). '
  'W3.1: escribe source_item_id (linaje) solo si el id existe y pertenece a una version del '
  'MISMO plan y no es el propio item; en cualquier otro caso lo deja NULL sin fallar.';

-- ============================================================================
-- d) public.get_nutrition_today_v2 — PARCHE DE TEXTO sobre la definicion VIVA
--    (mismo mecanismo que 20260803194000 y 20260804091000; ver la cabecera para
--    el «por que» de no copiar el cuerpo).
--
--    Tres empalmes, todos con ancla exacta:
--      1. declaracion de `v_alias` (mapa ancestor -> vigente de la version del dia);
--      2. carga de `v_alias` justo despues de `v_consumed` (ya hay snapshot);
--      3. las DOS emisiones de `item_json` (CTE `entries` de las franjas y CTE
--         `entries` de `unassignedIntake`), identicas byte a byte, que pasan a
--         mergear `prescriptionItemId` / `originalPrescriptionItemId`.
--
--    NADA MAS cambia: totales, agrupado por `slot_code`, capa de porciones,
--    exchangeFoods, syncToken y permisos quedan tal cual.
-- ============================================================================

do $do$
declare
  v_src text;
  v_out text;
  v_hits integer;

  -- Ancla 1: ultima linea del bloque `declare` (aparece 1 vez).
  v_decl_old constant text := $anc$  v_sep constant text := chr(31);
$anc$;
  v_decl_new constant text := $anc$  v_sep constant text := chr(31);
  -- [W3.1] Mapa de linaje de la version del dia: clave = id de un item ANCESTRO
  -- (al que todavia apuntan registros del alumno), valor = id del item VIGENTE que
  -- declara ser su copia. '{}' cuando el dia no tiene version (snapshot sin plan).
  v_alias jsonb := '{}'::jsonb;
$anc$;

  -- Ancla 2: ultima asignacion antes del bloque del plan (aparece 1 vez). El snapshot
  -- ya esta cargado y validado, asi que `v_snapshot.version_id` es confiable.
  v_load_old constant text := $anc$  v_consumed := private.nutrition_v2_intake_totals(p_client_id, p_local_date);
$anc$;
  v_load_new constant text := $anc$  v_consumed := private.nutrition_v2_intake_totals(p_client_id, p_local_date);

  -- [W3.1] Alias de items: republicar el mismo dia genera ids nuevos y deja los
  -- registros del alumno apuntando al item viejo (SPEC §1 Causa 2). El mapa traduce
  -- ese id al vigente EN LECTURA — cero UPDATE sobre nutrition_intake_entries.
  if v_snapshot.version_id is null then
    v_alias := '{}'::jsonb;
  else
    select coalesce(jsonb_object_agg(m.ancestor_id::text, m.current_id), '{}'::jsonb)
    into v_alias
    from private.nutrition_v2_item_alias_map(v_snapshot.version_id) m;
  end if;
$anc$;

  -- Ancla 3: la MISMA linea abre las dos CTE `entries` (franjas y unassigned).
  -- Se reemplazan las DOS (assert de conteo = 2).
  v_json_old constant text := $anc$    select e.*, private.nutrition_v2_intake_item_json(e) as item_json
$anc$;
  v_json_new constant text := $anc$    select e.*, private.nutrition_v2_intake_item_json(e) || jsonb_build_object(
             -- [W3.1] Resolucion del linaje. `prescriptionItemId` pasa a ser el id VIGENTE
             -- cuando el registro apunta a un ancestro; si no hay alias queda el original
             -- (un item modificado sigue huerfano A PROPOSITO: es otra comida, SPEC §6.1).
             'prescriptionItemId', coalesce(
               (v_alias ->> e.prescription_item_id::text)::uuid,
               e.prescription_item_id
             ),
             -- Id original solo cuando difiere: lo usa el chip «de una version anterior»
             -- del alumno y el de «plan anterior» de la ficha del coach (W4.1).
             'originalPrescriptionItemId', case
               when (v_alias ->> e.prescription_item_id::text)::uuid is not null
                and (v_alias ->> e.prescription_item_id::text)::uuid <> e.prescription_item_id
                 then e.prescription_item_id
               else null
             end
           ) as item_json
$anc$;
begin
  v_src := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);

  -- Idempotencia: si la marca ya esta, la funcion viva YA tiene el parche (re-run de la
  -- migracion o `db push` repetido). Salir sin tocar nada es lo correcto; volver a buscar
  -- las anclas fallaria porque la tercera ya no existe con su texto original.
  if position('originalPrescriptionItemId' in v_src) > 0 then
    raise notice 'nutrition_v2_item_lineage: get_nutrition_today_v2 ya trae el alias de linaje; nada que hacer';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, v_decl_old, ''))) / length(v_decl_old);
  if v_hits <> 1 then
    raise exception 'nutrition_v2_item_lineage: el ancla del declare (v_sep) aparece % veces, se esperaba 1', v_hits;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, v_load_old, ''))) / length(v_load_old);
  if v_hits <> 1 then
    raise exception 'nutrition_v2_item_lineage: el ancla de v_consumed aparece % veces, se esperaba 1', v_hits;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, v_json_old, ''))) / length(v_json_old);
  if v_hits <> 2 then
    raise exception 'nutrition_v2_item_lineage: el ancla de item_json aparece % veces, se esperaban 2 (franjas + unassigned)', v_hits;
  end if;

  v_out := replace(v_src, v_decl_old, v_decl_new);
  v_out := replace(v_out, v_load_old, v_load_new);
  v_out := replace(v_out, v_json_old, v_json_new);

  execute v_out;
end
$do$;

-- Assert final: el parche quedo aplicado en los dos emisores Y los parches previos
-- siguen vivos (canarios de que no se recopio un cuerpo viejo por error).
do $do$
declare
  v_def text := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);
  v_hits integer;
begin
  if position('private.nutrition_v2_item_alias_map(v_snapshot.version_id)' in v_def) = 0 then
    raise exception 'nutrition_v2_item_lineage: la funcion no quedo cargando el mapa de alias';
  end if;
  v_hits := (length(v_def) - length(replace(v_def, 'originalPrescriptionItemId', '')))
            / length('originalPrescriptionItemId');
  if v_hits <> 2 then
    raise exception 'nutrition_v2_item_lineage: originalPrescriptionItemId aparece % veces, se esperaban 2', v_hits;
  end if;
  -- Canario 20260720120000 (media / category) — igual que el assert de 20260804091000.
  if position('media' in v_def) = 0 or position('category' in v_def) = 0 then
    raise exception 'nutrition_v2_item_lineage: la funcion perdio el enriquecimiento de 20260720120000';
  end if;
  -- Canario 20260804091000 (exchangeFoods lee la lista con dueno) + 20260803194000
  -- (filtro de tenant en las dos ramas: sin el vuelve la fuga cross-tenant B1).
  if position('public.exchange_group_foods egf' in v_def) = 0 then
    raise exception 'nutrition_v2_item_lineage: se perdio el parche de exchange_group_foods (20260804091000)';
  end if;
  if (length(v_def) - length(replace(v_def, 'cl.coach_id from public.clients cl', '')))
     / length('cl.coach_id from public.clients cl') < 3 then
    raise exception 'nutrition_v2_item_lineage: falta el filtro de tenant en alguna rama (riesgo de fuga cross-tenant B1)';
  end if;
end
$do$;

-- Firma identica => sin drop; grants ya vigentes (20260714210000 / 20260720120000).
-- Re-asercion idempotente por si un fixer movio los revoke/grant.
revoke all on function public.get_nutrition_today_v2(uuid, date, text) from public, anon;
grant execute on function public.get_nutrition_today_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_today_v2(uuid, date, text) is
  'One-request private read model for Today. First read may create the immutable '
  'daily snapshot. Capa de porciones (exchangeTargets/dayCoverage/exchangeFoods) '
  'presente solo si el plan tiene targets de porciones (Q1 byte-identico). Items '
  'prescritos/consumidos incluyen media/category resueltos por food_id en lectura. '
  'W3.1: los registros resuelven su prescriptionItemId contra el linaje de la version '
  'del dia (private.nutrition_v2_item_alias_map) y exponen originalPrescriptionItemId '
  'cuando el id cambio por una republicacion — sin reescribir nutrition_intake_entries.';

-- ============================================================================
-- ROLLBACK MANUAL (una pasada — NO se aplica en el build; referencia de operacion).
-- La COLUMNA se deja (aditiva, nullable, sin costo; borrarla perderia el linaje ya
-- publicado). Se sueltan constraints/indices y se re-aplican las dos funciones:
--
--   alter table public.nutrition_prescription_items_v2
--     drop constraint if exists nutrition_prescription_items_v2_source_item_not_self;
--   alter table public.nutrition_prescription_items_v2
--     drop constraint if exists nutrition_prescription_items_v2_source_item_fkey;
--   drop index if exists public.nutrition_prescription_items_v2_lineage_seed_idx;
--   drop index if exists public.nutrition_prescription_items_v2_source_item_idx;
--   drop function if exists private.nutrition_v2_item_alias_map(uuid);
--
--   -- c: re-aplicar el bloque a4 de 20260906202957_nutrition_v2_household_units.sql
--   --    (persist_and_publish sin la columna de linaje).
--   -- d: NO alcanza con re-aplicar 20260720120000 — eso revertiria tambien
--   --    20260803194000 (fuga cross-tenant B1) y 20260804091000. Dos caminos:
--   --      (i) parche inverso sobre la definicion viva: replace del bloque
--   --          `|| jsonb_build_object( ... 'originalPrescriptionItemId' ... )` por
--   --          ` as item_json`, del bloque `if v_snapshot.version_id is null ...` y
--   --          de la declaracion `v_alias`; o
--   --     (ii) re-aplicar EN ESTE ORDEN 20260720120000 -> 20260803194000 -> 20260804091000.
--   --    La opcion (ii) es la segura si el parche inverso no matchea exacto.
--
--   -- y regenerar apps/web/src/lib/database.types.ts.
-- ============================================================================
