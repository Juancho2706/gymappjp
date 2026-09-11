---
status: active
owner: product-engineering
last_verified: "2026-09-11"
canonical: false
---

# SPEC — Arreglos chicos pre-OTA (F1 + tren, una sola OTA 1.1.2)

## Por qué

F1 («el tile REPS vuelve en fuerza por tiempo», commit local `fe6e9b39`) está **sin push** por decisión
del owner: no quiere dos OTAs seguidas. Este tren junta los arreglos chicos ya verificados contra el
código del inventario de backlog del 11-09 (§A) para que F1 y estos fixes salgan en **UNA sola OTA
1.1.2** android+ios. F1 nació en el tren [«Cuenta atrás en pantalla»](../cuenta-atras-en-pantalla/SPEC.md),
que queda cerrado; acá solo va lo chico. De los 19 ítems del inventario, **7 ya estaban cerrados en el
código** y se documentan con evidencia sin volver a tocarlos.

## Veredicto de verificación

Evidencia leída sobre `rnmobiledenuevo` en HEAD `fe6e9b39`, repo en solo lectura.

| # | Ítem | Veredicto | Evidencia (archivo:línea) | Plataforma |
|---|---|---|---|---|
| 1 | Ficha del alumno apaga Zona C con `enabled_modules` crudo | CERRADO ANTES | `apps/mobile/lib/coach-client-detail.ts:1469-1473` (usa `/api/mobile/config`), crudo como fallback sin red `:1503-1510` | RN |
| 2 | Fallback de tier `?? 'starter'` en 6 sitios | CERRADO ANTES | 0 ocurrencias del literal; `apps/web/src/proxy.ts:1143` y `apps/web/src/app/api/pr-card/route.tsx:148` usan `?? 'free'` | ambas |
| 3 | Alta móvil no devuelve `clientId` | CERRADO ANTES | `apps/web/src/app/api/mobile/coach/clients/route.ts:334,384` | ambas |
| 4 | Duplicar ejercicio propio choca por nombre | CERRADO ANTES | `apps/mobile/lib/exercises.ts:455` + `packages/workout-engine/exercise-copy-name.ts` (mismo helper que web) | ambas |
| 5 | Volumen de 5 cifras sin separador de miles | PARCIAL → entra (R2) | `apps/mobile/components/alumno/share/share-block.ts:67` y web `…/workout/[planId]/v3/SessionCompleteV3.tsx:410` sin formato; RN V3 ya formatea | ambas |
| 6 | Tab «Porciones» RN roto (17-08) | PARCIAL → entra chico (R3) | los 2 bugs cerrados (`…/exchanges/group-foods/route.ts:52`, `portions.tsx:211`); vigente solo el copy: `portions.tsx:105-114` colapsa todo a `loadFailed` | RN |
| 7 | Header/home post-login «EVA» genérico | PARCIAL → redefinido (R4) | `showBrand` inalcanzable en `apps/mobile/components/TopBar.tsx:47-51`; logo del alumno atado a `welcomeMessage` (`DashboardHeader.tsx:82-89`); coach sin marca (`CoachDashboardSections.tsx:1309-1312`) | RN |
| 8 | «Rueda de kcal» del tab Nutrición | CERRADO (obsoleto, Q1 = b) | no hay anillo grande: banda D-A (`apps/mobile/components/nutrition-v2/AuraHero.tsx:5-7`); lo único circular son 3 mini-anillos (`:53-54`) | ambas |
| 9 | Botón «Reenviar confirmación» | CERRADO ANTES | `apps/mobile/app/(auth)/verify-email.tsx:15-23` + web `VerifyEmailContent.tsx:11-13` | ambas |
| 10 | App Store ID en `app-links.ts` | CERRADO ANTES | `apps/web/src/lib/app-links.ts:9` (`id6770426633`) | web |
| 12 | Hold perdido si el SO mata la app | VIGENTE | `apps/mobile/lib/workout-session.ts:129-141` (snapshot sin reloj); fin absoluto solo en memoria, `v3/timing.ts:74-77` | RN |
| 13 | Tildes en `DAY_LABELS` | CERRADO ANTES | `apps/mobile/components/coach/clientDetail/PlanTab.tsx:41` («Mié»/«Sáb») | ambas |
| 14 | `?? 0` donde corresponde `null` en Nutrición del coach | VIGENTE (presentación) | `apps/mobile/components/coach/clientDetail/NutricionTab.tsx:174-175` y `:205` | RN |
| 15 | `buildLocalAgenda` miente con ventana de 30 d | VIGENTE (camino degradado) | ventana en `apps/mobile/lib/coach-dashboard.ts:1087,1120,1126,1133`; copy en `packages/profile-analytics/agenda-label.ts:108-111` | RN + paquete |
| 16 | Tipografía de marca sin guard en cold start | NO ENTRA (R9) | decisión escrita del autor en `apps/mobile/app/_layout.tsx:278-291`; riesgo residual ya cerrado por `apps/mobile/lib/auth-actions.ts:99-102` | RN |
| 17 | Id del coach saliente por red en el logout | VIGENTE | `apps/mobile/lib/auth-actions.ts:67` (`getUser()`) | RN |
| 18 | Query extra de `countExerciseUsage` | VIGENTE | `apps/mobile/components/coach/ExerciseFormSheet.tsx:188-192` sin gate `isOwn`; `apps/mobile/lib/exercises.ts:532-544` sin caché | RN |
| 19 | 4 tiles apretados en «por lado» por tiempo | VIGENTE (deuda de F1) | `apps/mobile/components/alumno/workout/SetRow.tsx:1099` (fila `row` de 4 `ValueTile`) | RN |

