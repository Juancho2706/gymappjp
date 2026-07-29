-- Nutrition V2 — curacion del coach con scope de workspace explicito y resolucion atomica.
--
-- Cierra NUT-014 (la bandeja de curacion mezclaba clientes standalone con los de TODOS los
-- teams activos porque leia/escribia por PostgREST y la union de policies PERMISSIVE es
-- "propio OR pool de cualquier team") y NUT-023 (el UPDATE sin rowcount reportaba exito con
-- cero filas: codigo ya resuelto, id inexistente o fuera de scope devolvian ok).
--
-- Patron identico al resto de lecturas coach V2 (20260714211000): SECURITY DEFINER,
-- `set search_path = ''`, objetos calificados y filtro por
-- `private.nutrition_v2_client_matches_workspace(...)`. Aditivo: no toca policies ni grants
-- existentes; solo agrega tres funciones y sus grants.
--
-- Scope `organization`: fuera del alcance funcional soportado por la curacion (no existe
-- policy de pool de organizacion sobre `public.foods`, asi que un alimento creado ahi seria
-- invisible para el resto). Fail-closed: la bandeja vuelve vacia y las mutaciones se niegan,
-- en vez de inventar semantica.

-- ---------------------------------------------------------------------------
-- 1) Bandeja scoped
-- ---------------------------------------------------------------------------

create or replace function public.list_missing_food_codes_scoped_v2(
  p_scope_type text,
  p_team_id uuid default null,
  p_org_id uuid default null,
  p_offset integer default 0,
  p_page_size integer default 21
)
returns table (
  id uuid,
  barcode text,
  country_code text,
  sightings integer,
  first_seen_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 21), 1), 51);
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_curation_auth_required' using errcode = '42501';
  end if;

  if p_scope_type not in ('standalone', 'team', 'organization') then
    raise exception 'nutrition_v2_invalid_workspace_scope' using errcode = '22023';
  end if;

  -- Fail-closed: organizacion no soportada -> bandeja vacia (nunca la union de pools).
  if p_scope_type = 'organization' then
    return;
  end if;

  return query
  select
    m.id,
    m.barcode,
    m.country_code,
    m.sightings,
    m.first_seen_at,
    m.last_seen_at
  from public.food_catalog_missing_codes m
  where m.resolved_at is null
    and private.nutrition_v2_client_matches_workspace(
      m.client_id,
      p_scope_type,
      p_team_id,
      p_org_id
    )
  order by m.last_seen_at desc, m.id desc
  limit v_page_size
  offset v_offset;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Vincular un codigo con una fila existente del catalogo
-- ---------------------------------------------------------------------------

