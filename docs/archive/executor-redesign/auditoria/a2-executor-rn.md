# Auditoría del ejecutor de entrenamiento en React Native (ExecutorV2)

Auditoría de solo lectura del ejecutor de rutina del alumno en `apps/mobile`. Cubre el visor "que toca hoy" (dashboard y tab), el ejecutor nuevo `ExecutorV2` y todos sus subcomponentes (cards por tipo de ejercicio, teclado, filas de serie, familia de timers), las capacidades nativas ya integradas, los deltas respecto del ejecutor web y el estado del flag `executorV2` y del `LegacyExecutor`. El objetivo es fijar la línea base real para el rediseño.

## Resumen ejecutivo

- `ExecutorV2` es un **puerto 1:1 del ejecutor web** (`WorkoutExecutionClient`, abreviado WEC en los comentarios): casi cada bloque cita `WEC:línea` como fuente de verdad y replica su layout md. Esto da paridad funcional total pero **acota el techo**: por diseño no supera a la web (el docstring de `ExecutorV2.tsx:110-114` lo define como reemplazo 1:1 de `LegacyExecutor` espejando la web), cuando la visión declarada para este rediseño es que la nativa sea "la mejor".
- El motor de dominio es compartido y puro: `@eva/workout-engine` (agrupación, pasos, sobrecarga, intervalos, keypad) y `@eva/cardio` (zonas FC, pace). Web y mobile consumen lo mismo, sin drift (`ExecutorV2.tsx:9-20`).
- **Cuatro tipos ya diferenciados**: fuerza (peso/reps/RPE/RIR), cardio (duración/distancia/FC + intervalos/cronómetro), movilidad (hold segundos + timer de hold) y roller (segundos/pasadas + timer). El ruteo tipo→campos es puro y único (`SingleExerciseCard.tsx:388-393`, `TypedTargetGrid.tsx:55-95`, `SetRow.tsx:564-577`).
- **RIR/RPE están correctamente limitados a fuerza** en la fila activa; los tipados capturan solo RPE post-log con la misma escala de dots 1-10 (`SetRow.tsx:163-251`, `TypedKeypad.tsx:597-661`).
- **NO existe integración con Apple Watch, HealthKit ni Bluetooth/BLE**: `actual_avg_hr` (bpm) se ingresa a mano por el teclado; "Zona FC" solo muestra el rango objetivo, sin lectura en vivo (búsqueda vacía de `healthkit|apple.?watch|bluetooth|heart.?rate`; `TypedTargetGrid.tsx:69-76`, `set-log-payload.ts:46`). Es el mayor hueco frente a la visión del CEO.
- **La multimedia del ejercicio (gif/video) está detrás de un botón "Técnica"** que abre un `TechniqueSheet` modal; no se muestra centrada por defecto. El CEO pide gif/video visible al centro sin tocar botones (`SingleExerciseCard.tsx:317-328`, `hasTechnique` :172).
- **No hay interstitials fullscreen entre ejercicios.** El modo "Pasos" es un pager con swipe + rail de segmentos, sin pantalla motivacional animada de transición (`StepperExecution.tsx:78-96`).
- **Las celebraciones son moderadas**: pulso dorado inline + háptica al marcar PR por serie, y confetti + PRs/share-cards solo al finalizar la sesión (`ExecutorV2.tsx:382-393`, `WorkoutSummaryOverlay.tsx:16` con `react-native-fast-confetti`). La reactividad tipo Duolingo por-serie es limitada por decisión de paridad.
- **El cronómetro de descanso nativo es excelente y es el activo más reusable**: barra protagonista con anillo, ±15s, pausa/reset/mute, alarma háptica en loop, cálculo por `endTime` resistente a background, notificación local de fin y cronómetro vivo en la bandeja (`RestTimerBar.tsx`, `rest-notification.ts`, `rest-live-notification.ts`).
- **Capacidades nativas ya integradas**: keep-awake de toda la sesión, hápticos semánticos ricos con patrones de ms exactos en Android, sonidos por timbre con `expo-audio` (modo silencio + duck), notificaciones locales `expo-notifications`, cronómetro vivo `react-native-notify-kit` (fork de Notifee), `AppState` para timers background-safe y confetti al cierre.
- **Deltas RN sobre web (extras)**: prompt de permiso de notificación una sola vez, notificación local de fin de descanso, cronómetro vivo en lockscreen y patrones hápticos por evento — capacidades que la web PWA no tiene.
- **Delta faltante vs web**: controles multimedia de lockscreen/auriculares (MediaSession) del descanso NO se portaron por falta de módulo nativo de "now playing" (`RestTimerBar.tsx:44-54`).
- El **flag `executorV2` está en `true`** por defecto en la rama, con override remoto vía `/api/mobile/config`; `LegacyExecutor` (936 líneas, monolítico, usa `components/workout/RestTimer` y `WorkoutSummaryModal` antiguos) queda como fallback y es esencialmente código muerto mientras el flag esté ON (`flags.ts:12`, `[planId].tsx:11-15`, `LegacyExecutor.tsx`).
- **Friccion arquitectónica**: el cronómetro de sesión hace `setState` cada segundo, forzando re-render de todo el árbol; se mitiga con un `useMemo` del cuerpo de lista, pero es un parche que documenta tensión de arquitectura a resolver en el rediseño (`ExecutorV2.tsx:922-962`).
- **Dos rutas de teclado numérico coexisten**: `TypedKeypad` inline (Modal por-campo desde `ActiveSetRow`) y `KeypadHost` (edición). Duplicación a consolidar (`SetRow.tsx:893-949`, `KeypadHost.tsx`).

