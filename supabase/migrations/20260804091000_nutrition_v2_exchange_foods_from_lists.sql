-- ============================================================================
-- EVA Nutricion — F2: el sheet "1 porcion equivale a" lee la LISTA del coach
-- Spec: specs/nutrition-exchange-lists/SPEC.md · Tarea: TASKS.md T1.3
-- ----------------------------------------------------------------------------
-- Cambia la FUENTE del bloque `exchangeFoods` de `public.get_nutrition_today_v2`:
--
--   antes: solo las columnas `foods.exchange_*` (una verdad global por alimento)
--   ahora: union de `public.exchange_group_foods` (la lista con dueno) con esas
--          mismas columnas como rama LEGACY, resolviendo por precedencia
--
--          coach del alumno (0) > org del alumno (1) > global (2) > legacy (3)
--
-- Una sola fila gana por (grupo, alimento) — `distinct on` — asi que el alumno
-- nunca ve el mismo alimento dos veces con gramos distintos. Si la fila ganadora
-- es una LAPIDA (`is_excluded`), el alimento desaparece de la lista: es como el
-- coach saca del listado algo del catalogo global sin tocar el catalogo.
--
-- POR QUE SE CONSERVA LA RAMA LEGACY. Mientras exista un camino de escritura que
-- toque `foods.exchange_*` (alta rapida del builder, alta RN, curacion), leer solo
-- la tabla nueva perderia clasificaciones nuevas EN SILENCIO — el mismo modo de
-- falla que B4 el 2026-08-03. La rama sale en F5, cuando no queden escritores.
--
-- FILTRO DE TENANT. Se aplica a las DOS ramas y sobre las DOS entidades (la fila
-- de lista y el alimento): la funcion es SECURITY DEFINER y pasa por encima de
-- RLS — leccion B1. Reglas identicas a 20260803194000.
--
-- FORMA DEL PARCHE. `create or replace` reconstruido desde la definicion VIVA
-- (`pg_get_functiondef`) empalmando SOLO el bloque de exchangeFoods entre dos
-- anclas exactas, con asserts que fallan en voz alta. No se recopia el cuerpo
-- (17k caracteres): cualquier parche previo (media/category de 20260720120000,
-- gate de alumno bloqueado de 20260728123000, tenant de 20260803194000) se
-- conserva byte a byte.
--
-- ADITIVA: misma firma, mismos grants, cero DDL. El JSON `exchangeFoods` conserva
-- su forma; solo cambia QUE filas trae.
--
-- ROLLBACK: re-aplicar 20260803194000 (que a su vez parte de la definicion viva).
-- ============================================================================

do $do$
declare
  v_src text;
  v_out text;
  v_start integer;
  v_end integer;
  -- Anclas: `into v_exchange_foods` abre el bloque y el cap lo cierra. Ambas con
  -- su indentacion y su salto de linea para que el empalme no deje bordes sueltos.
  v_ini constant text := E'    into v_exchange_foods\n';
  v_fin constant text := E'    where ranked.rn <= 60;\n';
  v_new constant text := $blk$    into v_exchange_foods
    from (
      select cand.id, cand.name, cand.brand, cand.exchange_group_id,
             cand.exchange_portion_label, cand.exchange_portion_grams,
             row_number() over (
               partition by cand.exchange_group_id
               order by cand.owner_rank, cand.name, cand.id
             ) as rn
      from (
        -- Una fila por (grupo, alimento): gana el dueno mas cercano al alumno.
        select distinct on (src.exchange_group_id, src.id)
               src.id, src.name, src.brand, src.exchange_group_id,
               src.exchange_portion_label, src.exchange_portion_grams,
               src.owner_rank, src.is_excluded
        from (
          -- Rama 1: la lista con dueno (exchange_group_foods).
          select f.id, f.name, f.brand,
                 egf.exchange_group_id,
                 egf.portion_label as exchange_portion_label,
                 egf.portion_grams as exchange_portion_grams,
                 case
                   when egf.coach_id is not null then 0
                   when egf.org_id is not null then 1
                   else 2
                 end as owner_rank,
                 egf.is_excluded
          from public.exchange_group_foods egf
          join public.foods f on f.id = egf.food_id
          where egf.exchange_group_id = any(v_group_ids)
            and (
              (egf.coach_id is null and egf.org_id is null)
              or egf.coach_id = (select cl.coach_id from public.clients cl where cl.id = p_client_id)
              or (egf.org_id is not null
                  and egf.org_id = (select cl.org_id from public.clients cl where cl.id = p_client_id))
            )
            and (
              (f.coach_id is null and f.org_id is null)
              or f.coach_id = (select cl.coach_id from public.clients cl where cl.id = p_client_id)
              or (f.org_id is not null
                  and f.org_id = (select cl.org_id from public.clients cl where cl.id = p_client_id))
            )
          union all
          -- Rama 2 (LEGACY, sale en F5): las columnas exchange_* del alimento.
          select f.id, f.name, f.brand,
                 f.exchange_group_id,
                 f.exchange_portion_label, f.exchange_portion_grams,
                 3 as owner_rank,
                 false as is_excluded
          from public.foods f
          where f.exchange_group_id = any(v_group_ids)
            and f.exchange_portion_grams is not null
            and (
              (f.coach_id is null and f.org_id is null)
              or f.coach_id = (select cl.coach_id from public.clients cl where cl.id = p_client_id)
              or (f.org_id is not null
                  and f.org_id = (select cl.org_id from public.clients cl where cl.id = p_client_id))
            )
        ) src
        order by src.exchange_group_id, src.id, src.owner_rank
      ) cand
      where not cand.is_excluded
    ) ranked
    join public.exchange_groups eg on eg.id = ranked.exchange_group_id
    where ranked.rn <= 60;
