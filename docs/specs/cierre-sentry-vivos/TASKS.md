---
status: active
owner: product-engineering
last_verified: "2026-09-01"
canonical: false
---

# TASKS — Cierre de los issues vivos de Sentry

Marcar solo con evidencia real. Prohibido dar un gate por verde sin haberlo corrido.

> Corregido tras la crítica adversarial (3 BLOQUEA, 9 RIESGO). Los ajustes van marcados con ⚠.

> **Estado 2026-09-01.** Olas O1–O5 en `master`: `c666b763` (web waterfall + Despegue honesto), `985c2755` (audio + filtro + SDD), `916d7a20` (mobile: builder, logo, ejecutor) + `cc2a2def` (fix del doble `then()` del builder de PostgREST). OTA 1.1.2 `production` android `0877558f` / ios `b5cf3973` (01-09 00:34Z) y deploy web READY; **QA en device del owner verde** (01-09) sobre ese OTA. O4.1/O4.2 y P1 salieron después en `19b1138b` (mockup «Reintentar y Despegue honesto», opciones 1A + 2A aprobadas por el owner): `loadError` offline/error + «Reintentar» en el ejecutor, `resolveDespegueReady` con copy «ESTO ESTÁ TARDANDO» en el Despegue RN — **en OTA 1.1.2 (android `05227828` / ios `6a3ea4e9`, 01-09 01:36Z) con QA device del owner verde**. Quedan O4.4 (embed `workout_programs`), C3 (Sentry a 72 h, ~04-09) y P2–P6.

> **Estado 2026-09-01 (tarde) — revisión contra código de TODO lo vivo en Sentry + Vercel + PostHog**
> (15 agentes de verificación + refutadores, ver ola O6). Hallazgos que cambian el mapa: (1) el
> diagnóstico de **O4 estaba equivocado** — los 7 eventos de `EVA-MOBILE-9` son la telemetría
> `exec-v3-despegue-force-ready-sin-escena` de `session-morph.tsx:820`, no el `load()` del
> ejecutor; Sentry los agrupó bajo «useEffect$argument_0» porque ningún `captureMessage` de RN
> tenía `fingerprint`. (2) `EVA-NEXTJS-18` **regresó** el 01-09 09:56Z en el dashboard del ALUMNO
> (1 usuario, 2 cargas, iPhone) — causa distinta a la de agosto: `fmtShort` de la grilla de PRs
> formateaba con `toLocaleDateString('es-CL', { month: 'short' })` en SSR y la ICU de Safari no
> coincide con la de Node (justo al empezar septiembre: «sept» vs otra abreviatura). (3)
> `EVA-NEXTJS-19` (E394) son rechazos **no manejados** de server actions fire-and-forget (32 call
> sites sin `.catch`); la traducción del redirect de agosto sigue funcionando (verificado con `curl`
> en prod: 200 + `x-action-redirect`). (4) Vercel tenía 3 grupos que Sentry no ve:
> `PLAN_ALREADY_ACTIVE` (34× / 5 coaches, colisión esperada logueada como error y sin CTA de
> recarga), `Invalid Refresh Token` en `/middleware` (28× / 12 usuarios; `after()` sin try/catch)
> y `57014` en RPCs de nutrición (3×, degradación correcta, tráfico autoinfligido probable).

## O0 — Housekeeping de Sentry (sin código)

- [x] O0.1 Resolver `EVA-NEXTJS-Y` y `9` citando `01a11a52` (08-08; 23 días sin eventos).
- [x] O0.2 ⚠ Resolver `EVA-NEXTJS-S` con nota **propia**: ruido de fetch abortado en Safari, ya
      filtrado en `ignoreErrors` desde `02a13c5c`. **NO citar `01a11a52`** — no lo arregló, y desde el
      filtro el conteo de eventos es ciego.
- [x] O0.3 ⚠ Resolver `EVA-NEXTJS-W` con nota **propia**: chunk obsoleto tras deploy (Turbopack),
      sin relación con `01a11a52`.
