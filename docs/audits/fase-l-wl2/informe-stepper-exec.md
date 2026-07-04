# Informe: Modo stepper opt-in "un ejercicio a la vez" en la ejecucion de entrenamiento (web/PWA)

Rama: `feat/redesign-eva-design-system` (EVA DS ya aplicado: tokens `--sport-*`, `--text-*`, `--surface-*`, radios EVA, breakpoint `md=760`).
Fecha: 2026-07-04. Autor: investigacion tecnica (solo informe, sin cambios de producto).
Objetivo: proponer un modo de ejecucion opcional que muestre **un ejercicio (o una superserie) a la vez**, con navegacion swipe/siguiente, **reusando el mismo `LogSetForm`**, respetando superseries por rondas, y sin tocar el motor de logging/offline/progresion.

---

## Estado actual (archivos:lineas concretos)

### Pantalla de ejecucion
- Ruta: `apps/web/src/app/c/[coach_slug]/workout/[planId]/`.
- `page.tsx:1-38` (RSC) llama a `_data/workout-execution.queries.ts` y renderiza `WorkoutExecutionClient`.
- `WorkoutExecutionClient.tsx` (1877 lineas) es el cliente unico que orquesta todo. Envuelve el arbol en `WorkoutTimerProvider` (`WorkoutExecutionClient.tsx:1204`).

### Como se estructura hoy la lista (lo que el stepper va a "paginar")
- `blocks` ordenados por `order_index` (`WorkoutExecutionClient.tsx:922`).
- `sectioned` = `useMemo` que agrupa por AREA con fallback legacy via `executionAreaGroupsFor` (`WorkoutExecutionClient.tsx:984-996`); cada seccion trae `{ sectionKey, title, subtitle, muted, groups }`, y `groups` sale de `groupContiguousSupersetRuns` (bloque suelto `type:'single'` o superserie `type:'superset'`).
- `supersetInfo` = `useMemo` mapa `blockId -> SupersetInfo` (miembros, letras, descanso del grupo, `maxSets`) (`WorkoutExecutionClient.tsx:1000-1015`).
- Render de la lista: `sectioned.map(section => section.groups.map(group => ...))` (`WorkoutExecutionClient.tsx:1295-1708`).
  - Rama superserie: usa `SupersetGroupCard` (o `CollapsedExerciseBar` si esta completa) (`WorkoutExecutionClient.tsx:1319-1366`).
  - Rama bloque suelto: **card inline muy grande, aun NO extraida a componente** (`WorkoutExecutionClient.tsx:1367-1701`) — incluye header de tipo/musculo, dots de progreso, linea de prescripcion, chip de sobrecarga, "Ultima vez" (prefill), disclosure "Detalles", y el listado de `LogSetForm` por serie (`WorkoutExecutionClient.tsx:1643-1697`).

### Componentes de card ya existentes
- `SupersetGroupCard` (`WorkoutExecutionClient.tsx:575-843`): ejecucion HONESTA por rondas A1 -> B1 -> A2 -> B2 usando `buildRoundOrder` (`:443`), `isRoundComplete` (`:455`), `findNextIncompleteInRounds` (`:472`); dispara el descanso del grupo al cerrar ronda. Ya es un componente con props claras (`SupersetGroupCardProps`, `:551-567`).
- `CollapsedExerciseBar` (`WorkoutExecutionClient.tsx:851-897`): recap delgado de un ejercicio/superserie completado, reexpandible.

