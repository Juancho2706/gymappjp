# Auditoría del ejecutor de entrenamiento — Web / PWA (`WorkoutExecutionClient`)

> Alcance: visor "qué toca hoy" del dashboard del alumno + pantalla de ejecución (registro de series, descansos, timers, resumen). Ruta: `apps/web/src/app/c/[coach_slug]/workout/[planId]/`. Solo lectura; ninguna edición de código.

## Resumen ejecutivo

- El ejecutor es UNA sola pantalla de scroll vertical con todos los ejercicios en cards apiladas, agrupadas por sección/área; existe un modo alterno "Paso a paso" (pager 1 ejercicio a la vez) opt-in por dispositivo (`WorkoutExecutionClient.tsx:1905-1947`). No hay interstitials fullscreen entre ejercicios.
- El componente principal tiene **2134 líneas** y concentra estado, efectos de resiliencia offline, superseries, sustitución, cronómetro de sesión, stepper y render. Es un monolito difícil de portar 1:1 a RN; la lógica pura ya vive en `@eva/workout-engine` (buena base para reuso).
- Hay **4 tipos de ejercicio** con experiencias diferenciadas: fuerza (kg×reps+RPE+RIR), cardio (min/metros/FC), movilidad (seg de hold) y roller (seg + pasadas). El motor de logging es único; sólo cambian los ejes de input y los headers (`LogSetForm.tsx:768-1142`).
- El registro por serie usa un **teclado numérico custom** propio (no el del SO) en pantallas táctiles, con chips de incremento de peso configurables y un paso opcional de esfuerzo (`NumericKeypadSheet.tsx`, `WorkoutKeypadProvider.tsx`).
- RPE y RIR se piden con una **escala segmentada 1-10 de dots**, ambos opcionales, sólo en fuerza (`EffortScale.tsx:52-99`, `LogSetForm.tsx:678-694`).
- Hay **4 timers distintos** montados por un provider de "un solo timer activo": descanso (RestTimer), hold (movilidad/roller), intervalos (cardio) y cronómetro count-up (`WorkoutTimerProvider.tsx:126-140`). Usan endTime-based para resistir throttling en background.
- Los timers ya explotan capacidades nativas: Wake Lock, Media Session API (controles en lock screen), Web Audio beeps, Vibration API y notificaciones locales del Service Worker (`RestTimer.tsx:113-176`, `269-290`).
- No hay integración con Apple Watch ni ninguna fuente de BPM en vivo: la FC de cardio se teclea a mano post-serie (`LogSetForm.tsx:1049-1057`); la "zona FC" sólo se muestra como objetivo estático (`WorkoutExecutionClient.tsx:287-294`).
- La gamificación existente es sobria: confetti + detección de PRs + share-card en el resumen final, más micro-celebraciones (check elástico, pulso dorado en PR inline) al cerrar cada serie/ejercicio (`WorkoutSummaryOverlay.tsx:243-254`, `LogSetForm.tsx:531-539`). No hay mascota, rachas, XP ni interstitials motivacionales.
- El multimedia (gif/video) NO está visible al centro de forma pasiva: se abre en un modal "Técnica" tras un tap (`WorkoutExecutionClient.tsx:2001-2113`). Contradice directamente la visión del CEO de media siempre visible sin tocar botones.
- Enorme inversión en **resiliencia offline**: write-through a cola local antes de la red, snapshot de sesión, drafts por serie, reconciliación server∪cola∪snapshot, ancla de cronómetro persistida, precache del SW (`LogSetForm.tsx:440-503`, `WorkoutExecutionClient.tsx:1080-1233`). Es el activo más valioso a preservar.
- El header sticky muestra progreso rico en vivo: barra %, "Ejercicio X de Y", series X/Y, volumen (kg×reps) y cronómetro de sesión (`WorkoutExecutionClient.tsx:1859-1894`).
- Feature de sustitución "máquina ocupada": swap in-place sólo por hoy con sugerencias del mismo músculo (`SubstituteExerciseSheet.tsx`), presente sólo en fuerza y antes del primer set.
- El diseño es dark-only forzado (`is-workout-page`, `--ink-950`), con tokens white-label (`--sport-500`, `--theme-primary`, `--ember-500`); la "vibra" ya no depende de mascota (compatible con la restricción white-label).
- Sobrecarga progresiva calculada server-side y mostrada como chip + prellenado del peso sugerido (`WorkoutExecutionClient.tsx:565-606`); doble progresión y linear semanal soportados.
- Puntos de fricción claros: densidad de "sopa de inputs" (kg, reps, RPE, RIR, nota por serie), multimedia escondido, ausencia total de BPM en vivo, y complejidad acoplada que dificulta el rediseño incremental.

