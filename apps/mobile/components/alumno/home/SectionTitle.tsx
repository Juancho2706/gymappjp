import { Text, TouchableOpacity, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { TYPE } from '../../../lib/typography'

/**
 * Dash_SectionTitle (web `shared/SectionTitle.tsx`): barra de acento 3×13 +
 * label uppercase (eyebrow) + accion opcional a la derecha. `accent` es un color
 * literal (sport = theme.primary, ember/aqua = rampas fijas).
 */
export function SectionTitle({
  children,
  accent,
  action,
  onAction,
  actionTestID,
  style,
}: {
  children: string
  accent?: string
  action?: string
  onAction?: () => void
  actionTestID?: string
  style?: ViewStyle
}) {
  const { theme } = useTheme()
  const bar = accent ?? theme.primary
  return (
    <View
      style={[{ marginHorizontal: 2, marginTop: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: bar }} />
        <Text className="text-subtle" style={[TYPE.eyebrow, { letterSpacing: 0.8 }]}>
          {children}
        </Text>
      </View>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7} testID={actionTestID}>
          <Text className="font-sans-bold" style={{ color: theme.primary, fontSize: 12.5 }}>
            {action}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}
