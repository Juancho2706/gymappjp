# 3. Temporizadores, descanso/alarma y resumen final

Esta sección documenta el subsistema de cronómetros del flujo de ejecución de rutina del alumno (`/c/[coach_slug]/workout/[planId]`) y la pantalla de cierre de sesión. Cubre el contexto global `WorkoutTimerProvider`, los 4 timers (`RestTimer`, `HoldTimer`, `IntervalTimer`, `Stopwatch`), el panel de ajustes `WorkoutTimerSettingsPanel` con su persistencia (`rest-timer-preferences.ts`), y el overlay de resumen `WorkoutSummaryOverlay`. El enfoque es el comportamiento funcional y los datos que entran/salen; nada de estilos.

> Archivos: `apps/web/src/app/c/[coach_slug]/workout/[planId]/` (`WorkoutTimerProvider.tsx`, `RestTimer.tsx`, `HoldTimer.tsx`, `IntervalTimer.tsx`, `Stopwatch.tsx`, `WorkoutTimerSettingsPanel.tsx`, `rest-timer-preferences.ts`, `WorkoutSummaryOverlay.tsx`) + libs `@/lib/audioUtils`, `@/lib/workout-interval`, `@/app/coach/clients/[clientId]/profileTrainingAnalytics`.

---

## 3.1 `WorkoutTimerProvider` — contexto global de timers

Es el coordinador único de todos los cronómetros. Vive como `WorkoutTimerProvider` (`'use client'`) y envuelve **todo** el árbol de `WorkoutExecutionClient` (montado en su línea 459, hijos = la rutina completa, cierra en 906). Expone el hook `useWorkoutTimer()`, que tira `Error('useWorkoutTimer must be used within a WorkoutTimerProvider')` si se usa fuera del provider.

### Contrato del contexto (`WorkoutContextType`)

El contexto expone exactamente 4 funciones de arranque (`apps/.../WorkoutTimerProvider.tsx`):

| Función | Firma | Qué arranca |
|---|---|---|
| `startRest` | `(timeStr: string \| null) => void` | `RestTimer` (descanso entre series, histórico) |
| `startHold` | `(seconds: number, label?: string) => void` | `HoldTimer` (isométricos / movilidad / roller) |
| `startInterval` | `(config: IntervalConfig, sets?: number) => void` | `IntervalTimer` (cardio por intervalos) |
| `startStopwatch` | `() => void` | `Stopwatch` (cronómetro libre count-up) |

> No expone `stop`/`close` al consumidor: el cierre lo maneja cada timer con su botón `X` que llama al `close` interno del provider (`setActive(null)`).

### Estado interno y regla de "un solo timer activo"

El estado es **un único timer activo a la vez**, modelado con la unión discriminada `ActiveTimer`:

```
type ActiveTimer =
  | { kind: 'rest'; seconds: number }
  | { kind: 'hold'; seconds: number; label?: string }
  | { kind: 'interval'; phases: IntervalPhase[] }
  | { kind: 'stopwatch' }
```

- `const [active, setActive] = useState<ActiveTimer | null>(null)` — `null` = ningún timer en pantalla.
- `const activeRef = useRef<ActiveTimer | null>(null)` mantiene un espejo síncrono de `active` (`activeRef.current = active` en cada render) para que `replaceWith` lea el estado actual sin closures viejos.
- El render condicional al final monta UNO de los 4 componentes según `active.kind` (líneas 114–123). Solo uno puede existir porque `active` es un único valor.

### `replaceWith` — reemplazo suave (AC5)

`replaceWith(next: ActiveTimer | null)` es el núcleo de la coordinación:

1. Si ya hay un timer corriendo (`activeRef.current`) **y** el nuevo es de **distinto** `kind`, dispara `toast.info('Temporizador anterior reemplazado')` (sonner). No avisa si es el mismo tipo (ej. iniciar otro descanso).
2. Fuerza remount aunque sea el mismo tipo: `setActive(null)` y luego, tras `setTimeout(... , 10)` ms, `setActive(next)`. Ese ciclo null→next garantiza desmontar el timer viejo y montar uno nuevo desde cero (reinicia el conteo; sin esto, React reutilizaría la instancia y el `initialSeconds` no se reaplicaría).

