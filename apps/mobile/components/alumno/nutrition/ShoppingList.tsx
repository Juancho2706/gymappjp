import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Share, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Check, ChevronRight, Plus, Share2, ShoppingCart, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { shadow } from '../../../lib/shadows'
import { Sheet } from '../../Sheet'
import { HapticPressable } from '../../HapticPressable'
import {
  addManualShoppingItem,
  buildShoppingShareText,
  getShoppingList,
  quantityLabel,
  removeManualShoppingItem,
  toggleShoppingItem,
  type ShoppingItemView,
  type ShoppingListView,
} from '../../../lib/nutrition-shopping.api'

/**
 * ShoppingList (E4-13, gap 2.7) — lista de compras del alumno, espejo del web
 * `nutrition/_components/ShoppingListView`. Líneas DERIVADAS del plan activo
 * (agregadas por alimento, agrupadas por pasillo) + estado persistido de check e
 * ítems manuales. Base tier: sin módulo pago (RLS `client_id = auth.uid()` en el
 * server = 2da capa). El monolito mobile no la tenía.
 *
 * UX mobile: sección compacta (trigger con progreso) que abre un Sheet DS con la
 * lista interactiva — marcar con override optimista, agregar ítem manual y
 * compartir como texto vía Share nativo (equivalente al WhatsApp/copiar de la web).
 * Self-contained: hace su propio fetch (GET) al montar y ante `refreshSignal`.
 * Sin plan y sin ítems → no renderiza nada (igual que la web omite la sección).
 */

