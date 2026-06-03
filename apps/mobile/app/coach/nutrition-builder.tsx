import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ChevronLeft, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { FoodSearchSheet } from '../../components/coach/FoodSearchSheet'
import {
  DAY_OF_WEEK,
  draftTotals,
  emptyPlanDraft,
  foodToDraftItem,
  getPlanDraft,
  newMeal,
  saveClientPlan,
  type DraftMeal,
  type FoodRow,
  type PlanDraft,
} from '../../lib/nutrition-builder'
import { getTemplateDraft, saveTemplate } from '../../lib/nutrition-templates'

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
  const activeMealRef = useRef<string | null>(null)

  const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      if (isTemplate) {
        if (templateId) { const d = await getTemplateDraft(templateId); if (d) setDraft(d) }
        else setDraft((p) => ({ ...p, name: '' }))
        setLoading(false)
        return
      }
      if (planId) {
        const d = await getPlanDraft(planId)
        if (d) setDraft(d)
      }
      setLoading(false)
    })()
  }, [planId, templateId])

  const totals = draftTotals(draft.meals)

  function patch(p: Partial<PlanDraft>) { setDraft((d) => ({ ...d, ...p })) }
  function setMeals(fn: (meals: DraftMeal[]) => DraftMeal[]) { setDraft((d) => ({ ...d, meals: fn(d.meals) })) }
  function updateMeal(uid: string, p: Partial<DraftMeal>) { setMeals((ms) => ms.map((m) => (m.uid === uid ? { ...m, ...p } : m))) }
  function removeMeal(uid: string) { setMeals((ms) => ms.filter((m) => m.uid !== uid).map((m, i) => ({ ...m, order_index: i }))) }
  function addMeal() { setMeals((ms) => [...ms, newMeal(ms.length)]) }

  function openFoodSearch(mealUid: string) {
    activeMealRef.current = mealUid
    foodSheetRef.current?.present()
  }

  function handleFoodSelected(food: FoodRow) {
    const mealUid = activeMealRef.current
    if (!mealUid) return
    setMeals((ms) => ms.map((m) => (m.uid === mealUid ? { ...m, items: [...m.items, foodToDraftItem(food)] } : m)))
  }

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
          <Text style={[styles.headerBackText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Volver</Text>
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          {isTemplate ? (templateId ? 'Editar plantilla' : 'Nueva plantilla') : (planId ? 'Editar plan' : 'Nuevo plan')}
        </Text>
        <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
          style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
          {saving ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : (
            <Text style={[styles.saveText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>Guardar</Text>
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

          <Label theme={theme}>Objetivos diarios</Label>
          <View style={styles.macroRow}>
            <MacroField theme={theme} label="kcal" value={draft.daily_calories} onChange={(n) => patch({ daily_calories: n })} />
            <MacroField theme={theme} label="Prot (g)" value={draft.protein_g} onChange={(n) => patch({ protein_g: n })} />
            <MacroField theme={theme} label="Carbs (g)" value={draft.carbs_g} onChange={(n) => patch({ carbs_g: n })} />
            <MacroField theme={theme} label="Gras (g)" value={draft.fats_g} onChange={(n) => patch({ fats_g: n })} />
          </View>

          {/* Live totals from foods */}
          <View style={[styles.totals, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Text style={[styles.totalsLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Suma de alimentos</Text>
            <Text style={[styles.totalsValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {totals.kcal} kcal · P{totals.protein} C{totals.carbs} G{totals.fats}
            </Text>
          </View>

          <Field theme={theme} label="Instrucciones (opcional)" value={draft.instructions} onChangeText={(v: string) => patch({ instructions: v })} placeholder="Notas para el alumno" multiline />

          {/* Meals */}
          <Label theme={theme}>Comidas</Label>
          {draft.meals.map((meal) => (
            <MotiView key={meal.uid} from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 220 }}
              style={[styles.mealCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
              <View style={styles.mealTop}>
                <TextInput value={meal.name} onChangeText={(v) => updateMeal(meal.uid, { name: v })} placeholder="Nombre comida" placeholderTextColor={theme.mutedForeground}
                  style={[styles.mealName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} />
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
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{d.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {/* Items */}
              {meal.items.map((it) => (
                <View key={it.uid} style={[styles.itemRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.itemName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{it.name}</Text>
                    <Text style={[styles.itemMacro, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                      {Math.round(it.calories * (it.serving_size > 0 ? it.quantity / it.serving_size : 0))} kcal
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
                          <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                  <TouchableOpacity onPress={() => removeItem(meal.uid, it.uid)} hitSlop={6} activeOpacity={0.7}>
                    <X size={16} color={theme.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity onPress={() => openFoodSearch(meal.uid)} activeOpacity={0.8}
                style={[styles.addFood, { borderColor: theme.primary + '55' }]}>
                <Plus size={15} color={theme.primary} />
                <Text style={[styles.addFoodText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>Agregar alimento</Text>
              </TouchableOpacity>
            </MotiView>
          ))}

          <TouchableOpacity onPress={addMeal} activeOpacity={0.85} style={[styles.addMeal, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <UtensilsCrossed size={17} color={theme.foreground} />
            <Text style={[styles.addMealText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Agregar comida</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <FoodSearchSheet ref={foodSheetRef} onSelect={handleFoodSelected} />
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
  addMeal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  addMealText: { fontSize: 14 },
})
