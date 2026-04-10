-- Parte A: panes, proteínas, lácteos, legumbres, granos (idempotente)
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pan Marraqueta', 278, 9, 52, 3, 100, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pan Marraqueta' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pan Hallulla', 288, 9, 54, 4, 80, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pan Hallulla' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pan de Molde (1 rebanada)', 75, 3, 14, 1, 30, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pan de Molde (1 rebanada)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pan Integral (1 rebanada)', 68, 3, 12, 1, 28, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pan Integral (1 rebanada)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pechuga de Pollo cocida', 165, 31, 0, 4, 100, 'g', NULL, 'proteina'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pechuga de Pollo cocida' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Atún en agua (lata)', 116, 26, 0, 1, 100, 'g', NULL, 'proteina'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Atún en agua (lata)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Huevo entero cocido', 155, 13, 1, 11, 60, 'g', NULL, 'proteina'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Huevo entero cocido' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Carne molida 10% grasa', 218, 26, 0, 13, 100, 'g', NULL, 'proteina'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Carne molida 10% grasa' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Salmón cocido', 208, 20, 0, 13, 100, 'g', NULL, 'proteina'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Salmón cocido' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Merluza cocida', 90, 19, 0, 1, 100, 'g', NULL, 'proteina'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Merluza cocida' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Yogur Natural sin azúcar', 61, 4, 5, 3, 200, 'g', NULL, 'lacteo'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Yogur Natural sin azúcar' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Queso Chanco (1 rebanada)', 80, 5, 1, 6, 25, 'g', NULL, 'lacteo'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Queso Chanco (1 rebanada)' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Leche Semidescremada', 47, 3, 5, 2, 100, 'ml', NULL, 'lacteo'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Leche Semidescremada' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Quesillo', 105, 14, 2, 5, 100, 'g', NULL, 'lacteo'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Quesillo' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Lentejas cocidas', 116, 9, 20, 0, 100, 'g', NULL, 'legumbre'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Lentejas cocidas' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Porotos negros cocidos', 132, 9, 24, 1, 100, 'g', NULL, 'legumbre'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Porotos negros cocidos' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Garbanzos cocidos', 164, 9, 27, 3, 100, 'g', NULL, 'legumbre'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Garbanzos cocidos' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Arroz cocido', 130, 3, 28, 0, 100, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Arroz cocido' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Avena cruda', 389, 17, 66, 7, 100, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Avena cruda' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Pasta cocida', 131, 5, 25, 1, 100, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Pasta cocida' AND f.coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, coach_id, category)
SELECT 'Quinoa cocida', 120, 4, 21, 2, 100, 'g', NULL, 'carbohidrato'
WHERE NOT EXISTS (SELECT 1 FROM foods f WHERE f.name = 'Quinoa cocida' AND f.coach_id IS NULL);