- [x] O0.4 Resolver `EVA-NEXTJS-15` citando `e190f045`.
- [x] O0.5 Resolver `EVA-NEXTJS-16` y `17` (sin eventos desde el 05/06-08).
- [x] O0.6 Resolver `EVA-MOBILE-7` citando `7ccf7a07`, y `EVA-MOBILE-8` (binario 1.1.1).
- [x] O0.7 Resolver `EVA-NEXTJS-12` y `13` con nota: telemetría por diseño (`report-discards.ts:45`).

## O1 — `EVA-NEXTJS-8` · audio (web)

- [x] O1.1 `audioUtils.ts`: `catch` en los `resume()` de `:13` y `:44`.
- [x] O1.2 ⚠ `close()` del contexto en el `onended` del **ÚLTIMO oscilador agendado de cada rama**
      — no del primero. `playTimerSound` tiene ramas con 3 y 4 osciladores encadenados (`:52-65`
      digital, `:83-96` classic): cerrar en el primero cortaría los tonos siguientes a mitad.
- [x] O1.3 **NO** convertir a singleton (SPEC §D1: un contexto `closed` mataría el audio en silencio).
- [x] O1.4 Gate web: typecheck · lint · `pnpm test --run` desde la raíz.
- [x] O1.5 ⚠ QA iOS: los **4 tonos** (digital, classic, bell, boxing), no solo el configurado ·
      alarma 5× · preview en ajustes · **arrastrar el slider de volumen** (`ExecSettingsSheet.tsx:215`
      y `WorkoutTimerSettingsPanel.tsx:117` disparan el preview en cada tick del drag, sin debounce:
      es el pico de contextos más alto de la app) · mute a mitad de descanso · background y vuelta.

## O2 — `EVA-MOBILE-D` · crash del builder (mobile)

- [x] O2.1 `program-builder.tsx:91`: `DAY_SHORT[d.id] ?? \`D${d.id}\``.
- [x] O2.2 ⚠ Mismo fallback en los **2** sitios reales (no 3): `ActiveProgramSection.tsx:446` y
      `HeroSection.tsx:301`. Síntomas distintos para el QA: `HeroSection` interpola en template
      string ⇒ **imprime «undefined»**; `ActiveProgramSection` lo pasa como hijo JSX ⇒ React lo
      descarta ⇒ **etiqueta en blanco**.
- [x] O2.3 ⚠ `home.tsx:421` NO usa `DAY_SHORT` sino `DAY_FULL` (`types.ts:138`), consumido en
      `ActiveProgramSection.tsx:187`. Revisar aparte; no asumir el mismo símbolo.
- [x] O2.4 Gate mobile: `pnpm --filter @eva/mobile exec tsc --noEmit`.
- [x] O2.5 QA Android: Ciclo con `cycleLength` 14 → volver a Semanal, sin crash.

## O3 — `EVA-MOBILE-A` · logo en Android (mobile)

- [x] O3.1 `settings/brand.tsx:342`: sacar `allowsEditing: true` y `aspect: [1,1]`.
- [x] O3.2 ⚠ **Compensar en `uploadCoachLogo`** (`coach-brand.ts:301`): crop centrado 1:1 con
      `manipulateAsync` ANTES del `resize`. Sin esto, `session-morph.tsx:976` y `SessionIntro.tsx:168`
      —que pasan `contentFit="cover"` explícito— le recortarían los bordes a un logo apaisado.
- [x] O3.3 Verificar que no quede **ningún** otro `allowsEditing: true` vivo en `apps/mobile`.
- [x] O3.4 Gate mobile: typecheck.
- [x] O3.5 QA Android: logo cuadrado y apaisado; login del alumno, perfil, ajustes **y el arranque
      del entrenamiento** (que es donde se recorta), en claro y oscuro.

## O4 — `EVA-MOBILE-9` · ejecutor móvil (mobile)

