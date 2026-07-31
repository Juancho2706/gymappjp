/**
 * Cálculo PURO de qué debe adoptar la pantalla de cardio cuando drena un comando que llegó desde los
 * botones de la notificación (pausar / reanudar en el lockscreen).
 *
 * ── POR QUÉ VIVE ACÁ Y NO EN `cardio-remote-commands.ts` ───────────────────────
 * El puente ya tiene sus propios `remainingFrom`/`elapsedFrom`, pero son privados y —más importante—
 * ese módulo arrastra las hojas NATIVAS (notifee / expo-notifications). Importarlo sólo para leer dos
 * restas obligaría a mockear todo eso para testear una aritmética de tres líneas. Se duplican esas dos
 * derivaciones a propósito, con el reloj INYECTABLE (`nowMs`), y el snapshot entra como TIPO (import
 * type ⇒ cero dependencia en runtime).
 *
 * ── LA REGLA ──────────────────────────────────────────────────────────────────
 * El handler headless ya ACTUÓ antes de encolar: al pausar dejó los segundos congelados
 * (`pausedRemainingSec` / `pausedElapsedSec`) y al reanudar re-ancló los instantes absolutos
 * (`endEpochMs` / `startEpochMs`) descontando el rato que el bloque estuvo detenido. Por eso la
 * pantalla ADOPTA ese valor en vez de re-aplicar el delta: es la única forma de que una pausa larga
 * hecha con la app dormida no se cuente como tiempo corrido.
 */
import type { CardioLiveSnapshot } from '../timers/cardio-remote-commands'

export type CardioAdoptionPlan =
  /** Fijar el reloj en `seconds` (restantes en `down`, transcurridos en el cronómetro) y dejarlo así. */
  | { action: 'adopt'; seconds: number; running: boolean }
  /** Nada exacto que fijar: basta con dejar el hero corriendo o detenido (un `toggle` si difiere). */
  | { action: 'settle'; running: boolean }

/** Restantes del snapshot: corriendo ⇒ derivados del fin absoluto; en pausa ⇒ los congelados. */
function remainingFrom(snap: CardioLiveSnapshot, nowMs: number): number {
  if (snap.endEpochMs != null) return Math.max(0, Math.ceil((snap.endEpochMs - nowMs) / 1000))
  return Math.max(0, Math.round(snap.pausedRemainingSec ?? 0))
}

/** Transcurridos del cronómetro ascendente: corriendo ⇒ desde el inicio absoluto; en pausa ⇒ congelados. */
function elapsedFrom(snap: CardioLiveSnapshot, nowMs: number): number {
  if (snap.startEpochMs != null) return Math.max(0, Math.floor((nowMs - snap.startEpochMs) / 1000))
  return Math.max(0, Math.round(snap.pausedElapsedSec ?? 0))
}

/**
 * Traduce el snapshot + la intención final del alumno (`desiredRunning`, ya colapsada por el drenaje)
 * en lo que la pantalla debe hacer. `localSeconds` es lo que el hero pinta AHORA (null si no hay hero
 * vivo) y sólo se usa para no re-fijar un reloj que ya coincide.
 */
export function planCardioAdoption(
  snapshot: CardioLiveSnapshot | null,
  desiredRunning: boolean,
  localSeconds: number | null,
  nowMs: number = Date.now(),
): CardioAdoptionPlan {
  // Sin espejo no hay valor que adoptar (press huérfano, bloque ya cerrado): sólo se honra el estado.
  if (!snapshot) return { action: 'settle', running: desiredRunning }
  const up = snapshot.mode === 'stopwatch'
  const seconds = up ? elapsedFrom(snapshot, nowMs) : remainingFrom(snapshot, nowMs)
  // Cuenta regresiva agotada mientras el JS dormía: NO se resucita un reloj vencido (la pantalla lo
  // cierra por su cuenta). En el cronómetro, 0 s transcurridos es un valor legítimo.
  if (!up && seconds <= 0) return { action: 'settle', running: desiredRunning }
  if (desiredRunning) return { action: 'adopt', seconds, running: true }
  // PAUSA: manda el valor CONGELADO por el handler. Si el hero ya pinta lo mismo (±1 s: la app estuvo
  // despierta y su cuenta no derivó), re-fijar el reloj sería churn — basta con detenerlo.
  if (localSeconds != null && Math.abs(localSeconds - seconds) <= 1) return { action: 'settle', running: false }
  return { action: 'adopt', seconds, running: false }
}