## Hallazgos

### 1. Punto de entrada y flujo completo

El alumno llega desde el dashboard. `ActiveProgramSection.tsx` renderiza el programa activo con un carrusel de day-cards (`WorkoutPlanCard.tsx:31-89`): cada card muestra día de semana, título, y un estado visual (hoy=borde sport + icono Play; pendiente=ámbar + punto; hecho=check verde). Hay un CTA de "recuperar día pendiente" (`ActiveProgramSection.tsx:102-121`) y un link "Ver entreno de hoy" (`ActiveProgramSection.tsx:124-128`). La navegación es un simple `Link` a `/c/{slug}/workout/{planId}`.

`page.tsx` (server) resuelve datos con `getWorkoutExecutionData(planId)` y redirige a login/dashboard si falta usuario o plan (`page.tsx:13-38`).

Flujo paso a paso de la ejecución:

1. Montaje: se rehidrata desde `logs` del server + cola offline + snapshot local (`WorkoutExecutionClient.tsx:1088-1102`); se reconstruyen sustituciones activas (`:1056-1078`) y el ancla del cronómetro persistido (`:1192-1233`).
2. El alumno ve el header sticky (título, fase, semana A/B, barra de progreso) y las secciones de ejercicios (`:1918-1944`).
3. Por cada serie de fuerza abre el teclado custom (táctil) o teclea directo (desktop), ingresa kg y reps, opcionalmente RPE/RIR/nota, y toca "Listo" (`LogSetForm.tsx:590-698`).
4. Al guardar: write-through a cola, optimismo local, se dispara el descanso automático si aplica, y la fila colapsa a un chip recap (`LogSetForm.tsx:425-503`, `:506-574`).
5. Auto-scroll a la siguiente serie/bloque incompleto (`WorkoutExecutionClient.tsx:1408-1430`); el ejercicio completado colapsa a barra recap con un floreo (`:918-964`).
6. Los timers aparecen como sheets inferiores/superiores según el tipo (`WorkoutTimerProvider.tsx:126-140`).
7. Al tocar "Finalizar entrenamiento" (barra fija inferior, `:1949-1960`) se flushea la cola, se congela la duración y se abre el overlay de resumen con confetti/PRs (`:1502-1571`, `WorkoutSummaryOverlay.tsx`).
8. "Volver al inicio" navega al dashboard (`WorkoutSummaryOverlay.tsx:517-524`).

### 2. Datos mostrados al alumno (por pantalla/estado)

| Zona | Dato mostrado | Ancla |
|---|---|---|
| Header sticky | Título del plan, semana A/B, fase del programa, "Día X de Y" | `:1804-1818` |
| Header sticky | Barra de progreso %, "Ejercicio X de Y", "N/M series", volumen (kg×reps), cronómetro de sesión, % animado | `:1859-1894` |
| Sección | Título (Calentamiento/Principal/Enfriamiento/área) + subtítulo explicativo | `:450-470`, `:1918-1939` |
| Card fuerza | Tipo · músculo, dots de progreso de series, nombre grande, prescripción (sets×reps · kg · desc · tempo · RIR), chip de sobrecarga | `SingleExerciseCard.tsx:176-286` |
| Card fuerza | "Última vez: X kg × Y" (tap autollena), cue de técnica de 1 línea, "Supera tu marca" | `SingleExerciseCard.tsx:288-320` |
| Card no-fuerza | Grid de objetivo tipado (intervalos, duración, distancia, pace, zona FC, hold, pasadas, respiraciones) | `WorkoutExecutionClient.tsx:268-342` |
| Detalles (disclosure) | Técnica completa (pasos), nota del coach, explicación de sobrecarga, historial (5 sesiones) | `SingleExerciseCard.tsx:330-391` |
| Chip recap serie | N° set, kg×reps, RPE, RIR, icono de nota, estado sync (check / "sin sincronizar") | `LogSetForm.tsx:506-574` |
| Superserie | Rondas A1→B1, "cómo hacerla", leyenda por miembro, "Sigue" | `WorkoutExecutionClient.tsx:695-908` |
| Resumen | Hero duración + stat adaptativo, series/reps, PRs con %, breakdown por ejercicio, cardio/movilidad, mapa muscular SVG, barras de volumen por músculo, nudge "lo que viene" | `WorkoutSummaryOverlay.tsx:258-525` |

