# Rework visual — Pantalla de ejecución del entrenamiento (alumno)

> **Alcance EXCLUSIVO:** el momento en que el alumno *hace* su rutina del día.
> Archivos: `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` (1.479 líneas), `LogSetForm.tsx` (597), `RestTimer.tsx`, `WorkoutSummaryOverlay.tsx`, `WorkoutTimerProvider.tsx`, timers (`HoldTimer`/`IntervalTimer`/`Stopwatch`).
> **Este documento es sólo diseño.** No toca motor de logging, cola offline ni superseries. El CEO aprueba antes de ejecutar.
> Hermanos (contexto, no solapan): `INFORME.md`, `estructura-desorden.md`, `research-mejoras.md` cubren navegación/records/retención del alumno en general. Este mini-plan es el **rework de la sola pantalla de ejecución**.

---

## Parte 1 — Auditoría: por qué se siente "desordenada" (el CEO tiene razón)

Leí el render entero. El desorden no es estético suelto: es **densidad + redundancia + falta de foco**. Nueve causas concretas, con anclas de código.

### 1.1 No existe modelo de foco — todo el plan se renderiza expandido a la vez
`WorkoutExecutionClient` mapea `sectioned → groups → blocks` y **cada ejercicio muestra TODO simultáneamente**: grid de objetivo completo + las N filas de series abiertas + banners (`WorkoutExecutionClient.tsx:1064-1309`). El alumno ve un muro vertical donde el ejercicio 1 y el ejercicio 7 pesan visualmente igual. No hay "esto es lo que toca AHORA". El único gesto de foco es el auto-scroll post-log (`handleLogged`, :892-934) y el dim del bloque completo (`animate={{ opacity: complete ? 0.6 : 1 }}` :1102). Es poco: el resto compite a brillo pleno.

### 1.2 Demasiadas zonas compitiendo por card (8-12 bloques visuales por ejercicio)
Contando lo que ve el alumno en UNA card de fuerza:
1. Chip de tipo coloreado (Fuerza/Cardio…) `:1114`
2. Chip de superserie `:1118`
3. Nombre gigante 22px black `:1126`
4. Pill de grupo muscular `:1128`
5. "Ver técnica" (link) `:1133`
6. Botón play flotante 48px `:1150`
7. Grid de objetivo: **5 tiles** (SERIES X REPS / PESO+base / DESCANSO / TEMPO / RIR) `:1162-1185`
8. Banner de sobrecarga (verde, **frase completa**) `:1196-1230`
9. Banner de instrucciones `:1231`
10. Banner de nota del coach `:1240`
11. Pill "Sesión anterior" + "Superá tu marca" `:1249-1271`
12. Tabla: header + N filas de inputs, cada una con slider RIR colapsable `:1272-1303`

