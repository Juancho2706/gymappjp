-- Seed 116 nuevos alimentos para alcanzar 250+ en total
-- Todos los macros son POR 100g (como en tabla nutricional)
-- serving_unit: 'g' = pesable, 'un' = contable (serving_size = gramos por 1 unidad)
-- coach_id = NULL → alimento global disponible para todos los coaches

-- ============================================================
-- FRUTAS (12 nuevas)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Mandarina', 53, 0.8, 13.3, 0.3, 100, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Mandarina' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Ciruela fresca', 46, 0.7, 11.4, 0.3, 60, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Ciruela fresca' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Damasco / Albaricoque', 48, 1.4, 11.1, 0.4, 40, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Damasco / Albaricoque' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Papaya', 43, 0.5, 10.8, 0.4, 100, 'g', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Papaya' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Frambuesas', 52, 1.2, 11.9, 0.7, 100, 'g', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Frambuesas' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Maracuyá / Maracuya', 97, 2.2, 23.4, 0.7, 30, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Maracuyá / Maracuya' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Pomelo', 42, 0.8, 10.7, 0.1, 200, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Pomelo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Limón (1 unidad)', 29, 1.1, 9.3, 0.3, 80, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Limón (1 unidad)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Cerezas', 63, 1.1, 16.0, 0.2, 100, 'g', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Cerezas' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Higo fresco', 74, 0.8, 19.2, 0.3, 50, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Higo fresco' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Caqui / Kaki', 70, 0.6, 18.6, 0.2, 150, 'un', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Caqui / Kaki' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Mango', 60, 0.8, 15.0, 0.4, 100, 'g', 'fruta', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Mango' AND coach_id IS NULL);

-- ============================================================
-- VERDURAS (14 nuevas)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Acelga cocida', 20, 1.9, 4.1, 0.1, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Acelga cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Remolacha cocida', 44, 1.7, 9.6, 0.2, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Remolacha cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Apio', 16, 0.7, 3.0, 0.2, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Apio' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Puerro', 61, 1.5, 14.2, 0.3, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Puerro' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Col de Bruselas', 43, 3.4, 8.9, 0.3, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Col de Bruselas' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Hinojo', 31, 1.2, 7.3, 0.2, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Hinojo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Nabo', 28, 0.9, 6.4, 0.1, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Nabo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Repollo / Col', 25, 1.3, 5.8, 0.1, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Repollo / Col' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Ajo', 149, 6.4, 33.1, 0.5, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Ajo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Rúcula', 25, 2.6, 3.7, 0.7, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Rúcula' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Zapallo (camote / butternut)', 26, 1.0, 6.5, 0.1, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Zapallo (camote / butternut)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Choclo cocido (en grano)', 96, 3.4, 21.0, 1.5, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Choclo cocido (en grano)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Arvejas cocidas', 81, 5.4, 14.5, 0.4, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Arvejas cocidas' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Perejil fresco', 36, 3.0, 6.3, 0.8, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Perejil fresco' AND coach_id IS NULL);

-- ============================================================
-- LÁCTEOS (6 nuevos)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Crema de leche (35% MG)', 337, 2.8, 2.8, 35.0, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Crema de leche (35% MG)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Leche en polvo entera', 496, 26.0, 38.4, 26.7, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Leche en polvo entera' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Ricotta', 174, 11.3, 3.0, 13.0, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Ricotta' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Queso mozzarella', 280, 22.0, 2.2, 17.0, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Queso mozzarella' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Leche condensada', 321, 8.0, 54.4, 8.7, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Leche condensada' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Queso crema (Philadelphia)', 342, 5.9, 4.1, 34.0, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Queso crema (Philadelphia)' AND coach_id IS NULL);

-- ============================================================
-- PROTEÍNAS (10 nuevas)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Atún con aceite (escurrido)', 198, 29.1, 0.0, 9.1, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Atún con aceite (escurrido)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Salmón ahumado', 117, 18.3, 0.0, 4.3, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Salmón ahumado' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Yema de huevo', 322, 15.9, 3.6, 26.5, 17, 'un', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Yema de huevo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Jamón de pavo bajo en grasa', 116, 16.5, 3.3, 3.9, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Jamón de pavo bajo en grasa' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Ostión cocido', 87, 16.1, 4.7, 0.9, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Ostión cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Sardinas en aceite (escurridas)', 208, 24.6, 0.0, 11.5, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Sardinas en aceite (escurridas)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Trucha cocida', 141, 20.2, 0.0, 6.2, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Trucha cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Cordero magro cocido', 217, 26.3, 0.0, 12.0, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Cordero magro cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Bacalao cocido', 105, 22.7, 0.0, 0.9, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Bacalao cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Langostinos cocidos', 95, 20.3, 0.0, 1.1, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Langostinos cocidos' AND coach_id IS NULL);

