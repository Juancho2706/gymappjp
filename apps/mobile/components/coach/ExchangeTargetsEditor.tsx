import { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import {
  exchangeGroupColor,
  formatPortions,
  hasUnconfirmedMacros,
  macrosForTargets,
  portionsSummaryLabel,
  type DayVariant,
  type ExchangeGroup,
} from '@eva/nutrition-engine'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { EXCHANGE_STRINGS as S } from '../../lib/nutrition-exchanges.dict'
import type { ExchangeTargetDraft } from '../../lib/nutrition-exchanges.coach'

export type ExchangeSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  mealId: string
  /** false ⇒ comida aún sin id de DB (plan nuevo/comida agregada sin guardar): steppers off + hint. */
  persistable: boolean
  groups: ExchangeGroup[]
  targets: ExchangeTargetDraft[]
  onChange: (mealId: string, targets: ExchangeTargetDraft[]) => void
  variants: DayVariant[]
  variantId: string | null
  onVariantChange: (mealId: string, variantId: string | null) => void
  saveState: ExchangeSaveState
}

/**
 * Editor de porciones por grupo de UNA comida (modo intercambios) — espejo RN del web
 * `ExchangeTargetsEditor`. Steppers 44px, chip de color por grupo, macros derivados en
 * vivo (motor puro compartido) y badge "referencial" cuando algún grupo tiene
 * `macros_confirmed=false`. Presentacional: el autosave lo maneja el padre.
 */
