import { forwardRef, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetFlatList, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { AlertTriangle, Plus, Search, Star } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { MACRO_COLORS } from '../MacroRingSummary'
import {
  FOOD_CATEGORIES,
  FOOD_UNITS,
  createCustomFood,
  searchFoods,
  type FoodRow,
  type FoodScope,
  type FoodUnit,
} from '../../lib/nutrition-builder'

const CATEGORY_FILTERS = ['todos', ...FOOD_CATEGORIES] as const
const SCOPE_FILTERS: { key: FoodScope; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'system', label: 'Sistema' },
  { key: 'mine', label: 'Míos' },
]

interface Props {
  onSelect: (food: FoodRow) => void
  /** Oculta estos alimentos (p. ej. el base + swaps ya agregados). */
  excludedIds?: string[]
  /** Resalta ★ y ordena arriba los favoritos del alumno. */
  favoriteIds?: Set<string>
  /** ALERGIA del alumno — badge rojo + confirmación BLOQUEANTE al elegir (correctness de salud). */
  allergyIds?: Set<string>
  /** INTOLERANCIA del alumno — badge ámbar de aviso (no bloquea). */
  intoleranceIds?: Set<string>
  /** "No le gusta" — badge gris de aviso blando (no bloquea). */
  dislikeIds?: Set<string>
  /** Título opcional del header (p. ej. "Agregar alternativa"). */
  title?: string
}