Doce decisiones visuales por ejercicio, ×7 ejercicios = ruido. La regla de UX 2025 es la contraria: **"distraction-free workout screen — no pop-ups, no clutter"** y *"recording a set takes 3-5 taps, not navigating multiple screens"* ([Setgraph](https://setgraph.app/ai-blog/simple-workout-app-guide), [Stormotion](https://stormotion.io/blog/fitness-app-ux/)).

### 1.3 Sopa de colores de acento — sin jerarquía de "qué importa ahora"
Conviven en pantalla, cada uno con su card tintada: `--sport-500` (chip/nombre/progreso), `--ember-500` (cardio/descanso/zona FC), **emerald** (sobrecarga), `--theme-primary` (instrucciones/notas/superserie), **amber** (PR). Cinco familias de acento apiladas. El ojo no sabe dónde caer. La guía de diseño fitness dice usar color **funcionalmente**: acción vs progreso, no decorar ([Stormotion](https://stormotion.io/blog/fitness-app-ux/)).

### 1.4 Redundancia dura (el objetivo se dice 2-3 veces)
- Tile **SERIES X REPS** (`:1165`) ≡ las filas de la tabla abajo (`:1284`).
- Tile **PESO** (`:1168`) ≡ el input de peso ya pre-llenado con `suggestedWeightKg` (`LogSetForm.tsx:208`).
- Tile **DESCANSO** (`:1182`) ≡ botón "Descanso (90s)" del footer (`:1319`) ≡ engranaje de ajustes de descanso (`:978`).
El tile-grid es "ficha del ejercicio" pegada encima de la "tabla de registro". Dos objetos que dicen lo mismo.

### 1.5 Dos escalas de esfuerzo por serie (RPE **y** RIR)
Cada fila de fuerza tiene columna **RPE 6-10 inline** (`LogSetForm.tsx:227-240`) **y** un **slider RIR 0-5 colapsable** post-log (`:279-304`). Miden lo mismo de forma inversa. Para el alumno es confusión, no precisión. (Alpha Progression y Boostcamp exponen **una** por set — RIR *o* RPE — no ambas: [Alpha](https://www.hotelgyms.com/blog/alpha-progression-the-gym-logger-app-from-germany), [Boostcamp](https://www.boostcamp.app/best/rpe-rir)).

### 1.6 Inputs diminutos, patrón "planilla"
La fila es un grid `[auto_3.5rem_3.5rem_3rem_auto]`, inputs `h-9` en desktop (`LogSetForm.tsx:190,210`). Es una hoja de cálculo. El consenso 2025 es **objetivos grandes, tocar y seguir**: *"the single most important UX metric… you are between sets, sweating, and want to tap and move on"* ([Setgraph](https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters)); Strive vende su **teclado numérico custom** justo para esto ([Strive](https://strive-workout.com/2026/05/18/best-gym-tracker-app-2/)).

### 1.7 Señal de progreso débil
Barra de 1.5px + "1/6 series" + cronómetro + % (`:989-1007`). No dice **"ejercicio 2 de 7"** ni **"qué sigue"**. Steady resolvió esto marcando la serie activa dentro de un indicador de progreso ([Steady](https://apps.apple.com/us/app/steady-gym-log-planner/id6739453412)).

### 1.8 El descanso es una pastilla discreta que compite con el header
`RestTimer` es un pill flotante arriba-derecha / arriba full-width en móvil (`RestTimer.tsx:229`). El descanso es EL momento entre series — Strong/Setgraph lo tratan como protagonista (notificación accionable, **Live Activity en lock screen / Apple Watch**, *"keeps your phone in your pocket"*) ([Setgraph](https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters)). Acá es casi un adorno.

### 1.9 Banner de sobrecarga verboso a mitad de sesión
El cartel emerald arma **oraciones completas** ("Sobrecarga progresiva · Semana 3: objetivo 82 kg (base 80 +2)…", `:1200-1227`). Es carga de lectura justo cuando el alumno quiere números, no párrafos.

**Diagnóstico en una frase:** *la pantalla muestra la "ficha completa de cada ejercicio" (para estudiar) cuando el alumno necesita un "tablero de la serie de ahora" (para ejecutar).* Todo está presente y todo grita al mismo volumen.

---

## Parte 2 — Research: cómo lo resuelven las mejores apps HOY (2025-2026)

12 consultas frescas. Patrones (no features de AI — regla del CEO):

| # | Patrón | Evidencia | Fuente |
|---|--------|-----------|--------|
| R1 | **Tocar el check completa la serie y dispara el descanso**; input rápido, 1-2 taps | Hevy: *"tap the checkmark next to each set to mark it complete and trigger the rest timer"*; Strong benchmarkeado como el logging más rápido | [Hevy](https://www.hevyapp.com/features/) · [Setgraph Hevy-vs-Strong](https://setgraph.app/ai-blog/hevy-vs-strong) |
| R2 | **"La vez anterior" pre-llenada e inline** como ancla de progresión | *"previous performance on the left of each exercise… push hard to do better"*; Boostcamp muestra *"your last logged weight"* en la fila | [Hevy](https://www.hevyapp.com/) · [Boostcamp](https://www.boostcamp.app/workout-tracker) |
| R3 | **Descanso protagonista**: auto-start + notificación accionable + Live Activity / lock screen | *"start the timer, get a notification… log your next set directly from the notification"*; Live Activity en iOS/Watch | [Setgraph](https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters) |
| R4 | **Velocidad = la métrica**: <30s por set, sin navegar pantallas | *"if it takes more than 30 seconds to log a set, the app is too slow"*; friction = *"five screens to log your numbers"* | [Setgraph](https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters) |
| R5 | **Teclado numérico custom** para peso/reps, objetivos siempre visibles | Strive: *"custom keyboard… targets stay visible, logging a set does not take three extra taps"* | [Strive](https://strive-workout.com/2026/05/18/best-gym-tracker-app-2/) |
| R6 | **UNA escala de esfuerzo por set** (RIR o RPE), como input de intensidad central | Alpha Progression usa RIR; Boostcamp permite RPE 5-10 **o** RIR en cualquier set | [Alpha](https://www.hotelgyms.com/blog/alpha-progression-the-gym-logger-app-from-germany) · [Boostcamp](https://www.boostcamp.app/best/rpe-rir) |
| R7 | **Pantalla de foco / distraction-free**: sin nav, sin clutter, "flow state"; 3-5 taps por set | *"distraction-free workout screen – no pop-ups, no nav bar, no clutter"* | [Setgraph](https://setgraph.app/ai-blog/simple-workout-app-guide) · [Zfort](https://www.zfort.com/blog/How-to-Design-a-Fitness-App-UX-UI-Best-Practices-for-Engagement-and-Retention) |
| R8 | **Serie activa resaltada** dentro del indicador de progreso | Steady: *"progress indicator highlights the currently active set"* | [Steady](https://apps.apple.com/us/app/steady-gym-log-planner/id6739453412) |
| R9 | **Micro-celebración graduada + haptics** al completar; grande solo en hitos | *"haptic tap when completing a set boosts dopamine, +30% engagement"*; *"animations grow more complex as achievements get bigger… reserve for meaningful moments"*; duración ideal **200-500ms** | [Stormotion](https://stormotion.io/blog/fitness-app-ux/) · [Bricxlabs](https://bricxlabs.com/blogs/micro-interactions-2025-examples) |
| R10 | **Stepper "una tarjeta a la vez"** con swipe/deslizar a la próxima jugada | Peloton Strength+: *"slide up the screen to move on to the next move… improved keypad"* | [PeloBuddy](https://www.pelobuddy.com/strength-plus-available-cost/) · [Yahoo](https://www.yahoo.com/lifestyle/tried-peloton-strength-app-customization-100000114.html) |
| R11 | **Descanso diferenciado warmup vs working set** (lo piden intermedios/avanzados) | Strong lo tiene, Hevy no → *"consistently mentioned as a frustration"* | [Setgraph Hevy-vs-Strong](https://setgraph.app/ai-blog/hevy-vs-strong) |
| R12 | **Plate calculator** como micro-feature de alto valor (reduce carga mental) | *"plate calculators emerge as valued micro-features reducing mental load"* | [Setgraph](https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters) · [Boostcamp](https://www.boostcamp.app/workout-tracker) |

**Convergencia:** todas apuntan a **menos por pantalla, la serie de ahora grande, el resto tenue, el check dispara todo, el descanso manda, y una celebración chica bien puesta.** EVA ya tiene los ladrillos (framer-motion, confetti, haptics, wake lock, media session) — falta **ordenarlos por jerarquía**.

---

## Parte 3 — El mini-plan de rework

### 3.1 Concepto visual — 3 principios rectores

**P-A · "Una tarjeta manda" (foco por jerarquía, sin romper el scroll único).**
El ejercicio/ronda activa es el protagonista: brillante, elevado, con la fila de serie activa grande. Lo hecho se **colapsa a un recap delgado** (dim). Lo que viene queda en **peek silencioso**. Seguimos en un solo scroll (se puede volver atrás; la superserie intercalada intacta) — pero el peso visual lo hace la jerarquía, no la posición. (R7, R8, R10)

**P-B · "Una decisión por momento" (matar redundancia).**
El grid de 5 tiles colapsa a **una línea de prescripción** (`4×10 · 80 kg · desc 90s`) + **chip compacto** de sobrecarga. **Una sola** escala de esfuerzo por serie. Instrucciones/nota del coach detrás de un tap ("Detalles"). Inputs grandes. La serie activa muestra: KG · REPS · esfuerzo · check grande. (R1, R2, R4, R6)

**P-C · "Celebrar el avance, con calma y sin culpa" (dark-inmersivo intacto).**
Micro-animación satisfactoria al cerrar serie (morph del check + haptic + settle de la fila + tick del anillo de progreso), floreo al cerrar ejercicio, pulso dorado inline si es PR. Todo 200-500ms, respeta `useReducedMotion`. El fondo sigue `--ink-950` on-dark, **NO theme-aware**. (R9)

### 3.2 Wireframe propuesto — card de fuerza (estado: serie 3 activa)

```
┌───────────────────────────────────────────────────────────┐
│ ● Fuerza · Glúteos                              ⓘ  ▶ técnica│  ← 1 fila silenciosa (tipo·músculo + acciones)
│                                                             │
│ HIP THRUST                                    ●●○○  2/4     │  ← nombre + dots de progreso de series
│ ─────────────────────────────────────────────────────────  │
│ 4 × 10   ·   80 kg   ·   desc 90s          ↑ +2.5 kg/sem   │  ← LÍNEA de prescripción + chip sobrecarga
│ Última vez: 77.5 kg × 10                                    │  ← "la vez anterior" inline (muted)   (R2)
│                                                             │
│  ╔═══ SERIE 3 ══════════════════════════════════ activa ══╗│  ← fila ACTIVA = protagonista (grande)
│  ║   KG               REPS             ESFUERZO            ║│
│  ║  ┌──────┐    ×    ┌──────┐     RPE ● ● ● ○ ○  ‹8›       ║│  ← inputs grandes + RPE segmentado (R6)
│  ║  │  80  │         │  10  │                             ║│
│  ║  └──────┘         └──────┘          ┌──────────────┐   ║│
│  ║                                     │   ✓  Listo    │   ║│  ← check grande = completa + descanso (R1)
│  ╚══════════════════════════════════════════════════════╝│
│                                                             │
│  Hechas:  1 · 80×10 · RPE8      2 · 80×10 · RPE8            │  ← series cerradas = chips recap delgados
└───────────────────────────────────────────────────────────┘

  ↓ (los ejercicios que siguen, en peek tenue, colapsados)
  ▫ Sentadilla búlgara      4×8        (siguiente)
  ▫ Peso muerto rumano      3×12
```

**Superserie** — se conserva el intercalado honesto A1→B1→A2 (`SupersetGroupCard`): la **ronda activa** se resalta (mismo tratamiento de fila activa), las rondas hechas colapsan a recap, la guía "Sigue con B1" (`nextCue`) se mantiene pero como cue inline sobre la fila activa, no como fila extra. La caja "Cómo hacerla" pasa a **una línea** ("Rondas: A→B sin descanso, descansá al cerrar") + tap para el detalle.

### 3.3 Orden de información propuesto (arriba → abajo, por ejercicio)

1. **Tipo · músculo** + acciones (Detalles ⓘ, Ver técnica ▶) — una fila silenciosa
2. **Nombre** + **dots de progreso** de las series del ejercicio
3. **Línea de prescripción** (`sets×reps · peso · descanso`) + **chip** de sobrecarga
4. **"La vez anterior"** inline (muted) + micro-reto "superá la marca" si aplica
5. **Serie activa** (protagonista): KG · REPS · esfuerzo · check grande
6. **Recap** de series hechas (chips delgados)
7. *(detrás de tap "Detalles")* instrucciones · nota del coach · historial completo

Elimina: el grid de 5 tiles, el banner verde verboso, el botón play flotante redundante (la acción técnica vive en la fila 1), el "N bloque(s)" del header.

### 3.4 Animaciones concretas (framer-motion — ya instalado; springs en `lib/animation-presets.ts`)

Presets disponibles: `springs.snappy {400/30}`, `springs.smooth {200/25}`, `springs.elastic {500/25}`, `springsSheet.enter {320/34}`, `staggerContainer`, `fadeSlideUp`, `scaleIn`.

| Momento | Animación | Con qué |
|---|---|---|
| **Cerrar serie** | check `scale 0→1` + la fila activa hace *settle* a chip-recap (colapsa alto/opacidad) y aparece la próxima fila activa | `springs.elastic` (check) + `layout` + `AnimatePresence` (`springs.smooth`); haptic `navigator.vibrate(50)` **ya existe** (`LogSetForm.tsx:123`) |
| **Tick de progreso** | barra/anillo del header incrementa con pulso corto de glow | width con `springs.smooth` (**ya existe** `:990-996`) + `scale 1→1.04→1` 200ms sobre el % |
| **Card pasa a activa** | la card entrante sube a foco (`opacity .6→1`, sombra/borde `--sport-500`), la saliente colapsa a recap | `layout` + `springs.smooth`; el dim de completo **ya existe** (`:1102`) |
| **Cerrar ejercicio** | `CheckCircle2` elástico (**ya existe** `:1143`) + barrido sutil del borde de la card + toast breve | `springs.elastic` + `scaleIn` |
| **PR inline** | si `peso ≥ máximo histórico`, la pill "anterior"/fila pulsa dorado antes del overlay final | `scaleIn` + glow amber, 300ms; overlay final (confetti) **intacto** |
| **RPE segmentado** | los dots se llenan con spring al tocar (reemplaza el slider) | `springs.snappy` |
| **Descanso (M)** | sube como barra/sheet inferior con anillo grande; a 0 pulsa ember | `springsSheet.enter`; anillo SVG **ya existe** en `RestTimer.tsx:271-297` |
| **Peek de "lo que sigue"** | los ejercicios colapsados entran con stagger tenue al hacer scroll | `staggerContainer(0.06)` + `fadeSlideUp` |

Todo con guardas `useReducedMotion` (patrón ya presente en todo el archivo).

### 3.5 Intocable (NO se toca en este rework)

- **Motor de logging:** `LogSetForm` (`useActionState` + `useOptimistic` + `useFormStatus`) y `logSetAction`. Identidad `block_id + set_number` intacta. Es **reskin visual**, el contrato de submit no cambia.
- **Cola offline:** `enqueueWorkoutLog`, guard `!navigator.onLine`, banner offline (`:1011`), toasts "sin conexión". No se toca.
- **Superseries intercaladas por rondas** (A1→B1→A2), disparo de descanso del grupo en `closesRound()`, `nextCue`/`findNextIncompleteInRounds`, auto-scroll. Se conserva la lógica; sólo cambia el resalte visual de la ronda activa.
- **Nombres y escalas RPE/RIR** (RPE 6-10, RIR 0-5): vocabulario del dominio del CEO. Se reduce a **una** escala *surfaceada* por serie de fuerza, pero los nombres y rangos no se inventan de nuevo.
- **Dark-inmersivo, NO theme-aware:** `bg-[var(--ink-950)]`, `text-on-dark`. Decisión firme. El acento sport/ember se mantiene; sólo se **jerarquiza**.
- **Motor de sobrecarga:** `computeEffectiveTarget` + `suggestedWeightKg` pre-llenando el input. Sólo cambia la presentación (chip vs banner).
- **Timers e infra:** cronómetro de sesión, wake lock, Media Session, alarma/sonidos, `WorkoutTimerProvider` (un timer activo, reemplazo suave).
- **Overlay de resumen:** detección de PR, confetti, share con marca del coach. Intacto (es el "después").

### 3.6 Fases de implementación

**Fase S — reskin de bajo riesgo (esta rama, sin tocar motor).** Impacto/costo altísimo.
1. Colapsar grid de 5 tiles → **una línea de prescripción** + chip de sobrecarga (mata redundancia 1.4 y verbosidad 1.9).
2. **Una escala de esfuerzo por serie de fuerza** (recomiendo RPE segmentado inline; RIR queda opcional/ajustes o sólo no-fuerza). *Decisión del CEO.*
3. Inputs de la serie activa **grandes** + botón "✓ Listo" claro; series hechas → **chips recap**.
4. Instrucciones/nota/​historial detrás de **"Detalles"** (disclosure).
5. **Dots de progreso** por ejercicio + header muestra **"Ejercicio 2 de 7"** (fuera "N bloque(s)").
6. Pulso en el tick de la barra de progreso.

**Fase M — foco + celebración (post-merge).**
7. **Modelo de foco:** card activa elevada, hechas colapsadas a recap, siguientes en peek (`layout` + `AnimatePresence`). El auto-scroll ya existe.
8. **Descanso promovido** a barra/sheet inferior con anillo grande (conserva alarma/media session). Considerar descanso warmup vs working (R11).
9. **Settle** al cerrar serie + micro-celebración graduada + **pulso PR inline**.
10. RPE **segmentado** (dots) reemplaza el slider.

**Fase L — flujo de foco pleno + paridad RN.**
11. **Modo stepper opt-in** "un ejercicio a la vez" con swipe/siguiente (patrón Hevy/Boostcamp/Peloton), **mismo `LogSetForm`** por debajo. (R10)
12. **Teclado numérico custom** peso/reps (patrón Strive/Strong), objetivos siempre visibles. (R5)
13. **Live Activity / lock-screen** del descanso en la app RN. (R3)
14. **Plate calculator** como micro-feature. (R12)

---

## Decisiones que necesito del CEO antes de ejecutar

1. **Esfuerzo (1.5 / R6):** ¿colapsamos a **una** escala por serie de fuerza? Recomiendo **RPE segmentado inline** y dejar RIR opcional. ¿OK, o preferís mantener ambas?
2. **Foco (P-A):** ¿aprobás colapsar lo hecho a recap y poner lo que viene en peek, manteniendo scroll único? (vs. saltar a stepper pleno recién en Fase L).
3. **Alcance de la Fase S ya:** ¿entra completa 1-6 en esta rama de rediseño?
4. **Descanso (Fase M/8):** ¿lo promovemos a barra inferior protagonista? Cambia bastante la sensación entre series.
