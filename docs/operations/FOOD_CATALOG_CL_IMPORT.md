---
status: active
owner: engineering
last_verified: 2026-07-20
canonical: true
---

# Catálogo chileno de alimentos — operación

El catálogo se sirve desde Supabase. Web, PWA y React Native no consultan proveedores externos durante el uso normal.

## Estado verificado

Estado productivo registrado el 20 de julio de 2026:

- 4.898 alimentos totales;
- 532 genéricos después de deduplicación;
- 4.312 productos chilenos con GTIN provenientes de Open Food Facts;
- 580 ilustraciones EVA en `food-media/eva-icons/` y sus filas `food_media`;
- 2.586 de 4.778 alimentos clasificables tienen grupo de porciones asignado;
- Nutrición V2 consume búsqueda, GTIN, media y atribución desde read models locales.

La importación masiva ya ocurrió. No volver a ejecutar la semilla Open Food Facts ni las calibraciones USDA como si fueran tareas pendientes.

Trabajo operativo restante:

- revisar y fusionar duplicados con referencias activas;
- clasificar la cola de baja confianza;
- retirar assets redundantes después del merge;
- eliminar respaldos temporales únicamente tras validar que no hubo regresiones.

Las aprobaciones humanas correspondientes están en [MANUAL_TASKS.md](MANUAL_TASKS.md).

## Componentes vigentes

Script:

```text
scripts/import-food-catalog-cl.mjs
```

Tablas:

```text
foods
food_media
food_catalog_import_batches
food_catalog_import_rows
food_catalog_missing_codes
```

Storage:

```text
food-media        público; solo assets curados
food-submissions  privado; aportes todavía no promovidos
```

RPC principales:

```text
search_food_catalog_v2
lookup_food_by_gtin_v2
report_food_catalog_missing_code_v2
```

No aplicar migraciones desde este runbook. El historial versionado de `supabase/migrations/` es la fuente de verdad del esquema.

## Formato de entrada

El importador acepta un array JSON o JSONL. Usar [food-catalog-cl.example.json](food-catalog-cl.example.json) como forma mínima y validarlo contra el script antes de cada lote.

Campos obligatorios:

- `name`;
- `serving_size` y `serving_unit`;
- `calories`, `protein_g`, `carbs_g` y `fats_g`.

Campos recomendados:

- `barcode`, `brand`, `country_code` y `category`;
- `search_aliases` con vocabulario chileno;
- fibra, sodio, azúcar y grasa saturada;
- cantidad/unidad del envase;
- `catalog_source`, `source_ref` y `verification_status`.

Reglas:

- Macros y calorías deben usar la base que espera el motor: 100 g/ml. `serving_size` describe la porción mostrada; no convertir silenciosamente datos por porción en datos por 100 g.
- GTIN debe tener 8, 12, 13 o 14 dígitos y checksum GS1 válido.
- Un lote nuevo empieza como `unverified`; no elevarlo automáticamente a `eva_verified`.
- `catalog_key` debe ser estable. El modo apply hace upsert por esa clave y puede modificar una fila existente.
- No escribir `name_search`; es generada por la base.
- No subir imágenes ni datasets sin licencia y atribución compatibles.
- Archivos fuente grandes/restringidos, dumps y blobs no se versionan.

Fuentes permitidas por el script:

```text
import, eva, coach, team, open_food_facts, usda, other
```

Estados permitidos:

```text
unverified, community, coach_verified, eva_verified, rejected
```

## Flujo seguro para un lote nuevo

### 1. Dry-run local

No necesita credenciales ni escribe datos:

```bash
pnpm catalog:import:cl -- --file=./catalogo-cl.json --dry-run --source=import
```

Revisar total, aceptados, duplicados y todos los rechazos. Un exit code `2` indica filas rechazadas, no una escritura parcial.

### 2. Stage-only

Con credenciales server-side del entorno objetivo:

```bash
pnpm catalog:import:cl -- --file=./catalogo-cl.json --source=import
```

Crea batch y filas de staging; no publica alimentos. En un destino remoto también exige `--allow-remote`.

### 3. Revisión

Antes de publicar:

1. verificar checksum y procedencia del archivo;
2. revisar accepted/rejected/duplicate en el batch;
3. comparar GTIN y `catalog_key` contra `foods`;
4. inspeccionar macros por 100 g/ml y serving;
5. aprobar licencia, atribución y media;
6. tomar snapshot y registrar conteos antes.

### 4. Apply explícito

```bash
pnpm catalog:import:cl -- --file=./catalogo-cl.json --source=import --apply
```

Para producción se requieren ambos flags:

```bash
pnpm catalog:import:cl -- --file=./catalogo-cl.json --source=import --apply --allow-remote
```

`--allow-remote` solo elimina la guarda técnica. No constituye aprobación.

## Validación posterior

Registrar batch ID y conteos, luego comprobar:

- total aplicado coincide con lo aprobado;
- `catalog_key` y barcode no presentan duplicados inesperados;
- search encuentra nombre, marca y aliases;
- lookup devuelve conocido y trata desconocido sin error;
- macros y porciones calculan valores plausibles;
- paginación no repite ni omite filas;
- media muestra fallback y atribución correctos;
- anon no muta; alumno solo reporta dentro de su scope;
- p50/p95, payload y egress no regresan.

Probar al menos web y un build móvil contra el mismo entorno.

## Media y licencias

- Open Food Facts requiere atribución ODbL visible para los items correspondientes.
- USDA FoodData Central usado por el catálogo es CC0; conservar `source_ref`.
- `food-media` contiene solo imágenes curadas y optimizadas; WebP preferido.
- `food-submissions` permanece privado hasta moderación y promoción explícita.
- No copiar imágenes remotas por conveniencia si su licencia no permite redistribución.

## Incidente o lote defectuoso

1. Detener nuevos applies.
2. Guardar batch ID, checksum, hora, conteos y muestra técnica del defecto.
3. No borrar `food_catalog_import_batches` ni `food_catalog_import_rows`.
4. No editar la evidencia del lote para hacerlo parecer correcto.
5. Identificar referencias activas antes de ocultar, fusionar o borrar un alimento.
6. Preparar reparación idempotente con dry-run y conteos antes/después.
7. Para esquema/RLS, crear una migración aditiva; no ejecutar DDL improvisado desde el importador.
8. Repetir validación funcional y de aislamiento.

Una importación aplicada no se revierte volviendo a ejecutar el archivo anterior: el upsert por `catalog_key` no restaura referencias, media ni historial.
