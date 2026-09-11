---
status: active
owner: product-engineering
last_verified: "2026-09-11"
canonical: false
---

# TASKS — Arreglos chicos pre-OTA

Ver [SPEC](SPEC.md). Ningún checkbox se marca sin gate real o QA del owner.

Reparto de archivos: **ningún archivo aparece en dos workers**. Worker A escribe en `packages/*` y en
los helpers puros; Worker B en `apps/mobile/components/alumno/workout/**` + `lib/workout-session.ts`;
Worker C en auth, branding, ejercicios y nutrición del coach. Todo lo que diga «archivo:línea» está
verificado en HEAD `fe6e9b39`.

## W0 · SDD y decisiones (jefe)

- [x] W0.1 **(b) ⇒ ítem 8 CERRADO como obsoleto; A.4 cancelada.** Q1 (ítem 8, qué «rueda») respondida por el owner. Si es (a), se activa A.4; si es (b) o (c), el ítem 8 se cierra en la SPEC sin trabajo; si es (d), sale del tren.
- [x] W0.2 **Opción A (logo 40 px).** Q2 (header del coach: (a) logo de 40 px a la izquierda de fecha + saludo, (b) eyebrow con logo de 18 px + marca, **(c) no tocar el header del coach, solo el del alumno** — lo que muestra el artifact) respondida ⇒ desbloquea C.4 (b) y, si no gana (c), también C.4 (c).
- [x] W0.3 **2×2 con tiles un poco más chicos (valor 26 px, padding 8/7 solo en el grid).** Q3 (4 tiles: 2×2, compacto o dejar) respondida ⇒ desbloquea B.2.
- [x] W0.4 **(a) no tocar.** Q4 (ítem 16) respondida. Por defecto (a): no se toca, queda en §Backlog.
- [x] W0.5 SPEC y TASKS a `status: active` con las respuestas incorporadas (veredictos y §Preguntas actualizados).
- [ ] W0.6 Commit local `docs(specs): SDD del tren «Arreglos chicos pre-OTA»` en `rnmobiledenuevo`. Sin push.

## W1-A · Motor, formatos y agenda (worker Opus)

**Hecho 11-09 — commit local `ed9c9085`** (diff juzgado por el jefe, sin devoluciones; 97 tests focalizados verdes, tsc mobile y typecheck web verdes). A.3 conservó el copy « pp» de la caja «Sem. vs ant.» y la nota de check-ins dice «sin medición» cuando no hay semana medida.

Archivos del worker A: `packages/workout-engine/keypad-logic.ts` (+ test), `packages/profile-analytics/agenda-label.ts` (+ test),
`apps/mobile/components/alumno/workout/v3/NumberTicker.tsx`, `apps/mobile/components/alumno/share/share-block.ts`,
`apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionCompleteV3.tsx`, `apps/mobile/lib/coach-dashboard.ts`,
`apps/mobile/components/coach/clientDetail/NutricionTab.tsx`, `apps/mobile/lib/coach-nutrition-detail-logic.ts`,
`tests/mobile/share-block-data.test.ts`, `tests/mobile/coach-dashboard-agenda.test.ts`, `tests/mobile-coach-nutrition-detail-logic.test.ts`.

- [x] **A.1 (ítem 5, R2) Miles es-CL compartidos.** Mueve `formatThousandsEsCl` de `NumberTicker.tsx:89-98` a `packages/workout-engine/keypad-logic.ts` (junto a `formatWeightEsCl:64`; el barrel `packages/workout-engine/index.ts:27` ya re-exporta el módulo) y deja en `NumberTicker.tsx` un `export { formatThousandsEsCl } from '@eva/workout-engine'` para no tocar `SessionCompleteV3.tsx:499` de RN. Aplica el helper en `share-block.ts:67` y en web `…/v3/SessionCompleteV3.tsx:410`.
  - Test: casos 950 / 4860 / 12450 / −1200 / 0 en `packages/workout-engine/keypad-logic.test.ts`. En `tests/mobile/share-block-data.test.ts`, **actualizar** el caso de `:56-58` (`12340.6` ⇒ `'12.341'`, hoy espera `'12341'`) y **agregar** `12450` ⇒ `'12.450'`; el caso de 960 kg no cambia y los `tiles` (duración, series, reps) **no** se formatean.
  - Done: los dos tests verdes, cero `Intl` nuevo, cero import nuevo fuera del barrel, RN V3 sigue mostrando lo mismo que antes.