## Hallazgos

### 1. Entrada al ejecutor: "que toca hoy" (dashboard + tab)

Hay dos entradas al ejecutor. En el home, `ActiveProgramSection` muestra el programa activo con badge "Semana X de Y", `ProgramPhaseBar`, cola de días pendientes ("Recuperar Día X"), day-cards horizontales por estado (hoy/hecho/pendiente/próximo) y el link "Ver entreno de hoy →" (`ActiveProgramSection.tsx:34-135`). Todas navegan vía `onStart(planId)`.

En el tab `workout.tsx` hay un `TodayHero` con `ProgressRing` (series logueadas / objetivo) y CTA que alterna "Empezar / Continuar / Ver registro" según progreso, más una lista del resto de los días (`workout.tsx:290-345`). El progreso de hoy se computa consultando `workout_logs` acotado por los límites UTC del día en Santiago (`workout.tsx:126-142`). Es sólido y ya comunica progreso; el rediseño puede elevar el hero a algo más "vivo" (racha, próximo hito) sin reinventar la data.

La pantalla del ejecutor se resuelve en `app/alumno/workout/[planId].tsx`, que hace el switch por flag (ver §9).

### 2. Estructura del ejecutor y datos mostrados

`ExecutorV2` monta `WorkoutTimerProvider` y adentro `ExecutorV2Inner`, que consume `useWorkoutSession(planId)` (`ExecutorV2.tsx:115-130`). El `SessionHeader` muestra: título del plan, badge de semana/variante A-B, sublínea "Día X de Y" o "Programa semanal" prefijada por la fase, contador "ejercicio actual / total", "series completadas / requeridas", porcentaje de completitud, volumen acumulado (kg·reps) y el **cronómetro de sesión** con cap 4h (`ExecutorV2.tsx:241-276, 1092-1110`; timer en `workout-session.ts:581-588`).

El cuerpo se agrupa en secciones (calentamiento / bloque principal / etc.) y dentro en grupos `single` o `superset`, derivados por el motor de agrupación (`ExecutorV2.tsx:939-962`, `buildStepModel` :965-977). Hay dos modos de vista persistidos por dispositivo en `AsyncStorage` (`VIEW_MODE_KEY`): **Lista** (scroll con auto-scroll al siguiente incompleto y colapso a recap de los completados) y **Pasos** (`StepperExecution`, un paso a la vez con swipe + rail). El auto-scroll replica `scrollToNextIncomplete` del web con refs por bloque y por fila de ronda, gate "IfNeeded" y descuento de la barra fija y de la barra de descanso (`ExecutorV2.tsx:398-453`).

### 3. Card de ejercicio de fuerza y sus datos

`SingleExerciseCard` pinta, para fuerza: fila de tipo·músculo, botón "Detalles" (disclosure con técnica paso a paso, instrucciones, nota del coach, explicación de sobrecarga progresiva e historial de las últimas 5 sesiones), dots de progreso o check al completar, línea de prescripción (`sets × reps · kg · desc · tempo · RIR`), chip de sobrecarga progresiva, "Última vez" con tap-autofill que siembra la serie activa, "Supera tu marca", CTA "Técnica" (si hay gif/video) y CTA "Cambiar" (sustitución por máquina ocupada) (`SingleExerciseCard.tsx:257-465`). El peso objetivo sale del mismo motor de sobrecarga que la web (`computeEffectiveTarget`, `ExecutorV2.tsx:205-213`).

