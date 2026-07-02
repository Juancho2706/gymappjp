# Research — Mejor experiencia del ALUMNO durante el entrenamiento (en el gym)

**Fecha:** 2026-07-02 · **Autor:** subagente investigador de producto EVA
**Foco:** el momento de EJECUTAR la rutina (loggear series, descansar, técnica, cierre de sesión).
**Regla dura:** CERO features de AI (no re-proponer nada con IA).
**Método:** 16 búsquedas web frescas (2025-2026) + lectura del código real de EVA (`apps/web/src/app/c/[coach_slug]/workout/[planId]/`).

---

## 0. Qué ya tiene EVA (verificado en código — NO re-proponer)

Leído directo del árbol `workout/[planId]/`:

- **`RestTimer.tsx`** — ya tiene: anillo SVG de cuenta regresiva (`<circle stroke-dash…>`), `navigator.vibrate([...])` al terminar, **Wake Lock mientras descansa**, y **`Notification` con `showNotification` si la app está en background** (el "notificación si está en background" ya existe). Alarma sonora con estado `isAlarmRinging`.
- **`IntervalTimer.tsx`** — Wake Lock con toggle visible + re-adquisición en `visibilitychange`.
- **`LogSetForm.tsx`** — inputs numéricos nativos (`inputMode=decimal/numeric`), RPE inline (6-10), RIR en panel colapsable, `vibrate(50)` en acciones, `suggestedWeightKg` pre-llena SOLO el peso via `defaultValue` (progresión).
- **`WorkoutSummaryOverlay.tsx`** — confetti, PRs detectados (Epley 1RM), volumen total, volumen por grupo muscular, `navigator.share` con marca del coach.
- Timers: rest / interval / hold / stopwatch. Bloques polimórficos. Superseries. Video/GIF de técnica. Cola offline. RPE+RIR.

**Conclusión del gap-scan:** EVA está fuerte en descanso/celebración/offline, pero **flojo en input de datos (steppers/plate/autofill 1-tap), en confianza (undo/nota/editar), en casos molestos (sustituir/reordenar/parcial), y tiene dos bugs latentes**: (a) el `vibrate()` **no hace nada en iOS Safari**, (b) el keep-awake **NO cubre la serie**, solo el descanso → la pantalla se apaga a mitad de set.

---

## 1. Hallazgos por ángulo (con evidencia)

### A. Input de datos en el gym

- **Tap en el valor anterior para autollenar (1-tap).** Hevy muestra una columna `PREVIOUS` y **al tocarla copia peso+reps al set actual** ("tap on a previous value to instantly add it"). EVA hoy muestra "última vez" pero no es tocable para llenar ambos campos.
  Fuente: https://help.hevyapp.com/hc/en-us/articles/36011896355479-How-to-Use-Previous-Workout-Values-to-Improve-Performance-in-Hevy
- **Steppers grandes ± con incremento inteligente (hold = incrementos mayores).** BarbellMath: "press and hold the plus or minus buttons… the longer you hold, the larger the increments". Barbell Plate Calculator: "plus/minus buttons to change quantity on the fly".
  Fuentes: https://github.com/vinibaggio/barbellmath · https://apps.apple.com/us/app/barbell-plate-calculator/id1468808885
- **Plate calculator (qué discos cargar).** Estándar en Hevy/Strong/BarIsLoaded; "the fastest plate calculator… no guesswork", KG/LB, inventario custom, incrementos por barra.
  Fuentes: https://www.hevyapp.com/features/weight-plate-calculator/ · https://barisloadedapp.com/
- **Warm-up calculator por % del top set (mecánico).** Hevy default 40%×5 / 60%×5 / 80%×3, ajustable, con redondeo a incrementos de disco/mancuerna. (EVA ya lo tiene PLANEADO — reforzar, no re-inventar.)
  Fuente: https://www.hevyapp.com/features/warm-up-set-calculator/
- **Companion en muñeca (Apple Watch / Wear OS).** Hevy/Strong/Jefit/Setgraph loggean sets **standalone desde el reloj** con sync offline; Hevy muestra pesos previos y rest timer con haptic en el Watch, y tiene **Wear OS + plate calculator en el reloj**. Relevante para el futuro RN.
  Fuentes: https://www.jefit.com/wp/guide/best-apps-to-log-sets-and-reps-on-smartwatch-in-2026-top-7-tested/ · https://www.findyouredge.app/news/best-strength-training-apps-apple-watch-2026

### B. Descanso — estado del arte