- [x] **A.2 (ítem 15, R8) Agenda local sin mentira.** `buildAgendaLabel` (`packages/profile-analytics/agenda-label.ts:96-119`) gana un input opcional `limitedWindow?: boolean`: con `true` y sin fecha, el label es `'Sin check-in reciente'` / `'Sin entreno reciente'` (ni «más de 30 d» ni «Todavía no registra»). `buildLocalAgenda` (`apps/mobile/lib/coach-dashboard.ts:1016`) lo pasa en `true`; `buildAgendaFromPulse` (web, sin ventana) no lo pasa. La ventana de 30 d de `:1087` **no** se amplía y `windowStartYmd` **se descarta**.
  - Test: en `tests/mobile/coach-dashboard-agenda.test.ts` **reescribir** el caso de `:236-252` al copy nuevo (riesgo con `SIN_CHECKIN_1M` y mapas vacíos ⇒ «Sin check-in reciente» / «Sin entreno reciente»); en el test del paquete, caso nuevo con `limitedWindow`.
  - Done: el copy vive en el paquete (el test compara carácter por carácter contra `buildAgendaLabel`), el camino online (`buildAgendaFromPulse`) conserva «Todavía no registra …», y la divergencia online/offline queda anotada en W3.3 y en §Backlog.
- [x] **A.3 (ítem 14, R7) Adherencia honesta en la ficha del coach.** `NutricionTab.tsx:124-126` **no se tocan** (contrato de `nutrition-coach-alerts.ts:21-30` + paridad web). `:174-175` pasan a `number | null` con render «—» y `:205` a `today ? adherenceColor(today.compliancePct, theme) : theme.mutedForeground`. **No se crea helper nuevo**: el tab consume `deriveNutritionWeekDelta` (existente, `apps/mobile/lib/coach-nutrition-detail-logic.ts:191`), al que se le agrega el caso honesto — con `current` o `previous` nulos devuelve `valueLabel: '—'`, `trend: 'flat'`, `tone: 'muted'`, sin inventar 0. Revisar los consumidores actuales del helper **antes** de tocar el tipo.
  - Test: casos nulos de `deriveNutritionWeekDelta` en `tests/mobile-coach-nutrition-detail-logic.test.ts` (sin datos ⇒ «—» / `flat` / `muted`; con datos ⇒ el comportamiento actual intacto).
  - Done: sin datos no aparece ningún «0 %» ni color de 0 % de adherencia; las alertas siguen recibiendo `number`; ningún consumidor existente del helper se rompe.
- [~] **A.4 CANCELADA (Q1 = b) ** (ítem 8, R5) — CONDICIONAL a Q1 = (a).** Retoque de los 3 mini-anillos de macro en `apps/mobile/components/nutrition-v2/AuraHero.tsx:53-54` (`MINI_SIZE`/`MINI_STROKE`), `:62-68` (`ringTrackAlpha`) y `:133-143` (paradas del degradado), replicado en web `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/AuraHero.tsx:315-375`. Solo con mockup aprobado.
  - Test: `tests/mobile-aura-theme.test.ts` si se tocan tokens.
  - Done: paridad RN ↔ web exacta, `miniTarget.lineHeight` (`:517-521`) intacto (fix de Android documentado), banda y glow sin cambios. Si Q1 ≠ (a): tarea cancelada, se anota el motivo en la SPEC.

## W1-B · Ejecutor y sesión (worker Opus)

