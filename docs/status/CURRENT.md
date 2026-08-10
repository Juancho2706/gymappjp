---
status: active
owner: product-engineering
last_verified: "2026-08-10"
canonical: true
---

# Current status

Vista global mínima: solo prioridades vigentes y punteros. El código, las migraciones aplicadas y
el estado remoto (Vercel/Supabase) prevalecen sobre este resumen. La cronología y la evidencia
viven en `specs/`, `docs/audits/` y el historial de git, no aquí.

## Estado por frente

| Frente | Estado | Fuente de detalle |
|---|---|---|
| Web/PWA | Productivo; confirmar deployment activo antes de incidentes o despliegues | [Runbook](../operations/RUNBOOK.md) |
| App nativa (RN) | OTA android `52a37d18` (2026-08-10): T2.4 sustituciones, verificado en device físico con modo avión incluido. Antes, `3cc5db7e`: gate coach fail-closed + T2.2 quick-edit. iOS 1.1.0 sigue en App Review: no cancelar, no build nueva; al aprobar, replicar el OTA con `--platform ios`. Deudas: paridad RN del tab Alimentos (T2.3 fue web-only) y falta de señal visible al encolar una sustitución sin red (va con T2.5) | [Mobile parity](MOBILE_PARITY.md) |
| Archivado de alumnos | Migraciones y fixes del P0 de alta en producción (2026-08-03); falta QA físico y matriz Team | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team. En prod web: T2.1+T2.2 overrides, T2.3 hub de alimentos y **T2.4 sustituciones FULL** (merge `9dde4135`, 2026-08-10, con QA web y device verdes). Dos migraciones en LIVE: `20260809222811` (lectura de opciones) y `20260809230833` (guard de autorización sobre `record_`/`correct_`). Quedan T2.5 swipe + sheet, T2.6, T2.7 re-skin, T3.x editor único; preflight mantiene 7 enlaces V1→V2 por reconciliar | [Programa](../specs/nutrition-flows-redesign/TASKS.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) |
| V1 nutrición | Congelada, **no se borra** (decisión owner 2026-08-03): solo migrar usuarios a V2 | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | **Congelado (cuarentena 2026-08-06)**: sin desarrollo activo ni gates locales; `apps/enterprise` permanece en el repo hasta un plan de retiro propio. El e2e de aislamiento RLS sigue en CI manual | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridades vigentes

1. Hydration del dashboard del ALUMNO (`/c/:slug/dashboard`): EVA-NEXTJS-18 sigue emitiendo post-fix del coach (triage 2026-08-09 en el issue); mismo árbol, patrón determinista server→props ya existe al lado.
2. Programa nutrición: **T2.5 swipe ⇄ + sheet de 2 bloques** sobre la action de T2.4 (ya en prod). Diseño en el catálogo de pantallas del rediseño, sección "Alumno · 02 Intercambio". Arrastra el reparo de T2.4: sin señal visible al encolar sin red. Paridad RN del tab Alimentos como tanda propia.
3. Regen completo de `database.types.ts` (deja 13 errores en 7 archivos V1; los workarounds tipados de T2.3 y el cast `V2ReadClient` se retiran ahí).
4. Matriz RLS con JWTs reales + preflight V1→V2 (7 enlaces) — sin cambios desde 08-06.
5. Verificar TTFB p75 < 1,5 s por ruta en Sentry; y a 24-48 h de los OTA `3cc5db7e` y `52a37d18`, `eas update:insights` (crashRate + installs).

## Reglas de actualización

- `master` integrado no implica production sana: confirmar Vercel y Supabase.
- Un build verde no sustituye QA físico; una migración en el repo no significa que esté aplicada.
- Las acciones operativas/manuales viven en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md).
- Este archivo guarda solo prioridades y punteros; la evidencia extensa va a specs y auditorías fechadas.
