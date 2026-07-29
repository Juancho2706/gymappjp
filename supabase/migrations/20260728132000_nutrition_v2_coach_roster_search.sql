-- NUT-026 — Roster scoped del coach con BUSQUEDA y paginacion server-side.
--
-- Los tres pickers de Nutricion V2 ("Nuevo plan" del hub, "Asignar a otros alumnos" de la
-- ficha web, y su espejo RN) resolvian el roster paginando el hub scoped con un bucle
-- `for (page = 0; page < 8; page += 1)` de `pageSize: 50` y filtraban client-side. Dos
-- problemas: (1) tope silencioso de 400 alumnos — el #401 es invisible E inbuscable, sin
-- ningun aviso; (2) ocho round-trips RPC encadenados dentro del render RSC, y cada uno
-- calcula metricas de consumo (ultimo registro, dias activos 7d, borradores) que el picker
-- ni siquiera usa.
--
-- Esta funcion es NUEVA (nombre nuevo, no una firma nueva de la vigente): no toca
-- `get_nutrition_coach_hub_scoped_v2`, que sigue alimentando el roster del hub con sus
-- metricas. Devuelve solo lo que un selector de alumno necesita — id, nombre y estado del
-- plan — con `p_search` server-side y keyset alfabetico.
--
-- Autorizacion: identica al resto de las lecturas scoped — `private.
-- nutrition_v2_client_matches_workspace` re-valida contra `auth.uid()` que cada alumno
-- pertenece al workspace declarado, asi que el scope NUNCA se cree del cliente.

create or replace function public.get_nutrition_coach_roster_scoped_v2(
  p_scope_type text,
  p_team_id uuid default null,
  p_org_id uuid default null,
  p_search text default null,
  p_cursor_name text default null,
  p_cursor_client_id uuid default null,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_needle text;
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_coach_roster_auth_required' using errcode = '42501';
  end if;
  if p_scope_type not in ('standalone', 'team', 'organization') then
    raise exception 'nutrition_v2_invalid_workspace_scope' using errcode = '22023';
  end if;

  -- Busqueda tolerante a mayusculas y acentos SIN depender de extensiones (unaccent/pg_trgm
  -- no estan garantizadas): se normaliza a minusculas y se pliegan las vocales acentuadas del
  -- espanol en ambos lados. Los comodines de LIKE se escapan para que un `%` tipeado por el
  -- coach no devuelva el roster entero.
  if v_search is not null then
    v_needle := '%' || replace(
      replace(
        replace(
          translate(lower(left(v_search, 120)), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
          '\', '\\'
        ),
        '%', '\%'
      ),
      '_', '\_'
    ) || '%';
  end if;

  with scoped as (
    select
      c.id,
      c.full_name,
      coalesce(c.full_name, '') as sort_name
    from public.clients c
    where private.nutrition_v2_client_matches_workspace(
        c.id,
        p_scope_type,
        p_team_id,
        p_org_id
      )
      and c.is_archived = false
      and (
        v_needle is null
        or translate(lower(coalesce(c.full_name, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc')
             like v_needle escape '\'
      )
      and (
        p_cursor_name is null
        or (coalesce(c.full_name, ''), c.id) > (p_cursor_name, coalesce(p_cursor_client_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    order by sort_name asc, id asc
    limit v_page_size + 1
  ), page as (
    select *
    from scoped
    order by sort_name asc, id asc
    limit v_page_size
  ), rows as (
    select
      p.id as client_id,
      p.full_name,
      p.sort_name,
      ps.status as plan_status
    from page p
    left join lateral (
      select v.status
      from public.nutrition_plans_v2 pl
      join public.nutrition_plan_versions_v2 v
        on v.id = pl.current_published_version_id
      where pl.client_id = p.id
        and pl.lifecycle_status = 'active'
      order by pl.updated_at desc, pl.id desc
      limit 1
    ) ps on true
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'clientId', client_id,
        'clientName', full_name,
        'planStatus', plan_status
      ) order by sort_name asc, client_id asc
    ), '[]'::jsonb),
    (select count(*) from scoped) > v_page_size,
    case
      when (select count(*) from scoped) > v_page_size then (
        select jsonb_build_object('name', sort_name, 'clientId', client_id)
        from rows
        order by sort_name desc, client_id desc
        limit 1
      )
      else null
    end
  into v_items, v_has_more, v_next
  from rows;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'items', v_items,
    'nextCursor', v_next,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$$;

revoke all on function public.get_nutrition_coach_roster_scoped_v2(
  text, uuid, uuid, text, text, uuid, integer
) from public, anon;

grant execute on function public.get_nutrition_coach_roster_scoped_v2(
  text, uuid, uuid, text, text, uuid, integer
) to authenticated;

comment on function public.get_nutrition_coach_roster_scoped_v2(
  text, uuid, uuid, text, text, uuid, integer
) is
  'Lightweight coach roster (id, name, plan status) for Nutrition V2 student pickers: '
  'server-side accent/case-insensitive search + alphabetical keyset pagination, constrained '
  'to one validated standalone/team/organization workspace (NUT-026).';
