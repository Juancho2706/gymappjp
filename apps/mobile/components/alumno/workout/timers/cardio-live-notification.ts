/**
 * IDENTIDAD de la notificación viva de CARDIO: sus ids de acción, sus juegos de botones y los copys
 * de sus dos estados (corriendo / en pausa). Gemelo exacto de `rest-live-notification.ts` para el
 * otro cronómetro largo del ejecutor, y wrapper FINO sobre `live-timer-notification.ts`, donde vive
 * el mecanismo genérico (require guardado de notify-kit, canales, chronometer nativo, NO-OP seguro).
 *
 * ── POR QUÉ LOS ACTION IDS VIVEN ACÁ ───────────────────────────────────────────
 * Misma razón que en el descanso: son parte de la IDENTIDAD de esta notificación, y ponerlos acá
 * deja la dependencia en UN solo sentido y sin ciclos:
 *   `use-cardio-live-timer` (React, display)  ─┐
 *   `cardio-remote-commands` (headless)       ─┴→ `cardio-live-notification` → `live-timer-notification`
 * El puente headless NO puede importar el hook (arrastraría React a un handler sin árbol montado) y
 * el hook no puede ser la fuente de los ids por lo mismo. Este archivo es el terreno común.
 *
 * `CARDIO_LIVE_ID` / `CARDIO_CHANNEL_ID` siguen declarados en `live-timer-notification.ts` (donde
 * nacieron con el espejo de cardio) y se reexportan desde acá para que los consumidores tengan un
 * único punto de entrada.
 *
 * ⚠️ REQUIERE UN BUILD EAS NUEVO (dependencia nativa): hasta entonces todo acá es NO-OP seguro.
 */
import {
  CARDIO_CHANNEL_ID,
  CARDIO_CHANNEL_NAME,
  CARDIO_LIVE_ID,
  showLiveTimer,
  stopLiveTimer,
} from './live-timer-notification'

export { CARDIO_CHANNEL_ID, CARDIO_CHANNEL_NAME, CARDIO_LIVE_ID }

// EVA DS brand accent (sport-500) — mismo respaldo que el descanso cuando el color no es hex válido.
const BRAND_COLOR = '#2680FF'

/** Prefijo de TODOS los ids de acción de cardio: por él enruta `notification-events.ts`. */
export const CARDIO_ACTION_PREFIX = 'cardio-'

/** Ids de las acciones de la notificación de cardio (viajan en `detail.pressAction.id`). */
export const CARDIO_ACTION_PAUSE = 'cardio-pause'
export const CARDIO_ACTION_RESUME = 'cardio-resume'
/** Sólo intervalos: avanza a la fase siguiente (el salto real lo aplica la pantalla al volver). */
export const CARDIO_ACTION_SKIP_PHASE = 'cardio-skip-phase'
/**
 * Cronómetro por distancia. "Detener" acá significa PAUSAR: terminar el bloque exige capturar la
 * serie (metros/FC) en la UI, así que la notificación jamás cierra un bloque por su cuenta.
 */
export const CARDIO_ACTION_STOP = 'cardio-stop'

/** Modo del hero que publica la notificación (decide el juego de botones y los copys). */
export type CardioLiveMode = 'countdown' | 'interval' | 'stopwatch'

const PAUSE_ACTION = { id: CARDIO_ACTION_PAUSE, title: 'Pausar' }

/** Countdown por duración: sólo pausa (no hay fases que saltar ni bloque que cerrar sin capturar). */
export const CARDIO_COUNTDOWN_ACTIONS: { id: string; title: string }[] = [PAUSE_ACTION]

/** Intervalos por TIEMPO: pausa + avance de fase. (Una fase manual no publica notificación.) */
export const CARDIO_INTERVAL_ACTIONS: { id: string; title: string }[] = [
  PAUSE_ACTION,
  { id: CARDIO_ACTION_SKIP_PHASE, title: 'Fase siguiente' },
]

/** Cronómetro ascendente: "Pausar" con su id propio (`stop`), porque congela transcurrido, no restante. */
export const CARDIO_STOPWATCH_ACTIONS: { id: string; title: string }[] = [
  { id: CARDIO_ACTION_STOP, title: 'Pausar' },
]

/** Ficha en pausa: sólo reanudar (no hay reloj sobre el que saltar fase). */
export const CARDIO_PAUSED_ACTIONS: { id: string; title: string }[] = [
  { id: CARDIO_ACTION_RESUME, title: 'Reanudar' },
]

/** Botones que corresponden al modo en curso. */
export function cardioRunningActions(mode: CardioLiveMode): { id: string; title: string }[] {
  if (mode === 'interval') return CARDIO_INTERVAL_ACTIONS
  if (mode === 'stopwatch') return CARDIO_STOPWATCH_ACTIONS
  return CARDIO_COUNTDOWN_ACTIONS
}

