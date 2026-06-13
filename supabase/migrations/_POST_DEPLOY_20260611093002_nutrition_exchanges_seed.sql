-- POST_DEPLOY — Seed del modulo NUTRICION POR INTERCAMBIOS (`nutrition_exchanges`).
-- Spec: specs/movida-intercambios/PLAN.md §Seed · Requiere 20260611093001_nutrition_exchanges.sql.
-- Convencion _POST_DEPLOY_ del repo: NO entra al historial de migraciones del CLI; se ejecuta
-- manualmente (branch MCP / execute_sql) despues de la DDL. Idempotente y RE-EJECUTABLE:
-- - Grupos: ON CONFLICT (id) DO UPDATE ... WHERE macros_confirmed = false => re-correr refresca
--   valores PROVISORIOS pero JAMAS pisa un grupo ya confirmado con Fran.
-- - Foods: INSERT solo si no existe (por nombre, system) y UPDATE de equivalencia solo si
--   exchange_group_id IS NULL => jamas pisa correcciones manuales posteriores.
--
-- VALORES PROVISORIOS (macros_confirmed = false en TODOS los grupos): referencias SMAE/UDD
-- ("Manual de Porciones de Intercambio para Chile", UDD 2021). La nomenclatura de Fran manda;
-- ref_* y equivalencias se validan contra su guia (`PORCIONES DE INTERCAMBIO.pdf`) — bloqueante
-- #1 del director §7. La UI muestra badge "referencial" mientras macros_confirmed = false (AC3).

-- ============ 1) Grupos system (8 simples + LEG compuesto = 9) ============
-- UUIDs fijos (patron workout_section_templates) para referencias estables en codigo y tests.
-- Orden (sort_order) = orden de la guia de Fran. color NULL = paleta derivada por sort_order.
-- LEG: ref_* = 0 + composed_of => packages/calc expande 1P+1C (NO duplicar macros en ref_*).
INSERT INTO public.exchange_groups
  (id, slug, code, name, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, sort_order, composed_of, macros_confirmed)
VALUES
  ('0000e8c0-0000-0000-0000-000000000001', 'cereales',             'C',   'Carbohidratos/Cereales',       true,  70, 2,  15, 0, 10, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000002', 'proteinas-bajo-grasa', 'P',   'Proteinas (bajo grasa)',       true,  55, 7,  0,  3, 20, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000003', 'frutas',               'F',   'Frutas',                       true,  60, 0,  15, 0, 30, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000004', 'verduras',             'V',   'Verduras',                     true,  25, 2,  4,  0, 40, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000005', 'lacteos',              'LAC', 'Lacteo',                       true,  95, 9,  12, 2, 50, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000006', 'ricos-en-lipidos',     'ARL', 'Alimento rico en lipidos',     true,  45, 0,  0,  5, 60, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000007', 'scoop-proteina',       'SP',  'Scoop proteina',               true, 120, 24, 2,  1, 70, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000008', 'grasa-cocina',         'G',   'Grasa de cocina',              true,  45, 0,  0,  5, 80, NULL, false),
  ('0000e8c0-0000-0000-0000-000000000009', 'legumbres',            'LEG', 'Legumbres',                    true,   0, 0,  0,  0, 90,
    '[{"code":"P","portions":1},{"code":"C","portions":1}]'::jsonb, false)
ON CONFLICT (id) DO UPDATE SET
  slug             = EXCLUDED.slug,
  code             = EXCLUDED.code,
  name             = EXCLUDED.name,
  is_system        = true,
  coach_id         = NULL,
  team_id          = NULL,
  ref_calories     = EXCLUDED.ref_calories,
  ref_protein_g    = EXCLUDED.ref_protein_g,
  ref_carbs_g      = EXCLUDED.ref_carbs_g,
  ref_fats_g       = EXCLUDED.ref_fats_g,
  sort_order       = EXCLUDED.sort_order,
  composed_of      = EXCLUDED.composed_of,
  deleted_at       = NULL,
  updated_at       = now()
WHERE exchange_groups.macros_confirmed = false;  -- jamas pisar valores confirmados con Fran

-- ============ 2) Equivalencias alimento -> porcion (foods system, productos chilenos) ============
-- Medida casera + gramos estilo UDD (taza 200 cc, cucharada 10 cc, cucharadita 5 cc).
-- FIX gate 2026-06-11: category mapeada al CHECK real foods_category_check (proteina|carbohidrato|
-- grasa|lacteo|fruta|verdura|legumbre|bebida|snack|otro) — los valores display originales lo violaban.
-- Macros por porcion = ref del grupo (definicion del metodo: 1 porcion ~ macros de referencia);
-- LEG = suma P+C (125 kcal / 9 P / 15 C / 3 G). STARTER SET provisorio: la lista definitiva sale
-- de `PORCIONES DE INTERCAMBIO.pdf` de Fran (no versionado en el repo) — spot-check obligatorio
-- de 5 equivalencias contra su PDF antes del merge (TASKS T1.3).
DROP TABLE IF EXISTS _exchange_seed;
CREATE TEMP TABLE _exchange_seed (
  food_name      text PRIMARY KEY,
  group_slug     text NOT NULL,
  portion_grams  numeric NOT NULL,
  portion_label  text NOT NULL,
  calories       numeric NOT NULL,
  protein_g      numeric NOT NULL,
  carbs_g        numeric NOT NULL,
  fats_g         numeric NOT NULL,
  is_liquid      boolean NOT NULL,
  category       text NOT NULL
);

