/**
 * PUENTE entre los botones de la notificación del descanso y el motor React (QA-11 · fase 2,
 * "notificación operable": Pausar / +15 s / Saltar / Reanudar con la app en BACKGROUND).
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────────
 * `notifee.onBackgroundEvent` corre con el JS "headless": la app puede estar en background o
 * cerrada, y ahí NO hay componente montado, ni hooks, ni estado de React al que llamarle. Un
 * handler no puede tocar `useRestTimerEngine` directamente. La única forma correcta es un store a
 * nivel de MÓDULO (vive en el bundle, no en el árbol) con dos direcciones:
 *   · ESPEJO hacia afuera (`setRestLiveSnapshot`): el motor publica su estado absoluto en cada
 *     TRANSICIÓN, así el handler headless sabe hasta cuándo corre el descanso sin preguntarle a
 *     nadie. La notificación NUNCA es la fuente de verdad en foreground; el snapshot es su copia.
 *   · COLA hacia adentro (`subscribeRestRemoteCommands` / `drainRestRemoteCommands`): el handler
 *     encola qué pasó y el motor lo consume cuando esté vivo (de inmediato si lo está).
 *
 * ── QUIÉN MUEVE EL RELOJ (evita el DOBLE-APPLY) ────────────────────────────────
 * El handler es quien ACTÚA sobre las notificaciones (no puede esperar a React: en background el
 * motor puede tardar minutos en correr, o no correr nunca). Entonces el handler:
 *   1. calcula el NUEVO `endEpochMs` absoluto,
 *   2. lo escribe en el snapshot,
 *   3. re-pinta la notificación viva y re-programa la alerta final de expo,
 *   4. encola el comando.
 * Cuando el motor consume el comando NO vuelve a aplicar el delta: ADOPTA el `endEpochMs` del
 * snapshot. Sumar 15 s otra vez sería el clásico doble-apply (+30 s reales por un solo toque).
 * Esa regla está testeada en `tests/mobile/rest-remote-commands.test.ts`.
 *
 * ── SEGURIDAD ──────────────────────────────────────────────────────────────────
 * NO-OP total si `getNotifee()` es null (builds sin la lib nativa enlazada — ver la cabecera de
 * `live-timer-notification.ts`), y TODO va con try/catch tragado: una falla del puente jamás puede
 * romper la app ni el cronómetro in-app.
 */
import { getActionPressEventType, type NotifeeEvent } from './live-timer-notification'
import { registerNotificationActionHandler } from './notification-events'
import {
  REST_ACTION_PAUSE,
  REST_ACTION_PLUS15,
  REST_ACTION_PREFIX,
  REST_ACTION_RESUME,
  REST_ACTION_SKIP,
  REST_LIVE_NOTIF_ID,
  REST_PLUS_SECONDS,
  showRestLiveCountdown,
  showRestPausedNotice,
  stopRestLiveCountdown,
  type RestLiveContext,
} from './rest-live-notification'
import {
  cancelRestEndNotification,
  dismissRestEndNotification,
  scheduleRestEndNotification,
} from './rest-notification'

/** Comandos que un botón de la notificación puede pedirle al motor. */
export type RestRemoteCommandType = 'pause' | 'resume' | 'plus15' | 'skip'

export interface RestRemoteCommand {
  type: RestRemoteCommandType
  /** `Date.now()` del press (útil para depurar/ordenar; el motor deriva del snapshot). */
  atMs: number
}

/**
 * Espejo module-level del descanso VIVO. Lo escribe el motor en cada transición y lo re-escribe el
 * handler cuando mueve el reloj desde background.
 */
export interface RestLiveSnapshot {
  /**
   * Instante ABSOLUTO de fin (`Date.now()` + restante). `null` = pausado/detenido: entonces la
   * verdad son los `remainingSeconds` congelados.
   */
  endEpochMs: number | null
  /** Segundos restantes. Con `endEpochMs` corriendo es informativo; en pausa es la VERDAD. */
  remainingSeconds: number
  /** Duración con la que arrancó el descanso (para copys/diagnóstico). */
  initialSeconds: number
  /** Mute global del cronómetro al momento del snapshot. */
  muted: boolean
  /** Contexto visual (ejercicio que sigue, serie, logo del coach) para re-pintar la notificación. */
  context?: RestLiveContext
}