Cada `start*` envuelve `replaceWith` con validación previa:

- **`startRest(timeStr)`**: parsea `timeStr` con `parseRestTime` → solo arranca si `seconds > 0`.
- **`startHold(seconds, label)`**: solo si `Number.isFinite(seconds) && seconds > 0`; redondea con `Math.round`.
- **`startInterval(config, sets=1)`**: construye fases con `buildIntervalPhases(config, sets)` (`@/lib/workout-interval`). Si el resultado es `[]` (work por distancia, no cronometrable) muestra `toast.info('Este bloque se prescribe por distancia — usa el cronómetro')` y **no** arranca.
- **`startStopwatch()`**: arranca directo, sin parámetros.

### `parseRestTime` — normalización del string de descanso

Función pura (líneas 41–68) que convierte el `rest_time` del bloque (string libre que viene del builder) a segundos:

- `"01:30"` / `"1:30"` → `m*60 + s` (split por `:`).
- `"90s"`, `"90 sec"` (contiene `s`) → `parseInt` directo en segundos.
- `"1 min"`, `"1m"` (contiene `m`) → `parseInt * 60`.
- `"90"` (solo número) → `parseInt`.
- `null` / no parseable → `0` (no arranca el timer).

> Backend-relevante: el descanso NO se persiste como número; el plan lleva `block.rest_time` como texto libre y el parseo es 100% client-side al momento de iniciar el descanso.

### Quién dispara cada `start*`

Los disparadores viven en `WorkoutExecutionClient.tsx` y `LogSetForm.tsx`:

- **`ManualTimerButton`** (línea 124–135): botón "Descanso (90s)" en el footer fijo; `onClick={() => startRest(defaultTime || '90')}` (llamado con `defaultTime={'90'}` desde el footer, línea 748).
- **`TypedBlockTimerButton`** (línea 215–259), según `WorkoutKind` del bloque:
  - cardio con `interval_config` cronometrable (`isTimeableInterval`) → botón "Iniciar intervalos" → `startInterval(config, block.sets || 1)`.
  - cardio sin intervalos cronometrables → botón "Cronómetro" → `startStopwatch()`.
  - mobility/roller con `duration_sec > 0` → botón "Timer de hold (Ns)" / "Timer (Ns)" → `startHold(seconds, kind === 'mobility' ? 'Hold' : 'Roller')`.
- **Auto-timer al guardar serie** (en `LogSetForm`): tras `addOptimisticLogged(true)`, si `autoTimerEnabled && !isLogged` (y para el form tipado, además `restTimeStr` presente), vibra `navigator.vibrate(50)` y llama `startRest(restTimeStr)`. Esto es el corazón del "el descanso empieza solo al guardar cada serie".

---

## 3.2 `RestTimer` — descanso entre series (cuenta regresiva + alarma)

`RestTimer({ initialSeconds, onClose })`. Es el timer histórico y el más rico (auto-inicio, alarma sonora repetida, vibración, notificación push, Wake Lock, Media Session).

### Estado

- `timeLeft` (segundos restantes, init `initialSeconds`), `totalSeconds` (para el arco de progreso), `isActive` (corriendo/pausado, init `true`), `isEditing` (modo edición de duración), `editValue` (string del input), `isAlarmRinging`.
- Refs: `endTimeRef` (timestamp absoluto de fin = `Date.now() + timeLeft*1000`), `isAlarmRingingRef`, `alarmIntervalRef`, `alarmCountRef`.
- `useEffect([initialSeconds])` reinicia todo cuando cambia `initialSeconds` (relevante porque el provider remonta, pero también cubre el cambio in-place).

### Conteo regresivo (drift-free)

