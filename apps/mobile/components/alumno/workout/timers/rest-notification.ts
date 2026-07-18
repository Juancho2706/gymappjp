/**
 * Notificación local del fin de descanso (E2-09 · rework Ronda 4 · hardening QA-10) —
 * canal para BACKGROUND. Espeja el bloque `registration.showNotification("¡Descanso listo!"…)`
 * de la web `RestTimer.tsx`, que dispara SOLO cuando el documento no está visible.
 *
 * En móvil no hay Service Worker: usamos `expo-notifications` (ya declarada +
 * autolinkeada) para programar una notificación local que caiga al terminar el
 * descanso mientras la app está en background. Al volver a foreground el cue lo
 * da el audio/háptica in-app, así que la barra CANCELA la notificación programada
 * (ver `RestTimerBar`) para no duplicar el beep.
 *
 * Permiso (fix QA-3): la barra pide permiso la PRIMERA vez que arranca un descanso vía
 * `ensureRestNotifPermission` (lazy + cacheado → nunca re-pregunta; diverge a propósito de
 * la web, que nunca promptea, porque en móvil el aviso de fondo es una capacidad nativa
 * sancionada por el CEO). `scheduleRestEndNotification` sigue SIN promptear: sólo programa si
 * el permiso YA está concedido. Sin permiso ⇒ no-op seguro (el timer sigue en foreground).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIX QA-10 (spam de ~5 notificaciones apiladas + siguen llegando tras cerrar).
 * CAUSA RAÍZ (demostrada): la versión previa NO pasaba `identifier` a
 * `scheduleNotificationAsync`, así que expo generaba un UUID nuevo por cada schedule
 * (`scheduleNotificationAsync.ts`: `request.identifier ?? uuidv4()`), y trackeaba el
 * resultado en UN solo `let scheduledId`. En un descanso normal, `syncEndNotification`
 * (→ `scheduleRestEndNotification`) se dispara desde 4+ sitios, varios CONCURRENTES:
 * countdown al armar, efecto de permiso al montar, ±15s, y AppState→background. Como
 * cada llamada hacía `await cancel()` (que ponía `scheduledId=null` al entrar) y luego
 * `await schedule()`, dos llamadas concurrentes leían un id null en el cancel y ambas
 * creaban notificaciones NUEVAS con UUID distinto → sólo la última quedaba trackeada y
 * el resto eran HUÉRFANAS. MIUI/Xiaomi entrega las encoladas apiladas al llegar al fin
 * (las 4-5 de la foto), y cerrar/desmontar sólo cancelaba el id trackeado → las huérfanas
 * seguían disparando después.
 *
 * FIX: (a) IDENTIFICADOR ESTABLE único (`REST_END_NOTIF_ID`) en cada schedule → Android
 * usa el identifier como key del store de programadas Y como tag/id de la notif visible,
 * así el mismo id REEMPLAZA (nunca apila): a lo sumo existe UNA. (b) Todas las ops
 * (schedule/cancel/dismiss/sweep) van SERIALIZADAS por una cola de promesas → cero carreras
 * cancel↔schedule. (c) `dismissRestEndNotification` retira además las ya ENTREGADAS (barre
 * las apiladas que un build viejo dejó pintadas). (d) `sweepRestNotifications` cancela al
 * arrancar cualquier programada huérfana del tipo descanso (residuo de mounts/builds previos).
 */
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { isRestTimerMuted } from './rest-timer-preferences'

/**
 * Identificador ESTABLE de la notificación de fin de descanso (fix QA-10). Se pasa a
 * `scheduleNotificationAsync({ identifier })`: el scheduler nativo lo usa como key del
 * store de programadas y como tag/id de la notificación visible → re-agendar con el
 * MISMO id reemplaza la previa en su sitio en vez de apilar una nueva. Marcar
 * `data.type = 'rest-timer'` permite además barrer huérfanas de builds viejos.
 */
const REST_END_NOTIF_ID = 'eva-rest-end'
const REST_NOTIF_TYPE = 'rest-timer'

let permResolved = false
let permGranted = false