-- ============================================================
-- LEGUMBRES (6 nuevas)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Habas cocidas', 110, 7.6, 19.7, 0.4, 100, 'g', 'legumbre', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Habas cocidas' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Lupino cocido', 119, 15.6, 9.9, 2.9, 100, 'g', 'legumbre', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Lupino cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Poroto pallar cocido', 115, 8.1, 20.7, 0.4, 100, 'g', 'legumbre', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Poroto pallar cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Soya cocida', 173, 16.6, 9.9, 9.0, 100, 'g', 'legumbre', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Soya cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Lenteja roja cocida', 116, 9.0, 20.0, 0.4, 100, 'g', 'legumbre', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Lenteja roja cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Arveja cocida', 84, 5.4, 15.6, 0.4, 100, 'g', 'legumbre', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Arveja cocida' AND coach_id IS NULL);

-- ============================================================
-- SNACKS Y CONDIMENTOS (15 nuevos)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Cacao en polvo puro (sin azúcar)', 228, 19.6, 57.9, 13.7, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Cacao en polvo puro (sin azúcar)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Chocolate negro 85%', 598, 10.3, 34.6, 52.9, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Chocolate negro 85%' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Miel', 304, 0.3, 82.4, 0.0, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Miel' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Maicena', 381, 0.3, 91.3, 0.1, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Maicena' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Harina integral de trigo', 340, 13.7, 71.9, 2.5, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Harina integral de trigo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Harina de almendra', 571, 21.9, 19.3, 50.0, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Harina de almendra' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Dátiles secos', 282, 2.5, 75.8, 0.4, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Dátiles secos' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Granola (genérica)', 471, 10.4, 64.0, 20.6, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Granola (genérica)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Tahini (pasta de sésamo)', 595, 17.0, 21.2, 53.8, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Tahini (pasta de sésamo)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Mermelada sin azúcar', 45, 0.4, 10.8, 0.1, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Mermelada sin azúcar' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Proteína de guisante (polvo)', 370, 80.0, 7.0, 5.0, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Proteína de guisante (polvo)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Salvado de avena', 246, 17.3, 66.2, 7.0, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Salvado de avena' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Cacao nibs (sin azúcar)', 491, 14.1, 43.3, 43.1, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Cacao nibs (sin azúcar)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Pasas (uvas pasas)', 299, 3.1, 79.2, 0.5, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Pasas (uvas pasas)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Higo seco', 249, 3.3, 63.9, 0.9, 100, 'g', 'snack', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Higo seco' AND coach_id IS NULL);

-- ============================================================
-- BEBIDAS (7 nuevas)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Leche de avena', 46, 1.3, 7.7, 1.6, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Leche de avena' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Leche de soya sin azúcar', 33, 3.3, 1.3, 1.9, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Leche de soya sin azúcar' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Jugo de naranja natural', 45, 0.7, 10.4, 0.2, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Jugo de naranja natural' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Agua de coco', 19, 0.7, 3.7, 0.2, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Agua de coco' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Leche de coco (light)', 17, 0.2, 1.5, 1.2, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Leche de coco (light)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Caldo de pollo (bajo en sodio)', 10, 1.5, 0.8, 0.2, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Caldo de pollo (bajo en sodio)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Caldo vegetal', 7, 0.5, 1.0, 0.1, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Caldo vegetal' AND coach_id IS NULL);

-- ============================================================
-- CARBOHIDRATOS (10 nuevos)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Cuscús cocido', 112, 3.8, 23.2, 0.2, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Cuscús cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Bulgur cocido', 83, 3.1, 18.6, 0.2, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Bulgur cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Polenta cocida', 70, 1.7, 14.9, 0.4, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Polenta cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Fideos de arroz cocidos', 109, 1.7, 24.8, 0.2, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Fideos de arroz cocidos' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Pan pita integral', 266, 9.0, 54.9, 1.7, 60, 'un', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Pan pita integral' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Muesli', 377, 11.7, 66.3, 7.5, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Muesli' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Corn flakes (Kellogg''s)', 362, 7.5, 84.2, 0.5, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Corn flakes (Kellogg''s)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'All-Bran (fibra)', 267, 12.0, 73.5, 3.5, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'All-Bran (fibra)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Galleta de arroz', 387, 7.5, 81.1, 2.8, 9, 'un', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Galleta de arroz' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Batata / Camote cocido', 76, 1.4, 17.7, 0.1, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Batata / Camote cocido' AND coach_id IS NULL);

