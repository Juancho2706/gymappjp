/**
 * Cronómetro VIVO del descanso en la bandeja/lockscreen (feature QA-11, pedido del CEO) —
 * una notificación ONGOING con cuenta regresiva que corre nativamente como el Temporizador
 * del sistema ("39:57 [pausa] [x]"), incluso con la pantalla apagada y el JS congelado.
 *
 * Este archivo quedó como wrapper FINO sobre `live-timer-notification.ts`, que es donde vive el
 * mecanismo genérico (require guardado de `react-native-notify-kit`/`@notifee/react-native`,
 * canales, chronometer nativo, NO-OP seguro sin lib nativa) y la justificación completa de por qué
 * no se usa `expo-notifications` para esto y por qué el fork mantenido en vez del notifee
 * archivado. Acá sólo queda la IDENTIDAD del descanso: id, canal, copys, color de marca, los ids
 * de sus acciones y el estado "en pausa".
 *
 * El "¡Descanso listo!" final SIGUE en `rest-notification.ts` (expo-notifications): esto es sólo
 * el contador vivo. `timeoutAfter` hace que el SO retire este contador al llegar al fin aunque el
 * JS esté congelado, y entonces asoma esa alerta programada.
 *
 * ── BOTONES DE ACCIÓN (ronda "notificación operable", QA-11 · fase 2) ───────────
 * Los ids de acción viven ACÁ (no en `rest-remote-commands.ts`) a propósito: son parte de la
 * identidad de ESTA notificación, y ponerlos acá deja la dependencia en UN solo sentido
 * (`rest-remote-commands` → `rest-live-notification` → `live-timer-notification`), sin ciclo.
 * Quien traduce un press en un comando para el motor React es `rest-remote-commands.ts`.
 *
 * ⚠️ REQUIERE UN BUILD EAS NUEVO (dependencia nativa): hasta entonces todo acá es NO-OP seguro.
 */
import { showLiveTimer, stopLiveTimer } from './live-timer-notification'
import { isRestTimerMuted } from './rest-timer-preferences'

export const REST_LIVE_NOTIF_ID = 'eva-rest-live'
const LIVE_CHANNEL_ID = 'rest-live'
const LIVE_CHANNEL_NAME = 'Descanso en curso'
// EVA DS brand accent (sport-500 = rgb 38 128 255), espeja el lightColor de `setupAndroidChannel`.
const BRAND_COLOR = '#2680FF'

/**
 * Prefijo de TODOS los ids de acción del descanso: por él enruta el registro compartido de eventos
 * (`notification-events.ts`), que es un handler ÚNICO para toda la app y separa `rest-*` de `cardio-*`.
 */
export const REST_ACTION_PREFIX = 'rest-'

/** Ids de las acciones de la notificación del descanso (viajan en `detail.pressAction.id`). */
export const REST_ACTION_PAUSE = 'rest-pause'
export const REST_ACTION_PLUS15 = 'rest-plus15'
export const REST_ACTION_SKIP = 'rest-skip'
export const REST_ACTION_RESUME = 'rest-resume'

/** Segundos que suma la acción "+15 s" (misma unidad que el botón in-app). */
export const REST_PLUS_SECONDS = 15

/** Acciones del descanso CORRIENDO. */
export const REST_RUNNING_ACTIONS: { id: string; title: string }[] = [
  { id: REST_ACTION_PAUSE, title: 'Pausar' },
  { id: REST_ACTION_PLUS15, title: '+15 s' },
  { id: REST_ACTION_SKIP, title: 'Saltar' },
]

/** Acciones del descanso EN PAUSA (no tiene sentido "+15 s" sobre un reloj detenido). */
export const REST_PAUSED_ACTIONS: { id: string; title: string }[] = [
  { id: REST_ACTION_RESUME, title: 'Reanudar' },
  { id: REST_ACTION_SKIP, title: 'Saltar' },
]

/**
 * Contexto VISUAL del descanso (paridad con el mock aprobado por el CEO: la notificación dice qué
 * viene y en qué serie vas, con el logo del coach como ícono grande). Todo opcional: sin contexto
 * la notificación conserva EXACTAMENTE los copys históricos ("Descanso en curso").
 *
 * `title`/`body` son overrides crudos por si algún consumidor necesita copys propios; lo normal es
 * pasar los campos semánticos y dejar que este módulo arme el texto.
 */