**Hecho 11-09 — commit local `09e5d9fa`** (diff juzgado por el jefe, sin devoluciones; 194 tests verdes en 4 archivos, tsc mobile verde). Decisiones del worker aceptadas: `expiredWhileAwayFrom(..., visible: true)` al rehidratar (el alumno estuvo fuera por definición); solo se rehidrata el hold del lado con el que abre el módulo (un hold del lado derecho se ignora: la caja del izquierdo se perdió); `strengthTimeTileLayout` recibe `{ strengthTimeMode, sideMode }` y delega en `holdSidesFor`.

Archivos del worker B: `apps/mobile/lib/workout-session.ts`, `apps/mobile/components/alumno/workout/v3/use-hold-module.ts`,
`apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx`, `…/v3/HoldModuleV3.tsx`, `…/v3/ExerciseScreenV3.tsx`,
`…/v3/MobilityScreenV3.tsx`, `…/v3/SupersetScreenV3.tsx`, `…/v3/typed-screen-model.ts`,
`apps/mobile/components/alumno/workout/SetRow.tsx`, `tests/mobile/executor-v3-hold-module.test.ts`,
`tests/mobile/executor-v3-typed-screens.test.ts`. Ninguno aparece en A ni en C. **Estimación: 6 h-agente** (camino crítico junto con C).

- [x] **B.1 (ítem 12, R6/R15) El hold sobrevive a que el SO mate la app.** Campo opcional `hold?: { blockId: string; setNumber: number; side: HoldSide; endAtMs: number } | null` en `SessionSnapshot` (`workout-session.ts:129-141`), escrito por `persistSnapshot` (`:399-410`) desde un `holdRef` alimentado por `saveHold(hold | null)`, gemelo de `saveDraft` (`:881-885`), y leído en la rehidratación (`:676-690`). **Cadena completa de props**: `useWorkoutSession` expone `saveHold` y `restoredHold` → `ExecutorV3.tsx` los baja a `ExerciseScreenV3`, `MobilityScreenV3` y `SupersetScreenV3` → `HoldModuleV3` → `useHoldModule` (args nuevos `saveHold` y `restoredHold?: { blockId; setNumber; side; endAtMs } | null`). Helper puro exportado `pickRestorableHold(hold, windowDay, todayYmd)` en `workout-session.ts`. **Sin clave nueva de AsyncStorage** y sin lógica de vencimiento nueva: la decide `expiredWhileAwayFrom` de `@eva/workout-engine`.
  - Montaje del módulo: si `restoredHold` coincide en `blockId + setNumber + side`, se evalúa `expiredWhileAwayFrom({ nowMs: Date.now(), endAtMs, … })`; vencido ⇒ `expiredWhileAway = true` + `prime(prescribedSec)`; no vencido ⇒ `prime(prescribedSec)` sin flag. Nunca arranca solo (R6/R27). `saveHold(null)` al commitear, cancelar o terminar la sesión.
  - Test: `tests/mobile/executor-v3-hold-module.test.ts` — `renderHook` de `useHoldModule` con el arg nuevo (`endAtMs` pasado ⇒ `expiredWhileAway` sin auto-arranque; `endAtMs` futuro ⇒ `prime` sin flag), casos del helper `pickRestorableHold` y round-trip del snapshot con y sin `hold`.
  - Done: snapshot viejo sin `hold` rehidrata igual, el guard `parsed.day === windowDay` (`:681`) más `pickRestorableHold` siguen bloqueando holds de ayer, la suite de `tests/mobile` queda verde.