`useEffect([isActive, timeLeft, triggerAlarm])`: con `isActive && timeLeft > 0`, fija `endTimeRef = Date.now() + timeLeft*1000` (si no existía) y corre un `setInterval` **cada 500 ms** que recalcula `timeLeft = Math.max(0, Math.ceil((endTimeRef - Date.now())/1000))`. Usar timestamp absoluto (no decremento) lo hace resistente a throttling del navegador en background y a tabs inactivas. Al llegar a `0` llama `triggerAlarm()`.

### Alarma (`triggerAlarm`)

Idempotente vía `isAlarmRingingRef` (no re-dispara si ya suena). Al activarse:

1. Lee preferencias `readRestTimerSound()` y `readRestTimerVolume()` (de `rest-timer-preferences`).
2. Marca `isAlarmRinging = true`, `alarmCountRef = 1`, suena `playTimerSound(sound, volume)`.
3. Abre un `setInterval` **cada 3000 ms**: incrementa `alarmCountRef`; si supera 5, `stopAlarm()`; si no, vuelve a sonar (releyendo sonido/volumen cada vez) y vibra `navigator.vibrate([200,100,200,100,400])`. → la alarma se repite hasta ~5 veces o hasta interacción.
4. **Notificación**: si `'Notification' in window`, `Notification.permission === 'granted'` y `document.visibilityState !== 'visible'` (app en background), usa `navigator.serviceWorker.ready` → `registration.showNotification('¡Tiempo de Descanso Terminado!', { body, icon: BRAND_APP_ICON, vibrate, tag: 'rest-timer', requireInteraction: true })`.
5. Vibra una vez de inmediato y pone `isActive = false`, `endTimeRef = null`.

**Parada de alarma**: `useEffect([isAlarmRinging, stopAlarm])` registra listeners globales `click` y `touchstart` mientras suena; cualquier toque del usuario llama `stopAlarm()` (limpia el interval, resetea `alarmCountRef`). El texto "Toca para detener" en la notificación refleja esto.

### Controles de UI

- **Editar (lápiz)**: alterna `isEditing`, carga `editValue = timeLeft`, y al entrar a edición pausa (`setIsActive(false)`). `saveEdit()` parsea `editValue` (clamp a `>= 0`), reaplica `timeLeft`/`totalSeconds` y reajusta `endTimeRef`.
- **Play/Pause**: `toggleTimer` → `setIsActive(!isActive)`.
- **Reset (`RotateCcw`)**: `stopAlarm()`, vuelve a `initialSeconds`, limpia `endTimeRef`, reactiva.
- **Cerrar (`X`)**: `onClose` → el provider hace `setActive(null)`.

### Wake Lock y Media Session

- `useEffect` de Wake Lock: pide `navigator.wakeLock.request('screen')` si está disponible y la pestaña es visible; re-adquiere en `visibilitychange`; libera en cleanup. Mantiene la pantalla encendida durante el descanso.
- `useEffect([isActive])` de **Media Session API**: si `isActive`, publica `MediaMetadata` (`title: 'Descanso activo'`, `artist: 'M:SS restantes'`, `album: 'EVA Fitness'`, artwork `BRAND_APP_ICON`) y registra handlers `play`/`pause` → permite controlar el timer desde pantalla de bloqueo / audífonos.

### Progreso visual

Arco SVG: `percentage = (timeLeft / (totalSeconds || 1)) * 100`, `strokeDashoffset = 176 - 176*min(100,pct)/100`. Texto central `formatTime(timeLeft)` (`M:SS`). Estado de cabecera: "Descanso / Recupérate" mientras corre, "¡Tiempo!" al llegar a 0.

---

## 3.3 `HoldTimer` — isométricos / movilidad / roller

`HoldTimer({ initialSeconds, label, onClose })`. Cuenta regresiva simple para holds (movilidad, foam roller, isométricos). Aparece desde `startHold` (botón "Timer de hold" en bloques mobility/roller con `duration_sec > 0`). El `label` es `'Hold'` (mobility) o `'Roller'` (roller).