export interface RestLiveContext {
  /** Nombre del ejercicio que sigue (lo que ya viaja como `label` en `startRest`). */
  nextLabel?: string
  /** Serie actual y total del bloque, para "Serie 2 de 4". Ambos o ninguno. */
  setIndex?: number
  setTotal?: number
  /** URL del logo del coach (branding runtime); Notifee la baja como largeIcon. */
  largeIconUrl?: string
  /** Acento de marca en hex; default = azul EVA. */
  color?: string
  /** Override crudo del título. */
  title?: string
  /** Override crudo del cuerpo. */
  body?: string
  /** Override de las acciones (default: `REST_RUNNING_ACTIONS`). */
  actions?: { id: string; title: string }[]
}

/** Coletilla de audio: espeja el mute global del cronómetro. */
function soundHint(): string {
  return isRestTimerMuted() ? 'Sin sonido' : 'Sonará al terminar'
}

function resolveTitle(context?: RestLiveContext): string {
  if (context?.title) return context.title
  if (context?.nextLabel) return `Descanso · sigue ${context.nextLabel}`
  return LIVE_CHANNEL_NAME
}

function resolveBody(context?: RestLiveContext): string {
  if (context?.body) return context.body
  const hint = soundHint()
  const { setIndex, setTotal } = context ?? {}
  if (typeof setIndex === 'number' && typeof setTotal === 'number' && setTotal > 0) {
    return `Serie ${setIndex} de ${setTotal} · ${hint}`
  }
  // Copys históricos exactos cuando no hay contexto de serie.
  return isRestTimerMuted() ? 'Recupérate para la siguiente serie.' : 'Sonará al terminar.'
}

/**
 * Notifee VALIDA el color y rechaza el display si no es un hex `#RRGGBB`/`#AARRGGBB`. El acento de
 * marca viene del branding del coach (dato de DB), así que se filtra acá: cualquier cosa que no sea
 * hex cae al azul EVA en vez de tumbar la notificación entera.
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

/**
 * Muestra/actualiza el cronómetro vivo del descanso hasta `endEpochMs` (Date.now() del fin
 * absoluto). Reusa el MISMO id → llamar de nuevo (arranque, ±15s, reanudar) actualiza la
 * notificación en su sitio en vez de apilar. Sólo Android y sólo si la lib nativa está
 * enlazada; en cualquier otro caso NO-OP. Nunca lanza.
 */
export async function showRestLiveCountdown(endEpochMs: number, context?: RestLiveContext): Promise<void> {
  await showLiveTimer({
    id: REST_LIVE_NOTIF_ID,
    channelId: LIVE_CHANNEL_ID,
    channelName: LIVE_CHANNEL_NAME,
    title: resolveTitle(context),
    body: resolveBody(context),
    direction: 'down',
    endEpochMs,
    color: resolveColor(context?.color),
    largeIconUrl: context?.largeIconUrl,
    actions: context?.actions ?? REST_RUNNING_ACTIONS,
  })
}

/**
 * Muestra la notificación ESTÁTICA de "Descanso en pausa" (mismo id → reemplaza al cronómetro).
 * Sin chronometer (`direction: 'none'`): Android no sabe congelar un contador, así que la pausa se
 * representa con los segundos restantes escritos en el cuerpo. Mantiene la notificación viva para
 * que "Reanudar"/"Saltar" sigan al alcance con la app en background.
 */
export async function showRestPausedNotice(remainingSeconds: number, context?: RestLiveContext): Promise<void> {
  await showLiveTimer({
    id: REST_LIVE_NOTIF_ID,
    channelId: LIVE_CHANNEL_ID,
    channelName: LIVE_CHANNEL_NAME,
    title: 'Descanso en pausa',
    body: context?.nextLabel
      ? `Quedan ${formatClock(remainingSeconds)} · sigue ${context.nextLabel}`
      : `Quedan ${formatClock(remainingSeconds)}`,
    direction: 'none',
    color: resolveColor(context?.color),
    largeIconUrl: context?.largeIconUrl,
    actions: REST_PAUSED_ACTIONS,
  })
}

/** Retira el cronómetro vivo (pausa/saltar/cerrar/terminar/desmontar). NO-OP si no aplica. */
export async function stopRestLiveCountdown(): Promise<void> {
  await stopLiveTimer(REST_LIVE_NOTIF_ID)
}
