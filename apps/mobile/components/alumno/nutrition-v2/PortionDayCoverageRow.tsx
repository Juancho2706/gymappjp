/**
 * PortionDayCoverageRow — fila secundaria compacta "Porciones de hoy" bajo el
 * AuraHero (SPEC UX-b): los anillos de macros siguen siendo el héroe único; esta
 * fila usa chips pequeños (circulito de identidad + n/N + mini barra 2px), con
 * check en tono success al completar y "+n" en warning por exceso. Scroll
 * horizontal si no caben. Solo lectura (los taps viven en los chips de franja).
 */
import { memo } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import type { NutritionDayCoverageRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  buildDayCoverageView,
  formatPortionsCl,
  visibleDayCoverageRows,
} from '../../../lib/nutrition-v2-portions'
import { useTheme } from '../../../context/ThemeContext'
import { NutritionCard } from '../../nutrition-v2'
import { GroupDot } from './PortionChip'

export interface PortionDayCoverageRowProps {
  dayCoverage: ReadonlyArray<NutritionDayCoverageRead>
  /** Δ optimista de marcadas por grupo (todas las franjas). */
  pendingByGroup: Readonly<Record<string, number>>
  voidedByGroup: Readonly<Record<string, number>>
}

function DayChip({
  row,
  index,
  pendingByGroup,
  voidedByGroup,
}: {
  row: NutritionDayCoverageRead
  index: number
  pendingByGroup: Readonly<Record<string, number>>
  voidedByGroup: Readonly<Record<string, number>>
}) {
  const { theme } = useTheme()
  const view = buildDayCoverageView(row, pendingByGroup, voidedByGroup)
  const progress =
    row.prescribed > 0 ? Math.min(view.coverage / row.prescribed, 1) : view.coverage > 0 ? 1 : 0
  const counter = `${formatPortionsCl(view.displayCoverage)}/${formatPortionsCl(row.prescribed)}`
  const label = `${row.groupName}: ${counter}${view.excess > 0 ? `, ${PORTIONS_COPY.student.extraBadge(formatPortionsCl(view.excess))}` : ''}`

  return (
    <View
      accessible
      accessibilityLabel={label}
      className={`min-h-9 flex-row items-center gap-1.5 rounded-pill border px-2.5 py-1.5 ${
        view.complete
          ? 'border-success-500/40 bg-success-500/10'
          : 'border-border-subtle bg-surface-card'
      }`}
    >
      <GroupDot
        code={row.groupCode}
        color={exchangeGroupColor({ color: row.color, sortOrder: index })}
        size={20}
      />
      <View>
        <Text
          className={`text-xs font-semibold ${view.complete ? 'text-success-700' : 'text-text-strong'}`}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {counter}
        </Text>
        <View className="mt-0.5 h-0.5 w-8 overflow-hidden rounded-pill bg-border-subtle">
          <View
            className={`h-full rounded-pill ${view.complete ? 'bg-success-500' : 'bg-primary'}`}
            style={{ width: `${progress * 100}%` }}
          />
        </View>
      </View>
      {view.excess > 0 ? (
        <View className="rounded-pill border border-warning-500/40 bg-warning-500/10 px-1.5 py-0.5">
          <Text className="text-[10px] font-bold text-warning-700">
            {PORTIONS_COPY.student.extraBadge(formatPortionsCl(view.excess))}
          </Text>
        </View>
      ) : view.complete ? (
        <Check color={theme.success} size={12} />
      ) : null}
    </View>
  )
}

function PortionDayCoverageRowBase({
  dayCoverage,
  pendingByGroup,
  voidedByGroup,
}: PortionDayCoverageRowProps) {
  const rows = visibleDayCoverageRows(dayCoverage)
  if (rows.length === 0) return null
  return (
    <NutritionCard style={{ padding: 12 }}>
      <Text className="mb-2 text-sm font-medium text-text-strong">
        {PORTIONS_COPY.student.coverageTitle}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row items-center gap-2"
      >
        {rows.map((row, index) => (
          <DayChip
            key={row.groupCode}
            row={row}
            index={index}
            pendingByGroup={pendingByGroup}
            voidedByGroup={voidedByGroup}
          />
        ))}
      </ScrollView>
    </NutritionCard>
  )
}

export const PortionDayCoverageRow = memo(PortionDayCoverageRowBase)
