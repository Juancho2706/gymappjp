# EVA Nutrición V2 — implementación actual y mapa de archivos

**Fecha:** 15 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**PR:** #121, draft

Este documento describe lo que existe realmente en la rama. No implica que todas las piezas estén listas para usuarios.

---

## 1. Arquitectura actual

```txt
Web/PWA y React Native
        ↓
Contratos Zod compartidos
        ↓
Services / API routes / repositorios RN
        ↓
RPC compactos y mutaciones transaccionales
        ↓
Supabase Postgres + Storage + RLS
```

Principios implementados:

- dominio V2 paralelo y aditivo;
- V1 continúa como fallback;
- una fuente canónica para intake nuevo;
- snapshots diarios;
- versiones inmutables después de publicar;
- gates fail-closed;
- contratos compartidos web/RN;
- catálogo local;
- no IA generativa;
- no APIs externas de alimentos en runtime.

---

## 2. Contratos compartidos

Directorio:

```txt
packages/nutrition-v2/
```

### `design.ts`

- estrategias structured/flexible/hybrid;
- macros y formatos;
- estados de UI;
- modelos de cards/franjas/alimentos;
- motion derivado de `@eva/brand-kit`.

### `contracts.ts`

- plan draft;
- variantes;
- meal slots;
- items prescritos;
- permisos del alumno;
- intake/correction;
- snapshots;
- idempotency keys.

### `read-models.ts`

- Today;
- Plan;
- History;
- Coach Hub;
- Client Detail;
- schema version 1.

### `rollout.ts`

- mode off/canary/on;
- allowlists por alumno/coach/team/org;
- superficies webStudent/webCoach/mobileStudent/mobileCoach;
- resolución fail-closed.

### `catalog.ts`

- catálogo y media;
- estados de verificación;
- búsqueda/cursor;
- lookup GTIN;
- reportes faltantes;
- staging.

### Tests

```txt
contracts.test.ts
read-models.test.ts
```

---

## 3. Design System web

```txt
apps/web/src/components/nutrition-v2/
```

Archivos:

- `NutritionV2Kit.tsx` — shell, header, toolbar, cards, timeline, filas, estados, skeletons, builder primitives.
- `NutritionV2Overrides.tsx` — macros y preview semántico.
- `NutritionV2Motion.tsx` — microinteracciones accesibles.
- `FoodScannerClient.tsx` — scanner PWA canary.
- `NutritionV2Kit.test.tsx` — pruebas de componentes.
- `index.ts` — superficie pública.

No introducir componentes nuevos duplicando estas primitivas sin justificarlo.

---

## 4. Design System React Native

```txt
apps/mobile/components/nutrition-v2/
```

Archivos:

- `NutritionV2Kit.tsx` — equivalentes RN.
- `NutritionCard.tsx` — card semántica nativa.
- `index.ts` — exports públicos.

Tecnologías:

- NativeWind;
- Moti/Reanimated;
- Expo Image;
- Expo Haptics;
- reduced motion mediante `useEvaMotion()`.

---

## 5. Web del alumno

### Ruta canary

```txt
apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx
```

Vertical slice actual:

- Today;
- Plan;
- History paginado;
- gate server-side;
- fallback/redirect a V1;
- lectura mediante RPC.

### Scanner

```txt
apps/web/src/app/c/[coach_slug]/nutrition-v2/scanner/page.tsx
apps/web/src/components/nutrition-v2/FoodScannerClient.tsx
```

### Servicios

```txt
apps/web/src/services/nutrition-v2-read.service.ts
apps/web/src/services/nutrition-v2-rollout.service.ts
```

---

## 6. Web del coach

```txt
apps/web/src/app/coach/nutrition-v2/page.tsx
apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx
```

Vertical slice actual:

- Centro básico;
- métricas de la página;
- motivos de atención;
- navegación a ficha;
- ficha con Today/Plan/recientes;
- gate canary;
- Builder todavía deshabilitado.

Bloqueo conocido: los services/gateways deben terminar de migrar a los RPC scoped.

---

## 7. API móvil alojada en Next.js

```txt
apps/web/src/app/api/mobile/nutrition-v2/
```

### `_shared.ts`

- token/auth;
- cliente RPC Bearer-scoped;
- gate de rollout;
- respuestas no-store;
- logging seguro.

### `read/route.ts`

- Today;
- Plan;
- History.

### `coach/route.ts`

- Hub;
- Client Detail.

Pendiente: pasar scopeType/teamId/orgId y usar RPC scoped.

### `intake/route.ts`

- record;
- correction;
- schemas compartidos;
- RPC idempotentes.

### `catalog/route.ts`

- búsqueda;
- lookup GTIN;
- reporte de faltante.

---

## 8. React Native del alumno

```txt
apps/mobile/app/alumno/nutrition-v2/index.tsx
apps/mobile/app/alumno/nutrition-v2/scanner.tsx
apps/mobile/app/alumno/add-food.tsx
```

Implementado:

