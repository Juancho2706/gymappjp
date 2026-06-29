import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { calculateFoodItemMacros } from '../lib/nutrition-utils'
import type { FoodItemForMacros } from '../lib/nutrition-utils'

// Acento de dominio nutrición (ember-500, fijo — token-contract).
const EMBER = '#FF6A3D'

interface Props {
  item: FoodItemForMacros
  hasActiveSwap?: boolean
}

export function FoodItemRow({ item, hasActiveSwap }: Props) {
  const { theme } = useTheme()
  const macros = calculateFoodItemMacros(item)

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>
            {item.foods.name}
          </Text>
          {hasActiveSwap && (
            <View style={[styles.swapBadge, { backgroundColor: EMBER + '20', borderColor: EMBER + '40' }]}>
              <Text style={[styles.swapText, { color: EMBER, fontFamily: 'HankenGrotesk_700Bold' }]}>swap</Text>
            </View>
          )}
        </View>
        <Text style={[styles.qty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {item.quantity}{item.unit}
        </Text>
      </View>
      <Text style={[styles.macros, { color: theme.mutedForeground, fontFamily: 'JetBrainsMono_400Regular' }]}>
        {Math.round(macros.calories)} kcal · P {Math.round(macros.protein)}g · C {Math.round(macros.carbs)}g · G {Math.round(macros.fats)}g
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 6 },
  left: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, flex: 1 },
  qty: { fontSize: 12 },
  swapBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  swapText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  macros: { fontSize: 11, textAlign: 'right', flexShrink: 0 },
})
