---
status: active
owner: product-engineering
last_verified: "2026-09-02"
canonical: true
---

# Current status

Vista global mínima: solo prioridades vigentes y punteros. Cada prioridad ocupa como máximo 4 líneas
(título, estado, qué queda, link). La cronología, los commits intermedios, los gates y la evidencia
viven en la spec de cada frente (`docs/specs/*/TASKS.md` § «Cierre»), en `docs/audits/` y en el
historial de git — no aquí. El código, las migraciones aplicadas y el estado remoto (Vercel/Supabase)
prevalecen sobre este resumen. La prosa retirada el 2026-09-02 está en
[current-historial-2026-09](../archive/current-historial-2026-09.md).

## Estado por frente

| Frente | Estado | Fuente de detalle |
|---|---|---|
| Web/PWA | Pricing v3 productivo: Free = 1 alumno + white-label + sello «Hecho con EVA»; Pro 25 sin sello. | [Runbook](../operations/RUNBOOK.md) · [spec](../specs/pricing-v3/SPEC.md) |
| App nativa (RN) | 1.1.2 es el piso OTA; canal `production` recibe android e ios por separado sobre el mismo commit. **Hotfix 04-09** íconos de alimentos al reabrir una plantilla (endpoint móvil `plan-templates` no enviaba `category` + RN no derivaba del nombre como web): OTA 1.1.2 publicada el 04-09 desde `rnmobiledenuevo` @`7395b4fb` (android `e09935cb`, ios `22c32aed`) y deploy web `dpl_Gjh6Wbrhhkk8FDKZE2qvqspTRhwS` READY (`master` = `rnmobiledenuevo` = `e9c48127`). QA del owner en device pendiente. | [Mobile parity](MOBILE_PARITY.md) · [OTA](../operations/MOBILE_RELEASES_OTA.md) |
| Archivado de alumnos | P0 de alta en producción (2026-08-03); falta QA físico y matriz Team. | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team; el programa de rediseño cerró el 2026-08-17. | [Programa](../specs/nutrition-flows-redesign/TASKS.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) |
| V1 nutrición | Congelada, **no se borra** (decisión owner 2026-08-03): solo migrar usuarios a V2. | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | **ELIMINADO de EVA (decisión del owner 2026-09-01)**: no tocar; la demolición es el backlog B15. | [Ola de orden](../specs/ola-de-orden/TASKS.md) · [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridades vigentes

1. **Tren «Ciclo real y por lado» (feedback Movens) — EN PRODUCCIÓN 04-09 02:25Z, QA del owner VERDE 04-09, SDD `done`** ([tareas](../specs/ciclo-real-y-por-lado/TASKS.md);
   `master` = `rnmobiledenuevo` = `a567f6e2`, deploy `dpl_DZ76aJq5…` READY, 4 migraciones en LIVE `20260904022120`…`022257`,
   OTA 1.1.2 android `fd2e1212` / ios `248580e4`; detalle en [MOBILE_PARITY](MOBILE_PARITY.md)):
   ciclo N-días real (cursor por completitud, «Día N de M», «Empezar hoy»), fuerza por lado (reps izq/der + un peso),
   ficha del coach con tipo y lado, builder «Ninguno | Por lado | Alternado», PWA día 1, SW v5 + purga de caches.
   Las 4 migraciones (`20260903212038`…`212800`, validadas en LIVE con ROLLBACK) se aplican DESPUÉS del deploy y ANTES
   de la OTA (R35). QA del owner verde el 04-09 (ciclo y fuerza por lado, reporte global). Queda: el aviso a coaches (W6.5b,
   texto en TESTING-QA §11) y el E2E local (W6.8, faltan variables `E2E_*`).
2. **Tanda «QA del owner 02-09» (ejecutor, Share Entreno, accesos A–J) — EN PRODUCCIÓN, SDD `done`**
   ([spec](../specs/qa-ejecutor-share-0209/SPEC.md)): `master` `0f545926`, deploy `dpl_35ZT6w7o…` READY,
   OTA android `bd2bc6e8` / ios `025d158f`; ronda 2 android `fc78e1c8` / ios `c46d4eed`.
   P5 (color efectivo, `8c7161f3`) y B2–B9 salieron en los trenes del 02-09 tarde. Queda: QA del owner en device.
3. **Tren «billing + seguridad» — EN PRODUCCIÓN 02-09** (`master` `16c06fba`, deploy `dpl_8AJgWw36…`
   READY, OTA android `42f021f4` / ios `4052b874`): queda la fase 3 de SEC-01 (revocar `invite_code`
   a `anon`) cuando la OTA esté adoptada y el QA del owner en device (código → marca → login). Los
   secrets de E2E ya están (coach QA propio, run verde 33673130561). [MANUAL_TASKS § SEC-01](../operations/MANUAL_TASKS.md)
4. **Tren «cierre de backlog 02-09» — EN PRODUCCIÓN 02-09 19:55Z** (`master` `794aee52`, deploy
   `dpl_E6Rt7ETY…` READY, OTA 1.1.2 android grupo `ec7da7fb` / ios grupo `6db6747f`): **QA del owner en
   device VERDE 02-09** (11 puntos). **Ola 2 chica + higiene EN CÓDIGO 02-09 noche** (`5f3c48f2`…`31c1f7a8`,
   8 commits, RPC `substitutions` ya aplicado en LIVE): sale con el push del tren «Ciclo real y por lado» (03-09); queda el QA en device de lo nuevo y
   el acumulado de 18 (`docs/testing/QA_DEVICE_PENDIENTE.md`). [MOBILE_PARITY](MOBILE_PARITY.md)
5. **`EVA-NEXTJS-18` (hidratación: mes abreviado con punto en Safari) — FIX EN PRODUCCIÓN 02-09**
   (`master` `91e7edf6`, deploy `dpl_EiFib2Xr…` READY, solo web, sin OTA): queda el E394 sin causa
   raíz — el guardián J solo lo convierte en una recarga única.
   [tareas § O7](../specs/cierre-sentry-vivos/TASKS.md)
6. **Errores al día (ola O6) — EN PRODUCCIÓN 01-09** (`master` `231d2937`, OTA 1.1.2 android
   `d2f948a0` / ios `d40564a9`; QA device del owner verde): queda O6.8 = verificar a 72 h (~04-09)
   que nada regresó, `EVA-MOBILE-9` abierto, Skia exige build nativo y P5 `noUncheckedIndexedAccess`
   (431 errores) como tanda propia. [tareas § O6](../specs/cierre-sentry-vivos/TASKS.md)
7. **PLAN «Cobros coach → alumno» — BLOQUEADO, nada implementado** ([spec](../specs/cobros-coach-alumno/SPEC.md)
   `draft`, versionada en `edf6a07c`; artifact `046f3bb1`): esperan 8 decisiones del owner (§18.1) y
   3 verificaciones externas (§18.2: contador SII, abogado retracto, smoke MP con plata real).
   Estimación 26-32 días-agente + 2-3 semanas de beta.
8. **Embudo Free→Pro — W0–W6 EN PRODUCCIÓN** ([spec](../specs/embudo-free-pro/SPEC.md); último OTA
   1.1.2 `28ca5f8d` / `8cced802`): queda el QA del owner en device de W4.6 y W6.8 (guía en el artifact
   `00246733-723b-456f-82c0-f14c8588d137`) y App Store Connect (W7.4).
9. **Onboarding del coach v2 — W1–W4.7 y W5 parcial EN PRODUCCIÓN** ([spec](../specs/coach-onboarding-v2/SPEC.md),
   último `8cf7b886`): quedan W6 (correos por comportamiento), W7 (medición/Playwright/Maestro),
   F5.3–F5.5 RN y la revisión D4 del contenido de ejemplo; de
   [vive-tu-app-directo](../specs/vive-tu-app-directo/SPEC.md) quedan V5.4 y V2.13.
10. **iOS/Android — 1.1.2 aprobada y en tienda ⇒ piso OTA 1.1.2**: 1.1.3 no tiene motivo (cero cambio
   nativo desde la build 59); Android sigue en 1.1.2 (build 86, closed testing Alpha) y producción
   espera 12 testers × 14 días. [OTA](../operations/MOBILE_RELEASES_OTA.md)
10. Regen completo de `database.types.ts` (deja 13 errores en 7 archivos V1; ahí se retiran los
    workarounds tipados de T2.3 y el cast `V2ReadClient`).
11. Matriz RLS con JWTs reales + preflight V1→V2 (7 enlaces) — sin cambios desde 08-06.
13. **TTFB del área alumno**: la causa medida era la REGIÓN y ya está corregida (`regions: ["pdx1"]`,
    `deb8aee3`). Queda re-medir el delta (p50/p75 de `/c/:coach_slug/dashboard`, 24 h antes vs
    después) y decidir QW3 (doble render móvil+desktop).
    [historial](../archive/current-historial-2026-09.md)
14. **Cerrado (ver spec; backlog residual en cada TASKS):** Ejercicios propios ([tareas](../specs/ejercicios-propios-web/TASKS.md)) ·
    Ola de orden W1→W4 ([tareas](../specs/ola-de-orden/TASKS.md)) · Pricing v3 ([spec](../specs/pricing-v3/SPEC.md)) ·
    Programa nutrición T2.5–T2.7 ([programa](../specs/nutrition-flows-redesign/TASKS.md)) · hydration 15-08 y
    catálogo sólidos ([historial](../archive/current-historial-2026-09.md)).

## Reglas de actualización

- `master` integrado no implica production sana: confirmar Vercel y Supabase.
- Un build verde no sustituye QA físico; una migración en el repo no significa que esté aplicada.
- Las acciones operativas/manuales viven en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md).
- Este archivo guarda solo prioridades y punteros; la evidencia extensa va a specs y auditorías
  fechadas. **Tope duro: 16 KB, verificado por `pnpm docs:check`** — si no entra, la historia se
  mueve a la spec, no se resume acá.
