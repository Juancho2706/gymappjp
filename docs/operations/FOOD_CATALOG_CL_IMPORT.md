# Operación — catálogo chileno de alimentos

Este procedimiento mantiene búsquedas y escaneo dentro de Supabase. Web, PWA y React Native no consultan proveedores externos durante el uso normal.

**Estado al 15 de julio de 2026:** esquema aplicado, importador disponible, sin lote piloto importado.

---

## 1. Infraestructura aplicada

Migraciones:

```txt
supabase/migrations/20260714073000_nutrition_catalog_cl_and_intake_v2.sql
supabase/migrations/20260714151500_food_catalog_missing_codes_curation.sql
supabase/migrations/20260714220000_food_catalog_v2_schema.sql
supabase/migrations/20260714220500_food_catalog_v2_rpc.sql
```

Tablas operativas:

```txt
foods
food_media
food_catalog_import_batches
food_catalog_import_rows
food_catalog_missing_codes
```

Buckets:

```txt
food-media
food-submissions
```

No volver a aplicar migraciones desde este runbook. Confirmar primero el historial de Supabase y el estado del esquema.

---

## 2. Formato de entrada

El importador acepta:

- JSON con un array;
- JSONL/NDJSON, una fila por línea.

Campos mínimos:

- `name`;
- `serving_size`;
- `serving_unit`;
- `calories`;
- `protein_g`;
- `carbs_g`;
- `fats_g`.

Recomendados para producto chileno:

- `barcode` con GTIN válido;
- `brand`;
- `country_code: "CL"`;
- `category`;
- `search_aliases` con nombres locales;
- `fiber_g`;
- `sodium_mg`;
- `sugar_g`;
- `saturated_fat_g`;
- `package_quantity`;
- `package_unit`;
- `source_ref`;
- `verification_status`.

Media opcional:

```json
{
  "kind": "product_photo",
  "object_path": "cl/marca/producto-v1.webp",
  "version": 1,
  "width": 640,
  "height": 640,
  "mime_type": "image/webp",
  "license": "supplier_authorized",
  "attribution": "Proveedor o fuente autorizada",
  "is_primary": true
}
```

Usar `docs/operations/food-catalog-cl.example.json` como base, pero revisar que represente el schema actual antes de importar.

---

## 3. Reglas de datos

### GTIN

Se aceptan longitudes:

- 8;
- 12;
- 13;
- 14.

El checksum GS1 debe ser válido. El importador no inventa ceros ni transforma UPC a EAN.

### Nutrición

Definir claramente si los valores representan:

- 100 g/ml;
- una porción;
- otra base explícita.

No mezclar bases dentro de un lote sin metadata clara.

### Verificación

Estados permitidos:

```txt
unverified
community
coach_verified
eva_verified
rejected
```

Un import inicial no debe marcar automáticamente todo como `eva_verified`.

### Search

- `name_search` es columna generada;
- el importador no debe escribirla;
- usar `name`, `brand` y `search_aliases`;
- incluir términos chilenos cuando corresponda.

### Licencias

- no subir imágenes sin permiso;
- guardar licencia, procedencia y atribución;
- archivos fuente restringidos deben mantenerse fuera del repo;
- no guardar base64/blobs dentro del JSON.

---

## 4. Modos del importador

Script:

```txt
scripts/import-food-catalog-cl.mjs
```

Comando base:

```bash
pnpm catalog:import:cl -- --file=./catalogo-cl.json
```

### Dry-run

```bash
pnpm catalog:import:cl -- --file=./catalogo-cl.json --dry-run
```

Valida sin credenciales ni escrituras:

- estructura;
- serving/macros;
- country code;
- GTIN/checksum;
- verification status;
- catalog key;
- duplicados dentro del archivo;
- muestra de rechazos.

Puede terminar con código distinto de cero cuando hay filas rechazadas. Eso no significa que haya escrito datos.