export function ExchangeTargetsEditor({
  mealId,
  persistable,
  groups,
  targets,
  onChange,
  variants,
  variantId,
  onVariantChange,
  saveState,
}: Props) {
  const { theme } = useTheme()

  const targetByGroup = useMemo(() => {
    const m = new Map<string, ExchangeTargetDraft>()
    for (const tg of targets) m.set(tg.exchangeGroupId, tg)
    return m
  }, [targets])

  const mealMacros = useMemo(() => macrosForTargets(targets, groups), [targets, groups])
  const summary = useMemo(() => portionsSummaryLabel(targets, groups), [targets, groups])
  const provisional = useMemo(() => hasUnconfirmedMacros(targets, groups), [targets, groups])

  const setPortions = (groupId: string, next: number) => {
    const clamped = Math.max(0, Math.min(99, Math.round(next * 10) / 10))
    const rest = targets.filter((tg) => tg.exchangeGroupId !== groupId)
    onChange(mealId, clamped > 0 ? [...rest, { exchangeGroupId: groupId, portions: clamped }] : rest)
  }

  const saveLabel =
    saveState === 'saving' ? S.saving : saveState === 'saved' ? S.saved : saveState === 'error' ? S.saveError : ''

  return (
    <View testID="exchange-targets-editor" className="bg-surface-sunken/20 border border-subtle rounded-xl" style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text className="font-sans-bold text-muted" style={styles.eyebrow}>{S.portionsPerGroup}</Text>
        <View style={styles.headerRight}>
          {provisional ? (
            <View className="bg-warning-100 border border-warning-500/40 rounded-pill" style={styles.badge}>
              <Text className="font-sans-bold text-warning-700" style={styles.badgeText}>{S.provisionalBadge}</Text>
            </View>
          ) : null}
          {saveLabel ? (
            <Text
              className={`font-sans-bold ${saveState === 'error' ? 'text-destructive' : saveState === 'saving' ? 'text-muted' : 'text-success-600'}`}
              style={styles.saveText}
              accessibilityLiveRegion="polite"
            >
              {saveLabel}
            </Text>
          ) : null}
        </View>
      </View>

      {!persistable ? (
        <View className="border border-warning-500/40 bg-warning-100 rounded-control" style={styles.hint}>
          <Text className="font-sans-semibold text-warning-700" style={styles.hintText}>{S.savePlanFirst}</Text>
        </View>
      ) : null}

      <View style={styles.groupList}>
        {groups.map((group) => {
          const current = targetByGroup.get(group.id)?.portions ?? 0
          const color = exchangeGroupColor(group)
          const on = current > 0
          return (
            <View
              key={group.id}
              testID="exchange-group-row"
              className={on ? 'border-subtle bg-surface-card' : 'border-subtle'}
              style={[styles.groupRow, !on && { opacity: 0.85 }]}
            >
              <View style={[styles.groupDot, { backgroundColor: color }]}>
                <Text style={styles.groupDotText}>{group.code}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} className="font-sans-bold text-strong" style={styles.groupName}>{group.name}</Text>
                <Text className="font-sans text-muted" style={styles.groupRef}>
                  {Math.round(group.refCalories)} kcal/“1”{!group.macrosConfirmed ? ' *' : ''}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  testID="exchange-portion-dec"
                  disabled={!persistable || current <= 0}
                  onPress={() => setPortions(group.id, current - 1)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${S.decrease} ${group.name}`}
                  className="border border-subtle rounded-xl"
                  style={[styles.stepBtn, (!persistable || current <= 0) && { opacity: 0.4 }]}
                >
                  <Minus size={16} color={theme.mutedForeground} />
                </TouchableOpacity>
                <Text className="text-strong" style={styles.stepValue}>{formatPortions(current)}</Text>
                <TouchableOpacity
                  testID="exchange-portion-inc"
                  disabled={!persistable || current >= 99}
                  onPress={() => setPortions(group.id, current + 1)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${S.increase} ${group.name}`}
                  className="border border-subtle rounded-xl"
                  style={[styles.stepBtn, (!persistable || current >= 99) && { opacity: 0.4 }]}
                >
                  <Plus size={16} color={theme.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </View>

      <View className="border-t border-subtle" style={styles.summaryRow}>
        <Text className="text-strong" style={styles.summaryLabel}>{summary || S.noPortions}</Text>
        <Text className="font-mono-medium text-muted" style={styles.summaryMacros}>
          {Math.round(mealMacros.calories)} kcal · P {mealMacros.proteinG}g · C {mealMacros.carbsG}g · G {mealMacros.fatsG}g
        </Text>
      </View>

      {variants.length > 0 ? (
        <View style={styles.variantRow}>
          <Text className="font-sans-bold text-muted" style={styles.eyebrow}>{S.dayVariant}</Text>
          <View style={styles.variantChips}>
            <TouchableOpacity
              testID="exchange-variant-all"
              disabled={!persistable}
              onPress={() => onVariantChange(mealId, null)}
              activeOpacity={0.8}
              className={variantId == null ? 'bg-primary' : 'border border-subtle bg-surface-app'}
              style={styles.variantChip}
            >
              <Text className={`font-sans-bold ${variantId == null ? 'text-primary-foreground' : 'text-muted'}`} style={styles.variantChipText}>{S.allVariants}</Text>
            </TouchableOpacity>
            {variants.map((v) => {
              const active = variantId === v.id
              return (
                <TouchableOpacity
                  key={v.id}
                  testID="exchange-variant-chip"
                  disabled={!persistable}
                  onPress={() => onVariantChange(mealId, v.id)}
                  activeOpacity={0.8}
                  className={active ? 'bg-primary' : 'border border-subtle bg-surface-app'}
                  style={styles.variantChip}
                >
                  <Text className={`font-sans-bold ${active ? 'text-primary-foreground' : 'text-muted'}`} style={styles.variantChipText}>{v.name}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { padding: 12, gap: 10, marginTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  saveText: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { paddingHorizontal: 10, paddingVertical: 8 },
  hintText: { fontSize: 11.5, lineHeight: 16 },
  groupList: { gap: 6 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  groupDot: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  groupDotText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  groupName: { fontSize: 12 },
  groupRef: { fontSize: 10, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepValue: { width: 32, textAlign: 'center', fontSize: 14, fontFamily: FONT.uiExtra },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8, flexWrap: 'wrap' },
  summaryLabel: { fontSize: 12, fontFamily: FONT.uiExtra },
  summaryMacros: { fontSize: 11 },
  variantRow: { gap: 6 },
  variantChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  variantChip: { minHeight: 36, paddingHorizontal: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  variantChipText: { fontSize: 11 },
})