### 3. Inputs solicitados (por tipo de ejercicio)

| Tipo | Inputs pedidos | Ejes DB | Ancla |
|---|---|---|---|
| Fuerza (`strength`) | kg, reps, RPE (1-10 opc), RIR (1-10 opc), nota (opc) | `weight_kg`, `reps_done`, `rpe`, `rir`, `note` | `LogSetForm.tsx:620-737` |
| Cardio | minutos, metros, FC promedio, RPE (post) | `actual_duration_sec`, `actual_distance_m`, `actual_avg_hr` | `LogSetForm.tsx:1029-1059` |
| Movilidad | segundos de hold, RPE (post) | `actual_hold_sec` | `LogSetForm.tsx:1061-1071` |
| Roller | segundos, pasadas, RPE (post) | `actual_duration_sec`, `reps_done` | `LogSetForm.tsx:1073-1094` |

Observaciones críticas:
- RPE/RIR **sólo aplican a fuerza** en la fila principal; en tipados el RPE se pide post-registro como escala (`LogSetForm.tsx:1113-1139`). Coincide con la premisa del rediseño.
- La FC de cardio es **entrada manual post-esfuerzo** (`actual_avg_hr`, min 25 max 250), no hay lectura en vivo. No existe distinción por lado en el registro de movilidad: `side_mode` sólo se muestra como objetivo (`WorkoutExecutionClient.tsx:314`), pero el alumno NO registra lado izquierdo/derecho por separado — es un solo campo de hold. Esto es una **brecha** frente al requisito de "holds por lado".
- Las variantes tipadas NO tienen autosave de draft (declarado como deuda, `LogSetForm.tsx:756-767`).

### 4. Timers y sus modos

Provider de "un solo timer activo" con reemplazo suave (toast) (`WorkoutTimerProvider.tsx:86-124`):

| Timer | Uso | Capacidades nativas | Ancla |
|---|---|---|---|
| RestTimer | Descanso entre series (auto o manual) | Anillo regresivo, ±15s, pausa/reset, mute, beeps 3-2-1, alarma x5, Wake Lock, Media Session, notificación SW en background | `RestTimer.tsx` |
| HoldTimer | Movilidad/roller | Regresivo, beep Web Audio + vibración, "Repetir" para siguiente lado/set | `HoldTimer.tsx` |
| IntervalTimer | Cardio con `interval_config` | Fases warmup/work/recovery/cooldown, "intervalo N de M", beep por fase, Wake Lock con toggle | `IntervalTimer.tsx` |
| Stopwatch | Cardio continuo/por distancia | Count-up, vueltas (5), pausa/reset | `Stopwatch.tsx` |

Además, un **cronómetro de sesión** independiente en el header, anclado a timestamp persistido en localStorage por (plan, día) para sobrevivir remontajes (`WorkoutExecutionClient.tsx:1186-1233`). El auto-timer de descanso es una preferencia persistida device-scoped (`:1003-1005`, `:1342-1346`). El descanso de "aproximación" (warmup) usa un tiempo más corto para la 1ª serie de bloques de ≥3 series (`LogSetForm.tsx:383-386`).

Los cuatro timers son sheets flotantes distintos, con posiciones inconsistentes (RestTimer abajo, Hold/Interval/Stopwatch arriba). El descanso es el único protagonista visual (anillo grande 96px); los otros son pills compactos.

### 5. Modo lista vs. modo "Paso a paso" (stepper)

Toggle segmentado en el header (`:1820-1857`), persistido device-scoped. El stepper (`StepperExecution.tsx`) muestra 1 ejercicio/superserie a la vez con: rail de progreso tappable, botones prev/next, swipe horizontal (framer drag), transición direccional, y auto-avance al completar. Ambos modos reusan el MISMO `renderGroup` (una sola verdad, `:1584-1785`). El stepper es lo más cercano a la visión "un ejercicio a la vez" del CEO, pero está oculto detrás de un toggle y por defecto OFF.

### 6. Superseries (ejecución por rondas)