export const FoodSearchSheet = forwardRef<BottomSheetModal, Props>(function FoodSearchSheet({ onSelect, excludedIds, favoriteIds, allergyIds, intoleranceIds, dislikeIds, title }, ref) {
  const { theme } = useTheme()
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string>('todos')
  const [scope, setScope] = useState<FoodScope>('all')
  // Alimento alérgeno pendiente de confirmación deliberada (bloquea el pick). Espejo del web.
  const [allergyConfirm, setAllergyConfirm] = useState<FoodRow | null>(null)
  const snapPoints = useMemo(() => ['75%', '95%'], [])

  const displayed = useMemo(() => {
    const ex = excludedIds && excludedIds.length ? new Set(excludedIds) : null
    let list = ex ? results.filter((r) => !ex.has(r.id)) : results
    // Rank de afinidad (espejo del web FoodSearchDrawer): favorito arriba, alergia/dislike abajo.
    const hasAny = (favoriteIds?.size || allergyIds?.size || intoleranceIds?.size || dislikeIds?.size) ?? 0
    if (hasAny) {
      const rank = (id: string): number => {
        if (allergyIds?.has(id)) return -2
        if (favoriteIds?.has(id)) return 2
        if (intoleranceIds?.has(id) || dislikeIds?.has(id)) return -1
        return 0
      }
      list = [...list].sort((a, b) => rank(b.id) - rank(a.id))
    }
    return list
  }, [results, excludedIds, favoriteIds, allergyIds, intoleranceIds, dislikeIds])

  const run = useCallback(async (text: string, cat: string = category, sc: FoodScope = scope) => {
    setQuery(text)
    setLoading(true)
    setResults(await searchFoods(text, { category: cat, scope: sc }))
    setLoading(false)
  }, [category, scope])

  function applyCategory(cat: string) { setCategory(cat); run(query, cat, scope) }
  function applyScope(sc: FoodScope) { setScope(sc); run(query, category, sc) }

  function pick(food: FoodRow) {
    setAllergyConfirm(null)
    onSelect(food)
    ;(ref as React.RefObject<BottomSheetModal>).current?.dismiss()
  }

  // Intercepta el pick: si el alimento es alérgeno del alumno, exige confirmación deliberada.
  function attemptPick(food: FoodRow) {
    if (allergyIds?.has(food.id)) { setAllergyConfirm(food); return }
    pick(food)
  }

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onChange={(i) => { if (i >= 0 && mode === 'search' && results.length === 0 && query.length === 0) run('') }}
      onDismiss={() => { setMode('search'); setAllergyConfirm(null) }}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      {mode === 'search' ? (
        <>
          {title ? <Text style={[styles.sheetTitle, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{title}</Text> : null}
          <View style={styles.headerRow}>
            <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
              <Search size={16} color={theme.mutedForeground} />
              <TextInput value={query} onChangeText={run} placeholder="Buscar alimento..." placeholderTextColor={theme.mutedForeground}
                style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]} autoFocus autoCapitalize="none" />
              {loading && <ActivityIndicator size="small" color={theme.primary} />}
            </View>
            <TouchableOpacity onPress={() => setMode('create')} activeOpacity={0.85} style={[styles.createBtn, { backgroundColor: theme.primary }]}>
              <Plus size={18} color={theme.primaryForeground} />
            </TouchableOpacity>
          </View>

          {/* P5: filtros — scope (Sistema/Míos) + categoría */}
          <View style={styles.scopeRow}>
            {SCOPE_FILTERS.map((s) => {
              const active = scope === s.key
              return (
                <TouchableOpacity key={s.key} onPress={() => applyScope(s.key)} activeOpacity={0.8}
                  style={[styles.scopeChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '14' : 'transparent' }]}>
                  <Text style={{ fontSize: 12, fontFamily: 'HankenGrotesk_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{s.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
            {CATEGORY_FILTERS.map((c) => {
              const active = category === c
              return (
                <TouchableOpacity key={c} onPress={() => applyCategory(c)} activeOpacity={0.8}
                  style={[styles.catFilterChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '14' : 'transparent' }]}>
                  <Text style={{ fontSize: 12, fontFamily: 'HankenGrotesk_600SemiBold', color: active ? theme.primary : theme.mutedForeground, textTransform: 'capitalize' }}>{c}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <BottomSheetFlatList
            data={displayed}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={!loading ? (
              <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {query.length >= 2 ? `Sin resultados. Toca + para crear "${query}".` : 'Escribe para buscar, o toca + para crear.'}
              </Text>
            ) : null}
            renderItem={({ item }) => {
              const fav = favoriteIds?.has(item.id)
              // Prioridad de restricción (espejo del web): alergia > intolerancia > no le gusta.
              const isAllergy = allergyIds?.has(item.id) ?? false
              const isIntolerance = !isAllergy && (intoleranceIds?.has(item.id) ?? false)
              const isDislike = !isAllergy && !isIntolerance && (dislikeIds?.has(item.id) ?? false)
              const rowBorder = isAllergy ? theme.destructive + '66' : fav ? theme.primary + '66' : theme.border
              const rowBg = isAllergy ? theme.destructive + '12' : fav ? theme.primary + '0D' : 'transparent'
              return (
                <TouchableOpacity testID="food-search-result" style={[styles.row, { borderColor: rowBorder, backgroundColor: rowBg }]} onPress={() => attemptPick(item)} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      {fav ? <Star size={13} color={theme.primary} fill={theme.primary} /> : null}
                      <Text style={[styles.foodName, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]} numberOfLines={1}>
                        {item.name}{item.brand ? ` · ${item.brand}` : ''}
                      </Text>
                      {isAllergy ? (
                        <View testID="food-allergy-badge" className="bg-danger-100 rounded-md" style={styles.restrictBadge}>
                          <AlertTriangle size={11} color={theme.destructive} />
                          <Text className="text-danger-600" style={styles.restrictBadgeText}>Alergia</Text>
                        </View>
                      ) : isIntolerance ? (
                        <View testID="food-intolerance-badge" className="bg-warning-100 rounded-md" style={styles.restrictBadge}>
                          <Text className="text-warning-600" style={styles.restrictBadgeText}>Intolerancia</Text>
                        </View>
                      ) : isDislike ? (
                        <View testID="food-dislike-badge" className="bg-ink-100 rounded-md" style={styles.restrictBadge}>
                          <Text className="text-muted" style={styles.restrictBadgeText}>No le gusta</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.macroLine}>
                      <Text style={[styles.macroSeg, { color: MACRO_COLORS.kcal }]}>{item.calories} kcal</Text>
                      <Text style={[styles.macroSeg, { color: MACRO_COLORS.protein }]}>P{item.protein_g}</Text>
                      <Text style={[styles.macroSeg, { color: MACRO_COLORS.carbs }]}>C{item.carbs_g}</Text>
                      <Text style={[styles.macroSeg, { color: MACRO_COLORS.fats }]}>G{item.fats_g}</Text>
                      <Text style={[styles.macroServing, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>/ {item.serving_size}{item.serving_unit}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            }}
          />
        </>
      ) : (
        <CreateFoodForm
          theme={theme}
          initialName={query}
          onCancel={() => setMode('search')}
          onCreated={(food) => pick(food)}
        />
      )}

      {/* Confirmación BLOQUEANTE de alérgeno (correctness de salud) — espejo del web:
          solo la ALERGIA bloquea; el override es deliberado ("Agregar igual"). */}
      {allergyConfirm ? (
        <View style={styles.allergyOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setAllergyConfirm(null)} />
          <View className="bg-surface-card border border-danger-500/40" style={styles.allergyCard}>
            <View style={styles.allergyTitleRow}>
              <AlertTriangle size={18} color={theme.destructive} />
              <Text className="text-danger-600" style={styles.allergyTitle}>Posible alérgeno</Text>
            </View>
            <Text className="text-body" style={[styles.allergyBody, { color: theme.foreground }]}>
              Este alumno marcó <Text style={{ fontFamily: 'Archivo_700Bold' }}>{allergyConfirm.name}</Text> como alergia. Agregarlo a su plan puede ser peligroso.
            </Text>
            <View style={styles.allergyActions}>
              <TouchableOpacity testID="allergy-cancel" onPress={() => setAllergyConfirm(null)} activeOpacity={0.8}
                style={[styles.allergyBtn, { borderWidth: 1, borderColor: theme.border }]}>
                <Text style={{ color: theme.foreground, fontFamily: 'HankenGrotesk_600SemiBold', fontSize: 14 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="allergy-confirm" onPress={() => pick(allergyConfirm)} activeOpacity={0.85}
                style={[styles.allergyBtn, { backgroundColor: theme.destructive }]}>
                <Text style={{ color: theme.primaryForeground, fontFamily: 'Archivo_700Bold', fontSize: 14 }}>Agregar igual</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </BottomSheetModal>
  )
})

function CreateFoodForm({ theme, initialName, onCancel, onCreated }: { theme: any; initialName: string; onCancel: () => void; onCreated: (f: FoodRow) => void }) {
  const [name, setName] = useState(initialName)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  const [serving, setServing] = useState('100')
  const [unit, setUnit] = useState<FoodUnit>('g')
  const [category, setCategory] = useState<string>('otro')
  // Medida casera (household) — solo aplica a gramos (en 'un'/'ml' la unidad ya es la medida).
  const [householdLabel, setHouseholdLabel] = useState('')
  const [householdGrams, setHouseholdGrams] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setSaving(true)
    const res = await createCustomFood({
      name,
      calories: Number(calories) || 0,
      protein_g: Number(protein) || 0,
      carbs_g: Number(carbs) || 0,
      fats_g: Number(fats) || 0,
      serving_size: Number(serving) || 100,
      serving_unit: unit,
      category,
      household_label: unit === 'g' ? householdLabel : null,
      household_grams: unit === 'g' ? Number(householdGrams) || null : null,
    })
    setSaving(false)
    if (!res.ok || !res.food) { setError(res.error ?? 'No se pudo crear.'); return }
    onCreated(res.food)
  }

  return (
    <BottomSheetScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <View style={styles.formHeader}>
        <Text style={[styles.formTitle, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>Nuevo alimento</Text>
        <TouchableOpacity onPress={onCancel} activeOpacity={0.7}><Text style={{ color: theme.primary, fontFamily: 'HankenGrotesk_600SemiBold', fontSize: 14 }}>Buscar</Text></TouchableOpacity>
      </View>

      {error ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text> : null}

      <FField theme={theme} label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Pechuga de pollo" />
      <View style={styles.macroRow}>
        <FField theme={theme} center label="kcal" value={calories} onChangeText={setCalories} keyboardType="number-pad" />
        <FField theme={theme} center label="Prot" value={protein} onChangeText={setProtein} keyboardType="number-pad" />
        <FField theme={theme} center label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" />
        <FField theme={theme} center label="Gras" value={fats} onChangeText={setFats} keyboardType="number-pad" />
      </View>
      <View style={styles.servingRow}>
        <FField theme={theme} center label="Porción" value={serving} onChangeText={setServing} keyboardType="number-pad" />
        <View style={{ gap: 5 }}>
          <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Unidad</Text>
          <View style={[styles.unitWrap, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            {FOOD_UNITS.map((u) => (
              <TouchableOpacity key={u} onPress={() => setUnit(u)} activeOpacity={0.8} style={[styles.unitChip, unit === u && { backgroundColor: theme.primary }]}>
                <Text style={{ fontSize: 12, fontFamily: 'HankenGrotesk_600SemiBold', color: unit === u ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Categoría</Text>
      <View style={styles.catGrid}>
        {FOOD_CATEGORIES.map((c) => {
          const active = c === category
          return (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} activeOpacity={0.8}
              style={[styles.catChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '1A' : 'transparent' }]}>
              <Text style={{ fontSize: 12, fontFamily: 'HankenGrotesk_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{c}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Medida casera (household) — espejo del web: solo con unidad gramos. */}
      {unit === 'g' ? (
        <View className="border border-subtle bg-surface-sunken rounded-control" style={styles.householdBox}>
          <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Medida casera (opcional)</Text>
          <View style={styles.householdRow}>
            <TextInput
              testID="household-label"
              value={householdLabel}
              onChangeText={setHouseholdLabel}
              placeholder="Ej: taza, cucharada, palma"
              placeholderTextColor={theme.mutedForeground}
              maxLength={30}
              style={[styles.fInput, { flex: 1, textAlign: 'left', borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]}
            />
            <TextInput
              testID="household-grams"
              value={householdGrams}
              onChangeText={setHouseholdGrams}
              placeholder="g"
              placeholderTextColor={theme.mutedForeground}
              keyboardType="number-pad"
              style={[styles.fInput, { width: 76, borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]}
            />
          </View>
          <Text style={[styles.householdHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            El alumno verá ej. 120 g (1 taza). Es solo una referencia; no cambia los macros.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity onPress={submit} disabled={saving} activeOpacity={0.85} style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
        {saving ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : (
          <Text style={[styles.submitText, { color: theme.primaryForeground, fontFamily: 'Archivo_700Bold' }]}>Crear y agregar</Text>
        )}
      </TouchableOpacity>
    </BottomSheetScrollView>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15 },
  createBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 6 },
  empty: { textAlign: 'center', fontSize: 14, marginTop: 24, paddingHorizontal: 16 },
  sheetTitle: { fontSize: 15, marginHorizontal: 16, marginBottom: 8 },
  scopeRow: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginBottom: 8 },
  scopeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  catScroll: { flexGrow: 0, maxHeight: 36, marginBottom: 10 },
  catRow: { paddingHorizontal: 16, gap: 6, alignItems: 'center' },
  catFilterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  row: { paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderRadius: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  restrictBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  restrictBadgeText: { fontSize: 10, fontFamily: 'HankenGrotesk_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.4 },
  allergyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.55)' },
  allergyCard: { width: '100%', maxWidth: 360, borderRadius: 18, padding: 18, gap: 4 },
  allergyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allergyTitle: { fontSize: 12, fontFamily: 'Archivo_700Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  allergyBody: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  allergyActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  allergyBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  householdBox: { padding: 12, gap: 8 },
  householdRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  householdHint: { fontSize: 11, lineHeight: 15 },
  foodName: { fontSize: 14, flexShrink: 1 },
  macroLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  macroSeg: { fontSize: 12, fontFamily: 'JetBrainsMono_500Medium' },
  macroServing: { fontSize: 12 },
  form: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formTitle: { fontSize: 17 },
  macroRow: { flexDirection: 'row', gap: 8 },
  servingRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  fLabel: { fontSize: 12 },
  fInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 15, textAlign: 'center' },
  unitWrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  catChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  submitBtn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  submitText: { fontSize: 15 },
})
