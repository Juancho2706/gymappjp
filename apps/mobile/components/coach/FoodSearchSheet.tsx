import { forwardRef, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetFlatList, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Plus, Search } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  FOOD_CATEGORIES,
  FOOD_UNITS,
  createCustomFood,
  searchFoods,
  type FoodRow,
  type FoodUnit,
} from '../../lib/nutrition-builder'

interface Props {
  onSelect: (food: FoodRow) => void
}

export const FoodSearchSheet = forwardRef<BottomSheetModal, Props>(function FoodSearchSheet({ onSelect }, ref) {
  const { theme } = useTheme()
  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [loading, setLoading] = useState(false)
  const snapPoints = useMemo(() => ['75%', '95%'], [])

  const run = useCallback(async (text: string) => {
    setQuery(text)
    setLoading(true)
    setResults(await searchFoods(text))
    setLoading(false)
  }, [])

  function pick(food: FoodRow) {
    onSelect(food)
    ;(ref as React.RefObject<BottomSheetModal>).current?.dismiss()
  }

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      onChange={(i) => { if (i >= 0 && mode === 'search' && results.length === 0 && query.length === 0) run('') }}
      onDismiss={() => setMode('search')}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      {mode === 'search' ? (
        <>
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

          <BottomSheetFlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={!loading ? (
              <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {query.length >= 2 ? `Sin resultados. Toca + para crear "${query}".` : 'Escribí para buscar, o toca + para crear.'}
              </Text>
            ) : null}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.row, { borderColor: theme.border }]} onPress={() => pick(item)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                    {item.name}{item.brand ? ` · ${item.brand}` : ''}
                  </Text>
                  <Text style={[styles.foodMacros, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {item.calories} kcal · P{item.protein_g} C{item.carbs_g} G{item.fats_g} / {item.serving_size}{item.serving_unit}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
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
    })
    setSaving(false)
    if (!res.ok || !res.food) { setError(res.error ?? 'No se pudo crear.'); return }
    onCreated(res.food)
  }

  return (
    <BottomSheetScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <View style={styles.formHeader}>
        <Text style={[styles.formTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Nuevo alimento</Text>
        <TouchableOpacity onPress={onCancel} activeOpacity={0.7}><Text style={{ color: theme.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Buscar</Text></TouchableOpacity>
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
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: unit === u ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
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
              <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{c}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <TouchableOpacity onPress={submit} disabled={saving} activeOpacity={0.85} style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
        {saving ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : (
          <Text style={[styles.submitText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>Crear y agregar</Text>
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
  row: { paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderRadius: 10 },
  foodName: { fontSize: 14 },
  foodMacros: { fontSize: 12, marginTop: 3 },
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
