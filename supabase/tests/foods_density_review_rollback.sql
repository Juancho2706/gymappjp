-- Nutricion V2 — W4.3 «Cantidades honestas»: smoke del guard de catalogo por DENSIDAD.
--
-- Cubre los invariantes que introduce
-- `supabase/migrations/20260906213000_foods_density_review.sql`
-- (SPEC docs/specs/nutrition-cantidades-honestas/SPEC.md §7.3):
--   A. un alimento NUEVO de categoria 'verdura', base per_100 y 500 kcal se GUARDA
--      igual (el guard avisa, no bloquea) y queda con
--      review_reason = 'density_veg_fruit_gt_150';
--   B. bajar ese alimento a 40 kcal LIMPIA la razon (vuelve a NULL);
--   C. un 'snack' de 500 kcal NO se marca (la regla es solo verdura/fruta);
--   D. una fila EXISTENTE de LIVE con verdura/fruta > 150 kcal NO se marca sola por
--      la migracion: sigue en NULL antes y despues de un UPDATE que no toca
--      calories/category/macros_basis (D.1), y recien se marca si alguien edita de
--      verdad esas columnas (D.2). Si el catalogo no tuviera ninguna fila asi, D se
--      salta con `raise notice`.
--
-- Seguro por construccion:
--   * A/B/C corren con `set local role authenticated` y el JWT de un coach REAL leido
--     en la transaccion (nunca service_role): el guard se ejercita por el mismo camino
--     que usa el editor de alimentos del coach, con la RLS de foods puesta;
--   * solo escribe dos alimentos propios de ese coach y, en D, toca UNA fila del
--     catalogo con el rol privilegiado;
--   * termina en ROLLBACK;
--   * levanta excepcion en cualquier asercion fallida.
--
-- COMO CORRERLO: con una conexion SQL PRIVILEGIADA (la misma con la que se aplican las
-- migraciones; D necesita el owner de la tabla para tocar una fila global sin RLS).
-- En LIVE: pegar el archivo COMPLETO en `execute_sql` / psql. NUNCA reemplazar el
-- ROLLBACK final por COMMIT, y nunca correrlo por partes (el fixture vive en la
-- transaccion).

begin;

create temporary table fdr_ctx (
  coach_id uuid not null,
  food_veg uuid not null,
  food_snack uuid not null,
  live_food uuid
) on commit drop;

-- El smoke corre A/B/C con `set local role authenticated`: sin este grant, la tabla
-- temporal (owner = rol de la sesion) queda inaccesible al cambiar de rol.
grant select, insert, update on fdr_ctx to authenticated;

insert into fdr_ctx (coach_id, food_veg, food_snack, live_food)
select
  c.id,
  gen_random_uuid(),
  gen_random_uuid(),
  (
    select f.id
    from public.foods f
    where f.category in ('verdura', 'fruta')
      and coalesce(f.macros_basis, 'per_100') = 'per_100'
      and f.calories > 150
    order by f.calories desc, f.id
    limit 1
  )
from public.coaches c
order by c.created_at, c.id
limit 1;

do $$
begin
  if not exists (select 1 from fdr_ctx) then
    raise exception 'foods_density_review_smoke_requires_at_least_one_coach';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', (select coach_id::text from fdr_ctx), true);
set local role authenticated;

-- ============================================================================
-- A — alta de «Mix de Vegetales» (verdura, per_100, 500 kcal): se GUARDA y queda marcado.
-- ============================================================================
do $$
declare
  ctx fdr_ctx%rowtype;
  v_reason text;
