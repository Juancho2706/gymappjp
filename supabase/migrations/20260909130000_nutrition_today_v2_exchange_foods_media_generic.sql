-- ============================================================================
-- EVA Nutricion V2 — «Porciones a la chilena» W5: FOTO y GENERICOS-PRIMERO en el
-- sheet «1 porcion equivale a» del alumno.
-- SPEC: docs/specs/nutrition-porciones-chilenas/SPEC.md §9 (D4-A)
-- ----------------------------------------------------------------------------
-- Por que existe. El sheet del alumno (web PortionEquivalencesSheet.tsx:230-256,
-- RN :238-278) muestra hoy una lista alfabetica sin foto en la que el 82 % de las
-- filas son productos de Open Food Facts: «Arroz» a secas aparece despues de tres
-- marcas de supermercado. La nutricionista que reporto el caso pide justo lo
-- contrario para dejar de mandar su PDF: el generico con su medida casera y su
-- foto arriba, las marcas abajo.
-- La foto NO falta en el componente: falta en el RPC. `get_nutrition_today_v2`
-- emite 7 llaves por alimento y ninguna es la imagen (read-models.ts:292-305).
--
-- Que hace. DOS empalmes de texto sobre la definicion VIVA:
--   1. la agregacion JSON gana `isGeneric`, `imagePath`, `imageVersion` e
--      `imageLicense`, y el ORDER pasa a
--      `eg.code, ranked.is_generic desc, ranked.portion_label_present desc,
--       ranked.name, ranked.id`;
--   2. el bloque de origen gana `is_generic` (= `f.brand is null`) y
--      `portion_label_present`, ESOS DOS CRITERIOS ENTRAN AL `row_number()` (no
--      solo al `order by` del `jsonb_agg`), y un `left join lateral` que resuelve
--      UNA foto por alimento con precedencia product_photo > eva_illustration.
--
-- POR QUE EL CRITERIO VA EN EL `row_number()` Y NO SOLO EN EL `jsonb_agg`.
-- El `where ranked.rn <= 60` CORTA antes de que el `order by` del agregado
-- ordene: lo que el agregado hace es reordenar los 60 que ya sobrevivieron. Con
-- el orden heredado de 20260804091000:53-57 (`owner_rank, name, id`) el corte es
-- ALFABETICO, y `PCT` tiene ~730 candidatos globales: marraqueta, hallulla, pan
-- de molde, papa y quinoa — los genericos con medida casera, o sea justo lo que
-- pide D4-A — quedan FUERA de los 60 y el alumno no los ve nunca. Por eso el
-- criterio `is_generic desc, portion_label_present desc` va en LOS DOS lugares:
-- en el `row_number()` decide QUIENES entran, y en el `jsonb_agg` decide en que
-- orden se pintan. Sacarlo del `row_number()` reabre el bug.
--
-- FORMA DEL PARCHE — no negociable. `create or replace` reconstruido desde
-- `pg_get_functiondef` empalmando SOLO entre anclas exactas, con asserts que
-- fallan en voz alta. NO se recopia el cuerpo: la ultima definicion COMPLETA del
-- repo es 20260720120000, anterior a 20260803194000, y copiarla revertiria la
-- fuga cross-tenant B1 (explicado en 20260906210308:45-56).
--
-- QUE SI VIAJA, ADEMAS DEL PATH, y por que:
--   · `imageVersion` (fm.version, integer chico) — CORRECCION OBLIGATORIA (R-02).
--     El helper que el sheet reutiliza, foodMediaThumbnailUrl
--     (apps/mobile/lib/nutrition-v2-food-media.ts:43-58), arma
--     `${base}/storage/v1/object/public/${bucket}/${path}?v=${media.version}`: sin
--     `version` NO hay cache-busting y, si alguna vez se reemplaza una foto
--     in-place, el alumno ve la vieja hasta que expire el cache del navegador.
--     Son 1-2 bytes por fila.
--   · `imageLicense` (fm.license) — el pie de atribucion tiene que ser
--     CONDICIONAL: de las fotos con imagen, unas son `cc_by_sa` de Open Food Facts
--     y otras son `eva_owned` / `supplier_authorized`. Un pie fijo «Fotos: Open
--     Food Facts (CC BY-SA)» sobre una ilustracion propia es una declaracion de
--     licencia falsa en las dos direcciones (seguridad S-08; OUTLINE §13 lo
--     canoniza en el read model). Es un enum corto.
--
-- QUE NO VIAJA, y por que:
--   · el objeto `media` completo (13 llaves de private.food_catalog_v2_media_json):
--     +136 % de payload (116 kB → 274 kB medido en LIVE sobre 532 filas). El cache
--     offline de RN descarta en silencio toda entrada > 750 kB
--     (apps/mobile/lib/nutrition-v2-cache.ts:6 y :70). Con `imagePath` +
--     `imageVersion` + `imageLicense` + `isGeneric` el payload sube ~25 %
--     (116 → 145 kB): las tres llaves nuevas son cortas frente al path.
--   · `bucket`: es constante por CHECK (20260714220000:9-10) y el cliente ya lo
--     hardcodea (apps/web/src/lib/food-image.ts:41-46).
--   · `attribution` (el texto largo por foto): la atribucion concreta se resuelve
--     con el pie condicional por `imageLicense`, no con una llave por fila.
--
-- `ranked.is_generic desc`: en Postgres `true` ordena DESPUES de `false` en ASC,
-- asi que `desc` es lo que pone los genericos PRIMERO. Queda escrito para que
-- nadie lo «arregle».
--
-- ADITIVA: misma firma, mismos grants, cero DDL, dos llaves nuevas en un JSON que
-- el read model declara OPCIONALES (un binario RN viejo con el RPC nuevo sigue
-- parseando).
--
-- ROLLBACK: re-aplicar 20260804091000 (que a su vez parte de la definicion viva)
-- y volver el ORDER a `eg.code, ranked.name, ranked.id`.
-- ============================================================================

