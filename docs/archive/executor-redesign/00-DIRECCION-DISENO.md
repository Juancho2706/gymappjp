# Dirección de diseño — Ejecutor de entrenamiento V3

> Síntesis de las 3 investigaciones (fundamentos, referentes, auditoría interna) para el rediseño del ejecutor del alumno en RN + PWA. Fecha: 2026-07-21. Estado: **propuesta — sin código tocado**. Los 16 informes de soporte viven en esta misma carpeta (`fundamentos/`, `referentes/`, `auditoria/`); los 3 conceptos visuales en `mockups/`.

## 1. Tesis

El ejecutor actual es funcionalmente sólido (offline intransable, 4 tipos diferenciados, timers background-safe) pero emocionalmente plano: registra, no reacciona. La visión es un ejecutor que **responde al esfuerzo del alumno** — cada serie cerrada produce feedback inmediato multimodal, cada descanso es un momento diseñado, cada sesión termina en un ritual — con la versión RN nativa como la mejor expresión (Live Activities, haptics, Watch) y la PWA heredando el mismo diseño con degradación honesta.

La evidencia respalda esta dirección: la competencia percibida es el predictor #1 de adherencia al ejercicio; la celebración efectiva llega en <2s del logro; y las apps referentes (Duolingo, Hevy, Nike Run Club) monetizan exactamente este loop. Pero la misma evidencia pone límites: la celebración épica **se gana** (solo hitos reales), el alumno avanzado necesita un camino rápido sin fricción, y en pleno esfuerzo la pantalla debe ser glanceable (<2s de lectura), no un espectáculo.

## 2. Diagnóstico (de las auditorías)

**Activos a preservar intactos:**
- Resiliencia offline por capas: cola write-through, drafts, snapshot, reconciliación (`a1` §7). Nace de pérdida de datos real. Toda UI nueva se monta encima, no lo reemplaza.
- `@eva/workout-engine` puro: tipos, teclado, stepper, supersets/rondas, intervalos, resumen. El corte lógico ya existe (`a3` §5).
- Timers RN background-safe con haptics ricos; teclado numérico custom; sobrecarga progresiva con prellenado; sustitución "máquina ocupada"; resumen con PRs/share-card.

**Brechas vs la visión (todas confirmadas en código):**

| Brecha | Hoy | Ancla |
|---|---|---|
| Media pasiva al centro | Gif/video detrás del botón "Técnica" (modal) | `a1` §9, `a2` |
| Un ejercicio a la vez | Stepper existe pero OFF por defecto, escondido tras toggle | `a1` §5 |
| Celebración durante sesión | Solo confetti al cierre; micro-feedback mínimo | `a1` §8, `a2` |
| Interstitials entre ejercicios | No existen | `a1`, `a2` |
| BPM en vivo / Watch | Cero integración; FC se teclea a mano (`actual_avg_hr`) | `a1` §3, `a4` |
| Holds por lado | Solo prescripción (`side_mode`); log agregado único | `a3` §3 |
| Sonido de timers RN | Bundleado pero dormido (expo-audio sin instalar) | `a4` |
| Cronómetro lockscreen RN | Codificado pero NO-OP (exige build EAS + notify-kit) | `a4` |
| RPE + RIR juntos | Dos escalas 1-10 por serie = sopa de inputs | `a1` §11 |

## 3. Principios de diseño (no negociables del rediseño)