$blk$;
begin
  if to_regclass('public.exchange_group_foods') is null then
    raise exception 'exchange_foods_from_lists: falta la tabla exchange_group_foods (aplica 20260804090000 primero)';
  end if;

  v_src := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);

  if (length(v_src) - length(replace(v_src, v_ini, ''))) / length(v_ini) <> 1 then
    raise exception 'exchange_foods_from_lists: el ancla "into v_exchange_foods" no aparece exactamente una vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_fin, ''))) / length(v_fin) <> 1 then
    raise exception 'exchange_foods_from_lists: el ancla del cap "rn <= 60" no aparece exactamente una vez (funcion ya parchada o cambiada)';
  end if;

  v_start := position(v_ini in v_src);
  v_end := position(v_fin in v_src);
  if v_end <= v_start then
    raise exception 'exchange_foods_from_lists: las anclas estan en orden invertido; el bloque no es contiguo';
  end if;

  v_out := left(v_src, v_start - 1) || v_new || substr(v_src, v_end + length(v_fin));

  execute v_out;
end
$do$;

-- Assert final: la definicion aplicada lee la tabla nueva, resuelve precedencia,
-- respeta las lapidas y conserva los parches previos.
do $do$
declare
  v_def text := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);
begin
  if position('public.exchange_group_foods egf' in v_def) = 0 then
    raise exception 'exchange_foods_from_lists: la funcion no quedo leyendo exchange_group_foods';
  end if;
  if position('order by src.exchange_group_id, src.id, src.owner_rank' in v_def) = 0 then
    raise exception 'exchange_foods_from_lists: no quedo la resolucion de precedencia por dueno';
  end if;
  if position('where not cand.is_excluded' in v_def) = 0 then
    raise exception 'exchange_foods_from_lists: no quedo el filtro de lapidas (is_excluded)';
  end if;
  -- El empalme toca UN bloque; el resto de la funcion debe seguir intacto. Estas
  -- dos marcas vienen del enriquecimiento de 20260720120000 (media / category) y
  -- son el canario de que no se recopio un cuerpo viejo por error.
  if position('media' in v_def) = 0 or position('category' in v_def) = 0 then
    raise exception 'exchange_foods_from_lists: la funcion perdio el enriquecimiento de 20260720120000';
  end if;
  -- Las DOS ramas (lista y legacy) llevan el filtro de tenant: sin el vuelve B1.
  if (length(v_def) - length(replace(v_def, 'cl.coach_id from public.clients cl', ''))) / length('cl.coach_id from public.clients cl') < 3 then
    raise exception 'exchange_foods_from_lists: falta el filtro de tenant en alguna rama (riesgo de fuga cross-tenant B1)';
  end if;
end
$do$;
