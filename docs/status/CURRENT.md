---
status: active
owner: product-engineering
last_verified: "2026-08-14 @ c74b176c"
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
| App nativa (RN) | OTA android `7a9b3877` (2026-08-10, commit `654efd33`): **T2.5 intercambio** (sheet 2 bloques + swipe + chip "En cola" offline, QA en device físico con modo avión). Antes: `52a37d18` (T2.4) y `3cc5db7e` (gate coach + quick-edit). iOS 1.1.0 sigue en App Review: no cancelar, no build nueva; al aprobar, replicar los OTA con `--platform ios`. Deuda: paridad RN del tab Alimentos (T2.3 fue web-only) | [Mobile parity](MOBILE_PARITY.md) |
| Archivado de alumnos | Migraciones y fixes del P0 de alta en producción (2026-08-03); falta QA físico y matriz Team | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team. En prod web: T2.1+T2.2 overrides, T2.3 hub de alimentos, T2.4 sustituciones FULL y **T2.5 intercambio por grupo (swipe ⇄ + sheet 2 bloques)** — merge `654efd33` (2026-08-10) + OTA android `7a9b3877`; 2 migraciones más en LIVE (`20260810161604`, `20260810171529`); incluye la UI optimista del Hoy web (`5139b29e`) y cierra el reparo offline de T2.4 (chip "En cola"). Decisiones abiertas del QA: H1 (buscador vs paréntesis, fix de catálogo) y D5 (pista del swipe). **T2.6 velocidad de autoría CERRADA en rama `rnmobiledenuevo` (2026-08-13, sin merge a master)**: F1 gramática destructiva unificada (undo de franja, web+RN), F2 copy semana (quick-select "próximos N" + modo Sumar en el día; franja con quick-select por decisión A), F3 tabla `coach_food_last_qty` + 2 RPC en LIVE, F4 porción pegajosa (3 caminos de precedencia verificados en DB), F5 notas visibles editables en el wizard (web+RN), F6 paridad RN parcial declarada en MOBILE_PARITY (F2/F4 RN no cruzan). Quedan T2.7 re-skin, T3.x editor único; preflight mantiene 7 enlaces V1→V2 por reconciliar | [Programa](../specs/nutrition-flows-redesign/TASKS.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) |
| V1 nutrición | Congelada, **no se borra** (decisión owner 2026-08-03): solo migrar usuarios a V2 | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | **Congelado (cuarentena 2026-08-06)**: sin desarrollo activo ni gates locales; `apps/enterprise` permanece en el repo hasta un plan de retiro propio. El e2e de aislamiento RLS sigue en CI manual | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridades vigentes

0. **iOS 1.1.0 (52) RECHAZADA otra vez (2026-08-13)** — submission `912b9afb…`, revisada en iPad Air 11" (M3). Tres guidelines: **2.5.4** (`bluetooth-central` en `UIBackgroundModes` sin BLE en background), **2.5.1** (usa HealthKit sin identificarlo en la UI) y **1.4.1** (Nutrición entrega cálculos de salud sin citas). Los tres arreglados en `rnmobiledenuevo`; **1.1.0 (53) REENVIADA el 2026-08-13 ~20:00 con video adjunto — "Pendiente de revisión"**. Esperar veredicto; NO publicar OTA a producción mientras tanto (canal compartido) | [Respuesta y checklist](../operations/app-review-1.1.0-respuesta-20260813.md)
1. Hydration del dashboard del ALUMNO (`/c/:slug/dashboard`): EVA-NEXTJS-18 sigue emitiendo post-fix del coach (triage 2026-08-09 en el issue); mismo árbol, patrón determinista server→props ya existe al lado.
2. Programa nutrición: **T2.5 F8 EN PRODUCCIÓN** (2026-08-11) — web `31fa0631` + **OTA android `723c92d6`** (runtime 1.1.0). Lleva: H1 (migración `20260811020826` en LIVE; `foods.name_search` pasa a la misma normalización que el query, asimetría 0/4.649), D5 (micro-animación one-shot del swipe, web y RN) y los **3 arreglos del reporte del coach JP** (una plantilla dejó de parecer un plan), verificados en preview con evidencia. **T2.6 cerrada el 2026-08-13 en `rnmobiledenuevo`** (detalle en [TASKS de authoring-speed](../specs/nutrition-authoring-speed/TASKS.md)). **T2.7 re-skin del alumno: F1-F4 en rama y la saga "marcar → tabs muertos" CERRADA con H13 (`c74b176c`, 2026-08-14)** — causa raíz real: tormenta de re-renders de `usePortionMarks` web bajo delta de `useOptimistic` que dejaba las transiciones del App Router (la navegación) sin turno; fix de identidad en 2 líneas + scroll-lock de modales movido a `documentElement` (el de `body` era no-op por `html{overflow-x:clip}` y desanclaba el sidebar sticky). **Validado por el owner en preview `a74ab574`** ("ya por fin funciona"); repro/verificación local sin auth en el harness `apps/web/src/app/dev-harness/nutrition-tabs` + Playwright headless (regla nueva del owner: verificar LOCAL antes de preview). RN inmune verificado (sin `useOptimistic` en `apps/mobile`); paridad T2.7 declarada en MOBILE_PARITY. Queda F5: re-QA visual (claro/oscuro/marca) + QA device, y el **merge a master es decisión del owner** (la rama va 40+ commits adelante; prod no tiene NADA de T2.6/T2.7). Pendientes de T2.6: QA en device (owner) y OTA android `--platform android` cuando el owner lo pida (android-only NO toca la build iOS en revision — practica de siempre; prohibido solo el OTA sin `--platform` o `--platform ios`). A 24-48 h: `eas update:insights` de `7a9b3877` y de `723c92d6`.
3. **Catálogo: 250 alimentos sólidos marcados como líquidos** (hallazgo 2026-08-11, reporte de un coach). `is_liquid = true` + `category = 'bebida'` en cereales, granolas y harinas ⇒ el registro libre del alumno ofrece **ml/unidad y nunca gramos**. Medido en LIVE: 677 filas con `is_liquid`, 302 con ≥200 kcal/100, de las cuales **250 no son líquidos calóricos legítimos** (212 con ≥300 kcal); 7 ya están en planes publicados y 8 tienen registros. Arreglado a mano solo el caso reportado (`Avena · Quajer`, `8a8102e6…` → sólido/g/carbohidrato). **La corrección masiva es decisión del owner**: es un cambio de datos en LIVE que altera las unidades ofrecidas sobre alimentos ya prescritos.
4. Regen completo de `database.types.ts` (deja 13 errores en 7 archivos V1; los workarounds tipados de T2.3 y el cast `V2ReadClient` se retiran ahí).
5. Matriz RLS con JWTs reales + preflight V1→V2 (7 enlaces) — sin cambios desde 08-06.
6. Verificar TTFB p75 < 1,5 s por ruta en Sentry; y a 24-48 h de los OTA `3cc5db7e` y `52a37d18`, `eas update:insights` (crashRate + installs).

## Reglas de actualización

- `master` integrado no implica production sana: confirmar Vercel y Supabase.
- Un build verde no sustituye QA físico; una migración en el repo no significa que esté aplicada.
- Las acciones operativas/manuales viven en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md).
- Este archivo guarda solo prioridades y punteros; la evidencia extensa va a specs y auditorías fechadas.