- Estado: `timeLeft` (init `initialSeconds`), `isActive` (init `true`), refs `endTimeRef`, `firedRef` (idempotencia del "done").
- Conteo: `setInterval` **cada 250 ms** con la misma técnica de `endTimeRef` absoluto; `next === 0` dispara `triggerDone()`.
- **`triggerDone`** (una sola vez por `firedRef`): suena `playTimerSound(readRestTimerSound(), readRestTimerVolume())` como canal **primario** (comentario del código: iOS no vibra de forma fiable, por eso el beep es el aviso principal), refuerza con `navigator.vibrate([200,100,400])`, pone `isActive = false`. No hay alarma repetida ni notificación (a diferencia de `RestTimer`).
- Controles: Pausar/Reanudar, **Repetir** (`restart`: resetea `firedRef`, `timeLeft = initialSeconds`, reactiva — pensado para "siguiente set o lado"), Cerrar.
- Cabecera: `label || 'Hold'` arriba; "Mantén la posición" mientras corre, "¡Listo! Cambia de lado o set" al terminar. Respeta `useReducedMotion`.

---

## 3.4 `IntervalTimer` — cardio por intervalos (máquina de fases)

`IntervalTimer({ phases, onClose })`. Recibe ya construida la lista de fases `IntervalPhase[]`; la construcción la hace el provider con `buildIntervalPhases` antes de montar.

### Construcción de fases (`@/lib/workout-interval`)

`buildIntervalPhases(config: IntervalConfig, sets=1)` arma la secuencia:

- `total = repeats × sets` (ambos `>= 1`, redondeados).
- `workSec = config.work?.duration_sec ?? 0`; si `<= 0` (work por distancia, no por tiempo) devuelve `[]` → el provider muestra el toast "usa el cronómetro" y no arranca.
- Secuencia: `warmup` (si `warmup_sec > 0`) → por cada `i` de 1..total: `work` `{ repeat: i, totalRepeats: total }`, seguido de `recovery` (si `recovery.duration_sec > 0` y `i < total`; la última recovery se omite) → `cooldown` (si `cooldown_sec > 0`).
- Tipos de fase: `'warmup' | 'work' | 'recovery' | 'cooldown'`. Etiquetas es-neutro en `INTERVAL_PHASE_LABEL` (Calentamiento / Trabajo / Recuperación / Vuelta a la calma).
- Helpers relacionados: `intervalTotalDurationSec` (suma de duraciones), `isTimeableInterval` (¿hay `work.duration_sec > 0`?).
- `INTERVAL_TEMPLATES` (plantillas system v1, en código, no en DB): `track-8x400`, `vo2-6x1min`, `continuo-20min-z2`, `fartlek-10x30-30`, `hyrox-compromised-run` — usadas por el coach, no por la ejecución del alumno directamente.

### Comportamiento del timer

- Estado: `phaseIndex` (init 0), `timeLeft` (init `phases[0].durationSec`), `isActive` (init `true`), `finished`, `wakeLockOn`. Refs `endTimeRef`, `wakeLockRef`, `phaseIndexRef` (espejo síncrono del índice para `advance`).
- Conteo: `setInterval` **cada 250 ms**, `endTimeRef` absoluto; `next === 0` → `advance()`.
- **`advance()`**: pasa a `phaseIndexRef + 1`. Si excede `phases.length`: `beep(true)` (doble vibración `[200,100,200,100,400]`), `finished = true`, `isActive = false`. Si no: `beep(false)` (vibración `[200,100,200]`), actualiza índice, `timeLeft` y `endTimeRef` a la nueva fase. `beep` siempre suena `playTimerSound(readRestTimerSound(), readRestTimerVolume())` — beep en **cada cambio de fase**.
- **Wake Lock con toggle visible** (botón `Sun`): a diferencia de `RestTimer` (Wake Lock automático), aquí es **opt-in** por gesto. `toggleWakeLock` adquiere/libera; `useEffect([wakeLockOn])` re-adquiere en `visibilitychange` y muestra el aviso "Pantalla siempre encendida activa — consume más batería". Decisión del SPEC por el costo de batería en sesiones largas de cardio.
- Controles (solo si `!finished`): Pausar/Reanudar, **Saltar fase** (`SkipForward` → `advance()`). Siempre: toggle Wake Lock y Cerrar.
- UI: muestra la etiqueta de fase coloreada + "intervalo N de M" (de `phase.repeat`/`phase.totalRepeats`), `formatTime(timeLeft)` grande, barra de progreso de la fase actual, y "¡Intervalos completados!" al finalizar.

