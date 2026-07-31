/**
 * Cronómetro VIVO genérico en la bandeja/lockscreen — una notificación ONGOING cuyo contador
 * corre nativamente como el Temporizador del sistema ("39:57 [pausa] [x]"), incluso con la
 * pantalla apagada y el JS congelado. Nació para el descanso (feature QA-11, pedido del CEO,
 * ver `rest-live-notification.ts`) y acá está generalizado para que cardio lo reuse: mismo
 * mecanismo, distinto id/canal/copys y con cuenta ASCENDENTE cuando corresponde.
 *
 * ── POR QUÉ NO expo-notifications ──────────────────────────────────────────────
 * `expo-notifications` NO expone chronometer/ongoing con cuenta viva: sólo programa una
 * notificación que CAE en un instante. Actualizar un contador "cada segundo" desde JS muere al
 * apagar la pantalla (el SO congela el timer JS en background). Por eso las alertas puntuales
 * (p.ej. el "¡Descanso listo!" final) siguen en expo y SOLO el contador vivo se delega a Notifee.
 *
 * ── VÍA CORRECTA (investigada 2026) ────────────────────────────────────────────
 * Notifee soporta en Android `android.showChronometer: true` + `chronometerDirection` +
 * `timestamp`: la vista del chronometer la dibuja y avanza el PROPIO Android (SystemClock), así
 * que el conteo sigue vivo sin foreground service y sin que el JS tickee. `ongoing: true` la hace
 * no-descartable (como el timer del sistema).
 * - `direction: 'down'` → `timestamp` = instante de FIN + `timeoutAfter` = ms restantes, así el SO
 *   retira la notif al llegar al fin aunque el JS esté congelado (entonces asoma la alerta final
 *   programada en expo-notifications).
 * - `direction: 'up'` → `timestamp` = instante de INICIO y SIN `timeoutAfter`: un cronómetro
 *   ascendente no termina solo, lo retira quien lo abrió (`stopLiveTimer`).
 * Coexiste con expo-notifications: canales e ids propios, sin pisarse.
 *
 * ── DECISIÓN DE LIBRERÍA (justificada) ─────────────────────────────────────────
 * `@notifee/react-native` fue ARCHIVADO por Invertase (7-abr-2026, último release v9.1.8
 * dic-2024) y su soporte de New Architecture es dudoso. Esta app corre `newArchEnabled: true`
 * + RN 0.81.5 + Expo SDK 54, donde el fork MANTENIDO y API-compatible es
 * `react-native-notify-kit` (TurboModules-only, config plugin de Expo, export default `notifee`
 * idéntico). Este módulo hace `require` GUARDADO probando PRIMERO `react-native-notify-kit` y
 * cayendo a `@notifee/react-native`, así funciona con cualquiera que el build EAS termine
 * enlazando. Sin ninguno de los dos (builds actuales), TODO acá es NO-OP seguro (patrón de
 * `sound.ts`/`VideoPlayer.tsx`: sin import estático, no rompe tsc ni crashea).
 *
 * ⚠️ REQUIERE UN BUILD EAS NUEVO: es una dependencia NATIVA. `react-native-notify-kit` YA está en
 * `package.json` (^10.4.0 → 10.4.8 en el lockfile raíz) y su plugin en `app.json`; sólo falta que un
 * build EAS enlace el módulo nativo para que el cronómetro vivo aparezca (el resto de los timers
 * funciona igual sin él). Hasta ese build, el `require` guardado deja todo en NO-OP seguro.
 *
 * ── smallIcon (investigado 2026-07-31) ─────────────────────────────────────────
 * El plugin `expo-notifications` de `app.json` (`icon: ./assets/notification-icon.png`) genera el
 * drawable `notification_icon` en `android/app/src/main/res/drawable-*dpi/notification_icon.png`
 * (constante `NOTIFICATION_ICON = 'notification_icon'` en `withNotificationsAndroid`), así que ese
 * es el nombre de recurso correcto para `android.smallIcon`. Sin él, Notifee cae al ícono de
 * launcher, que Android pinta como una mancha blanca en la barra. Lo seteamos, pero con RED: si el
 * recurso no resolviera en el binario (Notifee rechaza el display con "invalid small icon"), se
 * reintenta UNA vez sin `smallIcon` y se desactiva para el resto de la sesión → el comportamiento
 * histórico (sin ícono explícito) queda garantizado como fallback.
 *
 * ── 7A · ANDROID 16 LIVE UPDATES / ProgressStyle (evaluación) — DIFERIDO ─────────
 * Android 16 (API 36) agrega `Notification.ProgressStyle` + Live Updates (notificaciones promovidas
 * ongoing con barra de progreso segmentada, ideal para un temporizador). `react-native-notify-kit@10.4.8`
 * (instalado) expone `chronometer` (lo que usamos abajo) pero NO expone `ProgressStyle`/Live Updates: su
 * `AndroidNotification` no tiene campos de progreso promovido (verificado en sus tipos, sin `progressStyle`
 * ni `liveUpdate`). Implementarlo exigiría una versión futura de la lib que mapee la API 36 (o un módulo
 * nativo custom). Se DIFIERE: el `chronometer` actual ya da el conteo vivo en el lockscreen con fallback
 * correcto a APIs menores; el upgrade a ProgressStyle espera a que notify-kit lo soporte.
 */