- **Live Activity / Dynamic Island / lock-screen.** Hevy y Setgraph muestran el rest timer en la pantalla de bloqueo y Dynamic Island; se puede **marcar el set completo, ±15s y skip SIN abrir la app**; al llegar a 0 notifica. (PWA **no puede** Live Activity → esto es feature RN.)
  Fuentes: https://www.hevyapp.com/features/live-activity/ · https://setgraph.app/ai-blog/hevy-vs-strong
- **±15s, skip, sonido/volumen configurable, por-ejercicio.** Hevy/Strong: rest distinto por movimiento (largo en pesado, corto en aislamiento), volumen y sonido ajustables. EVA ya tiene ring+notification+vibrate; falta **fullscreen inmersivo**, **audio 3-2-1 opt-in** y **auto-skip al empezar la siguiente serie**.
  Fuentes: https://help.hevyapp.com/hc/en-us/articles/35385404949143-Rest-Timer-Default-Rest-Timer-How-to-Add-Adjust-Volume-and-Sound · https://www.hevyapp.com/features/workout-rest-timer/

### C. Guía técnica en el momento

- **Metrónomo de tempo (p.ej. 3-1-2).** Tempo Coach / Lifting Tempo / StrengthTempo dan "audio, visual y haptic cues" por fase (excéntrica / iso abajo / concéntrica / iso arriba) con "3,2,1" antes del cambio y ticks gym-friendly. Un estudio 2025 respalda el tempo excéntrico lento para hipertrofia.
  Fuentes: https://apps.apple.com/us/app/strengthtempo-rep-timer/id6743028089 · https://mwm.ai/apps/lifting-tempo/6756082960 · https://www.acefitness.org/continuing-education/certified/april-2025/8843/repetition-tempo-and-muscular-development-what-s-the-connection/
- **Cue de técnica del coach por ejercicio (texto corto inline).** Diferenciador white-label: el coach escribe 1-2 líneas ("codos pegados", "no reboteís") visibles sin salir del set. (Video/GIF ya lo tienen.)

### D. Seguridad / confianza

- **Undo + editar set ya registrado sin fricción.** Estándar; EVA no tiene undo explícito. Setgraph/Strong permiten borrar por swipe y editar libre. Un undo con snackbar reduce el miedo a tocar el check.
  Fuente: https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026
- **Nota rápida por serie.** Setgraph: "add notes to record tempo, RPE, or **soreness** to inform the next session". Caso real "me dolió el hombro".
  Fuente: https://setgraph.app/ai-blog/app-to-track-my-workouts
- **RIR/RPE con explicación 1-tap.** "RPE 8 = 2 reps in reserve"; beginners deberían usar 3-5 RIR. Un tooltip evita que el alumno adivine. EVA ya pide RPE+RIR pero sin explicación.
  Fuentes: https://macrofactor.com/reps-in-reserve/ · https://fitbod.zendesk.com/hc/en-us/articles/360033133174-Reps-in-Reserve-RiR-Formerly-Exertion-Rating-RPE
- **Volumen de sesión EN VIVO.** Boostcamp/Setgraph exponen volumen (sets×reps×peso) y series completadas. EVA lo calcula solo al final; mostrarlo en vivo da sensación de progreso dentro de la sesión.
  Fuente: https://www.boostcamp.app/workout-tracker

### E. Fin de sesión (Hevy / Strong / Boostcamp / Setgraph / Fitbod)

- Boostcamp: PRs con **confetti + record badge** en el summary; trackea max weight/rep-range, max volumen/sesión, e1RM, lifetime bests; resumen semanal con volumen por músculo y **diagramas corporales que se iluminan por intensidad**; "Year-end Wrapped" compartible.
  Fuente: https://www.boostcamp.app/workout-tracker
- **Share-card pulida por workout.** Fitness Wrapped: notificación post-workout con "polished visual summary" + share directo. Hevy shareables: PRs, volumen, distribución muscular, comparaciones, Instagram stories. Fitbod: imagen + link al workout completo.
  Fuentes: https://fitnesswrapped.com/ · https://www.hevyapp.com/features/shareable/ · https://fitbod.zendesk.com/hc/en-us/articles/360006427453-Sharing-a-Workout-Gym-Profile-Settings
- **EVA ya tiene** volumen + PR + share brandeado; **le falta**: duración, **racha**, **comparación vs semana/sesión pasada**, y **mapa muscular** iluminado.

### F. Detalles sensoriales

