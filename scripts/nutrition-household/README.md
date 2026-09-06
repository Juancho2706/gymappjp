# Medidas caseras del catálogo (W2.4)

Tren «Cantidades honestas» (Nutrición V2), SPEC §5.6. Dos scripts que **solo leen**
(catálogo de Supabase + API pública de USDA) y producen archivos para revisión
humana. Ninguno de los dos escribe en la base de datos.

## Regla dura

**Los `.sql` y `.csv` generados se aplican SOLO con OK explícito del owner, y
después de revisar el `.csv`.** Ningún script corre el `UPDATE` que genera.

## `backfill-usda-household.mjs`

Para `foods.catalog_source = 'usda'` sin `household_grams`: consulta
`GET https://api.nal.usda.gov/fdc/v1/food/{fdcId}` (el fdcId vive en
`foods.source_ref`, ver `scripts/import-food-catalog-cl.mjs`) y elige UNA medida
casera entre `foodPortions[]` con el mapeo a etiquetas es-CL descrito en el
encabezado del archivo (cup→taza, tbsp→cucharada, tsp→cucharadita, slice→rebanada,
piece/unit/each→unidad, egg→huevo, medium/large/small en fruta/verdura→unidad).
Descarta oz/fl oz/serving y cualquier gramaje fuera de `[1, 1000]`.

```bash
# Resumen por consola, cero archivos (default)
node scripts/nutrition-household/backfill-usda-household.mjs --dry-run --limit 20

# Genera supabase/data/household-backfill-usda-<fecha>.sql + .csv
node scripts/nutrition-household/backfill-usda-household.mjs --write
```

Variables de entorno (`.env.local` o `apps/web/.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `USDA_FDC_API_KEY` (obligatoria; el script no trae ningún valor por defecto, regla de
  `docs:check`). Puede ser una clave propia (gratis: https://fdc.nal.usda.gov/api-key-signup.html)
  o la clave de demostración pública que documenta api.data.gov (`DEMO_KEY`), que tiene un límite
  mucho más bajo (~30 req/hora). Con la demo, corré con `--limit` chico o vas a pegar contra el
  429 seguido.

Flags: `--dry-run` (default) · `--write` · `--limit N` · `--offset N` ·
`--pause-ms N` (default 350 con clave propia, 4000 con `DEMO_KEY`) ·
`--max-retries N` (backoff exponencial en 429, default 4) · `--out <dir>`
(default `supabase/data/`).

El `.sql` generado tiene un `UPDATE ... where household_grams is null` por fila
(idempotente: correrlo dos veces la segunda vez no toca nada). El `.csv` gemelo
trae `id, name, fdcId, label, grams, fuente, confianza` para que se revise cada
fila contra la ficha USDA antes de aplicar nada.

## `suggest-eva-household.mjs`

Para `foods.catalog_source = 'eva'` sin `household_grams` (~158 filas): propone
`(label, grams)` por diccionario de palabras clave del **nombre** (huevo, pan/
marraqueta/hallulla/pita, tortilla, galleta, yogurt, líquidos por taza, frutas
enteras, cucharadas de grasas/endulzantes, fallback «taza 100 g» por categoría
`verdura` salvo palta/tomate). Es heurística pura, sin fuente externa que la
respalde, así que **no genera SQL**: solo un CSV para curación manual.

```bash
node scripts/nutrition-household/suggest-eva-household.mjs --limit 50
```

Variables de entorno: mismas dos de Supabase que arriba (no usa USDA).
Flags: `--limit N` · `--offset N` · `--out <dir>` (default `supabase/data/`).

Salida: `supabase/data/household-suggest-eva-<fecha>.csv` con
`id, name, label, grams, regla, confianza`. Los alimentos sin palabra clave ni
categoría `verdura` quedan listados en consola como "sin sugerencia" — no entran
al CSV, se revisan a mano aparte.

Open Food Facts (`catalog_source = 'open_food_facts'`) queda fuera de ambos
scripts a propósito: no trae medidas caseras y esa fuente ya tiene su propio
flujo en `scripts/import-food-catalog-cl.mjs` / `docs/operations/FOOD_CATALOG_CL_IMPORT.md`.
