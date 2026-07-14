# Operación — catálogo chileno de alimentos

Este procedimiento mantiene las búsquedas de EVA dentro de Supabase. No realiza consultas a proveedores externos durante el uso normal de web, PWA o React Native.

## Requisito previo

Las migraciones draft del rework deben revisarse, convertirse en migraciones `.sql` reales y aplicarse de forma controlada antes de una importación:

- `20260714090000_DRAFT_nutrition_catalog_cl_and_intake_v2.sql.draft`
- `20260714091000_DRAFT_food_catalog_import_key.sql.draft`

Mientras sigan como `.draft` y terminen en `ROLLBACK`, no modifican producción.

## Formato de entrada

El importador acepta JSON (array) o JSONL/NDJSON. Cada producto debe incluir:

- `barcode`: GTIN/EAN/UPC válido de 8, 12, 13 o 14 dígitos;
- `name`;
- `serving_size`;
- `serving_unit`;
- `calories`, `protein_g`, `carbs_g`, `fats_g` por 100 g/ml o por la base definida en `foods`;
- opcionalmente marca, aliases chilenos, fibra, sodio, azúcares, grasas saturadas, categoría, medida casera y path de imagen.

Usa `docs/operations/food-catalog-cl.example.json` como plantilla.

## Validar sin escribir

```bash
pnpm catalog:import:cl -- ./catalogo-cl.json --dry-run
```

El modo dry-run:

- valida checksums GTIN;
- normaliza nombres, marcas y aliases;
- detecta códigos duplicados dentro del archivo;
- muestra una muestra del payload;
- no requiere credenciales ni escribe en Supabase.

## Importación real

Solo después de aprobar esquema y muestra:

```bash
SUPABASE_URL="https://PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
pnpm catalog:import:cl -- ./catalogo-cl.json --batch=200
```

El script hace upsert por `catalog_key = gtin:<barcode>`, por lo que repetir el mismo archivo actualiza el producto en vez de crear duplicados.

## Imágenes

No incluir blobs ni base64 en el catálogo. Subir previamente imágenes optimizadas a Supabase Storage y guardar únicamente `product_image_path`.

Recomendación:

- thumbnail para listas;
- imagen mediana para detalle;
- nombre versionado o hash para cache largo;
- carga lazy;
- placeholder cuando no exista imagen.

## Rollout recomendado

1. Revisar migraciones y RLS.
2. Aplicar esquema aditivo en una ventana controlada.
3. Ejecutar dry-run con 20–50 productos.
4. Importar lote piloto.
5. Verificar búsqueda, código de barras, macros y visibilidad por RLS.
6. Activar el flujo para testers internos.
7. Medir búsquedas sin resultados y códigos desconocidos.
8. Ampliar el catálogo por lotes.

## Seguridad

- No ejecutar el importador desde el cliente ni desde una función pública.
- No exponer `SUPABASE_SERVICE_ROLE_KEY` en Vercel Preview, Expo o código versionado.
- Mantener archivos fuente fuera del repositorio cuando tengan licencias o datos restringidos.
- Conservar procedencia y estado de validación en cada fila.