Juicio: es densa pero útil; casi todo es información accionable. El punto de fricción es que la **multimedia solo aparece al tocar "Técnica"** y abre un modal aparte, lo contrario de la visión "gif/video al centro sin tocar botones".

### 4. Tipos no-fuerza: cardio, movilidad y roller

Los bloques tipados reemplazan la línea de prescripción de fuerza por `TypedTargetGrid` (grilla de cards de objetivo) + `TypedBlockTimerButton` (`SingleExerciseCard.tsx:388-393`).

- **Cardio**: cards de Intervalos, Duración, Distancia, Pace objetivo, **Zona FC** y Rondas (`TypedTargetGrid.tsx:55-78`). La Zona FC muestra el rango bpm personalizado del alumno solo si el módulo `cardio` está habilitado y el bloque tiene `hr_zone` (`ExecutorV2.tsx:197-202`, `useClientCardioZones`); sin módulo cae a "Z{n}". El botón lanza `startInterval` (si el intervalo es cronometrable) o `startStopwatch` (`TypedTargetGrid.tsx:133-139`). El registro captura duración (min), distancia (m) y **FC promedio a mano** más RPE post-log.
- **Movilidad**: cards Hold (segundos), Series, Respiraciones y Lado; botón "Timer de hold" que lanza `startHold` (`TypedTargetGrid.tsx:80-84, 142-151`). Registra `actual_hold_sec` + RPE.
- **Roller**: cards Pasadas o Duración; botón "Timer"; registra `actual_duration_sec` y `reps_done` (pasadas) + RPE (`TypedTargetGrid.tsx:86-89`, `set-log-payload.ts`).

Juicio: la diferenciación por tipo existe y es correcta a nivel de datos, pero las **experiencias son estáticas comparadas con la visión**. Cardio no tiene progreso animado de "cuánto falta" salvo la barra de fase del `IntervalTimer`; no hay BPM en vivo. Movilidad muestra el `side_mode` como card pero el `HoldTimer` **no secuencia lado A → lado B** (solo tiene botón "Repetir", `HoldTimer.tsx:104-109, 206-214`). Roller cuenta pasadas por ingreso manual, no con un contador interactivo. Estos tres tipos son la mayor oportunidad de rediseño.

### 5. Captura de la serie: fila activa, teclado y esfuerzo

Toda serie sin registrar se pinta como fila de registro inline expandida `ActiveSetRow`: la protagonista grande, las futuras compactas (`SingleExerciseCard.tsx:189-238`, `SetRow.tsx:511-563`). Cada `FieldBox` (Kg/Reps o campos tipados) abre al tocarse el `TypedKeypad` dentro de un `Modal` con scrim (`SetRow.tsx:893-949`). El teclado es custom: display con pestañas de campo, grid 3×4 (dígitos, coma decimal, borrar con long-press = limpiar), **chips de incremento de peso con paso configurable** persistido por dispositivo (0,25/0,5/1/1,25/2,5/5 kg) y un único botón primario que alterna "Siguiente / Listo" (`TypedKeypad.tsx:414-581`, `WeightChips` :245-326).

El esfuerzo se captura con `EffortScale`: escala segmentada de dots 1-10 para RPE y RIR (misma escala entera, decisión CEO), con readout numérico y ayuda 1-tap sin jerga (`TypedKeypad.tsx:597-719`). **RPE/RIR solo se muestran en fuerza**; los tipados capturan solo RPE post-log (`SetRow.tsx:229-251`). La serie de fuerza también permite una nota rápida por serie que viaja al coach (`SetRow.tsx:842-890`). Todo el texto puro (append/backspace/incremento/formato es-CL) sale del motor compartido, sin drift.

Juicio: el teclado y las escalas de dots son excelentes, tocables (≥56px) y ya "grandes y dinámicos" como pide el CEO. La fricción es que la entrada numérica vive en un `Modal` por-campo y hay **dos rutas** (inline `TypedKeypad` vs `KeypadHost` de edición) que duplican lógica presentacional.

### 6. Familia de timers (descanso, hold, intervalo, cronómetro)

`WorkoutTimerProvider` orquesta **un solo timer activo a la vez** como overlay, con reemplazo suave (toast al cambiar de tipo), remount por `nonce` y `AnimatePresence` para animar la salida (`TimerProvider.tsx:79-221`). Los cuatro timers son background-safe: calculan el tiempo desde `endTime`/`startRef` (`Date.now()`), no acumulando ticks, y recomputan al volver de background vía `AppState` (`RestTimerBar.tsx:236-310`, `HoldTimer.tsx:75-99`, `StopwatchTimer.tsx:49-69`).

