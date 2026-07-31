/**
 * PUENTE entre los botones de la notificación viva de CARDIO y la pantalla React — espejo exacto del
 * patrón de `rest-remote-commands.ts` (léelo primero: ahí está la justificación larga del store
 * module-level, del snapshot como ESPEJO y de la cola de comandos como única vía hacia React).
 *
 * ── QUÉ CAMBIA RESPECTO AL DESCANSO ────────────────────────────────────────────
 * El descanso tiene UN reloj; cardio tiene TRES heroes (countdown por duración, runner de intervalos
 * y cronómetro ascendente por distancia), así que el snapshot lleva su `mode` y el handler decide por
 * él qué congelar: RESTANTES (countdown/intervalos) o TRANSCURRIDOS (cronómetro).
 *
 * Además, cardio tiene DOS instantes absolutos que espejar, no uno:
 *   · `endEpochMs`      → fin de la cuenta EN CURSO (el countdown, o la fase actual del intervalo).
 *   · `endNotifEpochMs` → fin del BLOQUE completo, que es lo que dispara "¡Cardio completo!".
 * En un countdown coinciden; en una secuencia de intervalos NO (al bloque le quedan más fases). El
 * handler jamás recomputa la secuencia: el display ya publica `endNotifSeconds` calculado —y ya
 * codifica la regla de "null si queda alguna fase MANUAL por delante"—, acá sólo se convierte a
 * instante absoluto y se re-deriva. Recomputarla sería duplicar el motor en un handler headless.
 *
 * ── QUIÉN MUEVE EL RELOJ (evita el DOBLE-APPLY) ────────────────────────────────
 * Igual que el descanso: el handler ACTÚA (no puede esperar a React) — congela/recalcula los
 * instantes, re-pinta la notificación, re-programa la alerta final y recién ahí encola. La pantalla,
 * al drenar, ADOPTA lo que ya quedó en el snapshot en vez de volver a aplicar el delta.
 *
 * ── LÍMITE DELIBERADO: "Fase siguiente" NO recomputa nada ──────────────────────
 * La secuencia de fases vive en el componente (`buildIntervalSequence` + `useIntervalRunner`) y ese
 * motor está congelado. El handler headless sólo suelta el reloj que ya no vale, deja una ficha que
 * pide abrir la app y encola `skip-phase`; el salto REAL lo aplica la pantalla al volver.
 *
 * ── SEGURIDAD ──────────────────────────────────────────────────────────────────
 * NO-OP total sin lib nativa (`getNotifee()` null) y TODO con try/catch tragado: una falla del puente
 * jamás puede romper la app ni el cronómetro in-app.
 */
import { getActionPressEventType, type NotifeeEvent } from './live-timer-notification'
import { registerNotificationActionHandler } from './notification-events'
import {
  CARDIO_ACTION_PAUSE,
  CARDIO_ACTION_PREFIX,
  CARDIO_ACTION_RESUME,
  CARDIO_ACTION_SKIP_PHASE,
  CARDIO_ACTION_STOP,
  CARDIO_LIVE_ID,
  cardioRunningActions,
  showCardioLive,
  showCardioPausedNotice,
  showCardioPhaseSkippedNotice,
  stopCardioLive,
  type CardioLiveMode,
} from './cardio-live-notification'
import { cancelCardioEndNotification, scheduleCardioEndNotification } from './cardio-notification'

/** Comandos que un botón de la notificación de cardio puede pedirle a la pantalla. */
export type CardioRemoteCommandType = 'pause' | 'resume' | 'skip-phase' | 'stop'

export interface CardioRemoteCommand {
  type: CardioRemoteCommandType
  /** `Date.now()` del press (para ordenar/depurar; la pantalla deriva del snapshot). */
  atMs: number
}

/**
 * Espejo module-level del cardio VIVO. Lo publica el hook de display en cada TRANSICIÓN (nunca por
 * tick) y lo re-escribe el handler cuando mueve el reloj desde background.
 */
export interface CardioLiveSnapshot {
  mode: CardioLiveMode
  /** Fin absoluto de la cuenta en curso. `null` = pausado (la verdad es `pausedRemainingSec`). */
  endEpochMs?: number | null
  /** Inicio absoluto del cronómetro ascendente. `null` = pausado (verdad: `pausedElapsedSec`). */
  startEpochMs?: number | null
  /** Restantes CONGELADOS en pausa (countdown/intervalos). */
  pausedRemainingSec?: number | null
  /** Transcurridos CONGELADOS en pausa (cronómetro ascendente). */
  pausedElapsedSec?: number | null
  /** Fin absoluto del BLOQUE para "¡Cardio completo!". `null` = sin instante de fin conocido. */
  endNotifEpochMs?: number | null
  /** El mismo dato congelado mientras está en pausa. */
  pausedEndNotifSec?: number | null
  title: string
  body?: string
  color?: string
  largeIconUrl?: string
  /** Fase actual y total de la secuencia (informativo para copys/diagnóstico). */
  phaseIndex?: number
  phaseCount?: number
}

