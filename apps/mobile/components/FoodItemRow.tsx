import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ArrowRightLeft } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { calculateFoodItemMacros, gramsToHousehold } from '../lib/nutrition-utils'
import type { FoodItemForMacros } from '../lib/nutrition-utils'
import { FONT } from '../lib/typography'

// Acento de dominio nutrición (ember-500, fijo — token-contract).
const EMBER = '#FF6A3D'

const GRAM_UNITS = new Set(['g', 'gr', 'grs', 'gramo', 'gramos'])

interface Props {
  item: FoodItemForMacros
  hasActiveSwap?: boolean
  /** Abre el SwapSheet para este alimento (solo si el coach dejó alternativas). */
  onSwapPress?: () => void
}

export function FoodItemRow({ item, hasActiveSwap, onSwapPress }: Props) {
  const { theme } = useTheme()
  const macros = calculateFoodItemMacros(item)
  const canSwap = !!onSwapPress && (item.swap_options?.length ?? 0) > 0

  // Medida casera (E4-17): "120 g (1 taza)" cuando el alimento tiene household +
  // la unidad es gramos; si no, la cantidad cruda. Espejo de la web MealIngredientRow.
  const unit = (item.unit ?? 'g').toLowerCase()
  const qtyLabel = GRAM_UNITS.has(unit)
    ? gramsToHousehold(item.foods, item.quantity)
    : `${item.quantity}${item.unit ?? ''}`

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.nameRow}>
          <Text className="text-strong" style={[styles.name, { fontFamily: FONT.ui }]} numberOfLines={1}>
            {item.foods.name}
          </Text>
          {hasActiveSwap && (
            <View style={[styles.swapBadge, { backgroundColor: EMBER + '20', borderColor: EMBER + '40' }]}>
              <Text style={[styles.swapText, { color: EMBER, fontFamily: FONT.uiBold }]}>swap</Text>
            </View>
          )}
        </View>
        <Text className="text-muted" style={[styles.qty, { fontFamily: FONT.ui }]}>
          {qtyLabel}
        </Text>
      </View>
      <Text className="text-muted" style={[styles.macros, { fontFamily: FONT.mono }]}>
        {Math.round(macros.calories)} kcal · P {Math.round(macros.protein)}g · C {Math.round(macros.carbs)}g · G {Math.round(macros.fats)}g
      </Text>
      {canSwap && (
        <TouchableOpacity
          testID="food-item-swap"
          onPress={onSwapPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Cambiar ${item.foods.name}`}
          style={[styles.swapBtn, { borderColor: EMBER + '40', backgroundColor: EMBER + '14' }]}
        >
          <ArrowRightLeft size={13} color={EMBER} strokeWidth={2.4} />
        </TouchableOpacity>
      )}
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
  swapBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
})