- **BUG iOS: `navigator.vibrate()` NO existe en Safari.** "The Vibration API… with the exception of Safari… Safari on macOS and iOS never added it." → los `vibrate(50)` de EVA **no hacen nada en iPhone PWA** (la mayoría del público chileno usa iPhone o Safari). Workaround real (iOS 18+): elemento `<input type="checkbox" switch>` dispara haptic nativo; librería `use-haptic` lo encapsula (hay que **rutear el click por un `<label>`**, no clickear el input directo).
  Fuentes: https://caniuse.com/vibration · https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API · https://medium.com/@posaune0423/i-open-sourced-an-oss-library-for-arbitrary-haptic-feedback-in-ios-safari-5b8ca74a5f05
- **Keep-awake (Screen Wake Lock API).** Soporte >94% global (mayo 2026): Chrome 84+, Edge 84+, Firefox 126+, **Safari 16.4+**. Se libera solo al minimizar → hay que re-adquirir en `visibilitychange`. EVA lo usa en rest/interval pero **NO durante la serie** → gap.
  Fuentes: https://caniuse.com/wake-lock · https://developer.chrome.com/docs/capabilities/web-apis/wake-lock
- **Una-mano / thumb-zone.** 75% de las interacciones son con un pulgar; el tercio inferior + curva del lado dominante es la zona cómoda; el 40% superior es zona muerta; targets ≥44×44px, "one action per screen", targets grandes para uso en movimiento.
  Fuentes: https://www.uxmatters.com/mt/archives/2025/07/designing-a-fitness-platform-ux-design-challenges-and-solutions.php · https://parachutedesign.ca/blog/thumb-zone-ux/
- **Dark / alto contraste para gym.** Dark mode ahorra batería en OLED/AMOLED (true black), mejor en luz baja; contraste >4.5:1 mejora legibilidad "in various lighting conditions"; running apps usan alto contraste + tipografía bold para "quick glances in motion". EVA ya es dark-inmersivo; sumar boost de contraste/brillo y números grandes de un vistazo.
  Fuentes: https://altersquare.medium.com/dark-mode-vs-light-mode-the-complete-ux-guide-for-2025-5cbdaf4e5366 · https://blog.logrocket.com/ux-design/dark-mode-ui-design-best-practices-and-examples/

### G. Casos reales molestos

- **"Máquina ocupada" → sustituto por grupo muscular (MECÁNICO, no AI).** Gymverse: "switch exercises when a machine/equipment is not available… another exercise that works that muscle group". Sweat: swap con alternativas apropiadas. (Fitbod lo hace con AI — EVA lo haría con un **mapa estático ejercicio→grupo muscular**, sin IA.) Debe **no romper el registro** del bloque.
  Fuentes: https://apps.apple.com/us/app/gymverse-gym-workout-planner/id1048454034 · https://www.garagegymreviews.com/best-workout-apps
- **Reordenar / saltar ejercicios, agregar serie extra, terminar a medias sin culpa.** Hevy: "+ Add Set" ilimitado, swipe-left para borrar. Guardar sesión **parcial** sin fricción (los foros muestran cuánto molesta cuando el save/discard falla o culpabiliza).
  Fuentes: https://help.hevyapp.com/hc/en-us/articles/33882110558743-Workout-Settings-Preferences-Timer-Warm-up-calculator-Plate-Calculator-Smart-Superset-Scrolling

---

## 2. Ranking final (impacto / esfuerzo)

Leyenda: Esfuerzo **S/M/L** · Plataforma **web / RN / ambas** · Impacto **ALTO/MEDIO/BAJO**.

