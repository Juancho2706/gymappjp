import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ChevronLeft, Layers, PencilLine, Plus, Search, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Badge, Button, Dialog, EmptyState, Input } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { FoodSearchSheet } from '../../components/coach/FoodSearchSheet'
import { FONT } from '../../lib/typography'
import { SHADOWS, type Scheme } from '../../lib/shadows'
import type { FoodRow } from '../../lib/nutrition-builder'
import {
  deleteMealGroup,
  listMealGroups,
  mealGroupItemMacros,
  mealGroupTotals,
  saveMealGroup,
  type MealGroupItem,
  type MealGroupRow,
} from '../../lib/meal-groups'

/**
 * E5-18 · Grupos de comidas (lado COACH) — espejo de la web
 * `apps/web/src/app/coach/meal-groups/*` (MealGroupLibraryClient + MealGroupModal).
 *
 * Librería de conjuntos reutilizables de alimentos (ej. "Desayuno proteico"). El
 * coach los crea/edita/borra acá y los aplica como comida en el builder. El editor
 * vive INLINE (no en un RN Modal) para que el FoodSearchSheet (bottom-sheet) se
 * presente por encima sin conflicto de portales — mismo patrón que el builder.
 */

// Unidades ofrecidas por alimento (líquido → ml/un; sólido → g/un) — 1:1 builder.
function unitsForItem(item: MealGroupItem): string[] {
  const liquid = !!item.food?.is_liquid || item.food?.serving_unit === 'ml'
  const base = liquid ? ['ml', 'un'] : ['g', 'un']
  return base.includes(item.unit) ? base : [item.unit, ...base.filter((u) => u !== item.unit)]
}