> ⚠ **Diagnóstico corregido el 2026-09-01**: los 7 eventos de `EVA-MOBILE-9` (24→31-08) son
> `Sentry.captureMessage('exec-v3-despegue-force-ready-sin-escena')` de `session-morph.tsx:820`
> (el fallback del Despegue habilitó el tap sin que la escena avisara, `elapsedMs≈4700`), no el
> `load()` de `useWorkoutSession`. El trabajo de O4/19b1138b sigue siendo válido (cierra un hueco
> real del ejecutor), pero no era la causa del issue; la telemetría queda con fingerprint propio
> desde O6.3 para que no vuelva a confundir.

- [x] O4.1 `try/catch/finally` en `load()` para que `setLoading(false)` corra siempre.
- [x] O4.2 ⚠ Distinguir **«error de carga» de «rutina sin ejercicios»**. Hoy `blocks=[]` sin caché
      pinta «tu coach probablemente esté actualizando tu plan» con un único botón «Volver al
      Dashboard» (`ExecutorV3.tsx:1788`). Un `finally` a secas cambiaría el spinner infinito por ese
      mensaje **falso y sin reintento**. Hace falta un estado de error con «Reintentar».
- [x] O4.3 `Promise.all` de `getClientProfile()` con el select de `workout_plans`.
- [x] O4.4 Commit aparte: embeber `workout_programs` vía `workout_plans_program_id_fkey` (sin hint) —
      `51d84b56` (01-09): mismas 7 columnas embebidas en el select del plan, segunda query eliminada,
      misma forma de datos y mismo orden de `setState`; tsc mobile 0, test celebration 7/7. QA device:
      badge Semana A/B y nombre/fase del programa deben pintar igual (pendiente del OTA).
- [x] O4.5 Gate mobile: typecheck.
- [x] O4.6 ⚠ QA device: primera apertura de un plan **sin caché local** con la **conexión cortada a
      mitad de la petición** (no solo «red lenta», que no dispara excepción) · con programa activo ·
      sin programa.

## O5 — Ruido (web)

- [x] O5.1 ⚠ Ruta real: `apps/web/instrumentation-client.ts` (**sin `src/`**), `ignoreErrors` :53-68.
- [x] O5.2 ⚠ **Anclar** la regex (`^…$`). `ignoreErrors` matchea por substring: sin ancla, un patrón
      genérico se traga errores reales. El propio archivo ya advierte sobre esto.
- [x] O5.3 Gate web.

## O6 — Revisión 2026-09-01 contra código (web + mobile, sin UI nueva)

- [x] O6.1 `EVA-NEXTJS-19`/`-3` (E394): `.catch` terminal en los 32 call sites de server actions
      fire-and-forget (24 con `void xAction().then()` + 8 con `xAction().then()` hallados por grep):
      espejo del camino de fallo existente donde lo había (loading/candados liberados), no-op
      comentado donde el dato es opcional (favoritos, sugerencias, telemetría). Sin cambios de
      lógica ni copys nuevos salvo el fallback literal donde el `then` usaba `res.error`.
- [x] O6.2 `EVA-NEXTJS-18` (alumno): `formatShortDayMonthEs` (tabla fija, sin `Intl`) en
      `lib/date-utils.ts` + `PersonalRecordsList.fmtShort`; 4 tests. Regla: en un client component
      que hidrata, nunca formatear con `Intl` sin tabla fija. `PRDetailSheet`/`WorkoutPlanCard`
      formatean solo tras un tap — no se tocan.
- [x] O6.3 Fingerprints fijos en los 7 `captureMessage` de `apps/mobile` (`['exec-v3',
      'despegue-force-ready-sin-escena']`, `['workout-offline-queue','discard',code]` espejo exacto
      del web, etc.) y en el del Despegue web (`['exec-v3','despegue-fallback', causa]`).
- [x] O6.4 `PLAN_ALREADY_ACTIVE`: `runCreatePublish` lo trata como `STALE_BASE` (abre el
      `StaleBaseDialog` existente con «Recargar») y `publishPlanAction` loguea `warn` para los
      códigos de negocio esperados (`EXPECTED_PUBLISH_FAILURE_CODES`), `error` solo para fallas reales.
- [x] O6.5 `proxy.ts`: el `after()` de `touch_coach_activity` con try/catch; `AuthApiError`
      (`refresh_token_not_found`, `user_banned`, …) baja a `warn` informativo.
