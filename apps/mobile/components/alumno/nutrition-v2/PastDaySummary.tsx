/**
 * Resumen de un día PASADO del alumno (week view) — solo lectura, sin ningún control de registro.
 *
 * Fuente de verdad: la fila del historial (`cell.historyDay`, ya compuesta por `buildNutritionWeek`).
 * Reglas que se respetan al pie de la letra (SPEC `nutrition-week-view`):
 *  - **El snapshot del historial SIEMPRE gana** sobre la proyección del plan vigente: las metas que
 *    se muestran son las que el alumno realmente tuvo ese día, no las que su coach publicó después.
 *  - `consumed = null` es "SIN registro", NO "registró cero": ahí se muestra el estado vacío, nunca
 *    un 0 kcal que parecería un fracaso.
 *  - Un día sin fila de historial no se rellena con el plan de hoy: el plan pudo cambiar de versión
 *    y pintar franjas que ese día nunca existieron sería mentir.
 *  - Días del sistema anterior (V1): frases de `describeLegacyHistoryDay` (misma fuente que el tab
 *    Historial), jamás los ceros del modelo V2.
 *
 * Tono: el pasado no se juzga — cero rojo, cero culpa, cero llamados a la acción.
 */
import { Text, View, type TextStyle } from 'react-native'
// `describeLegacyHistoryDay` NO se llama acá a propósito: `buildNutritionWeek` ya lo aplicó al
// componer la celda (`cell.legacy`), y volver a llamarlo abriría la puerta a que las frases de este
// resumen y las del tab Historial se desincronicen.
import {
  formatNutritionAmount,
  formatNutritionCalories,
  type NutritionWeekCell,
} from '@eva/nutrition-v2'
import { MacroChipRow, NutritionCard, NutritionSkeleton, NutritionStatePanel } from '../../nutrition-v2'

/** `fontVariant` no tiene utilidad NativeWind: va por `style` ESTÁTICO de módulo (nunca función). */
const TABULAR_NUMS: TextStyle = { fontVariant: ['tabular-nums'] }

export type PastDaySummaryProps = {
  /** Celda del día, ya compuesta por `buildNutritionWeek` (historial + proyección). */
  cell: NutritionWeekCell
  /** `false` mientras el historial de la semana todavía se está leyendo (evita un "sin registros" falso). */
  ready: boolean
}

type SummaryRow = { label: string; value: string; target: string | null }

export function PastDaySummary({ cell, ready }: PastDaySummaryProps) {
  const historyDay = cell.historyDay ?? null

  // Todavía no sabemos si ese día tuvo registro: "sin registro" y "aún no leí" son estados
  // distintos y solo uno de los dos se le puede decir al alumno.
  if (!ready && historyDay == null) {
    return <NutritionSkeleton variant="history" rows={2} />
  }

  const legacy = cell.legacy
  const isLegacyOnly = cell.isLegacy === true && legacy != null && legacy.legacyOnly

  // Día del sistema anterior: sus totales V2 son ceros por construcción, así que manda la capa
  // legacy (mismas frases que la card del tab Historial).
  if (isLegacyOnly && legacy) {
    return (
      <NutritionCard>
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
          Registrado en el sistema anterior
        </Text>
        {legacy.hasMacros && legacy.consumed ? (
          <View className="mt-3">
            <MacroChipRow
              calories={legacy.consumed.calories}
              proteinG={legacy.consumed.proteinG}
              carbsG={legacy.consumed.carbsG}
              fatsG={legacy.consumed.fatsG}
              size="md"
            />
          </View>
        ) : (
          <Text className="mt-2 text-sm leading-6 text-text-body" style={TABULAR_NUMS}>
            {legacy.completionCount > 0 ? legacy.completionsLabel : 'Ese día quedó registrado en el sistema clásico.'}
          </Text>
        )}
        {legacy.mealsLabel ? (
          <Text className="mt-2 text-xs leading-5 text-text-subtle">{legacy.mealsLabel}</Text>
        ) : null}
      </NutritionCard>
    )
  }

  const consumed = cell.consumed
  if (consumed == null) {
    return (
      <NutritionStatePanel
        icon="empty"
        illustration="historial-vacio"
        title="Ese día no quedó registrado"
        description="No hay alimentos guardados para esta fecha. Los días pasados se muestran tal cual quedaron: el registro vive en el día de hoy."
      />
    )
  }

  const targets = cell.targets
  const rows: SummaryRow[] = [
    {
      label: 'Energía',
      value: formatNutritionCalories(consumed.calories),
      target: targets?.calories != null ? formatNutritionCalories(targets.calories) : null,
    },
    {
      label: 'Proteína',
      value: formatNutritionAmount(consumed.proteinG, 'g'),
      target: targets?.proteinG != null ? formatNutritionAmount(targets.proteinG, 'g') : null,
    },
    {
      label: 'Carbohidratos',
      value: formatNutritionAmount(consumed.carbsG, 'g'),
      target: targets?.carbsG != null ? formatNutritionAmount(targets.carbsG, 'g') : null,
    },
    {
      label: 'Grasas',
      value: formatNutritionAmount(consumed.fatsG, 'g'),
      target: targets?.fatsG != null ? formatNutritionAmount(targets.fatsG, 'g') : null,
    },
  ]

  const entryCount = historyDay?.activeEntryCount ?? consumed.entryCount
  const correctionCount = historyDay?.correctionCount ?? 0
  // Un día MIXTO (registros V2 + rastro del sistema anterior) suma su línea, sin repetir macros.
  const legacyNote =
    cell.isLegacy === true && legacy != null && !legacy.legacyOnly ? legacy.secondaryLabel : null

  return (
    <NutritionCard>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
        Lo que registraste ese día
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-y-3">
        {rows.map((row) => (
          <View key={row.label} className="min-w-[40%] flex-1 pr-2">
            <Text className="font-display text-lg font-bold text-text-strong" style={TABULAR_NUMS}>
              {row.value}
            </Text>
            <Text className="text-xs text-text-muted">{row.label}</Text>
            {row.target ? (
              // Meta CONGELADA del snapshot de ese día (no la del plan vigente hoy).
              <Text className="mt-0.5 text-[11px] text-text-subtle" style={TABULAR_NUMS}>
                Meta {row.target}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      <Text className="mt-3 text-xs text-text-subtle" style={TABULAR_NUMS}>
        {entryCount} registro{entryCount === 1 ? '' : 's'}
        {correctionCount > 0 ? ` · ${correctionCount} corrección${correctionCount === 1 ? '' : 'es'}` : ''}
      </Text>
      {legacyNote ? (
        <Text className="mt-1 text-xs text-text-subtle" style={TABULAR_NUMS}>
          {legacyNote}
        </Text>
      ) : null}
    </NutritionCard>
  )
}
