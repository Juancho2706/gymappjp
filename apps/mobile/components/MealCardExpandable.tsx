import { useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import { Check, ChevronDown, ChevronUp, Utensils } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../context/ThemeContext'
import { FONT } from '../lib/typography'
import { GLOWS } from '../lib/shadows'
import { FoodItemRow } from './FoodItemRow'
import { MACRO_COLORS } from './MacroRingSummary'
import { sumMealMacros } from '../lib/nutrition-utils'
import type { FoodItemForMacros, MealWithFoodItems } from '../lib/nutrition-utils'

// Rampa ember (nutrición) — fija, TOKENS.md.
const EMBER_500 = '#FF6A3D'
const EMBER_700 = '#C2410C'

interface Props {
  meal: MealWithFoodItems & { name: string; description?: string | null }
  isCompleted: boolean
  isToday: boolean
  isToggling?: boolean
  satisfactionScore?: number | null
  onToggle: () => void
  onSatisfaction?: (score: 1 | 2 | 3 | null) => void
  activeSwapMealIds?: Set<string>
  /** Abre el SwapSheet para un alimento con alternativas del coach (E4-08). */
  onSwapFood?: (item: FoodItemForMacros) => void
  /** Favoritos del alumno por food_id (corazón en cada alimento). */
  favoriteFoodIds?: Set<string>
  onToggleFavorite?: (foodId: string) => void
  /** Porción del plan consumida. null = "Plan completo" (100% de macros, sin %). */
  consumedPct?: number | null
  onPortionChange?: (pct: number | null) => void
}

/**
 * MealCardExpandable (E4-03) — tarjeta de comida re-skin a fidelidad del web
 * `MealCard`: círculo de completar 44px (ember-500 + glow al marcar, Utensils al
 * incompleto), tokens DS (rampa ember, MACRO_COLORS, tipografía Archivo/Hanken/
 * Mono), medidas caseras en ingredientes (via FoodItemRow), selector de porción
 * 25/50/75/100% + "Plan completo" (E4-17) y satisfacción. Sin `theme.*+alpha`
 * imperativo ni Montserrat legacy.
 */
export function MealCardExpandable({
  meal,
  isCompleted,
  isToday,
  isToggling,
  satisfactionScore,
  onToggle,
  onSatisfaction,
  activeSwapMealIds,
  onSwapFood,
  favoriteFoodIds,
  onToggleFavorite,
  consumedPct,
  onPortionChange,
}: Props) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const hasFoodItems = meal.food_items.length > 0
  const macros = hasFoodItems ? sumMealMacros(meal) : null
  const scale = consumedPct != null ? consumedPct / 100 : 1
  const showPct = isCompleted && consumedPct != null && consumedPct < 100

  async function handleToggle() {
    if (isToday) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    onToggle()
  }

  function onContentLayout(e: LayoutChangeEvent) {
    setContentHeight(e.nativeEvent.layout.height)
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isCompleted ? EMBER_500 + '0A' : theme.card,
          borderColor: isCompleted ? EMBER_500 + '40' : theme.border,
          borderRadius: theme.radius['2xl'],
          borderWidth: 1,
        },
      ]}
    >
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((v) => !v)} activeOpacity={0.8}>
        {/* Círculo 44px de completar */}
        <TouchableOpacity
          onPress={handleToggle}
          disabled={!!isToggling || !isToday}
          activeOpacity={0.75}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={{ opacity: isToday ? 1 : 0.5 }}
        >
          <MotiView
            animate={{ scale: 1 }}
            transition={{ type: 'timing', duration: 180 }}
            style={[
              styles.checkCircle,
              isCompleted
                ? { backgroundColor: EMBER_500, ...GLOWS.ember }
                : { backgroundColor: theme.muted },
            ]}
          >
            {isToggling ? (
              <ActivityIndicator size="small" color={isCompleted ? '#FFFFFF' : theme.mutedForeground} />
            ) : isCompleted ? (
              <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
            ) : (
              <Utensils size={19} color={theme.mutedForeground} strokeWidth={2} />
            )}
          </MotiView>
        </TouchableOpacity>

        <View style={styles.headerMid}>
          <View style={styles.nameRow}>
            <Text
              style={[
                styles.mealName,
                { fontFamily: FONT.uiExtra },
                isCompleted
                  ? { color: EMBER_700, textDecorationLine: 'line-through' }
                  : { color: theme.foreground },
              ]}
              numberOfLines={1}
            >
              {meal.name}
            </Text>
            {macros && (
              <View style={[styles.kcalPill, { backgroundColor: theme.muted }]}>
                <Text style={[styles.kcalText, { color: theme.mutedForeground, fontFamily: FONT.uiExtra }]}>
                  {Math.round(macros.calories * scale)} kcal
                  {showPct ? <Text style={{ color: EMBER_700 }}>{`  ${consumedPct}%`}</Text> : null}
                </Text>
              </View>
            )}
          </View>
          {macros && (
            <View style={styles.macroRow}>
              <Text style={[styles.macro, { color: MACRO_COLORS.protein, fontFamily: FONT.uiBold }]}>
                P {Math.round(macros.protein * scale)}g
              </Text>
              <Text style={[styles.macro, { color: MACRO_COLORS.carbs, fontFamily: FONT.uiBold }]}>
                C {Math.round(macros.carbs * scale)}g
              </Text>
              <Text style={[styles.macro, { color: MACRO_COLORS.fats, fontFamily: FONT.uiBold }]}>
                G {Math.round(macros.fats * scale)}g
              </Text>
            </View>
          )}
        </View>

        {hasFoodItems &&
          (expanded ? (
            <ChevronUp size={18} color={theme.mutedForeground} strokeWidth={2} />
          ) : (
            <ChevronDown size={18} color={theme.mutedForeground} strokeWidth={2} />
          ))}
      </TouchableOpacity>

      {hasFoodItems && (
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
                onSwapPress={isToday && onSwapFood ? () => onSwapFood(item) : undefined}
                isFavorite={favoriteFoodIds?.has(item.foods.id ?? '')}
                onToggleFavorite={onToggleFavorite}
              />
            ))}

            {/* Porción del plan — solo si completado y es hoy (E4-17: incluye "Plan completo") */}
            {isCompleted && isToday && onPortionChange && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
                  PORCIÓN DEL PLAN
                </Text>
                <View style={styles.portionRow}>
                  {[25, 50, 75, 100].map((pct) => {
                    const active = consumedPct === pct
                    return (
                      <TouchableOpacity
                        key={pct}
                        style={[
                          styles.portionBtn,
                          active
                            ? { backgroundColor: EMBER_500, borderColor: EMBER_500 }
                            : { backgroundColor: theme.secondary, borderColor: theme.border },
                        ]}
                        onPress={() => onPortionChange(pct)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: active ? '#FFFFFF' : theme.mutedForeground, fontSize: 12, fontFamily: FONT.uiBold }}>
                          {pct}%
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                  <TouchableOpacity
                    style={[
                      styles.planBtn,
                      consumedPct == null
                        ? { backgroundColor: EMBER_500 + '26', borderColor: EMBER_500 + '66' }
                        : { backgroundColor: theme.secondary, borderColor: theme.border },
                    ]}
                    onPress={() => onPortionChange(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: consumedPct == null ? EMBER_700 : theme.mutedForeground, fontSize: 11, fontFamily: FONT.uiBold }}>
                      Plan completo
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Satisfacción — solo si completado y es hoy */}
            {isCompleted && isToday && onSatisfaction && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
                  ¿CÓMO ESTUVO?
                </Text>
                <View style={styles.satisfactionRow}>
                  {([
                    { score: 1 as const, emoji: '😕' },
                    { score: 2 as const, emoji: '😐' },
                    { score: 3 as const, emoji: '😋' },
                  ]).map(({ score, emoji }) => {
                    const active = satisfactionScore === score
                    return (
                      <TouchableOpacity
                        key={score}
                        style={[
                          styles.satisfactionBtn,
                          active
                            ? { backgroundColor: EMBER_500 + '26', borderColor: EMBER_500 + '66' }
                            : { backgroundColor: theme.secondary, borderColor: theme.border },
                        ]}
                        onPress={() => onSatisfaction(active ? null : score)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.satisfactionEmoji}>{emoji}</Text>
                      </TouchableOpacity>
                    )
                  })}
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
  checkCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerMid: { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealName: { fontSize: 16, letterSpacing: -0.3, flexShrink: 1 },
  kcalPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, flexShrink: 0 },
  kcalText: { fontSize: 12 },
  macroRow: { flexDirection: 'row', gap: 10 },
  macro: { fontSize: 10.5 },
  foodItems: { borderTopWidth: 1, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 },
  section: { marginTop: 12, gap: 8 },
  sectionLabel: { fontSize: 10, letterSpacing: 0.6 },
  portionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  portionBtn: { minWidth: 46, height: 36, paddingHorizontal: 8, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  planBtn: { height: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  satisfactionRow: { flexDirection: 'row', gap: 8 },
  satisfactionBtn: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  satisfactionEmoji: { fontSize: 22 },
})
