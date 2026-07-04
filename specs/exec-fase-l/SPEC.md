# SPEC — Fase L: ejecución de entrenamiento del alumno (stepper + teclado + sustitución)

**Feature:** `exec-fase-l`
**Status:** APROBADO (decisiones bakeadas por CEO/orquestador)
**Owner:** TBD
**Last updated:** 2026-07-04
**Branch:** `feat/redesign-eva-design-system` (EVA DS ya aplicado)
**Informes fuente:** `docs/audits/fase-l-wl2/informe-stepper-exec.md`, `informe-teclado-custom.md`, `informe-sustitucion-maquina.md`

> **Directiva de diseño (CEO, 2026-07-04):** todo UI nuevo de esta fase (stepper, keypad, sheet de sustitución) debe ser creativo, bonito y profesional, complementando el EVA DS vigente (tokens `--sport-*`, radios EVA, motion sobrio); investigar referencias visuales 2026 (Hevy/Strong/Peloton, Dribbble) antes de implementar cada pieza.

---

## 1. Problema

La pantalla de ejecución del entrenamiento del alumno (web/PWA, ruta `c/[coach_slug]/workout/[planId]/`) hoy funciona pero tiene tres fricciones de uso real en el gimnasio, verificadas contra el código y contra la industria (Hevy, Strong, Fitbod, Peloton Strength+, Boostcamp):

- **(A) Sobrecarga visual de la lista completa.** La exec muestra TODOS los bloques a la vez; en móvil el alumno debe recordar en qué serie va y scrollear entre ejercicios. La industria (Hevy, Peloton, Boostcamp, Fitbod Focus) ofrece un modo "un ejercicio a la vez" como opción.
- **(B) El teclado del sistema tapa el objetivo prescrito.** Al registrar peso/reps con `<input type="number">` nativo, en móvil el teclado del SO cubre la mitad inferior; como el objetivo prescrito (peso/reps sugeridos, "última vez", sobrecarga) vive ARRIBA de la fila de series, el alumno pierde de vista qué debe hacer mientras tipea. Strong/Hevy resuelven esto con keypad propio.
- **(C) No hay forma de sustituir una máquina ocupada.** Si el implemento prescrito está en uso, el alumno no tiene salida dentro de la app: no puede registrar un ejercicio equivalente sin abandonar el flujo, y el coach nunca se entera de que se sustituyó.

Estas tres mejoras comparten superficie (la misma exec, el mismo `LogSetForm`) y se abordan en una sola fase, ordenadas de menor a mayor riesgo.

## 2. Usuarios

- **Primario:** alumno ejecutando su rutina en móvil/PWA (pointer coarse, en el gimnasio, con red inestable).
- **Secundario:** alumno en desktop (pointer fino, teclado físico) — debe conservar el comportamiento actual sin regresión.
- **Interno/operador:** coach, que ve en la ficha del alumno qué sustituyó y por qué.

## 3. Objetivos

### Workstream A — Modo stepper opt-in
- G-A1: Ofrecer un modo de ejecución opcional que muestre **un ejercicio (o una superserie) a la vez**, con navegación swipe + botones prev/next.
- G-A2: Auto-avance suave al completar el ejercicio, con opción de quedarse; reusa la lógica de foco existente.
- G-A3: Toggle **por-dispositivo** (localStorage `omni_stepper`, espejo de `omni_autotimer`), default OFF (opt-in).
- G-A4: Cero cambios en el motor: logging, cola offline, dedupe, reconciliación, descanso, progresión intactos. El stepper es 100% presentación/navegación.

### Workstream B — Teclado numérico custom
- G-B1: Mantener el **objetivo prescrito siempre visible** mientras el alumno tipea (el objetivo viaja con el keypad).
- G-B2: Ofrecer incrementos rápidos de peso (chips `-2.5 / +2.5 / +5` kg, coherentes con `step=0.5`).
- G-B3: No romper accesibilidad (el `<input>` nativo sigue siendo la fuente de verdad) ni el fallback de teclado físico en desktop.
- G-B4: Convivir con Enter-no-cierra-serie, autofill "= última vez" y la cola offline sin tocar el pipeline de submit.