Notas de la tabla:

- No hay fila **11**: en el inventario §A3 el 11 era «`?? 'starter'` lado web», el MISMO bug que el ítem 2 ⇒ **11 = ítem 2 lado web, cerrado antes**. Por eso la tabla tiene 18 filas para «19 ítems».
- Tres citas del plan tienen deriva de ±1 a ±6 líneas contra HEAD `fe6e9b39`; esta SPEC usa la línea
  verificada en HEAD (`DashboardHeader.tsx:82`, `ExerciseFormSheet.tsx:188`, `workout-session.ts:681`).

## Cerrado antes, sin trabajo

El tren **no toca** ninguno de estos ocho; van documentados y nada más.

1. **Ítem 1** — `coach-client-detail.ts:1469-1473` toma `enabledModules` ya derivado server-side; el docblock `:1459-1465` declara cerrado el drift del QA CEO.
2. **Ítem 2** — cero `?? 'starter'` en runtime; los 6 sitios caen a `'free'` (`proxy.ts:1143`, `confirm-subscription/route.ts:117`, `confirm-upgrade/route.ts:157`, `apps/mobile/lib/coach.ts:136-137`, `(auth)/register/page.tsx:160`, `api/pr-card/route.tsx:148`).
3. **Ítem 3** — `api/mobile/coach/clients/route.ts:334,384` devuelven `clientId`, con el motivo escrito en `:377-383`.
4. **Ítem 4** — `resolveExerciseCopyName` compartido: RN `lib/exercises.ts:455`, web `exercises.actions.ts:140-144`, test en `packages/workout-engine/exercise-copy-name.test.ts`.
5. **Ítem 9** — cooldown y reenvío vivos en RN (`verify-email.tsx:15-23`, test `tests/mobile/resend-confirmation.test.ts`) y en web (`VerifyEmailContent.tsx:36,53-56`).
6. **Ítem 10** — `app-links.ts:9` con el id correcto y el docblock `:1-8` explicando el id errado anterior.
7. **Ítem 13** — `PlanTab.tsx:41` y `ProgramTabB7.tsx:48` ya con tildes; la deuda «Mie»/«Sab» murió en `packages/workout-engine/program-day-label.ts`.
8. **Ítem 11** — es el ítem 2 del lado web: mismo literal, misma evidencia (`proxy.ts:1143`, `confirm-subscription/route.ts:117`, `api/pr-card/route.tsx:148`). Cerrado antes.