INSERT INTO _exchange_seed VALUES
  -- C — Carbohidratos/Cereales (70 kcal / 2 P / 15 C / 0 G)
  ('Pan marraqueta',               'cereales',             50,  '1/2 unidad',        70, 2, 15, 0, false, 'carbohidrato'),
  ('Pan hallulla',                 'cereales',             50,  '1/2 unidad',        70, 2, 15, 0, false, 'carbohidrato'),
  ('Arroz cocido',                 'cereales',             80,  '1/2 taza',          70, 2, 15, 0, false, 'carbohidrato'),
  ('Fideos cocidos',               'cereales',             80,  '1/2 taza',          70, 2, 15, 0, false, 'carbohidrato'),
  ('Papa cocida',                  'cereales',             100, '1 unidad chica',    70, 2, 15, 0, false, 'carbohidrato'),
  ('Avena tradicional',            'cereales',             30,  '1/3 taza',          70, 2, 15, 0, false, 'carbohidrato'),
  ('Choclo desgranado',            'cereales',             80,  '1/2 taza',          70, 2, 15, 0, false, 'carbohidrato'),
  ('Quinoa cocida',                'cereales',             80,  '1/2 taza',          70, 2, 15, 0, false, 'carbohidrato'),
  -- P — Proteinas bajo grasa (55 kcal / 7 P / 0 C / 3 G)
  ('Pechuga de pollo cocida',      'proteinas-bajo-grasa', 30,  '1 trozo chico',     55, 7, 0,  3, false, 'proteina'),
  ('Posta de vacuno cocida',       'proteinas-bajo-grasa', 30,  '1 trozo chico',     55, 7, 0,  3, false, 'proteina'),
  ('Merluza cocida',               'proteinas-bajo-grasa', 40,  '1 trozo chico',     55, 7, 0,  3, false, 'proteina'),
  ('Atun al agua',                 'proteinas-bajo-grasa', 40,  '1/4 taza',          55, 7, 0,  3, false, 'proteina'),
  ('Huevo',                        'proteinas-bajo-grasa', 50,  '1 unidad',          55, 7, 0,  3, false, 'proteina'),
  ('Pavo molido cocido',           'proteinas-bajo-grasa', 30,  '2 cucharadas',      55, 7, 0,  3, false, 'proteina'),
  -- F — Frutas (60 kcal / 0 P / 15 C / 0 G)
  ('Manzana',                      'frutas',               100, '1 unidad chica',    60, 0, 15, 0, false, 'fruta'),
  ('Platano',                      'frutas',               60,  '1/2 unidad',        60, 0, 15, 0, false, 'fruta'),
  ('Naranja',                      'frutas',               120, '1 unidad chica',    60, 0, 15, 0, false, 'fruta'),
  ('Pera',                         'frutas',               100, '1 unidad chica',    60, 0, 15, 0, false, 'fruta'),
  ('Uvas',                         'frutas',               90,  '10 unidades',       60, 0, 15, 0, false, 'fruta'),
  ('Frutillas',                    'frutas',               200, '1 taza',            60, 0, 15, 0, false, 'fruta'),
  -- V — Verduras (25 kcal / 2 P / 4 C / 0 G)
  ('Tomate',                       'verduras',             120, '1 unidad',          25, 2, 4,  0, false, 'verdura'),
  ('Lechuga',                      'verduras',             50,  '1 taza',            25, 2, 4,  0, false, 'verdura'),
  ('Zanahoria cruda',              'verduras',             50,  '1/2 taza',          25, 2, 4,  0, false, 'verdura'),
  ('Brocoli cocido',               'verduras',             80,  '1/2 taza',          25, 2, 4,  0, false, 'verdura'),
  ('Espinaca cruda',               'verduras',             30,  '1 taza',            25, 2, 4,  0, false, 'verdura'),
  -- LAC — Lacteo (95 kcal / 9 P / 12 C / 2 G; subdividir por % grasa cuando Fran confirme)
  ('Leche descremada',             'lacteos',              200, '1 taza (200 cc)',   95, 9, 12, 2, true,  'lacteo'),
  ('Leche semidescremada',         'lacteos',              200, '1 taza (200 cc)',   95, 9, 12, 2, true,  'lacteo'),
  ('Yogur descremado',             'lacteos',              125, '1 unidad',          95, 9, 12, 2, false, 'lacteo'),
  -- ARL — Alimento rico en lipidos (45 kcal / 0 P / 0 C / 5 G)
  ('Palta',                        'ricos-en-lipidos',     30,  '2 cucharadas',      45, 0, 0,  5, false, 'grasa'),
  ('Almendras',                    'ricos-en-lipidos',     10,  '1 cucharada',       45, 0, 0,  5, false, 'grasa'),
  ('Nueces',                       'ricos-en-lipidos',     8,   '2 mariposas',       45, 0, 0,  5, false, 'grasa'),
  ('Mani sin sal',                 'ricos-en-lipidos',     10,  '1 cucharada',       45, 0, 0,  5, false, 'grasa'),
  ('Aceitunas',                    'ricos-en-lipidos',     30,  '5 unidades',        45, 0, 0,  5, false, 'grasa'),
  -- SP — Scoop proteina (120 kcal / 24 P / 2 C / 1 G; generico, override por producto pendiente Fran)
  ('Proteina en polvo (scoop)',    'scoop-proteina',       30,  '1 scoop',          120, 24, 2, 1, false, 'proteina'),
  -- G — Grasa de cocina (45 kcal / 0 P / 0 C / 5 G)
  ('Aceite de oliva',              'grasa-cocina',         5,   '1 cucharadita',     45, 0, 0,  5, true,  'grasa'),
  ('Aceite vegetal',               'grasa-cocina',         5,   '1 cucharadita',     45, 0, 0,  5, true,  'grasa'),
  ('Mantequilla',                  'grasa-cocina',         5,   '1 cucharadita',     45, 0, 0,  5, false, 'grasa'),
  -- LEG — Legumbres (compuesto 1P+1C => 125 kcal / 9 P / 15 C / 3 G por porcion)
  ('Porotos cocidos',              'legumbres',            130, '3/4 taza',         125, 9, 15, 3, false, 'legumbre'),
  ('Lentejas cocidas',             'legumbres',            130, '3/4 taza',         125, 9, 15, 3, false, 'legumbre'),
  ('Garbanzos cocidos',            'legumbres',            130, '3/4 taza',         125, 9, 15, 3, false, 'legumbre');

