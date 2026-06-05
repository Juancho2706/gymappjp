import { forwardRef } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { ArrowLeftRight, Plus, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { swapMacros, type DraftFoodItem, type SwapOption } from '../../lib/nutrition-builder'
import { swapOptionAllowedUnits, swapOptionIsLiquid } from '../../lib/nutrition-utils'

interface Props {
  item: DraftFoodItem | null
  onAddPress: () => void
  onUpdateSwap: (swapFoodId: string, quantity: number, unit: 'g' | 'un' | 'ml') => void
  onRemoveSwap: (swapFoodId: string) => void
}

/** Intercambios (swap) de UN alimento — bottom-sheet (mobile-better; data 1:1 con web). */
export const FoodSwapSheet = forwardRef<BottomSheetModal, Props>(function FoodSwapSheet({ item, onAddPress, onUpdateSwap, onRemoveSwap }, ref) {
  const { theme } = useTheme()
  const swaps = item?.swapOptions ?? []

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['70%', '92%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <ArrowLeftRight size={16} color={theme.primary} />
          <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>Intercambios · {item?.name ?? ''}</Text>
        </View>
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Definí alternativas para este alimento. El alumno podrá elegir entre estas opciones.
        </Text>

        {swaps.length === 0 ? (
          <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin alternativas aún. Tocá “Agregar alternativa”.</Text>
        ) : (
          swaps.map((opt) => <SwapRow key={opt.food_id} opt={opt} theme={theme} onUpdate={onUpdateSwap} onRemove={onRemoveSwap} />)
        )}

        <TouchableOpacity onPress={onAddPress} activeOpacity={0.85} style={[styles.addBtn, { borderColor: theme.primary + '55' }]}>
          <Plus size={16} color={theme.primary} />
          <Text style={[styles.addText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>Agregar alternativa</Text>
        </TouchableOpacity>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

function SwapRow({ opt, theme, onUpdate, onRemove }: { opt: SwapOption; theme: any; onUpdate: Props['onUpdateSwap']; onRemove: Props['onRemoveSwap'] }) {
  const isLiquid = swapOptionIsLiquid({ is_liquid: opt.food.is_liquid, serving_unit: opt.food.serving_unit })
  const units = swapOptionAllowedUnits(isLiquid)
  const m = swapMacros(opt)
  return (
    <View style={[styles.swapCard, { borderColor: '#38BDF840', backgroundColor: '#38BDF814' }]}>
      <View style={styles.swapTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.swapName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{opt.food.name}</Text>
          <Text style={[styles.swapBase, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Porción base: {Math.round(opt.food.serving_size)} {opt.food.serving_unit ?? 'g'}</Text>
        </View>
        <TouchableOpacity onPress={() => onRemove(opt.food_id)} hitSlop={8} activeOpacity={0.7}><X size={16} color={theme.mutedForeground} /></TouchableOpacity>
      </View>

      <View style={styles.swapControls}>
        <TextInput
          value={String(opt.quantity)}
          onChangeText={(v) => onUpdate(opt.food_id, Number(v.replace(/[^0-9.]/g, '')) || 0, opt.unit)}
          keyboardType="number-pad"
          style={[styles.qtyInput, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.card, fontFamily: theme.fontSans }]}
        />
        <View style={styles.unitWrap}>
          {units.map((u) => {
            const active = opt.unit === u
            return (
              <TouchableOpacity key={u} onPress={() => onUpdate(opt.food_id, opt.quantity, u)} activeOpacity={0.8}
                style={[styles.unitChip, active && { backgroundColor: theme.primary }]}>
                <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={styles.macroRow}>
        <MacroTag label={`P ${Math.round(m.protein)}g`} color="#EF4444" />
        <MacroTag label={`C ${Math.round(m.carbs)}g`} color="#F59E0B" />
        <MacroTag label={`G ${Math.round(m.fats)}g`} color="#8B5CF6" />
        <MacroTag label={`${Math.round(m.calories)} kcal`} color={theme.primary} />
      </View>
    </View>
  )
}

function MacroTag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.macroTag, { backgroundColor: color + '22' }]}>
      <Text style={[styles.macroTagText, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, flex: 1 },
  sub: { fontSize: 12, lineHeight: 17, marginTop: -2 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  swapCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  swapTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  swapName: { fontSize: 13 },
  swapBase: { fontSize: 11, marginTop: 2 },
  swapControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: { width: 70, height: 40, borderWidth: 1, borderRadius: 9, textAlign: 'center', fontSize: 15, paddingHorizontal: 6 },
  unitWrap: { flexDirection: 'row', gap: 3 },
  unitChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  macroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  macroTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  macroTagText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, marginTop: 4 },
  addText: { fontSize: 13 },
})