let snapshot: RestLiveSnapshot | null = null
let pending: RestRemoteCommand[] = []
const listeners = new Set<() => void>()

/** Publica el estado del descanso vivo (lo llama el motor en cada transición). */
export function setRestLiveSnapshot(next: RestLiveSnapshot): void {
  snapshot = next
}

/**
 * Borra el espejo (descanso cerrado/saltado/desmontado) y DESCARTA los comandos aún pendientes.
 *
 * Lo segundo no es un extra: un comando sólo tiene sentido para el descanso que estaba vivo cuando
 * se tocó el botón. Sin este descarte, un press que nadie alcanzó a consumir (el motor ya se
 * desmontó) quedaría en la cola y lo consumiría el descanso SIGUIENTE — un "Saltar" viejo cerrando
 * de golpe el descanso recién iniciado. Los handlers que sí quieren dejar comando (p.ej. `skip`)
 * encolan DESPUÉS de limpiar.
 */
export function clearRestLiveSnapshot(): void {
  snapshot = null
  pending = []
}

/** Lectura del espejo (la usa el motor para ADOPTAR el reloj que movió el handler). */
export function getRestLiveSnapshot(): RestLiveSnapshot | null {
  return snapshot
}

/** Vacía y devuelve los comandos pendientes (el motor los aplica en orden). */
export function drainRestRemoteCommands(): RestRemoteCommand[] {
  if (pending.length === 0) return []
  const out = pending
  pending = []
  return out
}

/**
 * Suscribe al motor a los comandos remotos. El callback se dispara al encolar Y —importante—
 * INMEDIATAMENTE si ya hay pendientes: un press puede haber ocurrido con la app en background
 * antes de que el motor montara/se suscribiera, y ese comando no puede perderse.
 * Devuelve el unsubscribe.
 */
export function subscribeRestRemoteCommands(cb: () => void): () => void {
  listeners.add(cb)
  if (pending.length > 0) {
    try {
      cb()
    } catch {
      // Un consumidor que falla no puede tumbar el puente.
    }
  }
  return () => {
    listeners.delete(cb)
  }
}

function enqueueCommand(type: RestRemoteCommandType): void {
  pending.push({ type, atMs: Date.now() })
  listeners.forEach((cb) => {
    try {
      cb()
    } catch {
      // no-op
    }
  })
}

/** Segundos restantes según el snapshot (corriendo → derivado del reloj; en pausa → congelados). */
function remainingFrom(snap: RestLiveSnapshot): number {
  if (snap.endEpochMs != null) return Math.max(0, Math.ceil((snap.endEpochMs - Date.now()) / 1000))
  return Math.max(0, Math.round(snap.remainingSeconds))
}

async function handlePlus15(snap: RestLiveSnapshot): Promise<void> {
  // `max(end, now)`: si el descanso ya venció mientras el JS dormía, +15 s cuenta desde AHORA
  // (no desde un pasado, que daría una notificación que nace muerta).
  const base = Math.max(snap.endEpochMs ?? 0, Date.now())
  const endEpochMs = base + REST_PLUS_SECONDS * 1000
  setRestLiveSnapshot({
    ...snap,
    endEpochMs,
    remainingSeconds: Math.max(0, Math.ceil((endEpochMs - Date.now()) / 1000)),
  })
  await showRestLiveCountdown(endEpochMs, snap.context)
  await scheduleRestEndNotification((endEpochMs - Date.now()) / 1000)
  enqueueCommand('plus15')
}