let snapshot: CardioLiveSnapshot | null = null
let pending: CardioRemoteCommand[] = []
const listeners = new Set<() => void>()

/** Publica el estado del cardio vivo (lo llama el hook de display en cada transición). */
export function setCardioLiveSnapshot(next: CardioLiveSnapshot): void {
  snapshot = next
}

/**
 * Borra el espejo (bloque terminado / fase manual / pantalla desmontada) y DESCARTA los comandos aún
 * pendientes: un comando sólo tiene sentido para el cardio que estaba vivo cuando se tocó el botón.
 * Sin este descarte, un press que nadie alcanzó a consumir lo consumiría el bloque SIGUIENTE (mismo
 * agujero que cerró el descanso). Los handlers que sí quieren dejar comando encolan DESPUÉS de limpiar.
 */
export function clearCardioLiveSnapshot(): void {
  snapshot = null
  pending = []
}

/** Lectura del espejo (la usa la pantalla para ADOPTAR el reloj que movió el handler). */
export function getCardioLiveSnapshot(): CardioLiveSnapshot | null {
  return snapshot
}

/** Vacía y devuelve los comandos pendientes (la pantalla los aplica en orden). */
export function drainCardioRemoteCommands(): CardioRemoteCommand[] {
  if (pending.length === 0) return []
  const out = pending
  pending = []
  return out
}

/**
 * Suscribe a la pantalla a los comandos remotos. El callback se dispara al encolar Y —importante—
 * INMEDIATAMENTE si ya hay pendientes: un press puede haber ocurrido con la app en background antes
 * de que la pantalla montara/se suscribiera, y ese comando no puede perderse. Devuelve el unsubscribe.
 */