---

## 3.5 `Stopwatch` — cronómetro libre count-up

`Stopwatch({ onClose })`. Cronómetro ascendente para cardio continuo / por distancia (cuando no hay fases cronometrables). Aparece desde `startStopwatch`.

- Estado: `elapsed` (segundos), `isActive` (init `true`), `laps` (array de vueltas). Refs `startRef` (`Date.now()` del último arranque) y `accumulatedRef` (acumulado de tramos previos a pausas).
- Conteo: `setInterval` **cada 250 ms**: `elapsed = accumulatedRef + floor((Date.now() - startRef)/1000)`.
- **Pausa** (`togglePause`): al pausar suma el tramo activo a `accumulatedRef`; al reanudar el effect resetea `startRef`.
- **Vueltas** (`addLap`, botón `Flag`): guarda `elapsed` al frente, máximo 5 (`.slice(0,5)`), etiquetadas `V1..Vn`.
- **Reset**: cero todo (`accumulatedRef=0`, `elapsed=0`, `laps=[]`).
- `formatTime`: incluye horas si `>= 3600` (`H:MM:SS`), si no `M:SS`.
- No suena alarma ni vibra (es libre, no tiene fin).

---

## 3.6 `WorkoutTimerSettingsPanel` + `rest-timer-preferences` — ajustes y persistencia

El panel se abre en un `Dialog` ("Descanso y alarma") desde `WorkoutExecutionClient` (línea 760–777). Props: `autoTimerEnabled` y `onToggleAutoTimer`.

### Secciones del panel

1. **Cronómetro automático** (toggle): "Si está activado, el descanso empieza solo al guardar cada serie." Llama `onToggleAutoTimer`. Refleja `autoTimerEnabled`.
2. **Alarma**:
   - **Sonido** (`<select>`): `digital` (Digital), `bell` (Campana), `classic` (Clásico), `boxing` (Boxeo). Al cambiar, `setSoundPersist(type)` **y** reproduce `playTimerSound(type, volume)` como preview.
   - **Volumen** (`<input type=range>` 0..1, paso 0.1): `setVolumePersist(next)` + preview `playTimerSound(sound, next)`.
3. **Permisos de notificación** (condicional): al montar, lee `Notification.permission`. Si `=== false` (denegado/no concedido), muestra bloque "Alertas en segundo plano" con botón **Activar permisos** → `Notification.requestPermission()`; si concede, dispara una `Notification('¡Notificaciones activadas!', ...)` de confirmación. Si `'Notification'` no existe en el navegador, muestra el aviso "Este navegador no soporta notificaciones; mantén la app visible para oír la alarma."

### Persistencia (`rest-timer-preferences.ts`)

Todas las preferencias de alarma viven en **`localStorage`** (no en DB), por dispositivo/navegador:

| Key | Constante | Contenido | Default |
|---|---|---|---|
| `restTimerSound` | `REST_TIMER_SOUND_KEY` | `TimerSound` (`digital`/`bell`/`classic`/`boxing`) | `'digital'` |
| `restTimerVolume` | `REST_TIMER_VOLUME_KEY` | número 0–1 (string) | `1` |
| `omni_autotimer` | `OMNIAUTOTIMER_KEY` | `'true'`/`'false'` (gestionado en `WorkoutExecutionClient`) | `true` |

