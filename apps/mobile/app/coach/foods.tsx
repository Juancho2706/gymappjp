import { useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { Apple, ChevronLeft, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { EmptyState, NativeDialog } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import {
  FOOD_CATEGORIES,
  FOOD_UNITS,
  createCustomFood,
  deleteFood,
  listCoachFoods,
  searchFoods,
  updateFood,
  type FoodRow,
  type FoodUnit,
} from '../../lib/nutrition-builder'

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

  const filtered = useMemo(() => {
    if (scope === 'all') return foods
    const q = query.trim().toLowerCase()
    return q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
  }, [foods, query, scope])

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

      <View style={{ flex: 1 }}>
        <FlashList
          data={filtered}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState icon={Apple} title="Sin alimentos propios" subtitle={query ? 'Sin resultados.' : 'Toca + para crear tu primer alimento.'} />
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={scope === 'mine' ? 0.8 : 1} onPress={() => { if (scope === 'mine') setEditing(item) }}>
                <Text style={[styles.foodName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.foodMacros, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {item.calories} kcal · P{item.protein_g} C{item.carbs_g} G{item.fats_g} / {item.serving_size}{item.serving_unit}
                </Text>
              </TouchableOpacity>
              {scope === 'mine' ? (
                <>
                  <TouchableOpacity onPress={() => setEditing(item)} hitSlop={8} style={styles.iconBtn}><Pencil size={16} color={theme.mutedForeground} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8} style={styles.iconBtn}><Trash2 size={16} color={theme.destructive} /></TouchableOpacity>
                </>
              ) : (
                <Text style={[styles.foodMacros, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Catálogo</Text>
              )}
            </View>
          )}
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setSaving(true)
    const input = {
      name, calories: Number(calories) || 0, protein_g: Number(protein) || 0, carbs_g: Number(carbs) || 0,
      fats_g: Number(fats) || 0, serving_size: Number(serving) || 100, serving_unit: unit, category,
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
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1 },
  foodName: { fontSize: 14 },
  foodMacros: { fontSize: 12, marginTop: 3 },
  iconBtn: { padding: 4 },
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