1. **Glanceable primero.** La UI modula por fase: durante el esfuerzo, un dato protagonista gigante y nada más; durante el descanso, la riqueza (siguiente ejercicio, celebración, ajustes). Comprensión cae ~38% bajo esfuerzo (`f4`).
2. **Un tap por serie como caso feliz.** "Anterior" con auto-fill convierte la serie típica en un solo tap; teclado grande solo para cambios (`r2`). Meta: 10-15s por registro.
3. **Celebración escalonada que se gana.** Micro (serie: check elástico + haptic + tick), media (ejercicio/bloque: floreo + interstitial), épica (sesión/PR real: fullscreen + confetti + share-card). Nunca épica gratis; el usuario avanzado puede saltarla siempre (`f3`, `f6`, `r1`).
4. **Feedback multimodal sincronizado.** Visual + haptic + sonido en <10ms del evento; sonido siempre muteable y OFF por defecto en gimnasio; haptics con semántica (success ≠ aviso ≠ fin descanso) (`f2`).
5. **Motion con física, no con duraciones.** Springs (spatial con rebote leve, effect sin rebote), 100-450ms, entrada ease-out. `prefers-reduced-motion` / Reduce Motion = línea roja: variantes fade que preservan significado (`f1`, `f5`).
6. **White-label sin mascota, con tema EVA propio.** La vibra viene de motion + color + tipografía cinética + haptics + copy. Decisión CEO 2026-07-21: existe un **tema EVA default** multicolor (Sport `#2680FF` acciones/fuerza, Aqua `#18ABD4` recovery/movilidad/roller, Ember `#FF6A3D` celebración) y en el menú white-label el coach elige "mis colores" o "colores EVA". Excepción semántica: zonas FC con colores universales FIJOS (Z1 azul → Z5 rojo), nunca re-teñidas (`r3`, `r5`).
7. **Offline intransable.** Anotar, avanzar y celebrar sin señal; reconciliar al volver. Toda key nueva de log toca las 5 superficies del payload a la vez o no se agrega (`a3` §4).
8. **RN la mejor, PWA honesta.** Lo nativo (Live Activities, Watch, haptics AHAP) es el techo RN; la PWA degrada con gracia (SW notification + wake lock + vibration donde exista) y **omite** lo que no puede (jamás un BPM falso) (`r4`, `r6`).

## 4. Arquitectura de la experiencia

### Core loop: stepper-first
El modo "un ejercicio a la vez" pasa a ser el **default** (hoy existe como toggle opt-in). Card fullscreen por ejercicio: progreso de sesión arriba, media del ejercicio al centro **siempre visible** (loop muted, autoplay; degrada a webp estático por cuota), prescripción + "Anterior" tappable, botón de completar grande (≥56px). La vista lista queda como secundaria ("ver todo") — misma fuente `renderGroup`, cero bifurcación de lógica.

### El descanso ES el interstitial
No agregamos pantallas: el rest timer (que ya arranca auto al cerrar serie) se convierte en el interstitial fullscreen: countdown gigante + micro-celebración de la serie recién cerrada + tarjeta "SIGUIENTE" con su media + mensaje del coach + **bottom-sheet peek "Plan completo"** (decisión CEO: el alumno puede arrastrar y ver todo el plan con estados ✓/ahora/pendiente por curiosidad, sin salir del descanso). Al llegar a cero: haptic + sonido + transición al siguiente ejercicio. Ritmo: cero segundos añadidos al entrenamiento.

### Apertura y cierre de sesión (pantallas propias)
- **Inicio:** pantalla pre-entrenamiento energizante — día/fase/variante, resumen (ejercicios, series, duración estimada), primeros ejercicios, contexto "la última vez" (volumen/duración), nota del coach, racha semanal, CTA "Empezar".
- **Final:** ritual de cierre en 2 fases — clima celebratorio, luego stats con tickers (duración, volumen, series, PR destacado) + **mapa muscular** frente/espalda con zonas trabajadas por intensidad (evolución del `MuscleMapSvg` actual) + racha semanal + share-card.

