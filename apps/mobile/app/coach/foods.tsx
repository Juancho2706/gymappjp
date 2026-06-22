import { useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { Apple, ChevronLeft, Globe, Pencil, Plus, Search, SlidersHorizontal, Star, Trash2, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { EmptyState, NativeDialog } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { supabase } from '../../lib/supabase'
import {
  FOOD_CATEGORIES,
  FOOD_UNITS,
  createCustomFood,
  deleteFood,
  householdMeasureLabel,
  listCoachFoods,
  searchFoods,
  updateFood,
  type FoodRow,
  type FoodUnit,
} from '../../lib/nutrition-builder'

type SortKey = 'name' | 'calories' | 'protein'

/**
 * % de calorías por macro (espejo verbatim de macroPreviewPct web AddFoodSheet):
 * usa las kcal declaradas si > 0, si no las deriva (P·4 + C·4 + G·9).
 */
function macroPreviewPct(calories: number, p: number, c: number, f: number): { p: number; c: number; f: number } {
  const cals = Number(calories) || 0
  const denom = cals > 0 ? cals : p * 4 + c * 4 + f * 9
  if (denom <= 0) return { p: 0, c: 0, f: 0 }
  return {
    p: Math.round(((p * 4) / denom) * 100),
    c: Math.round(((c * 4) / denom) * 100),
    f: Math.round(((f * 9) / denom) * 100),
  }
}

export default function CoachFoodsScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [foods, setFoods] = useState<FoodRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<FoodRow | null>(null)
  const [creating, setCreating] = useState(false)
  // N-F21: scope de búsqueda — "mine" (CRUD propios) o "all" (catálogo global, read-only).
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  // Orden + filtro de categoría (espejo web FoodBrowser).
  const [sort, setSort] = useState<SortKey>('name')
  const [category, setCategory] = useState<string>('todos')
  // ID de la sesión del coach → distingue "Propio" (Star) vs "Global" (Globe) por fila.
  const [coachId, setCoachId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCoachId(data.user?.id ?? null)).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    try {
      setFoods(scope === 'all' ? await searchFoods(query) : await listCoachFoods())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [scope])
  // En catálogo global el filtrado es server-side → recargar al tipear.
  useEffect(() => {
    if (scope !== 'all') return
    const t = setTimeout(() => { searchFoods(query).then(setFoods).catch(() => {}) }, 300)
    return () => clearTimeout(t)
  }, [query, scope])

  // Categorías derivadas de los foods cargados (espejo web FoodBrowser): "Todas" + únicas ordenadas.
  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const f of foods) {
      const c = f.category?.trim()
      if (c) s.add(c)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [foods])

  // Si la categoría seleccionada ya no existe en el set actual (cambio de scope), volver a "Todas".
  useEffect(() => {
    if (category !== 'todos' && !categories.includes(category)) setCategory('todos')
  }, [categories, category])

  const filtered = useMemo(() => {
    let list = foods
    // En "míos" el filtro de texto es client-side; en "catálogo" ya viene server-side.
    if (scope !== 'all') {
      const q = query.trim().toLowerCase()
      if (q) list = list.filter((f) => f.name.toLowerCase().includes(q))
    }
    if (category !== 'todos') list = list.filter((f) => f.category?.trim() === category)
    // Orden (espejo web): nombre alfabético; kcal y proteína descendentes.
    return [...list].sort((a, b) => {
      if (sort === 'calories') return b.calories - a.calories
      if (sort === 'protein') return b.protein_g - a.protein_g
      return a.name.localeCompare(b.name)
    })
  }, [foods, query, scope, category, sort])

  function confirmDelete(food: FoodRow) {
    Alert.alert('Eliminar alimento', `¿Eliminar "${food.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        const r = await deleteFood(food.id)
        if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo eliminar.'); return }
        load()
      } },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando alimentos…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.back} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Volver</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Mis alimentos</Text>
        <TouchableOpacity onPress={() => setCreating(true)} activeOpacity={0.85} style={[styles.addBtn, { backgroundColor: theme.primary }]}>
          <Plus size={20} color={theme.primaryForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.scopeRow}>
        {(['mine', 'all'] as const).map((s) => {
          const on = scope === s
          return (
            <TouchableOpacity key={s} onPress={() => setScope(s)} activeOpacity={0.8}
              style={[styles.scopeChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
              <Text style={{ fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{s === 'mine' ? 'Míos' : 'Catálogo'}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Search size={16} color={theme.mutedForeground} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar alimento..." placeholderTextColor={theme.mutedForeground}
            style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]} autoCapitalize="none" />
          {query.length > 0 ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><X size={16} color={theme.mutedForeground} /></TouchableOpacity> : null}
        </View>
      </View>

      <View style={styles.sortRow}>
        <View style={styles.sortLabel}>
          <SlidersHorizontal size={12} color={theme.mutedForeground} />
          <Text style={[styles.sortLabelText, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Orden</Text>
        </View>
        {(['name', 'calories', 'protein'] as const).map((k) => {
          const on = sort === k
          return (
            <TouchableOpacity key={k} onPress={() => setSort(k)} activeOpacity={0.8}
              style={[styles.sortChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color: on ? theme.primaryForeground : theme.mutedForeground }}>
                {k === 'name' ? 'Nombre' : k === 'calories' ? 'Kcal' : 'Prot'}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catFilterScroll} contentContainerStyle={styles.catFilterRow}>
          {(['todos', ...categories] as const).map((cat) => {
            const on = category === cat
            return (
              <TouchableOpacity key={cat} onPress={() => setCategory(cat)} activeOpacity={0.8}
                style={[styles.catFilterChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{cat === 'todos' ? 'Todas' : cat}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      ) : null}

      <View style={{ flex: 1 }}>
        <FlashList
          data={filtered}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState icon={Apple} title={scope === 'all' ? 'Sin alimentos' : 'Sin alimentos propios'} subtitle={query || category !== 'todos' ? 'Sin resultados.' : 'Toca + para crear tu primer alimento.'} />
            </View>
          }
          renderItem={({ item }) => {
            // Espejo web FoodListCompact: coach_id == sesión → "Propio" (Star), si no → "Global" (Globe).
            // En scope "míos" la query ya devuelve solo alimentos del coach → siempre editables
            // (cubre el instante en que coachId aún no resolvió).
            const isMine = scope === 'mine' || (coachId != null && item.coach_id === coachId)
            const household = householdMeasureLabel(item)
            const cat = item.category?.trim()
            return (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={isMine ? 0.8 : 1} onPress={() => { if (isMine) setEditing(item) }}>
                  <View style={styles.foodNameRow}>
                    <Text style={[styles.foodName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{item.name}</Text>
                    {isMine
                      ? <Star size={13} color={theme.primary} fill={theme.primary + '4D'} />
                      : <Globe size={13} color={theme.mutedForeground} />}
                  </View>
                  <Text style={[styles.foodMacros, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {item.calories} kcal/100g · <Text style={{ color: theme.macro.protein }}>P</Text>{item.protein_g} <Text style={{ color: theme.macro.carbs }}>C</Text>{item.carbs_g} <Text style={{ color: theme.macro.fats }}>G</Text>{item.fats_g}
                  </Text>
                  <View style={styles.foodMetaRow}>
                    {cat ? (
                      <View style={[styles.metaBadge, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                        <Text style={{ fontSize: 10, fontFamily: 'Inter_600SemiBold', color: theme.mutedForeground }}>{cat}</Text>
                      </View>
                    ) : null}
                    {household ? (
                      <Text style={[styles.foodHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{household}</Text>
                    ) : item.serving_unit !== 'g' && item.serving_unit !== 'ml' && item.serving_size > 0 ? (
                      <Text style={[styles.foodHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>1 {item.serving_unit} ≈ {item.serving_size}g</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {isMine ? (
                  <>
                    <TouchableOpacity onPress={() => setEditing(item)} hitSlop={8} style={styles.iconBtn}><Pencil size={16} color={theme.mutedForeground} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8} style={styles.iconBtn}><Trash2 size={16} color={theme.destructive} /></TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.originText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Global</Text>
                )}
              </View>
            )
          }}
        />
      </View>

      <NativeDialog open={creating || !!editing} title={editing ? 'Editar alimento' : 'Nuevo alimento'} onClose={() => { setCreating(false); setEditing(null) }}>
        <FoodForm
          theme={theme}
          food={editing}
          onDone={() => { setCreating(false); setEditing(null); load() }}
          onCancel={() => { setCreating(false); setEditing(null) }}
        />
      </NativeDialog>
    </SafeAreaView>
  )
}

function FoodForm({ theme, food, onDone, onCancel }: { theme: any; food: FoodRow | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(food?.name ?? '')
  const [calories, setCalories] = useState(food ? String(food.calories) : '')
  const [protein, setProtein] = useState(food ? String(food.protein_g) : '')
  const [carbs, setCarbs] = useState(food ? String(food.carbs_g) : '')
  const [fats, setFats] = useState(food ? String(food.fats_g) : '')
  const [serving, setServing] = useState(food ? String(food.serving_size) : '100')
  const [unit, setUnit] = useState<FoodUnit>((food?.serving_unit as FoodUnit) ?? 'g')
  const [category, setCategory] = useState<string>(food?.category ?? 'otro')
  // Medida casera (espejo web): solo aplica con unidad 'g'. Se precarga al editar.
  const [householdLabel, setHouseholdLabel] = useState(food?.household_label ?? '')
  const [householdGrams, setHouseholdGrams] = useState(food?.household_grams != null ? String(food.household_grams) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cals = Number(calories) || 0
  const pNum = Number(protein) || 0
  const cNum = Number(carbs) || 0
  const fNum = Number(fats) || 0
  const pct = macroPreviewPct(cals, pNum, cNum, fNum)
  const showPreview = cals > 0 || pNum > 0 || cNum > 0 || fNum > 0

  async function submit() {
    setError(null)
    setSaving(true)
    const input = {
      name, calories: cals, protein_g: pNum, carbs_g: cNum,
      fats_g: fNum, serving_size: Number(serving) || 100, serving_unit: unit, category,
      household_label: householdLabel, household_grams: householdGrams === '' ? null : Number(householdGrams),
    }
    const r = food ? await updateFood(food.id, input) : await createCustomFood(input)
    setSaving(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    onDone()
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
      {error ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text> : null}
      <FField theme={theme} label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Pechuga de pollo" />
      <View style={[styles.helpBox, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
        <Text style={[styles.helpText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Las calorías y macros son <Text style={{ color: theme.foreground, fontFamily: 'Inter_600SemiBold' }}>por cada 100 gramos</Text> (como en una tabla nutricional). En el plan del alumno podés indicar la cantidad en gramos (ej. 200) o en unidades (ej. 1 huevo): para unidades, indicá cuántos gramos pesa una unidad.
        </Text>
      </View>
      <View style={styles.macroRow}>
        <FField theme={theme} center label="kcal" value={calories} onChangeText={setCalories} keyboardType="number-pad" />
        <FField theme={theme} center label="Prot" value={protein} onChangeText={setProtein} keyboardType="number-pad" />
        <FField theme={theme} center label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" />
        <FField theme={theme} center label="Gras" value={fats} onChangeText={setFats} keyboardType="number-pad" />
      </View>
      {showPreview ? (
        <View style={[styles.previewBox, { borderColor: theme.border }]}>
          <Text style={[styles.previewLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>% calorías aprox.</Text>
          <View style={[styles.previewBar, { backgroundColor: theme.secondary }]}>
            <View style={{ width: `${pct.p}%`, height: '100%', backgroundColor: theme.macro.protein }} />
            <View style={{ width: `${pct.c}%`, height: '100%', backgroundColor: theme.macro.carbs }} />
            <View style={{ width: `${pct.f}%`, height: '100%', backgroundColor: theme.macro.fats }} />
          </View>
          <Text style={[styles.previewText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            P {pct.p}% · C {pct.c}% · G {pct.f}%
          </Text>
        </View>
      ) : null}
      <View style={styles.servingRow}>
        <FField theme={theme} center label={unit === 'un' ? 'g por unidad' : 'Porción (g)'} value={serving} onChangeText={setServing} keyboardType="number-pad" />
        <View style={{ gap: 5 }}>
          <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Unidad</Text>
          <View style={[styles.unitWrap, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            {FOOD_UNITS.map((u) => (
              <TouchableOpacity key={u} onPress={() => setUnit(u)} activeOpacity={0.8} style={[styles.unitChip, unit === u && { backgroundColor: theme.primary }]}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: unit === u ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      <Text style={[styles.fHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {unit === 'un'
          ? 'Indicá cuántos gramos pesa 1 unidad (ej: huevo ≈ 60, manzana ≈ 150). Se usa para calcular macros proporcionales.'
          : 'Los macros de arriba son por 100g. Podés dejarlo en 100.'}
      </Text>

      {unit === 'g' ? (
        <View style={[styles.householdBox, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Medida casera (opcional)</Text>
          <View style={styles.householdRow}>
            <View style={{ flex: 1, gap: 5 }}>
              <TextInput value={householdLabel} onChangeText={setHouseholdLabel} placeholder="Ej: taza, cucharada, palma" placeholderTextColor={theme.mutedForeground} maxLength={30}
                style={[styles.fInput, { textAlign: 'left', borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]} />
            </View>
            <View style={{ width: 74, gap: 5 }}>
              <TextInput value={householdGrams} onChangeText={setHouseholdGrams} placeholder="g" placeholderTextColor={theme.mutedForeground} keyboardType="number-pad"
                style={[styles.fInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]} />
            </View>
          </View>
          <Text style={[styles.fHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            El alumno verá ej. <Text style={{ color: theme.foreground, fontFamily: 'Inter_600SemiBold' }}>120 g (1 taza)</Text>. Es solo una referencia aproximada; no cambia los macros.
          </Text>
        </View>
      ) : null}

      <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Categoría</Text>
      <View style={styles.catGrid}>
        {FOOD_CATEGORIES.map((c) => {
          const active = c === category
          return (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} activeOpacity={0.8}
              style={[styles.catChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '1A' : 'transparent' }]}>
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{c}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <View style={styles.formActions}>
        <TouchableOpacity onPress={onCancel} disabled={saving} style={[styles.cancelBtn, { borderColor: theme.border }]} activeOpacity={0.8}>
          <Text style={{ color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={submit} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]} activeOpacity={0.85}>
          <Text style={{ color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold', fontSize: 14 }}>{saving ? 'Guardando...' : food ? 'Guardar' : 'Crear'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function FField({ theme, label, center, ...rest }: any) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.mutedForeground}
        style={[styles.fInput, !center && { textAlign: 'left' }, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} {...rest} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 80 },
  backText: { fontSize: 13 },
  title: { fontSize: 16 },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scopeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  scopeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  sortRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, paddingHorizontal: 16, paddingBottom: 8 },
  sortLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortLabelText: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  sortChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  catFilterScroll: { flexGrow: 0, paddingBottom: 8 },
  catFilterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  catFilterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1 },
  foodNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  foodName: { fontSize: 14, flexShrink: 1 },
  foodMacros: { fontSize: 12, marginTop: 3 },
  foodMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  foodHint: { fontSize: 11 },
  metaBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  originText: { fontSize: 11 },
  iconBtn: { padding: 4 },
  helpBox: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  helpText: { fontSize: 12, lineHeight: 17 },
  previewBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  previewLabel: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  previewBar: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden' },
  previewText: { fontSize: 12 },
  householdBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  householdRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  fHint: { fontSize: 11, lineHeight: 16 },
  macroRow: { flexDirection: 'row', gap: 8 },
  servingRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  fLabel: { fontSize: 12 },
  fInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 15, textAlign: 'center' },
  unitWrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  catChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
