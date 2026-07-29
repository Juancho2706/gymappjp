-- Nutrition V2 — smoke de la curacion scoped (auditoria 2026-07-28).
--
-- Cubre los invariantes que introduce
-- `supabase/migrations/20260728131000_nutrition_v2_curation_scoped.sql`:
--   NUT-014  la bandeja y las mutaciones se filtran por el workspace ACTIVO
--            (standalone vs team), no por la union de policies PERMISSIVE;
--   NUT-023  resolver un codigo ya resuelto / de otro workspace lanza P0002
--            (no_data_found) en vez de reportar exito con cero filas actualizadas.
--
-- Seguro por construccion:
--   * toma un coach standalone existente con al menos DOS alumnos propios;
--   * crea un team temporal y mueve UNO de esos alumnos al pool del team;
--   * inserta solo `food_catalog_missing_codes` con identificadores generados;
--   * termina en ROLLBACK;
--   * levanta excepcion en cualquier asercion fallida.
--
-- Correr con una conexion SQL privilegiada. NUNCA reemplazar el ROLLBACK final por
-- COMMIT. No se ejecuto como parte del PR (protocolo: sin SQL contra remoto).

begin;

create temporary table nut_curation_ctx (
  coach_id uuid not null,
  solo_client_id uuid not null,
  team_client_id uuid not null,
  team_id uuid not null,
  food_id uuid not null,
  solo_code_id uuid not null,
  team_code_id uuid not null
) on commit drop;

insert into nut_curation_ctx
select
  a.coach_id,
  a.id,
  b.id,
  gen_random_uuid(),
  (
    select f.id
    from public.foods f
    where f.coach_id is null
      and f.org_id is null
      and f.verification_status <> 'rejected'
    limit 1
  ),
  gen_random_uuid(),
  gen_random_uuid()
from public.clients a
join public.clients b
  on b.coach_id = a.coach_id
 and b.id <> a.id
 and b.org_id is null
 and b.team_id is null
 and b.is_archived = false
where a.org_id is null
  and a.team_id is null
  and a.coach_id is not null
  and a.is_archived = false
limit 1;

do $$
begin
  if not exists (select 1 from nut_curation_ctx) then
    raise exception 'nutrition_v2_curation_smoke_requires_coach_with_two_standalone_clients';
  end if;
  if exists (select 1 from nut_curation_ctx where food_id is null) then
    raise exception 'nutrition_v2_curation_smoke_requires_global_food';
  end if;
end;
$$;

-- Fixture: team temporal del mismo coach + un alumno movido a ese pool.
insert into public.teams (id, name, slug, owner_coach_id)
select team_id, 'Curation smoke team', 'curation-smoke-' || left(team_id::text, 8), coach_id
from nut_curation_ctx;

update public.clients c
set team_id = ctx.team_id
from nut_curation_ctx ctx
where c.id = ctx.team_client_id;

insert into public.food_catalog_missing_codes (id, client_id, barcode, country_code)
select solo_code_id, solo_client_id, '7801234567890', 'CL' from nut_curation_ctx
union all
select team_code_id, team_client_id, '7801234567891', 'CL' from nut_curation_ctx;

select set_config(
  'request.jwt.claim.sub',
  (select coach_id::text from nut_curation_ctx),
  true
);
set local role authenticated;

-- ============================================================================
-- NUT-014 — la bandeja no mezcla pools
-- ============================================================================
do $$
declare
  ctx nut_curation_ctx%rowtype;
begin
  select * into ctx from nut_curation_ctx;

  if not exists (
    select 1 from public.list_missing_food_codes_scoped_v2('standalone', null, null, 0, 50) q
    where q.id = ctx.solo_code_id
  ) then
    raise exception 'SMOKE FALLO: el workspace standalone no ve su propio codigo (NUT-014)';
  end if;

  if exists (
    select 1 from public.list_missing_food_codes_scoped_v2('standalone', null, null, 0, 50) q
    where q.id = ctx.team_code_id
  ) then
    raise exception 'SMOKE FALLO: el workspace standalone ve el codigo del team (NUT-014)';
  end if;

  if not exists (
    select 1 from public.list_missing_food_codes_scoped_v2('team', ctx.team_id, null, 0, 50) q
    where q.id = ctx.team_code_id
  ) then
    raise exception 'SMOKE FALLO: el workspace team no ve el codigo de su pool (NUT-014)';
  end if;

  if exists (
    select 1 from public.list_missing_food_codes_scoped_v2('team', ctx.team_id, null, 0, 50) q
    where q.id = ctx.solo_code_id
  ) then
    raise exception 'SMOKE FALLO: el workspace team ve el codigo standalone (NUT-014)';
  end if;

  -- Organizacion: fuera de alcance, bandeja vacia (fail-closed).
  if exists (
    select 1 from public.list_missing_food_codes_scoped_v2('organization', null, gen_random_uuid(), 0, 50)
  ) then
    raise exception 'SMOKE FALLO: el scope organization devolvio filas (debe ser fail-closed)';
  end if;
