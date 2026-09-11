---
status: active
owner: product-engineering
last_verified: "2026-09-10"
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
| Web/PWA | Pricing v3 productivo: Free = 1 alumno + white-label + sello «Hecho con EVA»; Pro 25 sin sello. **Deploy vigente 11-09 00:10Z: `master` = `rnmobiledenuevo` = `6321a732`, `dpl_BeykJxqv…` READY** — tren «Cuenta atrás en pantalla» + D5 ([SDD](../specs/cuenta-atras-en-pantalla/SPEC.md); M1/M2 en LIVE desde W0; E2E `prod-suave` 9/9 (run 34545462628, 42,2 s); **QA del owner pendiente**). Anterior 10-09 19:03Z `27132cb9` / `dpl_EjxDinR2…` — «Señales honestas para el coach» (QA VERDE ⇒ `done`). Deploys anteriores en el [historial](../archive/current-historial-2026-09.md). | [Runbook](../operations/RUNBOOK.md) · [spec](../specs/pricing-v3/SPEC.md) |
| App nativa (RN) | 1.1.2 es el piso OTA; canal `production` recibe android e ios por separado sobre el mismo commit. **OTA vigente 11-09 00:13Z** desde `master` @`6321a732` (android `5f4dfb0f` / ios `0c5e8cb6`, runtime 1.1.2): «Cuenta atrás en pantalla» + D5 ([SDD](../specs/cuenta-atras-en-pantalla/SPEC.md)); **QA del owner pendiente (45 puntos)**. Antes: 10-09 19:08Z @`27132cb9` (Señales honestas, QA VERDE ⇒ `done`), 04:07Z @`d5d7d188` (marca cruzada), 02:27Z @`95a1d39a` (Porciones). OTAs anteriores y QA de device en el [historial](../archive/current-historial-2026-09.md). | [Mobile parity](MOBILE_PARITY.md) · [OTA](../operations/MOBILE_RELEASES_OTA.md) |
| Auth: Google en el login de coach | **Fix 04-09 EN PRODUCCIÓN** (`master` = `rnmobiledenuevo` = `22644899`, deploy `dpl_CZKUwNthWaeQL2cvS6nG55k4eMGx` READY, OTA 1.1.2 android `d8220490` / ios `54487ddd`; **QA del owner VERDE 05-09** — artifact `6bd32370`: el alumno que toca Google en `/login` ve el copy nuevo y su correo queda libre; el coach nuevo va a `/register`): «Continuar con Google» sin cuenta de coach dejaba un `auth.users` huérfano que «ocupaba» el correo del alumno (caso Leonardo/Movens; huérfano borrado a mano en LIVE el 04-09). Ahora un LOGIN con Google sin fila `coaches` ya no cae en `/coach/onboarding/complete` (alta de coach): `resolvePostGoogleAuthUrl` (web) y `login.tsx` (RN) avisan a `POST /api/auth/google-orphan-cleanup` / `/api/mobile/auth/google-orphan-cleanup`, que borra solo al usuario demostrablemente vacío (`lib/auth/google-orphan-cleanup.ts`), cierran la sesión y rebotan a `/login` con copy que manda al alumno a su código y al coach nuevo a `/register` (el alta por Google sigue ahí). F2b (alta de alumno con cuenta existente) sigue en backlog. | [Login y auth](../architecture/FLOWS_AND_COMPONENTS.md) |
| Archivado de alumnos | P0 de alta en producción (2026-08-03); **QA físico VERDE 05-09** (artifact `6bd32370`); queda la matriz Team. | [Spec de corte](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team; el programa de rediseño cerró el 2026-08-17. **«Porciones a la chilena» EN PRODUCCIÓN 10-09** (`95a1d39a`, RPC `get_nutrition_today_v2` `20260910015432`, set chileno INTA/UDD encendido: 22 grupos del sistema vivos). «Cantidades honestas» en producción 06-09, QA del owner VERDE 10-09 (SDD `done`). | [Porciones CL](../specs/nutrition-porciones-chilenas/SPEC.md) · [Programa](../specs/nutrition-flows-redesign/TASKS.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) |
| V1 nutrición | Congelada, **no se borra** (decisión owner 2026-08-03): solo migrar usuarios a V2. | [Delta del mapa](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) |
| Enterprise | **ELIMINADO de EVA (decisión del owner 2026-09-01)**: E0+E1 EN PRODUCCIÓN 05-09 22:56Z (app Expo, specs y scripts borrados; `/enterprise` ⇒ 308 a `/pricing`); E2/E3 planificadas en el SDD. | [SDD retiro](../specs/retiro-starter-y-enterprise/SPEC.md) · [Ola de orden](../specs/ola-de-orden/TASKS.md) · [Flows](../architecture/FLOWS_AND_COMPONENTS.md#enterprise) |

## Prioridades vigentes

1. **Tren «Cuenta atrás en pantalla» (feedback Movens 10-09 + preferencia D5 «Pasar solo al descanso») — EN PRODUCCIÓN 11-09 00:13Z, QA del owner pendiente** ([SDD](../specs/cuenta-atras-en-pantalla/SPEC.md) · [tareas](../specs/cuenta-atras-en-pantalla/TASKS.md) · [datos y QA](../specs/cuenta-atras-en-pantalla/DATA-TESTING.md)): `master` = `rnmobiledenuevo` = `6321a732`, deploy `dpl_BeykJxqv…` READY 00:10Z, OTA 1.1.2 android `5f4dfb0f` / ios `0c5e8cb6`, E2E `prod-suave` 9/9 (run 34545462628, 42,2 s), novedad a coaches publicada (`news_items` `cbecf922…`). Qué lleva: reloj bajo el video también en superserie (RN y web), guardado solo a 0 con `metadata.hold_source`, fuerza por tiempo «Reps | Segundos», preferencia por alumno con modal de primera vez, CTA «Descansar N s / Siguiente serie». M1/M2 en LIVE desde W0 (`20260910205046`/`205101`). **Queda: QA del owner 45 puntos (DATA-TESTING §7, artifact `0dadd6c9`) ⇒ SDD `done`; aviso a Gerardo (lo manda el owner, texto en §11.1); seed E2E contra LIVE para que el Playwright W6.10 corra; Sentry `hold-autolog` + adopción §8.2 a las 72 h (~14-09).**
2. **Cerrados 10-09 con QA del owner VERDE ⇒ SDD `done`** (prosa en el [historial](../archive/current-historial-2026-09.md)): «Señales honestas para el coach» ([tareas](../specs/senales-honestas-coach/TASKS.md); `27132cb9`, `dpl_EjxDinR2…`, OTA android `a95c9e11` / ios `bd329833`; aviso a Movens enviado) · «Porciones a la chilena» ([SDD](../specs/nutrition-porciones-chilenas/SPEC.md); `95a1d39a`, RPC `20260910015432`, OTA android `9e844b15` / ios `8de637b3`, set chileno encendido; queda W6.11: avisos a coaches y respuesta a Pame, textos listos).
3. **Cerrados con QA del owner VERDE (02/04/05-09); prosa completa en el [historial](../archive/current-historial-2026-09.md):**
   «Ciclo real y por lado» ([tareas](../specs/ciclo-real-y-por-lado/TASKS.md), `a567f6e2`, SDD `done`, aviso a coaches y E2E 9/9
   el 05-09) · «QA del owner 02-09» ([spec](../specs/qa-ejecutor-share-0209/SPEC.md), `0f545926`; quedan F7 y P3) · «billing +
   seguridad» (`16c06fba`; SEC-01 fase 3 en LIVE 05-09, frente cerrado) · «cierre de backlog 02-09» + ola 2 chica (`794aee52`;
   `QA_DEVICE_PENDIENTE.md` sin pendientes). Detalle de paridad en [MOBILE_PARITY](MOBILE_PARITY.md).
5. **(a) `EVA-NEXTJS-18` (hidratación en `/c/[coach_slug]/dashboard?recuperar=…`) — causa confirmada
   y FIX EN PRODUCCIÓN 05-09 22:56Z (O7.7, deploy `dpl_yJUsqXJ8…`)**: el barrido O7.1 se salteó
   `WorkoutPlanCard.fmtShortDate` (client component del dashboard del ALUMNO); ahora usa
   `formatShortDayMonthEs` (tabla fija, cero `Intl`). **Verificar en Sentry el 08-09 ~23:00Z (72 h del deploy).**
   **(b) `E394` = `EVA-NEXTJS-19` — 0 eventos desde el 01-09
   18:42Z con tráfico alto (12.230 spans en la ruta) ⇒ O6.8 cumplida**, **resuelto en Sentry con nota
   el 05-09** (C3 cerrada con la misma evidencia); O7.4 desestimado salvo regresión (decisión del jefe
   05-09). [tareas § O7](../specs/cierre-sentry-vivos/TASKS.md)
7. **Errores al día (ola O6) — EN PRODUCCIÓN 01-09** (`master` `231d2937`, OTA 1.1.2 android
   `d2f948a0` / ios `d40564a9`; QA device del owner verde): O6.8 cumplida el 05-09 (ver 5b);
   `EVA-MOBILE-9` **resuelto con nota el 05-09** (O6.9), pero el mismo síntoma vive en `EVA-MOBILE-F`
   (iOS 02-09, Android 04-09, viaMorph fresh 4,7 s), que sigue **abierto**; Skia exige build nativo y P5
   `noUncheckedIndexedAccess` (431 errores) como tanda propia. **O7.6 cerrado 05-09**: (a) y (b) ya
   estaban en código desde `136e0411` (02-09) y el residuo `ProfileOverviewB3.fmtHabitDate` salió
   EN PRODUCCIÓN 05-09 22:56Z. [tareas § O6/O7](../specs/cierre-sentry-vivos/TASKS.md)
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
    **Retiro de Starter: S0–S3 y E0/E1 EN PRODUCCIÓN 05-09** (deploy `dpl_yJUsqXJ8…`, OTA android
    `ea487622` / ios `59f92afe`; humo `/coach/reactivate?tier=starter` ⇒ «Plan seleccionado: Pro» verificado con un
    coach de prueba elite expirado, creado y borrado) ([SDD](../specs/retiro-starter-y-enterprise/SPEC.md)); absorbió (2) y (d).
12. **iOS/Android — 1.1.2 aprobada y en tienda ⇒ piso OTA 1.1.2**: 1.1.3 no tiene motivo (cero cambio
   nativo desde la build 59); Android sigue en 1.1.2 (build 86, closed testing Alpha) y producción
   espera 12 testers × 14 días. [OTA](../operations/MOBILE_RELEASES_OTA.md)
13. **Share Entreno — rediseño «bloque único» (owner 06-09) — EN PRODUCCIÓN 06-09 21:03Z** (master
    `19d1ffb0`, OTA 1.1.2 android `45819218` / ios `eac94332`): se retiran los 6 presets, los toggles
    y los stickers sueltos; queda un solo bloque de texto en Inter (drag + pellizco, sin build
    nativa). Falta el QA en device del owner (11 puntos). [SDD](../specs/share-bloque/SPEC.md)
11. Regen completo de `database.types.ts` (deja 13 errores en 7 archivos V1; ahí se retiran los
    workarounds tipados de T2.3 y el cast `V2ReadClient`).
12. Matriz RLS con JWTs reales + preflight V1→V2 (7 enlaces) — sin cambios desde 08-06.
14. **Tren «Cantidades honestas» (Nutrición V2) — W1–W4 EN PRODUCCIÓN 06-09 ~23:07Z** ([SDD](../specs/nutrition-cantidades-honestas/SPEC.md)):
    `master` = `rnmobiledenuevo` = `2fe28d61`, deploy `dpl_C95u9ArN…` READY, 3 migraciones en LIVE (`20260906230222`…`230411`),
    OTA 1.1.2 android `27028d0f` / ios `ddf839b8`. W1 conversión al cambiar unidad + avisos de plausibilidad + huérfanos visibles;
    W2 medida casera «2 huevos (122 g)»; W3 linaje `source_item_id` + «Aplicar hoy/desde mañana»; W4 ficha del coach con
    Retirar/Editar. **QA del owner en device VERDE 10-09 ⇒ SDD `done`**; quedan los avisos a `jotap-coach`/`olympuswolf` (los manda el owner) y el dry-run del backfill USDA (TASKS C6/C7).
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