### El formulario a reusar (NO se toca su motor)
- `LogSetForm.tsx` (999 lineas). Export `LogSetForm` (`:119`) despacha a `StrengthLogSetForm` (`:213`) o `TypedLogSetRow` (`:670`, cardio/movilidad/roller).
- Props relevantes (`LogSetForm.tsx:28-104`): `blockId`, `setNumber`, `restTimeStr`, `warmupRestTimeStr`, `totalSets`, `nextUpLabel`, `suggestedWeightKg`, `prThresholdKg`, `existingLog`, `autoTimerEnabled`, `mode`, `isActive`, `prefill`, `reopenNonce`, `supersetRest`, `onLogged`, `onResult`.
- Motor que NO se puede tocar (vive dentro del form):
  - Write-through offline: `enqueueWorkoutLog` ANTES de la red (`LogSetForm.tsx:376-387`); dedupe por `(block,set)` via `workoutLogKey`.
  - Reconciliacion server: efecto que hace `dequeueWorkoutLog` en `state.success` y reabre en `state.error` (`LogSetForm.tsx:316-330`).
  - Descanso/auto-skip: `buildRest` (`LogSetForm.tsx:337-355`) y superserie via `supersetRest.closesRound()`.
  - Progresion: el peso sugerido llega ya calculado por el padre con `computeEffectiveTarget` (`WorkoutExecutionClient.tsx:1389-1392`); el form no la calcula.

### Handlers compartidos del padre (los reusa el stepper tal cual)
- `handleLogged` (`WorkoutExecutionClient.tsx:1092-1147`): aplica log optimista (`applyOptimisticLog`, `:425`), calcula la siguiente serie (superserie interleaved o bloque suelto), dispara toast "seguí con B1" y auto-scroll a 350ms (`:1113-1119`, `:1145`).
- `handleResult` (`WorkoutExecutionClient.tsx:1028-1032`): revierte el optimismo si el server devolvio error.
- `scrollToNextIncomplete` (`WorkoutExecutionClient.tsx:1077-1090`): hoy hace `scrollIntoView`; en stepper este es el punto donde "avanzar de paso" reemplaza al scroll.
- `nextCue` (`:921`), `justCompleted` (`:955`), `expandedDone` (`:951`), `fillByBlock` (`:945`), `reopenSignal` (`:947`): estado de guia/foco reutilizable.
- `handleFinish` (`WorkoutExecutionClient.tsx:1148-1194`): al finalizar hace flush de la cola (`flushWorkoutQueue`) para reconciliar huerfanos; abre `WorkoutSummaryOverlay`.

### Persistencia de preferencias del alumno (patron ya establecido)
- **Auto-timer (precedente directo del toggle que pide el CEO)**: estado `autoTimerEnabled` (`WorkoutExecutionClient.tsx:924`), lectura post-montaje (hidratacion-safe, NO en el initializer) `localStorage.getItem('omni_autotimer')` (`:928-930`), escritura en `toggleAutoTimer` (`:1066-1070`). La key esta declarada como `OMNIAUTOTIMER_KEY = 'omni_autotimer'` en `rest-timer-preferences.ts:13`.
- Patron mas completo (sonido/volumen/mute del descanso): helpers `read*/write*` + `CustomEvent('rest-timer-prefs-changed')` + listener `storage` para sincronizar entre pestanas (`rest-timer-preferences.ts:22-99`). Es el patron a imitar si se quiere sincronizacion multi-tab.
- El toggle ya tiene un lugar natural en la UI: `WorkoutTimerSettingsPanel` (dialog de la tuerca del header) recibe `autoTimerEnabled` + `onToggleAutoTimer` (`WorkoutTimerSettingsPanel.tsx:12-20`); agregar `stepperEnabled` + `onToggleStepper` sigue la misma firma.
- **`feature-prefs` NO aplica aca**: `services/feature-prefs.service.ts`, `coach/settings/_actions/feature-prefs.actions.ts` y `FeaturePrefsPanel`/`ClientFeaturePrefsPanel` son **scope coach** (el coach decide que modulos ve el alumno), no preferencias personales del alumno. El stepper es una preferencia de UI del alumno -> mismo carril que `omni_autotimer` (localStorage por dispositivo).