- Today canary;
- caché stale-while-revalidate visual;
- estado offline;
- contador de cola;
- macros/timeline;
- scanner Expo Camera;
- entrada manual.

Pendiente:

- Plan e Historial RN completos;
- intake completo integrado en Today;
- cancelación real al desmontar;
- E2E/device QA.

---

## 9. React Native del coach

```txt
apps/mobile/app/coach/nutrition-v2/index.tsx
apps/mobile/app/coach/nutrition-v2/[clientId].tsx
```

Implementado:

- Hub canary;
- ficha básica;
- caché local;
- lectura por API.

Pendiente:

- workspace scoped extremo a extremo;
- navegación integrada;
- Builder;
- virtualización/paginación final;
- QA en dispositivos.

---

## 10. Repositorios y estado RN

```txt
apps/mobile/lib/nutrition-v2.api.ts
apps/mobile/lib/nutrition-v2-catalog.api.ts
apps/mobile/lib/nutrition-v2-cache.ts
apps/mobile/lib/nutrition-v2-offline.ts
apps/mobile/lib/flags.ts
```

### API

- parsing Zod;
- AbortSignal;
- endpoints versionados;
- record/correct tipados.

### Cache

- versionada;
- por usuario/alumno/kind/scope;
- TTL;
- máximo 750 KB;
- validación al leer.

### Offline

- queue record/correct;
- deduplicación;
- idempotencia;
- backoff;
- dead letter;
- separación por usuario.

### Flags

- defaults locales V2 en false;
- override remoto desde config móvil.

---

## 11. Supabase — dominio V2

Migraciones principales:

```txt
20260714190000_nutrition_v2_domain.sql
20260714190500_nutrition_v2_security_rpc.sql
20260714191000_nutrition_v2_hardening.sql
20260714191500_nutrition_v2_private_notes.sql
20260714192000_nutrition_v2_history_adapter_fix.sql
20260714192500_nutrition_v2_draft_delete_and_effective_versions.sql
```

Tablas:

```txt
nutrition_plans_v2
nutrition_plan_versions_v2
nutrition_day_variants_v2
nutrition_meal_slots_v2
nutrition_prescription_items_v2
nutrition_day_snapshots_v2
nutrition_v2_audit_log
nutrition_plan_private_notes_v2
```

Extensiones de intake:

- actor;
- rol;
- idempotency;
- status/revision;
- correction chain;
- timezone/occurred_at;
- versión/snapshot/prescripción;
- source/capture/meal slot V2.

RPC de escritura:

```txt
publish_nutrition_plan_v2
ensure_nutrition_day_snapshot_v2
record_nutrition_intake_v2
correct_nutrition_intake_v2
get_nutrition_history_adapter_v2
```

---

## 12. Supabase — read models

```txt
20260714210000_nutrition_v2_today_plan_read_models.sql
20260714210500_nutrition_v2_history_coach_read_models.sql
20260714211000_nutrition_v2_scoped_coach_reads.sql
```

RPC alumno:

```txt
get_nutrition_today_v2
get_nutrition_plan_read_v2
get_nutrition_history_page_v2
```

RPC profesional vigentes:

```txt
get_nutrition_coach_hub_scoped_v2
get_nutrition_client_detail_scoped_v2
```

El Hub sin scope fue revocado para authenticated.

---

## 13. Supabase — catálogo y media

```txt
20260714220000_food_catalog_v2_schema.sql
20260714220500_food_catalog_v2_rpc.sql
```

Tablas:

```txt
food_media
food_catalog_import_batches
food_catalog_import_rows
food_catalog_missing_codes (extendida)
foods (extendida)
```

Buckets:

```txt
food-media
food-submissions
```

RPC:

```txt
search_food_catalog_v2
lookup_food_by_gtin_v2
report_missing_food_gtin_v2
```

---

## 14. Scripts y CI

```txt
scripts/check-nutrition-v2-boundaries.mjs
scripts/import-food-catalog-cl.mjs
.github/workflows/nutrition-v2-boundaries.yml
.github/workflows/ci.yml
.github/workflows/mobile-integration-ci.yml
supabase/tests/nutrition_v2_domain_rollback.sql
```

Boundary guard prohíbe importar shells legacy dentro de futuras superficies V2.

---

## 15. Documentación rectora

```txt
docs/product/NUTRITION_TOTAL_REWORK_AUDIT_2026.md
docs/product/NUTRITION_V2_MASTER_EXECUTION_PLAN_2026.md
docs/product/nutrition-v2/
docs/operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md
docs/operations/FOOD_CATALOG_CL_IMPORT.md
CLAUDE.md
```

---

## 16. Estado productivo actual

El esquema está aplicado, pero no hay datos V2 reales:

```txt
planes V2: 0
versiones V2: 0
snapshots V2: 0
intakes V2: 0
auditorías V2: 0
```

Catálogo:

```txt
foods: 344
barcode: 0
productos Chile: 0
media: 0
lotes: 0
```

V1 continúa operando y el rollout V2 permanece cerrado salvo configuración canary explícita.
