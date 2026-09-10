/**
 * Notificación local del FIN de un HOLD en pantalla (movilidad y fuerza por tiempo) — canal para
 * BACKGROUND (specs/cuenta-atras-en-pantalla, W3.6 · R18 + R31). Gemelo EXACTO de
 * `cardio-notification.ts`: mismo patrón, otro identificador y otro `data.type`.
 *
 * ── POR QUÉ UN ARCHIVO PROPIO Y NO reusar el del descanso ni el de cardio ──────
 * El identificador estable es la clave del fix QA-10 (ver la cabecera de `rest-notification.ts`):
 * re-agendar con el MISMO id REEMPLAZA en vez de apilar. Descanso, cardio y hold pueden convivir en
 * la misma sesión (un hold corriendo con el descanso del bloque anterior detrás), así que necesitan
 * ids y `data.type` DISTINTOS — compartir el id haría que uno cancelara al otro. Lo que sí se
 * comparte es el flujo de permisos (`ensureRestNotifPermission` / `getRestNotifPermission`): el
 * permiso de notificaciones es UNO por app y duplicar el prompt sería un bug de UX.
 *
 * ── PATRÓN COPIADO 1:1 del descanso / cardio (hardening QA-10) ─────────────────
 *  (a) IDENTIFICADOR ESTABLE (`HOLD_END_NOTIF_ID`) en cada schedule → a lo sumo existe UNA.
 *  (b) TODAS las ops (schedule/cancel/dismiss/sweep) SERIALIZADAS por una cola de promesas → cero
 *      carreras cancel↔schedule (la fuente demostrada de las huérfanas apiladas en MIUI).
 *  (c) `dismissHoldEndNotification` retira además las ya ENTREGADAS del tipo hold.
 *  (d) `sweepHoldNotifications` cancela al arrancar cualquier programada huérfana del tipo hold.
 *
 * ── TABLA DE DISPARO (la aplica `use-hold-module`, W3.2) ───────────────────────
 *   `start`, `resume`                                  ⇒ `schedule`
 *   `pause`, «Listo» antes de 0, «re-medir»,
 *   cambio de LADO, cambio de MIEMBRO, desmontaje      ⇒ `cancel` + `dismiss`
 *   `remaining <= 2 s` o vuelta a foreground           ⇒ `cancel`
 * Sin esa disciplina el handler global (`apps/mobile/lib/push.ts:86-95`) muestra —y suena— la
 * notificación con la app ABIERTA ⇒ doble beep. El umbral de 2 s copia `useRestTimerEngine.ts:270`
 * y `:312-313`.
 *
 * Corolario de R29: con `duration_sec < 10` **no se programa** nada (no alcanza para salir de la app
 * y volver, y la propia notificación se cancelaría en los últimos ~2 s). El piso vive acá, en
 * `HOLD_NOTIF_MIN_SEC`, para que ninguna pantalla lo reimplemente.
 *
 * Permiso: igual que el descanso y el cardio, `scheduleHoldEndNotification` NUNCA promptea — solo
 * programa si el permiso YA está concedido. Sin permiso ⇒ no-op seguro (el reloj de la pantalla y la
 * háptica de 0 funcionan igual). El criterio de salida del tren es «vibra y avisa», nunca «suena»
 * (R31).
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { ensureRestNotifPermission, getRestNotifPermission } from './rest-notification'
import { isRestTimerMuted } from './rest-timer-preferences'

/**
 * Identificador ESTABLE de la notificación de fin de hold (mismo razonamiento que
 * `REST_END_NOTIF_ID` / `CARDIO_END_NOTIF_ID`): el scheduler nativo lo usa como key del store de
 * programadas y como tag/id de la notificación visible → re-agendar con el MISMO id reemplaza la
 * previa en su sitio.
 */
export const HOLD_END_NOTIF_ID = 'eva-hold-end'
export const HOLD_NOTIF_TYPE = 'hold-end'

