/**
 * PortionDayCoverageCard — fila "Porciones" read-only de la ficha nutricional del alumno para
 * el coach (SPEC UX-b, criterio "Coach ficha alumno"). Espejo RN 1:1 de
 * `apps/web/src/app/coach/nutrition-v2/[clientId]/PortionDayCoverageCard.tsx`: chips compactos
 * `n/N` por grupo bajo los macros del día, check al completar y badge "+extra" por exceso.
 * Misma fuente que el alumno (`detail.today.dayCoverage` del read-model) — CERO cálculo nuevo
 * en el coach. Plan sin porciones (sin filas con `prescribed > 0`) ⇒ no renderiza nada (Q1).
 *
 * Tokens: el web usa la paleta cruda Tailwind emerald/amber; el DS móvil no la expone, así que
 * se mapea a las rampas fijas success/amber⇒warning — el MISMO mapeo ya establecido por
 * `PortionChip`/`PortionDayCoverageRow` del alumno y por la pill "Historial anterior" de la
 * ficha coach RN. Documentado en verify-fix/ficha-nutricion-v2.md.
 */
import { Check } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { exchangeGroupColor } from '@eva/nutrition-engine'
import type { NutritionDayCoverageRead } from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '../../lib/nutrition-portions-copy'
import { formatPortionsCl } from '../../lib/nutrition-v2-portions'
import { NutritionCard } from './NutritionCard'
import { GroupDot } from '../alumno/nutrition-v2/PortionChip'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function PortionDayCoverageCard({
  coverage,
}: {
  coverage: ReadonlyArray<NutritionDayCoverageRead> | undefined
}) {
  const rows = (coverage ?? []).filter((row) => row.prescribed > 0)
  if (rows.length === 0) return null

  return (
    <NutritionCard>
      <Text className="font-display text-base font-semibold text-text-strong">
        {PORTIONS_COPY.coach.dayCoverage}
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {rows.map((row, index) => {
          const complete = row.coverage >= row.prescribed
          const extra = row.coverage - row.prescribed
          const shown = Math.min(row.coverage, row.prescribed)
          const label = `${formatPortionsCl(shown)}/${formatPortionsCl(row.prescribed)}`
          return (
            <View
              accessibilityLabel={`${row.groupName}: ${label}`}
              className={cx(
                'flex-row items-center gap-1.5 rounded-pill border px-2.5 py-1.5',
                complete
                  ? 'border-success-500/30 bg-success-500/10'
                  : 'border-border-subtle bg-surface-card',
              )}
              key={row.groupCode}
            >
              <GroupDot
                code={row.groupCode}
                color={exchangeGroupColor({ color: row.color, sortOrder: index })}
                size={20}
              />
              <Text
                className={cx(
                  'text-xs font-semibold',
                  complete ? 'text-success-700' : 'text-text-strong',
                )}
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {label}
              </Text>
              {complete && extra <= 0 ? (
                <Check size={14} className="text-success-600" />
              ) : null}
              {extra > 0 ? (
                <View className="rounded-pill border border-warning-500/40 bg-warning-500/10 px-1.5 py-0.5">
                  <Text className="text-[10px] font-bold text-warning-700">
                    +{formatPortionsCl(extra)}
                  </Text>
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
      <Text className="mt-3 text-xs text-text-muted">{PORTIONS_COPY.coach.derivedNote}</Text>
    </NutritionCard>
  )
}
