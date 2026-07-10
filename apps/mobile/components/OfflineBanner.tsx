import { Text, View } from 'react-native'
import { WifiOff } from 'lucide-react-native'
import { TYPE } from '../lib/typography'

/**
 * OfflineBanner — transient "no connection" strip (EVA DS re-skin, patron A).
 *
 * Surfaces/borders come from DS token utilities (className) so light/dark
 * resolve at runtime via NativeWind — no `theme` object. Uses the warning
 * ramp (bg-warning-100 light / warning-500/15 dark, border warning-500/40).
 * The lucide glyph needs a literal color string, so it uses the DS warning-500
 * hex (#F5A524 == --color-warning-500) which reads on both schemes.
 */
const WARNING_500 = '#F5A524' // DS --color-warning-500 (rgb 245 165 36)
const ON_WARNING = '#0B0E13' // DS --color-text-on-warning (ink oscuro sobre ámbar sólido)

interface OfflineBannerProps {
  visible: boolean
  message?: string
  /**
   * Tratamiento SÓLIDO y prominente (franja ámbar llena con texto oscuro), espejo de la barra offline
   * del ejecutor de entreno en web (`bg-amber-500/90 text-amber-950`, WorkoutExecutionClient.tsx:1898-1903).
   * Por defecto (false) usa la tarjeta translúcida suave del resto de la app (patrón A, sin regresión).
   */
  prominent?: boolean
}

export function OfflineBanner({
  visible,
  message = 'Sin conexion. Guardaremos los cambios para sincronizar despues.',
  prominent = false,
}: OfflineBannerProps) {
  if (!visible) return null

  if (prominent) {
    return (
      <View className="flex-row items-center gap-2.5 bg-warning-500/90 px-4 py-2.5">
        <WifiOff size={16} color={ON_WARNING} />
        <Text className="flex-1 text-on-warning" style={TYPE.caption}>
          {message}
        </Text>
      </View>
    )
  }

  return (
    <View className="flex-row items-center gap-2 rounded-lg border border-warning-500/40 bg-warning-100 px-3 py-2.5 dark:bg-warning-500/15">
      <WifiOff size={16} color={WARNING_500} />
      <Text className="flex-1 text-body" style={TYPE.caption}>
        {message}
      </Text>
    </View>
  )
}