/** Contexto visual compartido por los dos estados de la notificación. */
export interface CardioLiveContext {
  title: string
  body?: string
  /** Acento (zona objetivo o fase en curso). */
  color?: string
  /** Logo del coach (branding runtime) — unificado con el descanso. */
  largeIconUrl?: string
}

/**
 * Notifee VALIDA el color y RECHAZA el display si no es hex `#RRGGBB`/`#AARRGGBB`. El acento puede
 * venir de la marca del coach (dato de DB), así que se filtra acá: cualquier otra cosa cae al azul
 * EVA en vez de tumbar la notificación entera. Copiado 1:1 del descanso a propósito.
 */
function resolveColor(color?: string): string {
  return color && /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color) ? color : BRAND_COLOR
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const mm = Math.floor(safe / 60)
  const ss = safe % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export interface CardioLiveOptions extends CardioLiveContext {
  /** `'down'` = fin absoluto en `endEpochMs`; `'up'` = inicio absoluto en `startEpochMs`. */
  direction: 'down' | 'up'
  endEpochMs?: number
  startEpochMs?: number
  /** Juego de botones; por defecto los del `mode`. */
  actions?: { id: string; title: string }[]
  /** Modo en curso (decide los botones por defecto). */
  mode: CardioLiveMode
}

/**
 * Muestra/actualiza el contador vivo de cardio. Reusa el MISMO id → cada llamada actualiza la
 * notificación en su sitio en vez de apilar. Sólo Android y sólo con la lib nativa enlazada; en
 * cualquier otro caso NO-OP. Nunca lanza.
 */
export async function showCardioLive(opts: CardioLiveOptions): Promise<void> {
  await showLiveTimer({
    id: CARDIO_LIVE_ID,
    channelId: CARDIO_CHANNEL_ID,
    channelName: CARDIO_CHANNEL_NAME,
    title: opts.title,
    body: opts.body,
    direction: opts.direction,
    endEpochMs: opts.direction === 'down' ? opts.endEpochMs : undefined,
    startEpochMs: opts.direction === 'up' ? opts.startEpochMs : undefined,
    color: resolveColor(opts.color),
    largeIconUrl: opts.largeIconUrl,
    actions: opts.actions ?? cardioRunningActions(opts.mode),
  })
}

/**
 * Ficha ESTÁTICA "Cardio en pausa" (mismo id → reemplaza al contador). Sin chronometer
 * (`direction: 'none'`): Android no sabe congelar un contador, así que la pausa se representa con el
 * tiempo escrito en el cuerpo. La notificación sigue viva para que "Reanudar" quede al alcance con
 * la app en background — misma decisión que el descanso.
 */
export async function showCardioPausedNotice(opts: {
  mode: CardioLiveMode
  /** Restantes (countdown/intervalos) o transcurridos (cronómetro). */
  seconds: number
  title: string
  color?: string
  largeIconUrl?: string
}): Promise<void> {
  const clock = formatClock(opts.seconds)
  await showLiveTimer({
    id: CARDIO_LIVE_ID,
    channelId: CARDIO_CHANNEL_ID,
    channelName: CARDIO_CHANNEL_NAME,
    title: 'Cardio en pausa',
    body: opts.mode === 'stopwatch' ? `Llevas ${clock}` : `Quedan ${clock}`,
    direction: 'none',
    color: resolveColor(opts.color),
    largeIconUrl: opts.largeIconUrl,
    actions: CARDIO_PAUSED_ACTIONS,
  })
}

/**
 * Ficha ESTÁTICA tras "Fase siguiente" desde la notificación. SIN acciones a propósito: el salto real
 * lo aplica la pantalla (la secuencia de fases vive en el componente y el motor de conteo está
 * congelado — el handler headless no la recomputa), así que hasta que el alumno vuelva a EVA no hay
 * ninguna otra acción honesta que ofrecer.
 *
 * Sigue siendo `ongoing` porque la API actual de `showLiveTimer` no expone `ongoing: false`; se
 * autolimpia sola en cuanto la pantalla vuelve al frente (el drenaje aplica el salto y la transición
 * siguiente re-publica o retira la notificación por el MISMO id).
 */
export async function showCardioPhaseSkippedNotice(opts: {
  color?: string
  largeIconUrl?: string
}): Promise<void> {
  await showLiveTimer({
    id: CARDIO_LIVE_ID,
    channelId: CARDIO_CHANNEL_ID,
    channelName: CARDIO_CHANNEL_NAME,
    title: 'Fase saltada',
    body: 'Abre EVA para continuar con la fase siguiente.',
    direction: 'none',
    color: resolveColor(opts.color),
    largeIconUrl: opts.largeIconUrl,
  })
}

/** Retira el contador vivo de cardio (pausa/terminar/desmontar). NO-OP si no aplica. */
export async function stopCardioLive(): Promise<void> {
  await stopLiveTimer(CARDIO_LIVE_ID)
}
