/**
 * Cronómetro VIVO del descanso en la bandeja/lockscreen (feature QA-11, pedido del CEO) —
 * una notificación ONGOING con cuenta regresiva que corre nativamente como el Temporizador
 * del sistema ("39:57 [pausa] [x]"), incluso con la pantalla apagada y el JS congelado.
 *
 * ── POR QUÉ NO expo-notifications ──────────────────────────────────────────────
 * `expo-notifications` NO expone chronometer/ongoing con cuenta regresiva viva: sólo
 * programa una notificación que CAE en un instante. Actualizar un contador "cada segundo"
 * desde JS muere al apagar la pantalla (el SO congela el timer JS en background). Por eso
 * el "¡Descanso listo!" final SIGUE en `rest-notification.ts` (expo), y SOLO el contador
 * vivo se delega a Notifee.
 *
 * ── VÍA CORRECTA (investigada 2026) ────────────────────────────────────────────
 * Notifee soporta en Android `android.showChronometer: true` + `chronometerDirection: 'down'`
 * + `timestamp` = instante de fin: la vista del chronometer la dibuja y avanza el PROPIO
 * Android (SystemClock), así que la cuenta regresiva sigue viva sin foreground service y sin
 * que el JS tickee. `ongoing: true` la hace no-descartable (como el timer del sistema).
 * `timeoutAfter` = ms restantes → el SO la retira solo al llegar al fin aunque el JS esté
 * congelado (entonces asoma el "¡Descanso listo!" programado en expo). Coexiste con
 * expo-notifications: canal e id propios, sin pisarse.
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
 * build EAS enlace el módulo nativo para que el cronómetro vivo aparezca (el resto del descanso funciona
 * igual sin él). Hasta ese build, el `require` guardado deja todo en NO-OP seguro.
 *
 * ── 7A · ANDROID 16 LIVE UPDATES / ProgressStyle (evaluación) — DIFERIDO ─────────
 * Android 16 (API 36) agrega `Notification.ProgressStyle` + Live Updates (notificaciones promovidas
 * ongoing con barra de progreso segmentada, ideal para un temporizador). `react-native-notify-kit@10.4.8`
 * (instalado) expone `chronometer` (lo que usamos abajo) pero NO expone `ProgressStyle`/Live Updates: su
 * `AndroidNotification` no tiene campos de progreso promovido (verificado en sus tipos, sin `progressStyle`
 * ni `liveUpdate`). Implementarlo exigiría una versión futura de la lib que mapee la API 36 (o un módulo
 * nativo custom). Se DIFIERE: el `chronometer` actual ya da la cuenta regresiva viva en el lockscreen con
 * fallback correcto a APIs menores; el upgrade a ProgressStyle espera a que notify-kit lo soporte. No se
 * instala nada nuevo para esto (fuera del alcance de esta unidad).
 */
import { Platform } from 'react-native'
import { isRestTimerMuted } from './rest-timer-preferences'

/** Superficie mínima de Notifee que usamos (tipada acá para no exigir sus tipos pre-install). */
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
  color?: string
  pressAction?: { id: string }
  importance?: number
}
interface NotifeeLike {
  createChannel: (channel: { id: string; name: string; importance?: number; vibration?: boolean }) => Promise<string>
  displayNotification: (notification: {
    id?: string
    title?: string
    body?: string
    android?: NotifeeAndroidNotification
  }) => Promise<string>
  cancelNotification: (id: string) => Promise<void>
}

