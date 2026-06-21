import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Check, Copy, Plus, Share2, ShoppingCart, Trash2 } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useTheme } from '../../context/ThemeContext'
import {
  addManualShoppingItem,
  getShoppingList,
  removeManualShoppingItem,
  toggleShoppingItem,
  type ShoppingItemView,
  type ShoppingListView as ShoppingListData,
} from '../../lib/nutrition-shopping'

/**
 * Lista de compras del alumno — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/ShoppingListView.tsx. Render por pasillo
 * con check-off optimista, alta/baja de item manual, compartir + copiar. Carga su propia data en
 * mount (el clientId viene de la pantalla, derivado de la sesion).
 */

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

function quantityLabel(item: ShoppingItemView): string {
  if (item.quantities.length === 0) return ''
  return item.quantities.map((q) => `${roundish(q.quantity)} ${q.unit}`).join(' + ')
}

function buildShareText(list: ShoppingListData, checkedOverrides: Map<string, boolean>): string {
  const lines: string[] = ['🛒 Lista de compras']
  for (const aisle of list.aisles) {
    const pending = aisle.items.filter((i) => !(checkedOverrides.get(i.key) ?? i.isChecked))
    if (pending.length === 0) continue
    lines.push('', `*${aisle.category}*`)
    for (const item of pending) {
      const q = quantityLabel(item)
      lines.push(`• ${item.name}${q ? ` — ${q}` : ''}`)
    }
  }
  return lines.join('\n')
}

export function ShoppingListView({ clientId }: { clientId: string }) {
  const { theme } = useTheme()
  const [list, setList] = useState<ShoppingListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkedOverrides, setCheckedOverrides] = useState<Map<string, boolean>>(new Map())
  const [manualLabel, setManualLabel] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const data = await getShoppingList(clientId)
    setList(data)
    setCheckedOverrides(new Map())
    setLoading(false)
  }, [clientId])

  useEffect(() => {
    reload().catch(() => setLoading(false))
  }, [reload])

  const aisles = list?.aisles ?? []
  const isEmpty = aisles.every((a) => a.items.length === 0)

  const totalCount = useMemo(() => aisles.reduce((s, a) => s + a.items.length, 0), [aisles])
  const checkedCount = useMemo(
    () => aisles.reduce((s, a) => s + a.items.filter((i) => checkedOverrides.get(i.key) ?? i.isChecked).length, 0),
    [aisles, checkedOverrides]
  )

  function isChecked(item: ShoppingItemView): boolean {
    return checkedOverrides.get(item.key) ?? item.isChecked
  }

  async function handleToggle(item: ShoppingItemView) {
    if (!list) return
    const next = !isChecked(item)
    setCheckedOverrides((prev) => new Map(prev).set(item.key, next))
    const res = await toggleShoppingItem({
      clientId,
      planId: list.planId,
      label: item.name,
      category: item.category,
      isChecked: next,
    })
    if (!res.success) {
      setCheckedOverrides((prev) => new Map(prev).set(item.key, !next))
    }
  }

  async function handleAddManual() {
    const label = manualLabel.trim()
    if (!label || !list) return
    setAddingManual(true)
    const res = await addManualShoppingItem({ clientId, planId: list.planId, label, category: null })
    setAddingManual(false)
    if (res.success) {
      setManualLabel('')
      await reload()
    }
  }

  async function handleRemoveManual(item: ShoppingItemView) {
    if (!item.stateId) return
    setRemovingId(item.stateId)
    const res = await removeManualShoppingItem(clientId, item.stateId)
    setRemovingId(null)
    if (res.success) await reload()
  }

  async function handleShare() {
    if (!list) return
    await Share.share({ message: buildShareText(list, checkedOverrides) }).catch(() => {})
  }

  async function handleCopy() {
    if (!list) return
    await Clipboard.setStringAsync(buildShareText(list, checkedOverrides)).catch(() => {})
  }

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <ShoppingCart size={18} color={theme.foreground} />
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Lista de compras</Text>
        <Text style={[styles.count, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {checkedCount}/{totalCount}
        </Text>
      </View>

      <View style={styles.shareRow}>
        <TouchableOpacity
          onPress={handleShare}
          disabled={isEmpty}
          activeOpacity={0.85}
          style={[styles.waBtn, { opacity: isEmpty ? 0.4 : 1 }]}
        >
          <Share2 size={16} color="#FFFFFF" />
          <Text style={styles.waText}>Compartir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCopy}
          disabled={isEmpty}
          activeOpacity={0.8}
          style={[styles.copyBtn, { borderColor: theme.border, backgroundColor: theme.background, opacity: isEmpty ? 0.4 : 1 }]}
        >
          <Copy size={16} color={theme.foreground} />
        </TouchableOpacity>
      </View>

      <View style={styles.addRow}>
        <TextInput
          value={manualLabel}
          onChangeText={setManualLabel}
          placeholder="Agregar a la lista..."
          placeholderTextColor={theme.mutedForeground}
          maxLength={200}
          style={[styles.addInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
        />
        <TouchableOpacity
          onPress={handleAddManual}
          disabled={addingManual || manualLabel.trim().length === 0}
          activeOpacity={0.8}
          style={[styles.addBtn, { backgroundColor: theme.foreground, opacity: addingManual || !manualLabel.trim() ? 0.4 : 1 }]}
        >
          {addingManual ? <ActivityIndicator size="small" color={theme.background} /> : <Plus size={16} color={theme.background} />}
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <View style={[styles.emptyCard, { borderColor: theme.border }]}>
          <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tu lista está vacía. Agrega ítems o activa un plan de nutrición.
          </Text>
        </View>
      ) : (
        aisles
          .filter((a) => a.items.length > 0)
          .map((aisle) => (
            <View key={aisle.category} style={styles.aisle}>
              <Text style={[styles.aisleTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                {aisle.category.toUpperCase()}
              </Text>
              {aisle.items.map((item) => {
                const checked = isChecked(item)
                const q = quantityLabel(item)
                return (
                  <View key={item.key} style={styles.itemRow}>
                    <TouchableOpacity onPress={() => handleToggle(item)} activeOpacity={0.7} style={styles.itemTouch}>
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: checked ? theme.macro.protein : theme.border,
                            backgroundColor: checked ? theme.macro.protein : 'transparent',
                          },
                        ]}
                      >
                        {checked && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.itemName,
                            {
                              color: checked ? theme.mutedForeground : theme.foreground,
                              textDecorationLine: checked ? 'line-through' : 'none',
                              fontFamily: 'Inter_600SemiBold',
                            },
                          ]}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                        {q ? (
                          <Text style={[styles.itemQty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{q}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    {item.isManual && item.stateId ? (
                      <TouchableOpacity
                        onPress={() => handleRemoveManual(item)}
                        disabled={removingId === item.stateId}
                        activeOpacity={0.7}
                        style={styles.removeBtn}
                      >
                        {removingId === item.stateId ? (
                          <ActivityIndicator size="small" color={theme.mutedForeground} />
                        ) : (
                          <Trash2 size={16} color={theme.mutedForeground} />
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )
              })}
            </View>
          ))
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  wrap: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, flex: 1 },
  count: { fontSize: 12 },
  shareRow: { flexDirection: 'row', gap: 8 },
  waBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: '#25D366' },
  waText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Montserrat_700Bold' },
  copyBtn: { width: 44, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 24 },
  emptyText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  aisle: { gap: 4 },
  aisleTitle: { fontSize: 11, letterSpacing: 0.6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemTouch: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 14 },
  itemQty: { fontSize: 11, marginTop: 1 },
  removeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
})
