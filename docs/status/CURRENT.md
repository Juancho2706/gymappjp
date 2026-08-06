---
status: active
owner: product-engineering
last_verified: "2026-08-06"
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
| App nativa (RN) | Paridad estática amplia; falta build Android (`eas build --local`) + QA físico. iOS 1.1.0 en App Review: no cancelar, no build nueva; OTA solo post-aprobación (mientras tanto, todo OTA con `--platform android`) | [Mobile parity](MOBILE_PARITY.md) |
| Archivado de alumnos | Migraciones y fixes del P0 de alta en producción (2026-08-03); falta QA físico y matriz Team | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team; F0–F4 desplegadas en web (2026-08-05); preflight mantiene 7 enlaces V1→V2 por reconciliar | [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) · [Programa](../../specs/nutrition-exchange-lists/SPEC.md) |
| V1 nutrición | Congelada, **no se borra** (decisión owner 2026-08-03): solo migrar usuarios a V2 | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | **Congelado (cuarentena 2026-08-06)**: sin desarrollo activo ni gates locales; `apps/enterprise` permanece en el repo hasta un plan de retiro propio. El e2e de aislamiento RLS sigue en CI manual | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridades vigentes

1. Build Android `eas build --local` del corte F0 (crash de arranque + Sentry RN) + QA en dispositivo.
2. Matriz RLS con JWTs reales: alumno archivado, pausado, coach-que-es-alumno, Standalone y Team.
   Toda policy `AS RESTRICTIVE FOR ALL` exige probar también el INSERT (`WITH CHECK`) y el `RETURNING`.
3. Preflight V1→V2: reconciliar los 7 enlaces antes del corte definitivo.
4. QA físico Android/iOS (claro/oscuro, online/offline, deep links) + Playwright responsive.
5. Verificar TTFB p75 < 1,5 s por ruta en Sentry (criterio del deploy web del 05-08).

## Reglas de actualización

- `master` integrado no implica production sana: confirmar Vercel y Supabase.
- Un build verde no sustituye QA físico; una migración en el repo no significa que esté aplicada.
- Las acciones operativas/manuales viven en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md).
- Este archivo guarda solo prioridades y punteros; la evidencia extensa va a specs y auditorías fechadas.
