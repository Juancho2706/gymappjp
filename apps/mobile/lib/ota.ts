import { Alert } from 'react-native'
import * as Updates from 'expo-updates'

/**
 * OTA en foreground (E0-G6 / G11 §1.7, D1). Chequea updates de EAS al abrir la app
 * y al volver de background, con throttle de 1h, y ofrece reinicio suave.
 *
 * Reglas duras:
 * - SOLO en producción: en `__DEV__` es no-op total (el dev server ya maneja HMR).
 * - Best-effort: cualquier error se traga en silencio; OTA NUNCA debe crashear la app.
 * - Solo JS-only: un cambio nativo (lib nativa / SDK bump) sube `version` y fuerza build
 *   EAS nuevo — el OTA queda fuera de compat por `runtimeVersion: appVersion` (ver
 *   docs/operations/MOBILE_RELEASES_OTA.md).
 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // máx 1 check por hora
let lastCheckAt = 0
let inFlight = false

export async function checkForOtaUpdate(): Promise<void> {
  if (__DEV__) return
  if (!Updates.isEnabled) return
  if (inFlight) return

  const now = Date.now()
  if (now - lastCheckAt < CHECK_INTERVAL_MS) return
  lastCheckAt = now
  inFlight = true

  try {
    const result = await Updates.checkForUpdateAsync()
    if (!result.isAvailable) return
    await Updates.fetchUpdateAsync()
    promptReloadOnce()
  } catch {
    // Silencio intencional: OTA es best-effort, el update se aplicará en el próximo lanzamiento.
  } finally {
    inFlight = false
  }
}

/**
 * Etiqueta del bundle QUE ESTA CORRIENDO, para leerla en el perfil sin cable ni logcat.
 *
 * Nacio de un rato perdido el 12-08: se publica un OTA, el dueño abre la app y "no le llega",
 * y desde afuera no hay forma de distinguir "no bajó" de "bajó y todavía no reinició" ni de
 * "está viendo el bundle embebido". Con esto la QA de device arranca leyendo una línea.
 *
 * Estados posibles:
 *  - `dev` → Metro (no hay OTA que valga).
 *  - `embebido` → el bundle que vino en el APK/AAB (o tras un roll-back-to-embedded).
 *  - `OTA <8 chars del updateId> · dd-MM HH:mm` → publicado; el prefijo del id es el que
 *    imprime `eas update` y el que se ve en el dashboard, así que se comparan de un vistazo.
 */
export function runningBundleLabel(): string {
  if (__DEV__) return 'dev'
  if (!Updates.isEnabled) return 'embebido'
  const id = Updates.updateId
  if (!id || Updates.isEmbeddedLaunch) return 'embebido'
  const short = `OTA ${id.slice(0, 8)}`
  const at = Updates.createdAt
  if (!at) return short
  const p = (n: number) => String(n).padStart(2, '0')
  return `${short} · ${p(at.getDate())}-${p(at.getMonth() + 1)} ${p(at.getHours())}:${p(at.getMinutes())}`
}

/**
 * Ofrece el reinicio UNA sola vez por proceso.
 *
 * 🔴 12-08: "publico un OTA y no me llega". El servidor estaba bien; el hueco era este. `expo-updates`
 * trae su PROPIO chequeo automático al abrir (`checkAutomatically` = ON_LOAD por defecto): baja el
 * bundle solo y lo deja PENDIENTE para el próximo arranque. Cuando después corría nuestro
 * `checkForUpdateAsync`, ya no había nada nuevo que anunciar (`isAvailable` false) ⇒ salíamos por el
 * `return` y el Alert NO aparecía nunca. Desde afuera se ve como "el update no llega", cuando en
 * realidad estaba descargado esperando un segundo arranque en frío.
 *
 * Por eso `_layout.tsx` mira además `isUpdatePending` de `useUpdates()` y llama acá: el aviso sale
 * lo baje quien lo baje. El guard evita el doble Alert cuando ambos caminos se cruzan.
 */
let promptShown = false

export function promptReloadOnce(): void {
  if (promptShown) return
  promptShown = true
  Alert.alert(
    'Actualización disponible',
    'Descargamos una versión nueva de EVA. ¿Quieres reiniciar para aplicarla?',
    [
      // Si lo posterga, que pueda volver a ofrecerse al volver de background (el bundle ya está
      // descargado: rechazarlo una vez no debe enterrar el aviso para siempre).
      { text: 'Ahora no', style: 'cancel', onPress: () => { promptShown = false } },
      {
        text: 'Reiniciar',
        onPress: () => {
          Updates.reloadAsync().catch(() => {})
        },
      },
    ],
  )
}
