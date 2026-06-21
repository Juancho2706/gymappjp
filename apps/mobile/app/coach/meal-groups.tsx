import { useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { Apple, ChevronLeft, LayoutGrid, Pencil, Plus, Search, Trash2, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { EmptyState, NativeDialog } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { searchFoods, type FoodRow } from '../../lib/nutrition-builder'
import {
  calculateGroupTotals,
  deleteMealGroup,
  listMealGroups,
  saveMealGroup,
  type MealGroup,
  type MealGroupItem,
} from '../../lib/meal-groups'

export default function CoachMealGroupsScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [groups, setGroups] = useState<MealGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<MealGroup | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setGroups(await listMealGroups())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups
  }, [groups, query])

  function confirmDelete(group: MealGroup) {
    Alert.alert('Eliminar grupo', `¿Eliminar "${group.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const r = await deleteMealGroup(group.id)
          if (!r.ok) {
            Alert.alert('Error', r.error ?? 'No se pudo eliminar.')
            return
          }
          setGroups((prev) => prev.filter((g) => g.id !== group.id))
        },
      },
    ])
  }

  function onSaved(saved: MealGroup) {
    setGroups((prev) => {
      const exists = prev.some((g) => g.id === saved.id)
      const next = exists ? prev.map((g) => (g.id === saved.id ? saved : g)) : [...prev, saved]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
    setCreating(false)
    setEditing(null)
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando grupos…" />
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
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Grupos de alimentos</Text>
        <TouchableOpacity onPress={() => setCreating(true)} activeOpacity={0.85} style={[styles.addBtn, { backgroundColor: theme.primary }]}>
          <Plus size={20} color={theme.primaryForeground} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Search size={16} color={theme.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar grupos..."
            placeholderTextColor={theme.mutedForeground}
            style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <X size={16} color={theme.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <FlashList
          data={filtered}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState
                icon={LayoutGrid}
                title={query ? 'Sin resultados' : 'Sin grupos aún'}
                subtitle={query ? 'Probá otro nombre.' : 'Toca + para crear tu primer grupo de alimentos.'}
              />
            </View>
          }
          renderItem={({ item }) => {
            const totals = calculateGroupTotals(item.items)
            const preview = item.items.slice(0, 3)
            const extra = item.items.length - preview.length
            return (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.groupName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.groupMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                      {item.items.length} {item.items.length === 1 ? 'ingrediente' : 'ingredientes'}
                    </Text>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => setEditing(item)} hitSlop={8} style={styles.iconBtn}>
                      <Pencil size={16} color={theme.mutedForeground} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8} style={styles.iconBtn}>
                      <Trash2 size={16} color={theme.destructive} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.macroGrid}>
                  <MacroCell theme={theme} label="Cal" value={`${Math.round(totals.calories)}`} />
                  <MacroCell theme={theme} label="Prot" value={`${Math.round(totals.protein)}g`} />
                  <MacroCell theme={theme} label="Carb" value={`${Math.round(totals.carbs)}g`} />
                  <MacroCell theme={theme} label="Fat" value={`${Math.round(totals.fats)}g`} />
                </View>

                {preview.length > 0 ? (
                  <View style={styles.chipWrap}>
                    {preview.map((it) => (
                      <View key={it.id ?? it.food_id} style={[styles.foodChip, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                        <Text numberOfLines={1} style={[styles.foodChipText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                          {it.food.name}
                        </Text>
                      </View>
                    ))}
                    {extra > 0 ? (
                      <View style={[styles.foodChip, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                        <Text style={[styles.foodChipText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>+{extra} más</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )
          }}
        />
      </View>

      <NativeDialog
        open={creating || !!editing}
        title={editing ? 'Editar grupo' : 'Nuevo grupo de alimentos'}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      >
        <MealGroupForm
          theme={theme}
          group={editing}
          onSaved={onSaved}
          onCancel={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      </NativeDialog>
    </SafeAreaView>
  )
}

function MacroCell({ theme, label, value }: { theme: any; label: string; value: string }) {
  return (
    <View style={[styles.macroCell, { borderColor: theme.border }]}>
      <Text style={[styles.macroLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <Text style={[styles.macroValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
    </View>
  )
}

// ── Form (crear/editar) ─────────────────────────────────────────────────────

type DraftItem = { food_id: string; quantity: number; unit: 'g' | 'un'; food: FoodRow }

function MealGroupForm({
  theme,
  group,
  onSaved,
  onCancel,
}: {
  theme: any
  group: MealGroup | null
  onSaved: (g: MealGroup) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [items, setItems] = useState<DraftItem[]>(
    (group?.items ?? []).map((it) => ({
      food_id: it.food_id,
      quantity: Number(it.quantity) || 0,
      unit: (it.unit === 'un' ? 'un' : 'g') as 'g' | 'un',
      food: {
        id: it.food.id,
        name: it.food.name,
        calories: it.food.calories,
        protein_g: it.food.protein_g,
        carbs_g: it.food.carbs_g,
        fats_g: it.food.fats_g,
        serving_size: it.food.serving_size,
        serving_unit: it.food.serving_unit ?? 'g',
        is_liquid: false,
        category: null,
        brand: null,
      },
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<FoodRow[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!showSearch) return
    let alive = true
    setSearching(true)
    const t = setTimeout(() => {
      searchFoods(searchQuery)
        .then((r) => {
          if (alive) setResults(r)
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setSearching(false)
        })
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [searchQuery, showSearch])

  const totals = useMemo(() => {
    const mapped: MealGroupItem[] = items.map((it) => ({
      food_id: it.food_id,
      quantity: it.quantity,
      unit: it.unit,
      food: {
        id: it.food.id,
        name: it.food.name,
        calories: it.food.calories,
        protein_g: it.food.protein_g,
        carbs_g: it.food.carbs_g,
        fats_g: it.food.fats_g,
        serving_size: it.food.serving_size,
        serving_unit: it.food.serving_unit,
      },
    }))
    return calculateGroupTotals(mapped)
  }, [items])

  function addFood(food: FoodRow) {
    setItems((prev) => [...prev, { food_id: food.id, quantity: 100, unit: 'g', food }])
    setShowSearch(false)
    setSearchQuery('')
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }
  function updateQuantity(index: number, raw: string) {
    const q = Number(raw.replace(',', '.')) || 0
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, quantity: q } : it)))
  }
  function updateUnit(index: number, unit: 'g' | 'un') {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it
        let quantity = it.quantity
        if (unit === 'un' && it.quantity === 100) quantity = 1
        else if (unit === 'g' && it.quantity === 1) quantity = 100
        return { ...it, unit, quantity }
      })
    )
  }

  async function submit() {
    setError(null)
    if (!name.trim()) {
      setError('Indicá un nombre para el grupo.')
      return
    }
    if (items.length === 0) {
      setError('Agregá al menos un ingrediente.')
      return
    }
    setSaving(true)
    const r = await saveMealGroup({
      id: group?.id,
      name: name.trim(),
      items: items.map((it) => ({ food_id: it.food_id, quantity: it.quantity, unit: it.unit })),
    })
    setSaving(false)
    if (!r.ok || !r.group) {
      setError(r.error ?? 'No se pudo guardar.')
      return
    }
    onSaved(r.group)
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 14 }}>
      {error ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text> : null}

      <View style={{ gap: 6 }}>
        <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Nombre del grupo</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej: Desayuno proteico 1"
          placeholderTextColor={theme.mutedForeground}
          style={[styles.fInput, { textAlign: 'left', borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
        />
      </View>

      <View style={styles.itemsHead}>
        <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Ingredientes</Text>
        <TouchableOpacity onPress={() => setShowSearch((s) => !s)} activeOpacity={0.8} style={[styles.addFoodBtn, { borderColor: theme.primary }]}>
          <Plus size={14} color={theme.primary} />
          <Text style={{ color: theme.primary, fontFamily: 'Montserrat_700Bold', fontSize: 12 }}>Agregar alimento</Text>
        </TouchableOpacity>
      </View>

      {showSearch ? (
        <View style={[styles.searchPanel, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <Search size={16} color={theme.mutedForeground} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar alimento..."
              placeholderTextColor={theme.mutedForeground}
              autoFocus
              autoCapitalize="none"
              style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            />
          </View>
          <View style={{ maxHeight: 200 }}>
            {searching ? (
              <Text style={[styles.searchHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Buscando…</Text>
            ) : results.length === 0 ? (
              <Text style={[styles.searchHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {searchQuery.trim().length >= 2 ? 'Sin resultados.' : 'Escribí para buscar.'}
              </Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 8 }}>
                {results.map((f) => (
                  <TouchableOpacity key={f.id} onPress={() => addFood(f)} activeOpacity={0.8} style={[styles.resultRow, { borderColor: theme.border }]}>
                    <Apple size={14} color={theme.primary} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.resultName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{f.name}</Text>
                      <Text style={[styles.resultMacros, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                        {f.calories} kcal · P{f.protein_g} C{f.carbs_g} G{f.fats_g} / {f.serving_size}{f.serving_unit}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      ) : null}

      {items.length === 0 ? (
        <Text style={[styles.searchHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>No hay ingredientes aún.</Text>
      ) : (
        items.map((it, index) => (
          <View key={`${it.food_id}-${index}`} style={[styles.itemRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.itemName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{it.food.name}</Text>
              <Text style={[styles.itemMacros, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {macroPreview(it)}
              </Text>
            </View>
            <View style={styles.itemControls}>
              <View style={[styles.unitWrap, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                {(['g', 'un'] as const).map((u) => (
                  <TouchableOpacity key={u} onPress={() => updateUnit(index, u)} activeOpacity={0.8} style={[styles.unitChip, it.unit === u && { backgroundColor: theme.primary }]}>
                    <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: it.unit === u ? theme.primaryForeground : theme.mutedForeground }}>{u === 'g' ? 'G' : 'U'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={it.quantity ? String(it.quantity) : ''}
                onChangeText={(v) => updateQuantity(index, v)}
                keyboardType="decimal-pad"
                style={[styles.qtyInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
              />
              <TouchableOpacity onPress={() => removeItem(index)} hitSlop={8} style={styles.iconBtn}>
                <Trash2 size={16} color={theme.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <View style={[styles.totalsBox, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
        <MacroCell theme={theme} label="Cal" value={`${Math.round(totals.calories)}`} />
        <MacroCell theme={theme} label="Prot" value={`${Math.round(totals.protein)}g`} />
        <MacroCell theme={theme} label="Carb" value={`${Math.round(totals.carbs)}g`} />
        <MacroCell theme={theme} label="Fat" value={`${Math.round(totals.fats)}g`} />
      </View>

      <View style={styles.formActions}>
        <TouchableOpacity onPress={onCancel} disabled={saving} style={[styles.cancelBtn, { borderColor: theme.border }]} activeOpacity={0.8}>
          <Text style={{ color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={submit} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]} activeOpacity={0.85}>
          <Text style={{ color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold', fontSize: 14 }}>{saving ? 'Guardando...' : group ? 'Guardar' : 'Crear grupo'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function macroPreview(it: DraftItem): string {
  const factor = it.unit === 'g' ? it.quantity / 100 : it.quantity * (it.food.serving_size || 100) / 100
  const cal = Math.round((it.food.calories || 0) * factor)
  const p = Math.round((it.food.protein_g || 0) * factor)
  const c = Math.round((it.food.carbs_g || 0) * factor)
  const g = Math.round((it.food.fats_g || 0) * factor)
  return `${cal} kcal · P${p} C${c} G${g}`
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 80 },
  backText: { fontSize: 13 },
  title: { fontSize: 16 },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  card: { padding: 16, borderWidth: 1, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardActions: { flexDirection: 'row', gap: 4 },
  groupName: { fontSize: 16 },
  groupMeta: { fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 4 },
  macroGrid: { flexDirection: 'row', gap: 8 },
  macroCell: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', gap: 2 },
  macroLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  macroValue: { fontSize: 14 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  foodChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 160 },
  foodChipText: { fontSize: 11 },
  // form
  fLabel: { fontSize: 12 },
  fInput: { height: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  itemsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addFoodBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  searchPanel: { borderWidth: 1, borderRadius: 14, padding: 10 },
  searchHint: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  resultName: { fontSize: 13.5 },
  resultMacros: { fontSize: 11, marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  itemName: { fontSize: 14 },
  itemMacros: { fontSize: 11, marginTop: 3 },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unitWrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  unitChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8 },
  qtyInput: { width: 58, height: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, fontSize: 14, textAlign: 'center' },
  totalsBox: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
