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
    promptReload()
  } catch {
    // Silencio intencional: OTA es best-effort, el update se aplicará en el próximo lanzamiento.
  } finally {
    inFlight = false
  }
}

function promptReload(): void {
  Alert.alert(
    'Actualización disponible',
    'Descargamos una versión nueva de EVA. ¿Querés reiniciar para aplicarla?',
    [
      { text: 'Ahora no', style: 'cancel' },
      {
        text: 'Reiniciar',
        onPress: () => {
          Updates.reloadAsync().catch(() => {})
        },
      },
    ],
  )
}