### Estados y momentos de la realidad (revisión crítica 2026-07-21)
Auditoría del pitch contra el código real: el ejecutor actual ya maneja estados que el rediseño debe mostrar con orgullo, no esconder. Obligatorios: **offline visible y calmo** (pill "sin conexión — guardando en tu teléfono" + estado por-sincronizar por serie; la cola write-through jamás pierde datos), **sustitución "máquina ocupada"** (traer a RN la `SubstituteExerciseSheet` que hoy es solo web), **vista lista "ver todo"** como modo secundario, **PR en vivo** como celebración media inline (borde dorado + toast, sin modal), **fases de intervalo** con colores fijos esfuerzo-cálido/recuperación-fría y cues eyes-free (la máquina `buildIntervalPhases` ya existe), **sheet "conectar sensor"** (BLE estándar, honesto sobre Apple/Galaxy Watch), y **cierre de ronda de superserie** con su descanso de grupo (el único descanso del grupo, así funciona `superset-rounds`). Mockups: `mockups/concepto-a-v32-estados.html` + `concepto-a-v32-momentos.html`. Revisado y descartado del pitch (no de la implementación): historial de 5 sesiones en disclosure (vive en el sheet de Instrucciones).

### Recuperación, revisión y bloqueo (v3.3 — decisiones CEO 2026-07-21)

**Bloqueo total post-gracia (cambio de política).** Hoy el gate es un híbrido fail-open: tras los 7 días de gracia el proxy sirve dashboard/plan/historial en readonly con banner, redirige el resto a `/suspended?reason=coach`, y esa página aún ofrece "Ver mi plan" (`proxy.ts:970-1001`, `suspended/page.tsx:25-66`). **Nueva política:** pasado el día 7, el alumno no ve NADA — login → pantalla completa "Tu cuenta está en pausa · escríbele a tu coach" con CTA de contacto y cerrar sesión; cero dashboard. Implementación: reducir la allowlist del proxy a `/suspended` (+ logout), quitar los CTAs de lectura de la variante `reason=coach`, y espejar el bloqueo en RN (ojo: RN habla PostgREST directo sin proxy — la barrera real sigue siendo RLS, el bloqueo UI se replica en la app con el mismo resolver). Kill-switch `STUDENT_ACCESS_GATE` y gracia de 7 días funcional+banner se mantienen.

**Gap de atribución descubierto (bug de producto).** El "done" de la semana exige log fechado ESE día calendario Y plan de ese día (`weekPendingWorkouts.ts:142-156`); recuperar el martes un día jueves no marca ni el martes (sin log ese día) ni el jueves (plan distinto) — el pendiente nunca se limpia. **Fix propuesto (sin cambio de schema):** el día X de la semana actual queda "hecho" si SU plan tiene logs en cualquier día de esta semana → la celda muestra "Hecho el jueves ✓". Cambio puro en `deriveWeekWorkoutStatus` + su espejo RN (`home.tsx`). El momentum y la racha no se tocan: cuentan la fecha real del log por diseño declarado.

**Recuperar (solo semana actual).** La cola de pendientes ya está acotada Lun→Dom de la semana en curso y el CTA abre el más antiguo. El ejecutor gana un banner de modo: "Recuperando: Martes — Día 2" + "al terminar, tu martes queda listo esta semana" (ámbar suave, no alarmista).

**Revisar/editar vs repetir (día ya hecho).** Mismo día: re-entrar carga los logs de hoy editables por chip — ya funciona (`workout-execution.queries.ts:146-177`, `LogSetForm.tsx:505-527`); se le antepone el resumen. Otro día: sheet de doble intención — **"Revisar y editar"** (abre los registros de ESA fecha en modo edición; requiere `target_date` opcional en query+action, hoy clavadas a hoy-Santiago; SOLO editar filas existentes, nunca crear series nuevas en fechas pasadas → imposible farmear adherencia retroactiva; la llave única `workout_logs_one_set_per_day` ya lo respalda) o **"Repetir hoy"** (instancia nueva con fecha real de hoy, lo anterior queda como referencia "Anterior" — comportamiento natural actual). Mockups: `mockups/concepto-a-v33-recuperacion.html`.

