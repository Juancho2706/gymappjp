# G03 — Gaps de paridad: Alumno · Home + Workout + Ejecución

Dominio más grande del proyecto. Referencia = comportamiento mobile/responsive de `apps/web` (EVA DS, post 2026-07-04 + Fase L + PR #113 + dark tones). Fuente mobile = `apps/mobile` (Expo SDK 54).

Método: lectura de research 01/02/03/06/07 + verificación directa de código mobile (`alumno/workout/[planId].tsx`, `alumno/(tabs)/workout.tsx`, `alumno/(tabs)/home.tsx` por grep, `components/workout/RestTimer.tsx`, `components/workout/WorkoutSummaryModal.tsx`) y listado real del árbol web (`c/[coach_slug]/workout/[planId]/*` + `lib/client/*` + `lib/workout*`).

Alcance cubierto: (1) Home/dashboard alumno, (2) tab intermedio workout, (3) ejecución de rutina completa. Nutrición, check-in, exercises, perfil, módulos gated = otros dominios (se mencionan solo en costuras).

---

## Estado de partida (encuadre honesto)

- **Home (`alumno/(tabs)/home.tsx`, 913 L)**: patrón A (EVA DS, re-skineada en Fases 0–9). Buena base visual pero DESACTUALIZADA respecto a los ~90 commits posteriores (cápsula flotante final, días pendientes, weight quick-log, PR detail sheet, macro bars de nutrición). Todavía lee colores del objeto `theme` legacy en paralelo a clases DS.
- **Tab workout intermedio (`alumno/(tabs)/workout.tsx`, 236 L)**: patrón B (legacy, objeto `theme` + StyleSheet). Es una lista simple de planes del programa activo. **No existe como pantalla dedicada en la web** — en web el "qué entreno hoy" vive en el HeroSection del dashboard y el link va directo a `/workout/[planId]`. En mobile este tab está oculto del chrome (`href:null`) y se llega por el hero del home. Divergencia estructural menor; su rol real es "lista de días del programa".
- **Ejecución (`alumno/workout/[planId].tsx`, 934 L)**: patrón B legacy con paleta hex propia (`INK_950`, `FONT_MONO`, etc.). **Es el gap MÁS grande y costoso del proyecto entero.** Tiene una fracción de lo que la web reescribió por completo. Un solo archivo monolítico contra ~40 archivos web (16 componentes + 8 módulos de lógica pura testeada + sheets + data).

La web reescribió la ejecución de raíz: `EffortScale, HoldTimer, IntervalTimer, LogSetForm, MuscleMapSvg, NumericKeypadSheet, PRShareCardModal, RestTimer, SingleExerciseCard, StepperExecution, Stopwatch, WorkoutExecutionClient, WorkoutKeypadProvider, WorkoutSummaryOverlay, WorkoutTimerProvider, WorkoutTimerSettingsPanel, SubstituteExerciseSheet` + lógica pura `typed-keypad, session-logs.optimistic, session-logs.reconcile, session-summary, muscle-map, body-anatomy, rest-timer-preferences, workout-block-grouping, workout-areas, workout-exercise-type, workout-interval, workout-stepper, workout-offline-queue, workout-pr-card-canvas` + `lib/client/{keypad-logic, useCoarsePointer, haptics, use-screen-wake-lock, app-badge}`.

---

## 1. GAPS VISUALES (pantalla por pantalla)

### 1.1 Home / dashboard alumno (`alumno/(tabs)/home.tsx`)

Base re-skineada, pero contra la web (`03-web-alumno-screens.md` §4) faltan o divergen:

- **Header/greeting**: web tiene `DashboardHeader` sticky con eyebrow `brand_name` + saludo `{timeGreeting}, {firstName}` + fecha larga Santiago + `welcome_message`. Verificar que mobile tenga el saludo por hora y fecha larga (el inventario no lo confirma explícito; hay `ScreenHeader`).
- **StreakRibbon**: web tiene hitos (7/14/30/60/100/180/365), count-up, "te faltan N para los M días", barra de progreso al próximo hito, llama pulsante. Mobile tiene StreakRibbon pero verificar hitos + count-up + barra al próximo hito.
- **Cápsula flotante de nav** (referencia central RN): la web mobile usa cápsula de vidrio esmerilado "4 primarios + Más" con píldora deslizante animada (`--ease-spring`) + hide-on-scroll (>80px encoge). El mobile `AlumnoMobileChrome.tsx` usa BlurView + MotiView pero con `theme.primary` (patrón B) y fuente `Inter_600SemiBold` legacy, y hay que verificar: píldora deslizante detrás del tab activo, hide-on-scroll, glifo activo con `fill-opacity`, label peso 800. Es DS-parcial, no 1:1.
- **HeroSection**: web `WorkoutHeroCard` (card inverse) con eyebrow "Hoy entrenas" + `ProgressRing` (series logueadas/target, color sport) + lista hasta 4 ejercicios con barra de progreso por bloque + overlay "completado". `RestDayCard` con luna animada + próximo entreno. Mobile tiene WorkoutHero/RestHero/NoPlanHero — verificar ProgressRing y barras por-ejercicio.
- **MomentumCard**: web fusiona tira semanal L-D (7 días con estado) + 3 `ComplianceRing` (Entrenos sport / Nutrición ember / Check-ins success). Mobile lo tiene ("Momentum" WeekStrip + 3 ComplianceItem) — verificar paridad de estados y el "Sin datos" gris.
- **ActiveProgramSection**: web tiene badge "Semana X de Y (· Sem A/B)" + `ProgramPhaseBar` (fases) + `WorkoutPlanCards` con estados today/completed/pending/upcoming. Verificar `ProgramPhaseBar` en mobile (probablemente ausente).
- **WeightWidget**: web = "Peso actual" + `WeightHeadline` (número grande) + `TrendArrow` (up/down/stable vs promedio 7d) + fecha relativa + `WeightSparkline` (14d) + `WeightQuickLog`. Mobile tiene Sparkline pero **falta `TrendArrow` y `WeightQuickLog`** (grep: sin `quickLog`).
- **PersonalRecordsCard**: web card inverse con grid (kg sport + lift + fecha + badge NUEVO), tap → `PRDetailSheet` (progresión on-demand). Mobile tiene `PersonalRecordsBanner` pero **falta `PRDetailSheet`** (grep: sin `PRDetail`/`getExercisePR`).
- **NutritionDailySummary**: web = kcal hero + badge "N restantes" + 3 `MacroBar` (P/C/G) + `MealCompletionRow` (toggle optimista). Mobile tiene `NutritionDailySummaryWidget` — verificar MacroBars y toggles inline.
- **Pull-to-refresh**: web tiene `DashboardPullToRefresh` (custom). Mobile usa `RefreshControl` nativo — aceptable, no es gap visual real.

### 1.2 Ejecución de rutina (`alumno/workout/[planId].tsx`) — gap visual masivo

Todo lo que sigue está AUSENTE o en versión pobre en mobile (fondo oscuro sí está, pero con paleta hex hardcodeada en vez de tokens/clases DS):

- **Header**: web tiene toggle segmentado "Lista / Pasos", botón tuerca (Settings de descanso/alarma), barra de progreso global + línea "Ejercicio X de Y · N/M series · volumen · tiempo transcurrido · %". Mobile solo tiene back + eyebrow + título + barra de progreso simple + "N/M series · %". **Faltan: toggle Lista/Pasos, tuerca de ajustes, volumen, tiempo transcurrido, ejercicio X de Y.**
- **SingleExerciseCard vs BlockCard mobile**: la web `SingleExerciseCard` tiene fila tipo·músculo + acciones (Detalles disclosure / "Cambiar" sustitución / "Técnica" modal), badge de sustitución + deshacer, dots de progreso de series, prescripción con chip sobrecarga, "Última vez" (tap autollena), "Supera tu marca", cue de técnica, disclosure de detalles (técnica/nota coach/sobrecarga/historial). Mobile `BlockCard`: tiene meta+nombre, botón técnica (play), grid de métricas, cartel de progresión, notas, "Sesión anterior" (chips, NO tap-autofill), logs. **Faltan: Detalles disclosure, "Cambiar", badge sustitución+undo, dots de progreso de serie, tap-autofill de última vez, "Supera tu marca".**
- **LogSetForm**: web es un componente rico (~1079 L) con objetivo prescrito siempre visible, chips de incremento de peso, paso de esfuerzo RPE/RIR visual (`EffortScale`/`ScaleDots`). Mobile usa **4 `TextInput` crudos** (kg/reps/RPE/RIR) con teclado del sistema. **Falta: keypad custom, chips de incremento de peso, EffortScale visual.**
- **RestTimer** (`components/workout/RestTimer.tsx`): mobile es una tarjeta inline pequeña arriba (ring SVG 48px + play/pause/reset/skip). Web (Fase M) lo hizo **descanso a pantalla protagonista** + warmup rest + sonido/alarma configurable (`rest-timer-preferences.ts`, `WorkoutTimerSettingsPanel`). **Faltan: modo protagonista, warmup rest, sonido/alarma configurable, ajuste +/- tiempo.**
- **WorkoutSummaryModal** (`components/workout/WorkoutSummaryModal.tsx`): mobile tiene stats (series/reps/volumen) + breakdown por ejercicio + barras de volumen por grupo muscular + share (texto plano vía `Share.share`). Web `WorkoutSummaryOverlay`: **PRs detectados con guard anti-PR-falso para sustituidos**, `PRShareCardModal` (canvas branded con logo+nombre coach), **mapa muscular anatómico** (`MuscleMapSvg`), próximo hint, y **cuenta cardio/movilidad/roller** en el resumen. **Faltan: detección de PR en summary, PR share card branded, mapa muscular SVG, next hint, conteo polimórfico.**
- **Modo Paso a paso** (`StepperExecution`): AUSENTE total en mobile. Web = pager 1 ejercicio/superserie, rail de progreso tappable, swipe horizontal (framer drag), auto-avance, transición direccional. **Falta completo.**
- **Sustitución** (`SubstituteExerciseSheet`): AUSENTE. Web = sheet para sustituir ejercicio por máquina ocupada (strength, antes del 1er set), badge visible al coach.
- **Ejecución polimórfica tipada** (cardio/mobility/roller): AUSENTE. La `Block` interface de mobile NO tiene `exercise_type_override`, `side_mode`, `distance`, `duration`, `target_pace`, `hr_zone`, `interval_config`. Web tiene `TypedTargetGrid` + `TypedBlockTimerButton` + tabla tipada por tipo de ejercicio. **Falta completo** — mobile solo sabe renderizar strength (sets×reps×kg).
- **Timers polimórficos**: mobile solo tiene `RestTimer`. Faltan `HoldTimer`, `IntervalTimer`, `Stopwatch`, `WorkoutTimerSettingsPanel` (web los tiene todos, orquestados por `WorkoutTimerProvider`).
- **Técnica inline**: mobile `TechniqueDialog` abre gif (Image) + botón "Abrir video" (Linking.openURL, sale de la app) + instrucciones. Web reproduce **video inline** (YouTube/mp4/gif embebido en modal, no sale de la app). Gap de fidelidad: video no es inline en mobile.
- **Celebración PR**: mobile tiene confetti + banner "¡Nuevo récord!" básico (paleta hex `#F59E0B`/`#10B981` hardcodeada, no tokens). Web tiene celebración más rica + audio (`audioUtils.ts`).

### 1.3 Deuda de tokens/estilo en ejecución

`alumno/workout/[planId].tsx`, `RestTimer.tsx`, `WorkoutSummaryModal.tsx` definen **constantes hex literales** (`INK_950='#0B0E13'`, `INK_900='#12161D'`, `ON_DARK`, `SUCCESS='#1FB877'`, `W04..W10`) en vez de consumir tokens DS. Colores de confetti hardcodeados. Fuentes por string literal (`Archivo_800ExtraBold`, `JetBrainsMono_700Bold`). Todo esto debe migrarse a la capa de tokens compartida (ver `02-design-system.md` §D).

---

## 2. GAPS FUNCIONALES (incluye delta post-21-jun)

Ordenados por criticidad. Todos verificados contra `01-web-delta.md` §2.1 y el código.

### P0 — correctness / core-loop

1. **Resiliencia PR #113 (drafts/snapshot, recuperación de sesión, cap 4h)** — AUSENTE. Mobile recarga logs de hoy por query pero NO tiene draft/snapshot local del set en curso ni recuperación de sesión a medias. Web: `699ddd05` + `session-logs.optimistic.ts`/`reconcile.ts`. **Riesgo real de pérdida de datos** si el alumno cierra la app a mitad de set. No hay cap de duración 4h ni tracking de duración de sesión.
2. **Optimistic + reconcile de logs** — mobile hace un patch local optimista básico (setLogs) + select-then-update/insert acotado al día (bien resuelto en fixes S1/S2, líneas 342-423), pero NO usa la lógica pura testeada `session-logs.optimistic.ts`/`session-logs.reconcile.ts` de web. El P0 de web "holds no se borran al guardar" (`42e22e89`) no aplica porque mobile no tiene holds — pero cuando se agreguen timers hold, hay que portar el reconcile.
3. **Duración de sesión + cap 4h** — AUSENTE. Web trackea tiempo transcurrido (visible en header) y capea a 4h. Mobile no muestra ni trackea duración.

### P0/P1 — features de ejecución

4. **Keypad numérico custom + flujo tipado** — AUSENTE. Web `NumericKeypadSheet` + `typed-keypad.ts` + `keypad-logic.ts` + `useCoarsePointer.ts`: flujo peso→reps→(RPE/RIR opcional), objetivo visible mientras se teclea, touch-only. Mobile usa teclado del sistema. Lógica pura portable (`typed-keypad.ts`, `keypad-logic.ts`).
5. **Modo Paso a paso (stepper)** — AUSENTE. `StepperExecution` + `workout-stepper.ts` (lógica pura testeada) + `STEPPER_MODE_KEY` device-scoped. 
6. **Sustitución de ejercicio + migración** — AUSENTE. `SubstituteExerciseSheet` + columnas de sustitución en `workout_logs` (migración `e4fd7c32`) + schema en `packages/schemas/workout.ts`. El coach ve la sustitución. Mobile `Block`/`LogEntry` no manejan `substituted_exercise_id` ni nombre sustituido.
7. **Ejecución polimórfica cardio/mobility/roller** — AUSENTE. Requiere: campos tipados en la query (`exercise_type_override`, `side_mode`, reps/load/distance/duration, `target_pace`, `hr_zone`, `interval_config`), `TypedTargetGrid`, `TypedBlockTimerButton`, tabla tipada. Lógica pura: `workout-exercise-type.ts`, `workout-interval.ts`.
8. **Timers polimórficos** — falta `HoldTimer`, `IntervalTimer`, `Stopwatch` + `WorkoutTimerProvider` (orquestación de un timer activo a la vez) + `WorkoutTimerSettingsPanel` (auto-timer toggle + sonido).
9. **Zonas de FC (HR zones) cardio** — AUSENTE. Depende del módulo `cardio` (entitlement) + `domain/cardio/zones.ts` + endpoint `/api/mobile/cardio/profile` (existe en web, NO consumido por mobile). Zonas FC personalizadas por alumno.
10. **Áreas custom** — AUSENTE. Web carga `areas` (nombres de áreas custom, service-role) y las muestra en ejecución. `workout-areas.ts` (lógica pura). Mobile solo tiene secciones fijas warmup/main/cooldown.
11. **Superseries robustas** — mobile tiene `groupSupersets` LOCAL básico (agrupa por `superset_group` contiguo). Web usa `workout-block-grouping.ts` (lógica pura testeada, `1f743185`) de punta a punta (builder + ejecución + coach). Divergencia de lógica; portar el módulo compartido.
12. **Doble progresión + sobrecarga progresiva** — PRESENTE en mobile (`computeEffectiveTarget`, `progression.ts`, weekly_linear + double, líneas 296-334, 609-625). Verificar paridad de fórmula con web (`e46ad109` dice "doble-progresión mobile" — parece ya portada). Bajo riesgo, pero validar que no haya drift.
13. **"Última vez" tap-to-autofill** — mobile muestra "Sesión anterior" (chips read-only) pero NO permite tap para autollenar la serie activa (web sí). Solo prellena el peso con el objetivo de sobrecarga.
14. **"Supera tu marca" inline** — AUSENTE (copy + comparación con máximo histórico visible antes de loguear).
15. **Háptica rica** — mobile tiene haptics básico (`Haptics.impactAsync`, `haptics.pr()`). Web `lib/client/haptics.ts` (Fase S) tiene un vocabulario háptico más completo. Verificar paridad de eventos.
16. **Wake lock** — PRESENTE (`useKeepAwake`, línea 122). OK, no es gap.

### P1 — dashboard alumno (delta post-audit)

17. **Días pendientes de la semana** — AUSENTE en home (grep: sin "Recuperar"/pending days). Web `bf75cf58` + `weekPendingWorkouts.ts` (lógica pura): CTA ember "Tenés N días pendientes · Recuperar Día X" → workout más antiguo recuperable hoy.
18. **WeightQuickLog** — AUSENTE (registro rápido de peso desde el dashboard).
19. **PRDetailSheet** — AUSENTE (progresión del lift on-demand vía `getExercisePRHistory`).
20. **TrendArrow de peso** — AUSENTE (up/down/stable vs promedio 7d).
21. **Share-cards v2 branded** — mobile solo comparte texto plano. Web `PRShareCardModal` + `ProgressShareCardModal`/`StreakShareCardModal`/`MonthlySummaryShareCardModal` con canvas branded (logo+nombre coach, iconos vectoriales). `workout-pr-card-canvas.ts`. Estas cards viven en dashboard/perfil + summary.
22. **OrgAnnouncementBanner / banner huérfano** — verificar (enterprise/team). Probablemente fuera de scope alumno-standalone.

---

## 3. COSTURAS (compartir vía packages/ o API) — cita `07-shared-seams.md`

Prioridad de reutilización para NO duplicar lógica en el port de ejecución:

- **Lógica pura de ejecución ya testeada en web** (hoy co-ubicada en `c/[coach_slug]/workout/[planId]/` y `lib/`): `typed-keypad.ts`, `session-logs.optimistic.ts`, `session-logs.reconcile.ts`, `session-summary.ts`, `muscle-map.ts`, `body-anatomy.ts`, `rest-timer-preferences.ts`, `workout-stepper.ts`, `workout-block-grouping.ts`, `workout-areas.ts`, `workout-exercise-type.ts`, `workout-interval.ts`, `keypad-logic.ts`. **Ninguno está en `packages/`.** Recomendación: extraer a un `packages/@eva/workout-engine` (o similar) replicando el patrón `@eva/nutrition-engine` (TS puro, sin React/DOM), y que web re-exporte desde ahí (shim) para evitar drift. Es el bloque de mayor valor de extracción del proyecto. El arquitecto debe verificar que estos módulos sean puros (no importen React/Next) antes de mover — la mayoría tienen `.test.ts` hermano, señal de pureza.
- **Schemas de workout**: `packages/schemas/workout.ts` ya existe y está marcado "SAFE FOR MOBILE" (`07-shared-seams.md` §A.6). Incluye el schema de sustitución (`ef4bf7e2`). Mobile debe consumirlo en vez de tipos locales ad-hoc (`Block`/`LogEntry` inline).
- **Progresión**: mobile ya tiene `lib/workout/progression.ts` con `computeEffectiveTarget`. Verificar si web tiene un equivalente compartible o si conviene mover a `packages/`. Hoy es un port; riesgo de drift si web cambia la fórmula.
- **`@eva/module-catalog` + entitlements** (`07-shared-seams.md` §C.4): BLOQUEANTE para cardio/HR-zones/movement en ejecución. Mobile tiene 0 referencias a `MODULE_KEYS`/`enabled_modules`. Antes de construir ejecución cardio hay que cablear el gate (mirror de `ModuleKey` vía `@eva/feature-prefs` + fetch de `enabled_modules` vía PostgREST + **gate server-side/RLS** para las mutaciones — riesgo de seguridad si se salta).
- **`domain/cardio`** (`07-shared-seams.md` §C.7): `pace.ts`, `zones.ts`, `types.ts` — puros, listos para extraer a package. Necesarios para HR zones en ejecución.
- **`@eva/brand-kit`** (compartido, ya usado): la ejecución debe consumir `deriveSportTokens`/tokens en vez de las constantes hex hardcodeadas.
- **Offline queue**: mobile ya tiene `lib/offline-cache.ts` (`enqueueLog`/`flushLogQueue`/`cachePlan`). Web tiene `workout-offline-queue.ts`. Son implementaciones paralelas (mobile AsyncStorage, web IndexedDB/localStorage) — NO se comparte el storage, pero conviene alinear la FORMA del payload encolado con el schema compartido.
- **Muscle map SVG** (`MuscleMapSvg.tsx` + `muscle-map.ts` + `body-anatomy.ts`): el SVG y la lógica de mapeo son portables (react-native-svg ya está instalado). `muscle-map.ts`/`body-anatomy.ts` a package; el componente se reescribe con `react-native-svg`.

---

## 4. TAREAS PROPUESTAS

### OLA A — Re-skin visual (sin cambiar features)

- **A1 [VISUAL] S** — Migrar `alumno/workout/[planId].tsx`, `RestTimer.tsx`, `WorkoutSummaryModal.tsx` de constantes hex/fuentes literales a tokens DS + clases NativeWind (consumir `@eva/brand-kit`/tokens `surface-inverse`, `on-dark`, `sport-*`). Dep: consolidación de theming (dominio DS).
- **A2 [VISUAL] M** — Re-skin del `BlockCard`/tarjeta de ejercicio a la forma de `SingleExerciseCard` web (dots de progreso de serie, chip sobrecarga, layout de prescripción, cue de técnica) SIN agregar aún sustitución/stepper. Dep: A1.
- **A3 [VISUAL] S** — Header de ejecución: agregar línea "Ejercicio X de Y · volumen · tiempo transcurrido" y barra de progreso al estilo DS (sin el toggle stepper todavía). Dep: A1.
- **A4 [VISUAL] M** — Actualizar cápsula flotante `AlumnoMobileChrome` a 1:1 web (píldora deslizante animada, hide-on-scroll, glifos DS, quitar `Inter` legacy). Transversal con dominio chrome/DS.
- **A5 [VISUAL] S** — Home: refrescar StreakRibbon (hitos + count-up + barra), Hero (ProgressRing + barras por-ejercicio), Momentum a paridad visual final. Dep: primitivas DS.

### OLA B — Funcional de ejecución (el grueso)

- **B0 [SEAM] L** — Extraer `packages/@eva/workout-engine` con la lógica pura de ejecución (typed-keypad, session-logs.optimistic/reconcile, session-summary, workout-stepper, workout-block-grouping, workout-areas, workout-exercise-type, workout-interval, muscle-map, body-anatomy, rest-timer-preferences, keypad-logic) + shim de re-export en web. Verificar pureza primero. **Bloquea B1-B8.**
- **B1 [FUNCIONAL] M** — Keypad numérico custom RN (`NumericKeypadSheet` nativo con @gorhom/bottom-sheet) + flujo peso→reps→(RPE/RIR) consumiendo `typed-keypad`/`keypad-logic`. Reemplaza los 4 TextInput crudos. Dep: B0.
- **B2 [FUNCIONAL] M** — `EffortScale`/`ScaleDots` RN (selector visual RPE/RIR) + chips de incremento de peso. Dep: B1.
- **B3 [FUNCIONAL] L** — Resiliencia sesión (draft/snapshot local del set en curso + recuperación al reentrar + cap 4h + tracking de duración) consumiendo `session-logs.optimistic/reconcile`. **P0 correctness.** Dep: B0.
- **B4 [FUNCIONAL] L** — Modo Paso a paso (`StepperExecution` RN: pager con swipe via gesture-handler/reanimated, rail tappable, auto-avance) + toggle Lista/Pasos en header (device-scoped). Dep: B0, A3.
- **B5 [FUNCIONAL] M** — Sustitución de ejercicio (`SubstituteExerciseSheet` RN + consumir schema `packages/schemas/workout.ts` + columnas de sustitución en el log). Verificar GRANTs de columna para PostgREST. Dep: B0.
- **B6 [FUNCIONAL] L** — Timers polimórficos: `HoldTimer`, `IntervalTimer`, `Stopwatch` + `WorkoutTimerProvider` (un timer activo) + `WorkoutTimerSettingsPanel` (sonido/alarma) + RestTimer a modo protagonista + warmup rest. Dep: B0.
- **B7 [FUNCIONAL] XL** — Ejecución polimórfica cardio/mobility/roller: extender la query con campos tipados, `TypedTargetGrid` + `TypedBlockTimerButton` RN + tabla tipada, consumir `workout-exercise-type`/`workout-interval`. Dep: B0, B6.
- **B8 [FUNCIONAL] L** — HR zones (cardio): cablear entitlement `cardio` (mirror `ModuleKey` + gate) + `domain/cardio` + endpoint `/api/mobile/cardio/profile` + zonas FC en ejecución. Dep: gate de módulos (transversal), B7.
- **B9 [FUNCIONAL] M** — WorkoutSummary a paridad: detección de PR con guard anti-falso (sustituidos), mapa muscular anatómico (`MuscleMapSvg` en react-native-svg), conteo cardio/mobility/roller, next hint. Consumir `session-summary`/`muscle-map`. Dep: B0, B5, B7.
- **B10 [FUNCIONAL] M** — Share-cards v2 branded (PR/progreso/racha/resumen mensual) con canvas nativo (react-native-view-shot o Skia) consumiendo el diseño de `workout-pr-card-canvas`. Dep: B9.
- **B11 [FUNCIONAL] S** — Superseries robustas end-to-end consumiendo `workout-block-grouping` compartido (reemplaza `groupSupersets` local). Dep: B0.
- **B12 [FUNCIONAL] S** — Áreas custom en ejecución (`workout-areas` + fetch service-role/endpoint). Dep: B0.
- **B13 [FUNCIONAL] S** — Técnica video INLINE en modal (react-native-webview para YouTube, expo-av/Video para mp4) en vez de `Linking.openURL`. Dep: A2.
- **B14 [FUNCIONAL] S** — "Última vez" tap-to-autofill + "Supera tu marca" inline. Dep: A2.

### OLA C — Dashboard alumno funcional (delta post-audit)

- **C1 [FUNCIONAL] M** — Días pendientes de la semana en home (CTA "Recuperar Día X") consumiendo lógica de `weekPendingWorkouts` (extraer a package o port). Dep: -.
- **C2 [FUNCIONAL] S** — `WeightQuickLog` + `TrendArrow` en WeightWidget. Dep: -.
- **C3 [FUNCIONAL] S** — `PRDetailSheet` (progresión del lift on-demand). Dep: -.
- **C4 [FUNCIONAL] S** — `ProgramPhaseBar` + estados de plan (today/completed/pending/upcoming) a paridad. Dep: -.

---

## 5. RIESGOS

- **Técnico — tamaño**: la ejecución es un rewrite casi total (1 archivo monolítico patrón B → ~15 componentes + engine compartido). Es el trabajo más grande del proyecto; subestimarlo es el mayor riesgo de cronograma. B7 (polimórfico) es XL por sí solo.
- **Drift de lógica pura**: si NO se extrae `@eva/workout-engine` (B0) y en cambio se hace port manual (como ya pasó con `macro-calculator`/`profile-analytics`/`nutrition-utils`, ver `07-shared-seams.md` §C.1-C.3), cada fix futuro en web (progresión, keypad, summary) NO se propaga a mobile. B0 es prerequisito estratégico, no opcional.
- **Seguridad — gating de módulos**: construir cardio/HR-zones/áreas en mobile SIN replicar el gate server-side (`assertModule`) deja PostgREST directo expuesto a un alumno sin el módulo (`07-shared-seams.md` §C.4, nota de seguridad). El gate debe existir en RLS/RPC, no solo en UI.
- **Pérdida de datos (P0)**: hoy sin drafts/snapshot (B3), cerrar la app a mitad de set pierde el set en curso; y aunque los fixes S1/S2 (líneas 342-423) resolvieron duplicados/UTC, no hay recuperación de sesión a medias. Priorizar B3 alto.
- **Migración DB / GRANTs**: sustitución (B5) y campos tipados cardio (B7) exigen que las columnas tengan `GRANT` de columna para `authenticated` (gotcha CLAUDE.md — PostgREST 42501 en runtime). Verificar que las migraciones `e4fd7c32` y las de prescripción polimórfica ya incluyan los grants; mobile habla PostgREST directo.
- **Doble sistema de theming**: mientras coexistan objeto `theme` legacy + clases NativeWind, cada re-skin (Ola A) puede reintroducir hex hardcodeados. Riesgo de re-skin "a medias" si no se consolida el theming primero (dep transversal del dominio DS).
- **Divergencia estructural del tab `workout.tsx`**: no tiene análogo web directo (web entra por el hero del dashboard). Decidir si se mantiene como "lista de días del programa" (útil) o se elimina por paridad — no forzar 1:1 donde la web no lo tiene.
- **Progresión ya portada**: `computeEffectiveTarget`/`progression.ts` en mobile podría divergir de web silenciosamente (es port, no import). Validar fórmula en B0/B11.