-- ============================================================
-- GRASAS (9 nuevas)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Semillas de sésamo', 573, 17.7, 23.4, 49.7, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Semillas de sésamo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Coco rallado sin azúcar', 354, 3.3, 15.2, 33.5, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Coco rallado sin azúcar' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Aceite de canola', 884, 0.0, 0.0, 100.0, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Aceite de canola' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Aceite de sésamo', 884, 0.0, 0.0, 100.0, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Aceite de sésamo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Aceite de aguacate', 884, 0.0, 0.0, 100.0, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Aceite de aguacate' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Crema de coco (para cocinar)', 330, 3.6, 11.7, 32.0, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Crema de coco (para cocinar)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Macadamia', 718, 7.9, 13.8, 75.8, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Macadamia' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Avellanas', 628, 15.0, 16.7, 60.8, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Avellanas' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Manteca de cerdo', 900, 0.0, 0.0, 100.0, 100, 'g', 'grasa', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Manteca de cerdo' AND coach_id IS NULL);

-- ============================================================
-- PROTEÍNAS ADICIONALES (12 más)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Seitan', 107, 21.1, 4.0, 1.5, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Seitan' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Pato sin piel cocido', 201, 27.9, 0.0, 10.0, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Pato sin piel cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Jaiva / Centolla cocida', 83, 17.4, 0.0, 1.1, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Jaiva / Centolla cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Anchoa en aceite (escurrida)', 210, 29.0, 0.0, 9.7, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Anchoa en aceite (escurrida)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Conejo magro cocido', 173, 33.0, 0.0, 3.5, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Conejo magro cocido' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Salmón enlatado (al natural)', 139, 19.8, 0.0, 6.5, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Salmón enlatado (al natural)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Proteína de cáñamo (polvo)', 340, 50.0, 34.0, 9.0, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Proteína de cáñamo (polvo)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Chorizo de pavo', 180, 15.3, 2.2, 12.5, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Chorizo de pavo' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Pechuga de pollo horneada', 165, 31.0, 0.0, 3.6, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Pechuga de pollo horneada' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Carne molida 80/20 cocida', 254, 26.1, 0.0, 17.4, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Carne molida 80/20 cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Vieiras cocidas', 97, 17.6, 4.4, 1.3, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Vieiras cocidas' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Jamón serrano (crudo curado)', 196, 26.6, 0.5, 9.5, 100, 'g', 'proteina', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Jamón serrano (crudo curado)' AND coach_id IS NULL);

-- ============================================================
-- VERDURAS ADICIONALES (5 más)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Espárrago', 20, 2.2, 3.9, 0.1, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Espárrago' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Alcachofa cocida', 53, 3.5, 10.5, 0.2, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Alcachofa cocida' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Rábano', 16, 0.7, 3.4, 0.1, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Rábano' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Palmito', 20, 2.4, 3.3, 0.2, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Palmito' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Bok choy / Pak choi', 13, 1.5, 2.2, 0.2, 100, 'g', 'verdura', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Bok choy / Pak choi' AND coach_id IS NULL);

-- ============================================================
-- CARBOHIDRATOS ADICIONALES (5 más)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Pan de centeno', 259, 8.5, 48.3, 3.3, 30, 'un', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Pan de centeno' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Arroz inflado (cereal)', 402, 6.3, 89.7, 0.5, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Arroz inflado (cereal)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Wasa (cracker de centeno)', 357, 11.0, 71.4, 2.4, 14, 'un', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Wasa (cracker de centeno)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Avena instantánea', 368, 13.2, 67.7, 6.9, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Avena instantánea' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Palomitas de maíz (natural)', 375, 12.9, 73.5, 4.5, 100, 'g', 'carbohidrato', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Palomitas de maíz (natural)' AND coach_id IS NULL);

-- ============================================================
-- LÁCTEOS ADICIONALES (3 más)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Leche de cabra entera', 69, 3.6, 4.5, 4.1, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Leche de cabra entera' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Yogur de soya (natural)', 53, 3.4, 5.3, 1.9, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Yogur de soya (natural)' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Mascarpone', 429, 6.0, 3.6, 44.5, 100, 'g', 'lacteo', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Mascarpone' AND coach_id IS NULL);

-- ============================================================
-- BEBIDAS ADICIONALES (2 más)
-- ============================================================
INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Leche de arroz', 47, 0.3, 9.4, 1.0, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Leche de arroz' AND coach_id IS NULL);

INSERT INTO foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id)
SELECT 'Kombucha natural', 13, 0.0, 3.0, 0.0, 100, 'g', 'bebida', NULL
WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = 'Kombucha natural' AND coach_id IS NULL);