| # | Mejora | Esf. | Plat. | Impacto | Por qué gana |
|---|--------|------|-------|---------|--------------|
| 1 | **Keep-awake toda la sesión activa** (hoy la pantalla se apaga a mitad de serie; solo cubre el descanso) | S | ambas | ALTO | Bug real, fix chico, Wake Lock ya está en el código — solo elevar el scope al `WorkoutExecutionClient` + re-adquirir en `visibilitychange` |
| 2 | **Fix haptics iOS** (`navigator.vibrate` es no-op en Safari; truco `<input switch>` iOS 18+ vía `use-haptic`) | M | web | ALTO | Los haptics actuales están rotos para el grueso del público iPhone; sin esto el check/PR/timer no se sienten |
| 3 | **Tap "última vez 80×8" → autollena peso+reps (1-tap)** | S | ambas | ALTO | Menos taps mid-set; patrón probado de Hevy; EVA ya muestra el dato, falta hacerlo tocable |
| 4 | **Deshacer último set + editar serie registrada sin fricción** | S | ambas | ALTO | Quita el miedo a tocar el check; confianza = más logging |
| 5 | **Steppers grandes ± plate-aware** (hold = incrementos mayores; thumb-zone; sin teclado del sistema) | M | ambas | ALTO | Input actual = inputs numéricos crudos; steppers grandes son lo mejor para manos sudadas/una mano |
| 6 | **Resumen post-workout enriquecido** (+duración +racha +comparación vs semana pasada +mapa muscular) | M | ambas | ALTO | EVA ya tiene volumen+PR+share; sumar racha/comparación/heatmap es el enganche de Boostcamp/Hevy |
| 7 | **Sustituir ejercicio "máquina ocupada" → alternativa mismo grupo muscular (mecánico, no-AI)** sin romper el registro | L | ambas | ALTO | Caso #1 de fricción en gym lleno; diferenciador; mapa estático ejercicio→músculo, sin IA |
| 8 | **Volumen/series de la sesión EN VIVO** (kg acumulados, sets hechos, % de la sesión) | S | ambas | MEDIO | Sensación de progreso dentro de la sesión; el motor de volumen ya existe (se usa al final) |
| 9 | **Nota rápida por serie** ("me dolió el hombro") | S | ambas | MEDIO | Seguridad + señal para el coach; barato; Setgraph lo destaca |
| 10 | **Explicación RIR/RPE 1-tap** (RPE 8 = 2 en reserva; beginner 3-5 RIR) | S | ambas | MEDIO | EVA ya pide RPE+RIR sin explicar; tooltip mejora la calidad del dato |
| 11 | **Cue de técnica del coach por ejercicio** (texto corto inline, sin salir del set) | S | ambas | MEDIO | Diferenciador white-label barato; la voz del coach en el momento exacto |
| 12 | **Repetir serie anterior 1-tap + prefill greyed del objetivo prescrito** (placeholder editable, no defaultValue) | S | ambas | MEDIO | Complementa #3; menos fricción en series repetidas y en la progresión prescrita |
| 13 | **Plate calculator inline** (qué discos cargar por barra, KG, inventario) | M | ambas | MEDIO | Estándar Hevy/Strong; útil en barra; puede vivir detrás del stepper |
| 14 | **Rest timer fullscreen + audio 3-2-1 opt-in + auto-skip al iniciar la siguiente serie** | M | ambas | MEDIO | EVA ya tiene ring+notification; falta modo inmersivo, sonido configurable y auto-skip |
| 15 | **Reordenar/saltar ejercicios + agregar serie extra + terminar a medias sin culpa** (guardar parcial) | M | ambas | MEDIO | Flexibilidad real del gym; guardar parcial sin culpabilizar |
| 16 | **Metrónomo de tempo (3-1-2)** con cue audio/visual/haptic por fase | M | ambas | MEDIO | Guía técnica mecánica; respaldo científico 2025 para tempo excéntrico |
| 17 | **Live Activity / Dynamic Island / lock-screen rest timer** (marcar set + ±15s + skip sin abrir) | L | RN | ALTO | Killer feature de Hevy/Setgraph; PWA no puede → apalanca la app RN |
| 18 | **Sonidos opt-in configurables + modo una-mano (acción primaria en thumb-zone) + boost contraste/brillo gym** | M | ambas | MEDIO | Pulido sensorial/ergonómico; una-mano y alto contraste para gym oscuro o con luz dura |

**Quick-wins primero (S + ALTO/MEDIO):** #1, #3, #4, #8, #9, #10, #11, #12 — casi todo se apoya en código o datos que EVA ya tiene.
**Apuestas de impacto (M/L + ALTO):** #2 (haptics iOS), #5 (steppers), #6 (summary), #7 (sustitución), #17 (Live Activity RN).

---

## 3. Notas de implementación (para quien ejecute)