- `readRestTimerSound()` valida contra `VALID_SOUNDS`, cae a `'digital'`. `readRestTimerVolume()` clampa a `[0,1]`, cae a `1`.
- `writeRestTimerSound` / `writeRestTimerVolume` escriben y disparan un `CustomEvent('rest-timer-prefs-changed')` en `window`.
- `useRestTimerPreferences()` mantiene estado React (`sound`, `volume`) sincronizado: escucha el evento `storage` (otras pestañas) y `rest-timer-prefs-changed` (misma pestaña) para refrescar. Expone `setSoundPersist`, `setVolumePersist`, `refreshFromStorage`.
- **Quién lee las preferencias en runtime**: cada timer (`RestTimer.triggerAlarm`, `HoldTimer.triggerDone`, `IntervalTimer.beep`) llama `readRestTimerSound()`/`readRestTimerVolume()` directo de `localStorage` en el momento de sonar — así un cambio de preferencia aplica sin re-montar el timer.

> **Gotcha de paridad (backend/estado):** `autoTimerEnabled` se inicializa **hardcodeado a `true`** en `WorkoutExecutionClient` (`useState(true)`); `toggleAutoTimer` SOLO **escribe** `localStorage.setItem('omni_autotimer', ...)`, y **no existe ningún `getItem('omni_autotimer')`** en el cliente. Es decir, la preferencia de auto-timer se persiste pero **nunca se vuelve a leer al recargar** → siempre arranca en `true`. Cualquier rediseño con feature parity debe replicar este comportamiento (o corregirlo conscientemente).

### `playTimerSound` (`@/lib/audioUtils`)

Genera los 4 sonidos **sintéticamente con Web Audio API** (`AudioContext` / `webkitAudioContext`), sin assets de audio. Si el contexto está `suspended` (autoplay policy) llama `ctx.resume()`. Cada sonido es una composición de osciladores:

- `digital`: 3 beeps `square` a 1000 Hz.
- `bell`: 1 oscilador `sine` 800 Hz con decay ~1.5 s.
- `classic`: 4 beeps `triangle` 2000 Hz.
- `boxing`: 2 osciladores (`sine` 600 Hz + `square` 1200 Hz), decay ~1.0 s, metálico/fuerte.

El `volume` (0–1) escala las ganancias. Envuelto en try/catch (errores a `console.error`). El beep funciona como canal primario en iOS (donde la vibración no es fiable).

---

## 3.7 `WorkoutSummaryOverlay` — cierre de sesión (resumen + celebración)

### Disparo y montaje

- El alumno toca **"Finalizar entrenamiento"** (footer fijo, `handleFinish` línea 454) → `setShowCompleted(true)`.
- Cuando `showCompleted`, se monta vía `createPortal(..., document.body)` (línea 780–789), por encima de todo (`z-[9999]`).
- Props que recibe (`WorkoutSummaryOverlayProps`):
  - `planTitle` = `plan.title`.
  - `logs` = `sessionLogs` (estado vivo de la sesión: cada `{ block_id, weight_kg, reps_done, rpe, set_number }`). `sessionLogs` arranca con los `logs` que llegan del server y se actualiza optimistamente con cada `handleLogged`.
  - `blocks` = `plan.workout_blocks` (cada uno con `id`, `exercises` (objeto o array → se normaliza con `normalizeExercise` tomando `[0]`), `sets`).
  - `exerciseMaxes` = `Record<exerciseId, number>` (máximo histórico de peso por ejercicio, calculado server-side; usado para detectar PRs).
  - `onDone` = `() => router.push(`${base}/dashboard`)` → **vuelve al dashboard del alumno**.

> Importante: el overlay **no guarda nada** ni dispara acciones de servidor. Es 100% lectura/cálculo client-side sobre `sessionLogs` que YA fueron persistidos serie a serie por `logSetAction` durante el entreno. "Finalizar" es solo navegación + resumen; no hay un "cierre de sesión" transaccional en DB. Cada serie se guardó de forma independiente (con cola offline) en `workout_logs`.

### Cálculos del resumen (todos `useMemo`)