## Requisitos por ítem vigente

### R2 · Ítem 5 — miles es-CL en share y en el ejecutor web

- **Qué cambia**: `formatThousandsEsCl` se **mueve** de `apps/mobile/components/alumno/workout/v3/NumberTicker.tsx:89-98` a `packages/workout-engine/keypad-logic.ts` (al lado de `formatWeightEsCl:64`; el barrel `packages/workout-engine/index.ts:27` ya re-exporta el módulo). `NumberTicker.tsx` queda con `export { formatThousandsEsCl } from '@eva/workout-engine'` para no tocar el call site RN de `SessionCompleteV3.tsx:499`. Consumidores nuevos: `apps/mobile/components/alumno/share/share-block.ts:67` y web `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionCompleteV3.tsx:410`.
- **Aceptación**: un volumen de 12 450 kg se lee «12.450» en el share «Bloque» de RN y en la pantalla final del ejecutor web, igual que en RN V3. Cero `Intl` nuevo (Hermes-safe) y cero dep nueva.
- **Test**: `packages/workout-engine/keypad-logic.test.ts` (950 / 4860 / 12450 / −1200 / 0) y, en `tests/mobile/share-block-data.test.ts`, **actualizar** el caso de `:56-58` (`12340.6` ⇒ `'12.341'`, hoy espera `'12341'`) y **agregar** `12450` ⇒ `'12.450'`. El caso de 960 kg no cambia y los `tiles` (duración, series, reps) **no** se formatean.
- **Plataforma**: ambas (lógica en `packages/*`). Las superficies V2 legacy quedan fuera, ver §Backlog.

### R3 · Ítem 6 — «Porciones» dice la verdad cuando el módulo está apagado

- **Qué cambia**: `apiFetch` ya propaga el `code` en `ApiError` (`apps/mobile/lib/api.ts:26-28`), así que el cambio es local a la pantalla: `loadRows` (`apps/mobile/app/coach/nutrition-v2/portions.tsx:105-114`) reemplaza su `catch {}` por `catch (e)` con `e instanceof ApiError && e.code === 'MODULE_OFF'` y pinta el `NutritionStatePanel icon="permission"` que la pantalla ya monta en `:175-179`. El copy es **nuevo y declarado** en `PORTIONS_COPY.exchangeList` (`apps/mobile/lib/nutrition-portions-copy.ts`): `moduleOffTitle` = «Módulo de porciones no habilitado», `moduleOffHint` = «Activá el módulo desde Herramientas para administrar las listas.».
- **Aceptación**: coach sin `nutrition_exchanges` ve el copy de módulo apagado en vez de «No pudimos cargar la lista»; el resto de errores sigue cayendo a `loadFailed`. Cero componentes nuevos.
- **Test**: caso nuevo en `tests/mobile-nutrition-v2-portions.test.ts` — `ApiError` con `code: 'MODULE_OFF'` ⇒ estado de módulo apagado, no `loadFailed`.
- **Plataforma**: RN (la ruta web ya devuelve el `code` en `apps/web/src/app/api/mobile/nutrition/exchanges/_shared.ts:66-77`).

### R4 · Ítem 7 — marca real en los dos homes, código muerto afuera

> **Respuesta del owner (11-09, Q2): opción A — `BrandLogoCircle` de 40 px a la izquierda del bloque fecha + saludo, alineado con los `iconBtn` de 40; el avatar derecho sigue igual. Alumno: logo de 22 px al eyebrow, siempre visible.**