create or replace function public.resolve_missing_food_code_scoped_v2(
  p_missing_code_id uuid,
  p_food_id uuid,
  p_scope_type text,
  p_team_id uuid default null,
  p_org_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_curation_auth_required' using errcode = '42501';
  end if;

  if p_scope_type not in ('standalone', 'team', 'organization') then
    raise exception 'nutrition_v2_invalid_workspace_scope' using errcode = '22023';
  end if;

  if p_scope_type = 'organization' then
    raise exception 'nutrition_v2_curation_scope_unsupported' using errcode = '42501';
  end if;

  if p_missing_code_id is null or p_food_id is null then
    raise exception 'nutrition_v2_curation_invalid_payload' using errcode = '22023';
  end if;

  -- El alimento destino debe ser legible por quien resuelve: sin esto un coach podia
  -- apuntar el codigo a cualquier `foods.id` de la base (amplificador NUT-014).
  if not private.food_catalog_v2_can_read_food(p_food_id) then
    raise exception 'nutrition_v2_curation_food_not_visible' using errcode = '42501';
  end if;

  update public.food_catalog_missing_codes m
  set
    resolved_food_id = p_food_id,
    resolved_at = now(),
    status = 'resolved'
  where m.id = p_missing_code_id
    and m.resolved_at is null
    and private.nutrition_v2_client_matches_workspace(
      m.client_id,
      p_scope_type,
      p_team_id,
      p_org_id
    )
  returning m.id into v_id;

  -- Cero filas = ya resuelto, inexistente o fuera del workspace activo. Error honesto en
  -- vez del exito falso que devolvia el UPDATE por PostgREST.
  if v_id is null then
    raise exception 'nutrition_v2_curation_missing_code_not_found' using errcode = 'P0002';
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Crear alimento coach-scoped + vincular, en una sola transaccion
-- ---------------------------------------------------------------------------

create or replace function public.create_food_and_resolve_missing_code_scoped_v2(
  p_missing_code_id uuid,
  p_name text,
  p_calories numeric,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fats_g numeric,
  p_scope_type text,
  p_brand text default null,
  p_unit text default 'g',
  p_team_id uuid default null,
  p_org_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_brand text := nullif(btrim(coalesce(p_brand, '')), '');
  v_unit text := coalesce(p_unit, 'g');
  v_barcode text;
  v_food_id uuid;
  v_resolved_id uuid;
begin
  if v_coach_id is null then
    raise exception 'nutrition_v2_curation_auth_required' using errcode = '42501';
  end if;

  if p_scope_type not in ('standalone', 'team', 'organization') then
    raise exception 'nutrition_v2_invalid_workspace_scope' using errcode = '22023';
  end if;

  if p_scope_type = 'organization' then
    raise exception 'nutrition_v2_curation_scope_unsupported' using errcode = '42501';
  end if;

  if p_missing_code_id is null
    or char_length(v_name) not between 1 and 180
    or char_length(coalesce(v_brand, '')) > 180
    or v_unit not in ('g', 'ml')
    or p_calories is null or p_calories < 0 or p_calories > 2000
    or p_protein_g is null or p_protein_g < 0 or p_protein_g > 500
    or p_carbs_g is null or p_carbs_g < 0 or p_carbs_g > 500
    or p_fats_g is null or p_fats_g < 0 or p_fats_g > 500 then
    raise exception 'nutrition_v2_curation_invalid_payload' using errcode = '22023';
  end if;

  -- Tomamos el codigo pendiente ANTES de crear nada: si ya esta resuelto o no pertenece al
  -- workspace activo abortamos sin dejar alimentos huerfanos (la compensacion best-effort
  -- del cliente desaparece: la transaccion de la funcion es la garantia).
  select m.barcode
  into v_barcode
  from public.food_catalog_missing_codes m
  where m.id = p_missing_code_id
    and m.resolved_at is null
    and private.nutrition_v2_client_matches_workspace(
      m.client_id,
      p_scope_type,
      p_team_id,
      p_org_id
    )
  for update;

  if v_barcode is null then
    raise exception 'nutrition_v2_curation_missing_code_not_found' using errcode = 'P0002';
  end if;

  -- Idempotencia: un reintento reusa el alimento coach-scoped con el mismo nombre.
  select f.id
  into v_food_id
  from public.foods f
  where f.coach_id = v_coach_id
    and f.org_id is null
    and f.catalog_source = 'coach'
    and lower(btrim(f.name)) = lower(v_name)
  order by f.updated_at desc nulls last, f.id
  limit 1;

  if v_food_id is null then
    -- coach_id = auth.uid() y org_id null replican `foods_insert_own` (esta funcion es
    -- SECURITY DEFINER: la RLS no aplica, la restriccion es explicita aqui).
    insert into public.foods (
      name,
      brand,
      coach_id,
      org_id,
      calories,
      protein_g,
      carbs_g,
      fats_g,
      serving_size,
      serving_unit,
      is_liquid,
      category,
      country_code,
      catalog_source,
      verification_status
    ) values (
      v_name,
      v_brand,
      v_coach_id,
      null,
      p_calories,
      p_protein_g,
      p_carbs_g,
      p_fats_g,
      100,
      v_unit,
      v_unit = 'ml',
      'otro',
      'CL',
      'coach',
      'coach_verified'
    )
    returning id into v_food_id;
  end if;

  -- Sin esto resolver no cambiaba nada para el alumno: `lookup_food_by_gtin_v2` busca por
  -- `foods.barcode`. Solo se escribe si la fila no tiene codigo y ningun otro alimento del
  -- mismo coach ya lo usa (el unique parcial global solo cubre filas sin coach ni org).
  update public.foods f
  set barcode = v_barcode
  where f.id = v_food_id
    and f.coach_id = v_coach_id
    and f.org_id is null
    and f.barcode is null
    and not exists (
      select 1
      from public.foods other
      where other.barcode = v_barcode
        and other.id <> v_food_id
        and other.coach_id = v_coach_id
        and other.org_id is null
    );

  update public.food_catalog_missing_codes m
  set
    resolved_food_id = v_food_id,
    resolved_at = now(),
    status = 'resolved'
  where m.id = p_missing_code_id
    and m.resolved_at is null
  returning m.id into v_resolved_id;

  if v_resolved_id is null then
    raise exception 'nutrition_v2_curation_missing_code_not_found' using errcode = 'P0002';
  end if;

  return v_food_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: solo las tres funciones nuevas. Nada se revoca de lo existente.
-- ---------------------------------------------------------------------------

revoke all on function public.list_missing_food_codes_scoped_v2(
  text, uuid, uuid, integer, integer
) from public, anon;
revoke all on function public.resolve_missing_food_code_scoped_v2(
  uuid, uuid, text, uuid, uuid
) from public, anon;
revoke all on function public.create_food_and_resolve_missing_code_scoped_v2(
  uuid, text, numeric, numeric, numeric, numeric, text, text, text, uuid, uuid
) from public, anon;

grant execute on function public.list_missing_food_codes_scoped_v2(
  text, uuid, uuid, integer, integer
) to authenticated;
grant execute on function public.resolve_missing_food_code_scoped_v2(
  uuid, uuid, text, uuid, uuid
) to authenticated;
grant execute on function public.create_food_and_resolve_missing_code_scoped_v2(
  uuid, text, numeric, numeric, numeric, numeric, text, text, text, uuid, uuid
) to authenticated;

comment on function public.list_missing_food_codes_scoped_v2(
  text, uuid, uuid, integer, integer
) is 'Curation queue constrained to one validated standalone or team workspace (organization returns empty).';
comment on function public.resolve_missing_food_code_scoped_v2(
  uuid, uuid, text, uuid, uuid
) is 'Links a pending GTIN to a readable food inside the active workspace; raises P0002 when nothing was updated.';
comment on function public.create_food_and_resolve_missing_code_scoped_v2(
  uuid, text, numeric, numeric, numeric, numeric, text, text, text, uuid, uuid
) is 'Atomically creates the coach food (with barcode when free) and resolves the pending GTIN inside the active workspace.';