### Workstream C — Sustitución de máquina ocupada
- G-C1: Botón en la card del bloque que abre un bottom-sheet con **3-5 ejercicios equivalentes** del mismo grupo muscular, rankeados de forma determinista des-priorizando la máquina ocupada.
- G-C2: **Swap in-place solo de esa sesión** — el plan/plantilla NO se toca; la card, nombre, gif y modal de técnica pasan a mostrar el sustituto.
- G-C3: Persistir la sustitución en el log (columnas aditivas dedicadas en `workout_logs`) de forma **visible para el coach en la ficha**.
- G-C4: Cero blast-radius sobre el motor de progresión/PRs/volumen recién endurecido (no tocar `exercise_id` ni las 4 RPCs de progreso en v1).

## 4. No-objetivos (fuera de alcance)

- **NG-1 (B):** Plate math / calculadora de discos (qué discos cargar). Decisión CEO: EXCLUIDO de v1.
- **NG-2 (B):** Keypad para cardio/movilidad/roller (`TypedLogSetRow`). v1 es **solo fuerza** (peso/reps); tipado es fase 2.
- **NG-3 (C):** Re-atribución correcta de PRs/volumen al sustituto vía las 4 RPCs de progreso (`COALESCE(wl.substituted_exercise_id, wb.exercise_id, wl.exercise_id)`). Es **fast-follow declarado fuera de alcance**; v1 usa un guard client-side anti-PR-falso.
- **NG-4 (C):** Columna `substitution_reason` con `CHECK` enum de múltiples motivos. v1 usa `substitution_reason text` **SIN CHECK**, con valor único `"machine_busy"` desde una constante fuente-única en código.
- **NG-5 (C):** Sustitución después de haber logueado sets del bloque (upsert por `(block, set)`). v1 permite sustituir **solo antes** del primer set logueado del bloque.
- **NG-6 (todos):** Paridad con `apps/mobile` (React Native / Expo). Es codebase aparte; esta fase es **web-first**. Mobile ignora las columnas nuevas sin romperse; el swap/keypad/stepper en RN son trabajo separado.
- **NG-7 (A):** Persistencia del toggle stepper cross-device (columna DB + GRANT + acción server). v1 es device-scoped en localStorage.
- **NG-8 (B):** Persistencia cross-device de preferencia de keypad. El keypad se activa por `pointer: coarse`, no por preferencia guardada.
- **NG-9:** Cambios en `services/` (salvo el nuevo servicio puro de sustitución), `domain/`, RLS, entitlements. Fuera de C, la fase es puramente de presentación.

## 5. Decisiones bloqueadas (bakeadas — NO reabrir)

### A — Stepper
- **DA-1:** Toggle por-dispositivo en `localStorage['omni_stepper']` (espejo de `omni_autotimer`), leído post-montaje (hidratación-safe), default OFF.
- **DA-2:** Auto-avance suave al completar + swipe disponible; controles prev/next siempre visibles.
- **DA-3:** Toggle ubicado en el **header de la exec** (control segmentado "Lista / Paso a paso"), más descubrible para un opt-in nuevo.
- **DA-4:** **Prerequisito duro:** extraer la card inline (`WorkoutExecutionClient.tsx:1440-1699`) a `SingleExerciseCard` con **paridad 1:1** ANTES de todo lo demás.
- **DA-5:** Una **superserie = 1 paso** (nunca paginar por miembro; rompe rondas intercaladas y el descanso de grupo).
- **DA-6:** `RestTimer`/`WorkoutTimerProvider` quedan **FUERA del `AnimatePresence`** del paso (el descanso no se desmonta al cambiar de paso).
- **DA-7:** `touch-action: pan-y` en el contenedor arrastrable (el pan-x lo maneja framer-motion, el scroll vertical sigue vivo).