### Gesto swipe: ya existe patron sin libreria nueva
- `apps/web/src/app/c/[coach_slug]/nutrition/_components/DayNavigator.tsx` es la referencia canonica de swipe con framer-motion:
  - `drag="x"`, `dragSnapToOrigin`, `dragElastic={0.12}`, `dragConstraints={{ left:0, right:0 }}`, `onDragEnd` con `PanInfo` (`DayNavigator.tsx:64-71`).
  - Umbrales: `SWIPE_OFFSET = 60` px, `SWIPE_VELOCITY = 400` (`DayNavigator.tsx:22-23`); decision next/prev por offset o velocidad (`:40-46`).
  - Desactiva drag con `useReducedMotion()` y cae a crossfade (`:66-70`, `:59-61`).
  - Transicion direccional: `easings.dirSlide = [0.16, 1, 0.3, 1]` (`lib/animation-presets.ts:32`).
- Bottom sheet protagonista del descanso: `RestTimer.tsx` (`:31`), animado con `springsSheet` (`lib/animation-presets.ts:35`). Sirve de referencia de estilo para el sheet/pager.

### Dependencias disponibles (monorepo, hoisted a la raiz)
- `framer-motion ^12.38.0` y `@dnd-kit/*` estan en `package.json` de la RAIZ (no en `apps/web/package.json` por hoisting de pnpm). **No hay** libreria de carousel/slider (`embla`, `swiper`, `keen-slider`, `react-swipeable`) — confirmado. Conclusion: el pager/swipe se construye con framer-motion (patron `DayNavigator`), cero dependencia nueva. Alineado con el pedido del CEO ("sin libs pesadas").

### Grep de control
- No existe ningun "stepper"/"focus mode"/"un ejercicio a la vez" en la ejecucion hoy (los matches de `stepper` son wizards de coach/check-in, no la exec del alumno).

---

## Investigacion web 2026 (fuentes)

