/**
 * Notificación local del fin de descanso (E2-09 · rework Ronda 4) — canal para
 * BACKGROUND. Espeja el bloque `registration.showNotification("¡Descanso listo!"…)`
 * de la web `RestTimer.tsx`, que dispara SOLO cuando el documento no está visible.
 *
 * En móvil no hay Service Worker: usamos `expo-notifications` (ya declarada +
 * autolinkeada) para programar una notificación local que caiga al terminar el
 * descanso mientras la app está en background. Al volver a foreground el cue lo
 * da el audio/háptica in-app, así que la barra CANCELA la notificación programada
 * (ver `RestTimerBar`) para no duplicar el beep.
 *
 * Permiso: la barra NUNCA promptea (paridad web `RestTimer.tsx:134-137`). La notif
 * de background solo se programa si el permiso YA está concedido (`getRestNotifPermission`,
 * lectura sin prompt). El único prompt interactivo vive tras el botón "Activar permisos"
 * del panel de ajustes (`requestRestNotifPermission`). Sin permiso ⇒ no-op seguro.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { isRestTimerMuted } from './rest-timer-preferences'

let permResolved = false
let permGranted = false
let scheduledId: string | null = null

/**
 * Estado del permiso para la UI de ajustes (espejo del `permission` del panel web
 * `WorkoutTimerSettingsPanel`): `'default'` = aún no decidido (undetermined),
 * `'denied'` = negado (sin poder re-preguntar → recuperación por Ajustes del SO),
 * `'unsupported'` = notifs no disponibles. `null` (en el consumidor) = cargando.
 */
export type RestNotifPermission = 'granted' | 'denied' | 'default' | 'unsupported'

function mapStatus(status: string, canAskAgain: boolean): RestNotifPermission {
  if (status === 'granted') return 'granted'
  // undetermined → 'default' (podemos pedirlo). Negado con re-pregunta aún posible
  // se trata como 'default' para ofrecer el botón; sólo bloqueo duro → 'denied'.
  if (status === 'undetermined' || canAskAgain) return 'default'
  return 'denied'
}

/**
 * Lee el permiso actual SIN promptear (para pintar el card de ajustes). NO toca
 * el cache lazy (`permResolved`): así no suprime el prompt automático que dispara
 * el primer timer si el alumno abre ajustes antes de usar uno.
 */
export async function getRestNotifPermission(): Promise<RestNotifPermission> {
  try {
    const current = await Notifications.getPermissionsAsync()
    return mapStatus(current.status, current.canAskAgain !== false)
  } catch {
    return 'unsupported'
  }
}

/** Pide el permiso de forma interactiva (botón "Activar permisos"). Devuelve el estado final. */
export async function requestRestNotifPermission(): Promise<RestNotifPermission> {
  try {
    const res = await Notifications.requestPermissionsAsync()
    const mapped = mapStatus(res.status, res.canAskAgain !== false)
    permResolved = true
    permGranted = mapped === 'granted'
    return mapped
  } catch {
    return 'unsupported'
  }
}

/** Pide permiso de notificaciones una sola vez (lazy). Devuelve si quedó concedido. */
export async function ensureRestNotifPermission(): Promise<boolean> {
  if (permResolved) return permGranted
  permResolved = true
  try {
    const current = await Notifications.getPermissionsAsync()
    let status = current.status
    if (status !== 'granted' && current.canAskAgain !== false) {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    permGranted = status === 'granted'
  } catch {
    permGranted = false
  }
  return permGranted
}

/**
 * Programa (o reprograma) la notificación de fin de descanso para `seconds`
 * adelante. Idempotente: cancela cualquier programación previa antes. Respeta la
 * preferencia in-app de mute (silencia el sonido de la notif, no el aviso).
 */
export async function scheduleRestEndNotification(seconds: number): Promise<void> {
  await cancelRestEndNotification()
  if (!Number.isFinite(seconds) || seconds <= 0) return
  // Paridad web (`RestTimer.tsx:134-137`): la notif SOLO se programa si el permiso YA
  // está concedido; NUNCA promptea a mitad del descanso. Sin permiso ⇒ silencio total
  // (el prompt interactivo vive únicamente en el botón del panel de ajustes).
  if ((await getRestNotifPermission()) !== 'granted') return
  try {
    scheduledId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '¡Descanso listo!',
        body: 'Prepárate para la siguiente serie. (Toca para detener)',
        sound: isRestTimerMuted() ? false : 'default',
        data: { type: 'rest-timer' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      },
    })
  } catch {
    scheduledId = null
  }
}

/** Cancela la notificación de fin de descanso programada (si hay). */
export async function cancelRestEndNotification(): Promise<void> {
  const id = scheduledId
  scheduledId = null
  if (!id) return
  try {
    await Notifications.cancelScheduledNotificationAsync(id)
  } catch {
    // no-op
  }
}