-- 2a) INSERT de foods system faltantes (coach_id NULL, org_id NULL). Guard por nombre (case-
-- insensitive) entre foods system: re-ejecutable sin duplicados. serving = la porcion de intercambio.
INSERT INTO public.foods
  (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, coach_id, org_id)
SELECT
  e.food_name, e.calories, e.protein_g, e.carbs_g, e.fats_g, e.portion_grams, 'g', e.is_liquid, e.category, NULL, NULL
FROM _exchange_seed e
WHERE NOT EXISTS (
  SELECT 1 FROM public.foods f
  WHERE lower(f.name) = lower(e.food_name) AND f.coach_id IS NULL AND f.org_id IS NULL
);

-- 2b) UPDATE de equivalencias sobre foods system donde el match por nombre es claro.
-- Solo asigna donde exchange_group_id IS NULL: jamas pisa una equivalencia ya curada a mano.
-- foods.category queda como display (no se migra destructivamente).
UPDATE public.foods f
SET exchange_group_id      = g.id,
    exchange_portion_grams = e.portion_grams,
    exchange_portion_label = e.portion_label
FROM _exchange_seed e
JOIN public.exchange_groups g
  ON g.slug = e.group_slug AND g.is_system AND g.deleted_at IS NULL
WHERE lower(f.name) = lower(e.food_name)
  AND f.coach_id IS NULL AND f.org_id IS NULL
  AND f.exchange_group_id IS NULL;

DROP TABLE IF EXISTS _exchange_seed;

-- ============ 3) Asserts de verificacion (TASKS T1.3: conteo de grupos + equivalencias) ============
DO $$
DECLARE
  v_groups int;
  v_mapped int;
BEGIN
  SELECT count(*) INTO v_groups
  FROM public.exchange_groups
  WHERE is_system AND deleted_at IS NULL;
  IF v_groups < 9 THEN
    RAISE EXCEPTION 'seed incompleto: % grupos system (esperado >= 9)', v_groups;
  END IF;

  SELECT count(*) INTO v_mapped
  FROM public.foods
  WHERE exchange_group_id IS NOT NULL AND coach_id IS NULL AND org_id IS NULL;
  IF v_mapped < 30 THEN
    RAISE EXCEPTION 'seed incompleto: % foods system con equivalencia (esperado >= 30)', v_mapped;
  END IF;

  RAISE NOTICE 'nutrition_exchanges seed OK: % grupos system, % equivalencias system', v_groups, v_mapped;
END $$;
