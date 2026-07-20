import { Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { EMBER_500, EMBER_700 } from './types'

export type ExchangeViewMode = 'porciones' | 'gramos'

interface Props {
  value: ExchangeViewMode
  onChange: (mode: ExchangeViewMode) => void
}

const OPTIONS: { key: ExchangeViewMode; label: string }[] = [
  { key: 'porciones', label: 'Porciones' },
  { key: 'gramos', label: 'Gramos' },
]

/**
 * ExchangeModeToggle (E4-07) — control segmentado local "Porciones | Gramos" para el
 * alumno en un plan por intercambios. Es SOLO estado de vista (read-only): el modo real
 * del plan lo fija el coach; aca solo elige si ve los chips de intercambio o el detalle en
 * gramos. Rampa ember (TOKENS.md). Presentacional puro.
 */
export function ExchangeModeToggle({ value, onChange }: Props) {
  const { theme } = useTheme()

  return (
    <View
      testID="exchange-mode-toggle"
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        gap: 4,
        padding: 3,
        borderRadius: 999,
        backgroundColor: theme.muted,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.key
        return (
          <TouchableOpacity
            key={opt.key}
            testID={`exchange-mode-${opt.key}`}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              minHeight: 30,
              paddingHorizontal: 14,
              justifyContent: 'center',
              borderRadius: 999,
              backgroundColor: active ? EMBER_500 + '26' : 'transparent',
            }}
          >
            <Text
              style={{
                color: active ? EMBER_700 : theme.mutedForeground,
                fontFamily: FONT.uiBold,
                fontSize: 12,
              }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