/**
 * Cola serializadora: encadena TODAS las operaciones de notificación (cancel/schedule/
 * dismiss/sweep) para que corran estrictamente en orden y nunca se interleaven (fix QA-10:
 * las carreras cancel↔schedule eran la fuente de las huérfanas). Cada op se engancha al
 * final de la cadena; los errores se tragan para que la cadena nunca quede rechazada.
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
    if (mapped === 'granted') {
      // Confirmación inmediata al conceder (paridad web `WorkoutTimerSettingsPanel.tsx:41-53`:
      // tras `granted`, `showNotification('¡Notificaciones activadas!', { body: 'El cronómetro te
      // avisará cuando termine el descanso.' })`). `trigger: null` = se presenta de inmediato.
      // try/catch silencioso: si el SO no la muestra, el permiso quedó igual concedido.
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '¡Notificaciones activadas!',
            body: 'El cronómetro te avisará cuando termine el descanso.',
            data: { type: 'rest-timer-confirm' },
          },
          trigger: null,
        })
      } catch {
        // no-op
      }
    }
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

/** Cancela por el identificador ESTABLE (idempotente; no-op si no hay nada programado). */
async function cancelById(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_END_NOTIF_ID)
  } catch {
    // no-op
  }
}

/**
 * Programa (o reprograma) la notificación de fin de descanso para `seconds` adelante.
 * Idempotente y SIN carreras: corre dentro de la cola serializada y usa el identificador
 * ESTABLE (`REST_END_NOTIF_ID`) → el mismo id reemplaza la programación previa en vez de
 * apilar una notificación nueva (fix QA-10). Respeta el mute in-app (silencia el sonido).
 */
export function scheduleRestEndNotification(seconds: number): Promise<void> {
  return enqueue(async () => {
    // Cancela explícitamente la previa por id antes de reprogramar (belt-and-suspenders
    // sobre el reemplazo implícito del mismo identifier).
    await cancelById()
    if (!Number.isFinite(seconds) || seconds <= 0) return
    // Paridad web (`RestTimer.tsx:134-137`): la notif SOLO se programa si el permiso YA
    // está concedido; NUNCA promptea a mitad del descanso. Sin permiso ⇒ silencio total
    // (el prompt interactivo vive únicamente en el botón del panel de ajustes).
    if ((await getRestNotifPermission()) !== 'granted') return
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: REST_END_NOTIF_ID,
        content: {
          title: '¡Descanso listo!',
          body: 'Prepárate para la siguiente serie. (Toca para detener)',
          sound: isRestTimerMuted() ? false : 'default',
          data: { type: REST_NOTIF_TYPE },
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

/** Cancela la notificación de fin de descanso PROGRAMADA (si hay). Serializado. */
export function cancelRestEndNotification(): Promise<void> {
  return enqueue(cancelById)
}

/**
 * Retira la notificación de fin de descanso ya ENTREGADA/pintada (fix QA-10 (b)): al morir
 * el timer (cerrar/saltar/pausar/desmontar) además de cancelar la programada, barre las
 * visibles del tipo descanso. Cubre las apiladas que un build viejo (sin id estable) dejó
 * pintadas y que MIUI mantiene en la bandeja. Serializado.
 */
export function dismissRestEndNotification(): Promise<void> {
  return enqueue(async () => {
    try {
      await Notifications.dismissNotificationAsync(REST_END_NOTIF_ID)
    } catch {
      // no-op
    }
    try {
      const presented = await Notifications.getPresentedNotificationsAsync()
      await Promise.all(
        presented
          .filter((n) => (n.request?.content?.data as { type?: string } | undefined)?.type === REST_NOTIF_TYPE)
          .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {})),
      )
    } catch {
      // no-op
    }
  })
}

/**
 * Red de barrido al ARRANCAR un descanso nuevo (fix QA-10 (d)): cancela cualquier
 * notificación PROGRAMADA huérfana del tipo descanso (residuo de un mount previo o de un
 * build viejo que agendó con UUIDs sueltos). Serializado. Complementa el id estable: aunque
 * el id estable evita apilar en adelante, esto limpia lo que quedó de antes.
 */
export function sweepRestNotifications(): Promise<void> {
  return enqueue(async () => {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync()
      const stale = all.filter(
        (n) =>
          n.identifier === REST_END_NOTIF_ID ||
          (n.content?.data as { type?: string } | undefined)?.type === REST_NOTIF_TYPE,
      )
      await Promise.all(stale.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})))
    } catch {
      // no-op
    }
  })
}
