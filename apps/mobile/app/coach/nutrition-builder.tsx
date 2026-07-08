import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ArrowLeftRight, Calculator, ChevronDown, ChevronLeft, ChevronUp, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { Button, NativeDialog } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import {
  computeMifflinStJeor,
  computeTDEE,
  deriveCalorieTarget,
  deriveMacroTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from '@eva/nutrition-engine'
import { FoodSearchSheet } from '../../components/coach/FoodSearchSheet'
import { FoodSwapSheet } from '../../components/coach/FoodSwapSheet'
import {
  DAY_OF_WEEK,
  draftItemMacros,
  draftTotals,
  emptyPlanDraft,
  foodToDraftItem,
  getClientFoodFavorites,
  getPlanDraft,
  newMeal,
  saveClientPlan,
  type DraftMeal,
  type FoodRow,
  type PlanDraft,
  type SwapOption,
} from '../../lib/nutrition-builder'
import { coerceSwapOptionUnit } from '../../lib/nutrition-utils'
import { getTemplateDraft, saveTemplate } from '../../lib/nutrition-templates'

// Acento de dominio nutrición / intercambios (ember-500, fijo — token-contract).
const EMBER = '#FF6A3D'

// UI-facing keys → engine types (fuente de verdad única: @eva/nutrition-engine).
type ActivityKey = ActivityLevel
type GoalKey = Goal

const GOAL_LABELS: Record<GoalKey, string> = {
  lose: 'Déficit (bajar grasa)',
  maintain: 'Mantención',
  gain: 'Volumen (ganar músculo)',
}

const ACTIVITY_LABELS: Record<ActivityKey, string> = {
  sedentary: 'Sedentario',
  light: 'Ligero (1–3 d/sem)',
  moderate: 'Moderado (3–5 d/sem)',
  active: 'Activo (6–7 d/sem)',
  very_active: 'Muy activo',
}

/**
 * Objetivos Mifflin-St Jeor → TDEE → calorías → macros, delegando 100% en
 * @eva/nutrition-engine (mismas firmas que el web PlanBuilderSidebar → mismos
 * números para el mismo alumno/objetivo).
 */
function calcMacros(
  weightKg: number,
  heightCm: number,
  ageYears: number,
  gender: 'M' | 'F',
  activity: ActivityKey,
  goal: GoalKey
): { calories: number; protein: number; carbs: number; fats: number } {
  const sex: Sex = gender === 'M' ? 'male' : 'female'
  const bmr = computeMifflinStJeor({ sex, weightKg, heightCm, age: ageYears })
  const tdee = computeTDEE(bmr, activity)
  const calories = deriveCalorieTarget(tdee, goal)
  const macros = deriveMacroTargets(calories, weightKg, goal)
  return { calories, protein: macros.protein_g, carbs: macros.carbs_g, fats: macros.fats_g }
}

function unitsForFood(item: { unit: string; serving_unit?: string; is_liquid?: boolean }) {
  const units = item.is_liquid || item.serving_unit === 'ml' ? ['ml', 'un'] : ['g', 'un']
  return units.includes(item.unit) ? units : [item.unit, ...units.filter((u) => u !== item.unit)]
}

export default function NutritionBuilderScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { clientId, clientName, planId, templateId, mode } = useLocalSearchParams<{ clientId?: string; clientName?: string; planId?: string; templateId?: string; mode?: string }>()
  const isTemplate = mode === 'template' || !!templateId
  const foodSheetRef = useRef<BottomSheetModal>(null)
  const swapSheetRef = useRef<BottomSheetModal>(null)
  const activeMealRef = useRef<string | null>(null)
  // 'food' = agregar alimento a la comida; 'swap' = agregar alternativa al alimento target.
  const [searchMode, setSearchMode] = useState<'food' | 'swap'>('food')

  const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Objetivos = suma de alimentos automáticamente, salvo que el coach los edite a mano.
  const [macrosManual, setMacrosManual] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  // Target del editor de intercambios (qué alimento de qué comida).
  const [swapTarget, setSwapTarget] = useState<{ mealUid: string; itemUid: string } | null>(null)
  const [showEmptyWarn, setShowEmptyWarn] = useState(false)
  // N-F3: calculadora de metas (Mifflin-St Jeor).
  const [calcOpen, setCalcOpen] = useState(false)
  const [calc, setCalc] = useState({ weight: '', height: '', age: '', gender: 'M' as 'M' | 'F', activity: 'moderate' as ActivityKey, goal: 'maintain' as GoalKey })

  useEffect(() => {
    (async () => {
      if (isTemplate) {
        if (templateId) { const d = await getTemplateDraft(templateId); if (d) { setDraft(d); setMacrosManual((d.daily_calories ?? 0) > 0) } }
        else setDraft((p) => ({ ...p, name: '' }))
        setLoading(false)
        return
      }
      if (planId) {
        const d = await getPlanDraft(planId)
        if (d) { setDraft(d); setMacrosManual((d.daily_calories ?? 0) > 0) }
      }
      setLoading(false)
    })()
  }, [planId, templateId])

  // Favoritos del alumno (solo planes de alumno) → resaltar en el buscador.
  useEffect(() => {
    if (isTemplate || !clientId) return
    getClientFoodFavorites(clientId).then(setFavoriteIds).catch(() => {})
  }, [clientId, isTemplate])

  const totals = draftTotals(draft.meals)

  // Auto: objetivos siguen la suma de alimentos (salvo edición manual del coach).
  useEffect(() => {
    if (macrosManual) return
    setDraft((d) => ({ ...d, daily_calories: totals.kcal, protein_g: totals.protein, carbs_g: totals.carbs, fats_g: totals.fats }))
  }, [totals.kcal, totals.protein, totals.carbs, totals.fats, macrosManual])

  function patch(p: Partial<PlanDraft>) { setDraft((d) => ({ ...d, ...p })) }
  function setMeals(fn: (meals: DraftMeal[]) => DraftMeal[]) { setDraft((d) => ({ ...d, meals: fn(d.meals) })) }
  function updateMeal(uid: string, p: Partial<DraftMeal>) { setMeals((ms) => ms.map((m) => (m.uid === uid ? { ...m, ...p } : m))) }
  function removeMeal(uid: string) { setMeals((ms) => ms.filter((m) => m.uid !== uid).map((m, i) => ({ ...m, order_index: i }))) }
  function addMeal() { setMeals((ms) => [...ms, newMeal(ms.length)]) }
  function moveMeal(uid: string, dir: -1 | 1) {
    setMeals((ms) => {
      const i = ms.findIndex((m) => m.uid === uid); const j = i + dir
      if (i < 0 || j < 0 || j >= ms.length) return ms
      const next = [...ms]; const tmp = next[i]; next[i] = next[j]; next[j] = tmp
      return next.map((m, idx) => ({ ...m, order_index: idx }))
    })
  }
  function moveItem(mealUid: string, itemUid: string, dir: -1 | 1) {
    setMeals((ms) => ms.map((m) => {
      if (m.uid !== mealUid) return m
      const i = m.items.findIndex((it) => it.uid === itemUid); const j = i + dir
      if (i < 0 || j < 0 || j >= m.items.length) return m
      const items = [...m.items]; const tmp = items[i]; items[i] = items[j]; items[j] = tmp
      return { ...m, items }
    }))
  }

  function openFoodSearch(mealUid: string) {
    setSearchMode('food')
    activeMealRef.current = mealUid
    foodSheetRef.current?.present()
  }

  function openSwap(mealUid: string, itemUid: string) {
    setSwapTarget({ mealUid, itemUid })
    swapSheetRef.current?.present()
  }
  function onAddSwapPress() {
    setSearchMode('swap')
    foodSheetRef.current?.present()
  }

  // Mutador genérico sobre el alimento target del editor de intercambios.
  function patchTargetSwaps(fn: (opts: SwapOption[]) => SwapOption[]) {
    if (!swapTarget) return
    setMeals((ms) => ms.map((m) => (m.uid !== swapTarget.mealUid ? m : {
      ...m,
      items: m.items.map((it) => (it.uid !== swapTarget.itemUid ? it : { ...it, swapOptions: fn(it.swapOptions ?? []) })),
    })))
  }
  function addSwapToTarget(food: FoodRow) {
    const target = swapTarget
    if (!target) return
    const isLiquid = !!food.is_liquid || food.serving_unit === 'ml'
    const opt: SwapOption = {
      food_id: food.id,
      quantity: food.serving_size || 100,
      unit: coerceSwapOptionUnit(food.serving_unit, isLiquid),
      food: { name: food.name, calories: food.calories, protein_g: food.protein_g, carbs_g: food.carbs_g, fats_g: food.fats_g, serving_size: food.serving_size || 100, serving_unit: food.serving_unit ?? 'g', is_liquid: isLiquid, brand: food.brand ?? null },
    }
    patchTargetSwaps((opts) => (opts.some((o) => o.food_id === opt.food_id) ? opts : [...opts, opt]))
  }
  function updateSwap(swapFoodId: string, quantity: number, unit: 'g' | 'un' | 'ml') {
    patchTargetSwaps((opts) => opts.map((o) => (o.food_id === swapFoodId ? { ...o, quantity, unit } : o)))
  }
  function removeSwap(swapFoodId: string) {
    patchTargetSwaps((opts) => opts.filter((o) => o.food_id !== swapFoodId))
  }

  function handleFoodSelected(food: FoodRow) {
    if (searchMode === 'swap') { addSwapToTarget(food); return }
    const mealUid = activeMealRef.current
    if (!mealUid) return
    setMeals((ms) => ms.map((m) => (m.uid === mealUid ? { ...m, items: [...m.items, foodToDraftItem(food)] } : m)))
  }

  const swapItem = swapTarget
    ? draft.meals.find((m) => m.uid === swapTarget.mealUid)?.items.find((it) => it.uid === swapTarget.itemUid) ?? null
    : null
  const swapExcluded = swapItem ? [swapItem.food_id, ...(swapItem.swapOptions ?? []).map((o) => o.food_id)] : []

  function updateItemQty(mealUid: string, itemUid: string, raw: string) {
    const q = Number(raw.replace(/[^0-9.]/g, '')) || 0
    setMeals((ms) => ms.map((m) => (m.uid === mealUid ? { ...m, items: m.items.map((it) => (it.uid === itemUid ? { ...it, quantity: q } : it)) } : m)))
  }
  function updateItemUnit(mealUid: string, itemUid: string, unit: string) {
    setMeals((ms) => ms.map((m) => (m.uid === mealUid ? { ...m, items: m.items.map((it) => (it.uid === itemUid ? { ...it, unit } : it)) } : m)))
  }
  function removeItem(mealUid: string, itemUid: string) {
    setMeals((ms) => ms.map((m) => (m.uid === mealUid ? { ...m, items: m.items.filter((it) => it.uid !== itemUid) } : m)))
  }

  async function save() {
    if (draft.name.trim().length < 2) { Alert.alert('Falta el nombre', isTemplate ? 'Indicá un nombre para la plantilla.' : 'Indicá un nombre para el plan.'); return }
    if (draft.meals.length === 0) { Alert.alert('Sin comidas', 'Agregá al menos una comida antes de guardar.'); return }
    const empties = draft.meals.filter((m) => m.items.length === 0)
    if (empties.length > 0) {
      setShowEmptyWarn(true)
      Alert.alert('Comidas incompletas', `Completá al menos 1 alimento en: ${empties.map((m) => m.name || 'Sin nombre').join(', ')}.`)
      return
    }
    setSaving(true)
    const res = isTemplate ? await saveTemplate(draft) : await saveClientPlan(clientId!, draft)
    setSaving(false)
    if (!res.ok) { Alert.alert('Error', res.error ?? 'No se pudo guardar.'); return }
    router.back()
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <EvaLoaderScreen subtitle="Cargando plan…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBack} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.primary} />
          <Text style={[styles.headerBackText, { color: theme.primary, fontFamily: 'Archivo_700Bold' }]}>Volver</Text>
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>
          {isTemplate ? (templateId ? 'Editar plantilla' : 'Nueva plantilla') : (planId ? 'Editar plan' : 'Nuevo plan')}
        </Text>
        <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
          style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
          {saving ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : (
            <Text style={[styles.saveText, { color: theme.primaryForeground, fontFamily: 'Archivo_700Bold' }]}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {clientName ? (
            <Text style={[styles.clientLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Plan para {clientName}</Text>
          ) : null}

          {/* Plan meta */}
          <Field theme={theme} label="Nombre del plan" value={draft.name} onChangeText={(v: string) => patch({ name: v })} placeholder="Ej: Definición — 2000 kcal" />

          <View style={styles.objHeaderRow}>
            <Label theme={theme}>Objetivos diarios</Label>
            {macrosManual ? (
              <TouchableOpacity onPress={() => setMacrosManual(false)} activeOpacity={0.7}>
                <Text style={[styles.autoChip, { color: theme.primary, fontFamily: 'HankenGrotesk_600SemiBold' }]}>↺ Auto desde alimentos</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.autoChip, { color: theme.success, fontFamily: 'HankenGrotesk_600SemiBold' }]}>Auto desde alimentos ✓</Text>
            )}
          </View>
          <View style={styles.macroRow}>
            <MacroField theme={theme} label="kcal" value={draft.daily_calories} onChange={(n) => { setMacrosManual(true); patch({ daily_calories: n }) }} />
            <MacroField theme={theme} label="Prot (g)" value={draft.protein_g} onChange={(n) => { setMacrosManual(true); patch({ protein_g: n }) }} />
            <MacroField theme={theme} label="Carbs (g)" value={draft.carbs_g} onChange={(n) => { setMacrosManual(true); patch({ carbs_g: n }) }} />
            <MacroField theme={theme} label="Gras (g)" value={draft.fats_g} onChange={(n) => { setMacrosManual(true); patch({ fats_g: n }) }} />
          </View>

          <Button label="Calcular metas (Mifflin-St Jeor)" variant="outline" leftIcon={Calculator} onPress={() => setCalcOpen(true)} full />

          {/* Live totals from foods */}
          <View style={[styles.totals, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Text style={[styles.totalsLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Suma de alimentos</Text>
            <Text style={[styles.totalsValue, { color: theme.foreground, fontFamily: 'JetBrainsMono_500Medium' }]}>
              {totals.kcal} kcal · P{totals.protein} C{totals.carbs} G{totals.fats}
            </Text>
          </View>

          <Field theme={theme} label="Instrucciones (opcional)" value={draft.instructions} onChangeText={(v: string) => patch({ instructions: v })} placeholder="Notas para el alumno" multiline />

          {/* Meals */}
          <Label theme={theme}>Comidas</Label>
          {draft.meals.map((meal, mealIdx) => (
            <MotiView key={meal.uid} from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 220 }}
              style={[styles.mealCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
              <View style={styles.mealTop}>
                <TextInput value={meal.name} onChangeText={(v) => updateMeal(meal.uid, { name: v })} placeholder="Nombre comida" placeholderTextColor={theme.mutedForeground}
                  style={[styles.mealName, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]} />
                <TouchableOpacity onPress={() => moveMeal(meal.uid, -1)} disabled={mealIdx === 0} hitSlop={6} style={styles.moveBtn}>
                  <ChevronUp size={17} color={mealIdx === 0 ? theme.muted : theme.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => moveMeal(meal.uid, 1)} disabled={mealIdx === draft.meals.length - 1} hitSlop={6} style={styles.moveBtn}>
                  <ChevronDown size={17} color={mealIdx === draft.meals.length - 1 ? theme.muted : theme.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeMeal(meal.uid)} hitSlop={8} activeOpacity={0.7}>
                  <Trash2 size={17} color={theme.destructive} />
                </TouchableOpacity>
              </View>

              {/* Day of week */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
                {DAY_OF_WEEK.map((d) => {
                  const active = meal.day_of_week === d.value
                  return (
                    <TouchableOpacity key={String(d.value)} onPress={() => updateMeal(meal.uid, { day_of_week: d.value })} activeOpacity={0.8}
                      style={[styles.dayChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '1A' : 'transparent' }]}>
                      <Text style={{ fontSize: 12, fontFamily: 'HankenGrotesk_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{d.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {/* Items */}
              {meal.items.map((it, itemIdx) => {
                const im = draftItemMacros(it)
                const swapCount = it.swapOptions?.length ?? 0
                return (
                  <View key={it.uid} style={{ gap: 6 }}>
                    <View style={[styles.itemRow, { borderColor: theme.border }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[styles.itemName, { color: theme.foreground, fontFamily: 'HankenGrotesk_600SemiBold' }]}>{it.name}</Text>
                        <Text style={[styles.itemMacro, { color: theme.mutedForeground, fontFamily: 'JetBrainsMono_400Regular' }]}>
                          {Math.round(im.calories)} kcal · P{Math.round(im.protein)} C{Math.round(im.carbs)} G{Math.round(im.fats)}
                        </Text>
                      </View>
                      <TextInput
                        value={String(it.quantity)}
                        onChangeText={(v) => updateItemQty(meal.uid, it.uid, v)}
                        keyboardType="number-pad"
                        textAlignVertical="center"
                        style={[styles.qtyInput, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.secondary, fontFamily: theme.fontSans }]}
                      />
                      <View style={styles.unitWrap}>
                        {unitsForFood(it).map((u) => {
                          const active = it.unit === u
                          return (
                            <TouchableOpacity key={u} onPress={() => updateItemUnit(meal.uid, it.uid, u)} activeOpacity={0.8}
                              style={[styles.unitChip, active && { backgroundColor: theme.primary }]}>
                              <Text style={{ fontSize: 11, fontFamily: 'HankenGrotesk_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
                            </TouchableOpacity>
                          )
                        })}
                      </View>
                      <TouchableOpacity onPress={() => removeItem(meal.uid, it.uid)} hitSlop={6} activeOpacity={0.7}>
                        <X size={16} color={theme.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.itemActionRow}>
                      <TouchableOpacity onPress={() => openSwap(meal.uid, it.uid)} activeOpacity={0.8}
                        style={[styles.swapBtn, { flex: 1, borderColor: swapCount ? EMBER + '66' : theme.border, backgroundColor: swapCount ? EMBER + '14' : 'transparent' }]}>
                        <ArrowLeftRight size={13} color={swapCount ? EMBER : theme.mutedForeground} />
                        <Text style={[styles.swapBtnText, { color: swapCount ? EMBER : theme.mutedForeground, fontFamily: 'HankenGrotesk_600SemiBold' }]}>
                          {swapCount ? `${swapCount} alternativa${swapCount !== 1 ? 's' : ''}` : 'Configurar cambios'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveItem(meal.uid, it.uid, -1)} disabled={itemIdx === 0} hitSlop={6} style={styles.moveBtn}>
                        <ChevronUp size={16} color={itemIdx === 0 ? theme.muted : theme.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveItem(meal.uid, it.uid, 1)} disabled={itemIdx === meal.items.length - 1} hitSlop={6} style={styles.moveBtn}>
                        <ChevronDown size={16} color={itemIdx === meal.items.length - 1 ? theme.muted : theme.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              })}

              {showEmptyWarn && meal.items.length === 0 ? (
                <View style={[styles.warnBox, { borderColor: '#F9731640', backgroundColor: '#F9731614' }]}>
                  <Text style={[styles.warnText, { color: '#F97316', fontFamily: 'HankenGrotesk_600SemiBold' }]}>Comida vacía: agregá al menos 1 alimento.</Text>
                </View>
              ) : null}

              <TextInput value={meal.notes} onChangeText={(v) => updateMeal(meal.uid, { notes: v })} placeholder="Nota para el alumno (opcional)" placeholderTextColor={theme.mutedForeground} maxLength={500} multiline
                style={[styles.notesInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />

              <TouchableOpacity onPress={() => openFoodSearch(meal.uid)} activeOpacity={0.8}
                style={[styles.addFood, { borderColor: theme.primary + '55' }]}>
                <Plus size={15} color={theme.primary} />
                <Text style={[styles.addFoodText, { color: theme.primary, fontFamily: 'HankenGrotesk_600SemiBold' }]}>Agregar alimento</Text>
              </TouchableOpacity>
            </MotiView>
          ))}

          <TouchableOpacity onPress={addMeal} activeOpacity={0.85} style={[styles.addMeal, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <UtensilsCrossed size={17} color={theme.foreground} />
            <Text style={[styles.addMealText, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>Agregar comida</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <FoodSearchSheet
        ref={foodSheetRef}
        onSelect={handleFoodSelected}
        excludedIds={searchMode === 'swap' ? swapExcluded : undefined}
        favoriteIds={!isTemplate && favoriteIds.size ? favoriteIds : undefined}
        title={searchMode === 'swap' ? 'Agregar alternativa' : undefined}
      />
      <FoodSwapSheet ref={swapSheetRef} item={swapItem} onAddPress={onAddSwapPress} onUpdateSwap={updateSwap} onRemoveSwap={removeSwap} />

      {/* N-F3: calculadora de metas (Mifflin-St Jeor) */}
      <NativeDialog open={calcOpen} title="Calcular metas" onClose={() => setCalcOpen(false)}>
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CalcField theme={theme} label="Peso (kg)" value={calc.weight} onChangeText={(v: string) => setCalc((c) => ({ ...c, weight: v }))} />
            <CalcField theme={theme} label="Altura (cm)" value={calc.height} onChangeText={(v: string) => setCalc((c) => ({ ...c, height: v }))} />
            <CalcField theme={theme} label="Edad" value={calc.age} onChangeText={(v: string) => setCalc((c) => ({ ...c, age: v }))} />
          </View>
          <CalcChips theme={theme} label="Sexo" value={calc.gender} options={[{ k: 'M', l: 'Hombre' }, { k: 'F', l: 'Mujer' }]} onPick={(k) => setCalc((c) => ({ ...c, gender: k as 'M' | 'F' }))} />
          <CalcChips theme={theme} label="Actividad" value={calc.activity} options={(Object.keys(ACTIVITY_LABELS) as ActivityKey[]).map((k) => ({ k, l: ACTIVITY_LABELS[k] }))} onPick={(k) => setCalc((c) => ({ ...c, activity: k as ActivityKey }))} />
          <CalcChips theme={theme} label="Objetivo" value={calc.goal} options={(Object.keys(GOAL_LABELS) as GoalKey[]).map((k) => ({ k, l: GOAL_LABELS[k] }))} onPick={(k) => setCalc((c) => ({ ...c, goal: k as GoalKey }))} />
          <Button label="Aplicar metas sugeridas" onPress={() => {
            const w = Number(calc.weight), h = Number(calc.height), a = Number(calc.age)
            if (!(w > 0 && h > 0 && a > 0)) { Alert.alert('Datos incompletos', 'Indicá peso, altura y edad.'); return }
            const g = calcMacros(w, h, a, calc.gender, calc.activity, calc.goal)
            setMacrosManual(true)
            patch({ daily_calories: g.calories, protein_g: g.protein, carbs_g: g.carbs, fats_g: g.fats })
            setCalcOpen(false)
          }} full />
        </ScrollView>
      </NativeDialog>
    </SafeAreaView>
  )
}

function Label({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{children}</Text>
}

function Field({ theme, label, multiline, ...rest }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.mutedForeground} multiline={multiline}
        style={[styles.input, multiline && { height: 80, textAlignVertical: 'top', paddingTop: 10 }, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} {...rest} />
    </View>
  )
}

function CalcField({ theme, label, value, onChangeText }: { theme: any; label: string; value: string; onChangeText: (v: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={[styles.macroLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.mutedForeground}
        style={[styles.macroInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
    </View>
  )
}

function CalcChips({ theme, label, value, options, onPick }: { theme: any; label: string; value: string; options: { k: string; l: string }[]; onPick: (k: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => {
          const on = o.k === value
          return (
            <TouchableOpacity key={o.k} onPress={() => onPick(o.k)} activeOpacity={0.8}
              style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }}>
              <Text style={{ fontSize: 12, fontFamily: 'HankenGrotesk_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{o.l}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

function MacroField({ theme, label, value, onChange }: { theme: any; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={[styles.macroLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput value={value ? String(value) : ''} onChangeText={(v) => onChange(Number(v.replace(/[^0-9]/g, '')) || 0)} keyboardType="number-pad"
        placeholder="0" placeholderTextColor={theme.mutedForeground}
        style={[styles.macroInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 84 },
  headerBackText: { fontSize: 13 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 15 },
  saveBtn: { width: 84, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 13 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 60, gap: 12 },
  clientLabel: { fontSize: 13 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  fieldLabel: { fontSize: 12 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  macroRow: { flexDirection: 'row', gap: 8 },
  objHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  autoChip: { fontSize: 11 },
  macroLabel: { fontSize: 11 },
  macroInput: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, fontSize: 15, textAlign: 'center' },
  totals: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
  totalsLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  totalsValue: { fontSize: 15 },
  mealCard: { padding: 14, borderWidth: 1, gap: 10 },
  mealTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealName: { flex: 1, fontSize: 16, paddingVertical: 2 },
  dayRow: { gap: 6, paddingVertical: 2 },
  dayChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  itemName: { fontSize: 13 },
  itemMacro: { fontSize: 11, marginTop: 2 },
  qtyInput: { width: 62, height: 44, borderWidth: 1, borderRadius: 9, textAlign: 'center', fontSize: 16, lineHeight: 20, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 6, includeFontPadding: false },
  unitWrap: { flexDirection: 'row', gap: 2, backgroundColor: 'transparent' },
  unitChip: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 7 },
  addFood: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10 },
  addFoodText: { fontSize: 13 },
  swapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 9, paddingVertical: 8 },
  swapBtnText: { fontSize: 11.5 },
  itemActionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  moveBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  warnBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  warnText: { fontSize: 12, lineHeight: 16 },
  notesInput: { minHeight: 56, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingTop: 9, fontSize: 14, textAlignVertical: 'top' },
  addMeal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  addMealText: { fontSize: 14 },
})