end;
$$;

-- ============================================================================
-- NUT-014 / NUT-023 — resolver fuera del workspace activo no actualiza nada
-- ============================================================================
do $$
declare
  ctx nut_curation_ctx%rowtype;
begin
  select * into ctx from nut_curation_ctx;

  begin
    perform public.resolve_missing_food_code_scoped_v2(
      ctx.solo_code_id, ctx.food_id, 'team', ctx.team_id, null
    );
    raise exception 'SMOKE FALLO: se resolvio un codigo standalone desde el workspace team (NUT-014)';
  exception
    when no_data_found then null;
  end;

  if exists (
    select 1 from public.food_catalog_missing_codes m
    where m.id = ctx.solo_code_id and m.resolved_at is not null
  ) then
    raise exception 'SMOKE FALLO: el codigo quedo resuelto pese al scope equivocado (NUT-014)';
  end if;
end;
$$;

-- ============================================================================
-- NUT-023 — doble resolucion: la segunda lanza P0002, no exito falso
-- ============================================================================
do $$
declare
  ctx nut_curation_ctx%rowtype;
  v_id uuid;
begin
  select * into ctx from nut_curation_ctx;

  v_id := public.resolve_missing_food_code_scoped_v2(
    ctx.solo_code_id, ctx.food_id, 'standalone', null, null
  );
  if v_id is distinct from ctx.solo_code_id then
    raise exception 'SMOKE FALLO: la RPC scoped no devolvio el codigo resuelto';
  end if;

  if not exists (
    select 1 from public.food_catalog_missing_codes m
    where m.id = ctx.solo_code_id
      and m.resolved_at is not null
      and m.resolved_food_id = ctx.food_id
      and m.status = 'resolved'
  ) then
    raise exception 'SMOKE FALLO: la resolucion no persistio resolved_at/status';
  end if;

  begin
    perform public.resolve_missing_food_code_scoped_v2(
      ctx.solo_code_id, ctx.food_id, 'standalone', null, null
    );
    raise exception 'SMOKE FALLO: la segunda resolucion devolvio exito con cero filas (NUT-023)';
  exception
    when no_data_found then null;
  end;
end;
$$;

-- ============================================================================
-- NUT-014 / NUT-023 — crear+vincular: atomico, scoped y con barcode al alimento
-- ============================================================================
do $$
declare
  ctx nut_curation_ctx%rowtype;
  v_food_id uuid;
begin
  select * into ctx from nut_curation_ctx;

  -- Scope equivocado: ni siquiera crea el alimento (antes quedaba huerfano).
  begin
    perform public.create_food_and_resolve_missing_code_scoped_v2(
      ctx.team_code_id, 'Curation smoke huerfano', 100, 10, 10, 5, 'standalone', null, 'g', null, null
    );
    raise exception 'SMOKE FALLO: se creo+vinculo un codigo del team desde standalone (NUT-014)';
  exception
    when no_data_found then null;
  end;

  if exists (
    select 1 from public.foods f
    where f.coach_id = ctx.coach_id and f.name = 'Curation smoke huerfano'
  ) then
    raise exception 'SMOKE FALLO: quedo un alimento huerfano tras el fallo del vinculo (NUT-023)';
  end if;

  v_food_id := public.create_food_and_resolve_missing_code_scoped_v2(
    ctx.team_code_id, 'Curation smoke alimento', 100, 10, 10, 5, 'team', null, 'g', ctx.team_id, null
  );

  if not exists (
    select 1 from public.foods f
    where f.id = v_food_id
      and f.coach_id = ctx.coach_id
      and f.org_id is null
      and f.catalog_source = 'coach'
      and f.barcode = '7801234567891'
  ) then
    raise exception 'SMOKE FALLO: el alimento creado no quedo coach-scoped con el barcode del codigo';
  end if;

  if not exists (
    select 1 from public.food_catalog_missing_codes m
    where m.id = ctx.team_code_id
      and m.resolved_food_id = v_food_id
      and m.resolved_at is not null
  ) then
    raise exception 'SMOKE FALLO: crear+vincular no resolvio el codigo';
  end if;
end;
$$;

reset role;

rollback;
