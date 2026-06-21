import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import {
  exchangeGroupColor,
  formatPortions,
  macrosForTargets,
  type DayVariant,
  type ExchangeGroup,
  type MealExchangeTarget,
} from '../../lib/nutrition-exchanges'
import { hasUnconfirmedMacros, portionsSummaryLabel } from '../../lib/nutrition-builder'

export interface ExchangeTargetDraft {
  exchangeGroupId: string
  portions: number
  notes?: string | null
}

interface Props {
  groups: ExchangeGroup[]
  targets: ExchangeTargetDraft[]
  onChange: (targets: ExchangeTargetDraft[]) => void
  variants: DayVariant[]
  variantId: string | null
  onVariantChange: (variantId: string | null) => void
  /** Step del stepper (1 por defecto). */
  step?: number
}

/**
 * Editor de porciones por grupo de UNA comida (modo intercambios) — espejo de
 * ExchangeTargetsEditor.tsx (web). Steppers grandes (44px), chips de color del grupo,
 * totales derivados en vivo y badge "macros referenciales" cuando algun grupo usado
 * tiene macros_confirmed=false.
 */
export function ExchangeTargetsEditor({
  groups,
  targets,
  onChange,
  variants,
  variantId,
  onVariantChange,
  step = 1,
}: Props) {
  const { theme } = useTheme()

  const targetByGroup = useMemo(() => {
    const m = new Map<string, ExchangeTargetDraft>()
    for (const tg of targets) m.set(tg.exchangeGroupId, tg)
    return m
  }, [targets])

  const mealMacros = useMemo(() => macrosForTargets(targets as MealExchangeTarget[], groups), [targets, groups])
  const summary = useMemo(() => portionsSummaryLabel(targets, groups), [targets, groups])
  const provisional = useMemo(() => hasUnconfirmedMacros(targets, groups), [targets, groups])

  const setPortions = (groupId: string, next: number) => {
    const clamped = Math.max(0, Math.min(99, Math.round(next * 10) / 10))
    const rest = targets.filter((tg) => tg.exchangeGroupId !== groupId)
    onChange(clamped > 0 ? [...rest, { exchangeGroupId: groupId, portions: clamped }] : rest)
  }

  return (
    <View style={[styles.root, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
      <View style={styles.headRow}>
        <Text style={[styles.head, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Porciones por grupo</Text>
        {provisional ? (
          <View style={[styles.provBadge, { backgroundColor: '#F59E0B22' }]}>
            <Text style={[styles.provBadgeText, { color: '#B45309', fontFamily: 'Inter_600SemiBold' }]}>Referenciales</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.grid}>
        {groups.map((group) => {
          const current = targetByGroup.get(group.id)?.portions ?? 0
          const color = exchangeGroupColor(group)
          const on = current > 0
          return (
            <View
              key={group.id}
              style={[styles.groupRow, { borderColor: on ? theme.border : theme.border + '80', backgroundColor: on ? theme.card : 'transparent', opacity: on ? 1 : 0.85 }]}
            >
              <View style={[styles.codeChip, { backgroundColor: color }]}>
                <Text style={styles.codeText}>{group.code}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.groupName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{group.name}</Text>
                <Text style={[styles.groupRef, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {Math.round(group.refCalories)} kcal/“1”{!group.macrosConfirmed ? ' *' : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPortions(group.id, current - step)} disabled={current <= 0} hitSlop={6} activeOpacity={0.8}
                style={[styles.stepBtn, { borderColor: theme.border, opacity: current <= 0 ? 0.4 : 1 }]}>
                <Minus size={16} color={theme.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.portionVal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{formatPortions(current)}</Text>
              <TouchableOpacity onPress={() => setPortions(group.id, current + step)} disabled={current >= 99} hitSlop={6} activeOpacity={0.8}
                style={[styles.stepBtn, { borderColor: theme.border, opacity: current >= 99 ? 0.4 : 1 }]}>
                <Plus size={16} color={theme.mutedForeground} />
              </TouchableOpacity>
            </View>
          )
        })}
      </View>

      <View style={[styles.totalsRow, { borderTopColor: theme.border }]}>
        <Text numberOfLines={1} style={[styles.summary, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          {summary || 'Sin porciones'}
        </Text>
        <Text style={[styles.totalsMacro, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {Math.round(mealMacros.calories)} kcal · P{mealMacros.proteinG} C{mealMacros.carbsG} G{mealMacros.fatsG}
        </Text>
      </View>

      {variants.length > 0 ? (
        <View style={styles.variantRow}>
          <Text style={[styles.variantLabel, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Variante</Text>
          <VariantChip theme={theme} label="Todas" active={variantId == null} onPress={() => onVariantChange(null)} />
          {variants.map((v) => (
            <VariantChip key={v.id} theme={theme} label={v.name} active={variantId === v.id} onPress={() => onVariantChange(v.id)} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function VariantChip({ theme, label, active, onPress }: { theme: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[styles.vChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '1A' : 'transparent' }]}>
      <Text style={{ fontSize: 11.5, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { borderWidth: 1, padding: 10, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  provBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  provBadgeText: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4 },
  grid: { gap: 6 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  codeChip: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 10, fontFamily: 'Montserrat_800ExtraBold', color: '#fff' },
  groupName: { fontSize: 13 },
  groupRef: { fontSize: 10, marginTop: 1 },
  stepBtn: { width: 38, height: 38, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  portionVal: { width: 28, textAlign: 'center', fontSize: 15 },
  totalsRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
  summary: { fontSize: 13 },
  totalsMacro: { fontSize: 11 },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  variantLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginRight: 2 },
  vChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
})