### Modos de captura
- **Rápido (default):** 1 tap sobre "Anterior" o el valor sugerido por sobrecarga progresiva.
- **Ajuste:** teclado numérico custom (superficie más tocada de la app — se preserva y se agranda). **Patrón dual (decisión CEO 2026-07-21):** tap sobre el valor = teclado custom; **mantener presionado** = rueda estilo iOS de doble columna (kg | reps a la vez), en iOS Y Android, centrada en el valor anterior con rango corto y tick háptico por paso. Condiciones de diseño: hint visible la primera vez (gesto oculto), umbral de long-press ~400ms, y para saltos grandes siempre el teclado (evidencia `f7`: rueda no sirve como método primario en rangos 0-300 kg).
- **Detalle (opt-in):** RPE y RIR visibles como pills opcionales (**RPE 1-10, RIR 0-10** — corrección CEO 2026-07-22: RIR 0 = al fallo; un RPE 0 no significa nada) — el alumno ve que puede llenarlos, pero jamás bloquean el CTA ni el flujo. Nota opcional. Dato: Zod y CHECKs de DB ya alineados (migración 20260722123000).

## 5. Experiencia por tipo (la uniqueness pedida)

### Fuerza (`strength`)
Lo descrito arriba es el caso fuerza. Extras: chip de sobrecarga con prellenado (ya existe), PR inline (pulso dorado + haptic al superar máximo histórico — detección pura nueva en engine), plate calculator como backlog (diferenciador de Strong, `r2`). Supersets mantienen rondas intercaladas A1→B1 con el descanso solo al cerrar ronda; el interstitial entre miembros de ronda es un micro-slide ("Sigue con B1"), no el fullscreen.

### Cardio (`cardio`)
**Identidad del ejercicio primero (decisión CEO 2026-07-21):** no todo cardio es correr — el catálogo tiene caminadora, escaladora, bici, remo, etc. La pantalla muestra nombre + media del ejercicio del catálogo, y las métricas secundarias se adaptan a la máquina (pisos en escaladora, distancia en cinta/remo, etc.). Diseñado para NO mirar la pantalla (`r3`): metrica protagonista única gigante (tiempo o distancia restante) con anillo/barra de countdown animada (SVG dash-offset / conic-gradient — barras se leen en 300ms vs 1780ms un gauge radial), color de progreso por zona FIJA. Jerarquía: N1 restante / N2 zona objetivo + estado ("Z2 — mantiene") / N3 chips (intervalo 3 de 6, BPM, **distancia recorrida vs objetivo**, ritmo — capacidades del módulo cardio pro). Audio/haptic cues por fase de intervalo (la máquina de fases `buildIntervalPhases` ya existe). BPM en vivo **solo si hay wearable conectado** — y wearable significa AMBAS plataformas (decisión CEO 2026-07-21): Apple Watch vía HealthKit **y** Galaxy Watch/bandas vía Health Connect; jamás diseñar solo-iOS. Sin wearable, el módulo se oculta (patrón "omitir, no inventar"). Work por distancia sin duración no es cronometrable (guard `isTimeableInterval`) → cae a stopwatch + registro manual.

### Movilidad (`mobility`)
Tono distinto: calmo, tipo Gentler Streak (`r5`). Con `side_mode: per_side` el HoldTimer **secuencia los lados**: "Pierna izquierda 30s" → haptic + voz/beep de cambio → "Pierna derecha 30s". Eyes-free por diseño (el alumno está estirando, no mirando). Registro por lado = la única decisión de datos grande pendiente (§8).

### Roller (`roller`)
Mínimo y táctil: media del ejercicio + **contador de pasadas gigante** (tap = +1 con tick haptic + número que salta), timer opcional. Sin engine nuevo: `reps_done` + `applyKeypadIncrement` ya lo soportan (`a3` §4e). Es la pantalla más simple y la más "juguete" — correcto para el contexto (recuperación, baja carga cognitiva).

## 6. Sistema de celebración

| Nivel | Disparador | Forma | Frecuencia |
|---|---|---|---|
| Micro | Serie cerrada | Check elástico + haptic success + tick + número vuela al progreso | Cada serie |
| Media | Ejercicio/bloque completo | Floreo del recap + interstitial con "+1" y copy del coach | Por ejercicio |
| Épica | Sesión completa / PR real | Coreografía 2 fases: clima (confetti/partículas) → stats con tickers → share-card | 1 por sesión máx |

