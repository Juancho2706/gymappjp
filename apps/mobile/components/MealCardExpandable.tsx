import { useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Check, ChevronDown, ChevronUp } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../context/ThemeContext'
import { FoodItemRow } from './FoodItemRow'
import { sumMealMacros } from '../lib/nutrition-utils'
import type { MealWithFoodItems } from '../lib/nutrition-utils'

interface Props {
  meal: MealWithFoodItems & { name: string; description?: string | null }
  isCompleted: boolean
  isToday: boolean
  isToggling?: boolean
  satisfactionScore?: number | null
  onToggle: () => void
  onSatisfaction?: (score: 1 | 2 | 3 | null) => void
  activeSwapMealIds?: Set<string>
  /** Porción consumida (0-100). null = "Plan completo" (100% del plan). */
  consumedPct?: number | null
  onPortionChange?: (pct: number | null) => void
  /** Favoritos de alimentos (heart) — espejo web MealIngredientRow. */
  favoriteFoodIds?: Set<string>
  onToggleFoodFavorite?: (foodId: string) => void
  /**
   * Módulo nutrition_exchanges: macros derivados de porciones cuando la comida no tiene alimentos.
   * Espejo del `macroOverride` de la web (se muestran en el header).
   */
  macroOverride?: { calories: number; protein: number; carbs: number; fats: number } | null
}

