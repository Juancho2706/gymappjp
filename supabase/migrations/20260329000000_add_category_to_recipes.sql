-- Añadir columna de categoría a la tabla de recetas
ALTER TABLE "public"."recipes" ADD COLUMN "category" text;

-- Actualizar comentarios para documentar categorías estándar
COMMENT ON COLUMN "public"."recipes"."category" IS 'Categorías: Desayuno, Almuerzo, Cena, Snack/Merienda, Postre';
