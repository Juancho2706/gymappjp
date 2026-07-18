import { Text, TouchableOpacity, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { FONT, TYPE } from '../../../lib/typography'

/**
 * Dash_SectionTitle (web `shared/SectionTitle.tsx`): barra de acento 3×12 +
 * label uppercase (eyebrow) + accion opcional a la derecha. `accent` es un color
 * literal (ember = rampa fija); `accentClassName` es una clase DS dark-aware
 * (ej. `bg-aqua-700`, que flipea en `.dark` via `--color-aqua-700`) — preferible
 * al literal cuando el token cambia por esquema. Sin ninguno, la barra usa
 * `bg-sport-500` (className brand-aware, espejo del default web `var(--sport-500)`).
 */
export function SectionTitle({
  children,
  accent,
  accentClassName,
  action,
  onAction,
  actionTestID,
  style,
}: {
  children: string
  accent?: string
  accentClassName?: string
  action?: string
  onAction?: () => void
  actionTestID?: string
  style?: ViewStyle
}) {
  return (
    <View
      style={[{ marginHorizontal: 2, marginTop: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          className={accentClassName ?? (accent ? undefined : 'bg-sport-500')}
          style={{ width: 3, height: 12, borderRadius: 2, ...(accent && !accentClassName ? { backgroundColor: accent } : null) }}
        />
        <Text className="text-subtle" style={[TYPE.eyebrow, { fontSize: 11, fontFamily: FONT.uiExtra, letterSpacing: 0.8 }]}>
          {children}
        </Text>
      </View>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7} testID={actionTestID}>
          <Text className="font-sans-bold text-sport-600" style={{ fontSize: 12.5 }}>
            {action}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}
