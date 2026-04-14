-- Normalizar unidades de medición de alimentos a las 2 unidades canónicas: 'g' y 'un'
-- Antes: food_items: g=42, un=1, u=1 | foods: g=130, ml=9, u=6
-- Después: food_items: g=42, un=2 | foods: g=139, un=6

-- food_items: todas las variantes de "unidad" → 'un', resto → 'g'
UPDATE food_items SET unit = 'un' WHERE unit IN ('u', 'unidades', 'unidad', 'porción', 'porciones');
UPDATE food_items SET unit = 'g'  WHERE unit IN ('ml', 'gr', 'gramos', 'taza', 'cda', 'cdta');

-- foods: normalizar serving_unit
UPDATE foods SET serving_unit = 'un' WHERE serving_unit IN ('u', 'unidades', 'unidad', 'porción', 'porciones');
UPDATE foods SET serving_unit = 'g'  WHERE serving_unit IN ('ml', 'gr', 'gramos');