- **Qué cambia**: (a) se borra la rama `showBrand` de `apps/mobile/components/TopBar.tsx` (prop `:8`, render `:47-51`) y los dos call sites pasan a `<TopBar back />` (`app/(auth)/forgot-password.tsx:43`, `app/(auth)/reset-password.tsx:193`); (b) alumno: `BrandLogoCircle` (22 px) sale de la fila condicionada a `welcomeMessage` (`DashboardHeader.tsx:82-89`) y pasa a la fila del eyebrow junto a `brandName` (`:58-80`), siempre visible, con el skeleton `:163-186` acompañando; (c) coach: `MobileGreetingHeader` (`CoachDashboardSections.tsx:1278-1345`) antepone un `BrandLogoCircle` con el `brandLogoUrl` ya resuelto en `:1309-1312`, a la izquierda del bloque fecha + saludo.
- **Aceptación**: con coach de pago y logo, las dos homes muestran su logo sin depender del mensaje de bienvenida; coach Free o sin marca ⇒ figura EVA neutra (ya resuelta dentro de `BrandLogoCircle.tsx:26-43`, sin rama nueva); el header del alumno no crece más allá de su `minHeight: 56` (`DashboardHeader.tsx:103`).
- **Test**: **sin test unitario**. Es JSX y el repo no renderiza componentes RN (no hay harness); la cobertura honesta es el QA de device 7a/7b/7c de TASKS. La regla Free ⇒ EVA neutro ya está cubierta donde vive (`BrandLogoCircle`).
- **Plataforma**: RN. El header web del alumno no pinta logo: divergencia aceptada (§Backlog); la web ya lleva marca en manifest, favicon, apple-touch-icon y `CoachTopBar`.
- **Bloqueo**: (b) y (c) van **después** de Q2. Si Q2 = (c) «no tocar el header del coach», la pieza (c) **no se ejecuta** y solo salen (a) y (b).

### R5 · Ítem 8 — bloqueado por decisión del owner

> **Respuesta del owner (11-09): (b) el anillo ya no existe ⇒ ítem CERRADO como obsoleto, 0 h. A.4 cancelada.**

- **Estado**: BLOQUEADO hasta Q1. La premisa del inventario está mal: no existe anillo grande de kcal; la banda del catálogo lo reemplazó por decisión D-A del owner (`AuraHero.tsx:5-7`, idéntico en web `…/nutrition-v2/_components/AuraHero.tsx:45-51`).
- **Si Q1 = (a) los 3 mini-anillos**: retoque acotado a `AuraHero.tsx:53-54` (`MINI_SIZE`/`MINI_STROKE`), `:62-68` (`ringTrackAlpha`) y `:133-143` (paradas del degradado), **en los dos archivos** (RN y web `:315-375`) para no romper una paridad que hoy es exacta; con mockup aprobado; guard `tests/mobile-aura-theme.test.ts` si se tocan tokens. Riesgo declarado: `miniTarget.lineHeight` (`:517-521`) tiene un fix de Android que no se puede revertir.
- **Si Q1 = (b)**: se cierra como obsoleto, 0 h. **Si Q1 = (c)**: es `ComplianceRing` del coach (`NutricionTab.tsx:204-205`), ítem distinto. **Si Q1 = (d)**: revierte D-A y **sale de este tren**.

### R6 · Ítem 12 — el hold sobrevive a que el SO mate la app