export function subscribeCardioRemoteCommands(cb: () => void): () => void {
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

function enqueueCommand(type: CardioRemoteCommandType): void {
  pending.push({ type, atMs: Date.now() })
  listeners.forEach((cb) => {
    try {
      cb()
    } catch {
      // no-op
    }
  })
}

/** Restantes según el snapshot (corriendo → derivado del reloj; en pausa → congelados). */
function remainingFrom(snap: CardioLiveSnapshot): number {
  if (snap.endEpochMs != null) return Math.max(0, Math.ceil((snap.endEpochMs - Date.now()) / 1000))
  return Math.max(0, Math.round(snap.pausedRemainingSec ?? 0))
}

/** Transcurridos del cronómetro ascendente (corriendo → desde el inicio; en pausa → congelados). */
function elapsedFrom(snap: CardioLiveSnapshot): number {
  if (snap.startEpochMs != null) return Math.max(0, Math.floor((Date.now() - snap.startEpochMs) / 1000))
  return Math.max(0, Math.round(snap.pausedElapsedSec ?? 0))
}

/** Segundos hasta el fin del BLOQUE, o `null` si no hay instante de fin conocido. */
function endNotifSecondsFrom(snap: CardioLiveSnapshot): number | null {
  if (snap.endNotifEpochMs != null) return Math.max(0, Math.ceil((snap.endNotifEpochMs - Date.now()) / 1000))
  if (snap.pausedEndNotifSec != null) return Math.max(0, Math.round(snap.pausedEndNotifSec))
  return null
}

/**
 * PAUSAR (o "detener" el cronómetro, que es lo mismo: pausa). Congela el reloj que corresponda al
 * modo, suelta el contador nativo y su alerta programada, y deja la ficha estática con "Reanudar".
 *
 * Orden secuencial (no en paralelo) a propósito, igual que el descanso: el cancel jamás puede llegar
 * DESPUÉS del display y dejar al alumno sin notificación ni forma de reanudar.
 */
async function handleFreeze(snap: CardioLiveSnapshot, type: 'pause' | 'stop'): Promise<void> {
  const stopwatch = snap.mode === 'stopwatch'
  const seconds = stopwatch ? elapsedFrom(snap) : remainingFrom(snap)
  setCardioLiveSnapshot({
    ...snap,
    endEpochMs: null,
    startEpochMs: null,
    pausedRemainingSec: stopwatch ? null : seconds,
    pausedElapsedSec: stopwatch ? seconds : null,
    // El fin del bloque también se congela: en pausa el reloj no avanza para nadie.
    endNotifEpochMs: null,
    pausedEndNotifSec: endNotifSecondsFrom(snap),
  })
  await stopCardioLive()
  await cancelCardioEndNotification()
  await showCardioPausedNotice({
    mode: snap.mode,
    seconds,
    title: snap.title,
    color: snap.color,
    largeIconUrl: snap.largeIconUrl,
  })
  enqueueCommand(type)
}

/** REANUDAR: recalcula los instantes desde lo congelado y vuelve a publicar el contador vivo. */
async function handleResume(snap: CardioLiveSnapshot): Promise<void> {
  const now = Date.now()

  if (snap.mode === 'stopwatch') {
    const elapsed = elapsedFrom(snap)
    // Inicio absoluto = "ahora menos lo transcurrido": el contador nativo retoma exactamente donde
    // quedó, sin arrastrar el tiempo que el bloque estuvo en pausa.
    const startEpochMs = now - elapsed * 1000
    setCardioLiveSnapshot({ ...snap, startEpochMs, pausedElapsedSec: null })
    await showCardioLive({
      mode: 'stopwatch',
      direction: 'up',
      startEpochMs,
      title: snap.title,
      body: snap.body,
      color: snap.color,
      largeIconUrl: snap.largeIconUrl,
    })
    // Un bloque por distancia no tiene instante de término que programar: lo cierra el alumno.
    enqueueCommand('resume')
    return
  }

  const remaining = remainingFrom(snap)
  if (remaining <= 0) {
    // Nada que reanudar (la cuenta ya se agotó mientras el JS dormía): se limpia y NO se encola —
    // resucitar un reloj vencido dejaría la pantalla contando hacia atrás desde cero.
    clearCardioLiveSnapshot()
    await stopCardioLive()
    await cancelCardioEndNotification()
    return
  }

  const endEpochMs = now + remaining * 1000
  const endNotifSeconds = endNotifSecondsFrom(snap)
  setCardioLiveSnapshot({
    ...snap,
    endEpochMs,
    pausedRemainingSec: null,
    endNotifEpochMs: endNotifSeconds != null ? now + endNotifSeconds * 1000 : null,
    pausedEndNotifSec: null,
  })
  await showCardioLive({
    mode: snap.mode,
    direction: 'down',
    endEpochMs,
    title: snap.title,
    body: snap.body,
    color: snap.color,
    largeIconUrl: snap.largeIconUrl,
    actions: cardioRunningActions(snap.mode),
  })
  // Misma condición que usa el display: sólo se re-programa si el bloque tiene un fin conocido
  // (`endNotifSeconds` ya viene null cuando quedan fases manuales por delante).
  if (endNotifSeconds != null && endNotifSeconds > 0) {
    await scheduleCardioEndNotification(endNotifSeconds)
  }
  enqueueCommand('resume')
}

/**
 * FASE SIGUIENTE: suelta el reloj y la alerta final (ambos mentirían: la fase actual ya no vale y el
 * fin del bloque cambió), deja la ficha que pide abrir la app y encola. El salto REAL lo aplica la
 * pantalla al drenar — acá NO se recomputa la secuencia (ver cabecera).
 */
async function handleSkipPhase(snap: CardioLiveSnapshot): Promise<void> {
  setCardioLiveSnapshot({
    ...snap,
    endEpochMs: null,
    // Fase consumida: si llegara un "Reanudar" huérfano, se resuelve como "nada que reanudar".
    pausedRemainingSec: 0,
    endNotifEpochMs: null,
    pausedEndNotifSec: null,
  })
  await stopCardioLive()
  await cancelCardioEndNotification()
  await showCardioPhaseSkippedNotice({ color: snap.color, largeIconUrl: snap.largeIconUrl })
  enqueueCommand('skip-phase')
}

/**
 * Handler HEADLESS de cardio (background y foreground comparten cuerpo: la acción debe hacer
 * exactamente lo mismo esté la app donde esté). Nunca lanza.
 */
export async function handleCardioNotificationEvent(event: NotifeeEvent): Promise<void> {
  try {
    if (!event || event.type !== getActionPressEventType()) return
    const actionId = event.detail?.pressAction?.id
    if (!actionId || !actionId.startsWith(CARDIO_ACTION_PREFIX)) return
    // Filtro por id de notificación: el despachador ya enruta por prefijo, pero algunos OEM omiten el
    // id — sin él seguimos, porque los ids de acción de cardio son únicos de todos modos.
    const notifId = event.detail?.notification?.id
    if (notifId && notifId !== CARDIO_LIVE_ID) return

    const snap = snapshot
    if (!snap) return // sin cardio vivo no hay nada que mover

    if (actionId === CARDIO_ACTION_PAUSE) await handleFreeze(snap, 'pause')
    else if (actionId === CARDIO_ACTION_STOP) await handleFreeze(snap, 'stop')
    else if (actionId === CARDIO_ACTION_RESUME) await handleResume(snap)
    else if (actionId === CARDIO_ACTION_SKIP_PHASE) await handleSkipPhase(snap)
  } catch {
    // Un fallo del puente nunca rompe la app.
  }
}

/**
 * Anota el handler de cardio en el REGISTRO ÚNICO de eventos de notificación
 * (`notification-events.ts`) — no registra `onBackgroundEvent` por su cuenta: Notifee admite un solo
 * handler de background por app y hacerlo acá habría pisado el del descanso (ver esa cabecera).
 * Se llama a nivel de MÓDULO desde `app/_layout.tsx`, porque el handler headless debe existir antes
 * de que Android levante el bundle para atender un press. Idempotente. NO-OP sin lib nativa.
 */
export function registerCardioNotificationEvents(): void {
  registerNotificationActionHandler(CARDIO_ACTION_PREFIX, handleCardioNotificationEvent)
}

/** Sólo para tests: devuelve el store del puente a cero. */
export function __resetCardioRemoteCommands(): void {
  snapshot = null
  pending = []
  listeners.clear()
}
