/**
 * DRENAJE de los botones de las Live Activities de iOS (Ola 7A) — la contraparte de lo que en
 * Android hace el handler headless de notify-kit (`rest-remote-commands.ts` / `cardio-remote-commands.ts`).
 *
 * ── POR QUÉ ES UN ARCHIVO APARTE Y NO VIVE EN `notification-events.ts` ─────────
 * `notification-events.ts` es el registro nativo de ANDROID y lo importa `rest-remote-commands.ts`.
 * Meter el drenaje ahí cerraría el ciclo `rest-remote-commands → notification-events →
 * live-activity-commands → rest-remote-commands`. Este archivo es el "hookeo hermano": mismo lugar en
 * el arranque (`app/_layout.tsx`, a nivel de MÓDULO, junto a los otros dos registros), sin ciclo.
 *
 * ── QUÉ HACE Y QUÉ **NO** ─────────────────────────────────────────────────────
 * En iOS, quien ACTÚA sobre el cronómetro cuando la app está cerrada es Swift: el App Intent mueve la
 * Live Activity en el instante del press y deja el comando en el App Group. Al volver la app al frente
 * el JS drena ese buzón y tiene que dejar el SNAPSHOT en el mismo estado al que llegó Swift, para que
 * el motor React lo ADOPTE sin volver a aplicar el delta (el clásico doble-apply que en Android está
 * testeado en `tests/mobile/rest-remote-commands.test.ts`).
 *
 * ── LA VERDAD TEMPORAL ES `atMs`, NO `Date.now()` ─────────────────────────────
 * Entre el press y el drenaje pueden pasar minutos (la app estaba suspendida). Todos los cálculos usan
 * el `atMs` que viajó con el comando —el instante REAL del toque— y no la hora del drenaje: pausar a
 * los 40 s restantes debe dejar 40 s congelados, no 40 menos lo que el alumno tardó en abrir EVA.
 *
 * ── ANDROID NO PASA POR ACÁ ───────────────────────────────────────────────────
 * `laDrainCommands()` devuelve `[]` fuera de iOS (require guardado + `isSupported`), así que el
 * registro es inerte en Android y su comportamiento no cambia en nada.
 */
import {
  CARDIO_ACTION_PAUSE,
  CARDIO_ACTION_PREFIX,
  CARDIO_ACTION_RESUME,
} from './cardio-live-notification'
import {
  clearCardioLiveSnapshot,
  enqueueCardioRemoteCommand,
  getCardioLiveSnapshot,
  setCardioLiveSnapshot,
  type CardioLiveSnapshot,
} from './cardio-remote-commands'
import { laDrainCommands, type LiveActivityCommand } from './live-activity'
import {
  REST_ACTION_PAUSE,
  REST_ACTION_PLUS15,
  REST_ACTION_PREFIX,
  REST_ACTION_RESUME,
  REST_ACTION_SKIP,
  REST_PLUS_SECONDS,
} from './rest-live-notification'
import {
  clearRestLiveSnapshot,
  enqueueRestRemoteCommand,
  getRestLiveSnapshot,
  setRestLiveSnapshot,
  type RestLiveSnapshot,
} from './rest-remote-commands'

/** Segundos restantes del descanso EN EL INSTANTE DEL PRESS. */
function restRemainingAt(snap: RestLiveSnapshot, atMs: number): number {
  if (snap.endEpochMs != null) return Math.max(0, Math.ceil((snap.endEpochMs - atMs) / 1000))
  return Math.max(0, Math.round(snap.remainingSeconds))
}

/** Segundos restantes derivados de un fin absoluto ya recalculado (para el campo informativo). */
function remainingFromEnd(endEpochMs: number): number {
  return Math.max(0, Math.ceil((endEpochMs - Date.now()) / 1000))
}

