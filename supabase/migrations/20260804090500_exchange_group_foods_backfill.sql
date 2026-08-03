-- ============================================================================
-- EVA Nutricion — F2: backfill de las clasificaciones vivas a exchange_group_foods
-- Spec: specs/nutrition-exchange-lists/SPEC.md · Tarea: TASKS.md T1.2
-- ----------------------------------------------------------------------------
-- Copia las clasificaciones que hoy viven en las columnas `foods.exchange_*`
-- (2.525 filas al 2026-08-03, de 4.648 alimentos) a la tabla nueva. El dueno se
-- HEREDA del alimento:
--   · alimento global (coach_id y org_id nulos) -> fila global (`source=catalog`)
--   · alimento propio de un coach               -> fila de ese coach
--   · alimento de una org                       -> fila de esa org
-- Asi la clasificacion no cambia de dueno al migrar y el aislamiento por tenant
-- sale igual antes y despues.
--
-- IDEMPOTENTE: `on conflict do nothing` sobre el unique (grupo, alimento, dueno).
-- Re-ejecutarla no duplica ni pisa lo que un coach haya editado despues.
--
-- NO borra ni toca las columnas `foods.exchange_*`: siguen siendo la rama legacy
-- del read-model hasta F5.
-- ============================================================================

-- Guard 1: la tabla destino debe existir (20260804090000).
do $$
begin
  if to_regclass('public.exchange_group_foods') is null then
    raise exception 'exchange_group_foods_backfill: falta la tabla (aplica 20260804090000 primero)';
  end if;
end $$;

-- Guard 2: `egf_owner_exclusive` prohibe coach_id y org_id a la vez. Las policies
-- de `foods` ya lo garantizan (foods_org_insert exige coach_id null), pero si
-- existiera una fila mixta el backfill fallaria a medias: mejor fallar antes.
do $$
declare
  v_mixtos integer;
begin
  select count(*) into v_mixtos
  from public.foods
  where coach_id is not null and org_id is not null
    and exchange_group_id is not null and exchange_portion_grams is not null;
  if v_mixtos > 0 then
    raise exception 'exchange_group_foods_backfill: % alimentos clasificados tienen coach_id y org_id a la vez', v_mixtos;
  end if;
end $$;

insert into public.exchange_group_foods (
  exchange_group_id,
  food_id,
  coach_id,
  org_id,
  portion_grams,
  portion_label,
  is_excluded,
  source
)
select
  f.exchange_group_id,
  f.id,
  case when f.org_id is null then f.coach_id else null end,
  f.org_id,
  f.exchange_portion_grams,
  f.exchange_portion_label,
  false,
  'catalog'
from public.foods f
where f.exchange_group_id is not null
  and f.exchange_portion_grams is not null
  and f.exchange_portion_grams > 0
  and f.exchange_portion_grams <= 5000
on conflict on constraint egf_group_food_owner_uq do nothing;

-- Reporte en voz alta: cuantas quedaron y cuantas clasificaciones vivas hay.
-- Si la tabla quedara por debajo del universo, el mensaje lo deja escrito en el
-- log de la migracion en vez de pasar en silencio.
do $$
declare
  v_origen integer;
  v_destino integer;
begin
  select count(*) into v_origen
  from public.foods
  where exchange_group_id is not null and exchange_portion_grams is not null;
  select count(*) into v_destino from public.exchange_group_foods where source = 'catalog';
  raise notice 'exchange_group_foods_backfill: origen=% destino(catalog)=%', v_origen, v_destino;
  if v_destino < v_origen then
    raise warning 'exchange_group_foods_backfill: quedaron % clasificaciones sin migrar (revisar rangos de gramos)', v_origen - v_destino;
  end if;
end $$;

-- ============================================================================
-- ROLLBACK: delete from public.exchange_group_foods where source = 'catalog';
-- ============================================================================