- Secuencia final estilo Duolingo replicable con 4 recursos sin mascota: stagger + spring + ticker + capas (`r1`).
- PR: detección **pura en el engine** (vs máximo histórico, excluyendo sustituidos — anti-PR-falso ya existe en `session-summary`), celebración por plataforma.
- Rachas: **semanales** (sesiones/semana vs plan), nunca diarias — respetan el descanso programado; sin guilt-tripping, sin vidas (`f3`, `r1`).
- Share-card tintada con marca del coach (ya existe; se reencuadra al nuevo lenguaje).

## 7. Sistema técnico

**Compartido en packages (`@eva/workout-engine` + nuevo `motion-tokens`):**
- Eventos semánticos tipados que el motor emite y cada UI mapea a feedback: `serie_cerrada`, `ejercicio_completado`, `ronda_cerrada`, `pr_detectado`, `descanso_inicio/aviso/fin`, `cambio_lado`, `pasada_roller`, `fase_intervalo`, `sesion_completada`.
- Motion tokens: duraciones, parámetros de spring (spatial/effect), jerarquía de celebración, flag `reducedMotion`.
- Funciones puras nuevas: progreso cardio (objetivo + avance → % y restante), `hrToZone(bpm, perfil)`, `detectPR(log, historico)`.

**RN (Expo 54 / RN 0.81.5, New Architecture OK):** Reanimated 4 (worklets UI-thread), react-native-fast-confetti (Skia, prop reduceMotion), Rive para la pieza de celebración épica (un `.riv` neutro parametrizado por color del coach; state machines; ~15x más liviano que Lottie), expo-haptics (+ Core Haptics custom vía módulo si hace falta), expo-video, expo-audio, expo-keep-awake (ya activo).

**PWA:** CSS `linear()` springs (~88% soporte) + WAAPI, View Transitions API para continuidad espacial, canvas-confetti (~6kB), animar solo transform/opacity. Ya tiene wake lock, Media Session, vibration (con truco iOS 18), SW notifications — se preservan. Rive WASM (~200KB gzip) solo diferido en celebración épica, con fallback estático.

**Regresión a recuperar:** Media Session existe en web pero el port RN la omitió (`a4`) — volver a incluirla.

## 8. Cambios de datos y engine (todos aditivos)

1. **Holds por lado** — la única superficie grande. Recomendación: exponer `metadata jsonb` (ya reservado en DB para L/R) en `WorkoutLogSetSchema` como record opcional (patrón `extra_targets`) con `{ left_sec, right_sec }`, condicionado por `side_mode`. Exige tocar las 5 superficies del payload + `typedKeypadFields('mobility')`. Decidir ANTES de construir el keypad nuevo.
2. **Progreso cardio** — función pura nueva; reusa `formatTypedObjective` + `buildIntervalPhases`.
3. **`hrToZone`** — pura, usa `resting_hr`/`max_hr_override` de `CardioProfileUpdateSchema`; opcional en PWA.
4. **`detectPR`** — pura, reusa `maxWeight`/`totalVolume` de `summarizeSessionByKind`.
5. **Subir `keypad-flow.ts` y `set-log-payload.ts` al package** — elimina el último espejo manual web/mobile (hoy `LogSetForm.tsx` reimplementa el mapeo).
6. **`actual_pace_sec_per_km`** ya existe en schema/DB sin cablear — conectarlo si el rediseño de cardio lo pide.
7. **No** reintroducir CHECKs por tipo en DB: el diseño deliberado es schema permisivo + decisión en capa pura (`a3` §10).

## 9. Roadmap de capacidades