import { Platform } from 'react-native'

/** Superficie mínima de Notifee que usamos (tipada acá para no exigir sus tipos pre-install). */
interface NotifeeAndroidAction {
  title: string
  pressAction: { id: string }
}
interface NotifeeAndroidNotification {
  channelId: string
  ongoing?: boolean
  onlyAlertOnce?: boolean
  autoCancel?: boolean
  showChronometer?: boolean
  chronometerDirection?: 'up' | 'down'
  timestamp?: number
  timeoutAfter?: number
  smallIcon?: string
  largeIcon?: string
  color?: string
  pressAction?: { id: string }
  actions?: NotifeeAndroidAction[]
  importance?: number
  visibility?: number
}
/**
 * Evento de Notifee tal como llega a `onBackgroundEvent`/`onForegroundEvent`. Tipado MÍNIMO
 * (sólo lo que consumimos) para no depender de los tipos de la lib, que puede no estar instalada.
 * `detail.pressAction.id` es el id que declaramos en `LiveTimerOptions.actions`, y
 * `detail.notification.id` el id de la notificación tocada (nos deja filtrar la nuestra).
 */
export interface NotifeeEvent {
  type: number
  detail?: {
    notification?: { id?: string }
    pressAction?: { id?: string }
  }
}
export interface NotifeeLike {
  createChannel: (channel: {
    id: string
    name: string
    importance?: number
    vibration?: boolean
    visibility?: number
  }) => Promise<string>
  displayNotification: (notification: {
    id?: string
    title?: string
    body?: string
    android?: NotifeeAndroidNotification
  }) => Promise<string>
  cancelNotification: (id: string) => Promise<void>
  /**
   * Handler HEADLESS de Android: corre aunque la app esté en background o cerrada (Notifee
   * levanta el bundle JS para atenderlo). Se registra UNA sola vez por proceso; volver a
   * registrarlo pisa el anterior. Ver `rest-remote-commands.ts`.
   */
  onBackgroundEvent: (observer: (event: NotifeeEvent) => Promise<void>) => void
  /** Gemelo en foreground; devuelve el unsubscribe. */
  onForegroundEvent: (observer: (event: NotifeeEvent) => void) => () => void
}

// require GUARDADO: fork mantenido primero, notifee archivado como fallback. Sin ninguno → null.
let notifee: NotifeeLike | null = null
// AndroidImportance.LOW (canal silencioso para el ongoing). Notifee lo exporta como named;
// LOW = 2 en su enum → fallback numérico si el módulo no está.
let IMPORTANCE_LOW = 2
// AndroidVisibility.PUBLIC (visible completa en lockscreen, incluso con pantalla bloqueada).
// PUBLIC = 1 en el enum de Notifee/notify-kit → fallback numérico si el módulo no está.
let VISIBILITY_PUBLIC = 1
// EventType.ACTION_PRESS = 2 en el enum de Notifee/notify-kit (verificado en
// `dist/types/Notification.d.ts` de react-native-notify-kit@10.4.8: UNKNOWN=-1, DISMISSED=0,
// PRESS=1, ACTION_PRESS=2…). Mismo patrón que IMPORTANCE_LOW: se lee del módulo si está y
// si no queda el fallback numérico, para que el puente de acciones no dependa del enum.
let EVENT_TYPE_ACTION_PRESS = 2