- **RestTimerBar**: descanso protagonista, barra inferior con anillo animado, tiempo mono gigante, ±15s, pausa/reset/cerrar, mute persistido, alarma háptica en loop cada 3s hasta 5 veces, beeps 3-2-1, pulso ember al llegar a 0, descanso de aproximación (warmup) con eyebrow propio y "Sigue · {ejercicio}" (`RestTimerBar.tsx`). Se dispara automáticamente al cerrar una serie de fuerza o una ronda completa de superserie, respetando el auto-timer y el guard de "editar serie ya cerrada no toca el descanso" (`ExecutorV2.tsx:495-577`).
- **HoldTimer**: cuenta regresiva compacta con `BlurView`, para isométricos/movilidad/roller, con botón "Repetir" (`HoldTimer.tsx`).
- **IntervalTimer**: fases warmup/work/recovery/cooldown con barra de progreso, "intervalo N de M", cue por cambio de fase y wake-lock opcional con toggle (`IntervalTimer.tsx:1-60`).
- **StopwatchTimer**: count-up con vueltas (laps), sin sonido ni háptica por paridad estricta con la web (`StopwatchTimer.tsx`).

Juicio: es lo más maduro del ejecutor y el mejor candidato a reutilizar tal cual. El descanso, sin embargo, es una **barra**, no una experiencia inmersiva fullscreen; y como el CEO pide "cronómetro de descanso usando capacidades nativas", conviene notar que eso ya está resuelto (ver §7).

### 7. Capacidades nativas ya integradas

- **Keep-awake**: `useKeepAwake()` mantiene la pantalla encendida toda la sesión (`ExecutorV2.tsx:124`); el `IntervalTimer` tiene además un toggle propio.
- **Háptica semántica rica**: `haptics` con intenciones (tap/select/setDone/success/pr/alarm) y `timerHaptics` que reproduce en Android los **patrones de ms exactos** de la web (`holdDone [200,100,400]`, `restAlarm [200,100,200,100,400]`, etc.), con fallback iOS (`haptics.ts`). La háptica es el canal primario y nunca se silencia.
- **Audio por timbre**: `expo-audio` (ya en `package.json`, assets `.wav` bundleados) con 4 timbres de alarma + tick, `playsInSilentMode: true` (suena con el switch físico en silencio, como Strong/Hevy), `duckOthers` para no cortar música (`sound.ts`).
- **Notificaciones locales**: `expo-notifications` programa el aviso "¡Descanso listo!" para background, con permiso pedido una sola vez (sancionado por el CEO), id estable, cola serializada y barrido de huérfanas — un hardening notable frente a MIUI/Xiaomi (`rest-notification.ts`).
- **Cronómetro vivo en bandeja/lockscreen**: `react-native-notify-kit` (fork mantenido de Notifee, en deps) dibuja un chronometer ongoing que corre con la pantalla apagada y el JS congelado; Android-only, no-op sin la lib (`rest-live-notification.ts`).
- **AppState**: recomputo de todos los timers al volver a foreground.
- **Confetti**: `react-native-fast-confetti` en el resumen de cierre (`WorkoutSummaryOverlay.tsx:16`).
- **Blur**: `expo-blur` en las cards de hold/intervalo/cronómetro.

### 8. Cierre de sesión y celebración

`WorkoutSummaryOverlay` es rico: confetti, detección de PRs con guard anti-falso (sustituciones no marcan récord), share-cards del PR con nombre es-CL y slug, mapa muscular (`MuscleMapSvg`), 1RM estimado (Epley), prompt de check-in post-entreno y hint de próxima sesión (`WorkoutSummaryOverlay.tsx:150-200`, `ExecutorV2.tsx:1235-1256`). La finalización drena la cola offline y, si quedan series sin sincronizar, ofrece "Esperar / Finalizar igual" vía `Alert` (adaptación del toast-con-acción del web) (`ExecutorV2.tsx:645-678`).

Juicio: la celebración de cierre es fuerte y ya "reacciona a tus logros". Lo que falta es reactividad **durante** la sesión: al marcar PR solo hay pulso dorado inline + háptica (`ExecutorV2.tsx:382-393`), sin el overlay fullscreen que sí tuvo la app y que se retiró por paridad 1:1 con la web (`ExecutorV2.tsx:388-391`).

### 9. Estado del flag `executorV2` y del `LegacyExecutor`

`FLAGS.executorV2 = true` por defecto en la rama `rnmobiledenuevo`, con override remoto (`flags.ts:6-39`). La pantalla monta `ExecutorV2` si está ON y `LegacyExecutor` si no (`[planId].tsx:11-15`). El comentario original describe el default como "fail-safe OFF", pero hoy está ON.

