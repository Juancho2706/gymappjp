import { Pressable, ScrollView, Text, View, type TextStyle } from 'react-native'
import {
  NUTRITION_PLAN_DOW_LEGEND,
  formatNutritionPlanDowCalories,
  formatNutritionPlanDowCellAccessibilityLabel,
  type NutritionPlanDowCell,
  type NutritionPlanDowVariantLike,
} from '@eva/nutrition-v2'

/**
 * Selector de DÍA del plan — strip Lu-Do de 7 celdas, sin fechas (mockup aprobado 2026-07-29).
 *
 * Gemelo nativo de `apps/web/src/components/nutrition-v2/PlanDowSelector.tsx`. "El coach toca
 * días, no variantes": cada celda es un día de la semana con las kcal que ese día recibe y un
 * punto que dice si tiene estructura propia (lleno) o hereda el día base (hueco).
 *
 * NO es la tira de seguimiento. `WeekDayNav` lleva FECHAS, consumo y adherencia del alumno; esta
 * lleva día de semana puro y estructura del plan. Dos semánticas, dos componentes.
 *
 * Presentacional puro: recibe las celdas de `buildNutritionPlanDowStrip` y avisa qué día se tocó.
 *
 * Gotcha RN del repo: JAMÁS `className` + `style` como FUNCIÓN en el mismo elemento — css-interop
 * descarta el prop y la celda pierde TODO el estilo. El estado `pressed` va con la variante
 * `active:` de NativeWind y el único `style` es un objeto ESTÁTICO de módulo (`fontVariant`).
 * 52 px de alto y `min-w-11` (44 pt) por celda: objetivo táctil sólido con tipografía ampliada.
 */
export type PlanDowSelectorProps = {
  cells: readonly NutritionPlanDowCell<NutritionPlanDowVariantLike>[]
  /**
   * `dayOfWeek` (0=domingo … 6=sábado) del día que la superficie está mostrando. `null` = ninguna
   * celda seleccionada (el creador lo usa cuando el foco está en el día base huérfano, que no
   * tiene celda propia).
   */
  selectedDow: number | null
  onSelect: (dayOfWeek: number) => void
  /**
   * Días con datos por corregir (solo el creador los tiene): la celda lleva punto y borde
   * destructivos. Es la única señal de un error que vive en un día NO montado.
   */
  errorDays?: readonly number[]
  label?: string
  showLegend?: boolean
  className?: string
}

/** `fontVariant` no tiene utilidad NativeWind: va por `style` ESTÁTICO (nunca función). */
const TABULAR_NUMS: TextStyle = { fontVariant: ['tabular-nums'] }

const CELL_BASE =
  'min-h-[52px] min-w-11 flex-1 items-center justify-center gap-0.5 rounded-control border px-1 py-1.5 active:opacity-70'

const CELL_TONE = {
  selected: 'border-primary bg-primary/10',
  /** Hoy sin elegir: borde de acento (equivalente nativo del `ring` de la web). */
  today: 'border-primary/40 bg-surface-card',
  idle: 'border-subtle bg-surface-card',
  /** Día con datos por corregir: gana sobre seleccionado/hoy (es lo que bloquea publicar). */
  error: 'border-danger-500 bg-danger-500/10',
} as const

const DOT_OWN = 'mt-0.5 h-1.5 w-1.5 rounded-full bg-primary'
const DOT_INHERITED = 'mt-0.5 h-1 w-1 rounded-full border border-strong'
const DOT_EMPTY = 'mt-0.5 h-1 w-1 rounded-full border border-subtle'
const DOT_ERROR = 'mt-0.5 h-1.5 w-1.5 rounded-full bg-danger-500'

export function PlanDowSelector({
  cells,
  selectedDow,
  onSelect,
  errorDays,
  label = 'Días del plan',
  showLegend = true,
  className,
}: PlanDowSelectorProps) {
  if (cells.length === 0) return null
  const errorSet = new Set(errorDays ?? [])

  return (
    <View className={className}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={label}
        // `grow` reparte el ancho entre las 7 celdas (equivalente del `grid-cols-7` de la web); el
        // scroll solo entra con tipografía ampliada, donde manda `min-w-11`.
        contentContainerClassName="grow flex-row items-stretch gap-1"
      >
        {cells.map((cell) => {
          const isSelected = cell.dayOfWeek === selectedDow
          const hasError = errorSet.has(cell.dayOfWeek)
          const cellTone = hasError
            ? CELL_TONE.error
            : isSelected
              ? CELL_TONE.selected
              : cell.isToday
                ? CELL_TONE.today
                : CELL_TONE.idle
          const dotTone = hasError
            ? DOT_ERROR
            : cell.isOwnDay
              ? DOT_OWN
              : cell.variant == null
                ? DOT_EMPTY
                : DOT_INHERITED
          const dowTone = isSelected ? 'text-primary' : cell.isToday ? 'text-strong' : 'text-subtle'
          const kcalTone = isSelected
            ? 'text-primary'
            : cell.variant == null
              ? 'text-subtle'
              : 'text-muted'

          return (
            <Pressable
              key={cell.dayOfWeek}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={
                formatNutritionPlanDowCellAccessibilityLabel(cell) +
                (hasError ? ', tiene datos por corregir' : '')
              }
              onPress={() => onSelect(cell.dayOfWeek)}
              className={`${CELL_BASE} ${cellTone}`}
            >
              <Text className={`text-[10px] font-bold uppercase tracking-wide ${dowTone}`}>
                {cell.shortLabel}
              </Text>
              <Text className={`text-[11px] font-semibold ${kcalTone}`} style={TABULAR_NUMS}>
                {formatNutritionPlanDowCalories(cell.displayCalories)}
              </Text>
              <View className={dotTone} />
            </Pressable>
          )
        })}
      </ScrollView>

      {showLegend ? (
        <View className="mt-1.5 flex-row flex-wrap items-center gap-3">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-primary" />
            <Text className="text-[10px] text-subtle">{NUTRITION_PLAN_DOW_LEGEND.own}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-1 w-1 rounded-full border border-strong" />
            <Text className="text-[10px] text-subtle">{NUTRITION_PLAN_DOW_LEGEND.inherited}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}
