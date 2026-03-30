-- Migración para eliminar definitivamente las recetas mezcladas en la tabla de alimentos
-- 1. Eliminar registros que tengan el prefijo [Receta] en la tabla foods
DELETE FROM public.foods 
WHERE name ILIKE '[Receta]%';

-- 2. Asegurar que la función search_foods no necesite el filtro (aunque dejarlo no hace daño, es mejor que la tabla esté limpia)
-- Ya existe una migración que añade el filtro, pero con la eliminación física es más robusto.
