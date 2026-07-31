/**
 * Notificación local del FIN de un bloque de CARDIO (cronómetro vivo de cardio) — canal para
 * BACKGROUND. Es el gemelo de `rest-notification.ts` para la otra cuenta larga del ejecutor: mientras
 * el contador vivo (`live-timer-notification.ts` vía notify-kit) dibuja el tiempo que corre en la
 * bandeja/lockscreen, ESTA es la alerta puntual que CAE al llegar a 0 con la app en segundo plano.
 *
 * ── POR QUÉ UN ARCHIVO PROPIO Y NO reusar el del descanso ──────────────────────
 * El identificador estable es la clave del fix QA-10 (ver la cabecera de `rest-notification.ts`):
 * re-agendar con el MISMO id REEMPLAZA en vez de apilar. Descanso y cardio pueden convivir en la
 * misma sesión (un bloque de cardio con el descanso corriendo detrás), así que necesitan ids y
 * `data.type` DISTINTOS — compartir el id haría que uno cancelara al otro. Lo que sí se comparte es
 * el flujo de permisos (`ensureRestNotifPermission` / `getRestNotifPermission`): el permiso de
 * notificaciones es UNO por app y duplicar el prompt sería un bug de UX.
 *
 * ── PATRÓN COPIADO 1:1 del descanso (hardening QA-10) ──────────────────────────
 *  (a) IDENTIFICADOR ESTABLE (`CARDIO_END_NOTIF_ID`) en cada schedule → a lo sumo existe UNA.
 *  (b) TODAS las ops (schedule/cancel/dismiss/sweep) SERIALIZADAS por una cola de promesas → cero
 *      carreras cancel↔schedule (la fuente demostrada de las huérfanas apiladas en MIUI).
 *  (c) `dismissCardioEndNotification` retira además las ya ENTREGADAS del tipo cardio.
 *  (d) `sweepCardioNotifications` cancela al arrancar cualquier programada huérfana del tipo cardio.
 *
 * Permiso: igual que el descanso, `scheduleCardioEndNotification` NUNCA promptea — solo programa si
 * el permiso YA está concedido. El prompt lazy vive en `ensureCardioNotifPermission` (alias del del
 * descanso) y lo dispara `useCardioLiveTimer` en el PRIMER arranque real del contador, no por abrir
 * la pantalla. Sin permiso ⇒ no-op seguro (el timer de la pantalla funciona igual).
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { ensureRestNotifPermission, getRestNotifPermission } from './rest-notification'
import { isRestTimerMuted } from './rest-timer-preferences'

/**
 * Identificador ESTABLE de la notificación de fin de cardio (mismo razonamiento que
 * `REST_END_NOTIF_ID`): el scheduler nativo lo usa como key del store de programadas y como tag/id
 * de la notificación visible → re-agendar con el MISMO id reemplaza la previa en su sitio.
 */
const CARDIO_END_NOTIF_ID = 'eva-cardio-end'
const CARDIO_NOTIF_TYPE = 'cardio-timer'

/**
 * El permiso de notificaciones es UNO por app: se reusa el flujo lazy + cacheado del descanso en vez
 * de duplicar prompts (dos "¿permitir notificaciones?" en la misma sesión sería un bug de UX).
 */
export { ensureRestNotifPermission as ensureCardioNotifPermission }

/**
 * Cola serializadora propia del cardio: encadena TODAS sus operaciones para que corran en orden
 * estricto y nunca se interleaven (fix QA-10 aplicado a este canal). Cada op se engancha al final de
 * la cadena; los errores se tragan para que la cadena nunca quede rechazada.
 */
let opQueue: Promise<unknown> = Promise.resolve()
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = opQueue.then(op, op)
  opQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Cancela por el identificador ESTABLE (idempotente; no-op si no hay nada programado). */
async function cancelById(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(CARDIO_END_NOTIF_ID)
  } catch {
    // no-op
  }
}

/**
 * Programa (o reprograma) la notificación de fin de cardio para `seconds` adelante. Idempotente y
 * SIN carreras: corre dentro de la cola serializada y usa el identificador ESTABLE → el mismo id
 * reemplaza la programación previa en vez de apilar. Respeta el mute global del cronómetro
 * (`restTimerMuted`, la misma tuerca que silencia el descanso: es una preferencia del cronómetro del
 * ejecutor, no exclusiva del descanso).
 */
export function scheduleCardioEndNotification(seconds: number): Promise<void> {
  return enqueue(async () => {
    // Cancela explícitamente la previa por id antes de reprogramar (belt-and-suspenders sobre el
    // reemplazo implícito del mismo identifier).
    await cancelById()
    if (!Number.isFinite(seconds) || seconds <= 0) return
    // Igual que el descanso: la notif SOLO se programa si el permiso YA está concedido; NUNCA
    // promptea a mitad del bloque. Sin permiso ⇒ silencio total (el timer sigue en foreground).
    if ((await getRestNotifPermission()) !== 'granted') return
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: CARDIO_END_NOTIF_ID,
        content: {
          title: '¡Cardio completo!',
          body: 'Buen trabajo. Toca para volver a tu sesión.',
          sound: isRestTimerMuted() ? false : 'default',
          data: { type: CARDIO_NOTIF_TYPE },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.round(seconds)),
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
        },
      })
    } catch {
      // no-op
    }
  })
}

/** Cancela la notificación de fin de cardio PROGRAMADA (si hay). Serializado. */
export function cancelCardioEndNotification(): Promise<void> {
  return enqueue(cancelById)
}

/**
 * Retira la notificación de fin de cardio ya ENTREGADA/pintada: al morir el bloque (pausa, salto de
 * fase, terminar, desmontar) o al volver a foreground, además de cancelar la programada barre las
 * visibles del tipo cardio. Serializado.
 */
export function dismissCardioEndNotification(): Promise<void> {
  return enqueue(async () => {
    try {
      await Notifications.dismissNotificationAsync(CARDIO_END_NOTIF_ID)
    } catch {
      // no-op
    }
    try {
      const presented = await Notifications.getPresentedNotificationsAsync()
      await Promise.all(
        presented
          .filter((n) => (n.request?.content?.data as { type?: string } | undefined)?.type === CARDIO_NOTIF_TYPE)
          .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
      )
    } catch {
      // no-op
    }
  })
}

/**
 * Red de barrido al MONTAR una pantalla de cardio: cancela cualquier notificación PROGRAMADA
 * huérfana del tipo cardio (residuo de un mount previo que murió sin limpiar). Serializado.
 */
export function sweepCardioNotifications(): Promise<void> {
  return enqueue(async () => {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync()
      const stale = all.filter(
        (n) =>
          n.identifier === CARDIO_END_NOTIF_ID ||
          (n.content?.data as { type?: string } | undefined)?.type === CARDIO_NOTIF_TYPE,
      )
      await Promise.all(stale.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})))
    } catch {
      // no-op
    }
  })
}