function applyRestCommand(id: string, atMs: number): void {
  if (id === REST_ACTION_SKIP) {
    // Igual que el puente Android: limpiar PRIMERO (descarta pendientes huérfanos) y encolar después.
    clearRestLiveSnapshot()
    enqueueRestRemoteCommand('skip')
    return
  }

  const snap = getRestLiveSnapshot()
  if (!snap) return // sin descanso vivo no hay nada que mover

  if (id === REST_ACTION_PAUSE) {
    const remainingSeconds = restRemainingAt(snap, atMs)
    setRestLiveSnapshot({ ...snap, endEpochMs: null, remainingSeconds })
    enqueueRestRemoteCommand('pause')
    return
  }

  if (id === REST_ACTION_PLUS15) {
    // `max(fin, press)`: si el descanso ya había vencido cuando el alumno tocó "+15 s", los 15 s
    // cuentan desde el press y no desde un pasado.
    const endEpochMs = Math.max(snap.endEpochMs ?? 0, atMs) + REST_PLUS_SECONDS * 1000
    setRestLiveSnapshot({ ...snap, endEpochMs, remainingSeconds: remainingFromEnd(endEpochMs) })
    enqueueRestRemoteCommand('plus15')
    return
  }

  if (id === REST_ACTION_RESUME) {
    const remainingSeconds = restRemainingAt(snap, atMs)
    if (remainingSeconds <= 0) {
      // Nada que reanudar → se trata como saltar (misma regla que `handleResume` en Android).
      clearRestLiveSnapshot()
      enqueueRestRemoteCommand('skip')
      return
    }
    // El reloj se reanudó EN EL PRESS: la actividad de iOS ya venía corriendo desde ahí.
    const endEpochMs = atMs + remainingSeconds * 1000
    setRestLiveSnapshot({ ...snap, endEpochMs, remainingSeconds: remainingFromEnd(endEpochMs) })
    enqueueRestRemoteCommand('resume')
  }
}

/** Restantes de cardio en el instante del press. */
function cardioRemainingAt(snap: CardioLiveSnapshot, atMs: number): number {
  if (snap.endEpochMs != null) return Math.max(0, Math.ceil((snap.endEpochMs - atMs) / 1000))
  return Math.max(0, Math.round(snap.pausedRemainingSec ?? 0))
}

/** Transcurridos del cronómetro ascendente en el instante del press. */
function cardioElapsedAt(snap: CardioLiveSnapshot, atMs: number): number {
  if (snap.startEpochMs != null) return Math.max(0, Math.floor((atMs - snap.startEpochMs) / 1000))
  return Math.max(0, Math.round(snap.pausedElapsedSec ?? 0))
}

/** Segundos hasta el fin del BLOQUE en el instante del press, o `null` si no hay fin conocido. */
function cardioEndNotifAt(snap: CardioLiveSnapshot, atMs: number): number | null {
  if (snap.endNotifEpochMs != null) return Math.max(0, Math.ceil((snap.endNotifEpochMs - atMs) / 1000))
  if (snap.pausedEndNotifSec != null) return Math.max(0, Math.round(snap.pausedEndNotifSec))
  return null
}

