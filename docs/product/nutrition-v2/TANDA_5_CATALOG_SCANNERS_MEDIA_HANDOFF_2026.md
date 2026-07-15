# EVA Nutrición V2 — Tanda 5 handoff

## Catálogo local, GTIN, scanners, media e importación Chile

**Estado:** infraestructura implementada, no cerrada  
**Fecha de handoff:** 15 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`

---

## 1. Objetivo

Construir una biblioteca local de alimentos para Chile sin depender de llamadas externas durante el uso normal de EVA.

La solución busca soportar:

- búsqueda paginada;
- GTIN/EAN/UPC local;
- productos verificados o pendientes;
- reportes de códigos faltantes;
- imágenes curadas;
- fotos privadas enviadas por usuarios;
- importación por staging;
- scanners equivalentes PWA y React Native;
- entrada manual como fallback.

---

## 2. Piezas implementadas

### Contratos y motor

```txt
packages/nutrition-v2/catalog.ts
packages/nutrition-engine/catalog.ts
packages/nutrition-engine/catalog.test.ts
packages/nutrition-v2/read-models.test.ts
```

Incluyen:

- validación de GTIN-8, GTIN-12, EAN-13 y GTIN-14;
- normalización y check digit;
- búsqueda paginada;
- estados found/pending/invalid/not_found;
- media versionada;
- licencias y procedencia;
- reportes idempotentes;
- contratos de staging.

### Base de datos y Storage

```txt
supabase/migrations/20260714220000_food_catalog_v2_schema.sql
supabase/migrations/20260714220500_food_catalog_v2_rpc.sql
```

Supabase registró:

```txt
20260714214917 food_catalog_v2_schema
20260714215005 food_catalog_v2_rpc
```

Tablas:

```txt
food_media
food_catalog_import_batches
food_catalog_import_rows
```

Buckets:

```txt
food-media
food-submissions
```

`food-media` guarda assets curados. `food-submissions` queda privado y separado para material enviado por usuarios.

### RPC

```txt
search_food_catalog_v2
lookup_food_by_gtin_v2
report_missing_food_gtin_v2
```

No consultan proveedores externos en runtime.

### Endpoint móvil

```txt
apps/web/src/app/api/mobile/nutrition-v2/catalog/route.ts
```

Expone búsqueda, lookup y reporte bajo autenticación y rollout.

### Scanner PWA

```txt
apps/web/src/app/c/[coach_slug]/nutrition-v2/scanner/page.tsx
apps/web/src/components/nutrition-v2/FoodScannerClient.tsx
apps/web/next.config.ts
```

Incluye cámara trasera, BarcodeDetector, debounce, cleanup, linterna cuando existe, entrada manual, resultado local y reporte de faltante.

### Scanner React Native

```txt
apps/mobile/app/alumno/nutrition-v2/scanner.tsx
apps/mobile/lib/nutrition-v2-catalog.api.ts
apps/mobile/app.json
```

Incluye Expo Camera, permisos, formatos de retail, debounce, linterna, entrada manual, resultado local, reporte e imagen desde Storage.

### Importador

```txt
scripts/import-food-catalog-cl.mjs
docs/operations/FOOD_CATALOG_CL_IMPORT.md
```

El importador valida primero, crea staging por defecto y exige una decisión explícita para publicar. Registra checksum, aceptados, rechazados y duplicados. No escribe la columna generada `name_search`.

---

## 3. Estado real de producción

```txt
foods total:                       344
foods con barcode:                   0
foods country_code=CL:               0
food_media:                           0
food_catalog_import_batches:         0
food_catalog_missing_codes abiertos: 0
```

El esquema y los scanners existen, pero todavía no hay catálogo chileno piloto, códigos reales ni imágenes. Un escaneo real devolverá principalmente `not_found` hasta importar datos verificados.

---

## 4. Validación realizada

Se realizaron pruebas transaccionales con rollback para:

- búsqueda paginada;
- páginas sin duplicados;
- GTIN válido e inválido;
- código no encontrado;
- media primaria;
- reporte idempotente;
- foto privada;
- acceso fuera de scope;
- ausencia de residuos.

---

## 5. Trabajo pendiente

### Lote piloto Chile

Crear un lote de 20–50 productos con procedencia, nutrientes revisados, nombres locales, aliases, marca y GTIN válido. Validar, crear staging y revisar antes de publicar.

### Imágenes e ilustraciones

Todavía falta el set visual de alimentos:

- estilo EVA coherente;
- assets propios o licenciados;
- WebP optimizado;
- thumbnail y tamaño medio;
- fallbacks por categoría;
- metadata y atribución.

### Fallback PWA

La PWA usa BarcodeDetector y entrada manual. No se implementó ZXing. Añadirlo solo si las pruebas reales justifican un fallback dinámico.

### Gateway PWA

El componente PWA consulta actualmente RPC mediante el cliente Supabase. Conviene unificarlo con un gateway server-side para observabilidad, rate limiting y contrato de errores consistente.

### Foto de producto faltante

Existe el campo para guardar la referencia, pero falta cerrar captura, compresión, validación, subida privada, moderación y promoción a media curada.

### Consola de curación

Falta UI profesional para lotes, rechazados, duplicados, códigos faltantes, verificación, merge, licencias y auditoría.

### QA y rendimiento

Falta probar cámaras reales en PWA, Android e iOS y medir búsqueda, payload, índices, egress, imágenes, FPS y bundle.

---

## 6. Orden para continuar

1. Dejar Vitest verde.
2. Actualizar el runbook de importación.
3. Preparar lote piloto.
4. Ejecutar validación y staging.
5. Revisar duplicados y rechazados.
6. Publicar solo el lote aprobado.
7. Crear y cargar imágenes permitidas.
8. Unificar el gateway PWA.
9. Cerrar foto de producto faltante.
10. Ejecutar E2E y mediciones.
11. Generar un solo Preview Vercel.

---

## 7. Criterios pendientes

- [ ] Vitest verde.
- [ ] Lote piloto Chile.
- [ ] GTIN real probado.
- [ ] Imágenes y licencias.
- [ ] Flujo de foto privada.
- [ ] Consola de curación.
- [ ] QA PWA/Android/iOS.
- [ ] Rendimiento y egress medidos.
- [ ] Preview estable.

**No declarar Tanda 5 completada todavía.**