// require GUARDADO: fork mantenido primero, notifee archivado como fallback. Sin ninguno → null.
let notifee: NotifeeLike | null = null
// AndroidImportance.LOW (canal silencioso para el ongoing). Notifee lo exporta como named;
// LOW = 2 en su enum → fallback numérico si el módulo no está.
let IMPORTANCE_LOW = 2
try {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const mod = require('react-native-notify-kit') as {
    default?: NotifeeLike
    AndroidImportance?: { LOW?: number }
  }
  notifee = (mod.default ?? (mod as unknown as NotifeeLike)) || null
  if (typeof mod.AndroidImportance?.LOW === 'number') IMPORTANCE_LOW = mod.AndroidImportance.LOW
} catch {
  try {
    const mod = require('@notifee/react-native') as {
      default?: NotifeeLike
      AndroidImportance?: { LOW?: number }
    }
    notifee = (mod.default ?? (mod as unknown as NotifeeLike)) || null
    if (typeof mod.AndroidImportance?.LOW === 'number') IMPORTANCE_LOW = mod.AndroidImportance.LOW
  } catch {
    notifee = null
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
}

const LIVE_NOTIF_ID = 'eva-rest-live'
const LIVE_CHANNEL_ID = 'rest-live'
// EVA DS brand accent (sport-500 = rgb 38 128 255), espeja el lightColor de `setupAndroidChannel`.
const BRAND_COLOR = '#2680FF'

let channelReady: Promise<void> | null = null
function ensureChannel(): Promise<void> {
  if (!notifee) return Promise.resolve()
  if (!channelReady) {
    channelReady = notifee
      .createChannel({
        id: LIVE_CHANNEL_ID,
        name: 'Descanso en curso',
        // LOW = sin heads-up ni sonido: es un contador de estado, no una alerta. La alerta
        // (beep/háptica) la cubren la barra in-app y el "¡Descanso listo!" final.
        importance: IMPORTANCE_LOW,
        vibration: false,
      })
      .then(() => undefined)
      .catch(() => {
        channelReady = null // reintentar la próxima vez si falló
      })
  }
  return channelReady
}

/**
 * Muestra/actualiza el cronómetro vivo del descanso hasta `endEpochMs` (Date.now() del fin
 * absoluto). Reusa el MISMO id → llamar de nuevo (arranque, ±15s, reanudar) actualiza la
 * notificación en su sitio en vez de apilar. Sólo Android (Notifee chronometer es Android-only)
 * y sólo si la lib nativa está enlazada; en cualquier otro caso NO-OP. Nunca lanza.
 */
export async function showRestLiveCountdown(endEpochMs: number): Promise<void> {
  if (Platform.OS !== 'android' || !notifee) return
  if (!Number.isFinite(endEpochMs)) return
  const remaining = endEpochMs - Date.now()
  if (remaining <= 0) {
    await stopRestLiveCountdown()
    return
  }
  try {
    await ensureChannel()
    await notifee.displayNotification({
      id: LIVE_NOTIF_ID,
      title: 'Descanso en curso',
      body: isRestTimerMuted() ? 'Recupérate para la siguiente serie.' : 'Sonará al terminar.',
      android: {
        channelId: LIVE_CHANNEL_ID,
        // ongoing = no-descartable (como el Temporizador del sistema); onlyAlertOnce = las
        // actualizaciones (±15s) no re-alertan; autoCancel off = no se va al tocarla.
        ongoing: true,
        onlyAlertOnce: true,
        autoCancel: false,
        // Cuenta regresiva VIVA dibujada por Android (SystemClock) → tickea con la pantalla
        // apagada y el JS congelado, sin foreground service.
        showChronometer: true,
        chronometerDirection: 'down',
        timestamp: endEpochMs,
        // El SO retira la notif al llegar al fin aunque el JS esté congelado en background
        // (entonces asoma el "¡Descanso listo!" programado en expo-notifications).
        timeoutAfter: Math.max(1000, Math.round(remaining)),
        color: BRAND_COLOR,
        importance: IMPORTANCE_LOW,
        pressAction: { id: 'default' },
      },
    })
  } catch {
    // Falla de la notif nunca interrumpe el timer.
  }
}

/** Retira el cronómetro vivo (pausa/saltar/cerrar/terminar/desmontar). NO-OP si no aplica. */
export async function stopRestLiveCountdown(): Promise<void> {
  if (Platform.OS !== 'android' || !notifee) return
  try {
    await notifee.cancelNotification(LIVE_NOTIF_ID)
  } catch {
    // no-op
  }
}