- [x] **B.2 (ítem 19, R12) — POST-MOCKUP (Q3).** Layout de la fila de 4 tiles en `SetRow.tsx:1099`, con la decisión en un helper puro `strengthTimeTileLayout(sideMode)` ⇒ `'row' | 'grid'` declarado en `apps/mobile/components/alumno/workout/v3/typed-screen-model.ts` (la casa existente de la lógica pura de estas pantallas, la que importa `tests/mobile/executor-v3-typed-screens.test.ts:27`) e importado por `SetRow.tsx`; nada de lógica nueva dentro del `.tsx` ni de un archivo `lib/` nuevo. No cambia el orden lógico, ni el keypad, ni los `testID` (`set-tile-N-weight|reps|hold_left_sec|hold_right_sec`: hoy ningún test automatizado los usa, pero son los ganchos del QA manual y de cualquier E2E futuro).
  - Test: casos del helper puro en `tests/mobile/executor-v3-typed-screens.test.ts`.
  - Done: el CTA «Aplastar serie» y el bloque de esfuerzo (`:1165-1176`) siguen visibles sin scroll extra; tres dígitos se leen enteros en 360 dp (se verifica en el QA de device, W3.9).

## W1-C · Sesión, marca y coach (worker Opus)

**Hecho 11-09 — commit local `7d2eb3f1`** (diff juzgado por el jefe, sin devoluciones; 230 tests verdes en 16 archivos, tsc mobile verde). `classifyExchangeListError` detecta por forma (`name === 'ApiError' && code === 'MODULE_OFF'`) para no arrastrar `lib/api` al copy puro; `moduleOff` toma la pantalla entera como el caso `!scope`; el header del coach lleva `BrandLogoCircle` de 40 px (opción A).

Archivos del worker C: `apps/mobile/lib/auth-actions.ts`, `apps/mobile/lib/branding.ts` (1 línea de comentario),
`apps/mobile/lib/exercises.ts`, `apps/mobile/components/coach/ExerciseFormSheet.tsx`,
`apps/mobile/app/coach/nutrition-v2/portions.tsx`, `apps/mobile/lib/nutrition-portions-copy.ts`,
`apps/mobile/components/TopBar.tsx`, `apps/mobile/app/(auth)/forgot-password.tsx`, `apps/mobile/app/(auth)/reset-password.tsx`,
`apps/mobile/components/alumno/home/DashboardHeader.tsx`, `apps/mobile/components/coach/CoachDashboardSections.tsx`,
`tests/mobile/logout-cleanup.test.ts` (nuevo), `tests/mobile/exercise-usage-memo.test.ts` (nuevo),
`tests/mobile-nutrition-v2-portions.test.ts`.

- [x] **C.1 (ítem 17, R10) Logout que limpia sin red.** `auth-actions.ts:67` pasa de `supabase.auth.getUser()` a `getSession()` (`data.session?.user?.id ?? null`), mismo `try/catch`. En el **mismo diff**, corregir la nota de `apps/mobile/lib/branding.ts:313` («getSession() lee la sesion LOCAL (sin round-trip)»): manda la versión conservadora del docblock de `app/_layout.tsx:278-291` — `getSession()` puede refrescar el token, pero sigue siendo estrictamente mejor que `getUser()`, que siempre va a la red. Una línea de comentario, nada de código.
  - Test: nuevo `tests/mobile/logout-cleanup.test.ts`, mocks por path absoluto (patrón de `tests/mobile/coach-dashboard-agenda.test.ts:21-38`), usando el campo real del guard (`coachId`, no `storedForUserId`): (a) `getUser` no se llama; (b) sesión local del coach A + cache con `coachId === A` ⇒ `clearBranding()`; (c) cache con `coachId === B` ⇒ **no** se limpia (marca del coach del alumno, sobrevive a propósito).
  - Done: las tres limpiezas de `:76-82` y `:99-102` siguen atadas al mismo id; test nuevo verde.