- [x] O6.6 Gates: tsc web 0 · tsc mobile 0 · eslint por archivo (solo warnings preexistentes) ·
      vitest 135/135 en los 10 archivos de test relacionados. NO se corrió la suite completa ni
      `pnpm build` (sin push en esta tanda).
- [ ] O6.7 Deploy web + OTA android/ios 1.1.2 desde `master` con estos commits (owner da el go).
- [ ] O6.8 A las 72 h del deploy de O6: `EVA-NEXTJS-19` debe quedar en 0 eventos nuevos; si
      persiste, el mecanismo de la respuesta 200/no-RSC de 2 bytes (registrada en el proxy en
      `serverless-middleware` a las 20:49:17Z del 31-08) es lo siguiente a cazar — no es skew de
      deploy (cliente y servidor eran el mismo release `064da7a2`).
- [ ] O6.9 `EVA-MOBILE-9`: tras el OTA, los eventos nuevos caen en un issue propio con el nombre
      real; resolver el viejo con nota cuando lleve 72 h sin eventos.

## Cierre

- [x] C1 `pnpm docs:check`.
- [x] C2 Commit por ola, sin push ni OTA hasta el QA del owner.
- [ ] C3 A las 72 h del deploy: confirmar en Sentry que cada issue tocado no registra eventos nuevos
      **en el release actual**. ⚠ Salvo `EVA-NEXTJS-S`, que está filtrado y no es verificable así.

## Pendientes declarados (NO se hacen acá)

- [x] P1 Portar `signalsReady`/`degraded` a `session-morph.tsx` — cambio visible, exige mockup.
- [x] P2 `EVA-NEXTJS-19` — cruzado el 01-09 con Runtime Logs de Vercel (evento 31-08 20:49:17Z:
      `POST /c/77FV7/dashboard` → función 200; `POST /c/77FV7/exercises` → respondido en
      `serverless-middleware` 200, cuerpo de 2 bytes) y con el cliente de Next 16.3
      (`server-action-reducer.js:140`: lanza E394 solo si la respuesta no es RSC **y** no trae
      `x-action-redirect`). Fix de impacto en O6.1; mecanismo del 2-bytes queda en O6.8.
- [ ] P3 `EVA-MOBILE-E`/`B` — **upstream confirmado** (`react-native-skia` #3390/#3547: host objects
      de Skia destruidos desde el GC concurrente de Hermes, thread «hades»). `2.2.12` es la versión
      que bundlea Expo 54 (`expo install --check` = up to date); el candidato es ≥ `2.10.0` (refactor
      host objects → native states, PR #3964, con regresión reportada en #4003) — exige build
      nativo 1.1.3 + QA de charts/AppBackground/GlowBorderCard. 2 crashes en 7 días, 2 usuarios.
      Decisión del owner. En Sentry quedan archivados hasta que escalen.
- [ ] P4 Refactor del timing de `setStructureType` (SPEC §D3) — **no se hace sin QA de fluidez del
      owner**: cambia el comportamiento de una hoja aprobada (D3). El crash ya está cerrado por el
      fallback (O2). Queda como deuda de la hoja de programa, no de Sentry.
- [ ] P5 `noUncheckedIndexedAccess` en `apps/mobile` — **medido el 01-09: 431 errores de tsc** al
      activarlo (63 en `ExecutorV3.tsx`, 29 en `Sparkline.tsx`, 29 en `program-builder.tsx`, 18 en
      `packages/workout-engine/workout-block-grouping.ts`, resto repartido en 25+ archivos incluidos
      `packages/*` que también compila mobile). Es una tanda propia de ~1-2 d-a con riesgo de
      regresión por cada `?? fallback`; no entra en el cierre de errores. Candidata a W4 de la Ola de
      orden o tanda aparte.
- [x] P6 Debouncear el preview de volumen en los dos sliders — `fe2c7965` (01-09): 180 ms trailing
      edge, `setVolumePersist` inmediato, timer cancelado al desmontar; muteado no agenda nada.
