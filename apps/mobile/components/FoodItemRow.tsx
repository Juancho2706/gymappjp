import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ArrowRightLeft, Flame, Heart } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { calculateFoodItemMacros, gramsToHousehold } from '../lib/nutrition-utils'
import type { FoodItemForMacros } from '../lib/nutrition-utils'
import { FONT } from '../lib/typography'
import { MACRO_COLORS } from './MacroRingSummary'

// Acento de dominio nutrición (ember-500, fijo — TOKENS.md).
const EMBER = '#FF6A3D'
const EMBER_700 = '#C2410C'
// Corazón de favorito (rosa fijo, espejo de la web `fill-rose-400`).
const ROSE = '#FB7185'

const GRAM_UNITS = new Set(['g', 'gr', 'grs', 'gramo', 'gramos'])

interface Props {
  item: FoodItemForMacros
  hasActiveSwap?: boolean
  /** Abre el SwapSheet para este alimento (solo si el coach dejó alternativas). */
  onSwapPress?: () => void
  /** Favorito del alumno (corazón). Optimista en el padre. */
  isFavorite?: boolean
  onToggleFavorite?: (foodId: string) => void
}

/**
 * FoodItemRow — fila de alimento a paridad de la web `MealIngredientRow`:
 * izquierda = nombre + corazón de favorito (+ badge swap) y línea P/C/G en colores
 * de macro; derecha = medida casera (ember) y kcal con llama. El botón de swap
 * (E4-08) abre el SwapSheet cuando el coach dejó alternativas.
 */
export function FoodItemRow({ item, hasActiveSwap, onSwapPress, isFavorite, onToggleFavorite }: Props) {
  const { theme } = useTheme()
  const macros = calculateFoodItemMacros(item)
  const canSwap = !!onSwapPress && (item.swap_options?.length ?? 0) > 0
  const foodId = item.foods.id
  const canFav = !!onToggleFavorite && !!foodId

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
          {canFav && (
            <TouchableOpacity
              testID="food-item-favorite"
              onPress={() => onToggleFavorite!(foodId!)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? `Quitar ${item.foods.name} de favoritos` : `Agregar ${item.foods.name} a favoritos`}
              style={styles.favBtn}
            >
              <Heart
                size={15}
                color={isFavorite ? ROSE : theme.mutedForeground}
                fill={isFavorite ? ROSE : 'transparent'}
                strokeWidth={2.2}
              />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.macroLine}>
          <Text style={[styles.macro, { color: MACRO_COLORS.protein, fontFamily: FONT.uiBold }]}>
            P {Math.round(macros.protein)}g
          </Text>
          <Text style={[styles.macro, { color: MACRO_COLORS.carbs, fontFamily: FONT.uiBold }]}>
            C {Math.round(macros.carbs)}g
          </Text>
          <Text style={[styles.macro, { color: MACRO_COLORS.fats, fontFamily: FONT.uiBold }]}>
            G {Math.round(macros.fats)}g
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={[styles.qty, { color: EMBER_700, fontFamily: FONT.uiExtra }]} numberOfLines={1}>
          {qtyLabel}
        </Text>
        <View style={styles.kcalRow}>
          <Flame size={11} color={EMBER} strokeWidth={2.2} />
          <Text className="text-muted" style={[styles.kcal, { fontFamily: FONT.mono }]}>
            {Math.round(macros.calories)} kcal
          </Text>
        </View>
      </View>

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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 6 },
  left: { flex: 1, gap: 3, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 13, flexShrink: 1 },
  favBtn: { flexShrink: 0 },
  macroLine: { flexDirection: 'row', gap: 8 },
  macro: { fontSize: 10 },
  right: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  qty: { fontSize: 12 },
  kcalRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  kcal: { fontSize: 11 },
  swapBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  swapText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  swapBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
})