/**
 * Piso de duración para programar el aviso (corolario de R29). Un hold de menos de 10 s no da tiempo
 * a salir de la app y volver, y el propio aviso se cancela en los últimos ~2 s.
 */
export const HOLD_NOTIF_MIN_SEC = 10

/**
 * El permiso de notificaciones es UNO por app: se reusa el flujo lazy + cacheado del descanso en vez
 * de duplicar prompts (dos "¿permitir notificaciones?" en la misma sesión sería un bug de UX).
 */
export { ensureRestNotifPermission as ensureHoldNotifPermission }

/**
 * Cola serializadora propia del hold: encadena TODAS sus operaciones para que corran en orden
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
    await Notifications.cancelScheduledNotificationAsync(HOLD_END_NOTIF_ID)
  } catch {
    // no-op
  }
}

/**
 * Programa (o reprograma) la notificación de fin de hold para `seconds` adelante. Idempotente y SIN
 * carreras: corre dentro de la cola serializada y usa el identificador ESTABLE → el mismo id
 * reemplaza la programación previa en vez de apilar. Respeta el mute global del cronómetro
 * (`restTimerMuted`, la misma tuerca que silencia el descanso: es una preferencia del cronómetro del
 * ejecutor, no exclusiva del descanso).
 *
 * Por debajo de `HOLD_NOTIF_MIN_SEC` cancela lo que hubiera y no programa nada (R29).
 */
export function scheduleHoldEndNotification(seconds: number): Promise<void> {
  return enqueue(async () => {
    // Cancela explícitamente la previa por id antes de reprogramar (belt-and-suspenders sobre el
    // reemplazo implícito del mismo identifier).
    await cancelById()
    if (!Number.isFinite(seconds) || seconds < HOLD_NOTIF_MIN_SEC) return
    // Igual que el descanso: la notif SOLO se programa si el permiso YA está concedido; NUNCA
    // promptea a mitad del hold. Sin permiso ⇒ silencio total (el timer sigue en foreground).
    if ((await getRestNotifPermission()) !== 'granted') return
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: HOLD_END_NOTIF_ID,
        content: {
          title: 'Terminó tu hold',
          body: 'Ya quedó registrado. Toca para volver a tu sesión.',
          sound: isRestTimerMuted() ? false : 'default',
          data: { type: HOLD_NOTIF_TYPE },
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

/** Cancela la notificación de fin de hold PROGRAMADA (si hay). Serializado. */
export function cancelHoldEndNotification(): Promise<void> {
  return enqueue(cancelById)
}

/**
 * Retira la notificación de fin de hold ya ENTREGADA/pintada: al morir el hold (pausa, «Listo»,
 * re-medir, cambio de lado o de miembro, desmontar) o al volver a foreground, además de cancelar la
 * programada barre las visibles del tipo hold. Serializado.
 */
export function dismissHoldEndNotification(): Promise<void> {
  return enqueue(async () => {
    try {
      await Notifications.dismissNotificationAsync(HOLD_END_NOTIF_ID)
    } catch {
      // no-op
    }
    try {
      const presented = await Notifications.getPresentedNotificationsAsync()
      await Promise.all(
        presented
          .filter((n) => (n.request?.content?.data as { type?: string } | undefined)?.type === HOLD_NOTIF_TYPE)
          .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
      )
    } catch {
      // no-op
    }
  })
}

/**
 * Red de barrido al MONTAR un módulo de hold: cancela cualquier notificación PROGRAMADA huérfana del
 * tipo hold (residuo de un mount previo que murió sin limpiar). Serializado.
 */
export function sweepHoldNotifications(): Promise<void> {
  return enqueue(async () => {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync()
      const stale = all.filter(
        (n) =>
          n.identifier === HOLD_END_NOTIF_ID ||
          (n.content?.data as { type?: string } | undefined)?.type === HOLD_NOTIF_TYPE,
      )
      await Promise.all(stale.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})))
    } catch {
      // no-op
    }
  })
}
