---
status: active
owner: product-engineering
last_verified: "2026-09-05"
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
- [x] O6.7 Deploy web + OTA android/ios 1.1.2 desde `master` — hecho el 01-09 (el owner pidió
      «master y rnmobiledenuevo en orden, Sentry y PostHog impecables»): gates completos verdes
      (lint 0 errores · vitest 8015/8019, 1 flaky de `redeem-coupon-signup` que pasa solo · build ·
      tokens · boundaries · docs · tsc mobile), ff-merge a `master` = `2fe820b7`, deploy
      `dpl_F4DXU6vLvouUaVADMK3Btqj2Q3gv` READY, OTA tren 1 android `66e32589` / ios `b53e8e5d`;
      tren 2 (`231d2937`, override `decode-uri-component` 0.5.0 por Dependabot #99) android
      `d2f948a0` / ios `d40564a9`. En Sentry: 18/19/1C/8 «resolved in next release» con nota.
      **QA device del owner VERDE (01-09 tarde)**: O4.4 badge Semana A/B y nombre/fase del programa,
      P6 slider de volumen en iOS, deep link tras el override.
- [x] O6.8 A las 72 h del deploy de O6: `EVA-NEXTJS-19` debe quedar en 0 eventos nuevos — **cumplida
      05-09: `EVA-NEXTJS-19` 0 eventos desde el 01-09 18:42Z con 12.230 spans en la ruta; resuelto en
      Sentry con nota**. No hizo falta cazar el mecanismo de la respuesta 200/no-RSC de 2 bytes
      (registrada en el proxy en `serverless-middleware` a las 20:49:17Z del 31-08); no era skew de
      deploy (cliente y servidor eran el mismo release `064da7a2`). QA owner VERDE 05-09, artifact `6bd32370`.
- [x] O6.9 `EVA-MOBILE-9`: tras el OTA, los eventos nuevos caen en un issue propio con el nombre
      real — **`EVA-MOBILE-9` resuelto con nota el 05-09; el síntoma sigue vivo en `EVA-MOBILE-F`, que
      queda ABIERTO**. QA owner VERDE 05-09, artifact `6bd32370`.
- [x] O6.10 Dependabot a cero (01-09): #99 `decode-uri-component` 0.2.2→0.5.0 (CVE-2026-45822, deep
      links vía `query-string`/react-navigation; override + OTA tren 2) y #100/#101/#102
      `postcss-selector-parser` 6.1.4 + `browserslist` 4.28.8 (tooling de build; override, sin OTA).
      Todos in-major salvo el 0.2→0.5 de decode-uri-component (función única, firma intacta).
      Gates por cada tanda: `pnpm install` limpio, build web, `expo export android`, tsc mobile, vitest.
- [x] O6.11 Panel «Así lo ve tu alumno» plegable en desktop (`9b283488`): QA visual del owner en
      ≥1024 px **verde (01-09)** — ojo de la cabecera pliega/abre, «✕» del panel, memoria tras
      recargar. Reporte de un coach con captura (01-09).

> **Cierre 2026-09-05.** C3, O6.8 y O6.9 quedan CERRADAS: `EVA-NEXTJS-19` con 0 eventos desde el 01-09
> 18:42Z (12.230 spans en la ruta) y `EVA-MOBILE-9` resuelto con nota — el síntoma vive en
> `EVA-MOBILE-F`, que sigue **abierto**. `EVA-NEXTJS-18`: **causa identificada y fix en código (O7.7),
> pendiente de gates, deploy y verificación a 72 h**. O7.4 se **desestima salvo regresión** (decisión del
> jefe 05-09). O7.6 cerrado el 05-09. Siguen abiertos P3, P4 y P5.
>
> **Cierre 2026-09-01 (tarde).** Todo lo del cierre Sentry está en producción con QA del owner verde.
> Abiertos: C3/O6.8 (verificar Sentry a 72 h, ~04-09), O6.9 (`EVA-MOBILE-9` se reclasifica solo), P3
> (Skia = build nativo 1.1.3, decisión del owner), P4 (QA de fluidez) y P5 (431 errores, tanda
> propia). Siguiente frente del repo: **Ola de orden W1** (`docs/specs/ola-de-orden`).

## O7 — Revisión 2026-09-02 (web): `EVA-NEXTJS-18` regresa en la franja 12:xx + señales nuevas de O6

