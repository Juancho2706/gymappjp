-- ============================================================================
-- EVA Nutricion — T2.1 F3: merge de overrides en el catalogo (discovery)
-- Spec: docs/specs/nutrition-food-overrides/SPEC.md · Tarea: TASKS.md F3
-- ----------------------------------------------------------------------------
-- `private.food_catalog_v2_item_json` es el CHOKE POINT del catalogo V2: emite
-- el JSON de un alimento y lo llaman las tres RPC de discovery. Mergear ahi
-- hace que buscador, scanner y sugerencias hereden la correccion del coach de
-- una sola vez, sin tocar ninguna firma publica ni un solo cliente web/RN.
--
-- CAMBIO DE FIRMA: `(p_food_id)` -> `(p_food_id, p_coach_id)`. DROP + CREATE en
-- la MISMA transaccion (precedente 20260728120000): `create or replace` no
-- admite parametros nuevos, y dejar las dos firmas conviviendo haria ambigua la
-- resolucion de una llamada de un argumento. El helper esta revocado de
-- `authenticated` (ACL `{postgres=X/postgres}`), asi que no hay llamadores
-- externos que migrar — pero OJO: un DROP se lleva la ACL, por eso se vuelve a
-- revocar explicitamente mas abajo.
--
-- EL COACH SE RESUELVE SERVER-SIDE, UNA VEZ POR LLAMADA, y jamas viene del
-- payload (leccion B1 de 20260804091000: estas RPC son SECURITY DEFINER y pasan
-- por encima de RLS, asi que el tenant se pone a mano). Actor coach => el
-- mismo; actor alumno => el coach de su ficha; cualquier otro => NULL, sin merge.
--
-- ADITIVA en datos: no toca `foods`, ni los snapshot_*, ni el historial. El
-- merge ocurre en LECTURA; el freeze de publicacion es F4.
-- ============================================================================

-- ── 1) Quien es el coach del actor ──────────────────────────────────────────
create or replace function private.food_catalog_v2_actor_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.id from public.coaches c where c.id = (select auth.uid())),
    (select cl.coach_id from public.clients cl where cl.id = (select auth.uid()))
  );
$$;

comment on function private.food_catalog_v2_actor_coach_id() is
  'Coach cuyo override aplica al actor: el propio coach, o el coach del alumno. '
  'NULL para cualquier otro actor (sin merge). Se llama UNA vez por RPC y se '
  'pasa como parametro: nunca se acepta el coach desde el payload.';

revoke all on function private.food_catalog_v2_actor_coach_id() from public, anon, authenticated;

-- ── 2) Choke point con merge ────────────────────────────────────────────────
drop function if exists private.food_catalog_v2_item_json(uuid);

create function private.food_catalog_v2_item_json(p_food_id uuid, p_coach_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'catalogKey', f.catalog_key,
    'gtin', f.barcode,
    'name', f.name,
    'brand', f.brand,
    'category', f.category,
    'countryCode', f.country_code,
    'servingSize', f.serving_size,
    'servingUnit', coalesce(f.serving_unit, 'g'),
    -- Los CINCO macros se reemplazan enteros cuando hay override: un merge campo
    -- a campo dejaria kcal corregidas contra macros viejos que no suman.
    'calories', case when o.id is null then f.calories  else o.calories  end,
    'proteinG', case when o.id is null then f.protein_g else o.protein_g end,
    'carbsG',   case when o.id is null then f.carbs_g   else o.carbs_g   end,
    'fatsG',    case when o.id is null then f.fats_g    else o.fats_g    end,
    'fiberG',   case when o.id is null then f.fiber_g   else o.fiber_g   end,
    -- NUEVO y SIEMPRE presente: hasta hoy el JSON no declaraba la base y todo
    -- consumidor asumia per_100 (CATALOG_MACROS_BASIS) — mentira latente para
    -- las filas per_serving del seed de intercambios. Este campo la cierra.
    'macrosBasis', case when o.id is null then f.macros_basis else o.macros_basis end,
    -- Medida casera: viaja como PAR. Nunca se mezcla la etiqueta de una fuente
    -- con los gramos de la otra (daria una conversion falsa).
    'householdLabel', case
      when o.household_label is not null then o.household_label
      when f.household_label is not null and f.household_grams is not null then f.household_label
      else null end,
    'householdGrams', case
      when o.household_label is not null then o.household_grams
      when f.household_label is not null and f.household_grams is not null then f.household_grams
      else null end,
    'hasOverride', o.id is not null,
    'original', case when o.id is null then null else jsonb_build_object(
      'calories', f.calories,
      'proteinG', f.protein_g,
      'carbsG',   f.carbs_g,
      'fatsG',    f.fats_g,
      'fiberG',   f.fiber_g
    ) end,
    'sodiumMg', f.sodium_mg,
    'sugarG', f.sugar_g,
    'saturatedFatG', f.saturated_fat_g,
    'packageQuantity', f.package_quantity,
    'packageUnit', f.package_unit,
    'source', f.catalog_source,
    'sourceRef', f.source_ref,
    'verificationStatus', f.verification_status,
    'coachId', f.coach_id,
    'orgId', f.org_id,
    'media', private.food_catalog_v2_media_json(f.id)
  )
  from public.foods f
  -- Probe por el unique (coach_id, food_id). Corre una vez por fila EMITIDA
  -- (la pagina final, <= 25), nunca dentro del scoring de la busqueda.
  left join public.coach_food_overrides o
    on p_coach_id is not null
   and o.coach_id = p_coach_id
   and o.food_id = f.id
  where f.id = p_food_id;