- [x] **C.2 (ítem 18, R11) Una sola query de uso.** (a) `ExerciseFormSheet.tsx:188` gana `&& exercise.isOwn` (paridad con `ExercisePreviewSheet.tsx:52-58`); (b) memo de módulo `Map<string, number>` dentro de `countExerciseUsage` (`apps/mobile/lib/exercises.ts:532-544`), invalidado en `createExercise` (`:306`), `updateExercise` (`:362`), `cloneExercise` (`:445`) y `deleteExercise` (`:483`).
  - Test: nuevo `tests/mobile/exercise-usage-memo.test.ts` (dos llamadas con el mismo id ⇒ una query; mutación ⇒ invalida; query fallida ⇒ **no** se cachea y la siguiente vuelve a consultar).
  - Done: cero props nuevas, cero componentes nuevos, el memo guarda solo el camino feliz (el 0 de error nunca queda pegado) y el conteo de la confirmación de borrado nunca queda viejo.
- [x] **C.3 (ítem 6, R3/R20) «Porciones» dice la verdad.** `apiFetch` ya propaga el `code` en `ApiError` (`apps/mobile/lib/api.ts:26-28`), así que el cambio es local a la pantalla: en `loadRows` (`portions.tsx:105-114`) cambiar `catch {}` por `catch (e)` con `e instanceof ApiError && e.code === 'MODULE_OFF'` y pintar el `NutritionStatePanel icon="permission"` que la pantalla ya monta en `:175-179`. Copy **nuevo declarado** en `PORTIONS_COPY.exchangeList` (`apps/mobile/lib/nutrition-portions-copy.ts`): `moduleOffTitle` = «Módulo de porciones no habilitado», `moduleOffHint` = «Activá el módulo desde Herramientas para administrar las listas.». `apps/mobile/lib/nutrition-v2-exchange-lists.api.ts` **no** se toca salvo que haga falta; la ruta del server que ya devuelve el `code` es `apps/web/src/app/api/mobile/nutrition/exchanges/_shared.ts:66-77`.
  - Test: caso nuevo en `tests/mobile-nutrition-v2-portions.test.ts` — `ApiError` con `code: 'MODULE_OFF'` ⇒ estado de módulo apagado, no `loadFailed`.
  - Done: el resto de errores sigue cayendo a `loadFailed`, el camino feliz no cambia, cero componentes nuevos. La tira sin «Legado» con el set chileno **no** entra (§Backlog).
- [x] **C.4 (ítem 7, R4) Marca real en los dos homes.** Tres piezas:
  - **(a) sin mockup, se puede hacer ya**: borrar la rama `showBrand` de `TopBar.tsx` (prop `:8`, render `:47-51`); `app/(auth)/forgot-password.tsx:43` y `app/(auth)/reset-password.tsx:193` pasan a `<TopBar back />`.
  - **(b) post-mockup (Q2)**: en `DashboardHeader.tsx`, `BrandLogoCircle` (22 px) sale de la fila condicionada a `welcomeMessage` (`:82-89`) y pasa a la fila del eyebrow junto a `brandName` (`:58-80`), siempre visible; la fila de bienvenida queda solo con la cita; el skeleton (`:163-186`) acompaña la estructura nueva.
  - **(c) post-Q2, SOLO si Q2 ≠ (c)**: en `MobileGreetingHeader` (`CoachDashboardSections.tsx:1278-1345`), anteponer un `BrandLogoCircle` con el `brandLogoUrl` ya resuelto en `:1309-1312` a la izquierda del bloque fecha + saludo, según la opción elegida (A: 40 px alineado con los `iconBtn` de `:1321-1330`; B: eyebrow de 18 px + marca en mayúsculas). Si gana (c) «no tocar el header del coach», esta pieza se cancela y `CoachDashboardSections.tsx` sale de la lista del worker C.
  - Test: **ninguno unitario** — es JSX y el repo no renderiza componentes RN (sin harness). La cobertura es el QA de device W3.10 (7a, 7b, 7c); la regla Free ⇒ EVA neutro ya está cubierta donde vive (`BrandLogoCircle`).
  - Done: coach Free o sin marca ⇒ EVA neutro sin rama nueva (ya vive en `BrandLogoCircle.tsx:26-43`); el header del alumno no rompe su `minHeight: 56` (`DashboardHeader.tsx:103`); el wordmark EVA del pie de `settings.tsx:517-522` **no** se toca.