### B — Teclado
- **DB-1:** v1 SOLO fuerza (peso/reps).
- **DB-2:** Gate por `matchMedia('(pointer: coarse)')`; desktop conserva input nativo + Enter-no-cierra + Tab.
- **DB-3:** `inputMode="none"` para suprimir el teclado del SO, con fallback `readOnly` para iOS raros que filtren teclado (los inputs `readOnly` sí viajan en FormData).
- **DB-4** *(ampliada por CEO 2026-07-04)*: Chips de incremento **configurables**: default `-2.5 / +2.5 / +5` kg, con un ajuste chico en el propio keypad (icono engranaje) para elegir el paso entre presets `0.25 / 0.5 / 1 / 1.25 / 2.5 / 5` kg (cubre gimnasios con discos de 1 kg o 0.25 kg), persistido por-dispositivo en `localStorage['omni_keypad_step']`. El tipeo libre de CUALQUIER valor decimal queda SIEMPRE disponible — los chips son atajos, no restricción.
- **DB-5:** El objetivo prescrito se reimprime en el **header del keypad** (peso/reps prescritos + "última vez").
- **DB-6:** El keypad **muta `ref.value`** (mismo mecanismo que el autofill "= última vez"); el pipeline submit/offline queda intacto.

### C — Sustitución
- **DC-1:** Columnas **aditivas** en `workout_logs`: `substituted_exercise_id` (uuid FK nullable, `ON DELETE SET NULL`) + `substituted_exercise_name` (text snapshot) + `substitution_reason` (text, **SIN CHECK** en v1), valor único `"machine_busy"` desde una constante fuente-única en código.
- **DC-2:** Ranking determinista: `muscle_group` como **filtro duro** + `equipment` normalizado por **tiers**, des-priorizando el equipment de la máquina ocupada; tiebreak estable (system-scope → name asc).
- **DC-3:** Botón en la card → bottom-sheet con 3-5 sugerencias → **swap in-place solo de esa sesión** (el plan no se toca).
- **DC-4:** **Guard client-side anti-PR-falso** en v1 (suprimir "Última vez" y no disparar `PRShareCardModal` en bloque sustituido). La re-atribución en RPCs es fast-follow fuera de alcance.
- **DC-5:** La ficha del coach muestra la sustitución (badge "Hizo X — sustituyó Y (máquina ocupada)").
- **DC-6:** Web-first (RN fuera de alcance).

## 6. User Stories

### A — Stepper
- Como **alumno en el gimnasio**, quiero activar un modo "paso a paso" que me muestre un ejercicio a la vez, para no perderme entre bloques ni recordar en qué serie voy.
- Como **alumno**, quiero deslizar o tocar "Siguiente" para avanzar, y que al completar un ejercicio el modo avance solo suavemente, para mantener el ritmo sin taps extra.
- Como **alumno**, quiero volver a un ejercicio anterior (rail de progreso) para corregir una serie que registré mal.
- Como **alumno con superserie**, quiero que la superserie se ejecute completa en un solo paso (A1→B1→A2→B2) para no romper las rondas.

### B — Teclado
- Como **alumno en móvil**, quiero ver el peso/reps objetivo mientras tipeo, para no tener que scrollear hacia arriba a cada serie.
- Como **alumno**, quiero botones `+2.5 / +5` para ajustar el peso rápido sin tipear todos los dígitos.
- Como **alumno en desktop**, quiero seguir usando mi teclado físico y que Enter no cierre la serie, exactamente como hoy.

### C — Sustitución
- Como **alumno**, quiero un botón "máquina ocupada / cambiar" que me sugiera 3-5 ejercicios equivalentes del mismo músculo, para seguir entrenando sin esperar.
- Como **alumno**, quiero que ese cambio valga solo para hoy y no modifique mi plan.
- Como **coach**, quiero ver en la ficha del alumno qué ejercicio sustituyó y por qué, para saber cómo entrenó realmente.

