import { Pressable, Text, View } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'

/**
 * Aviso de plausibilidad del editor RN (tren «Cantidades honestas», SPEC §4.3, mockup M1).
 *
 * Espejo del `ImplausibleNotice` web: presentacional, recibe el copy resuelto por `plausibility.ts` y las
 * acciones «keep the number» («Cambiar a 30 g» / «Usar huevos»). Avisa, no bloquea. Piel `warning` del
 * tema (la misma pill `border-warning-500/30 bg-warning-500/10 text-warning-700` de `ItemBadge` y del
 * badge referencial de `EditablePortionsSection`), nunca hex. Las acciones son Pressables de 44 pt de
 * alto (regla del repo) aunque se lean como links.
 */
export interface ImplausibleNoticeAction {
  label: string
  onPress: () => void
  disabled?: boolean
}

export function ImplausibleNotice({
  message,
  actions = [],
  variant = 'box',
  testID,
}: {
  message: string
  actions?: ImplausibleNoticeAction[]
  /** `box` = caja ámbar (fila del ítem, barra de publicar); `inline` = solo texto (espacios chicos). */
  variant?: 'box' | 'inline'
  testID?: string
}) {
  const { theme } = useTheme()
  const isBox = variant === 'box'
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
      className={
        isBox
          ? 'flex-row items-start gap-2 rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2'
          : 'flex-row items-start gap-1'
      }
    >
      <View className={isBox ? 'mt-0.5' : 'mt-1'}>
        <AlertTriangle size={isBox ? 14 : 12} color={theme.warning} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-xs leading-5 text-warning-700">{message}</Text>
        {actions.length > 0 ? (
          <View className="flex-row flex-wrap items-center gap-x-1">
            {actions.map((action, index) => (
              <View key={action.label} className="flex-row items-center gap-x-1">
                {index > 0 ? <Text className="text-xs text-warning-700">·</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  disabled={action.disabled}
                  onPress={action.onPress}
                  className="min-h-11 justify-center"
                >
                  <Text className="text-xs font-semibold text-warning-700 underline">{action.label}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  )
}
