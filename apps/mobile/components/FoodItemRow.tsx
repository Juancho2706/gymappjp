import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Flame, Heart } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { calculateFoodItemMacros, gramsToHousehold } from '../lib/nutrition-utils'
import type { FoodItemForMacros } from '../lib/nutrition-utils'

interface Props {
  item: FoodItemForMacros
  hasActiveSwap?: boolean
  isFavorite?: boolean
  onToggleFavorite?: (foodId: string) => void
}

const ROSE = '#fb7185'

export function FoodItemRow({ item, hasActiveSwap, isFavorite, onToggleFavorite }: Props) {
  const { theme } = useTheme()
  const macros = calculateFoodItemMacros(item)
  const foodId = item.foods.id
  // Medidas caseras (espejo web MealIngredientRow): en gramos rotula "120 g (1 taza)" si aplica.
  const resolvedUnit = item.unit || (item.quantity < 10 ? 'un' : 'g')
  const displayQty =
    resolvedUnit === 'g'
      ? gramsToHousehold(item.foods, item.quantity)
      : `${item.quantity} ${resolvedUnit}`

  return (
    <View style={[styles.row, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.md }]}>
      <View style={styles.left}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>
            {item.foods.name}
          </Text>
          {hasActiveSwap && (
            <View style={[styles.swapBadge, { backgroundColor: theme.primary + '20', borderColor: theme.primary + '40' }]}>
              <Text style={[styles.swapText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>swap</Text>
            </View>
          )}
          {foodId && onToggleFavorite && (
            <TouchableOpacity
              onPress={() => onToggleFavorite(foodId)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            >
              <Heart
                size={14}
                color={isFavorite ? ROSE : theme.mutedForeground}
                fill={isFavorite ? ROSE : 'transparent'}
                strokeWidth={2}
              />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.macroRow}>
          <Text style={[styles.macro, { color: theme.macro.protein, fontFamily: 'Montserrat_700Bold' }]}>P {Math.round(macros.protein)}g</Text>
          <Text style={[styles.macro, { color: theme.macro.carbs, fontFamily: 'Montserrat_700Bold' }]}>C {Math.round(macros.carbs)}g</Text>
          <Text style={[styles.macro, { color: theme.macro.fats, fontFamily: 'Montserrat_700Bold' }]}>G {Math.round(macros.fats)}g</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={[styles.qty, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>{displayQty}</Text>
        <View style={styles.kcalRow}>
          <Flame size={11} color="#fb923c" />
          <Text style={[styles.kcal, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {Math.round(macros.calories)} kcal
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  left: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, flex: 1 },
  macroRow: { flexDirection: 'row', gap: 8 },
  macro: { fontSize: 10 },
  right: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  qty: { fontSize: 12 },
  kcalRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  kcal: { fontSize: 10 },
  swapBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  swapText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
})