$$;

comment on function private.food_catalog_v2_item_json(uuid, uuid) is
  'JSON de un alimento del catalogo V2 con el override del coach ya mergeado. '
  'p_coach_id NULL = sin merge. Emite siempre macrosBasis; hasOverride/original '
  'solo tienen contenido cuando hay correccion.';

-- El DROP se llevo la ACL: se restituye el estado anterior ({postgres=X}).
revoke all on function private.food_catalog_v2_item_json(uuid, uuid) from public, anon, authenticated;

-- ── 3) Las 3 RPC consumidoras pasan el coach. Firmas publicas SIN cambio ────
--     (cero cambio en clientes web/RN; el scanner por PostgREST hereda gratis).

create or replace function public.search_food_catalog_v2(
  p_query text,
  p_country_code text default 'CL'::text,
  p_cursor_score numeric default null::numeric,
  p_cursor_name text default null::text,
  p_cursor_id uuid default null::uuid,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_query text:=private.food_catalog_v2_normalize_text(p_query); v_country text:=upper(coalesce(p_country_code,'CL')); v_page_size integer:=least(greatest(coalesce(p_page_size,25),1),50); v_items jsonb:='[]'::jsonb; v_has_more boolean:=false; v_next jsonb:=null; v_coach uuid;
begin
if auth.uid() is null then raise exception 'food_catalog_v2_auth_required' using errcode='42501'; end if;
if char_length(v_query)<2 then return jsonb_build_object('schemaVersion',1,'generatedAt',now(),'query',v_query,'countryCode',v_country,'items','[]'::jsonb,'nextCursor',null,'hasMore',false); end if;
if v_country!~'^[A-Z]{2}$' then raise exception 'food_catalog_v2_invalid_country' using errcode='22023'; end if;
v_coach := private.food_catalog_v2_actor_coach_id();
with scored as (
select f.id,f.name,greatest(public.similarity(coalesce(f.name_search,''),v_query),case when coalesce(f.name_search,'') like '%'||v_query||'%' then 0.75 else 0 end,case when exists(select 1 from unnest(coalesce(f.search_aliases,'{}'::text[])) alias where private.food_catalog_v2_normalize_text(alias) like '%'||v_query||'%') then 0.7 else 0 end)::numeric search_score
from public.foods f where f.verification_status<>'rejected' and (f.country_code is null or f.country_code=v_country) and private.food_catalog_v2_can_read_food(f.id) and (coalesce(f.name_search,'') like '%'||v_query||'%' or public.similarity(coalesce(f.name_search,''),v_query)>=0.18 or exists(select 1 from unnest(coalesce(f.search_aliases,'{}'::text[])) alias where private.food_catalog_v2_normalize_text(alias) like '%'||v_query||'%'))),
cursor_filtered as (select * from scored where p_cursor_score is null or search_score<p_cursor_score or (search_score=p_cursor_score and private.food_catalog_v2_name_after(name,id,p_cursor_name,p_cursor_id)) order by search_score desc,name asc,id asc limit v_page_size+1),
page as (select * from cursor_filtered order by search_score desc,name asc,id asc limit v_page_size)
select coalesce(jsonb_agg(private.food_catalog_v2_item_json(page.id, v_coach) order by page.search_score desc,page.name asc,page.id asc),'[]'::jsonb),(select count(*) from cursor_filtered)>v_page_size,case when (select count(*) from cursor_filtered)>v_page_size then (select jsonb_build_object('score',p.search_score,'name',p.name,'id',p.id) from page p order by p.search_score asc,p.name desc,p.id desc limit 1) else null end into v_items,v_has_more,v_next from page;
return jsonb_build_object('schemaVersion',1,'generatedAt',now(),'query',v_query,'countryCode',v_country,'items',v_items,'nextCursor',v_next,'hasMore',coalesce(v_has_more,false));
end; $function$;

create or replace function public.lookup_food_by_gtin_v2(p_gtin text, p_country_code text default 'CL'::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_gtin text:=regexp_replace(coalesce(p_gtin,''),'[^0-9]','','g'); v_country text:=upper(coalesce(p_country_code,'CL')); v_food_id uuid; v_verification_status text;
begin
if auth.uid() is null then raise exception 'food_catalog_v2_auth_required' using errcode='42501'; end if;
if not private.food_catalog_v2_is_valid_gtin(v_gtin) then return jsonb_build_object('schemaVersion',1,'generatedAt',now(),'status','invalid','gtin',v_gtin); end if;
if v_country!~'^[A-Z]{2}$' then raise exception 'food_catalog_v2_invalid_country' using errcode='22023'; end if;
select f.id,f.verification_status into v_food_id,v_verification_status from public.foods f where f.barcode=v_gtin and f.verification_status<>'rejected' and (f.country_code is null or f.country_code=v_country) and private.food_catalog_v2_can_read_food(f.id) order by case f.verification_status when 'eva_verified' then 0 when 'coach_verified' then 1 when 'community' then 2 else 3 end,f.updated_at desc nulls last,f.id limit 1;
if v_food_id is null then return jsonb_build_object('schemaVersion',1,'generatedAt',now(),'status','not_found','gtin',v_gtin,'missingReportId',null); end if;
return jsonb_build_object('schemaVersion',1,'generatedAt',now(),'status',case when v_verification_status in ('eva_verified','coach_verified') then 'found' else 'pending_verification' end,'gtin',v_gtin,'food',private.food_catalog_v2_item_json(v_food_id, private.food_catalog_v2_actor_coach_id()));
end; $function$;

create or replace function public.get_coach_food_suggestions_v2(
  p_client_id uuid default null::uuid,
  p_slot_name text default null::text,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 24);
  v_slot text := left(nullif(btrim(coalesce(p_slot_name, '')), ''), 120);
  v_coach uuid;
  v_coach_top jsonb;
  v_client_recent jsonb := '[]'::jsonb;
  v_client_favorites jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_food_suggestions_auth_required' using errcode = '42501';
  end if;

  v_coach := private.food_catalog_v2_actor_coach_id();

  select coalesce(jsonb_agg(item order by uses desc, last_used desc), '[]'::jsonb)
  into v_coach_top
  from (
    select
      private.food_catalog_v2_item_json(i.food_id, v_coach)
        || jsonb_build_object('usageCount', count(*)::integer) as item,
      count(*) as uses,
      max(i.created_at) as last_used
    from public.nutrition_prescription_items_v2 i
    join public.nutrition_plan_versions_v2 v on v.id = i.version_id
    join public.nutrition_plans_v2 pl on pl.id = v.plan_id
    left join public.nutrition_meal_slots_v2 s on s.id = i.meal_slot_id
    where pl.coach_id = auth.uid()
      and i.food_id is not null
      and private.food_catalog_v2_can_read_food(i.food_id)
      and (v_slot is null or lower(s.name) = lower(v_slot))
    group by i.food_id
    order by uses desc, last_used desc
    limit v_limit
  ) top;

  if p_client_id is not null and private.nutrition_v2_can_read_client(p_client_id) then
    select coalesce(jsonb_agg(item order by last_at desc), '[]'::jsonb)
    into v_client_recent
    from (
      select
        private.food_catalog_v2_item_json(e.food_id, v_coach) as item,
        max(coalesce(e.occurred_at, e.created_at)) as last_at
      from public.nutrition_intake_entries e
      where e.client_id = p_client_id
        and e.food_id is not null
        and e.idempotency_key is not null
        and e.entry_status = 'active'
        and e.log_date >= current_date - 90
        and private.food_catalog_v2_can_read_food(e.food_id)
      group by e.food_id
      order by last_at desc
      limit v_limit
    ) recents;

    select coalesce(jsonb_agg(private.food_catalog_v2_item_json(p.food_id, v_coach) order by p.created_at desc), '[]'::jsonb)
    into v_client_favorites
    from (
      select cfp.food_id, cfp.created_at
      from public.client_food_preferences cfp
      where cfp.client_id = p_client_id
        and cfp.preference_type = 'favorite'
        and private.food_catalog_v2_can_read_food(cfp.food_id)
      order by cfp.created_at desc
      limit v_limit
    ) p;
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'coachTop', coalesce(v_coach_top, '[]'::jsonb),
    'clientRecent', v_client_recent,
    'clientFavorites', v_client_favorites
  );
end;
$function$;

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta aca): recrear
-- `private.food_catalog_v2_item_json(uuid)` con el cuerpo previo, volver las 3
-- RPC a la llamada de un argumento y dropear el helper de actor. No hay dato
-- que revertir: el merge es de lectura.
-- ============================================================================
