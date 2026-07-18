import { Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import type { ExchangeChip } from '../../../lib/nutrition-exchanges.queries'

interface Props {
  chips: ExchangeChip[]
  /** Tap en un chip ⇒ el padre abre el sheet de equivalencias de ese grupo. */
  onChipTap: (groupId: string) => void
}

/**
 * ExchangeChips (E4-07, modulo `nutrition_exchanges`) — fila de codigos de una
 * comida ("2C · 1LAC · 1F"). Espejo del web `ExchangeMealChips`: badge de color por
 * grupo + porciones, tap abre el sheet de equivalencias. Presentacional puro: los
 * chips vienen YA calculados/ordenados del endpoint (motor compartido). Rampa de
 * color = color del grupo (ya resuelto server-side, incluye fallback por sortOrder).
 */
export function ExchangeChips({ chips, onChipTap }: Props) {
  const { theme } = useTheme()
  if (chips.length === 0) return null

  return (
    <View testID="exchange-chips" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {chips.map((chip) => (
        <TouchableOpacity
          key={chip.groupId}
          testID={`exchange-chip-${chip.code.toLowerCase()}`}
          onPress={() => onChipTap(chip.groupId)}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={`${chip.portionsLabel} ${chip.code}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: 34,
            paddingLeft: 5,
            paddingRight: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: chip.color,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: FONT.uiExtra, fontSize: 8.5 }}>{chip.code}</Text>
          </View>
          <Text
            style={{
              color: theme.foreground,
              fontFamily: FONT.monoBold,
              fontSize: 11.5,
              fontVariant: ['tabular-nums'],
            }}
          >
            {chip.portionsLabel}
            {chip.code}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