begin
  select * into ctx from fdr_ctx;

  insert into public.foods (
    id, name, brand, category, serving_size, serving_unit, macros_basis,
    calories, protein_g, carbs_g, fats_g, catalog_source, coach_id
  ) values (
    ctx.food_veg, 'Smoke W4.3 mix de vegetales', 'Smoke', 'verdura', 100, 'g', 'per_100',
    500, 5, 20, 44, 'coach', ctx.coach_id
  );

  select f.review_reason into v_reason from public.foods f where f.id = ctx.food_veg;

  if v_reason is distinct from 'density_veg_fruit_gt_150' then
    raise exception 'SMOKE FALLO (A): verdura per_100 de 500 kcal quedo con review_reason = % (esperado density_veg_fruit_gt_150)', coalesce(v_reason, '<null>');
  end if;
end;
$$;

-- ============================================================================
-- B — corregir la densidad (40 kcal) limpia la razon.
-- ============================================================================
do $$
declare
  ctx fdr_ctx%rowtype;
  v_reason text;
begin
  select * into ctx from fdr_ctx;

  update public.foods set calories = 40 where id = ctx.food_veg;

  select f.review_reason into v_reason from public.foods f where f.id = ctx.food_veg;

  if v_reason is not null then
    raise exception 'SMOKE FALLO (B): al bajar a 40 kcal la razon no se limpio (quedo %)', v_reason;
  end if;
end;
$$;

-- ============================================================================
-- C — un snack de 500 kcal es perfectamente plausible: NO se marca.
-- ============================================================================
do $$
declare
  ctx fdr_ctx%rowtype;
  v_reason text;
begin
  select * into ctx from fdr_ctx;

  insert into public.foods (
    id, name, brand, category, serving_size, serving_unit, macros_basis,
    calories, protein_g, carbs_g, fats_g, catalog_source, coach_id
  ) values (
    ctx.food_snack, 'Smoke W4.3 snack denso', 'Smoke', 'snack', 100, 'g', 'per_100',
    500, 6, 60, 26, 'coach', ctx.coach_id
  );

  select f.review_reason into v_reason from public.foods f where f.id = ctx.food_snack;

  if v_reason is not null then
    raise exception 'SMOKE FALLO (C): un snack de 500 kcal quedo marcado con %', v_reason;
  end if;
end;
$$;

reset role;

-- ============================================================================
-- D — las filas EXISTENTES no se tocan solas (sin backfill, sin default).
--     Se corre con el rol privilegiado: la fila candidata suele ser global
--     (coach_id null) y ningun cliente puede editarla.
-- ============================================================================
do $$
declare
  ctx fdr_ctx%rowtype;
  v_before text;
  v_after text;
begin
  select * into ctx from fdr_ctx;

  if ctx.live_food is null then
    raise notice 'SMOKE (D) SALTADO: el catalogo no tiene ninguna verdura/fruta per_100 con mas de 150 kcal';
    return;
  end if;

  select f.review_reason into v_before from public.foods f where f.id = ctx.live_food;

  if v_before is not null then
    raise exception 'SMOKE FALLO (D.1): la fila existente % ya venia con review_reason = % (la migracion no debia backfillear nada)', ctx.live_food, v_before;
  end if;

  -- (D.1) Un UPDATE que NO toca calories/category/macros_basis no dispara el trigger.
  update public.foods set updated_at = now() where id = ctx.live_food;

  select f.review_reason into v_after from public.foods f where f.id = ctx.live_food;
  if v_after is not null then
    raise exception 'SMOKE FALLO (D.1): un UPDATE ajeno a las tres columnas marco la fila (%)', v_after;
  end if;

  -- (D.2) Recien cuando alguien edita de verdad la densidad, el aviso aparece.
  update public.foods set calories = calories where id = ctx.live_food;

  select f.review_reason into v_after from public.foods f where f.id = ctx.live_food;
  if v_after is distinct from 'density_veg_fruit_gt_150' then
    raise exception 'SMOKE FALLO (D.2): al editar calories la fila existente no quedo marcada (review_reason = %)', coalesce(v_after, '<null>');
  end if;

  raise notice 'SMOKE (D) OK sobre la fila %', ctx.live_food;
end;
$$;

rollback;
