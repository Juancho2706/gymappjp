-- Seed de alimentos de marca chilena (revisados manualmente por coach)
-- Generado: 2026-04-17T00:44:42.152Z
-- Fuente: OpenFoodFacts + validación manual
-- Supermercados de referencia: Santa Isabel, Jumbo, Lider (Walmart)
-- Todos los macros son POR 100g o 100ml

-- Avena cocida (Quaker)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Avena cocida',
  71.0, 2.5, 12.1, 1.5,
  250, 'g',
  'carbohidrato', false, 'Quaker', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Avena cocida' AND coach_id IS NULL
);

-- Avena instantánea Quaker (Quaker)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Avena instantánea Quaker',
  367.0, 12.5, 62.6, 6.9,
  40, 'g',
  'carbohidrato', false, 'Quaker', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Avena instantánea Quaker' AND coach_id IS NULL
);

-- Corn Flakes Kellogg's (Kelloggs)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Corn Flakes Kellogg''s',
  375.0, 7.5, 84.0, 0.9,
  30, 'g',
  'carbohidrato', false, 'Kelloggs', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Corn Flakes Kellogg''s' AND coach_id IS NULL
);

-- Cereal Integral Nestlé Fitness (Nestle)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Cereal Integral Nestlé Fitness',
  378.0, 10.0, 74.0, 3.0,
  30, 'g',
  'carbohidrato', false, 'Nestle', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Cereal Integral Nestlé Fitness' AND coach_id IS NULL
);

-- Granola (Kelloggs)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Granola',
  396.0, 8.0, 71.0, 9.0,
  45, 'g',
  'snack', false, 'Kelloggs', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Granola' AND coach_id IS NULL
);

-- Muesli (Generico)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Muesli',
  352.0, 10.0, 65.0, 6.0,
  45, 'g',
  'carbohidrato', false, 'Generico', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Muesli' AND coach_id IS NULL
);

-- Leche entera Colún (Colun)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Leche entera Colún',
  59.0, 3.1, 4.6, 3.1,
  200, 'ml',
  'lacteo', true, 'Colun', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Leche entera Colún' AND coach_id IS NULL
);

-- Leche semidescremada Colún (COLUN)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Leche semidescremada Colún',
  42.0, 3.2, 4.6, 1.2,
  200, 'ml',
  'lacteo', true, 'COLUN', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Leche semidescremada Colún' AND coach_id IS NULL
);

-- Leche descremada Colún (Colún)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Leche descremada Colún',
  33.0, 3.3, 4.7, 0.1,
  200, 'ml',
  'lacteo', true, 'Colún', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Leche descremada Colún' AND coach_id IS NULL
);

-- Leche sin lactosa Colún (Colun)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Leche sin lactosa Colún',
  32.0, 3.3, 4.6, 0.1,
  200, 'ml',
  'lacteo', true, 'Colun', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Leche sin lactosa Colún' AND coach_id IS NULL
);

-- Yogur natural Soprole (Soprole)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Yogur natural Soprole',
  64.0, 3.8, 6.0, 2.5,
  150, 'g',
  'lacteo', false, 'Soprole', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Yogur natural Soprole' AND coach_id IS NULL
);

-- Yogur griego Yoplait (Yoplait)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Yogur griego Yoplait',
  97.0, 7.0, 4.0, 5.0,
  150, 'g',
  'lacteo', false, 'Yoplait', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Yogur griego Yoplait' AND coach_id IS NULL
);

-- Queso cottage Soprole (Soprole)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Queso cottage Soprole',
  98.0, 11.0, 3.5, 4.5,
  100, 'g',
  'lacteo', false, 'Soprole', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Queso cottage Soprole' AND coach_id IS NULL
);

-- Queso Gauda Colún (Colun)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Queso Gauda Colún',
  356.0, 26.0, 1.0, 28.0,
  30, 'g',
  'lacteo', false, 'Colun', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Queso Gauda Colún' AND coach_id IS NULL
);

-- Queso mantecoso Colún (Colun)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Queso mantecoso Colún',
  330.0, 23.0, 2.0, 26.0,
  30, 'g',
  'lacteo', false, 'Colun', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Queso mantecoso Colún' AND coach_id IS NULL
);