- **Qué cambia**: campo opcional `hold?: { blockId: string; setNumber: number; side: HoldSide; endAtMs: number } | null` en `SessionSnapshot` (`apps/mobile/lib/workout-session.ts:129-141`), escrito por `persistSnapshot` (`:399-410`) desde un `holdRef` alimentado por un `saveHold(hold | null)` gemelo de `saveDraft` (`:881-885`). **Cadena completa**: `useWorkoutSession` expone `saveHold` y `restoredHold` (junto a `restoredDraft`, rehidratación en `:676-690`) → `ExecutorV3.tsx` los baja por props a `ExerciseScreenV3`, `MobilityScreenV3` y `SupersetScreenV3` → `HoldModuleV3` → `useHoldModule`, que gana los args `saveHold` y `restoredHold?: { blockId; setNumber; side; endAtMs } | null`. Helper puro exportado `pickRestorableHold(hold, windowDay, todayYmd)` en `workout-session.ts` para descartar holds de otro día. **Sin clave nueva de AsyncStorage.**
- **Aceptación**: en el montaje del módulo, si `restoredHold` coincide en `blockId + setNumber + side` se evalúa `expiredWhileAwayFrom({ nowMs: Date.now(), endAtMs, … })` de `@eva/workout-engine`: vencido ⇒ `expiredWhileAway = true` + `prime(prescribedSec)`; **no** vencido ⇒ `prime(prescribedSec)` sin flag (hold interrumpido, el alumno lo repite). En ningún caso arranca solo (invariante R6/R27 del tren cuenta atrás). `saveHold(null)` al commitear, cancelar o terminar la sesión. Un snapshot viejo sin `hold` rehidrata igual y el guard `parsed.day === windowDay` (`:681`) más `pickRestorableHold` impiden que reaparezca un hold de ayer.
- **Test**: `tests/mobile/executor-v3-hold-module.test.ts` — `renderHook` de `useHoldModule` con el arg nuevo (`endAtMs` en el pasado ⇒ `expiredWhileAway` sin auto-arranque; `endAtMs` futuro ⇒ `prime` sin flag) + casos del helper puro `pickRestorableHold` + round-trip del snapshot con y sin `hold`.
- **Plataforma**: RN. Es el ítem más caro del tren (≈ 6 h con la cadena de props).

### R7 · Ítem 14 — adherencia honesta en la ficha de Nutrición del coach

- **Qué cambia**: `NutricionTab.tsx:124-126` **no se tocan** (contrato `number` de `apps/mobile/lib/nutrition-coach-alerts.ts:21-30` y paridad con web). Cambia solo la presentación: `:174-175` pasan a `number | null` con render «—», y `:205` a `today ? adherenceColor(today.compliancePct, theme) : theme.mutedForeground`. No se crea helper nuevo: el tab consume `deriveNutritionWeekDelta` (existente, `apps/mobile/lib/coach-nutrition-detail-logic.ts:191`), al que se le agrega el **caso honesto**: con `current` o `previous` nulos devuelve `valueLabel: '—'`, `trend: 'flat'`, `tone: 'muted'`, sin inventar 0.
- **Aceptación**: alumno sin datos de adherencia ⇒ «—» y anillo «Comidas» en gris, nunca «0 %» pintado como medido. Mismo patrón que el hero «Adherencia = —» del coach. Antes de tocar el tipo hay que revisar los consumidores actuales del helper para no romperlos.
- **Test**: `tests/mobile-coach-nutrition-detail-logic.test.ts` (ya existe) con los casos nulos de `deriveNutritionWeekDelta`.
- **Plataforma**: RN (las alertas y su paridad web quedan intactas).

### R8 · Ítem 15 — la agenda local no dice «todavía no registra» cuando sí registró

- **Qué cambia**: **no** se amplía la ventana de 30 d (costo de red en el peor momento) y **se descarta** `windowStartYmd`: el copy no puede afirmar nada que la ventana no verificó. `buildAgendaLabel` (`packages/profile-analytics/agenda-label.ts:96-119`) gana un input opcional `limitedWindow?: boolean`; con él en `true` y sin fecha, el label es `'Sin check-in reciente'` / `'Sin entreno reciente'`. `buildLocalAgenda` (`apps/mobile/lib/coach-dashboard.ts:1016`) lo pasa en `true`; `buildAgendaFromPulse` (web, sin ventana) no lo pasa y conserva «Todavía no registra …».
- **Aceptación**: en camino degradado (offline o `/api/mobile/coach/dashboard` caída), un alumno con último check-in hace 45 d se lee «Sin check-in reciente», nunca «Todavía no registra check-ins» ni un «más de 30 d» que la app no midió. El copy vive en el paquete, no en el fallback.
- **Test**: `tests/mobile/coach-dashboard-agenda.test.ts` — el caso existente de `:236-252` se **reescribe** al copy nuevo (riesgo con `SIN_CHECKIN_1M` y mapas vacíos), y el test del paquete gana el caso `limitedWindow` (el test compara carácter por carácter contra `buildAgendaLabel`).
- **Plataforma**: RN + `packages/profile-analytics`; web hereda el catálogo sin cambio de comportamiento. La divergencia online («Todavía no registra») ↔ offline («Sin check-in reciente») es deliberada y va a §Backlog y a MOBILE_PARITY.

