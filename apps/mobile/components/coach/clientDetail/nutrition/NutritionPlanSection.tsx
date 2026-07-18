import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Apple, ChevronRight, Copy, ExternalLink, Heart, Pencil } from 'lucide-react-native'
import { Button, Card } from '../../../index'
import { MACRO_COLORS } from '../../../MacroRingSummary'
import { useTheme } from '../../../../context/ThemeContext'
import { FONT } from '../../../../lib/typography'

export interface NutritionPlanFoodInput {
  id?: string | null
  food_id?: string | null
  name?: string | null
  quantity?: number | string | null
  unit?: string | null
  calories?: number | null
  protein?: number | null
  protein_g?: number | null
  carbs?: number | null
  carbs_g?: number | null
  fats?: number | null
  fats_g?: number | null
  food?: {
    id?: string | null
    name?: string | null
    calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fats_g?: number | null
  } | null
}

export interface NutritionPlanMealInput {
  id?: string | null
  name?: string | null
  description?: string | null
  calories?: number | null
  protein?: number | null
  protein_g?: number | null
  carbs?: number | null
  carbs_g?: number | null
  fats?: number | null
  fats_g?: number | null
  foods?: readonly NutritionPlanFoodInput[] | null
  items?: readonly NutritionPlanFoodInput[] | null
  food_items?: readonly NutritionPlanFoodInput[] | null
}

export interface NutritionActivePlanInput {
  id?: string | null
  name?: string | null
  instructions?: string | null
  daily_calories?: number | null
  dailyCalories?: number | null
  protein_g?: number | null
  protein?: number | null
  carbs_g?: number | null
  carbs?: number | null
  fats_g?: number | null
  fats?: number | null
  is_custom?: boolean | null
  isCustom?: boolean | null
  meals?: readonly NutritionPlanMealInput[] | null
}

export interface NutritionFavoriteFoodInput {
  id?: string | null
  name?: string | null
}

export interface NutritionPlanSectionProps {
  plan?: NutritionActivePlanInput | null
  meals?: readonly NutritionPlanMealInput[] | null
  favoriteFoods?: readonly (NutritionFavoriteFoodInput | string)[] | null
  onEdit?: () => void
  onCopy?: () => void
  onViewAsStudent?: () => void
}

interface MacroTotals {
  protein: number
  carbs: number
  fats: number
  calories: number
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function firstFinite(...values: unknown[]): number {
  for (const value of values) {
    const parsed = finite(value)
    if (parsed !== null) return parsed
  }
  return 0
}

function foodsForMeal(meal: NutritionPlanMealInput): readonly NutritionPlanFoodInput[] {
  return meal.foods ?? meal.items ?? meal.food_items ?? []
}

function foodName(item: NutritionPlanFoodInput): string {
  return item.name?.trim() || item.food?.name?.trim() || 'Alimento'
}

function foodMacro(item: NutritionPlanFoodInput, key: 'protein' | 'carbs' | 'fats' | 'calories'): number {
  if (key === 'calories') return firstFinite(item.calories, item.food?.calories)
  return firstFinite(item[key], item[`${key}_g`], item.food?.[`${key}_g`])
}

/** Totales mostrados por la fila de comida, siguiendo la suma de food_items del web. */
export function getNutritionMealTotals(meal: NutritionPlanMealInput): MacroTotals {
  const foods = foodsForMeal(meal)
  const summed = foods.reduce<MacroTotals>((totals, item) => {
    const quantity = Math.max(0, firstFinite(item.quantity))
    totals.protein += foodMacro(item, 'protein') * quantity
    totals.carbs += foodMacro(item, 'carbs') * quantity
    totals.fats += foodMacro(item, 'fats') * quantity
    totals.calories += foodMacro(item, 'calories') * quantity
    return totals
  }, { protein: 0, carbs: 0, fats: 0, calories: 0 })

  return {
    protein: firstFinite(meal.protein, meal.protein_g, summed.protein),
    carbs: firstFinite(meal.carbs, meal.carbs_g, summed.carbs),
    fats: firstFinite(meal.fats, meal.fats_g, summed.fats),
    calories: firstFinite(meal.calories, summed.calories),
  }
}

function round(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0)
}