function applyCardioCommand(id: string, atMs: number): void {
  const snap = getCardioLiveSnapshot()
  if (!snap) return

  const stopwatch = snap.mode === 'stopwatch'

  if (id === CARDIO_ACTION_PAUSE) {
    const seconds = stopwatch ? cardioElapsedAt(snap, atMs) : cardioRemainingAt(snap, atMs)
    setCardioLiveSnapshot({
      ...snap,
      endEpochMs: null,
      startEpochMs: null,
      pausedRemainingSec: stopwatch ? null : seconds,
      pausedElapsedSec: stopwatch ? seconds : null,
      endNotifEpochMs: null,
      pausedEndNotifSec: cardioEndNotifAt(snap, atMs),
    })
    enqueueCardioRemoteCommand('pause')
    return
  }

  if (id === CARDIO_ACTION_RESUME) {
    if (stopwatch) {
      const elapsed = cardioElapsedAt(snap, atMs)
      setCardioLiveSnapshot({
        ...snap,
        startEpochMs: atMs - elapsed * 1000,
        pausedElapsedSec: null,
      })
      enqueueCardioRemoteCommand('resume')
      return
    }
    const remaining = cardioRemainingAt(snap, atMs)
    if (remaining <= 0) {
      // La cuenta se agotó mientras la app dormía: se limpia y NO se encola (resucitar un reloj
      // vencido dejaría la pantalla contando desde cero). Misma regla que el puente Android.
      clearCardioLiveSnapshot()
      return
    }
    const endNotifSeconds = cardioEndNotifAt(snap, atMs)
    setCardioLiveSnapshot({
      ...snap,
      endEpochMs: atMs + remaining * 1000,
      pausedRemainingSec: null,
      endNotifEpochMs: endNotifSeconds != null ? atMs + endNotifSeconds * 1000 : null,
      pausedEndNotifSec: null,
    })
    enqueueCardioRemoteCommand('resume')
  }
}

/**
 * Aplica un lote de comandos EN ORDEN. Exportada para poder testearla sin AppState ni módulo nativo.
 * Nunca lanza: un comando corrupto no puede tumbar el arranque de la app.
 */
export function applyLiveActivityCommands(commands: LiveActivityCommand[]): void {
  for (const command of commands) {
    try {
      const atMs = Number.isFinite(command.atMs) ? command.atMs : Date.now()
      if (command.id.startsWith(REST_ACTION_PREFIX)) applyRestCommand(command.id, atMs)
      else if (command.id.startsWith(CARDIO_ACTION_PREFIX)) applyCardioCommand(command.id, atMs)
    } catch {
      // Un comando roto no puede impedir que se apliquen los demás.
    }
  }
}

/**
 * Drena el buzón nativo y aplica lo que haya. NO-OP fuera de iOS o sin módulo nativo enlazado.
 * Idempotente: si no hay comandos, no toca nada.
 */
export function drainLiveActivityCommands(): void {
  try {
    const commands = laDrainCommands()
    if (commands.length === 0) return
    applyLiveActivityCommands(commands)
  } catch {
    // no-op
  }
}

let registered = false

/**
 * Engancha el drenaje al regreso de la app al frente. Se llama a nivel de MÓDULO desde
 * `app/_layout.tsx`, junto a los registros de notificaciones de Android.
 *
 * ── POR QUÉ AppState 'active' Y NO UN EVENTO NATIVO ───────────────────────────
 * El intent corre en el proceso de la app pero SIN runtime JS garantizado: no hay a quién emitirle.
 * El único momento en que se sabe que el JS está vivo y el motor montado es cuando la app vuelve a
 * primer plano — que es, además, el único momento en que el estado importa para la UI.
 *
 * Idempotente (flag de módulo) y con un drenaje inicial: si la app se abrió DESDE el botón, el
 * comando ya estaba en el buzón antes de que se registrara el listener.
 *
 * `react-native` se pide con `require` PEREZOSO y guardado (no import de nivel superior) para que el
 * resto del archivo —la lógica de aplicación de comandos, que es lo que hay que testear— se pueda
 * cargar en Node sin arrastrar el runtime nativo.
 */
export function registerLiveActivityCommandDrain(): void {
  if (registered) return
  registered = true
  try {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { AppState } = require('react-native') as {
      AppState: { addEventListener: (type: string, handler: (status: string) => void) => unknown }
    }
    AppState.addEventListener('change', (status: string) => {
      if (status === 'active') drainLiveActivityCommands()
    })
  } catch {
    // no-op
  }
  drainLiveActivityCommands()
}

/** Sólo para tests: permite volver a registrar el listener. */
export function __resetLiveActivityCommandDrain(): void {
  registered = false
}
