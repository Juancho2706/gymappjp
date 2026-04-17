-- Agregar soporte para líquidos (is_liquid, brand) y unidad 'ml' canónica
-- Fase 1 del plan de auditoría nutricional chilena

-- 1. Agregar columna is_liquid (identifica bebidas y líquidos medibles en ml)
ALTER TABLE foods ADD COLUMN IF NOT EXISTS is_liquid boolean NOT NULL DEFAULT false;

-- 2. Agregar columna brand (para productos de marca chilena: Colún, Quaker, Soprole, etc.)
ALTER TABLE foods ADD COLUMN IF NOT EXISTS brand text;

-- 3. Marcar alimentos líquidos y cambiar su serving_unit a 'ml'
--    Criterios: category='bebida' + nombres que implican líquido
UPDATE foods
SET
  is_liquid    = true,
  serving_unit = 'ml',
  serving_size = 200         -- 1 vaso estándar (200ml); la unidad 'un' representará este volumen
WHERE
  category = 'bebida'
  OR name ILIKE '%leche%'
  OR name ILIKE '%jugo%'
  OR name ILIKE '%caldo%'
  OR name ILIKE '%kombucha%'
  OR name ILIKE '%kéfir%'
  OR name ILIKE '%kefir%';

-- Excepciones: alimentos que contienen "leche" en el nombre pero no son líquidos para beber
--   (ninguno en el seed actual, pero por seguridad excluir helados si existen)
UPDATE foods
SET is_liquid = false, serving_unit = 'g'
WHERE name ILIKE '%helado%'
   OR name ILIKE '%queso%'
   OR name ILIKE '%crema%';  -- crema de coco = grasa sólida, no bebida

-- Verificación inline (comentada): SELECT name, is_liquid, serving_unit, serving_size
-- FROM foods WHERE is_liquid = true ORDER BY name;