## 7. Criterios de aceptación

### Transversales
- [ ] AC-0a: `pnpm typecheck` verde tras cada tanda; `pnpm lint` sin nuevos errores.
- [ ] AC-0b: Vitest verde para toda lógica pura nueva (`workout-stepper`, `exercise-substitution`, `useCoarsePointer`).
- [ ] AC-0c: Mobile viewport usa `dvh`/`h-dvh` (nunca `h-screen`/`100vh` fuera de `md:`); bordes fijos con `pb-safe`/`pt-safe`.
- [ ] AC-0d: Dark mode verificado en todo UI nuevo (la exec es dark siempre).
- [ ] AC-0e: `useReducedMotion` respetado en toda animación nueva (crossfade/instantáneo).
- [ ] AC-0f: Docs actualizadas (`docs/architecture/FLOWS_AND_COMPONENTS.md`, y `PROJECT_STRUCTURE.md` si aplica).

### A — Stepper
- [ ] AC-A1: `SingleExerciseCard` extraída del inline con paridad 1:1 — la lista clásica se ve y se comporta idéntica tras la extracción (verificación visual/comportamental).
- [ ] AC-A2: Toggle "Lista / Paso a paso" en el header persiste en `localStorage['omni_stepper']`; default OFF; leído post-montaje sin mismatch de hidratación.
- [ ] AC-A3: En modo stepper se ve un solo paso; superserie = 1 paso; swipe + prev/next funcionan; rail de progreso permite saltar a cualquier paso y volver a editar.
- [ ] AC-A4: Auto-avance suave al completar el ejercicio; dentro de una superserie NO avanza de paso (la guía interleaved sigue operando).
- [ ] AC-A5: `RestTimer`/`WorkoutTimerProvider`/header de progreso/barra "Finalizar" quedan fuera del pager y no se desmontan al cambiar de paso.
- [ ] AC-A6 (offline): con red inestable, ningún log se pierde al auto-avanzar tras submitear (write-through encola antes de la red; `handleFinish` hace flush reconciliador). Verificar en QA.
- [ ] AC-A7 (a11y): `role`/`aria-roledescription`/`aria-label` "Ejercicio X de Y"; `aria-live="polite"` en cambio de paso; prev/next focusables; reduced-motion → crossfade.

### B — Teclado
- [ ] AC-B1: En pointer coarse, enfocar peso/reps abre el keypad in-app y NO abre el teclado del SO; el objetivo prescrito es visible en el header del keypad.
- [ ] AC-B2: Chips de incremento mutan el valor según el paso configurado (default 2.5; presets 0.25/0.5/1/1.25/2.5/5 kg desde el ajuste del keypad, persistido en localStorage); coma decimal es-CL permitida (una sola) en peso, bloqueada en reps; el tipeo libre de cualquier valor sigue disponible.
- [ ] AC-B3: "Listo" es el único submit; el pipeline `handleSubmit → FormData → normalización coma→punto → enqueue → formAction` queda intacto; autofill "= última vez" refresca el mirror del keypad.
- [ ] AC-B4: En pointer fino (desktop) el input queda EXACTAMENTE como hoy (inputMode decimal/numeric, Enter-no-cierra, Tab) — sin regresión.
- [ ] AC-B5 (a11y): el `<input>` real permanece con su label; cada botón del keypad tiene `aria-label`; panel `role="group"`; VoiceOver/TalkBack anuncian el input.
- [ ] AC-B6 (z-order): al abrir el keypad se oculta la barra "Finalizar" para no apilar dos barras; la fila activa queda por encima del keypad (padding + `smoothScrollIntoViewIfNeeded`).
- [ ] AC-B7 (iOS): verificado en iOS real que `inputMode="none"` suprime el teclado; si filtra, `readOnly` como fallback y el valor sigue viajando en FormData.

