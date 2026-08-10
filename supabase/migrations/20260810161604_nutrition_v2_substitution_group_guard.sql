-- T2.5 F1 — el guard de sustituciones acepta equivalentes del GRUPO de intercambio.
-- SPEC: docs/specs/nutrition-exchange-swap/SPEC.md (H4, H6, H7 y "Autorizacion")
--
-- Contexto: T2.4 (`20260809230833`) dejo el guard exigiendo una fila en
-- `nutrition_item_substitutions_v2`. Eso alcanza para 15 items en toda la base; los otros 832
-- tienen grupo de intercambio y ninguna fila. Sin este delta, el sheet de T2.5 ofreceria opciones
-- que el servidor rechaza con 42501.
--
-- `record_nutrition_intake_v2` NO se toca: el guard vive en esta funcion auxiliar, que ya se llama
-- desde ahi (incluido el camino delegado). Rollback = re-aplicar `20260809230833`.

-- ---------------------------------------------------------------------------
-- Membresia del grupo, con la MISMA semantica que el resolver de listas
-- ---------------------------------------------------------------------------
--
-- Por que no basta `foods.exchange_group_id`: el sistema ya define la membresia en
-- `20260804091000` como union de `exchange_group_foods` (con dueno y `is_excluded`) mas la columna
-- legacy, filtrada por tenant. Usar la columna cruda tendria dos efectos silenciosos: un alimento
-- que el coach EXCLUYO del grupo seguiria siendo aceptado, y sus agregados quedarian afuera. Hoy
-- los dos conjuntos coinciden (2.526 filas, cero divergencias), asi que esto no cambia ningun dato
-- — cambia que el veto del coach exista.
--
-- Diferencia deliberada con el resolver de porciones: la rama legacy NO exige
-- `exchange_portion_grams`. Ese resolver reparte porciones; T2.5 equivale por CALORIAS, y el
-- catalogo tiene las porciones de intercambio inconsistentes (SPEC H2: mediana 16,7% de
-- divergencia, p90 69%). Exigirlas aca dejaria fuera alimentos perfectamente equivalentes.
create or replace function private.nutrition_v2_exchange_group_ids(
  p_food_id uuid,
  p_coach_id uuid,
  p_org_id uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $function$
  with visible as (
    -- Rama 1: la lista con dueno. `owner_rank` = cuan cerca del alumno esta quien la declaro.
    select egf.exchange_group_id as gid,
           case
             when egf.coach_id is not null then 0
             when egf.org_id is not null then 1
             else 2
           end as owner_rank,
           egf.is_excluded
    from public.exchange_group_foods egf
    where egf.food_id = p_food_id
      and (
        (egf.coach_id is null and egf.org_id is null)
        or egf.coach_id = p_coach_id
        or (egf.org_id is not null and egf.org_id = p_org_id)
      )
    union all
    -- Rama 2: la columna legacy del alimento.
    select f.exchange_group_id, 3, false
    from public.foods f
    where f.id = p_food_id
      and f.exchange_group_id is not null
  ),
  best as (
    -- Una fila por grupo: gana el dueno mas cercano, y si ESE dijo "excluido", queda excluido.
    select distinct on (gid) gid, is_excluded
    from visible
    order by gid, owner_rank
  )
  select coalesce(array_agg(gid), '{}'::uuid[])
  from best
  where not is_excluded;
$function$;

revoke all on function private.nutrition_v2_exchange_group_ids(uuid, uuid, uuid) from public, anon, authenticated;

comment on function private.nutrition_v2_exchange_group_ids(uuid, uuid, uuid) is
  'T2.5: grupos de intercambio de un alimento, con la semantica del resolver de listas (overlay con dueno + legacy, is_excluded respetado, tenant filtrado). Sin exigir exchange_portion_grams: T2.5 equivale por calorias.';

-- ---------------------------------------------------------------------------
-- El guard
-- ---------------------------------------------------------------------------
create or replace function private.nutrition_v2_assert_substitution_authorized(
  p_prescription_item_id uuid,
  p_food_id uuid,
  p_custom_name text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_coach_id uuid;
  v_org_id uuid;
  v_item_food_id uuid;
  v_item_groups uuid[];
  v_food_groups uuid[];
begin
  if p_prescription_item_id is null then
    raise exception 'nutrition_v2_substitution_not_authorized:missing_item' using errcode = '42501';
  end if;

  -- (1) Autorizacion explicita del coach (T2.4, verbatim). Gana siempre: una fila autorizada vale
  --     aunque el alimento sea de otro grupo o de ninguno.
  if exists (
    select 1
    from public.nutrition_item_substitutions_v2 s
    where s.prescription_item_id = p_prescription_item_id
      and (
        (p_food_id is not null and s.food_id = p_food_id)
        or (
          p_food_id is null
          and s.food_id is null
          and nullif(btrim(p_custom_name), '') is not null
          and lower(btrim(coalesce(s.custom_name, s.snapshot_name, ''))) = lower(btrim(p_custom_name))
        )
      )
  ) then
    return;
  end if;

  -- (2) Equivalente del grupo (T2.5). Solo para alimentos del catalogo: un texto libre no
  --     pertenece a ningun grupo, asi que sigue exigiendo fila autorizada.
  if p_food_id is null then
    raise exception 'nutrition_v2_substitution_not_authorized' using errcode = '42501';
  end if;

  -- El item tiene que ser de una version vigente de un plan activo. Sin esto, cualquier item
  -- historico del alumno seria vector de escritura con etiqueta 'substitution' para ~700 alimentos.
  select pl.coach_id, pl.org_id, pi.food_id
    into v_coach_id, v_org_id, v_item_food_id
  from public.nutrition_prescription_items_v2 pi
  join public.nutrition_plan_versions_v2 v on v.id = pi.version_id
  join public.nutrition_plans_v2 pl on pl.id = v.plan_id
  where pi.id = p_prescription_item_id
    and v.status in ('published', 'superseded')
    and pl.lifecycle_status = 'active';

  if v_item_food_id is null then
    raise exception 'nutrition_v2_substitution_not_authorized' using errcode = '42501';
  end if;

  -- Visibilidad del alimento escrito: el mismo predicado que la RPC de opciones. Sin esto el
  -- servidor aceptaria alimentos PRIVADOS de otros coaches (19 en LIVE) que la UI no puede ofrecer.
  if not exists (
    select 1
    from public.foods f
    where f.id = p_food_id
      and (
        (f.coach_id is null and f.org_id is null)
        or f.coach_id = v_coach_id
        or (f.org_id is not null and f.org_id = v_org_id)
      )
  ) then
    raise exception 'nutrition_v2_substitution_not_authorized' using errcode = '42501';
  end if;

  v_item_groups := private.nutrition_v2_exchange_group_ids(v_item_food_id, v_coach_id, v_org_id);
  v_food_groups := private.nutrition_v2_exchange_group_ids(p_food_id, v_coach_id, v_org_id);

  if coalesce(array_length(v_item_groups, 1), 0) = 0
     or not (v_item_groups && v_food_groups) then
    raise exception 'nutrition_v2_substitution_not_authorized' using errcode = '42501';
  end if;
end;
$function$;

comment on function private.nutrition_v2_assert_substitution_authorized(uuid, uuid, text) is
  'T2.5: acepta la fila autorizada por el coach (T2.4) o un alimento del MISMO grupo de intercambio del item, con visibilidad de tenant y solo para items de versiones vigentes de planes activos.';
