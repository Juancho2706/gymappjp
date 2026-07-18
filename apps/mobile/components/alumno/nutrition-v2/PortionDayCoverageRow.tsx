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
import { buildDayCoverageView, formatPortionsCl } from '../../../lib/nutrition-v2-portions'
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
  const label = `${row.groupName}: ${formatPortionsCl(view.coverage)} de ${formatPortionsCl(row.prescribed)}`

  return (
    <View
      accessibilityLabel={label}
      className="min-h-9 flex-row items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-sunken px-2.5 py-1"
    >
      <GroupDot
        code={row.groupCode}
        color={exchangeGroupColor({ color: row.color, sortOrder: index })}
        size={16}
      />
      <View>
        <Text
          className="font-mono text-xs font-semibold text-text-body"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatPortionsCl(view.coverage)}/{formatPortionsCl(row.prescribed)}
        </Text>
        <View className="mt-0.5 h-0.5 w-9 overflow-hidden rounded-pill bg-border-subtle">
          <View className="h-full rounded-pill bg-primary" style={{ width: `${progress * 100}%` }} />
        </View>
      </View>
      {view.excess > 0 ? (
        <Text className="text-[10px] font-bold text-warning-700">
          {PORTIONS_COPY.student.extraBadge(formatPortionsCl(view.excess))}
        </Text>
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
  if (dayCoverage.length === 0) return null
  return (
    <NutritionCard>
      <Text className="mb-2 text-sm font-medium text-text-strong">
        {PORTIONS_COPY.student.coverageTitle}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="flex-row items-center gap-2"
      >
        {dayCoverage.map((row, index) => (
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