| Fase | Qué | Requiere |
|---|---|---|
| **F0 — quick wins** | Activar expo-audio (timbres ya bundleados), encender cronómetro lockscreen Android (notify-kit, ya codificado), instalar expo-video, recuperar Media Session RN | Build EAS ya planeada |
| **F1 — core loop nuevo** | Stepper-first + media al centro + 1-tap "Anterior" + captura simplificada + celebración micro/media + eventos del engine | Solo código |
| **F2 — vibra** | Interstitial-descanso fullscreen + celebración épica (Rive/confetti) + PR detection + share-card nueva + rachas semanales | F1 |
| **F3 — descanso nativo iOS** | Live Activity + Dynamic Island para rest timer (módulo ActivityKit **propio** — expo-live-activity fue deprecada jun-2026; App Intents para −15s/saltar/+15s) + Android 16 Live Updates | Build nativa nueva |
| **F4 — Wearables (opcional, caro)** | BPM/distancia en vivo AMBAS plataformas: iOS companion watchOS + `HKWorkoutSession` espejo + WatchConnectivity (`expo-watch-connectivity` v0.1.0, verde); Android vía Health Connect (`react-native-health-connect` v3.5.3, madura) + Wear OS. Alternativa barata previa: lectura histórica post-sesión en ambas | Build nativa + apps watch |

PWA por fase: F1-F2 heredan casi todo (springs CSS, confetti canvas, View Transitions); F3 degrada a SW notification + wake lock; F4 no aplica (omitir módulo).

## 10. Riesgos y guardarrailes

- **Fatiga de gamificación:** jerarquía estricta de celebración; épica solo ganada; todo skippable; modo "rápido" para el avanzado (`f3`).
- **Reduce Motion / vestibular:** variantes fade obligatorias; nunca >3 destellos/s; sin loops perpetuos durante el esfuerzo (batería + GPU) (`f5`).
- **Low Power Mode iOS anula Taptic** — el feedback nunca depende solo del haptic.
- **Merge offline:** regla de las 5 superficies; escribir en keys `actual_*` existentes siempre que se pueda (`a3`).
- **Builds nativas:** F0/F3/F4 requieren EAS build + QA device del CEO (precedente notify-kit); nada de esto llega por OTA.
- **Cuota Supabase Image Transformations:** gifs de catálogo → webp estático en listas; el loop de media vive solo en la card activa (memoria de incidente previo).
- **iOS Safari PWA sin Vibration API:** el feedback PWA es visual+sonido; degradación documentada, no sorpresa.

## 11. Decisiones pendientes (CEO)