Ejecución intercalada honesta A1→B1→A2→B2 (`WorkoutExecutionClient.tsx:632-910`). El descanso completo del grupo se dispara sólo al cerrar la ronda; entre miembros de la misma ronda muestra "Sin descanso — sigue con B1" (toast, `:1462-1469`). Cada miembro tiene su leyenda (objetivo, técnica, historial). Es sofisticado y funcional, pero visualmente denso.

### 7. Resiliencia offline y reconciliación (activo a preservar)

El pipeline de guardado es defensivo por capas (`LogSetForm.tsx:425-503`):
1. Write-through: encola SIEMPRE antes de tocar red (`:444-459`).
2. Optimismo local + estado "pending" hasta confirmación del server (`:484-502`).
3. Reconciliación: éxito saca de cola; error reabre la fila y revierte el optimismo del padre (`:350-364`, `WorkoutExecutionClient.tsx:1304-1308`).
4. Drafts por serie (kg/reps por evento `input` nativo; rpe/rir/note debounced) sobreviven atrás/reload/kill (`LogSetForm.tsx:297-343`).
5. Snapshot de sesión por (plan, día) re-inyecta filas confirmadas si el server vuelve vacío (`WorkoutExecutionClient.tsx:1088-1112`).
6. Precache de la página en el NAV_CACHE del SW para recarga offline (`:1163-1184`).
7. Guardas contra `router.refresh()` offline que expulsaría al alumno (`:1114-1140`).

Esta ingeniería nace de incidentes reales de pérdida de datos en la red del gimnasio y es el núcleo funcional intransable en cualquier rediseño. El server action (`workout-log.actions.ts`) hace upsert por (block, set, día-Santiago) con manejo de carreras flush-vs-submit (23505) y huérfanos de reseed (23503).

### 8. Gamificación y celebraciones existentes

- Al cerrar serie: check elástico (`springs.elastic`) + pulso dorado si iguala/supera el máximo histórico (`LogSetForm.tsx:511-539`).
- Al cerrar ejercicio: floreo del recap colapsado (check elástico + barrido del borde, `WorkoutExecutionClient.tsx:918-964`).
- Resumen: confetti (más intenso si hay PRs), detección de PRs con % y 1RM estimado, share-card generada en canvas, mapa muscular animado (`WorkoutSummaryOverlay.tsx:243-254`, `:161-186`, `PRShareCardModal.tsx`).
- Todo respeta `prefers-reduced-motion`.

Falta lo "tipo Duolingo": interstitials motivacionales entre ejercicios, rachas, reacciones dinámicas a logros durante la sesión (no sólo al final), progreso celebrado en cada hito.

### 9. Multimedia del ejercicio

El gif/video está detrás de un botón "Técnica" que abre un modal (`SingleExerciseCard.tsx:211-220`, `WorkoutExecutionClient.tsx:2001-2113`). Soporta YouTube (embed), mp4/mov/webm (video autoplay loop muted) y gif/imagen (`Image` unoptimized). NO hay media pasiva al centro de la card. Esto contradice de frente la visión del CEO ("multimedia visible al centro sin tocar botones y sin ser invasivo").

### 10. Otras features

- **Sustitución "máquina ocupada"**: bottom-sheet con alternativas del mismo músculo (`SubstituteExerciseSheet.tsx`), sólo fuerza, antes del 1er set; swap sólo por hoy, persiste columnas dedicadas en el log sin tocar `exercise_id` (`workout-log.actions.ts:118-122`).
- **Teclado numérico custom**: superficie más tocada de la app; grid 3×4, chips de incremento de peso configurables, tabs de campo, paso opcional de esfuerzo, publica su altura para scroll (`NumericKeypadSheet.tsx`). Sólo se activa en puntero grueso (táctil); en desktop usa inputs nativos.
- **Gate de suscripción del coach**: post-gracia el alumno no puede registrar (readonly), con error tipado (`workout-log.actions.ts:85-88`).
- **Sobrecarga progresiva**: `computeEffectiveTarget` (weekly_linear / double), chip + prellenado del peso sugerido (`WorkoutExecutionClient.tsx:565-606`, `_data/workout-execution.queries.ts:219-246`).

### 11. Juicio crítico por feature