async function handlePause(snap: RestLiveSnapshot): Promise<void> {
  const remainingSeconds = remainingFrom(snap)
  setRestLiveSnapshot({ ...snap, endEpochMs: null, remainingSeconds })
  // Orden: primero se retira el cronómetro y su alerta programada, después se pinta el estado
  // estático. Secuencial (no en paralelo) para que el cancel jamás llegue DESPUÉS del display y
  // deje al alumno sin notificación ni forma de reanudar.
  await stopRestLiveCountdown()
  await cancelRestEndNotification()
  await showRestPausedNotice(remainingSeconds, snap.context)
  enqueueCommand('pause')
}

async function handleResume(snap: RestLiveSnapshot): Promise<void> {
  const remainingSeconds = remainingFrom(snap)
  if (remainingSeconds <= 0) {
    // Nada que reanudar: se trata como saltar (limpia y deja que el motor cierre).
    await handleSkip()
    return
  }
  const endEpochMs = Date.now() + remainingSeconds * 1000
  setRestLiveSnapshot({ ...snap, endEpochMs, remainingSeconds })
  await showRestLiveCountdown(endEpochMs, snap.context)
  await scheduleRestEndNotification(remainingSeconds)
  enqueueCommand('resume')
}

async function handleSkip(): Promise<void> {
  clearRestLiveSnapshot()
  await stopRestLiveCountdown()
  await cancelRestEndNotification()
  await dismissRestEndNotification()
  enqueueCommand('skip')
}

/**
 * Handler ÚNICO de los eventos de notificación (background y foreground comparten cuerpo: la
 * acción debe hacer exactamente lo mismo esté la app donde esté). Nunca lanza.
 */
export async function handleRestNotificationEvent(event: NotifeeEvent): Promise<void> {
  try {
    if (!event || event.type !== getActionPressEventType()) return
    const actionId = event.detail?.pressAction?.id
    if (!actionId) return
    // Filtro por id de notificación: el mismo handler recibe eventos de CUALQUIER notificación de
    // la app (cardio, push…). Sin id (algunos OEM lo omiten) seguimos, porque los ids de acción del
    // descanso son únicos de todos modos.
    const notifId = event.detail?.notification?.id
    if (notifId && notifId !== REST_LIVE_NOTIF_ID) return

    if (actionId === REST_ACTION_SKIP) {
      await handleSkip()
      return
    }
    const snap = snapshot
    if (!snap) return // sin descanso vivo no hay nada que mover
    if (actionId === REST_ACTION_PLUS15) await handlePlus15(snap)
    else if (actionId === REST_ACTION_PAUSE) await handlePause(snap)
    else if (actionId === REST_ACTION_RESUME) await handleResume(snap)
  } catch {
    // Un fallo del puente nunca rompe la app.
  }
}

/**
 * Anota el handler del descanso en el REGISTRO ÚNICO de eventos de notificación
 * (`notification-events.ts`).
 *
 * ── POR QUÉ YA NO REGISTRA `onBackgroundEvent` ACÁ (refactor, ronda cardio) ─────
 * Notifee/notify-kit admite UN SOLO handler de background por app (`backgroundEventHandler =
 * observer` sobre una variable de módulo, verificado en `react-native-notify-kit@10.4.8`). Al sumar
 * los botones de CARDIO, un segundo registro habría PISADO éste y el descanso se habría quedado sin
 * botones en background, en silencio. Ahora el registro nativo es único y compartido, y despacha por
 * prefijo de action id (`rest-*` acá, `cardio-*` en `cardio-remote-commands.ts`).
 *
 * La FIRMA no cambia: `app/_layout.tsx` la sigue llamando a nivel de MÓDULO —no dentro de un
 * componente— porque el handler headless debe existir antes de que Android levante el bundle para
 * atender un press. Idempotente. NO-OP total sin lib nativa. Nunca lanza.
 */
export function registerRestNotificationEvents(): void {
  registerNotificationActionHandler(REST_ACTION_PREFIX, handleRestNotificationEvent)
}

/** Sólo para tests: devuelve el store del puente a cero. */
export function __resetRestRemoteCommands(): void {
  snapshot = null
  pending = []
  listeners.clear()
}