## W2 · Juicio del jefe

**Hecho 11-09**: los tres diffs revisados contra R2–R12 y las resoluciones R14–R22; ningún archivo fuera de lista, cero devoluciones; un commit por worker (`ed9c9085` A · `7d2eb3f1` C · `09e5d9fa` B).

- [x] W2.1 Revisar el diff del **worker A** contra R2, R8, R7 (y R5 si corrió): archivos tocados = los declarados, sin lógica de más, tests focalizados de verdad.
- [x] W2.2 Revisar el diff del **worker B** contra R6 y R12: campo opcional en el snapshot, cero clave nueva de AsyncStorage, `testID` intactos.
- [x] W2.3 Revisar el diff del **worker C** contra R10, R11, R3, R4 (+ nota de `branding.ts:313`): cero componentes nuevos, regla Free ⇒ EVA neutro sin rama nueva.
- [x] W2.4 Lo deficiente vuelve al **MISMO** worker con feedback concreto (archivo, línea y qué falta). Nada se arregla «de paso» desde el jefe.
- [x] W2.5 Un commit local por worker, con los prefijos canónicos: `fix(mobile):`, `fix(exec):`, `fix(share):`. Sin push.

## W3 · Cierre

- [x] W3.1 Gates completos sobre el árbol final (`09e5d9fa`, cadena secuencial 11-09; detalle en [TEST_STATUS](../../testing/TEST_STATUS.md)) (ninguna celda se llena sin ejecución real):