export function MealCardExpandable({
  meal,
  isCompleted,
  isToday,
  isToggling,
  satisfactionScore,
  onToggle,
  onSatisfaction,
  activeSwapMealIds,
  consumedPct,
  onPortionChange,
  favoriteFoodIds,
  onToggleFoodFavorite,
  macroOverride,
}: Props) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const hasFoodItems = meal.food_items.length > 0
  const baseMacros = macroOverride ?? (hasFoodItems ? sumMealMacros(meal) : null)
  // Escala de macros mostrada por la porción consumida (igual que la web).
  const macroScale = isCompleted && consumedPct != null ? consumedPct / 100 : 1
  const showPct = isCompleted && consumedPct != null && consumedPct < 100
  // El cuerpo expandible aplica también para comidas con override (sin alimentos: solo porción/satisfacción).
  const hasBody = hasFoodItems || (isToday && isCompleted)

  async function handleToggle() {
    if (isToday) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    onToggle()
  }

  function onContentLayout(e: LayoutChangeEvent) {
    setContentHeight(e.nativeEvent.layout.height)
  }

  const borderColor = isCompleted ? theme.success : theme.border
  const bgColor = isCompleted ? theme.success + '12' : theme.card

  return (
    <View style={[styles.card, { backgroundColor: bgColor, borderColor, borderRadius: theme.radius.xl, borderWidth: isCompleted ? 2 : 1 }]}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={handleToggle}
        activeOpacity={0.75}
        disabled={!!isToggling || !isToday}
      >
        <View style={[styles.checkCircle, { borderColor, backgroundColor: isCompleted ? theme.success : 'transparent', borderRadius: 99 }]}>
          {isToggling ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : isCompleted ? (
            <Check size={14} color={theme.primaryForeground} strokeWidth={2.5} />
          ) : null}
        </View>

        <View style={styles.headerMid}>
          <Text style={[styles.mealName, { color: isCompleted ? theme.success : theme.foreground, fontFamily: 'Montserrat_600SemiBold' }]} numberOfLines={1}>
            {meal.name}
          </Text>
          {baseMacros && (
            <Text style={[styles.macrosSummary, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {Math.round(baseMacros.calories * macroScale)} kcal{showPct ? ` (${consumedPct}%)` : ''} · P {Math.round(baseMacros.protein * macroScale)}g · C {Math.round(baseMacros.carbs * macroScale)}g · G {Math.round(baseMacros.fats * macroScale)}g
            </Text>
          )}
        </View>

        {hasBody && (
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            {expanded
              ? <ChevronUp size={18} color={theme.mutedForeground} strokeWidth={2} />
              : <ChevronDown size={18} color={theme.mutedForeground} strokeWidth={2} />
            }
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Expandable body */}
      {hasBody && (
        <MotiView
          animate={{ height: expanded ? contentHeight : 0, opacity: expanded ? 1 : 0 }}
          transition={{ type: 'timing', duration: 220 }}
          style={{ overflow: 'hidden' }}
        >
          <View onLayout={onContentLayout} style={[styles.foodItems, { borderTopColor: theme.border }]}>
            {meal.food_items.map((item, i) => (
              <FoodItemRow
                key={item.id ?? i}
                item={item}
                hasActiveSwap={activeSwapMealIds?.has(item.foods.id ?? '')}
                isFavorite={item.foods.id ? favoriteFoodIds?.has(item.foods.id) : false}
                onToggleFavorite={onToggleFoodFavorite}
              />
            ))}

            {/* Porción del plan — solo si completado y es hoy */}
            {isCompleted && isToday && onPortionChange && (
              <View style={styles.satisfaction}>
                <Text style={[styles.satisfactionLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  Porción del plan
                </Text>
                <View style={styles.portionRow}>
                  {[25, 50, 75, 100].map((pct) => {
                    const active = consumedPct === pct
                    return (
                      <TouchableOpacity
                        key={pct}
                        style={[styles.portionBtn, {
                          backgroundColor: active ? theme.primary + '20' : theme.secondary,
                          borderColor: active ? theme.primary : theme.border,
                          borderRadius: theme.radius.md,
                        }]}
                        onPress={() => onPortionChange(pct)}
                        activeOpacity={0.75}
                      >
                        <Text style={{ color: active ? theme.primary : theme.mutedForeground, fontSize: 12.5, fontFamily: 'Inter_600SemiBold' }}>{pct}%</Text>
                      </TouchableOpacity>
                    )
                  })}
                  <TouchableOpacity
                    style={[styles.portionBtn, styles.portionFull, {
                      backgroundColor: consumedPct == null ? theme.success + '20' : theme.secondary,
                      borderColor: consumedPct == null ? theme.success : theme.border,
                      borderRadius: theme.radius.md,
                    }]}
                    onPress={() => onPortionChange(null)}
                    activeOpacity={0.75}
                  >
                    <Text style={{ color: consumedPct == null ? theme.success : theme.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>Plan completo</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.portionHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  «Plan completo» usa el 100% de macros del plan. Ajusta % si comiste menos.
                </Text>
              </View>
            )}

            {/* Satisfacción — solo si completado y es hoy */}
            {isCompleted && isToday && onSatisfaction && (
              <View style={styles.satisfaction}>
                <Text style={[styles.satisfactionLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  ¿Cómo estuvo?
                </Text>
                <View style={styles.satisfactionRow}>
                  {([
                    { score: 1 as const, emoji: '😕' },
                    { score: 2 as const, emoji: '😐' },
                    { score: 3 as const, emoji: '😋' },
                  ] as const).map(({ score, emoji }) => (
                    <TouchableOpacity
                      key={score}
                      style={[
                        styles.satisfactionBtn,
                        {
                          backgroundColor: satisfactionScore === score ? theme.primary + '20' : theme.secondary,
                          borderColor: satisfactionScore === score ? theme.primary : theme.border,
                          borderRadius: theme.radius.md,
                        },
                      ]}
                      onPress={() => onSatisfaction(satisfactionScore === score ? null : score)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.satisfactionEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </MotiView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  checkCircle: { width: 28, height: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerMid: { flex: 1, gap: 2 },
  mealName: { fontSize: 15 },
  macrosSummary: { fontSize: 11 },
  foodItems: { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 },
  satisfaction: { marginTop: 10, gap: 8 },
  satisfactionLabel: { fontSize: 12 },
  satisfactionRow: { flexDirection: 'row', gap: 8 },
  satisfactionBtn: { width: 44, height: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  satisfactionEmoji: { fontSize: 22 },
  portionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  portionBtn: { minWidth: 48, height: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  portionFull: { flexGrow: 1 },
  portionHint: { fontSize: 10, lineHeight: 14 },
})
