import { useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { ArrowLeftRight, FileDown, Plus, Trash2 } from 'lucide-react-native'
import { dayTotalsByVariant, type DayVariant, type ExchangeGroup } from '@eva/nutrition-engine'
import { useTheme } from '../../context/ThemeContext'
import { GLOWS } from '../../lib/shadows'
import { EXCHANGE_STRINGS as S } from '../../lib/nutrition-exchanges.dict'
import { SegmentedTabs } from '../SegmentedTabs'
import type { ExchangeTargetDraft } from '../../lib/nutrition-exchanges.coach'

const EMBER_ICON = GLOWS.ember.shadowColor as string
const VARIANT_PRESETS = ['Descanso', 'Entreno AM', 'Entreno PM']

interface Props {
  active: boolean
  /** false ⇒ plan sin guardar: no se puede togglear ni asignar grupos. */
  canToggle: boolean
  togglePending: boolean
  onToggleMode: (next: boolean) => void
  mealsForTotals: { targets: ExchangeTargetDraft[]; dayVariantId: string | null }[]
  groups: ExchangeGroup[]
  variants: DayVariant[]
  goals: { calories: number; protein: number; carbs: number; fats: number }
  provisional: boolean
  variantPending: boolean
  onCreateVariant: (name: string) => void
  onDeleteVariant: (variantId: string) => void
  brandName: string
  pdfPending: boolean
  onDownloadPdf: (format: 'compact' | 'equivalences') => void
}

/**
 * Panel del modo intercambios en el builder coach (mobile) — espejo RN del web
 * `ExchangeModePanel`: toggle Gramos ↔ Porciones, totales derivados vs objetivo por
 * variante, gestor de variantes de día (presets + crear/borrar) y descarga del PDF
 * branded (expo-print). Totales con el motor puro compartido `@eva/nutrition-engine`.
 */
export function ExchangeModePanel({
  active,
  canToggle,
  togglePending,
  onToggleMode,
  mealsForTotals,
  groups,
  variants,
  goals,
  provisional,
  variantPending,
  onCreateVariant,
  onDeleteVariant,
  brandName,
  pdfPending,
  onDownloadPdf,
}: Props) {
  const { theme } = useTheme()
  const [newVariant, setNewVariant] = useState('')
  const [pdfFormat, setPdfFormat] = useState<'compact' | 'equivalences'>('compact')

  const totalsByVariant = useMemo(
    () => dayTotalsByVariant(mealsForTotals, variants, groups),
    [mealsForTotals, variants, groups]
  )

  const availablePresets = VARIANT_PRESETS.filter(
    (p) => !variants.some((v) => v.name.toLowerCase() === p.toLowerCase())
  )

  return (
    <View testID="exchange-mode-panel" className="bg-surface-card border border-subtle rounded-card" style={styles.panel}>
      <View style={styles.titleRow}>
        <View className="bg-ember-100 rounded-control" style={styles.titleTile}>
          <ArrowLeftRight size={16} color={EMBER_ICON} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="font-display-bold text-strong" style={styles.title}>{S.modeTitle}</Text>
          <Text numberOfLines={2} className="font-sans text-muted" style={styles.subtitle}>{S.modeTooltip}</Text>
        </View>
      </View>

      <SegmentedTabs
        value={active ? 'exchanges' : 'grams'}
        onChange={(v) => {
          if (!canToggle || togglePending) return
          onToggleMode(v === 'exchanges')
        }}
        items={[
          { value: 'grams', label: S.modeGrams },
          { value: 'exchanges', label: S.modePortions },
        ]}
      />

      {!canToggle ? (
        <Text className="font-sans text-muted" style={styles.hint}>{S.savePlanFirst}</Text>
      ) : null}

      {active ? (
        <>
          {provisional ? (
            <View className="border border-ember-300 bg-ember-100 rounded-control" style={styles.notice}>
              <Text className="font-sans-semibold text-ember-700" style={styles.noticeText}>{S.provisionalNotice}</Text>
            </View>
          ) : null}

          <View style={{ gap: 6 }}>
            <Text className="font-sans text-muted" style={styles.eyebrow}>{S.derivedVsGoal}</Text>
            {totalsByVariant.map((row) => (
              <View key={row.variantId ?? '__all__'} className="bg-surface-sunken/40 rounded-control" style={styles.totalRow}>
                <Text className="font-sans-bold text-strong" style={styles.totalName}>{row.name ?? S.wholeDay}</Text>
                <Text className="font-mono-medium text-muted" style={styles.totalVal}>
                  {Math.round(row.totals.calories)}/{goals.calories} kcal · P {row.totals.proteinG}/{goals.protein} · C {row.totals.carbsG}/{goals.carbs} · G {row.totals.fatsG}/{goals.fats}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            <Text className="font-sans text-muted" style={styles.eyebrow}>{S.dayVariants}</Text>
            <View style={styles.chipWrap}>
              {variants.map((v) => (
                <View key={v.id} className="border border-subtle bg-surface-app rounded-lg" style={styles.variantPill}>
                  <Text className="font-sans-bold text-strong" style={styles.variantPillText}>{v.name}</Text>
                  <TouchableOpacity
                    testID="exchange-variant-delete"
                    disabled={variantPending}
                    onPress={() => onDeleteVariant(v.id)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${S.deleteVariant} ${v.name}`}
                    style={styles.variantDel}
                  >
                    <Trash2 size={12} color={theme.destructive} />
                  </TouchableOpacity>
                </View>
              ))}
              {availablePresets.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  testID="exchange-variant-preset"
                  disabled={variantPending || !canToggle}
                  onPress={() => onCreateVariant(preset)}
                  activeOpacity={0.8}
                  className="border border-subtle rounded-lg"
                  style={[styles.presetPill, { borderStyle: 'dashed' }]}
                >
                  <Plus size={12} color={theme.mutedForeground} />
                  <Text className="font-sans-bold text-muted" style={styles.presetText}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.newVariantRow}>
              <TextInput
                testID="exchange-variant-input"
                value={newVariant}
                onChangeText={setNewVariant}
                placeholder={S.variantPlaceholder}
                placeholderTextColor={theme.mutedForeground}
                maxLength={40}
                className="bg-surface-app border border-default text-strong font-sans"
                style={styles.newVariantInput}
              />
              <TouchableOpacity
                testID="exchange-variant-add"
                disabled={variantPending || !newVariant.trim() || !canToggle}
                onPress={() => { onCreateVariant(newVariant.trim()); setNewVariant('') }}
                activeOpacity={0.85}
                className="border border-primary/40 rounded-control"
                style={[styles.addBtn, (variantPending || !newVariant.trim() || !canToggle) && { opacity: 0.5 }]}
              >
                <Text className="font-sans-semibold text-primary" style={styles.addBtnText}>{S.addVariant}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="border-t border-subtle" style={styles.pdfSection}>
            <Text className="font-sans text-muted" style={styles.eyebrow}>{S.pdfTitle}</Text>
            <SegmentedTabs
              value={pdfFormat}
              onChange={(v) => setPdfFormat(v)}
              items={[
                { value: 'compact', label: S.pdfCompact },
                { value: 'equivalences', label: S.pdfEquivalences },
              ]}
            />
            <TouchableOpacity
              testID="exchange-pdf-download"
              disabled={pdfPending}
              onPress={() => onDownloadPdf(pdfFormat)}
              activeOpacity={0.85}
              className="bg-primary rounded-control"
              style={[styles.pdfBtn, pdfPending && { opacity: 0.6 }]}
            >
              {pdfPending ? (
                <ActivityIndicator size="small" color={theme.primaryForeground} />
              ) : (
                <>
                  <FileDown size={16} color={theme.primaryForeground} />
                  <Text className="font-display text-primary-foreground" style={styles.pdfBtnText}>{S.pdfDownload}</Text>
                </>
              )}
            </TouchableOpacity>
            <Text className="font-sans text-muted" style={styles.brandPreview}>
              {S.pdfBrandPreview} <Text className="font-sans-bold text-strong">{brandName}</Text>
            </Text>
          </View>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { padding: 14, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleTile: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14 },
  subtitle: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  hint: { fontSize: 11, lineHeight: 15 },
  eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  notice: { paddingHorizontal: 10, paddingVertical: 8 },
  noticeText: { fontSize: 11, lineHeight: 15 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, paddingVertical: 7, flexWrap: 'wrap' },
  totalName: { fontSize: 12 },
  totalVal: { fontSize: 10.5 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  variantPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 4, paddingVertical: 4 },
  variantPillText: { fontSize: 11 },
  variantDel: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  presetPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  presetText: { fontSize: 11 },
  newVariantRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newVariantInput: { flex: 1, height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  addBtn: { height: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 13 },
  pdfSection: { gap: 8, paddingTop: 12 },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46 },
  pdfBtnText: { fontSize: 14 },
  brandPreview: { fontSize: 10 },
})