export function ShoppingList({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const { theme, resolvedScheme } = useTheme()

  const [list, setList] = useState<ShoppingListView | null>(null)
  const [open, setOpen] = useState(false)
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())
  const [manualLabel, setManualLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const l = await getShoppingList()
      setList(l)
      setOverrides(new Map())
    } catch {
      /* offline / sin sesión: la sección simplemente no aparece */
    }
  }, [])

  useEffect(() => {
    let alive = true
    getShoppingList()
      .then((l) => {
        if (!alive) return
        setList(l)
        setOverrides(new Map())
      })
      .catch(() => {
        if (alive) setList(null)
      })
    return () => {
      alive = false
    }
  }, [refreshSignal])

  const isChecked = useCallback(
    (item: ShoppingItemView) => overrides.get(item.key) ?? item.isChecked,
    [overrides],
  )

  const aisles = list?.aisles ?? []
  const allItems = useMemo(() => aisles.flatMap((a) => a.items), [aisles])
  const total = allItems.length
  const checked = useMemo(() => allItems.filter((i) => isChecked(i)).length, [allItems, isChecked])

  const handleToggle = useCallback(
    async (item: ShoppingItemView) => {
      if (!list) return
      const next = !isChecked(item)
      setOverrides((prev) => new Map(prev).set(item.key, next))
      try {
        await toggleShoppingItem({
          planId: list.planId,
          label: item.name,
          category: item.category,
          isChecked: next,
        })
      } catch {
        // revertir el override optimista si el server rechaza
        setOverrides((prev) => new Map(prev).set(item.key, !next))
      }
    },
    [list, isChecked],
  )

  const handleAddManual = useCallback(async () => {
    const label = manualLabel.trim()
    if (!label || adding || !list) return
    setAdding(true)
    try {
      await addManualShoppingItem({ planId: list.planId, label })
      setManualLabel('')
      await load()
    } catch {
      /* noop: el input conserva el texto para reintentar */
    } finally {
      setAdding(false)
    }
  }, [manualLabel, adding, list, load])

  const handleRemoveManual = useCallback(
    async (item: ShoppingItemView) => {
      if (!item.stateId || removingId) return
      setRemovingId(item.stateId)
      try {
        await removeManualShoppingItem(item.stateId)
        await load()
      } catch {
        /* noop */
      } finally {
        setRemovingId(null)
      }
    },
    [removingId, load],
  )

  const handleShare = useCallback(() => {
    if (!list) return
    // Reflejar los overrides optimistas en el texto compartido (sólo lo pendiente).
    const merged: ShoppingListView = {
      planId: list.planId,
      aisles: list.aisles.map((a) => ({
        category: a.category,
        items: a.items.map((i) => ({ ...i, isChecked: isChecked(i) })),
      })),
    }
    Share.share({ message: buildShoppingShareText(merged) }).catch(() => {})
  }, [list, isChecked])

  // Sin datos que mostrar (sin plan activo y sin ítems manuales) → omitir la sección.
  if (!list || (total === 0 && !list.planId)) return null

  const isEmpty = total === 0

  return (
    <>
      <TouchableOpacity
        testID="shopping-list-trigger"
        accessibilityRole="button"
        accessibilityLabel="Abrir lista de compras"
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            borderRadius: theme.radius['2xl'],
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
          },
          shadow('sm', resolvedScheme),
        ]}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.muted,
          }}
        >
          <ShoppingCart size={19} color={theme.foreground} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONT.displayBold, fontSize: 15, color: theme.foreground }}>
            Lista de compras
          </Text>
          <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: theme.mutedForeground, marginTop: 1 }}>
            {isEmpty ? 'Tu lista está vacía' : `${checked}/${total} listos`}
          </Text>
        </View>
        <ChevronRight size={18} color={theme.mutedForeground} strokeWidth={2} />
      </TouchableOpacity>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Lista de compras"
        description="Derivada de tu plan. Marca lo que ya tienes o agrega lo que falte."
      >
        {/* Compartir */}
        <TouchableOpacity
          testID="shopping-list-share"
          accessibilityRole="button"
          accessibilityLabel="Compartir lista de compras"
          disabled={isEmpty}
          activeOpacity={0.85}
          onPress={handleShare}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 48,
            borderRadius: theme.radius.xl,
            backgroundColor: theme.foreground,
            opacity: isEmpty ? 0.4 : 1,
          }}
        >
          <Share2 size={16} color={theme.background} strokeWidth={2.25} />
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: theme.background }}>Compartir lista</Text>
        </TouchableOpacity>

        {/* Alta manual */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              flex: 1,
              height: 48,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.muted,
            }}
          >
            <TextInput
              testID="shopping-list-add-input"
              value={manualLabel}
              onChangeText={setManualLabel}
              placeholder="Agregar a la lista..."
              placeholderTextColor={theme.mutedForeground}
              maxLength={200}
              returnKeyType="done"
              onSubmitEditing={handleAddManual}
              style={{ flex: 1, fontFamily: FONT.uiMedium, fontSize: 14, color: theme.foreground, paddingVertical: 0 }}
            />
          </View>
          <TouchableOpacity
            testID="shopping-list-add-button"
            accessibilityRole="button"
            accessibilityLabel="Agregar ítem"
            disabled={adding || manualLabel.trim().length === 0}
            activeOpacity={0.85}
            onPress={handleAddManual}
            style={{
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.xl,
              backgroundColor: theme.primary,
              opacity: adding || manualLabel.trim().length === 0 ? 0.4 : 1,
            }}
          >
            {adding ? (
              <ActivityIndicator size="small" color={theme.background} />
            ) : (
              <Plus size={20} color={theme.background} strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        </View>

        {/* Contenido */}
        {isEmpty ? (
          <Text
            style={{
              fontFamily: FONT.ui,
              fontSize: 12,
              color: theme.mutedForeground,
              textAlign: 'center',
              paddingVertical: 28,
            }}
          >
            Tu lista está vacía. Agrega ítems o activa un plan de nutrición.
          </Text>
        ) : (
          <View style={{ gap: 18 }}>
            {aisles
              .filter((a) => a.items.length > 0)
              .map((aisle) => (
                <View key={aisle.category} style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontFamily: FONT.uiBold,
                      fontSize: 11,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: theme.mutedForeground,
                    }}
                  >
                    {aisle.category}
                  </Text>
                  {aisle.items.map((item) => {
                    const on = isChecked(item)
                    const q = quantityLabel(item)
                    const removing = removingId === item.stateId
                    return (
                      <View
                        key={item.key}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: theme.border,
                        }}
                      >
                        <HapticPressable
                          testID="shopping-list-toggle"
                          haptic={on ? 'light' : 'success'}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`${item.name}${on ? ', comprado' : ''}`}
                          onPress={() => handleToggle(item)}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}
                        >
                          <View
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 2,
                              borderColor: on ? theme.success : theme.border,
                              backgroundColor: on ? theme.success : 'transparent',
                            }}
                          >
                            {on ? <Check size={15} color={theme.background} strokeWidth={3} /> : null}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              numberOfLines={1}
                              style={{
                                fontFamily: FONT.uiSemibold,
                                fontSize: 14,
                                color: on ? theme.mutedForeground : theme.foreground,
                                textDecorationLine: on ? 'line-through' : 'none',
                              }}
                            >
                              {item.name}
                            </Text>
                            {q ? (
                              <Text
                                style={{
                                  fontFamily: FONT.monoMedium,
                                  fontSize: 11,
                                  color: theme.mutedForeground,
                                  fontVariant: ['tabular-nums'],
                                  marginTop: 1,
                                }}
                              >
                                {q}
                              </Text>
                            ) : null}
                          </View>
                        </HapticPressable>
                        {item.isManual && item.stateId ? (
                          <TouchableOpacity
                            testID="shopping-list-remove"
                            accessibilityRole="button"
                            accessibilityLabel={`Eliminar ${item.name}`}
                            disabled={removing}
                            hitSlop={8}
                            activeOpacity={0.7}
                            onPress={() => handleRemoveManual(item)}
                            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: removing ? 0.5 : 1 }}
                          >
                            {removing ? (
                              <ActivityIndicator size="small" color={theme.mutedForeground} />
                            ) : (
                              <Trash2 size={17} color={theme.mutedForeground} strokeWidth={2} />
                            )}
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              ))}
          </View>
        )}
      </Sheet>
    </>
  )
}