- **#1 Keep-awake:** subir el patrón de `RestTimer.tsx`/`IntervalTimer.tsx` a `WorkoutExecutionClient.tsx` — adquirir al iniciar la sesión, liberar al terminar/descartar, re-adquirir en `visibilitychange`. Fail-open (si no hay API, el timer sigue).
- **#2 Haptics iOS:** abstraer un helper `haptic(pattern)` que use `navigator.vibrate` donde exista y el truco `<input type="checkbox" switch>` ruteado por `<label>` en iOS 18+. Reemplazar los 4 call-sites de `vibrate()` (LogSetForm, RestTimer, HoldTimer, IntervalTimer).
- **#3/#12 Autofill:** `LogSetForm` hoy usa `defaultValue={existingLog?.weight_kg ?? suggestedWeightKg}` solo para peso — hacer el bloque "última vez" tocable (copia peso+reps+rpe) y pasar el objetivo prescrito como `placeholder` greyed en vez de `defaultValue`.
- **#6 Summary:** `WorkoutSummaryOverlay.tsx` ya computa volumen/PR/músculo — sumar duración (ya hay stopwatch), racha (dato del alumno), y una fila "vs semana pasada". Mapa muscular = reutilizar `muscleGroupVolume` que ya calcula.
- **#7 Sustitución:** requiere un mapa estático `exercise_id → muscle_group / patrón` (ya existe `muscleGroup` en los logs del summary) para ofrecer alternativas del mismo grupo, sin tocar el registro del bloque (swap in-place preservando `block_id`).

---

## 4. Fuentes (todas 2025-2026)

- Hevy Live Activity: https://www.hevyapp.com/features/live-activity/
- Hevy Previous Values: https://help.hevyapp.com/hc/en-us/articles/36011896355479-How-to-Use-Previous-Workout-Values-to-Improve-Performance-in-Hevy
- Hevy Rest Timer / sonido: https://help.hevyapp.com/hc/en-us/articles/35385404949143-Rest-Timer-Default-Rest-Timer-How-to-Add-Adjust-Volume-and-Sound
- Hevy Warm-up calculator: https://www.hevyapp.com/features/warm-up-set-calculator/
- Hevy Plate calculator: https://www.hevyapp.com/features/weight-plate-calculator/
- Hevy Shareables: https://www.hevyapp.com/features/shareable/
- Setgraph Hevy vs Strong: https://setgraph.app/ai-blog/hevy-vs-strong · https://setgraph.app/ai-blog/hevy-vs-strong-app-comparison-2026
- Setgraph features (notes/RPE/volumen): https://setgraph.app/ai-blog/app-to-track-my-workouts
- Boostcamp workout tracker (PR/volumen/heatmap/Wrapped): https://www.boostcamp.app/workout-tracker
- Alpha Progression review: https://fitnessdrum.com/alpha-progression-app-review/
- BarbellMath (hold-to-increment): https://github.com/vinibaggio/barbellmath
- Bar Is Loaded: https://barisloadedapp.com/
- Barbell Plate Calculator: https://apps.apple.com/us/app/barbell-plate-calculator/id1468808885
- Wake Lock API (soporte 2026): https://caniuse.com/wake-lock · https://developer.chrome.com/docs/capabilities/web-apis/wake-lock
- Vibration API (no Safari): https://caniuse.com/vibration · https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API
- Haptics iOS Safari (checkbox switch): https://medium.com/@posaune0423/i-open-sourced-an-oss-library-for-arbitrary-haptic-feedback-in-ios-safari-5b8ca74a5f05
- Tempo apps: https://apps.apple.com/us/app/strengthtempo-rep-timer/id6743028089 · https://mwm.ai/apps/lifting-tempo/6756082960
- Tempo ciencia 2025 (ACE): https://www.acefitness.org/continuing-education/certified/april-2025/8843/repetition-tempo-and-muscular-development-what-s-the-connection/
- RIR/RPE explicación: https://macrofactor.com/reps-in-reserve/ · https://fitbod.zendesk.com/hc/en-us/articles/360033133174-Reps-in-Reserve-RiR-Formerly-Exertion-Rating-RPE
- Sustitución de ejercicios: https://apps.apple.com/us/app/gymverse-gym-workout-planner/id1048454034 · https://www.garagegymreviews.com/best-workout-apps
- One-hand / thumb-zone: https://www.uxmatters.com/mt/archives/2025/07/designing-a-fitness-platform-ux-design-challenges-and-solutions.php · https://parachutedesign.ca/blog/thumb-zone-ux/
- Dark mode / contraste gym: https://altersquare.medium.com/dark-mode-vs-light-mode-the-complete-ux-guide-for-2025-5cbdaf4e5366 · https://blog.logrocket.com/ux-design/dark-mode-ui-design-best-practices-and-examples/
- Share-card recap: https://fitnesswrapped.com/ · https://fitbod.zendesk.com/hc/en-us/articles/360006427453-Sharing-a-Workout-Gym-Profile-Settings
- Watch companion: https://www.jefit.com/wp/guide/best-apps-to-log-sets-and-reps-on-smartwatch-in-2026-top-7-tested/ · https://www.findyouredge.app/news/best-strength-training-apps-apple-watch-2026