- [x] O7.1 **Causa (confirmada con el diff del replay)** — `EVA-NEXTJS-18` (Hydration Error) regresó a las 16:09:44Z
      y 16:17:21Z en `/coach/dashboard?subscription=active`, iPhone iOS 18.7 / **Safari 26.5** (versión nueva), coach
      `movens` recién pagado por Flow (`billing_snapshots` 16:09:41Z). Consola (PostHog `log_entries` de la sesión
      `01a062d4…`): React `#418` con `args[]=text` ⇒ mismatch de un NODO DE TEXTO. El diff server↔client del replay
      (owner, `server.txt`/`client.txt`, texto enmascarado por Sentry pero con el LARGO intacto) marca una sola
      diferencia de texto: en «Actividad reciente» del `DesktopBento` (`hidden md:block`, se hidrata igual) el día
      es `** ***` en el servidor («31 ago», 6) y `** ****` en Safari («31 ago.», 7). Es `dayLabel()` →
      `toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })`: **Node 24 imprime la abreviatura sin punto y
      el Safari nuevo con punto**. Misma familia que los PRs del alumno del 01-09 (`613f870a`, Safari 26.6), que se
      había leído como «solo septiembre»; en realidad es cualquier mes en cualquier iPhone actualizado. La hipótesis
      inicial (parseo de «12:xx PM» en los helpers de Santiago) quedó DESCARTADA por el diff: la fecha del header
      móvil tiene el mismo largo en los dos lados.
- [x] O7.2 **Fix en código** — `DesktopBento.dayLabel` → `formatShortDayMonthEs` (tabla fija). Barrido de todos los
      `month: 'short'` / `weekday: 'short'` que se pintan en el render inicial de componentes del coach y del alumno
      (helpers de tabla fija nuevos en `date-utils.ts`, con la misma salida que Node hoy para que el HTML no cambie a
      nadie; detalle en el commit). Endurecimiento de paso, no causa: `santiagoWallClock()` (`Intl.formatToParts`,
      `hourCycle: 'h23'`) alimenta a `getTodayInSantiago`, `timeGreetingSantiago`, `formatLongDateSantiago` (tablas
      fijas: «miércoles, 2 de septiembre»), `getSantiagoIsoYmdForUtcInstant` (`''` con instante inválido) y
      `getNutritionDayOfWeekFromIsoYmdInSantiago` (aritmética pura). Tests: `date-utils.test.ts` § «franja 12:xx»
      (7 casos absolutos) + los de cada helper nuevo.
- [x] O7.3 **Diff del replay leído** (owner lo bajó a `server.txt`/`client.txt`; ver O7.1). Regla que queda: en un
      client component que se hidrata, NUNCA `toLocaleDateString`/`Intl.DateTimeFormat` con `month: 'short'` o
      `weekday: 'short'` — tabla fija siempre (`formatShortDayMonthEs` y familia).
- [ ] O7.4 **DESESTIMADO SALVO REGRESIÓN (decisión del jefe 2026-09-05)** — **Señales nuevas de los fingerprints O6, mismo día** — `EVA-NEXTJS-1P` «exec-v3: fallback 4.6s ganó la
      carrera — ejecutor sin señal» (`routeReady: true`, `execReady: false`, 4g, online) y `EVA-NEXTJS-1N`
      `deploy_skew_reload`: 2 alumnos (iOS Safari 13:03Z; Samsung Internet/Android 10 13:08Z y 14:03Z) en
      `/c/6SASQ/workout/…`, release `ad6886bf` en los DOS eventos ⇒ el bundle era el actual, **no hay skew de
      deploy**: es el E394 «respuesta inesperada» sobre el release con el fix (el 200 de 2 bytes que anotó el
      inventario del 02-09) y el guardián J lo convierte en una recarga única en vez de un tap muerto. Mitigado, causa
      raíz sin cazar: instrumentar la respuesta del server action (status, bytes, `content-type`) en el `beforeSend`
      del guardián para saber QUÉ devuelve el servidor.
- [x] O7.5 **Rage clicks falsos** (`8dbd8426`): verificado en PostHog el 02-09 — `$rageclick` sobre el label oculto
      114/día → 0, `$autocapture` basura 1.752/día → 0.
- [x] O7.6 **Misma familia, fuera del tren del 02-09** (hallazgos del barrido): (a) `components/nutrition/NotesThread.tsx`
      pinta la HORA de cada nota con `toLocaleTimeString` en la TZ del runtime ⇒ Vercel (UTC) «07:00 a. m.» vs alumno
      (Chile) «11:00 a. m.» en cada nota — mismatch propio, más grave que el mes; (b) `deviceLabel`
      (`lib/bodycomp/view-helpers.ts`), `BiaTrendPanel`/`IsakTrendPanel`, `EvolutionCharts`, movimiento,
      `ProfileOverviewB3:468` y `profileOverviewUtils` derivan el DÍA de un `timestamptz` con getters locales: para
      mediciones entre las 20:00 y las 24:00 de Chile el día difiere entre servidor (UTC) y cliente. Fix: derivar el
      día en Santiago (`getSantiagoIsoYmdForUtcInstant`) o formatear solo en cliente (`useEffect`).
      **Cerrado el 05-09.** (a) y (b) ya estaban en código desde `136e0411` (02-09); el checkbox había quedado sin
      marcar. Residuo cazado: `ProfileOverviewB3.fmtHabitDate` (`toLocaleDateString('es-ES', { month: 'short' })` en
      client component) movido a `profileOverviewUtils.formatHabitLogDate` con tabla fija; tests nuevos
      `NotesThread.test.tsx` (5) y 3 casos en `profileOverviewUtils.test.ts`. Gates sin correr (orden del owner).
      (c) `dashboard/_components/records/PRDetailSheet.tsx:31,41` y `dashboard/_data/dashboard.queries.ts:234`
      conservan el patrón (el primero no hidrata, Sheet cerrado; el segundo es server-only): deuda declarada.