1. **`exerciseBreakdown`**: recorre `blocks`, normaliza el ejercicio, filtra `logs` por `block_id`; salta bloques sin logs. Por ejercicio (agregado por `exercise.id`, sumando varios bloques del mismo ejercicio) calcula:
   - `totalVolume = Σ (weight_kg ?? 0) × (reps_done ?? 0)`.
   - `maxWeight` = peso máximo de la sesión.
   - `best1RM` = máximo `epleyOneRM(w, r)` de la sesión.
   - `sets` = los logs concatenados.
2. **`detectedPRs`**: por cada ejercicio donde `exerciseMaxes[id] != null && maxWeight > historicMax`:
   - identifica el set de mayor peso (`setAtMax`) y sus `repsAtMax`.
   - `pct` = mejora porcentual sobre el máximo histórico (`((max - prev)/prev)*100`, 1 decimal; `100` si prev era 0).
   - `estimated1RM` = `epleyOneRM(maxWeight, max(1, repsAtMax))` redondeado a 1 decimal.
   - → produce el bloque "🏆 N récord(s) personal(es)" con `prevKg → newKg (+pct%)` y "1RM estimado".
3. **`muscleGroupVolume`**: agrupa `totalVolume` por `muscle_group`, ordena desc, normaliza a % del mayor → barras "Volumen por grupo".
4. **Totales de cabecera** (sin memo): `completedSets = logs.length`, `totalReps = Σ reps_done`, `totalVolume = Σ (weight×reps)` (mostrado redondeado en kg).

> `epleyOneRM(weightKg, reps)` (de `profileTrainingAnalytics.ts`): `weight × (1 + reps/30)`; devuelve 0 si peso o reps `<= 0`. Es el mismo estimador usado en el dashboard del cliente (consistencia de PRs).

### Celebración / confeti

`useEffect` al montar dispara `canvas-confetti` (import dinámico, maneja el wrap `{ default }` de CommonJS):

- Si hay PRs: una ráfaga grande (`particleCount: 200, spread: 100, origin y:0.5`) + dos laterales escalonadas a 300 ms y 500 ms.
- Si no hay PRs: una sola ráfaga moderada (`particleCount: 80, spread: 70`).
- Respeta `useReducedMotion` para las animaciones de entrada (no para el confeti en sí).

### Compartir y salida

- **Compartir logro** (`handleShare`): arma el texto `¡Completé "<plan>"! 💪 N series · N reps · N kg` (+ `🏆 N récord(s)!` si hay PRs). Usa `navigator.share` si existe; si no, `navigator.clipboard.writeText` y muestra "Copiado" 2 s.
- **Volver al inicio**: llama `onDone()` → `router.push(.../dashboard)`.

---

## 3.8 Notas transversales para el rediseño (paridad)

- **Un solo timer global**: el rediseño debe mantener la invariante de "un timer activo" y el reemplazo suave con toast. No hay timers concurrentes.
- **Conteo por timestamp absoluto** (`endTimeRef`), no por decremento — clave para precisión en background. Intervalos de tick: `RestTimer` 500 ms; `HoldTimer`/`IntervalTimer`/`Stopwatch` 250 ms.
- **Alarma solo en `RestTimer`** es repetida (5×/3 s) + notificación push en background; `HoldTimer`/`IntervalTimer` solo beep + vibración puntual; `Stopwatch` no avisa.
- **Beep como canal primario** (iOS no vibra fiable) — siempre via `playTimerSound` con preferencias leídas en vivo de `localStorage`.
- **Wake Lock**: automático en `RestTimer`, opt-in con toggle en `IntervalTimer`, ausente en `HoldTimer`/`Stopwatch`.
- **Preferencias en `localStorage`**, por dispositivo, no en DB; sincronizadas entre pestañas vía evento `storage` + `rest-timer-prefs-changed`.
- **El resumen no toca backend**: la persistencia ocurrió serie a serie durante el entreno; "Finalizar" es resumen + navegación. PRs se calculan comparando `sessionLogs` contra `exerciseMaxes` (histórico server-side).
- **Bug conocido de persistencia**: `omni_autotimer` se escribe pero nunca se lee al montar (siempre `true`).