### C — Sustitución
- [ ] AC-C1: Migración aditiva aplicada (2-3 columnas + FK `ON DELETE SET NULL` + índice parcial); `database.types.ts` regenerado; advisors sin críticos.
- [ ] AC-C2: El bottom-sheet muestra 3-5 sugerencias del mismo `muscle_group`, rankeadas determinísticamente, des-priorizando el equipment de la máquina ocupada; el mismo input produce el mismo orden.
- [ ] AC-C3: Al confirmar, la card/nombre/gif/técnica muestran el sustituto y un badge "Sustituido · máquina ocupada"; el plan/DB del bloque NO se toca; se puede deshacer mientras no haya sets logueados.
- [ ] AC-C4: Cada serie logueada con sustitución activa persiste `substituted_exercise_id` + `substituted_exercise_name` + `substitution_reason='machine_busy'`; sobrevive a reload (rehidratación desde logs de HOY) y a offline flush.
- [ ] AC-C5: Guard anti-PR-falso activo: en bloque sustituido no se autollena "Última vez" ni se dispara `PRShareCardModal`.
- [ ] AC-C6: La ficha del coach (`getClientWorkoutForDate` + `TrainingTabB4Panels`) muestra el badge de sustitución por serie/ejercicio.
- [ ] AC-C7: `exercise_id` del log NO se sobreescribe con el sustituto; las 4 RPCs de progreso quedan sin tocar; salida idéntica con 0 sustituciones.

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Extracción de `SingleExerciseCard` regresiona la lista (muchos valores derivados en el closure del `.map`) | Alto | "Mover sin cambiar": mismo JSX, mismos props; verificación de paridad en ambos modos ANTES de seguir. Es la primera tanda por eso. |
| Unmount agresivo de pasos + cola offline: log huérfano al auto-avanzar tras submit | Alto | Write-through encola antes de la red; `handleFinish` flushea; no desmontar el paso recién submiteado hasta `onResult`. QA con red inestable. |
| `touch-action` ausente → swipe horizontal traba el scroll vertical | Medio | `touch-action: pan-y` obligatorio en el contenedor drag. |
| Hidratación SSR al leer localStorage / detectar pointer en el initializer | Medio | Leer SOLO en effect post-montaje (patrón `omni_autotimer:928-930`). |
| iOS filtra teclado con `inputMode="none"` | Medio | Fallback `readOnly` (viaja en FormData); verificar en iOS real, no simulador. |
| `equipment` es texto libre sucio (ES/EN, `Corporal`, `Peso libre`, `Otro`) | Medio | Normalización con const única fuente-de-verdad + mapa de tiers; el ranking nunca hace match exacto sin normalizar. |
| PR falso: sustituto-máquina pesado marca PR en el slot prescrito (RPCs `COALESCE(wb, wl)`) | Medio | Guard client-side v1 (no "Última vez", no share-card en bloque sustituido). Re-atribución = fast-follow fuera de alcance. |
| Trigger `set_workout_log_exercise_id` respeta `exercise_id` no-NULL | Medio | Decisión firme: NUNCA mandar `exercise_id` del sustituto; solo las columnas dedicadas. |
| Offline legacy: items ya encolados deben seguir parseando | Medio | Los 2-3 campos de sustitución son opcionales en `WorkoutOfflineLog`/FormData/Zod. |
| Dos barras apiladas (keypad + "Finalizar") o keypad tapa fila activa | Bajo | Ocultar footer al abrir keypad; `--keypad-h` + scroll-into-view de la fila activa. |
| Merge/rebase pierde el trabajo (rama rediseño) | Bajo | Rama única `feat/redesign-eva-design-system`; rebase cuidado; migración idempotente forward-only. |

## 9. Preguntas abiertas

Todas las preguntas de los tres informes fueron resueltas por el CEO/orquestador y bakeadas en §5. No quedan preguntas abiertas para v1. Los ítems diferidos (plate math, keypad tipado, re-atribución de PRs en RPCs, `reason` multi-motivo, paridad RN) están registrados como no-objetivos (§4) y como fast-follows en `PLAN.md`.