-- Whey Protein ON Gold Standard (Optimum Nutrition)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Whey Protein ON Gold Standard',
  389.0, 80.0, 6.0, 4.0,
  30, 'g',
  'snack', false, 'Optimum Nutrition', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Whey Protein ON Gold Standard' AND coach_id IS NULL
);

-- Caseína ON Gold Standard (Optimum Nutrition)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Caseína ON Gold Standard',
  370.0, 74.0, 10.0, 4.0,
  30, 'g',
  'snack', false, 'Optimum Nutrition', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Caseína ON Gold Standard' AND coach_id IS NULL
);

-- Proteína Vegana Garden of Life (Garden of Life)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Proteína Vegana Garden of Life',
  360.0, 72.0, 8.0, 6.0,
  30, 'g',
  'snack', false, 'Garden of Life', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Proteína Vegana Garden of Life' AND coach_id IS NULL
);

-- Creatina monohidrato (Generico)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Creatina monohidrato',
  0.0, 0.0, 0.0, 0.0,
  5, 'g',
  'snack', false, 'Generico', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Creatina monohidrato' AND coach_id IS NULL
);

-- Pan integral Bimbo (Bimbo)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Pan integral Bimbo',
  247.0, 9.0, 44.0, 4.0,
  25, 'un',
  'carbohidrato', false, 'Bimbo', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Pan integral Bimbo' AND coach_id IS NULL
);

-- Pan blanco Ideal (Ideal)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Pan blanco Ideal',
  265.0, 8.0, 50.0, 3.0,
  25, 'un',
  'carbohidrato', false, 'Ideal', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Pan blanco Ideal' AND coach_id IS NULL
);

-- Pan pita (Generico)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Pan pita',
  275.0, 9.0, 56.0, 1.0,
  60, 'un',
  'carbohidrato', false, 'Generico', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Pan pita' AND coach_id IS NULL
);

-- Tostadas integrales Wasa (Wasa)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Tostadas integrales Wasa',
  342.0, 11.0, 68.0, 3.0,
  11, 'un',
  'carbohidrato', false, 'Wasa', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Tostadas integrales Wasa' AND coach_id IS NULL
);

-- Mantequilla de maní Puri (Puri)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Mantequilla de maní Puri',
  586.7, 26.0, 10.0, 49.3,
  32, 'g',
  'grasa', false, 'Puri', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Mantequilla de maní Puri' AND coach_id IS NULL
);

-- Mantequilla de almendras (Generico)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Mantequilla de almendras',
  614.0, 21.0, 22.0, 56.0,
  32, 'g',
  'grasa', false, 'Generico', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Mantequilla de almendras' AND coach_id IS NULL
);

-- Barra proteica Quest (Quest)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Barra proteica Quest',
  317.0, 35.0, 42.0, 13.0,
  60, 'un',
  'snack', false, 'Quest', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Barra proteica Quest' AND coach_id IS NULL
);

-- Atún en lata al agua (Van Camps)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Atún en lata al agua',
  116.0, 26.0, 0.0, 1.0,
  80, 'g',
  'proteina', false, 'Van Camps', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Atún en lata al agua' AND coach_id IS NULL
);

-- Salmón enlatado (Generico)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Salmón enlatado',
  139.0, 19.8, 0.0, 6.5,
  80, 'g',
  'proteina', false, 'Generico', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Salmón enlatado' AND coach_id IS NULL
);

-- Arroz blanco cocido (Generico)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Arroz blanco cocido',
  130.0, 2.7, 28.0, 0.3,
  150, 'g',
  'carbohidrato', false, 'Generico', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Arroz blanco cocido' AND coach_id IS NULL
);

-- Pasta cocida (Lucchetti)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, is_liquid, brand, coach_id)
SELECT
  'Pasta cocida',
  158.0, 5.8, 31.0, 0.9,
  200, 'g',
  'carbohidrato', false, 'Lucchetti', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM foods WHERE name = 'Pasta cocida' AND coach_id IS NULL
);