### Stage-only — comportamiento predeterminado

Sin `--dry-run` ni `--apply`, el importador:

1. requiere credenciales server-side;
2. crea un batch;
3. guarda filas normalizadas en staging;
4. clasifica accepted/rejected/duplicate;
5. marca el batch ready;
6. no publica alimentos.

Este es el modo recomendado para un lote remoto nuevo.

### Stage-and-apply

```bash
pnpm catalog:import:cl -- --file=./catalogo-cl.json --apply
```

Publica filas aceptadas después de crear staging.

No usar `--apply` hasta que:

- dry-run esté revisado;
- procedencia/licencias estén aprobadas;
- duplicados/rechazos estén entendidos;
- se haya probado primero un lote pequeño.

### Import remoto

El script bloquea destinos remotos salvo confirmación explícita:

```bash
--allow-remote
```

Este flag no reemplaza revisión humana ni aprobación.

---

## 5. Credenciales

El importador usa credenciales server-side del entorno local/seguro.

Reglas:

- nunca usar service role en Expo;
- nunca exponerla como variable pública en Vercel;
- nunca versionarla;
- no pegarla en issues, logs o documentación;
- rotarla si se filtra.

---

## 6. Flujo piloto recomendado

1. Preparar 20–50 productos.
2. Revisar procedencia y base nutricional.
3. Ejecutar dry-run.
4. Corregir rechazos.
5. Ejecutar stage-only.
6. Revisar batch y rows.
7. Verificar duplicados contra `foods`.
8. Aprobar manualmente.
9. Aplicar el lote.
10. Probar búsqueda y GTIN.
11. Probar scanner PWA/RN.
12. Medir payload, query y egress.
13. Ampliar por nuevos lotes.

No comenzar con miles de productos.

---

## 7. Imágenes

### `food-media`

- público;
- solo assets curados;
- usar paths versionados;
- WebP preferido cuando aplique;
- thumbnail para listas;
- imagen mediana para detalle;
- originales fuera de cargas normales;
- metadata en `food_media`.

### `food-submissions`

- privado;
- material enviado por usuario;
- carpeta inicial por userId;
- no se muestra públicamente;
- requiere moderación antes de promover a `food-media`.

Pendiente de implementar completamente:

- compresión en cliente;
- validación MIME/dimensiones;
- checksum;
- moderación;
- promoción de asset aprobado.

---

## 8. Validación posterior a importación

### Datos

- filas esperadas;
- no duplicados de barcode/catalog key;
- macros correctos;
- serving correcto;
- country code CL;
- aliases útiles;
- verification status.

### Funcional

- `search_food_catalog_v2`;
- `lookup_food_by_gtin_v2`;
- barcode conocido;
- barcode desconocido;
- paginación;
- imagen/fallback;
- reporte idempotente.

### Seguridad

- anon no ejecuta mutaciones;
- alumno solo reporta para sí;
- submissions privadas;
- media pública solo curada;
- service role no expuesta.

### Rendimiento

- EXPLAIN del search;
- p50/p95;
- payload;
- tamaño thumbnail;
- egress;
- tiempo scanner → resultado.

---

## 9. Rollback operativo

Ante un lote defectuoso:

- detener nuevos applies;
- no borrar historial/intake;
- marcar productos rechazados o retirar visibilidad mediante flujo auditado;
- conservar batch/rows para diagnóstico;
- corregir archivo fuente;
- crear un lote nuevo;
- no editar silenciosamente la evidencia del lote anterior.

Para cambios de esquema, usar una nueva migración aditiva. No revertir DDL productivo manualmente desde el importador.

---

## 10. Estado actual

```txt
foods: 344
foods con barcode: 0
foods Chile: 0
food_media: 0
import batches: 0
missing codes abiertos: 0
```

El siguiente paso operativo no es activar el scanner para todos; es preparar, revisar e importar el lote piloto.
