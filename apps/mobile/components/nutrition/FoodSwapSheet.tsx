import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { ArrowLeftRight, Check, RotateCcw, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../context/ThemeContext'
import type { FoodItemForMacros } from '../../lib/nutrition-utils'

/**
 * Sheet de intercambio de alimentos (food swap, modo gramos) — lado ALUMNO (mobile).
 *
 * Sin equivalente directo de componente en la web (alli el swap vive embebido en MealCard); aca
 * lo aislamos en un sheet por comida para no tocar el MealCardExpandable compartido. Lista cada
 * alimento del plan con sus `swap_options` permitidas por el coach; tap aplica el swap (porcion del
 * coach) via applyMealFoodSwap. "Volver al original" revierte. Solo el dia de hoy.
 */

interface Props {
  visible: boolean
  mealName: string
  /** Items ORIGINALES del plan (con swap_options), NO los ya intercambiados. */
  foodItems: FoodItemForMacros[]
  /** originalFoodId -> swappedFoodId activo. */
  activeSwaps: Map<string, string>
  pendingFoodId: string | null
  onApply: (originalFoodId: string, swappedFoodId: string) => void
  onRevert: (originalFoodId: string) => void
  onClose: () => void
}

export function FoodSwapSheet({
  visible,
  mealName,
  foodItems,
  activeSwaps,
  pendingFoodId,
  onApply,
  onRevert,
  onClose,
}: Props) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  const swappable = foodItems.filter((fi) => (fi.swap_options ?? []).length > 0 && fi.foods.id)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <MotiView
          from={{ translateY: 500 }}
          animate={{ translateY: 0 }}
          transition={{ type: 'timing', duration: 220 }}
          style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + 16 }]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.mutedForeground }]} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                Intercambiar alimentos
              </Text>
              <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                {mealName}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={theme.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {swappable.length === 0 ? (
              <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Tu coach no configuró alternativas para esta comida.
              </Text>
            ) : (
              swappable.map((fi) => {
                const originalId = fi.foods.id!
                const activeSwapId = activeSwaps.get(originalId) ?? null
                return (
                  <View key={originalId} style={[styles.foodBlock, { borderColor: theme.border }]}>
                    <Text style={[styles.foodLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                      EN LUGAR DE {fi.foods.name.toUpperCase()}
                    </Text>

                    {(fi.swap_options ?? []).map((opt) => {
                      const active = activeSwapId === opt.food_id
                      const isPending = pendingFoodId === originalId
                      return (
                        <TouchableOpacity
                          key={opt.food_id}
                          disabled={isPending}
                          onPress={() => (active ? onRevert(originalId) : onApply(originalId, opt.food_id))}
                          activeOpacity={0.8}
                          style={[
                            styles.optRow,
                            {
                              borderColor: active ? theme.primary : theme.border,
                              backgroundColor: active ? theme.primary + '14' : theme.card,
                            },
                          ]}
                        >
                          <ArrowLeftRight size={14} color={active ? theme.primary : theme.mutedForeground} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.optName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                              {opt.name}
                            </Text>
                            <Text style={[styles.optMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                              {opt.quantity}
                              {opt.unit} · {Math.round(opt.calories)} kcal
                            </Text>
                          </View>
                          {active && <Check size={16} color={theme.primary} strokeWidth={2.5} />}
                        </TouchableOpacity>
                      )
                    })}

                    {activeSwapId && (
                      <TouchableOpacity
                        onPress={() => onRevert(originalId)}
                        disabled={pendingFoodId === originalId}
                        activeOpacity={0.7}
                        style={styles.revertBtn}
                      >
                        <RotateCcw size={12} color={theme.mutedForeground} />
                        <Text style={[styles.revertText, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>
                          Volver al original
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })
            )}
          </ScrollView>
        </MotiView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, maxHeight: '85%' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 12, opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10 },
  title: { fontSize: 16 },
  sub: { fontSize: 12, marginTop: 1 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 32 },
  foodBlock: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginBottom: 10 },
  foodLabel: { fontSize: 10, letterSpacing: 0.6 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  optName: { fontSize: 14 },
  optMeta: { fontSize: 11, marginTop: 1 },
  revertBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 6 },
  revertText: { fontSize: 11 },
})
