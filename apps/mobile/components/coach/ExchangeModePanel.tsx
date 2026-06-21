import { useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Plus, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  macrosForTargets,
  type DayVariant,
  type ExchangeGroup,
  type ExchangeMacroTotals,
  type MealExchangeTarget,
} from '../../lib/nutrition-exchanges'
import type { ExchangeTargetDraft } from './ExchangeTargetsEditor'

const VARIANT_PRESETS = ['Descanso', 'Entreno AM', 'Entreno PM']

/** Una comida con sus targets + variante asignada (para totales por variante). */
export interface MealTargetsForTotals {
  targets: ExchangeTargetDraft[]
  dayVariantId: string | null
}

interface Props {
  active: boolean
  /** false ⇒ plan sin id de DB todavía (guardar primero). */
  canToggle: boolean
  togglePending: boolean
  onToggleMode: (next: boolean) => void
  groups: ExchangeGroup[]
  variants: DayVariant[]
  meals: MealTargetsForTotals[]
  goals: { calories: number; protein: number; carbs: number; fats: number }
  variantPending: boolean
  onCreateVariant: (name: string) => void
  onDeleteVariant: (variantId: string) => void
}

function dayTotals(meals: MealTargetsForTotals[], groups: ExchangeGroup[]): ExchangeMacroTotals {
  return meals.reduce<ExchangeMacroTotals>(
    (sum, meal) => {
      const m = macrosForTargets(meal.targets as MealExchangeTarget[], groups)
      return {
        calories: sum.calories + m.calories,
        proteinG: sum.proteinG + m.proteinG,
        carbsG: sum.carbsG + m.carbsG,
        fatsG: sum.fatsG + m.fatsG,
      }
    },
    { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
  )
}

/**
 * Panel del modo intercambios en el builder coach — espejo de ExchangeModePanel.tsx (web):
 * toggle Gramos ↔ Porciones, totales derivados vs objetivo (por variante) y gestor de
 * variantes de día. El PDF de equivalencias queda como follow-up (ver wiringNeeded).
 */
export function ExchangeModePanel({
  active,
  canToggle,
  togglePending,
  onToggleMode,
  groups,
  variants,
  meals,
  goals,
  variantPending,
  onCreateVariant,
  onDeleteVariant,
}: Props) {
  const { theme } = useTheme()
  const [newVariant, setNewVariant] = useState('')

  const totalsByVariant = useMemo(() => {
    if (variants.length === 0) {
      return [{ variantId: null as string | null, name: null as string | null, totals: dayTotals(meals, groups) }]
    }
    return variants.map((v) => ({
      variantId: v.id,
      name: v.name,
      totals: dayTotals(meals.filter((m) => m.dayVariantId == null || m.dayVariantId === v.id), groups),
    }))
  }, [variants, meals, groups])

  return (
    <View style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Modo de la pauta</Text>
        <View style={styles.toggleWrap}>
          <Text style={[styles.toggleSide, { color: !active ? theme.foreground : theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Gramos</Text>
          <Switch theme={theme} value={active} disabled={!canToggle || togglePending} onValueChange={onToggleMode} />
          <Text style={[styles.toggleSide, { color: active ? theme.foreground : theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Porciones</Text>
        </View>
      </View>

      {!canToggle ? (
        <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Guardá el plan primero para activar el modo porciones.
        </Text>
      ) : null}

      {active ? (
        <>
          <View style={{ gap: 6 }}>
            <Text style={[styles.subhead, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Derivado vs objetivo</Text>
            {totalsByVariant.map((row) => {
              const d = row.totals
              return (
                <View key={row.variantId ?? '__all__'} style={[styles.totalRow, { backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.totalName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{row.name ?? 'Día completo'}</Text>
                  <Text style={[styles.totalMacro, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {Math.round(d.calories)}/{goals.calories} kcal · P{d.proteinG}/{goals.protein} C{d.carbsG}/{goals.carbs} G{d.fatsG}/{goals.fats}
                  </Text>
                </View>
              )
            })}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[styles.subhead, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Variantes de día</Text>
            <View style={styles.variantChips}>
              {variants.map((v) => (
                <View key={v.id} style={[styles.variantChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                  <Text style={[styles.variantChipText, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{v.name}</Text>
                  <TouchableOpacity onPress={() => onDeleteVariant(v.id)} disabled={variantPending} hitSlop={6} activeOpacity={0.7}>
                    <Trash2 size={13} color={theme.destructive} />
                  </TouchableOpacity>
                </View>
              ))}
              {VARIANT_PRESETS.filter((p) => !variants.some((v) => v.name.toLowerCase() === p.toLowerCase())).map((preset) => (
                <TouchableOpacity key={preset} onPress={() => onCreateVariant(preset)} disabled={variantPending} activeOpacity={0.8}
                  style={[styles.presetChip, { borderColor: theme.border }]}>
                  <Plus size={12} color={theme.mutedForeground} />
                  <Text style={[styles.variantChipText, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.addVariantRow}>
              <TextInput
                value={newVariant}
                onChangeText={setNewVariant}
                placeholder="Nueva variante…"
                placeholderTextColor={theme.mutedForeground}
                maxLength={40}
                style={[styles.addVariantInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]}
              />
              <TouchableOpacity
                onPress={() => { if (newVariant.trim()) { onCreateVariant(newVariant.trim()); setNewVariant('') } }}
                disabled={variantPending || !newVariant.trim()}
                activeOpacity={0.85}
                style={[styles.addVariantBtn, { borderColor: theme.primary, opacity: variantPending || !newVariant.trim() ? 0.5 : 1 }]}
              >
                {variantPending ? <ActivityIndicator size="small" color={theme.primary} /> : (
                  <Text style={[styles.addVariantBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Agregar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </>
      ) : null}
    </View>
  )
}

/** Switch nativo simple (sin dep) con look del theme. */
function Switch({ theme, value, disabled, onValueChange }: { theme: any; value: boolean; disabled?: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      activeOpacity={0.85}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.switch, { backgroundColor: value ? theme.primary : theme.border, opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[styles.switchKnob, { backgroundColor: '#fff', transform: [{ translateX: value ? 18 : 2 }] }]} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, padding: 14, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 14 },
  toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleSide: { fontSize: 12 },
  switch: { width: 40, height: 24, borderRadius: 999, justifyContent: 'center' },
  switchKnob: { width: 20, height: 20, borderRadius: 999 },
  hint: { fontSize: 12, lineHeight: 16 },
  subhead: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  totalRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  totalName: { fontSize: 12 },
  totalMacro: { fontSize: 11 },
  variantChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  variantChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  variantChipText: { fontSize: 11.5 },
  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  addVariantRow: { flexDirection: 'row', gap: 8 },
  addVariantInput: { flex: 1, height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  addVariantBtn: { height: 42, minWidth: 80, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  addVariantBtnText: { fontSize: 13 },
})