export default function CoachMealGroupsScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const foodSheetRef = useRef<BottomSheetModal>(null)

  const [groups, setGroups] = useState<MealGroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  // 'list' | 'edit' — el editor es una vista inline (no un Modal), ver nota de arriba.
  const [mode, setMode] = useState<'list' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [items, setItems] = useState<MealGroupItem[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MealGroupRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setGroups(await listMealGroups())
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups
  }, [groups, query])

  function openCreate() {
    setEditingId(null)
    setName('')
    setItems([])
    setMode('edit')
  }
  function openEdit(group: MealGroupRow) {
    setEditingId(group.id)
    setName(group.name)
    setItems(group.items.map((i) => ({ ...i })))
    setMode('edit')
  }
  function cancelEdit() {
    setMode('list')
    setEditingId(null)
    setName('')
    setItems([])
  }

  function addFood(food: FoodRow) {
    setItems((prev) => [
      ...prev,
      {
        food_id: food.id,
        quantity: food.serving_size || 100,
        unit: food.serving_unit || 'g',
        food,
      },
    ])
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }
  function updateQty(index: number, qty: number) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, quantity: qty } : it)))
  }
  function updateUnit(index: number, unit: string) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it
        // Al pasar a unidades default 1; a g/ml default 100 (paridad web MealGroupModal).
        let quantity = it.quantity
        if (unit === 'un' && it.quantity === 100) quantity = 1
        else if ((unit === 'g' || unit === 'ml') && it.quantity === 1) quantity = 100
        return { ...it, unit, quantity }
      })
    )
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Falta el nombre', 'Indicá un nombre para el grupo.'); return }
    if (!items.length) { Alert.alert('Sin alimentos', 'Agrega al menos un alimento.'); return }
    setSaving(true)
    const res = await saveMealGroup({
      id: editingId ?? undefined,
      name: name.trim(),
      items: items.map((it) => ({ food_id: it.food_id, quantity: it.quantity, unit: it.unit })),
    })
    setSaving(false)
    if (!res.ok || !res.group) { Alert.alert('Error', res.error ?? 'No se pudo guardar el grupo.'); return }
    setGroups((prev) => {
      const exists = prev.some((g) => g.id === res.group!.id)
      const next = exists ? prev.map((g) => (g.id === res.group!.id ? res.group! : g)) : [...prev, res.group!]
      return [...next].sort((a, b) => a.name.localeCompare(b.name))
    })
    cancelEdit()
  }

  async function performDelete() {
    const group = deleteTarget
    if (!group) return
    setDeleting(true)
    const r = await deleteMealGroup(group.id)
    setDeleting(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo eliminar.'); return }
    setGroups((prev) => prev.filter((g) => g.id !== group.id))
    setDeleteTarget(null)
  }

  const editorTotals = mealGroupTotals(items)

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />

      <View style={styles.header}>
        <TouchableOpacity
          testID="meal-groups-back"
          onPress={() => (mode === 'edit' ? cancelEdit() : router.back())}
          activeOpacity={0.8}
          style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <ChevronLeft size={20} color={theme.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.hTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]} numberOfLines={1}>
            {mode === 'edit' ? (editingId ? 'Editar grupo' : 'Nuevo grupo') : 'Grupos de comidas'}
          </Text>
          <Text style={[styles.hSub, { color: theme.mutedForeground, fontFamily: FONT.ui }]} numberOfLines={1}>
            Conjuntos de alimentos reutilizables
          </Text>
        </View>
      </View>

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando grupos…" />
      ) : mode === 'edit' ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false}>
          <Input label="Nombre del grupo" placeholder="Ej: Desayuno proteico" value={name} onChangeText={setName} maxLength={120} />

          <View style={styles.itemsHead}>
            <Text style={[styles.sectionLabel, { color: theme.mutedForeground, fontFamily: FONT.uiExtra }]}>Alimentos</Text>
            <TouchableOpacity
              testID="meal-groups-add-food"
              onPress={() => foodSheetRef.current?.present()}
              activeOpacity={0.85}
              style={[styles.addFoodBtn, { borderColor: theme.primary, backgroundColor: theme.primary + '14' }]}
            >
              <Plus size={15} color={theme.primary} />
              <Text style={{ fontSize: 13, color: theme.primary, fontFamily: FONT.uiBold }}>Agregar alimento</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={[styles.emptyItems, { borderColor: theme.border }]}>
              <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: FONT.ui, textAlign: 'center' }}>
                Agrega alimentos con el botón de arriba.
              </Text>
            </View>
          ) : (
            items.map((item, index) => {
              const m = mealGroupItemMacros(item)
              return (
                <View key={`${item.food_id}-${index}`} style={[styles.itemCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
                  <View style={styles.itemTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.itemName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>
                        {item.food?.name ?? 'Alimento'}
                      </Text>
                      <Text style={[styles.itemMacro, { color: theme.mutedForeground, fontFamily: FONT.mono }]}>
                        {Math.round(m.calories)} kcal · P{Math.round(m.protein)} C{Math.round(m.carbs)} G{Math.round(m.fats)}
                      </Text>
                    </View>
                    <TouchableOpacity testID={`meal-groups-remove-${index}`} onPress={() => removeItem(index)} hitSlop={8} style={styles.removeBtn}>
                      <Trash2 size={16} color={theme.destructive} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.itemControls}>
                    <View style={[styles.unitWrap, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                      {unitsForItem(item).map((u) => (
                        <TouchableOpacity
                          key={u}
                          testID={`meal-groups-unit-${index}-${u}`}
                          onPress={() => updateUnit(index, u)}
                          activeOpacity={0.8}
                          style={[styles.unitChip, item.unit === u && { backgroundColor: theme.primary }]}
                        >
                          <Text style={{ fontSize: 12, fontFamily: FONT.uiSemibold, color: item.unit === u ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput
                      testID={`meal-groups-qty-${index}`}
                      value={item.quantity ? String(item.quantity) : ''}
                      onChangeText={(t) => updateQty(index, Number(t.replace(/[^0-9]/g, '')) || 0)}
                      keyboardType="number-pad"
                      placeholderTextColor={theme.mutedForeground}
                      style={[styles.qtyInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: FONT.monoBold }]}
                    />
                  </View>
                </View>
              )
            })
          )}

          {items.length > 0 ? (
            <View style={[styles.totalsRow, { borderTopColor: theme.border }]}>
              <Text style={{ fontSize: 12, color: theme.mutedForeground, fontFamily: FONT.uiSemibold }}>Total estimado</Text>
              <Text style={{ fontSize: 13, color: theme.foreground, fontFamily: FONT.monoBold }}>
                ~{Math.round(editorTotals.calories)} kcal · P{Math.round(editorTotals.protein)} C{Math.round(editorTotals.carbs)} G{Math.round(editorTotals.fats)}
              </Text>
            </View>
          ) : null}

          <View style={styles.editActions}>
            <Button label="Cancelar" variant="ghost" onPress={cancelEdit} disabled={saving} style={{ flex: 1 }} />
            <Button label={saving ? 'Guardando…' : 'Guardar grupo'} variant="sport" onPress={handleSave} disabled={saving} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.listHead}>
            <Input leftIcon={Search} placeholder="Buscar grupo…" value={query} onChangeText={setQuery} clearButtonMode="while-editing" autoCapitalize="none" autoCorrect={false} containerStyle={{ flex: 1 }} />
            <TouchableOpacity testID="meal-groups-new" onPress={openCreate} activeOpacity={0.9} style={[styles.newBtn, { backgroundColor: theme.primary }]}>
              <Plus size={16} color={theme.primaryForeground} />
              <Text style={{ fontSize: 13, color: theme.primaryForeground, fontFamily: FONT.uiBold }}>Grupo</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.listBody}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ paddingTop: 40 }}>
                <EmptyState
                  icon={Layers}
                  title={query ? 'Sin resultados' : 'Sin grupos todavía'}
                  subtitle={query ? `Ningún grupo coincide con «${query.trim()}».` : 'Crea tu primer grupo de alimentos para usarlo en tus planes.'}
                  action={!query ? <Button label="Nuevo grupo" leftIcon={Plus} variant="sport" onPress={openCreate} style={{ marginTop: 8 }} /> : undefined}
                />
              </View>
            }
            renderItem={({ item: group }) => {
              const totals = mealGroupTotals(group.items)
              return (
                <View style={[styles.groupCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.xl }, SHADOWS[theme.scheme as Scheme].sm]}>
                  <View style={styles.groupTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.groupName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>{group.name}</Text>
                      <Text style={[styles.groupMeta, { color: theme.mutedForeground, fontFamily: FONT.mono }]}>
                        {group.items.length} ingredientes · ~{Math.round(totals.calories)} kcal · {Math.round(totals.protein)}g P
                      </Text>
                    </View>
                    <View style={styles.groupActions}>
                      <TouchableOpacity testID={`meal-groups-edit-${group.id}`} onPress={() => openEdit(group)} activeOpacity={0.8} style={[styles.iconBtn, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                        <PencilLine size={15} color={theme.foreground} />
                      </TouchableOpacity>
                      <TouchableOpacity testID={`meal-groups-delete-${group.id}`} onPress={() => setDeleteTarget(group)} activeOpacity={0.8} style={[styles.iconBtn, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                        <Trash2 size={15} color={theme.foreground} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {group.items.length > 0 ? (
                    <View style={styles.chipsRow}>
                      {group.items.slice(0, 3).map((it, i) => (
                        <View key={it.id ?? `${it.food_id}-${i}`} style={[styles.foodChip, { backgroundColor: theme.secondary }]}>
                          <Text style={{ fontSize: 11, color: theme.foreground, fontFamily: FONT.uiSemibold }} numberOfLines={1}>{it.food?.name ?? 'Alimento'}</Text>
                        </View>
                      ))}
                      {group.items.length > 3 ? (
                        <Badge tone="neutral" variant="soft" size="sm">+{group.items.length - 3}</Badge>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            }}
          />
        </View>
      )}

      <Dialog
        open={!!deleteTarget}
        onClose={() => (deleting ? undefined : setDeleteTarget(null))}
        title="Eliminar grupo"
        description={deleteTarget ? `¿Eliminar «${deleteTarget.name}»? Esta acción no se puede deshacer.` : undefined}
        maxWidth={420}
        footer={
          <View style={styles.dialogActions}>
            <Button label="Cancelar" variant="ghost" onPress={() => setDeleteTarget(null)} disabled={deleting} style={{ flex: 1 }} />
            <Button
              testID="meal-groups-delete-confirm"
              label={deleting ? 'Eliminando…' : 'Eliminar'}
              variant="danger"
              onPress={performDelete}
              disabled={deleting}
              style={{ flex: 1 }}
            />
          </View>
        }
      >
        <View />
      </Dialog>

      <FoodSearchSheet ref={foodSheetRef} onSelect={addFood} excludedIds={items.map((i) => i.food_id)} title="Agregar alimento al grupo" />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hTitle: { fontSize: 22, letterSpacing: -0.5 },
  hSub: { fontSize: 12.5, marginTop: 2 },

  listHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 44, paddingHorizontal: 14, borderRadius: 14 },
  listBody: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 4 },

  groupCard: { borderWidth: 1, padding: 16, gap: 12 },
  groupTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  groupName: { fontSize: 15.5, letterSpacing: -0.2 },
  groupMeta: { fontSize: 11.5, marginTop: 3 },
  groupActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 34, height: 34, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  foodChip: { maxWidth: 140, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },

  editBody: { paddingHorizontal: 16, paddingBottom: 140, gap: 14 },
  itemsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  sectionLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  addFoodBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderWidth: 1.5, borderRadius: 999 },
  emptyItems: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 24, paddingHorizontal: 16 },
  itemCard: { borderWidth: 1, padding: 12, gap: 10 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemName: { fontSize: 14 },
  itemMacro: { fontSize: 11.5, marginTop: 3 },
  removeBtn: { padding: 4 },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unitWrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  qtyInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, textAlign: 'center' },
  totalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  dialogActions: { flexDirection: 'row', gap: 10 },
})