1. ~~RPE o RIR~~ **RESUELTA (CEO 2026-07-21):** ambos visibles como opcionales, sin bloquear el flujo. Escalas finales (corrección CEO 2026-07-22): RPE 1-10, RIR 0-10. Zod y DB alineados (E0.4 hecha).
2. **Holds por lado v1:** ¿metadata jsonb ahora (recomendado) o se difiere el registro por lado?
3. ~~Sonido~~ **RESUELTA (CEO 2026-07-21):** todo OFF salvo el cronómetro de descanso, que suena con el tono del sistema del usuario (viable en Android vía RingtoneManager; en iOS según hallazgos de `f7` — probablemente catálogo propio) o uno del catálogo EVA. Ajustes (on/off, tono, volumen, vibración) viven en un botón de **tuerca** dentro del workout.
4. ~~Rachas semanales~~ **RESUELTA (CEO 2026-07-21):** sí, entran (semanales contra el plan, nunca diarias).
5. ~~Concepto visual~~ **RESUELTA (CEO 2026-07-21):** gana **A "Impulso"** (C descartado). Iteración v2 en `mockups/concepto-a-v2.html` con: pantallas inicio/final + mapa muscular, RPE/RIR opcionales (RPE 1-10, RIR 0-10), peek "plan completo" en descanso, cardio con distancia/ritmo y wearable dual iOS+Android.
6. ~~Alcance wearables~~ **RESUELTA (CEO 2026-07-21): "todos los posibles".** Estrategia por capas en `referentes/r7-universo-wearables-hr.md`: BLE GATT Heart Rate estándar (una integración cubre cintas Polar/Garmin/Wahoo/Coospo y relojes en modo broadcast) + HealthKit/Apple Watch + Health Connect/Wear OS + lo que cada SDK propietario permita; documentar honesto lo que NO expone HR en vivo a terceros.
7. ~~Wheel picker~~ **RESUELTA (CEO 2026-07-21):** patrón dual — tap = teclado custom, mantener presionado = rueda doble kg|reps (iOS y Android), centrada en el valor anterior. Ver §4 Modos de captura.
8. **NUEVO — toggle "colores EVA" en el menú white-label:** el creador de marca del coach suma la opción de usar el tema EVA multicolor en vez de sus colores (feature del builder white-label, planificar junto al ejecutor).
9. ~~Holds por lado~~ **RESUELTA (CEO 2026-07-21):** sí — `metadata jsonb` con `{left_sec, right_sec}`, se construye junto con el keypad nuevo (5 superficies a la vez).
10. ~~Gate post-gracia~~ **RESUELTA (CEO 2026-07-21):** bloqueo TOTAL al login pasados los 7 días — pantalla "habla con tu coach", ni dashboard; reemplaza el híbrido readonly actual. Ver §Recuperación, revisión y bloqueo.
11. ~~Días pendientes y re-hacer~~ **RESUELTA (CEO 2026-07-21):** recuperar solo semana actual con atribución al día del plan (fix del gap de `deriveWeekWorkoutStatus`); día hecho → sheet "Revisar y editar" / "Repetir hoy"; edición de fecha pasada solo sobre filas existentes (`target_date` aditivo).
12. **Pasos y hábitos vía wearables (CEO 2026-07-21):** el widget de hábitos del dashboard ya registra pasos a mano (`daily_habits.steps`, `HabitsTrackerWidget.tsx`). HealthKit/Health Connect son la fuente ideal para AUTO-llenarlos (dato diario agregado, no requiere streaming) y para volcar distancia/calorías del cardio al resumen post-sesión. Es la capa "agregadores" de `r7` encontrando su verdadero uso: pasos e historial, no BPM en vivo.

## 12. Índice de la investigación

- `fundamentos/f1-motion-design.md` — principios, duraciones, springs, M3 Expressive.
- `fundamentos/f2-microinteracciones-feedback.md` — Saffer, juiciness, haptics, sonido, tickers.
- `fundamentos/f3-psicologia-gamificacion.md` — SDT, celebración, streaks, riesgos.
- `fundamentos/f4-ergonomia-contexto-gym.md` — Fitts, thumb zones, glanceable, one-tap.
- `fundamentos/f5-accesibilidad-performance-stack.md` — reduced motion, Rive/Skia/Reanimated vs CSS/WAAPI.
- `fundamentos/f6-celebraciones-transiciones.md` — anatomía de celebraciones e interstitials.
- `referentes/r1-duolingo.md` — teardown completo + qué es replicable white-label.
- `referentes/r2-loggers-fuerza.md` — Strong/Hevy/Ladder/Fitbod: captura, rest timer, PRs.
- `referentes/r3-cardio-tracking.md` — Strava/NRC/Peloton: métricas vivas, zonas, indoor.
- `referentes/r4-ecosistema-apple-nativo.md` — HealthKit/Watch/Live Activities desde Expo; estado de módulos.
- `referentes/r5-vibra-ambiente.md` — vibra sin mascota, white-label safe.
- `referentes/r6-delight-fuera-fitness.md` — Flighty/Family/Airbnb: patrones reutilizables.
- `auditoria/a1-executor-web.md` — inventario completo web + juicio por feature.
- `auditoria/a2-executor-rn.md` — inventario ExecutorV2 + deltas + nativo ya integrado.
- `auditoria/a3-tipos-ejercicio-engine.md` — modelo de tipos, 5 superficies, cambios propuestos.
- `auditoria/a4-capacidades-nativas.md` — matriz RN/PWA hoy vs posible + quick wins.
- `mockups/concepto-{a,b,c}.html` — los 3 conceptos visuales.