### R9 · Ítem 16 — no entra

> **Respuesta del owner (11-09, Q4): (a) no tocar. Queda en §Backlog.**

- **Estado**: NO ENTRA. Es una decisión escrita del autor (`apps/mobile/app/_layout.tsx:278-291`: pedir el guard obliga a un `getSession()` que puede irse a la red con el splash nativo congelado) y el riesgo residual ya lo cerró el P1 del 10-09 (`auth-actions.ts:99-102`). Queda en §Backlog la variante «exigir firma `storedForUserId`» (≈ 1 h) por si el owner insiste (Q4).
- **Efecto lateral que sí entra**: la nota de `apps/mobile/lib/branding.ts:313` («getSession() lee la sesion LOCAL (sin round-trip)») contradice al docblock de `_layout.tsx`; manda la conservadora, y se corrige esa línea de comentario dentro del diff del ítem 17.

### R10 · Ítem 17 — el logout limpia aunque no haya red

- **Qué cambia**: `apps/mobile/lib/auth-actions.ts:67` pasa de `supabase.auth.getUser()` a `getSession()` (`data.session?.user?.id ?? null`), conservando el mismo `try/catch`.
- **Aceptación**: sin red o con el refresh caído, el id del coach saliente sigue resolviéndose y corren las tres limpiezas que dependen de él (`revokePushToken`, los dos `clearNutritionV2*ForUser` en `:76-82` y el guard de marca en `:99-102`).
- **Test**: nuevo `tests/mobile/logout-cleanup.test.ts` con mocks por path absoluto (patrón de `tests/mobile/coach-dashboard-agenda.test.ts:21-38`): (a) `getUser` no se llama; (b) sesión local del coach A + cache con `coachId === A` ⇒ `clearBranding()`; (c) cache con `coachId === B` ⇒ **no** se limpia (es la marca del coach del alumno y sobrevive a propósito). El campo del guard es `coachId`, no `storedForUserId`.
- **Plataforma**: RN.

### R11 · Ítem 18 — una sola query de uso por ejercicio

- **Qué cambia**: (a) `apps/mobile/components/coach/ExerciseFormSheet.tsx:188` gana `&& exercise.isOwn` (paridad con `ExercisePreviewSheet.tsx:52-58`); (b) memo de módulo `Map<string, number>` dentro de `countExerciseUsage` (`apps/mobile/lib/exercises.ts:532-544`), invalidado en `createExercise` (`:306`), `updateExercise` (`:362`), `cloneExercise` (`:445`) y `deleteExercise` (`:483`) del mismo archivo.
- **Aceptación**: el flujo preview → «Editar» dispara **una** query en vez de dos; abrir la ficha de un ejercicio del sistema no dispara ninguna; tras crear, editar, clonar o borrar, el conteo se recalcula (nada de números viejos en la confirmación de borrado). El memo guarda **solo el camino feliz**: si la query falla, el 0 de error no se cachea.
- **Test**: nuevo `tests/mobile/exercise-usage-memo.test.ts` (dos llamadas con el mismo id ⇒ una query; mutación ⇒ invalida).
- **Plataforma**: RN.