| Gate | Comando | Resultado real | Fecha |
|---|---|---|---|
| Tests | `pnpm test` | 793 archivos / 10 883 tests verdes (2 archivos, 4 tests skipped), 134,7 s | 2026-09-11 |
| Typecheck web | `pnpm typecheck` | 0 errores | 2026-09-11 |
| Typecheck mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` | 0 errores | 2026-09-11 |
| Lint | `pnpm lint` | 0 errores / 572 warnings preexistentes | 2026-09-11 |
| Lint mobile | `pnpm lint:mobile` | 0 | 2026-09-11 |
| Tokens | `pnpm check:tokens` | OK | 2026-09-11 |
| Docs | `pnpm docs:check` | OK (CURRENT 15,8 KB) | 2026-09-11 |
| Bundle mobile | `pnpm --filter @eva/mobile exec expo export --platform android` | Exported | 2026-09-11 |

- [x] W3.2 `docs/status/CURRENT.md` actualizado y **≤ 16 KB**: hoy está a 0,6 KB del tope, así que el bloque de este tren entra **reemplazando** el del tren «Cuenta atrás», no sumando (lo valida `pnpm docs:check`).
- [x] W3.3 `docs/status/MOBILE_PARITY.md` con las piezas de este tren: ítem 5 en paridad; header web del alumno sin logo como divergencia aceptada; agenda del coach con divergencia deliberada online («Todavía no registra …») ↔ offline («Sin check-in reciente»).
- [x] W3.4 `docs/testing/TEST_STATUS.md` con los tests nuevos y el resultado real de la suite.
- [ ] W3.5 (`active` ✔ en `3f3f2f6f`; `done` pendiente del QA) SPEC y TASKS a `status: active` durante la ejecución y a `done` recién con el QA verde del owner; commit `docs(specs):`.
- [x] W3.6 Memoria del proyecto actualizada (estado del tren, OTA y pendientes).
- [x] W3.7 (OK del owner 11-09 ~02:45Z: «Dale: push + deploy + OTA android e iOS») **Pedir OK al owner** con la tabla de gates llena y el resumen de diffs. Sin ese OK no se pushea nada.
- [x] W3.8 (11-09: push `rnmobiledenuevo` = `master` = `091a19b0` → deploy `dpl_6FXkTMyJ6DuHhcakAcPtgF7zZkMJ` READY 02:52Z, humo 200 ×3 → piso ASC releído run 34556195403 → OTA android `d4701f84-78f8-4ec9-81d5-50576c030de7` (run 34556445933) / ios `369ec7af-851b-41f5-bba4-1246584293f4` (run 34556447853) → E2E `prod-suave` 9/9 (run 34556450253, 42,7 s)) Push de `rnmobiledenuevo` + `master` → deploy web → verificar READY → **UNA sola OTA 1.1.2 android + ios** con F1 (`fe6e9b39`) + este tren; anotar los dos ids de update.
- [ ] W3.9 QA del owner en device — F1 (los 3 puntos con reps):
  - [ ] Fuerza por tiempo, un solo lado: el tile REPS aparece entre KG y SEG y el keypad va KG → REPS → SEG.
  - [ ] Reps vacías en fuerza por tiempo: la serie se guarda igual (reps opcionales, no bloquea).
  - [ ] La serie guardada se relee con el mismo valor de reps en el historial y en la pantalla final.
- [ ] W3.10 QA del owner en device — este tren (uno por ítem vigente):
  - [ ] **5** — Sesión con más de 10 000 kg de volumen: el share «Bloque» muestra «12.450» (con punto) y la pantalla final del ejecutor **web** también.
  - [ ] **6** — Coach sin el módulo de porciones abre «Porciones»: ve «módulo no habilitado», no «No pudimos cargar la lista»; con el módulo encendido la lista carga igual que antes.
  - [ ] **7a** — «Olvidé mi contraseña» y «Restablecer contraseña»: la barra superior muestra solo «Volver», sin el «EVA» suelto.
  - [ ] **7b** — Alumno de un coach **sin** mensaje de bienvenida: el logo del coach se ve en el header del home; con coach Free o sin logo se ve la figura EVA neutra.
  - [ ] **7c** — Home del coach: el logo de su marca aparece a la izquierda de fecha + saludo, según la opción aprobada; el avatar de la derecha sigue igual.
  - [ ] **12** — Arrancar un hold, matar la app desde el multitarea, reabrir: el ejecutor dice que venció mientras no estabas y **no** arranca solo; con un hold de ayer no reaparece nada.
  - [ ] **14** — Ficha de un alumno sin datos de nutrición: la adherencia semanal se lee «—» y el anillo «Comidas» queda gris, sin «0 %».
  - [ ] **15** — Con el teléfono en modo avión, abrir el panel del coach: un alumno con último check-in de hace más de 30 d dice «Sin check-in reciente», no «Todavía no registra check-ins»; con red, el mismo alumno sigue leyéndose con su fecha real.
  - [ ] **17** — Cerrar sesión en modo avión y entrar con otro coach: la marca y el push del coach anterior no sobreviven.
  - [ ] **18** — Abrir la ficha de un ejercicio del sistema y después uno propio (preview → «Editar»): el conteo de uso es correcto y no parpadea; tras borrar o clonar, el número se recalcula.
  - [ ] **19** — Fuerza por tiempo «por lado»: los 4 tiles (KG · REPS · IZQ · DER) se leen enteros con valores de tres dígitos y el botón «Aplastar serie» sigue a la vista.

## Backlog

- [ ] V2 legacy sin miles: `WorkoutSummaryOverlay` (RN y web), `WorkoutSummaryModal`, `use-session-summary`.
- [ ] Tira de grupos de «Porciones» sin marcar «Legado» con el set chileno encendido (el picker del builder sí lo hace).
- [ ] Header web del alumno sin logo del coach: divergencia aceptada frente a RN.
- [ ] Agenda del coach: divergencia deliberada online («Todavía no registra …», sin ventana) ↔ offline («Sin check-in reciente», ventana de 30 d).
- [ ] Ítem 16, variante «exigir firma `storedForUserId`» (≈ 1 h) si el owner la pide.
- [ ] Borrar el código muerto `apps/mobile/components/MacroRingSummary.tsx` y `apps/mobile/components/alumno/nutrition/PlatePanel.tsx` en un tren de higiene.