| Feature | Veredicto | Razón |
|---|---|---|
| Registro kg×reps + teclado custom | Esencial | Núcleo del producto; el teclado custom es superior al del SO |
| Resiliencia offline (cola/draft/snapshot) | Esencial | Nace de pérdida de datos real; intransable |
| RestTimer con auto-timer + nativos | Esencial | Función más usada entre series |
| Sobrecarga progresiva (chip + prellenado) | Esencial | Diferenciador vs. apps genéricas |
| Cronómetro de sesión persistido | Útil | Aporta contexto; buena implementación |
| Superserie por rondas | Útil | Correcta, pero densa visualmente |
| Modo stepper (paso a paso) | Útil (subaprovechado) | Base ideal para la visión del CEO, pero OFF por defecto |
| Resumen con PRs/confetti/share-card | Útil | Buena gamificación de cierre; falta durante la sesión |
| Sustitución máquina ocupada | Útil | Nicho pero resuelve fricción real de gimnasio |
| Multimedia detrás de modal | Fricción | El CEO quiere media pasiva; hoy exige un tap |
| RPE + RIR ambos por serie | Ruido/fricción | Dos escalas 1-10 por serie sobrecarga; RIR redundante con RPE para la mayoría |
| Densidad de inputs por card | Fricción | "Sopa" kg/reps/RPE/RIR/nota compite por atención con el teléfono en la mano |
| FC de cardio tecleada a mano | Fricción/brecha | Requisito CEO: BPM en vivo de Apple Watch; hoy inexistente |
| Registro de movilidad sin lado I/D | Brecha | Requisito CEO: holds por lado; hoy un solo campo |
| Monolito de 2134 líneas | Deuda | Acopla estado/efectos/render; complica port RN 1:1 |
| Toggle Lista/Pasos + dos posiciones de timer | Ruido | Inconsistencia de layout entre timers |

## Recomendaciones para el rediseño (priorizadas)

1. **Preservar intacto el motor de resiliencia y logging** (cola offline, drafts, snapshot, reconciliación, `logSetAction`). Es el activo más caro y crítico; cualquier UI nueva debe montarse encima, no reemplazarlo. En RN, replicar la semántica write-through con almacenamiento nativo.
2. **Adoptar el modo "un ejercicio a la vez" como default**, evolucionando el stepper actual hacia la visión del CEO: card fullscreen por ejercicio, media pasiva al centro, botones grandes, y transiciones/interstitials entre ejercicios. El modo lista puede quedar como vista secundaria "ver todo".
3. **Media pasiva siempre visible**: mostrar gif/video (loop muted) al centro de la card sin requerir tap, con el modal de técnica reservado para las instrucciones textuales. Reusar el pipeline de `ExerciseVideo`/gif ya existente.
4. **Integrar BPM/distancia/tiempo en vivo de Apple Watch para cardio** (brecha total hoy). En RN nativo vía HealthKit/`react-native-health`; en PWA degradar a Web Bluetooth/entrada manual. Reemplazar el input manual de FC por un valor capturado automáticamente cuando esté disponible.
5. **Registro de movilidad por lado**: añadir eje izquierdo/derecho cuando `side_mode = per_side`, con el HoldTimer encadenando "lado 1 → lado 2". Requiere extender el shape del draft/log tipado (deuda ya identificada).
6. **Simplificar la captura de esfuerzo**: elegir RPE *o* RIR (no ambos) por defecto, o hacer RIR un ajuste avanzado. Reducir la "sopa" de inputs por card para el alumno con el teléfono en la mano.
7. **Gamificación durante la sesión, no sólo al final**: interstitials fullscreen motivacionales entre ejercicios, reacciones a hitos (PR en vivo, racha de series, mitad de rutina), respetando white-label (sin mascota; usar color/animación/copy del coach) y `prefers-reduced-motion`.
8. **Unificar los timers** bajo un solo lenguaje visual y posición (hoy 4 componentes con layouts distintos). Mantener las capacidades nativas (Wake Lock, Media Session, beeps, notificaciones) que ya funcionan.
9. **Descomponer el monolito** de 2134 líneas en el rediseño: aislar estado de sesión, orquestación de timers, y presentación, para permitir paridad RN 1:1 y testing. La lógica pura de `@eva/workout-engine` ya es un buen punto de corte.
10. **Conservar el header de progreso rico** (%, ejercicio X de Y, volumen, cronómetro) y el resumen final con PRs/share-card: son fortalezas medibles; sólo reencuadrarlos en el nuevo lenguaje visual dinámico.