### R12 · Ítem 19 — los 4 tiles de «por lado» por tiempo respiran

> **Respuesta del owner (11-09, Q3): opción A (2×2) pero con los tiles «un poco más pequeños»: en el grid de 4, valor 26 px (lineHeight 26, letterSpacing −0.8) y padding 8/7; en fila de 2–3 tiles nada cambia.**

- **Qué cambia**: layout de la fila de tiles en `apps/mobile/components/alumno/workout/SetRow.tsx:1099`, con la decisión extraída a un helper puro `strengthTimeTileLayout(sideMode)` ⇒ `'row' | 'grid'` en `apps/mobile/components/alumno/workout/v3/typed-screen-model.ts` (la casa existente de la lógica pura de estas pantallas), importado por `SetRow.tsx`. Sin lógica nueva dentro del `.tsx`.
- **Aceptación**: en un teléfono de 360 dp, con KG · REPS · IZQ · DER, un valor de tres dígitos se lee entero; **no** cambia el orden lógico, ni los `testID` (`set-tile-N-weight|reps|hold_left_sec|hold_right_sec`), ni el keypad; el CTA «Aplastar serie» y el bloque de esfuerzo (`:1165-1176`) no quedan empujados fuera de pantalla.
- **Test**: `tests/mobile/executor-v3-typed-screens.test.ts` con los casos del helper puro (medir píxeles en vitest no aporta).
- **Plataforma**: RN. Web usa inputs en `LogSetForm` y no tiene el problema ⇒ sin cambio.
- **Bloqueo**: mockup aprobado (Q3) antes de tocar UI.

## Reglas del tren

- **ARREGLA > AGREGA**: fixes mínimos sobre lo que ya existe; nada de features.
- **Cero** deps nuevas, cero DB o migraciones, cero nativo (tiene que caber en la OTA 1.1.2), cero componentes nuevos.
- **Paridad web ↔ RN** donde el ítem es «ambas»: hoy solo el 5 (y el 8 si Q1 = (a)); las divergencias que se aceptan quedan escritas en §Backlog y en [MOBILE_PARITY](../../status/MOBILE_PARITY.md).
- **Mockup aprobado antes de tocar UI** en el ítem 7 (b/c) y en el 19; el 8 ni siquiera arranca sin Q1.
- **`testID` intactos** igual: hoy ningún test automatizado los consume, pero son los ganchos del QA manual y de cualquier E2E futuro.
- **Commits locales por wave** en `rnmobiledenuevo`, prefijos canónicos. **Nada de push** hasta el OK explícito del owner.
- Tests focalizados por ítem: se extiende el archivo existente cuando lo hay; solo dos tests nuevos.

## Nombres canónicos

- Slug/SDD: `docs/specs/arreglos-chicos-pre-ota/{SPEC,TASKS}.md`, frontmatter `status: draft`, `owner: product-engineering`, `last_verified: "2026-09-11"`, `canonical: false`.
- Helper de miles: `formatThousandsEsCl` exportado por `@eva/workout-engine` (archivo `packages/workout-engine/keypad-logic.ts`).
- Snapshot: `SessionSnapshot.hold`, funciones `saveHold` y `pickRestorableHold`, valor rehidratado `restoredHold`.
- Copys de agenda: `'Sin check-in reciente'`, `'Sin entreno reciente'`, detrás del input `limitedWindow?: boolean` de `buildAgendaLabel` (`packages/profile-analytics/agenda-label.ts`).
- Copys de porciones: `PORTIONS_COPY.exchangeList.moduleOffTitle` / `.moduleOffHint` (`apps/mobile/lib/nutrition-portions-copy.ts`).
- Delta de nutrición: `deriveNutritionWeekDelta` (existente, `apps/mobile/lib/coach-nutrition-detail-logic.ts:191`) con el caso honesto nulo; **no** se crea `weekDeltaLabel`.
- Helper puro nuevo: `strengthTimeTileLayout` en `apps/mobile/components/alumno/workout/v3/typed-screen-model.ts`, sin lógica nueva en `SetRow.tsx`.
- Tests nuevos: `tests/mobile/logout-cleanup.test.ts`, `tests/mobile/exercise-usage-memo.test.ts`.
- Commits locales por wave en `rnmobiledenuevo`; prefijos `fix(mobile):`, `fix(exec):`, `fix(share):`, `docs(specs):`. Nada de push.

