/**
 * REGISTRO ÚNICO de los eventos de notificación de la app (Notifee/notify-kit) con despacho por
 * PREFIJO del id de acción: `rest-*` → puente del descanso, `cardio-*` → puente de cardio.
 *
 * ── POR QUÉ EXISTE (bug latente verificado, no teórico) ────────────────────────
 * `notifee.onBackgroundEvent` admite UN SOLO handler por aplicación. No es una convención: en
 * `react-native-notify-kit@10.4.8` el método hace literalmente `backgroundEventHandler = observer`
 * sobre una variable de módulo (`src/NotifeeApiModule.ts:512`), y sus propios tipos lo dicen
 * ("only a single event handler can be registered for the application", `dist/types/Module.d.ts`).
 * El descanso ya registraba el suyo desde `app/_layout.tsx`; un SEGUNDO registro para cardio no
 * habría convivido — el último en cargar habría dejado al otro sin botones, en silencio y sólo con
 * la app en background (el peor modo de fallar: imposible de ver en desarrollo con la app delante).
 *
 * Por eso el registro nativo vive ACÁ, se hace UNA vez por proceso, y cada puente se anota en un
 * mapa module-level. `registerRestNotificationEvents()` / `registerCardioNotificationEvents()`
 * conservan su firma y sólo delegan; `app/_layout.tsx` sigue llamándolas a nivel de módulo.
 *
 * ── DESPACHO POR PREFIJO (y no por id de notificación) ─────────────────────────
 * Se enruta por el prefijo del ACTION ID (`rest-` / `cardio-`) y no por `detail.notification.id`
 * porque algunos OEM omiten el id de la notificación en el evento. Los prefijos son disjuntos por
 * construcción, así que un press del descanso jamás puede caer en el handler de cardio ni al revés.
 * Cada puente igual revalida lo suyo (tipo de evento, id de notificación) — defensa en profundidad.
 *
 * NO-OP total si no hay lib nativa enlazada (`getNotifee()` null): el mapa se llena igual (los tests
 * y el despacho directo siguen funcionando) pero no hay nada nativo a lo que suscribirse. Nunca lanza.
 */
import { getActionPressEventType, getNotifee, type NotifeeEvent } from './live-timer-notification'

/** Handler headless de un puente (descanso, cardio…). Debe tragarse sus propios errores. */
export type NotificationActionHandler = (event: NotifeeEvent) => Promise<void>

/** prefijo del action id → handler. Module-level: vive en el bundle, no en el árbol React. */
const handlers = new Map<string, NotificationActionHandler>()
let nativeRegistered = false

/**
 * Anota (o reemplaza) el handler de un prefijo y garantiza el registro nativo. Idempotente: llamarlo
 * dos veces con el mismo prefijo deja exactamente un handler.
 */
export function registerNotificationActionHandler(prefix: string, handler: NotificationActionHandler): void {
  handlers.set(prefix, handler)
  ensureNotificationEventsRegistered()
}

/**
 * Enruta un evento de Notifee al puente dueño del prefijo. Ignora todo lo que no sea un press de
 * acción. Nunca lanza: un puente roto no puede tumbar el handler headless (que Android observa).
 */
export async function dispatchNotificationEvent(event: NotifeeEvent): Promise<void> {
  try {
    if (!event || event.type !== getActionPressEventType()) return
    const actionId = event.detail?.pressAction?.id
    if (!actionId) return
    for (const [prefix, handler] of handlers) {
      if (actionId.startsWith(prefix)) {
        await handler(event)
        return
      }
    }
  } catch {
    // Un fallo del despacho nunca rompe la app.
  }
}

/**
 * Suscribe los listeners nativos UNA sola vez por proceso. `onBackgroundEvent` pisa al anterior (ver
 * cabecera), así que el flag de módulo no es una optimización: es la corrección.
 */
export function ensureNotificationEventsRegistered(): void {
  if (nativeRegistered) return
  const notifee = getNotifee()
  if (!notifee) return // sin lib nativa: se reintenta si algún día la hubiera
  nativeRegistered = true
  try {
    if (typeof notifee.onBackgroundEvent === 'function') {
      notifee.onBackgroundEvent(async (event) => {
        await dispatchNotificationEvent(event)
      })
    }
  } catch {
    // no-op
  }
  try {
    if (typeof notifee.onForegroundEvent === 'function') {
      notifee.onForegroundEvent((event) => {
        void dispatchNotificationEvent(event)
      })
    }
  } catch {
    // no-op
  }
}

/** Sólo para tests: vacía el registro compartido. */
export function __resetNotificationEvents(): void {
  handlers.clear()
  nativeRegistered = false
}