- [x] O7.7 **`EVA-NEXTJS-18` — la regresión del 04-09 es el barrido O7.1 incompleto, en el dashboard del ALUMNO**
      (96 ocurrencias, `regressed`, último evento 2026-09-04T23:10:50Z sobre `f9ba8a3f`,
      `/c/7LQ8B/dashboard?recuperar=2026-08-26`, Chrome Mobile iOS 152 / iOS 26.6.1, culture en-US +
      America/New_York, eventID `0f4bf6e343bd4bf99fe07892d79d0922`). Causa:
      `dashboard/_components/program/WorkoutPlanCard.tsx:48` (`'use client'`) formateaba el sub-label con
      `toLocaleDateString('es-CL', { month: 'short', timeZone: 'UTC' })`; O7.1 (`613f870a`) cambió la función
      idéntica de `PersonalRecordsList` y salteó esta, que solo se pintaba en el sheet; el tren «Ciclo real y por
      lado» (04-09) subió «Hecho 26 ago» al render inicial y WebKit de iOS 26 abrevia con punto. No hubo
      corrimiento de día. Confirmado en LIVE que el alumno del evento está en un programa `cycle` (cycle_length 5).
      El diff literal no fue recuperable por MCP (issue platform `replay_hydration_error`). Fix: `fmtShortDate` →
      `formatShortDayMonthEs` (cero Intl), test `WorkoutPlanCard.test.tsx` con `renderToStaticMarkup` y TZ UTC vs
      New_York. EN CÓDIGO 05-09, sin gates ni push; verificar en Sentry a 72 h del deploy.

## Cierre

- [x] C1 `pnpm docs:check`.
- [x] C2 Commit por ola, sin push ni OTA hasta el QA del owner.
- [x] C3 A las 72 h del deploy: confirmar en Sentry que cada issue tocado no registra eventos nuevos
      **en el release actual**. ⚠ Salvo `EVA-NEXTJS-S`, que está filtrado y no es verificable así.
      — **verificado el 05-09**: todos los issues tocados sin eventos nuevos (`EVA-NEXTJS-19` en 0 desde
      el 01-09 18:42Z con 12.230 spans en la ruta, resuelto con nota; `EVA-MOBILE-9` resuelto con nota,
      el síntoma vive en `EVA-MOBILE-F`). **Excepción: `EVA-NEXTJS-18`, con causa identificada y fix en
      código en O7.7** (pendiente de gates, deploy y verificación a 72 h). QA owner VERDE 05-09,
      artifact `6bd32370`.

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

## Cierre — crónica movida desde `docs/status/CURRENT.md` (2026-09-02)

Texto trasladado literal el 2026-09-02 al reducir `CURRENT.md` a vista mínima. No es
instrucción vigente: es el registro de lo que ya pasó, con sus hashes, deploys y OTAs.

### `EVA-NEXTJS-18` regresó el 02-09 (O7)