do $do$
declare
  v_src text;
  v_out text;
  v_start integer;
  v_end integer;

  -- ── Empalme 1: la agregacion JSON y el ORDER del array ────────────────────
  v_agg_ini constant text := E'        ''portionGrams'', ranked.exchange_portion_grams\n      ) order by eg.code, ranked.name, ranked.id\n';
  v_agg_new constant text := E'        ''portionGrams'', ranked.exchange_portion_grams,\n        ''isGeneric'', ranked.is_generic,\n        ''imagePath'', img.object_path,\n        ''imageVersion'', img.version,\n        ''imageLicense'', img.license\n      ) order by eg.code, ranked.is_generic desc, ranked.portion_label_present desc, ranked.name, ranked.id\n';

  -- ── Empalme 2: el bloque de origen (mismas anclas de 20260804091000:47-49) ─
  v_ini constant text := E'    into v_exchange_foods\n';
  v_fin constant text := E'    where ranked.rn <= 60;\n';
  v_new constant text := $blk$    into v_exchange_foods
    from (
      select cand.id, cand.name, cand.brand, cand.exchange_group_id,
             cand.exchange_portion_label, cand.exchange_portion_grams,
             cand.is_generic, cand.portion_label_present,
             row_number() over (
               partition by cand.exchange_group_id
               order by cand.owner_rank,
                        cand.is_generic desc,
                        cand.portion_label_present desc,
                        cand.name, cand.id
             ) as rn
      from (
        -- Una fila por (grupo, alimento): gana el dueno mas cercano al alumno.
        select distinct on (src.exchange_group_id, src.id)
               src.id, src.name, src.brand, src.exchange_group_id,
               src.exchange_portion_label, src.exchange_portion_grams,
               src.owner_rank, src.is_excluded,
               src.is_generic, src.portion_label_present
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
                 egf.is_excluded,
                 (f.brand is null) as is_generic,
                 (egf.portion_label is not null) as portion_label_present
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
                 false as is_excluded,
                 (f.brand is null) as is_generic,
                 (f.exchange_portion_label is not null) as portion_label_present
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
    -- La foto: UNA por alimento, precedencia product_photo > eva_illustration.
    -- El lateral corre DESPUES del cap, asi que son maximo 60 lookups por grupo,
    -- servidos por food_media_food_kind_idx (20260714220000:41-42).
    left join lateral (
      select fm.object_path, fm.version, fm.license
      from public.food_media fm
      where fm.food_id = ranked.id
      order by fm.is_primary desc,
               case fm.kind
                 when 'product_photo' then 0
                 when 'eva_illustration' then 1
                 else 2
               end,
               fm.updated_at desc
      limit 1
    ) img on true
    where ranked.rn <= 60;
$blk$;
begin
  if to_regclass('public.food_media') is null then
    raise exception 'exchange_foods_media: falta la tabla food_media (aplica 20260714220000 primero)';
  end if;

  v_src := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);

  -- Assert de UNICIDAD de cada ancla (1 hit exacto) ANTES de tocar nada.
  if (length(v_src) - length(replace(v_src, v_agg_ini, ''))) / length(v_agg_ini) <> 1 then
    raise exception 'exchange_foods_media: el ancla de la agregacion JSON no aparece exactamente una vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_ini, ''))) / length(v_ini) <> 1 then
    raise exception 'exchange_foods_media: el ancla "into v_exchange_foods" no aparece exactamente una vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_fin, ''))) / length(v_fin) <> 1 then
    raise exception 'exchange_foods_media: el ancla del cap "rn <= 60" no aparece exactamente una vez';
  end if;

  -- Empalme 1 (esta ARRIBA del bloque; se hace primero y se re-lee el texto).
  v_src := replace(v_src, v_agg_ini, v_agg_new);

  -- Empalme 2.
  v_start := position(v_ini in v_src);
  v_end := position(v_fin in v_src);
  if v_end <= v_start then
    raise exception 'exchange_foods_media: anclas invertidas; el bloque no es contiguo';
  end if;
  v_out := left(v_src, v_start - 1) || v_new || substr(v_src, v_end + length(v_fin));

  execute v_out;
end
$do$;

-- ── Asserts finales: lo nuevo esta, y NADA de lo viejo se perdio ─────────────
do $do$
declare
  v_def text := pg_get_functiondef('public.get_nutrition_today_v2(uuid,date,text)'::regprocedure);
begin
  -- Lo nuevo.
  if position('''isGeneric''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave isGeneric';
  end if;
  if position('''imagePath''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave imagePath';
  end if;
  -- R-02: sin imageVersion no hay cache-busting y foodMediaThumbnailUrl no se
  -- puede reutilizar tal cual.
  if position('''imageVersion''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave imageVersion';
  end if;
  -- S-08: sin imageLicense el pie de atribucion no puede ser condicional.
  if position('''imageLicense''' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo la llave imageLicense';
  end if;
  if position('public.food_media fm' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo el lateral de food_media';
  end if;
  if position('ranked.is_generic desc' in v_def) = 0 then
    raise exception 'exchange_foods_media: no quedo el orden genericos-primero';
  end if;
  -- B1: el criterio TIENE que estar tambien en el row_number(), que es lo que
  -- decide quienes entran a los 60. Si solo esta en el jsonb_agg, el corte de
  -- PCT (~730 candidatos) sigue siendo alfabetico y la marraqueta no aparece.
  if position('cand.is_generic desc' in v_def) = 0
     or position('cand.portion_label_present desc' in v_def) = 0 then
    raise exception 'exchange_foods_media: el criterio genericos-primero no entro al row_number() (el cap rn <= 60 volveria a ser alfabetico)';
  end if;

  -- CANARIOS. Cada uno cuida un parche anterior que un copy-body borraria.
  if position('public.exchange_group_foods egf' in v_def) = 0 then
    raise exception 'exchange_foods_media: se perdio la lectura de exchange_group_foods (20260804091000)';
  end if;
  if position('where not cand.is_excluded' in v_def) = 0 then
    raise exception 'exchange_foods_media: se perdio el filtro de lapidas (20260804091000)';
  end if;
  if position('media' in v_def) = 0 or position('category' in v_def) = 0 then
    raise exception 'exchange_foods_media: se perdio el enriquecimiento de items (20260720120000)';
  end if;
  -- B1: el filtro de tenant vive en las DOS ramas del union all mas el resto de
  -- la funcion. Menos de 3 apariciones = fuga cross-tenant.
  if (length(v_def) - length(replace(v_def, 'cl.coach_id from public.clients cl', '')))
     / length('cl.coach_id from public.clients cl') < 3 then
    raise exception 'exchange_foods_media: falta el filtro de tenant en alguna rama (riesgo B1)';
  end if;

  raise notice 'exchange_foods_media OK: isGeneric + imagePath + imageVersion + imageLicense + orden genericos-primero, 4 canarios vivos';
end
$do$;