type NotifeeModule = {
  default?: NotifeeLike
  AndroidImportance?: { LOW?: number }
  AndroidVisibility?: { PUBLIC?: number }
  EventType?: { ACTION_PRESS?: number }
}
function adoptNotifeeModule(mod: NotifeeModule): void {
  notifee = (mod.default ?? (mod as unknown as NotifeeLike)) || null
  if (typeof mod.AndroidImportance?.LOW === 'number') IMPORTANCE_LOW = mod.AndroidImportance.LOW
  if (typeof mod.AndroidVisibility?.PUBLIC === 'number') VISIBILITY_PUBLIC = mod.AndroidVisibility.PUBLIC
  if (typeof mod.EventType?.ACTION_PRESS === 'number') EVENT_TYPE_ACTION_PRESS = mod.EventType.ACTION_PRESS
}

try {
  /* eslint-disable @typescript-eslint/no-require-imports */
  adoptNotifeeModule(require('react-native-notify-kit') as NotifeeModule)
} catch {
  try {
    adoptNotifeeModule(require('@notifee/react-native') as NotifeeModule)
  } catch {
    notifee = null
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
}

/**
 * Accesor tipado del módulo notifee resuelto por el require GUARDADO de arriba (o `null` sin lib
 * nativa). Existe para que otros módulos —p.ej. el puente de acciones `rest-remote-commands.ts`—
 * usen la MISMA instancia sin duplicar el require ni su manejo de errores.
 */
export function getNotifee(): NotifeeLike | null {
  return notifee
}

/** Valor de `EventType.ACTION_PRESS` (del enum de la lib, o el fallback 2). */
export function getActionPressEventType(): number {
  return EVENT_TYPE_ACTION_PRESS
}

/** Ids/canal del cronómetro vivo de cardio (los consume la sesión de cardio). */
export const CARDIO_LIVE_ID = 'eva-cardio-live'
export const CARDIO_CHANNEL_ID = 'cardio-live'
export const CARDIO_CHANNEL_NAME = 'Cardio en curso'

// Drawable generado por el plugin de expo-notifications (ver cabecera). Se apaga solo si el
// binario no lo resolviera, para no perder nunca la notificación por un ícono.
const SMALL_ICON = 'notification_icon'
let smallIconEnabled = true

// Un canal por id, cacheado: crear el canal es idempotente pero no gratis, y notifee exige que
// exista antes del primer display.
const channelReady = new Map<string, Promise<void>>()
function ensureChannel(channelId: string, channelName: string): Promise<void> {
  if (!notifee) return Promise.resolve()
  const cached = channelReady.get(channelId)
  if (cached) return cached
  const pending = notifee
    .createChannel({
      id: channelId,
      name: channelName,
      // LOW = sin heads-up ni sonido: es un contador de estado, no una alerta. Las alertas
      // (beep/háptica) las cubren la UI in-app y las notificaciones puntuales de expo.
      importance: IMPORTANCE_LOW,
      vibration: false,
      // Visible completa en lockscreen (no oculta como notif "sensible"). Nota: canales ya
      // creados en dispositivos existentes NO se actualizan solos — esto aplica en
      // instalaciones frescas o tras limpiar datos de la app; la visibility a nivel
      // notificación (abajo, en displayNotification) cubre el resto de los casos.
      visibility: VISIBILITY_PUBLIC,
    })
    .then(() => undefined)
    .catch(() => {
      channelReady.delete(channelId) // reintentar la próxima vez si falló
    })
  channelReady.set(channelId, pending)
  return pending
}

export interface LiveTimerOptions {
  /** Id estable de la notificación: reusarlo ACTUALIZA la misma en vez de apilar otra. */
  id: string
  channelId: string
  channelName: string
  title: string
  body?: string
  /**
   * 'down' = cuenta regresiva (exige `endEpochMs`); 'up' = cronómetro ascendente (exige
   * `startEpochMs`); 'none' = notificación ONGOING **estática**, sin chronometer ni timestamp.
   * 'none' es aditivo y nació para el estado PAUSA del descanso (QA-11 · botones de acción): al
   * pausar desde la notificación no hay reloj que correr, pero la notificación debe seguir viva
   * para ofrecer "Reanudar"/"Saltar" — un chronometer congelado no existe en Android, así que la
   * única representación honesta de la pausa es una notificación sin contador.
   */
  direction: 'down' | 'up' | 'none'
  /** Date.now() del fin absoluto. Obligatorio con `direction: 'down'`. */
  endEpochMs?: number
  /** Date.now() del inicio absoluto. Obligatorio con `direction: 'up'`. */
  startEpochMs?: number
  /** URL remota o path local para el ícono grande (avatar/portada). Opcional. */
  largeIconUrl?: string
  /** Acento de marca del ícono/título (hex). Opcional. */
  color?: string
  /** Acciones rápidas; el id viaja en el evento de press (los handlers viven fuera de este módulo). */
  actions?: { id: string; title: string }[]
}

/**
 * Muestra/actualiza un cronómetro vivo. Reusar el mismo `id` actualiza la notificación en su
 * sitio. Sólo Android (el chronometer de Notifee es Android-only) y sólo si la lib nativa está
 * enlazada; en cualquier otro caso NO-OP. Nunca lanza.
 */
export async function showLiveTimer(opts: LiveTimerOptions): Promise<void> {
  if (Platform.OS !== 'android' || !notifee) return

  let timestamp: number | undefined
  let timeoutAfter: number | undefined
  if (opts.direction === 'down') {
    if (!Number.isFinite(opts.endEpochMs)) return
    const endEpochMs = opts.endEpochMs as number
    const remaining = endEpochMs - Date.now()
    if (remaining <= 0) {
      await stopLiveTimer(opts.id)
      return
    }
    timestamp = endEpochMs
    // El SO retira la notif al llegar al fin aunque el JS esté congelado en background.
    timeoutAfter = Math.max(1000, Math.round(remaining))
  } else if (opts.direction === 'up') {
    if (!Number.isFinite(opts.startEpochMs)) return
    // Un ascendente no vence solo: nada de timeoutAfter, lo retira `stopLiveTimer`.
    timestamp = opts.startEpochMs as number
  }
  // 'none' → sin timestamp ni timeoutAfter: notificación estática que sólo retira `stopLiveTimer`.

  const android: NotifeeAndroidNotification = {
    channelId: opts.channelId,
    // ongoing = no-descartable (como el Temporizador del sistema); onlyAlertOnce = las
    // actualizaciones no re-alertan; autoCancel off = no se va al tocarla.
    ongoing: true,
    onlyAlertOnce: true,
    autoCancel: false,
    importance: IMPORTANCE_LOW,
    // PUBLIC = visible completa en lockscreen (algunos OEM esconden IMPORTANCE_LOW sin
    // visibility explícito).
    visibility: VISIBILITY_PUBLIC,
    pressAction: { id: 'default' },
  }
  if (opts.direction !== 'none') {
    // Conteo VIVO dibujado por Android (SystemClock) → tickea con la pantalla apagada y el JS
    // congelado, sin foreground service.
    android.showChronometer = true
    android.chronometerDirection = opts.direction
  }
  if (timestamp !== undefined) android.timestamp = timestamp
  if (timeoutAfter !== undefined) android.timeoutAfter = timeoutAfter
  if (opts.color) android.color = opts.color
  if (opts.largeIconUrl) android.largeIcon = opts.largeIconUrl
  if (opts.actions?.length) {
    android.actions = opts.actions.map((action) => ({
      title: action.title,
      pressAction: { id: action.id },
    }))
  }

  try {
    await ensureChannel(opts.channelId, opts.channelName)
    if (smallIconEnabled) android.smallIcon = SMALL_ICON
    await notifee.displayNotification({
      id: opts.id,
      title: opts.title,
      body: opts.body,
      android,
    })
  } catch {
    // Único reintento sin smallIcon: si el drawable no resolviera en este binario, el
    // cronómetro igual aparece (comportamiento histórico) y no se vuelve a intentar.
    if (!smallIconEnabled) return
    smallIconEnabled = false
    delete android.smallIcon
    try {
      await notifee.displayNotification({
        id: opts.id,
        title: opts.title,
        body: opts.body,
        android,
      })
    } catch {
      // Falla de la notif nunca interrumpe el timer.
    }
  }
}

/** Retira un cronómetro vivo por id (pausa/terminar/desmontar). NO-OP si no aplica. Nunca lanza. */
export async function stopLiveTimer(id: string): Promise<void> {
  if (Platform.OS !== 'android' || !notifee) return
  try {
    await notifee.cancelNotification(id)
  } catch {
    // no-op
  }
}
