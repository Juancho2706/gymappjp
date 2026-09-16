---
status: active
owner: product-engineering
last_verified: "2026-09-16"
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
| Web/PWA | Pricing v3 productivo: Free = 1 alumno + white-label + sello «Hecho con EVA»; Pro 25 sin sello. **Deploy vigente 16-09 ~02:30Z: `master` = `rnmobiledenuevo` = `0748acd3`, `dpl_HQH52H1T…` READY** — «Dossier por meses» ([SDD](../specs/dossier-por-meses/SPEC.md)), migración LIVE `20260916014833`. Anteriores: 11-09 `f77d8400` / `dpl_H2B91dcR…` («Despegue rápido») y el resto del 11-09, con sus hashes en el [historial](../archive/current-historial-2026-09.md). | [Runbook](../operations/RUNBOOK.md) · [spec](../specs/pricing-v3/SPEC.md) |
| App nativa (RN) | 1.1.2 sigue siendo el piso OTA mientras Apple no apruebe 1.1.3; el runtime 1.1.3 existe porque el SDK de Meta es cambio nativo y su build 61 está en App Review. **OTAs vigentes 16-09 ~02:30Z** («Dossier por meses»): ios runtime **1.1.3** grupo `a73f71a0` (run 35047893693, desde `master` @`0748acd3`) + android/ios runtime **1.1.2** desde el tag `ota/1.1.2-20260916` = `64ad9615` (runs 35048341298 / 35048343745). Sin Android 1.1.3 (no hay binario). OTAs anteriores (11-09 android `a349abee` / ios `d7b9a9d5` y previas) en el [historial](../archive/current-historial-2026-09.md). | [Mobile parity](MOBILE_PARITY.md) · [OTA](../operations/MOBILE_RELEASES_OTA.md) |
| Auth: Google en el login de coach | **Fix 04-09 EN PRODUCCIÓN, QA del owner VERDE 05-09** (hashes, deploy, OTA y detalle técnico en el [historial](../archive/current-historial-2026-09.md)): un LOGIN con Google sin fila `coaches` dejaba un `auth.users` huérfano que ocupaba el correo del alumno (caso Leonardo/Movens); ahora `resolvePostGoogleAuthUrl`/`login.tsx` lo limpian y rebotan a `/login` con el copy correcto. Queda F2b (alta de alumno con cuenta existente) en backlog. | [Login y auth](../architecture/FLOWS_AND_COMPONENTS.md) |
| Archivado de alumnos | P0 de alta en producción (2026-08-03); **QA físico VERDE 05-09** (artifact `6bd32370`); queda la matriz Team. | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team; el programa de rediseño cerró el 2026-08-17. «Porciones a la chilena» EN PRODUCCIÓN 10-09 y «Cantidades honestas» EN PRODUCCIÓN 06-09, ambos con QA del owner VERDE (SDD `done`); hashes y RPC en el [historial](../archive/current-historial-2026-09.md). | [Porciones CL](../specs/nutrition-porciones-chilenas/SPEC.md) · [Programa](../specs/nutrition-flows-redesign/TASKS.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) |
| V1 nutrición | Congelada, **no se borra** (decisión owner 2026-08-03): solo migrar usuarios a V2. | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | **ELIMINADO de EVA (decisión del owner 2026-09-01)**: E0+E1 EN PRODUCCIÓN 05-09 22:56Z (app Expo, specs y scripts borrados; `/enterprise` ⇒ 308 a `/pricing`); E2/E3 planificadas en el SDD. | [SDD retiro](../specs/retiro-starter-y-enterprise/SPEC.md) · [Ola de orden](../specs/ola-de-orden/TASKS.md) · [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridades vigentes

**«Dossier por meses» — EN PRODUCCIÓN 16-09 ~02:30Z** ([SDD](../specs/dossier-por-meses/SPEC.md)): modo «Por meses» en el export del dossier (web + RN), RPC `get_client_month_reports`; `master` = `rnmobiledenuevo` = `0748acd3`, deploy `dpl_HQH52H1T…` READY, migración LIVE `20260916014833`, OTA ios 1.1.3 `a73f71a0` + 1.1.2 android/ios desde `ota/1.1.2-20260916`.
**Queda: QA del owner §17 (14 web + 8 device + 2 comunes) ⇒ SDD `done`; el E2E `tests/dossier-export.spec.ts` se corre solo con su OK.**

**Tren «Meta SDK iOS» — MIDIENDO DE PUNTA A PUNTA 16-09 02:10Z** ([SDD](../specs/meta-app-events-ios/SPEC.md)): instalaciones y altas desde iPhone llegan a Events Manager (2 «Completar registro» verificados), atribución AEM iOS 14+ confirmada, OTA ios 1.1.3 `d93896c7` con el fix de `CompletedRegistration` y fix HIBP del alta en prod (`dpl_CqWXmQLg…`).
**Queda: aprobación de Apple (build 61 en App Review + Beta Review del grupo EXT), SKAN cuando Meta habilite «Configurar eventos», confirmar si el socio vio la hoja ATT en inglés (⇒ `locales`, build nueva) y borrar los 3 coaches de prueba.**

0. **Fix RN «Asignar plantilla» — EN PRODUCCIÓN 14-09: `master` = `rnmobiledenuevo` = `deb1df75`, OTA 1.1.2 android `0ae8d63a` / ios `154980fb`** (detalle en [MOBILE_RELEASES_OTA](../operations/MOBILE_RELEASES_OTA.md)): alumnos arriba con buscador (paridad web), duración al pie, CTA «Selecciona alumnos». **Queda: QA del owner en device.**
1. **Tren «Reps tras el reloj» (fuerza por tiempo) + Enmienda E1 — EN PRODUCCIÓN 12-09: `master` = `rnmobiledenuevo` = `9e153f23` (commits en [TEST_STATUS](../testing/TEST_STATUS.md)), deploy `dpl_5d2TczpX66aoGSsfAkkeqwW9BqVh` READY, OTA 1.1.2 android `01a097d4-0a6e-7bd9-8323-e7efd6cadeb0` / ios `01a097d4-2ebd-7a75-83c2-874454fd36fd`, E2E `prod-suave` 9/9 (run 34723934934)** ([SDD](../specs/reps-tras-el-reloj/SPEC.md) · [tareas](../specs/reps-tras-el-reloj/TASKS.md); mockup aprobado artifact `6ead4180` v3): a 0 la serie se guarda sola; reps/kg faltantes se piden sobre el ejercicio con el descanso corriendo (E1). Sin migraciones; gates verdes 12-09 ([TEST_STATUS](../testing/TEST_STATUS.md)). **Queda: QA del owner en device y web (10 puntos del SPEC §10; incluye el arrastre del share) ⇒ SDD `done`.**
1. **«Despegue rápido» EN PRODUCCIÓN 11-09 23:48Z** (deploy `dpl_H2B91dcR…`, OTA android `a349abee` / ios `d7b9a9d5`, E2E 9/9; [SDD](../specs/despegue-rapido/SPEC.md)): RN pinta desde caché antes de esperar auth, web emite la señal sin marca de morph, TTL 20 s. **Queda: QA del owner (5 puntos) y Sentry a 72 h (~14-09).** (F2 «Descanso siempre» cerró el mismo día, QA VERDE ⇒ `done`; ver [Estado por frente](#estado-por-frente).) Tren «Arreglos chicos pre-OTA» + F1 (tile REPS en fuerza por tiempo) — EN PRODUCCIÓN 11-09 02:58Z (deploy `dpl_6FXkTMyJ…` READY 02:52Z, OTA 1.1.2 android `d4701f84` / ios `369ec7af`), QA del owner pendiente** ([SDD](../specs/arreglos-chicos-pre-ota/SPEC.md) · [tareas](../specs/arreglos-chicos-pre-ota/TASKS.md)): `master` = `rnmobiledenuevo` = `091a19b0` (F1 `fe6e9b39` → docs → W1-A `ed9c9085` · W1-C `7d2eb3f1` · W1-B `09e5d9fa` → docs `091a19b0`); E2E `prod-suave` 9/9 (run 34556450253, 42,7 s). Entran 9 fixes chicos (detalle en el SDD). Gates completos en [TEST_STATUS](../testing/TEST_STATUS.md). **Queda: QA del owner en device (3 puntos con reps de F1 + 11 del tren, TASKS W3.10) ⇒ SDD `done` (este tren y W6.4 de cuenta atrás).** «Cuenta atrás en pantalla» ([SDD](../specs/cuenta-atras-en-pantalla/SPEC.md)): en producción desde 11-09 00:13Z, QA VERDE salvo los 3 puntos con reps ⇒ luego `done`; siguen aviso a Gerardo, seed E2E W6.10 y Sentry ~14-09.
2. **Cerrados 10-09 con QA del owner VERDE ⇒ SDD `done`** (hashes, deploys y OTAs en el [historial](../archive/current-historial-2026-09.md)): «Señales honestas para el coach» ([tareas](../specs/senales-honestas-coach/TASKS.md); aviso a Movens enviado) · «Porciones a la chilena» ([SDD](../specs/nutrition-porciones-chilenas/SPEC.md); queda W6.11: avisos a coaches y respuesta a Pame, textos listos).
3. **Cerrados con QA del owner VERDE (02/04/05-09); prosa completa en el [historial](../archive/current-historial-2026-09.md):**
   «Ciclo real y por lado» ([tareas](../specs/ciclo-real-y-por-lado/TASKS.md), `a567f6e2`, SDD `done`, aviso a coaches y E2E 9/9
   el 05-09) · «QA del owner 02-09» ([spec](../specs/qa-ejecutor-share-0209/SPEC.md), `0f545926`; quedan F7 y P3) · «billing +
   seguridad» (`16c06fba`; SEC-01 fase 3 en LIVE 05-09, frente cerrado) · «cierre de backlog 02-09» + ola 2 chica (`794aee52`;
   `QA_DEVICE_PENDIENTE.md` sin pendientes). Detalle de paridad en [MOBILE_PARITY](MOBILE_PARITY.md).
5. **`EVA-NEXTJS-18` (hidratación en `/c/[coach_slug]/dashboard?recuperar=…`) y `EVA-NEXTJS-19`
   (`E394`) — ambos con FIX EN PRODUCCIÓN y resueltos en Sentry el 05-09** (causa raíz, deploy y
   verificación en el [historial](../archive/current-historial-2026-09.md)); O7.4 desestimado salvo
   regresión. [tareas § O7](../specs/cierre-sentry-vivos/TASKS.md)
7. **Errores al día (ola O6) — EN PRODUCCIÓN 01-09**, O6.8/O6.9/O7.6 cerrados 05-09; `EVA-MOBILE-F` (despegue sin escena) sigue abierto;
   Skia exige build nativo y P5 `noUncheckedIndexedAccess` (431 errores) como tanda propia. [tareas § O6/O7](../specs/cierre-sentry-vivos/TASKS.md)
8. **PLAN «Cobros coach → alumno» — BLOQUEADO, nada implementado** ([spec](../specs/cobros-coach-alumno/SPEC.md)
   `draft`, versionada en `edf6a07c`; artifact `046f3bb1`): esperan 8 decisiones del owner (§18.1) y
   3 verificaciones externas (§18.2: contador SII, abogado retracto, smoke MP con plata real).
   Estimación 26-32 días-agente + 2-3 semanas de beta.
9. **Embudo Free→Pro — W0–W6 EN PRODUCCIÓN** ([spec](../specs/embudo-free-pro/SPEC.md); último OTA
   1.1.2 `28ca5f8d` / `8cced802`): **W4.6 y W6.8 con QA del owner en device VERDE 05-09** (artifact
   `6bd32370`); queda App Store Connect (W7.4).
10. **Onboarding del coach v2 — W1–W4.7 y W5 parcial EN PRODUCCIÓN** ([spec](../specs/coach-onboarding-v2/SPEC.md),
   último `8cf7b886`): **W6 (correos por comportamiento) EN PRODUCCIÓN 05-09 22:56Z**, detrás de
   `ONBOARDING_BEHAVIOR_EMAILS_ENABLED` (default APAGADO; **no encender hasta aprobar el copy**) — F6.1 y F6.2
   hechos, F6.3 con tests verdes (pie del html pinneado en `651762a6`). D11 ejecutado: el drip por calendario queda apagado por defecto y
   `FREE_COACH_DRIP_ENABLED=true` lo resucita. W8.4.1 / W8.4.2A / W8.4.4 hechos; **W8.4.2B (disparo en línea)
   a medias**: `enqueueBehaviorCheck` exportada pero sin sus 3 call sites. D13 (WhatsApp del owner) entra por
   `OWNER_WHATSAPP_URL`. Quedan W7 (medición/Playwright/Maestro), F5.3–F5.5 RN y la revisión D4 del contenido de
   ejemplo; de [vive-tu-app-directo](../specs/vive-tu-app-directo/SPEC.md) quedan V5.4 y V2.13.
   **W6 en ENSAYO desde el 06-09 02:45Z**: `ONBOARDING_BEHAVIOR_EMAILS_ENABLED=true` + `..._DRY_RUN=true` en
   Vercel Production. El primer ensayo (03:00Z) daba 83 correos de golpe ⇒ **tanda 1 de correos EN PRODUCCIÓN
   06-09 03:41Z** (`2bdd9aa5`, deploy `dpl_CijuEuGmwmmkuHVWVzURuDVNrSTT`): corte de lanzamiento (solo coaches
   creados desde el 06-09), 24 h entre correos a un mismo coach, `drip-hygiene` cancela solo por rebote real,
   cuentas de prueba sin correo de cupo ni bienvenida, digests admin sin repetición. Reenvío único del día 2
   «pásate a Pro» a 22 coaches agendado para el 06-09 13:00Z (`day2_pro_catchup`). Falta aprobar el copy y
   quitar el DRY_RUN; `OWNER_WHATSAPP_URL` (D13) sigue pendiente; `FREE_COACH_DRIP_ENABLED` **no** se setea.
   Detalle en [auditoría de correos](../audits/correos-y-crons-2026-09-05.md).
11. **Pricing — «trial al tocar el cupo»: decisión del owner POSTERGADA al 08-09** (recordatorio
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
    **Retiro de Starter: S0–S3 y E0/E1 EN PRODUCCIÓN 05-09** ([SDD](../specs/retiro-starter-y-enterprise/SPEC.md);
    hashes, deploy, OTA y humo de verificación en el [historial](../archive/current-historial-2026-09.md)); absorbió (2) y (d).
12. **iOS/Android — 1.1.2 aprobada y en tienda ⇒ piso OTA 1.1.2**: 1.1.3 **ya tiene motivo** — el SDK de
   Meta es cambio nativo y exige binario; la build 61 (1.1.3) está en App Review con publicación automática
   y en TestFlight (INT + Beta Review del grupo EXT), así que recibe OTA aunque el piso siga en 1.1.2 hasta
   que Apple apruebe. Android sigue en 1.1.2 (build 86, closed testing Alpha) y producción espera 12 testers
   × 14 días. [OTA](../operations/MOBILE_RELEASES_OTA.md)
13. **Share Entreno — rediseño «bloque único» (owner 06-09) — EN PRODUCCIÓN 06-09 21:03Z** (master
    `19d1ffb0`, OTA 1.1.2 android `45819218` / ios `eac94332`): se retiran los 6 presets, los toggles
    y los stickers sueltos; queda un solo bloque de texto en Inter (drag + pellizco, sin build
    nativa). Falta el QA en device del owner (11 puntos). [SDD](../specs/share-bloque/SPEC.md)
11. Regen completo de `database.types.ts` (deja 13 errores en 7 archivos V1; ahí se retiran los
    workarounds tipados de T2.3 y el cast `V2ReadClient`).
12. Matriz RLS con JWTs reales + preflight V1→V2 (7 enlaces) — sin cambios desde 08-06.
14. **Tren «Cantidades honestas» (Nutrición V2) — W1–W4 EN PRODUCCIÓN 06-09, QA del owner en device VERDE 10-09 ⇒ SDD `done`**
    ([SDD](../specs/nutrition-cantidades-honestas/SPEC.md); commits, migraciones y OTA en el [historial](../archive/current-historial-2026-09.md)):
    conversión al cambiar unidad, medida casera, linaje `source_item_id` y ficha del coach con Retirar/Editar. Quedan los avisos
    a `jotap-coach`/`olympuswolf` (los manda el owner) y el dry-run del backfill USDA (TASKS C6/C7).
15. **TTFB del área alumno**: la causa medida era la REGIÓN y ya está corregida (`regions: ["pdx1"]`,
    `deb8aee3`). Queda re-medir el delta (p50/p75 de `/c/:coach_slug/dashboard`, 24 h antes vs
    después) y decidir QW3 (doble render móvil+desktop).
    [historial](../archive/current-historial-2026-09.md)
16. **Cerrado (ver spec; backlog residual en cada TASKS):** Ejercicios propios ([tareas](../specs/ejercicios-propios-web/TASKS.md)) ·
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
