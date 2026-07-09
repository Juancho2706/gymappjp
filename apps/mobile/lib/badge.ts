import * as Notifications from 'expo-notifications'

/**
 * Badge nativo del icono de la app (E4-22).
 *
 * Envuelve `expo-notifications` `setBadgeCountAsync` / `getBadgeCountAsync`
 * (iOS: badge del icono; Android: soportado por launchers compatibles) con un
 * contrato tolerante a fallos: NADA de esto es money-safe ni bloqueante, así que
 * cualquier excepción se traga silenciosamente. Nunca debe romper un flujo del
 * alumno (abrir check-in, arranque, push handler).
 *
 * Convención EVA del contador: numero de acciones PENDIENTES del alumno
 * (check-in del mes sin hacer, plan nuevo sin abrir, etc.). El badge se LIMPIA
 * cuando el alumno atiende la accion — hoy: al abrir el check-in (E4-18).
 */

/** Setea el contador del badge. `count <= 0` limpia el badge. Best-effort. */
export async function setAppBadge(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)))
  } catch {
    // no-op: el badge es cosmético, jamás debe propagar el error al UI
  }
}

/** Limpia el badge (equivalente a `setAppBadge(0)`). Best-effort. */
export async function clearAppBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0)
  } catch {
    // no-op
  }
}

/** Lee el contador actual del badge (0 si no se puede leer). Best-effort. */
export async function getAppBadge(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync()
  } catch {
    return 0
  }
}