## Salida

1. Gates completos y reales: `pnpm test`, `pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm typecheck`, `pnpm lint`, `pnpm lint:mobile`, `pnpm check:tokens`, `pnpm docs:check`, `pnpm --filter @eva/mobile exec expo export --platform android`.
2. Docs al día: [CURRENT](../../status/CURRENT.md) (≤ 16 KB: hoy está a 0,6 KB del tope, así que el bloque de este tren entra **reemplazando** el de «Cuenta atrás», no sumando), [MOBILE_PARITY](../../status/MOBILE_PARITY.md), [TEST_STATUS](../../testing/TEST_STATUS.md), esta SPEC y su [TASKS](TASKS.md).
3. **Pedir OK al owner** con la tabla de gates y el diff resumido.
4. Push de `rnmobiledenuevo` + `master` → deploy web → verificar READY.
5. **UNA sola OTA 1.1.2** android + ios con F1 (`fe6e9b39`) + este tren.
6. QA del owner en device: los 3 puntos con reps de F1 + el checklist por ítem vigente de TASKS ⇒ con el verde, SDD a `done`.

## Backlog que deja este tren

- V2 legacy sin miles: `WorkoutSummaryOverlay` (RN y web), `WorkoutSummaryModal`, `use-session-summary`.
- Tira de grupos de «Porciones» sin marcar «Legado» con el set chileno encendido (el picker del builder sí lo hace); ver [porciones chilenas](../nutrition-porciones-chilenas/SPEC.md).
- Header web del alumno sin logo del coach: divergencia aceptada frente a RN.
- Agenda del coach: divergencia deliberada online («Todavía no registra …», sin ventana) ↔ offline («Sin check-in reciente», ventana de 30 d).
- Ítem 16, variante «exigir firma `storedForUserId`» (≈ 1 h), si el owner la pide (Q4).
- Código muerto por borrar en un tren de higiene: `apps/mobile/components/MacroRingSummary.tsx` y `apps/mobile/components/alumno/nutrition/PlatePanel.tsx`.

## Preguntas abiertas — RESPONDIDAS por el owner el 11-09 (Q1 = b · Q2 = a · Q3 = a con tiles más chicos · Q4 = a)

- **Q1 (ítem 8)** ¿Qué «rueda» viste fea? (a) los 3 mini-anillos de macro del hero de Nutrición (74 px, azul/ámbar/verde) ⇒ retoque de 2 h con mockup; (b) el anillo grande ya no existe (banda D-A) ⇒ cerrar como obsoleto; (c) el anillo «Comidas» de la ficha del alumno en el panel del coach; (d) otra pantalla — describirla.
- **Q2 (ítem 7)** Mockup del header del coach: (a) opción A, logo de 40 px a la izquierda de fecha + saludo, alineado con los botones de 40; (b) opción B, eyebrow con logo de 18 px + marca en mayúsculas encima de la fecha; (c) **no tocar el header del coach: solo el del alumno** (lo que muestra el artifact). En el alumno hay una sola opción: el logo pasa al eyebrow junto al nombre de la marca, siempre visible.
- **Q3 (ítem 19)** 4 tiles en «por lado» por tiempo: (a) 2×2; (b) compacto, valor de 24 px en una fila; (c) dejarlo como está.
- **Q4 (ítem 16)** Tipografía de marca en cold start: (a) no tocar, deuda aceptada y documentada; (b) variante «exigir firma `storedForUserId`» (1 h, cold start en EVA para las caches viejas).
