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
 * Permiso LAZY: se pide la primera vez que se usa un timer (no en el arranque),
 * y se cachea el resultado. Si el usuario lo niega, todo acá es no-op seguro.
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { isRestTimerMuted } from './rest-timer-preferences'

let permResolved = false
let permGranted = false
let scheduledId: string | null = null

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
  if (!(await ensureRestNotifPermission())) return
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