`LegacyExecutor` es un monolito de 936 líneas que usa componentes antiguos (`components/workout/RestTimer`, `WorkoutSummaryModal`) y su propio confetti (`LegacyExecutor.tsx:1-33`). Mientras el flag esté ON es **código muerto**: no recibe las mejoras de la nueva arquitectura y solo sirve de red de emergencia. El rediseño debería fijar el corte: promover ExecutorV2 a único ejecutor y retirar el legacy tras QA en device, para no arrastrar dos superficies.

### 10. Fricción de arquitectura y resiliencia

El cronómetro de sesión hace `setState` cada segundo (`workout-session.ts:581-588`), lo que re-renderiza `ExecutorV2Inner` 1×/s toda la sesión. El parche es memoizar `listBody` para que el árbol de la lista no se reconcilie por tick (un comentario extenso documenta el hitch de scroll que el CEO reportó, `ExecutorV2.tsx:922-962`). Es efectivo pero frágil: cualquier estado nuevo que dependa de `elapsedSec` reintroduce el problema. La resiliencia offline, en cambio, es robusta: snapshot por plan en `AsyncStorage`, reconciliación server∪local con `_pending`, cola de logs con reintento, y errores de sync por serie con chip rojo + "Reintentar" (`workout-session.ts:473-574`, `SetRow.tsx:54-102`).

## Recomendaciones para el rediseño (priorizadas)

1. **P0 — Cardio con Apple Watch / HealthKit (BPM, distancia, tiempo en vivo).** Es el hueco más grande frente a la visión. Hoy `actual_avg_hr` es manual y la Zona FC solo muestra el rango objetivo. Diseñar una experiencia cardio con lectura en vivo (HealthKit en iOS; `expo-sensors`/BLE o Health Connect en Android como fallback) y un progreso animado de "cuánto falta" por tiempo o distancia. Mantener el ingreso manual como degradación cuando no haya wearable.

2. **P0 — Multimedia del ejercicio visible al centro por defecto.** Sacar el gif/video del modal "Técnica" y mostrarlo en la card/paso, en loop silencioso, no invasivo (ya existe `VideoPlayer` con `expo-video`). Conservar el sheet solo para instrucciones paso a paso. Afecta `SingleExerciseCard`, `SupersetGroupCard` y `StepperExecution`.

3. **P1 — Experiencias únicas por tipo no-fuerza.** Movilidad: secuenciar holds por lado (lado A → cambio → lado B) usando `side_mode`, que hoy solo se muestra. Roller: contador interactivo de pasadas en vez de ingreso manual. Cardio: progreso animado con anillo/barra de distancia o tiempo restante. Reutilizar la máquina de fases del `IntervalTimer` y el motor puro.

4. **P1 — Reactividad tipo Duolingo durante la sesión.** Reintroducir celebraciones por-serie y por-ejercicio (el overlay de PR se retiró por paridad; en RN no hay obligación de espejar la web). Considerar interstitials fullscreen animados entre ejercicios en el modo Pasos, con copy motivacional. La "vibra" debe salir de color/animación/copy neutrales (nunca una mascota de marca), respetando white-label — el tema sport ya se resuelve en runtime por marca (`StepperExecution.tsx:99-110`).

5. **P1 — Descanso inmersivo opcional.** El `RestTimerBar` nativo (anillo, ±15s, alarma háptica, notificación de fin, cronómetro vivo en lockscreen) ya cumple "capacidades nativas del celular". Elevarlo a una vista fullscreen opcional entre series aprovecharía ese motor sin reescribirlo, y es la pieza más lista para reusar tal cual.

6. **P2 — Consolidar la arquitectura antes de decorar.** Aislar el cronómetro de sesión de la lista (contexto/selector dedicado) para eliminar el re-render 1×/s de raíz en vez de parchearlo. Unificar las dos rutas de teclado (`TypedKeypad` inline vs `KeypadHost`). Retirar `LegacyExecutor` y colapsar el flag tras QA en device. Preservar intactos el motor `@eva/workout-engine`/`@eva/cardio`, la resiliencia offline y el white-label, que son los cimientos correctos.

7. **P2 — Portar los extras nativos a la PWA donde sea posible.** La web hereda el diseño pero puede recuperar cerca de la paridad con Web Notifications, Vibration API y Wake Lock (que ya usa) para el descanso; documentar explícitamente qué queda solo-nativo (MediaSession de lockscreen, HealthKit) para no prometer paridad total.