function clInteger(value: number): string {
  return round(value).toLocaleString('es-CL')
}

function displayQuantity(value: number | string | null | undefined): string {
  const parsed = finite(value)
  return parsed === null ? '0' : parsed.toLocaleString('es-CL', { maximumFractionDigits: 2 })
}

export function NutritionPlanSection({
  plan,
  meals,
  favoriteFoods,
  onEdit,
  onCopy,
  onViewAsStudent,
}: NutritionPlanSectionProps) {
  const { theme } = useTheme()
  const [openMealKey, setOpenMealKey] = useState<string | null>(null)

  const planMeals = meals ?? plan?.meals ?? []
  const favorites = (favoriteFoods ?? [])
    .map((favorite, index) => ({
      key: typeof favorite === 'string' ? `${favorite}-${index}` : favorite.id ?? `${favorite.name ?? 'food'}-${index}`,
      name: (typeof favorite === 'string' ? favorite : favorite.name)?.trim() ?? '',
    }))
    .filter((favorite) => favorite.name.length > 0)

  const kcal = firstFinite(plan?.daily_calories, plan?.dailyCalories)
  const protein = firstFinite(plan?.protein_g, plan?.protein)
  const carbs = firstFinite(plan?.carbs_g, plan?.carbs)
  const fats = firstFinite(plan?.fats_g, plan?.fats)
  const macroCalories = protein * 4 + carbs * 4 + fats * 9
  const macroTiles = useMemo(() => [
    { key: 'protein', name: 'Proteína', grams: protein, pct: macroCalories > 0 ? (protein * 4 / macroCalories) * 100 : 0 },
    { key: 'carbs', name: 'Carbos', grams: carbs, pct: macroCalories > 0 ? (carbs * 4 / macroCalories) * 100 : 0 },
    { key: 'fats', name: 'Grasas', grams: fats, pct: macroCalories > 0 ? (fats * 9 / macroCalories) * 100 : 0 },
  ], [carbs, fats, macroCalories, protein])
  const isCustom = plan?.is_custom === true || plan?.isCustom === true
  const instructions = plan?.instructions?.trim()

  return (
    <View style={styles.section}>
      <View style={styles.zoneHeader} accessibilityRole="header">
        <View className="bg-sport-100 rounded-control" style={styles.zoneBadge}>
          <Text className="text-sport-600" style={styles.zoneBadgeText}>B</Text>
        </View>
        <View style={styles.zoneCopy}>
          <Text className="text-strong" style={styles.zoneTitle}>Plan y comidas</Text>
          <Text className="text-muted" style={styles.zoneSubtitle}>Plan activo, edición y lista de comidas</Text>
        </View>
      </View>

      {favorites.length > 0 ? (
        <Card padding="md" style={styles.cardGap}>
          <View style={styles.favoriteHeading}>
            <Heart size={15} color={MACRO_COLORS.protein} fill={MACRO_COLORS.protein} />
            <Text className="text-subtle" style={styles.eyebrow}>Alimentos favoritos del alumno</Text>
          </View>
          <Text className="text-muted" style={styles.caption}>
            Marcados desde la app del alumno; se aplican a todos sus planes con esos alimentos del catálogo.
          </Text>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={favorites.length > 12}
            style={styles.favoriteScroller}
            contentContainerStyle={styles.favoriteWrap}
            accessibilityLabel="Alimentos favoritos del alumno"
          >
            {favorites.map((favorite) => (
              <View key={favorite.key} className="bg-surface-sunken border border-subtle rounded-control" style={styles.favoriteChip}>
                <Text className="text-body" style={styles.favoriteText} numberOfLines={1}>{favorite.name}</Text>
              </View>
            ))}
          </ScrollView>
        </Card>
      ) : null}

      {plan ? (
        <Card padding="md" style={styles.cardGap}>
          <View style={styles.planHeader}>
            <View style={styles.planIdentity}>
              <Apple size={17} color={theme.primary} />
              <View style={styles.planTitleWrap}>
                <Text className="text-strong" style={styles.planTitle} numberOfLines={1}>Plan · {plan.name?.trim() || 'Sin nombre'}</Text>
                {kcal > 0 ? <Text className="text-muted" style={styles.planKcal}>{clInteger(kcal)} kcal / día</Text> : null}
              </View>
            </View>
            <View
              className={`${isCustom ? 'bg-warning-100 dark:bg-warning-100/[0.14]' : 'bg-sport-100'} rounded-control`}
              style={styles.statusBadge}
              accessibilityLabel={`Tipo de plan: ${isCustom ? 'CUSTOM' : 'SYNCED'}`}
            >
              <Text className={isCustom ? 'text-warning-700' : 'text-sport-600'} style={styles.statusText}>{isCustom ? 'CUSTOM' : 'SYNCED'}</Text>
            </View>
          </View>

          {instructions ? <Text className="text-muted" style={styles.instructions}>{instructions}</Text> : null}

          <View style={styles.macroTiles} accessibilityLabel="Distribución calórica de macronutrientes">
            {macroTiles.map((macro) => (
              <View key={macro.key} className="bg-surface-sunken rounded-control" style={styles.macroTile}>
                <View style={styles.gramsRow}>
                  <Text className="text-strong" style={styles.macroGrams}>{round(macro.grams)}</Text>
                  <Text className="text-muted" style={styles.macroUnit}>g</Text>
                </View>
                <Text className="text-muted" style={styles.macroLabel} numberOfLines={1}>{macro.name} · {round(macro.pct)}%</Text>
              </View>
            ))}
          </View>

          {(onEdit || onCopy || onViewAsStudent) ? (
            <View style={styles.actions}>
              {onEdit ? <Button label="Editar plan" variant="sport" size="sm" leftIcon={Pencil} onPress={onEdit} /> : null}
              {onCopy ? <Button label="Copiar" variant="secondary" size="sm" leftIcon={Copy} onPress={onCopy} /> : null}
              {onViewAsStudent ? (
                <TouchableOpacity
                  accessibilityRole="link"
                  accessibilityLabel="Ver plan como alumno"
                  onPress={onViewAsStudent}
                  activeOpacity={0.7}
                  style={styles.studentLink}
                >
                  <ExternalLink size={14} color={theme.primary} />
                  <Text className="text-sport-600" style={styles.studentLinkText}>Ver como alumno</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {planMeals.length > 0 ? (
        <Card padding="none" style={styles.mealsCard} accessibilityLabel="Comidas del plan">
          {planMeals.map((meal, index) => {
            const mealKey = meal.id ?? `${meal.name ?? 'meal'}-${index}`
            const expanded = openMealKey === mealKey
            const totals = getNutritionMealTotals(meal)
            const foods = foodsForMeal(meal)
            const hasMacros = totals.protein > 0 || totals.carbs > 0 || totals.fats > 0
            return (
              <View key={mealKey} className={index < planMeals.length - 1 ? 'border-b border-subtle' : ''}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${meal.name?.trim() || 'Comida'}${totals.calories > 0 ? `, ${round(totals.calories)} kilocalorías` : ''}`}
                  accessibilityHint={expanded ? 'Contraer alimentos de esta comida' : 'Mostrar alimentos de esta comida'}
                  onPress={() => setOpenMealKey((current) => current === mealKey ? null : mealKey)}
                  activeOpacity={0.72}
                  style={styles.mealButton}
                >
                  <View style={styles.mealMain}>
                    <Text className="text-strong" style={styles.mealName} numberOfLines={1}>{meal.name?.trim() || 'Comida'}</Text>
                    {hasMacros ? (
                      <Text className="text-muted" style={styles.mealMacros} numberOfLines={1}>
                        P {round(totals.protein)}g · C {round(totals.carbs)}g · G {round(totals.fats)}g
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-subtle" style={styles.mealCalories}>{round(totals.calories)} kcal</Text>
                  <ChevronRight
                    size={16}
                    color={theme.mutedForeground}
                    style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
                  />
                </TouchableOpacity>

                {expanded ? (
                  <View className="border-t border-subtle" style={styles.mealBody}>
                    {meal.description?.trim() ? <Text className="text-muted" style={styles.mealDescription}>{meal.description.trim()}</Text> : null}
                    {foods.length === 0 ? (
                      <Text className="text-muted" style={styles.noFoods}>Sin alimentos enlazados</Text>
                    ) : foods.map((item, foodIndex) => {
                      const quantity = Math.max(0, firstFinite(item.quantity))
                      const calories = foodMacro(item, 'calories') * quantity
                      const itemKey = item.id ?? item.food_id ?? `${foodName(item)}-${foodIndex}`
                      return (
                        <View key={itemKey} className={foodIndex < foods.length - 1 ? 'border-b border-subtle' : ''} style={styles.foodRow}>
                          <Text className="text-body" style={styles.foodName} numberOfLines={2}>{foodName(item)}</Text>
                          <Text className="text-muted" style={styles.foodMeta} numberOfLines={1}>
                            {displayQuantity(item.quantity)}{item.unit?.trim() ?? ''} · {round(calories)} kcal
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                ) : null}
              </View>
            )
          })}
        </Card>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2 },
  zoneBadge: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  zoneBadgeText: { fontFamily: FONT.uiExtra, fontSize: 12 },
  zoneCopy: { flex: 1, gap: 1 },
  zoneTitle: { fontFamily: FONT.displayBold, fontSize: 17, letterSpacing: -0.34 },
  zoneSubtitle: { fontFamily: FONT.uiMedium, fontSize: 11, lineHeight: 15 },
  cardGap: { gap: 12 },
  favoriteHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eyebrow: { flex: 1, fontFamily: FONT.uiExtra, fontSize: 11, lineHeight: 15, letterSpacing: 1.1, textTransform: 'uppercase' },
  caption: { fontFamily: FONT.ui, fontSize: 11, lineHeight: 15 },
  favoriteScroller: { maxHeight: 112 },
  favoriteWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  favoriteChip: { maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 5 },
  favoriteText: { fontFamily: FONT.uiSemibold, fontSize: 11, lineHeight: 15, maxWidth: 240 },
  planHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  planIdentity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  planTitleWrap: { flex: 1, minWidth: 0, gap: 2 },
  planTitle: { fontFamily: FONT.uiExtra, fontSize: 15, lineHeight: 18 },
  planKcal: { fontFamily: FONT.ui, fontSize: 12, lineHeight: 16 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontFamily: FONT.uiBold, fontSize: 10, lineHeight: 13, letterSpacing: 0.5 },
  instructions: { fontFamily: FONT.uiMedium, fontSize: 12, lineHeight: 18 },
  macroTiles: { flexDirection: 'row', gap: 7 },
  macroTile: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 5, paddingVertical: 8 },
  gramsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
  macroGrams: { fontFamily: FONT.displayBlack, fontSize: 15, lineHeight: 18, fontVariant: ['tabular-nums'] },
  macroUnit: { fontFamily: FONT.ui, fontSize: 10, lineHeight: 13 },
  macroLabel: { fontFamily: FONT.ui, fontSize: 10, lineHeight: 13, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  studentLink: { minHeight: 36, marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 4 },
  studentLinkText: { fontFamily: FONT.uiBold, fontSize: 12, lineHeight: 16 },
  mealsCard: { overflow: 'hidden' },
  mealButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  mealMain: { flex: 1, minWidth: 0, gap: 2 },
  mealName: { fontFamily: FONT.uiBold, fontSize: 14, lineHeight: 18 },
  mealMacros: { fontFamily: FONT.uiBold, fontSize: 10, lineHeight: 14 },
  mealCalories: { fontFamily: FONT.mono, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  mealBody: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  mealDescription: { fontFamily: FONT.ui, fontSize: 11, lineHeight: 16 },
  noFoods: { fontFamily: FONT.ui, fontSize: 10, lineHeight: 14, fontStyle: 'italic' },
  foodRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8 },
  foodName: { flex: 1, fontFamily: FONT.uiBold, fontSize: 10, lineHeight: 14 },
  foodMeta: { flexShrink: 0, fontFamily: FONT.uiMedium, fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
})