**Direccion de la industria: logging enfocado en un ejercicio/serie a la vez.**
- Hevy centra el logging en un ejercicio a la vez ("logging sets one at a time means you don't have to remember if you just completed your 3rd or 4th set and can instead focus on catching your breath"); en 2025-2026 renovo la navegacion con componentes "liquid glass"/Material. Fuente: [Hevy features](https://www.hevyapp.com/features/), [Hevy vs Strong 2026 (Setgraph)](https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026).
- Peloton Strength+ guia movimiento por movimiento (video + contador de reps/timer) y **"swipe to complete each block, moving at your own pace"** — el swipe para avanzar es el gesto canonico del modo guiado. Fuente: [Peloton Strength+ (Tom's Guide)](https://www.tomsguide.com/wellness/fitness/peloton-unveils-strength-app-and-we-got-an-in-depth-look-at-how-it-works-in-the-gym-exclusive), [Peloton Gym demo (Pelobuddy)](https://www.pelobuddy.com/peloton-gym-demo-review/).
- Boostcamp: modo guiado "step-by-step through each workout", navegacion entre ejercicios, soporte de superseries en el creador, y gestos a nivel de set (swipe-left para borrar). Fuente: [Boostcamp tips](https://www.boostcamp.app/blogs/tips-and-tricks-to-using-boostcamp-app), [SuperGains superset program](https://www.boostcamp.app/coaches/dr-pak/supergains-superset-program).

**El opt-in por toggle es patron reconocido (no default).**
- Fitbod expone "Focus Exercises" como **toggle ON/OFF** en ajustes del plan (Workout -> My Plan -> toggle). Confirma que un modo de foco se ofrece como opcion explicita, no impuesto. Fuente: [Fitbod Focus Exercises (Help)](https://help.fitbod.me/hc/en-us/articles/35301260960663-Focus-Exercises), [Fitbod Focus blog](https://fitbod.me/blog/progress-faster-with-fitbod-focus-exercises/).

**Swipe/pager en PWA con framer-motion (sin libreria pesada).**
- El patron drag + `AnimatePresence` con transicion direccional es el estandar documentado; los elementos con tap/drag son focusables y responden a Enter. Fuente: [Motion for React - gestures](https://www.framer.com/motion/gestures/), [Carousel con framer-motion + Next (Medium)](https://medium.com/@jeyprox/building-a-fully-customisable-carousel-slider-with-swipe-gestures-navigation-and-custom-cursor-4e986ccbd08f).
- Gotcha clave de touch: para que el pan horizontal funcione **sin romper el scroll vertical**, hay que declarar `touch-action` (p.ej. `pan-y`) en el contenedor arrastrable. Fuente: [Motion for React - gestures (touch-action)](https://www.framer.com/motion/gestures/).

**Accesibilidad 2026 de carruseles/pagers (WAI-ARIA + reduced-motion).**
- Region con `role="group"`/`region` + `aria-label`, `aria-roledescription` para la "diapositiva", controles prev/next **siempre presentes** (el swipe es mejora, no la unica via), sin atrapar el foco, y `aria-live="polite"` para anunciar el cambio de paso iniciado por el usuario. Fuente: [W3C WAI ARIA APG - Carousel](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/), [UX Patterns - Carousel](https://uxpatterns.dev/patterns/content-management/carousel).
- `@media (prefers-reduced-motion: reduce)` debe desactivar el slide (crossfade/instantaneo). Fuente: [Designing Accessible Animations (Medium, 2026)](https://medium.com/@daceynolan/designing-accessible-animations-a-practical-guide-to-prefers-reduced-motion-0d3b89c3b1cb).
- Alternativa 2026 sin JS: carruseles con CSS scroll-snap + scroll-driven animations. No la recomiendo aca por control fino de navegacion/estado y por paridad con el patron `DayNavigator` existente, pero queda como referencia. Fuente: [Scroll-Driven CSS in 2026 (SitePoint)](https://www.sitepoint.com/scrolldriven-css-in-2026-building-carousels-without-javascript/).

---

## Diseno propuesto (arquitectura por capas, componentes, datos)

### Principio rector
El stepper es **100% presentacion/navegacion**. No toca `_data/`, `_actions/`, `services/`, `infrastructure/db/`, ni el schema. Cero migracion, cero `GRANT`. Todo el motor (logging, cola offline, dedupe, reconciliacion, descanso, progresion) sigue viviendo en `LogSetForm` + los handlers del padre + `lib/workout-offline-queue`. El stepper solo decide **que card se muestra** y **como se navega**. Esto satisface el requisito "logging/offline/progresion intactos".

### Capa de datos (cliente, pura y testeable)
Nuevo helper puro (sin React) para construir el "modelo de pasos" a partir de lo que ya calcula el padre:

- Archivo: `apps/web/src/lib/workout-stepper.ts` (nuevo, `lib/` porque es logica pura reutilizable y testeable, sin JSX).
- Funcion `buildStepModel(sectioned)` -> `Step[]`, donde `Step` aplana `sectioned` en orden de render:
  - `{ kind: 'single', block, sectionKey, sectionTitle, sectionSubtitle }`
  - `{ kind: 'superset', groupKey, memberIds, sectionKey, sectionTitle }`
  - Cada `Step` es **un grupo** de `section.groups` (un bloque suelto o una superserie contigua). Asi una superserie es UN paso (respeta rondas intercaladas dentro del mismo card).
- Funciones de navegacion puras (para tests): `firstIncompleteStepIndex(steps, sessionLogs)`, `stepIndexOfBlock(steps, blockId)`, `isStepComplete(step, sessionLogs)` (reusa `isBlockComplete` ya existente).
- Se apoya en `groupContiguousSupersetRuns` y `executionAreaGroupsFor` ya existentes (nada nuevo de agrupacion).

### Capa de presentacion (componentes)
1. **Extraer la card de bloque suelto a componente** — prerequisito.
   - Nuevo: `apps/web/src/app/c/[coach_slug]/workout/[planId]/SingleExerciseCard.tsx`.
   - Mueve el bloque inline `WorkoutExecutionClient.tsx:1440-1699` (motion.div + header + prescripcion + "Ultima vez" + Detalles + listado de `LogSetForm`) a un componente con props explicitas: `block`, `exercise`, `effType`, `suggestedWeightKg`, `eff`, `overloadLabel/Detail`, `previousHistory`, `sessionLogs` (o `blockLogs`), `openDetails`+`toggleDetails`, `fillByBlock`+`setFillByBlock`, `reopenSignal`, `autoTimerEnabled`, `justCompleted`, `focus`, refs (`registerBlockRef`), y los handlers `onLogged`/`onResult`/`openTechnique`.
   - Objetivo: paridad EXACTA (mismo JSX, mismos valores derivados). La lista actual pasa a renderizar `<SingleExerciseCard/>`; el stepper renderiza el MISMO componente. Un solo origen de verdad -> cero divergencia visual entre modos.
   - `CollapsedExerciseBar` y `SupersetGroupCard` ya son componentes; se reusan sin cambios.

2. **Pager/stepper** — el shell de navegacion.
   - Nuevo: `apps/web/src/app/c/[coach_slug]/workout/[planId]/StepperExecution.tsx`.
   - Estado local: `currentStepIndex` (arranca en `firstIncompleteStepIndex`).
   - Render: **solo el paso actual** (opcional: "peek" del anterior/siguiente atenuado para affordance). Dentro:
     - `kind==='single'` -> `<SingleExerciseCard/>`.
     - `kind==='superset'` -> `<SupersetGroupCard/>` (mismo `info` de `supersetInfo`).
   - Swipe: contenedor `motion.div` con `drag="x"`, `dragSnapToOrigin`, `dragElastic 0.12`, `dragConstraints {left:0,right:0}`, `onDragEnd` con `PanInfo` y umbrales `SWIPE_OFFSET=60`/`SWIPE_VELOCITY=400` (copiar de `DayNavigator`). `useReducedMotion()` desactiva drag -> crossfade. `AnimatePresence` con slide direccional (`easings.dirSlide`).
   - `touch-action: pan-y` en el contenedor arrastrable para no romper el scroll vertical del paso (un ejercicio de 5 series + Detalles puede exceder el viewport).
   - Controles: botones "Anterior"/"Siguiente" SIEMPRE visibles (swipe = mejora, no unica via), + rail de progreso por paso (dots/segmentos) navegable (tap salta a cualquier paso -> permite volver a editar una serie reusando el path de edicion de `LogSetForm`).
   - Eyebrow de seccion arriba del paso (`sectionTitle`, con `muted` para warmup/cooldown) para no perder contexto de "Calentamiento / Bloque principal".

3. **Auto-avance suave (reusa la logica de foco existente).**
   - Hoy, al completar bloque/grupo, `handleLogged` llama `setTimeout(() => scrollToNextIncomplete(nextLogs), 350)` (`WorkoutExecutionClient.tsx:1119`, `:1145`).
   - En modo stepper: `scrollToNextIncomplete` se ramifica -> en vez de `scrollIntoView`, calcula `stepIndexOfBlock(steps, nextIncomplete.id)` y hace `setCurrentStepIndex(...)`. Dentro de una superserie NO avanza de paso (la guia interleaved "seguí con B1" + `nextCue` siguen operando dentro del mismo card).
   - Recomendacion: auto-avance con un pequeno delay + toast "Ejercicio completado" y opcion de quedarse; nunca avanzar de forma que se pierda una serie a medio tipear (ver Riesgos).

### Wiring en el orquestador
- `WorkoutExecutionClient` agrega:
  - Estado `stepperEnabled` (default `false`, opt-in), leido en effect post-montaje desde `localStorage` key `omni_stepper` (hidratacion-safe, exactamente como `omni_autotimer` en `:928-930`), y `toggleStepper` que persiste (mirror de `toggleAutoTimer`, `:1066-1070`).
  - Nueva key en `rest-timer-preferences.ts`: `export const STEPPER_MODE_KEY = 'omni_stepper'` (junto a `OMNIAUTOTIMER_KEY`).
  - Toggle en `WorkoutTimerSettingsPanel` (nuevo prop `stepperEnabled` + `onToggleStepper`) y/o un control segmentado "Lista / Paso a paso" en el header junto a la tuerca.
  - Render condicional: `stepperEnabled ? <StepperExecution .../> : <lista actual/>`. Ambos consumen los MISMOS `sectioned`, `supersetInfo`, `sessionLogs`, `handleLogged`, `handleResult`, `openTechnique`, `fillByBlock`, `reopenSignal`, `expandedDone`, `justCompleted`.
  - El header de progreso (`:1206-1284`), el cronometro de sesion, el `useScreenWakeLock`, la barra fija "Finalizar" (`:1712-1723`) y el `WorkoutTimerProvider` quedan FUERA del pager (compartidos entre ambos modos).

### Datos / persistencia
- Nada en DB. Solo `localStorage['omni_stepper'] = 'true'|'false'`. Device-scoped, igual que el auto-timer. Sin `GRANT`, sin `database.types.ts`, sin advisors.
- Opcional (si el CEO quiere memoria cross-device): persistir por-alumno requeriria columna nueva + `GRANT UPDATE(col)` en la misma migracion (regla del repo) + accion server. Se desaconseja para v1 (ver Preguntas).

### Viewport / mobile (reglas del repo)
- Usar `min-h-dvh`/`h-dvh` (nunca `h-screen`/`100vh` fuera de `md:`); `pt-safe`/`pb-safe` en bordes; contenedor del paso con scroll vertical propio (`overflow-y-auto`) y `touch-action: pan-y`. El pager no debe generar scroll horizontal del body.
- Respetar `md=760`: en desktop el paso se centra en columna; el swipe con mouse sigue funcionando via drag, pero los botones prev/next son el camino principal.

---

## Tareas atomicas estimadas (S/M/L)

1. **(M-L) Extraer `SingleExerciseCard.tsx`** desde el inline `WorkoutExecutionClient.tsx:1440-1699`, con paridad exacta. Riesgo alto por la cantidad de valores derivados y refs; requiere verificacion visual/comportamental contra la lista actual. Es el prerequisito del stepper.
2. **(S-M) Helper puro `lib/workout-stepper.ts`**: `buildStepModel`, `firstIncompleteStepIndex`, `stepIndexOfBlock`, `isStepComplete` (reusando `isBlockComplete`/`groupContiguousSupersetRuns`/`executionAreaGroupsFor`).
3. **(S) Tests unitarios** de `workout-stepper.ts` (orden de pasos, superserie = 1 paso, primer incompleto, salto por bloque). Vitest, mismo estilo que `muscle-map.test.ts`.
4. **(L) `StepperExecution.tsx`**: pager con drag/swipe (patron `DayNavigator`), `AnimatePresence` direccional, `currentStepIndex`, botones prev/next, rail de progreso navegable, eyebrow de seccion, `touch-action: pan-y`. Renderiza `SingleExerciseCard`/`SupersetGroupCard` del paso.
5. **(S) Persistencia del toggle**: `STEPPER_MODE_KEY='omni_stepper'` en `rest-timer-preferences.ts`; estado `stepperEnabled` + effect de lectura + `toggleStepper` en `WorkoutExecutionClient` (mirror del auto-timer).
6. **(S-M) UI del toggle**: prop `stepperEnabled`+`onToggleStepper` en `WorkoutTimerSettingsPanel` y/o control segmentado "Lista / Paso a paso" en el header.
7. **(S-M) Ramificar el auto-avance**: en modo stepper, `scrollToNextIncomplete` -> `setCurrentStepIndex(stepIndexOfBlock(...))` en lugar de `scrollIntoView`; conservar la guia interleaved dentro de superserie.
8. **(S-M) Accesibilidad + reduced-motion + hardening**: `role`/`aria-roledescription`/`aria-label` "Ejercicio X de Y", `aria-live="polite"` en cambio de paso, prev/next focusables (flechas opcional), crossfade en reduced-motion, z-index/padding para no chocar con la barra fija "Finalizar".
9. **(S) Docs**: actualizar `docs/architecture/FLOWS_AND_COMPONENTS.md` (nuevo modo + componentes) y, si aplica, `docs/architecture/PROJECT_STRUCTURE.md`.

---

## Riesgos y gotchas

- **Refactor de la card inline (Tarea 1) es el mayor riesgo de regresion.** El bloque `:1440-1699` depende de muchos valores calculados en el closure del `.map` (`eff`, `suggestedWeightKg`, `firstUnlogged`, `fillByBlock[block.id]`, `reopenSignal`, `openDetails[block.id]`, `justCompleted`, refs `blockRefs`). Extraer debe ser un "mover sin cambiar": misma salida, mismos props, verificar paridad en ambos modos.
- **Unmount agresivo de pasos y la cola offline.** El stepper monta solo el paso actual -> los `LogSetForm` de pasos no visibles se desmontan. El efecto de reconciliacion que hace `dequeueWorkoutLog` en `state.success` vive DENTRO del `LogSetForm` (`LogSetForm.tsx:316-330`); si el form se desmonta por auto-avance justo tras submitear, el item puede quedar "huerfano" en la cola (mismo fenomeno ya documentado en `handleFinish`, `:1148-1194`). Mitigaciones: (a) el write-through encola ANTES de la red (`:376`), asi el valor NUNCA se pierde; (b) `handleFinish` ya hace flush reconciliador al finalizar; (c) recomendado: en auto-avance, no desmontar el paso recien submiteado hasta que dispare `onResult`, o mantener el paso anterior "keep-alive" un instante. **Verificar explicitamente en QA con red inestable.**
- **`touch-action`.** Sin `touch-action: pan-y` en el contenedor drag, el swipe horizontal compite con el scroll vertical del paso (ejercicios largos) — gesto trabado. Con el, el pan-x lo maneja framer-motion y el pan-y sigue scrolleando.
- **Hidratacion SSR.** Leer `localStorage['omni_stepper']` SOLO en effect post-montaje (nunca en el initializer de `useState`), replicando el fix ya aplicado al auto-timer (`:924-930`); si no, mismatch de hidratacion.
- **Superserie = un paso.** No paginar por miembro: rompe rondas intercaladas y el descanso de grupo. El paso es el GRUPO; `SupersetGroupCard` ya resuelve A1->B1->A2->B2 y el `groupRestSeconds`.
- **Auto-timer / descanso protagonista.** El `WorkoutTimerProvider` y el `RestTimer` (sheet inferior) deben quedar por ENCIMA del pager y fuera de `AnimatePresence` del paso, para que el descanso no se desmonte al cambiar de paso.
- **Barra fija "Finalizar" + `ManualTimerButton`.** Se mantienen; el pager necesita padding inferior (`pb-32` como hoy) y control de z-index para que prev/next no queden tapados.
- **framer-motion v12.** `drag`, `onDragEnd`, `PanInfo`, `AnimatePresence`, `useReducedMotion` ya se usan en el repo (`DayNavigator`, exec) — API confirmada, sin dependencia nueva.
- **Reduced-motion.** Con `useReducedMotion()`, desactivar drag y slide (crossfade), consistente con `DayNavigator:66-70` y con `springs`/reduced ya usados en toda la exec.
- **Paridad de edicion.** El rail de progreso debe permitir volver a un paso completado y reabrir una serie (reusa el chip recap -> editable de `LogSetForm.tsx:425-493` y el `reopenSignal`/`fillByBlock`), para no perder la capacidad de corregir que hoy da la lista.

---

## Preguntas para el CEO

1. **Persistencia del toggle**: por-dispositivo (localStorage `omni_stepper`, como el auto-timer; cero DB, recomendado para v1) o recordado por-alumno cross-device (columna nueva + `GRANT UPDATE` + accion server)? Recomiendo localStorage.
2. **Avance entre ejercicios**: auto-avance suave al completar el ejercicio (con opcion de volver) o exigir swipe/"Siguiente" explicito (estilo Peloton "swipe to complete")? Recomiendo auto-avance suave, reusando la logica de foco ya existente.
3. **Ubicacion del toggle**: dentro del dialog de la tuerca (junto al auto-timer) o un control segmentado "Lista / Paso a paso" visible en el header? Recomiendo el header (mas descubrible para un opt-in nuevo).