**`EVA-NEXTJS-18` regresó el 02-09 (16:09Z y 16:17Z = 12:09 y 12:17 hora Chile) en `/coach/dashboard`, iPhone Safari, coach `movens` recién pagado por Flow — CAUSA CONFIRMADA CON EL DIFF DEL REPLAY, FIX EN PRODUCCIÓN 02-09 18:37Z** (`master` = `rnmobiledenuevo` = `91e7edf6`, deploy `dpl_EiFib2XrU3hmmM3E4sfq3wJf9nhL` READY; tren de 5 commits: `059468cd` hidratación, `8c7161f3` color efectivo P5, `adc6f7f7` cupón vivo en Reactivar, `bb3cb196` backlog B3–B8, `91e7edf6` docs; suite completa verde 8693/8693, tsc web, eslint 0 errores, tokens, boundaries, docs; solo web, sin OTA) ([tareas](../cierre-sentry-vivos/TASKS.md) § O7):** React `#418` (mismatch de TEXTO). El diff server↔client del replay (owner, `server.txt`/`client.txt`) muestra en «Actividad reciente» del bento (`hidden md:block`, se hidrata igual) el día enmascarado `** ***` en el servidor («31 ago», 6) y `** ****` en Safari («31 ago.», 7): **la abreviatura del mes de `toLocaleDateString(…, { month: 'short' })` lleva punto en Safari 26.5/26.6 (iOS 18.7, recién desplegado) y no en Node 24** — la misma familia que los PRs del alumno el 01-09 (`613f870a`), que se había atribuido solo a «sept». Fix: `DesktopBento.dayLabel` con `formatShortDayMonthEs` (tabla fija) + barrido de todos los `month: 'short'` que se pintan en el render inicial de componentes del coach y del alumno (helpers de tabla fija nuevos en `date-utils.ts`, misma salida que Node hoy). De paso, endurecimiento: los helpers de Santiago dejan de re-parsear `toLocaleString('en-US')` con `new Date()` (ahora `Intl.formatToParts` + tablas; era la hipótesis inicial de la «franja 12:xx», descartada por el diff). Además, dos señales nuevas de los fingerprints O6 el mismo día: `EVA-NEXTJS-1P` «exec-v3: fallback 4.6s ganó — ejecutor sin señal» y `EVA-NEXTJS-1N` `deploy_skew_reload`, 2 alumnos (iOS Safari y Samsung Internet) en `/workout` a las 13:03Z y 14:03Z sobre el release actual ⇒ **no es skew de deploy**: es el E394 con respuesta 200 de 2 bytes que el guardián J ahora convierte en una recarga única; la causa raíz sigue sin cazar.

### Errores al día (2026-09-01, O6)

**Errores al día (2026-09-01, [tareas](../cierre-sentry-vivos/TASKS.md) § O6):** 13 issues vivos de Sentry + 8 grupos de Vercel + señales PostHog verificados contra `HEAD` con 15 agentes y refutadores. Ola O6 en código (sin UI nueva): `.catch` en 32 server actions fire-and-forget (`EVA-NEXTJS-19`/`-3`), fecha de PRs con tabla fija sin `Intl` (`EVA-NEXTJS-18` regresado en el dashboard del alumno), fingerprints en los 8 `captureMessage` (RN + Despegue web; el diagnóstico de `EVA-MOBILE-9` era erróneo), `PLAN_ALREADY_ACTIVE` → diálogo de recarga + log `warn`, `after()` del proxy sin rechazo no manejado, debounce del preview de volumen (P6), programa embebido en la query del ejecutor RN (O4.4), panel «Así lo ve tu alumno» plegable en desktop (reporte de un coach) y **Dependabot a cero** (overrides `decode-uri-component` 0.5.0 #99, `browserslist` 4.28.8 #101/#102, `postcss-selector-parser` 6.1.4 #100). **EN PRODUCCIÓN 01-09 17:1xZ**: `master` = `rnmobiledenuevo` = `231d2937`, deploy web READY, OTA 1.1.2 tren 1 (android `66e32589` / ios `b53e8e5d`) + tren 2 (android `d2f948a0` / ios `d40564a9`), detalle en [MOBILE_RELEASES_OTA](../../operations/MOBILE_RELEASES_OTA.md). Sentry: 18/19/1C/8 «resolved in next release», Z/1A/3/MOBILE-C/D/A resueltos, MOBILE-E/B archivados hasta escalar; quedan abiertos solo MOBILE-9 (se reclasifica solo con el fingerprint) — **verificar a 72 h (~04-09) que nada regresó (O6.8)**. **QA device del owner VERDE (01-09)**. Skia (`EVA-MOBILE-E/B`) = upstream, exige build nativo 1.1.3 — decisión del owner. P5 `noUncheckedIndexedAccess` medido (431 errores) → tanda propia; P4 exige QA de fluidez. **Frente cerrado; lo siguiente es la Ola de orden W1** (SDD `docs/specs/ola-de-orden` commiteada como `draft` el 01-09; `docs/specs/cobros-coach-alumno` también versionada, sigue esperando P1–P8). PostHog no tiene error tracking habilitado (0 issues); señal UX: rage clicks concentrados en el ejecutor web (`/c/*/workout/:id`, 262 en 7 d de 11 alumnos de un coach) y en `/coach/builder/:id` (26, 10 coaches) — sin acción, medir con un replay antes de tocar. **Preflight «Ola de orden»** hecho: 46/48 refs `archivo:línea` exactas, 0 rotas, 11 supuestos de W1 confirmados; corregida la premisa de W4.5 (3 de las 4 capabilities «muertas» siguen gateando rutas); no hay E1–E4 pendientes en la SDD (se absorbieron en D1–D6). **Decisión del owner 01-09: arranca la Ola de orden por W1 «Interruptores de verdad»** (Cobros y Yoga esperan). Precondiciones de W1 antes de tocar código: valor vivo de `FEATURE_PREFS_ENABLED` en Edge Config y muestra de coaches reales con `_enabled=false` (SPEC §6.3 y blast radius).
