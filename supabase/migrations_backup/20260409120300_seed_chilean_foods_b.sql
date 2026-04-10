-- Parte B: frutas, verduras, grasas, bebidas + heurísticas categoría en filas `otro`
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Manzana (1 unidad mediana)', 72, 0, 19, 0, 182, 'g', NULL, 'fruta'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Manzana (1 unidad mediana)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Plátano (1 unidad mediana)', 89, 1, 23, 0, 118, 'g', NULL, 'fruta'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Plátano (1 unidad mediana)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pera (1 unidad)', 57, 0, 15, 0, 166, 'g', NULL, 'fruta'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pera (1 unidad)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Durazno (1 unidad)', 39, 1, 10, 0, 150, 'g', NULL, 'fruta'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Durazno (1 unidad)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Tomate (1 mediano)', 22, 1, 5, 0, 123, 'g', NULL, 'verdura'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Tomate (1 mediano)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Lechuga (2 hojas)', 5, 1, 1, 0, 50, 'g', NULL, 'verdura'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Lechuga (2 hojas)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Palta (1/2 unidad)', 160, 2, 9, 15, 100, 'g', NULL, 'verdura'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Palta (1/2 unidad)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Zanahoria (1 mediana)', 41, 1, 10, 0, 61, 'g', NULL, 'verdura'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Zanahoria (1 mediana)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pepino (1/2 unidad)', 8, 1, 2, 0, 100, 'g', NULL, 'verdura'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pepino (1/2 unidad)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Aceite de oliva (1 cda)', 119, 0, 0, 14, 13, 'ml', NULL, 'grasa'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Aceite de oliva (1 cda)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Mantequilla de maní (1 cda)', 94, 4, 3, 8, 16, 'g', NULL, 'grasa'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Mantequilla de maní (1 cda)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Agua (vaso)', 0, 0, 0, 0, 250, 'ml', NULL, 'bebida'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Agua (vaso)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Leche de almendras sin azúcar', 17, 1, 1, 1, 100, 'ml', NULL, 'bebida'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Leche de almendras sin azúcar' AND f.coach_id IS NULL);

UPDATE foods SET category = 'carbohidrato' WHERE category = 'otro' AND (name ILIKE '%pan%' OR name ILIKE '%arroz%' OR name ILIKE '%avena%' OR name ILIKE '%pasta%' OR name ILIKE '%quinoa%');
UPDATE foods SET category = 'proteina' WHERE category = 'otro' AND (name ILIKE '%pollo%' OR name ILIKE '%atún%' OR name ILIKE '%atun%' OR name ILIKE '%salmón%' OR name ILIKE '%salmon%' OR name ILIKE '%huevo%' OR name ILIKE '%carne%');
UPDATE foods SET category = 'lacteo' WHERE category = 'otro' AND (name ILIKE '%leche%' OR name ILIKE '%yogur%' OR name ILIKE '%queso%');
UPDATE foods SET category = 'fruta' WHERE category = 'otro' AND (name ILIKE '%manzana%' OR name ILIKE '%plátano%' OR name ILIKE '%platano%' OR name ILIKE '%pera%' OR name ILIKE '%durazno%');
UPDATE foods SET category = 'verdura' WHERE category = 'otro' AND (name ILIKE '%tomate%' OR name ILIKE '%lechuga%' OR name ILIKE '%palta%' OR name ILIKE '%zanahoria%' OR name ILIKE '%pepino%');
