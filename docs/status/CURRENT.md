---
status: active
owner: product-engineering
last_verified: "2026-09-05"
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
| Web/PWA | Pricing v3 productivo: Free = 1 alumno + white-label + sello «Hecho con EVA»; Pro 25 sin sello. **Deploy vigente 05-09 22:56Z: `master` = `rnmobiledenuevo` = `9c24815d`, `dpl_yJUsqXJ83osGwH9nY3zVQEiymQ3E` READY** — retiro de Starter S0–S3 + Enterprise E0/E1, 3 huecos de pricing, hidratación `EVA-NEXTJS-18` (O7.7), residuo O7.6, B11/PostHog y W6 correos por comportamiento (flag apagado). Tren de gates verde en sesión local (2 tests arreglados, `.gitleaksignore`), E2E `prod-suave` 9/9 (run `33997451520`). Anterior: `dff9b4fb` / `dpl_77CiJyBH…` (cookie corrupta, `signOut` global, `purge-data` diario). | [Runbook](../operations/RUNBOOK.md) · [spec](../specs/pricing-v3/SPEC.md) |
| App nativa (RN) | 1.1.2 es el piso OTA; canal `production` recibe android e ios por separado sobre el mismo commit. **Hotfix 04-09** íconos de alimentos al reabrir una plantilla (endpoint móvil `plan-templates` no enviaba `category` + RN no derivaba del nombre como web): OTA 1.1.2 publicada el 04-09 desde `rnmobiledenuevo` @`7395b4fb` (android `e09935cb`, ios `22c32aed`) y deploy web `dpl_Gjh6Wbrhhkk8FDKZE2qvqspTRhwS` READY (`master` = `rnmobiledenuevo` = `e9c48127`). **OTA 05-09 23:02Z** desde `master` @`9c24815d` (retiro de Starter S1/S2 + tanda 05-09): android `ea487622` / ios `59f92afe`, runtime 1.1.2. **QA del owner en device VERDE 05-09** (sesión única, artifact `6bd32370`, Android 1.1.2+86 / iOS 1.1.2+59 con OTA 04-09, web `f9ba8a3f`). | [Mobile parity](MOBILE_PARITY.md) · [OTA](../operations/MOBILE_RELEASES_OTA.md) |
| Auth: Google en el login de coach | **Fix 04-09 EN PRODUCCIÓN** (`master` = `rnmobiledenuevo` = `22644899`, deploy `dpl_CZKUwNthWaeQL2cvS6nG55k4eMGx` READY, OTA 1.1.2 android `d8220490` / ios `54487ddd`; **QA del owner VERDE 05-09** — artifact `6bd32370`: el alumno que toca Google en `/login` ve el copy nuevo y su correo queda libre; el coach nuevo va a `/register`): «Continuar con Google» sin cuenta de coach dejaba un `auth.users` huérfano que «ocupaba» el correo del alumno (caso Leonardo/Movens; huérfano borrado a mano en LIVE el 04-09). Ahora un LOGIN con Google sin fila `coaches` ya no cae en `/coach/onboarding/complete` (alta de coach): `resolvePostGoogleAuthUrl` (web) y `login.tsx` (RN) avisan a `POST /api/auth/google-orphan-cleanup` / `/api/mobile/auth/google-orphan-cleanup`, que borra solo al usuario demostrablemente vacío (`lib/auth/google-orphan-cleanup.ts`), cierran la sesión y rebotan a `/login` con copy que manda al alumno a su código y al coach nuevo a `/register` (el alta por Google sigue ahí). F2b (alta de alumno con cuenta existente) sigue en backlog. | [Login y auth](../architecture/FLOWS_AND_COMPONENTS.md) |
| Archivado de alumnos | P0 de alta en producción (2026-08-03); **QA físico VERDE 05-09** (artifact `6bd32370`); queda la matriz Team. | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team; el programa de rediseño cerró el 2026-08-17. | [Programa](../specs/nutrition-flows-redesign/TASKS.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) |
| V1 nutrición | Congelada, **no se borra** (decisión owner 2026-08-03): solo migrar usuarios a V2. | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | **ELIMINADO de EVA (decisión del owner 2026-09-01)**: E0+E1 EN PRODUCCIÓN 05-09 22:56Z (app Expo, specs y scripts borrados; `/enterprise` ⇒ 308 a `/pricing`); E2/E3 planificadas en el SDD. | [SDD retiro](../specs/retiro-starter-y-enterprise/SPEC.md) · [Ola de orden](../specs/ola-de-orden/TASKS.md) · [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridades vigentes

1. **Tren «Ciclo real y por lado» (feedback Movens) — EN PRODUCCIÓN 04-09 02:25Z, QA del owner VERDE 04-09, SDD `done`** ([tareas](../specs/ciclo-real-y-por-lado/TASKS.md);
   `master` = `rnmobiledenuevo` = `a567f6e2`, deploy `dpl_DZ76aJq5…` READY, 4 migraciones en LIVE `20260904022120`…`022257`,
   OTA 1.1.2 android `fd2e1212` / ios `248580e4`; detalle en [MOBILE_PARITY](MOBILE_PARITY.md)):
   ciclo N-días real (cursor por completitud, «Día N de M», «Empezar hoy»), fuerza por lado (reps izq/der + un peso),
   ficha del coach con tipo y lado, builder «Ninguno | Por lado | Alternado», PWA día 1, SW v5 + purga de caches.
   Las 4 migraciones (`20260903212038`…`212800`, validadas en LIVE con ROLLBACK) se aplican DESPUÉS del deploy y ANTES
   de la OTA (R35). QA del owner verde el 04-09 (ciclo y fuerza por lado, reporte global). Queda: el aviso a coaches (W6.5b,
   texto en TESTING-QA §11; **enviado el 05-09**) y el E2E W6.8: **VERDE 05-09** (run `33997451520`, job `e2e` `prod-suave` 9/9 en 38,9 s; los secrets
   `E2E_*` viven en GitHub).
2. **Tanda «QA del owner 02-09» (ejecutor, Share Entreno, accesos A–J) — EN PRODUCCIÓN, SDD `done`**
   ([spec](../specs/qa-ejecutor-share-0209/SPEC.md)): `master` `0f545926`, deploy `dpl_35ZT6w7o…` READY,
   OTA android `bd2bc6e8` / ios `025d158f`; ronda 2 android `fc78e1c8` / ios `c46d4eed`.
   P5 (color efectivo, `8c7161f3`) y B2–B9 salieron en los trenes del 02-09 tarde. **QA del owner en device VERDE 05-09**
   (artifact `6bd32370`): B6, E10, F6, G6, G7, H8 y J4 cerradas; quedan F7 (reportar 3 decisiones) y P3.
3. **Tren «billing + seguridad» — EN PRODUCCIÓN 02-09** (`master` `16c06fba`, deploy `dpl_8AJgWw36…`
   READY, OTA android `42f021f4` / ios `4052b874`): **QA del owner en device VERDE 05-09** (código → marca →
   login; artifact `6bd32370`). **SEC-01 fase 3 APLICADA en LIVE el 05-09** (`20260905190100_sec01_phase3_revoke_invite_code_anon`,
   adelantada desde el 09-09): `invite_code` revocado a `anon` y verificado con la anon key — `42501` en
   `select=invite_code`, login por código sigue en 200. **Frente cerrado.** [MANUAL_TASKS § SEC-01](../operations/MANUAL_TASKS.md)
4. **Tren «cierre de backlog 02-09» — EN PRODUCCIÓN 02-09 19:55Z** (`master` `794aee52`, deploy
   `dpl_E6Rt7ETY…` READY, OTA 1.1.2 android grupo `ec7da7fb` / ios grupo `6db6747f`): **QA del owner en
   device VERDE 02-09** (11 puntos). **Ola 2 chica + higiene EN CÓDIGO 02-09 noche** (`5f3c48f2`…`31c1f7a8`,
   8 commits, RPC `substitutions` ya aplicado en LIVE): salió con el push del tren «Ciclo real y por lado» (03-09).
   **QA en device de lo nuevo y del acumulado de 18: VERDE 05-09** (artifact `6bd32370`) ⇒
   `docs/testing/QA_DEVICE_PENDIENTE.md` queda **sin pendientes**. [MOBILE_PARITY](MOBILE_PARITY.md)
5. **(a) `EVA-NEXTJS-18` (hidratación en `/c/[coach_slug]/dashboard?recuperar=…`) — causa confirmada
   y FIX EN PRODUCCIÓN 05-09 22:56Z (O7.7, deploy `dpl_yJUsqXJ8…`)**: el barrido O7.1 se salteó
   `WorkoutPlanCard.fmtShortDate` (client component del dashboard del ALUMNO); ahora usa
   `formatShortDayMonthEs` (tabla fija, cero `Intl`). **Verificar en Sentry el 08-09 ~23:00Z (72 h del deploy).**
   **(b) `E394` = `EVA-NEXTJS-19` — 0 eventos desde el 01-09
   18:42Z con tráfico alto (12.230 spans en la ruta) ⇒ O6.8 cumplida**, **resuelto en Sentry con nota
   el 05-09** (C3 cerrada con la misma evidencia); O7.4 desestimado salvo regresión (decisión del jefe
   05-09). [tareas § O7](../specs/cierre-sentry-vivos/TASKS.md)
6. **Errores al día (ola O6) — EN PRODUCCIÓN 01-09** (`master` `231d2937`, OTA 1.1.2 android
   `d2f948a0` / ios `d40564a9`; QA device del owner verde): O6.8 cumplida el 05-09 (ver 5b);
   `EVA-MOBILE-9` **resuelto con nota el 05-09** (O6.9), pero el mismo síntoma vive en `EVA-MOBILE-F`
   (iOS 02-09, Android 04-09, viaMorph fresh 4,7 s), que sigue **abierto**; Skia exige build nativo y P5
   `noUncheckedIndexedAccess` (431 errores) como tanda propia. **O7.6 cerrado 05-09**: (a) y (b) ya
   estaban en código desde `136e0411` (02-09) y el residuo `ProfileOverviewB3.fmtHabitDate` salió
   EN PRODUCCIÓN 05-09 22:56Z. [tareas § O6/O7](../specs/cierre-sentry-vivos/TASKS.md)
7. **PLAN «Cobros coach → alumno» — BLOQUEADO, nada implementado** ([spec](../specs/cobros-coach-alumno/SPEC.md)
   `draft`, versionada en `edf6a07c`; artifact `046f3bb1`): esperan 8 decisiones del owner (§18.1) y
   3 verificaciones externas (§18.2: contador SII, abogado retracto, smoke MP con plata real).
   Estimación 26-32 días-agente + 2-3 semanas de beta.
8. **Embudo Free→Pro — W0–W6 EN PRODUCCIÓN** ([spec](../specs/embudo-free-pro/SPEC.md); último OTA
   1.1.2 `28ca5f8d` / `8cced802`): **W4.6 y W6.8 con QA del owner en device VERDE 05-09** (artifact
   `6bd32370`); queda App Store Connect (W7.4).
9. **Onboarding del coach v2 — W1–W4.7 y W5 parcial EN PRODUCCIÓN** ([spec](../specs/coach-onboarding-v2/SPEC.md),
   último `8cf7b886`): **W6 (correos por comportamiento) EN PRODUCCIÓN 05-09 22:56Z**, detrás de
   `ONBOARDING_BEHAVIOR_EMAILS_ENABLED` (default APAGADO; **no encender hasta aprobar el copy**) — F6.1 y F6.2
   hechos, F6.3 con tests verdes (pie del html pinneado en `651762a6`). D11 ejecutado: el drip por calendario queda apagado por defecto y
   `FREE_COACH_DRIP_ENABLED=true` lo resucita. W8.4.1 / W8.4.2A / W8.4.4 hechos; **W8.4.2B (disparo en línea)
   a medias**: `enqueueBehaviorCheck` exportada pero sin sus 3 call sites. D13 (WhatsApp del owner) entra por
   `OWNER_WHATSAPP_URL`. Quedan W7 (medición/Playwright/Maestro), F5.3–F5.5 RN y la revisión D4 del contenido de
   ejemplo; de [vive-tu-app-directo](../specs/vive-tu-app-directo/SPEC.md) quedan V5.4 y V2.13.
   **Envs pendientes en Vercel:** `ONBOARDING_BEHAVIOR_EMAILS_ENABLED` (NO setear aún),
   `ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN=true` para la primera auditoría y `OWNER_WHATSAPP_URL` (D13).
   `FREE_COACH_DRIP_ENABLED` **no** se setea.
10. **Pricing — «trial al tocar el cupo»: decisión del owner POSTERGADA al 08-09** (recordatorio
    automático). Los 3 huecos previos quedaron **EN PRODUCCIÓN 05-09 22:56Z**: (1) el cerco de cupo
    del `/join` ya estaba cableado (`join-capacity.ts`) — se agregó el pin del Free con columna = 1;
    (2) fallback a starter: **cerrado** por el retiro de Starter; (3) callejón de `paused`:
    `/coach/subscription/update-card` queda exenta del gate y `/coach/reactivate` suma el CTA
    «Cambiar tarjeta» cuando hay preapproval MP vivo.
    **DECISIONES DEL OWNER pendientes:** (a) la gracia de dunning para `paused` es letra muerta porque el
    webhook nulea `current_period_end` (`subscription-state.ts:32` vía `webhook-pipeline.ts:1098`) ⇒ hacerla
    simétrica a `past_due` (otorgar días de acceso) o borrar la gracia del comentario; (b) apuntar el CTA del
    correo de dunning (`webhook-pipeline.ts:244/1241`) a `/coach/subscription/update-card`; (c) el camino Flow
    del dunning no tiene CTA (`changeCardForCoach` devuelve `WRONG_PROVIDER`); (d) label «Starter» en
    `processing`/`flow-processing`: **cerrado** por el mismo retiro.
    **Retiro de Starter: S0–S3 y E0/E1 EN PRODUCCIÓN 05-09** (deploy `dpl_yJUsqXJ8…`, OTA android
    `ea487622` / ios `59f92afe`; humo `/coach/reactivate?tier=starter` ⇒ «Plan seleccionado: Pro» verificado con un
    coach de prueba elite expirado, creado y borrado) ([SDD](../specs/retiro-starter-y-enterprise/SPEC.md)); absorbió (2) y (d).
11. **iOS/Android — 1.1.2 aprobada y en tienda ⇒ piso OTA 1.1.2**: 1.1.3 no tiene motivo (cero cambio
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
