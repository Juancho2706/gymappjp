import { Pressable, ScrollView, Text, View, type TextStyle } from 'react-native'
import {
  formatNutritionWeekDayAccessibilityLabel,
  type NutritionWeekCell,
} from '@eva/nutrition-v2'

/**
 * Navegación de la semana Lu-Do de nutrición V2 — 7 chips a todo el ancho.
 *
 * Gemelo nativo de `apps/web/src/components/nutrition-v2/WeekDayNav.tsx` y componente compartido
 * por las superficies RN (alumno "Hoy", alumno "Plan", ficha del coach). Es PRESENTACIONAL PURO:
 * recibe las celdas ya compuestas por `buildNutritionWeek` (`@eva/nutrition-v2`) y avisa qué día
 * se eligió. Qué hace la superficie con ese día (estado local, `load(date)`, cache) lo decide
 * ella: acá no se navega, no se pide nada y NUNCA se toca `get_nutrition_today_v2` (es `volatile`,
 * materializa snapshots y revienta con fecha > hoy+1). La semana se pinta de datos ya descargados.
 *
 * Lectura de cada chip (idéntica a la web):
 *  - inicial del día ("LU" … "DO", diccionario compartido del paquete),
 *  - número del día del mes con `tabular-nums` (columnas que no bailan al cambiar de semana),
 *  - punto de estado abajo: verde = con registro, neutro tenue = día pasado sin registro (sin rojo
 *    ni culpa), círculo hueco = día futuro (todavía no pasó nada que contar).
 *
 * HOY siempre queda marcado aunque no esté seleccionado: es el único día con superficie de
 * registro y tiene que ubicarse aunque el alumno esté mirando el sábado. En la web eso es un
 * `ring-1 ring-primary/60`; RN no tiene ring (NativeWind no compila box-shadow), así que el
 * refuerzo va en el color del borde que el chip ya tiene. Seleccionado = borde + relleno de acento
 * de marca (runtime, white-label: acá no hay ni un hex).
 *
 * Gotcha RN del repo: JAMÁS `className` + `style` como FUNCIÓN en el mismo elemento — css-interop
 * descarta el prop y el chip pierde TODO el estilo. Por eso el estado `pressed` se resuelve con la
 * variante `active:` de NativeWind (clases precomputadas) y el único `style` es un objeto ESTÁTICO
 * de módulo (`fontVariant`, que no tiene utilidad NativeWind).
 */
export type WeekDayNavProps = {
  /** Las 7 celdas de `buildNutritionWeek`, en orden Lu → Do. */
  cells: readonly NutritionWeekCell[]
  /** Fecha `YYYY-MM-DD` del día que la superficie está mostrando. */
  selectedIso: string
  /** La superficie decide qué hacer con el día elegido (estado, fetch, navegación). */
  onSelect: (isoDate: string) => void
  /** Etiqueta del grupo para lectores de pantalla. */
  label?: string
  /** Margen/ancho que le dé la superficie (el componente no se posiciona solo). */
  className?: string
}

/** `fontVariant` no tiene utilidad NativeWind: va por `style` ESTÁTICO (nunca función). */
const TABULAR_NUMS: TextStyle = { fontVariant: ['tabular-nums'] }

/**
 * 52 px de alto — sobre el mínimo táctil de 44 pt, igual que la web (`min-h-[52px]`) — y
 * `min-w-11` (44 px) de ancho mínimo para que el objetivo táctil aguante tipografía ampliada.
 */
const CHIP_BASE =
  'min-h-[52px] min-w-11 flex-1 items-center justify-center gap-0.5 rounded-control border px-1 py-1.5 active:opacity-70'

const CHIP_TONE = {
  selected: 'border-primary bg-primary/10',
  /** Hoy sin seleccionar: borde de acento (equivalente nativo del `ring` de la web). */
  today: 'border-primary/60 bg-surface-card',
  idle: 'border-subtle bg-surface-card',
} as const

const DOT_BASE = 'mt-0.5 h-2 w-2 rounded-full'
const DOT_TONE = {
  /** Verde del DS (`success-500`); la web usa `emerald-*`, el token es el equivalente correcto. */
  logged: 'bg-success-500',
  /** Neutro tenue: `bg-border-default` no existe en RN (los borders son namespace aparte). */
  empty: 'bg-ink-300',
  future: 'border border-strong',
} as const

/** Número del día del mes ("2026-07-27" → "27"). Las celdas siempre traen fecha válida. */
function dayOfMonthLabel(isoDate: string): string {
  const day = Number(isoDate.slice(8, 10))
  return Number.isFinite(day) && day > 0 ? String(day) : ''
}

/**
 * ¿El día tiene registro? El pasado ya viene resuelto en `state`; para HOY hay que mirar el
 * consumo, porque su celda es "today" tenga o no ingestas. `consumed = null` es "sin registro"
 * (≠ "registró cero"), así que no se asume nada cuando no hay dato.
 *
 * Espejo exacto del `hasLoggedIntake` de la web: es regla de PRESENTACIÓN del punto (no de datos),
 * y vive en cada gemelo para no tocar el helper compartido; si sumara una tercera superficie,
 * mudarla a `week-view.ts` sería lo correcto.
 */
function hasLoggedIntake(cell: NutritionWeekCell): boolean {
  if (cell.state === 'future') return false
  if (cell.state === 'past-logged') return true
  if (cell.isLegacy === true) return true
  const consumed = cell.consumed
  if (consumed == null) return false
  return consumed.entryCount > 0 || consumed.calories > 0
}

export function WeekDayNav({
  cells,
  selectedIso,
  onSelect,
  label = 'Días de la semana',
  className,
}: WeekDayNavProps) {
  // Sin semana compuesta no se pinta un calendario inventado (la superficie muestra su vacío).
  if (cells.length === 0) return null

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={label}
      className={className}
      // `grow` deja que los 7 chips repartan el ancho completo (equivalente del `grid-cols-7` de
      // la web); el scroll solo entra en juego en pantallas muy angostas o con tipografía
      // ampliada, donde manda `min-w-11` y la fila desborda.
      contentContainerClassName="grow flex-row items-stretch gap-1"
    >
      {cells.map((cell) => {
        const isSelected = cell.isoDate === selectedIso
        const isToday = cell.state === 'today'
        const dayNumber = dayOfMonthLabel(cell.isoDate)
        const chipTone = isSelected ? CHIP_TONE.selected : isToday ? CHIP_TONE.today : CHIP_TONE.idle
        const dotTone = hasLoggedIntake(cell)
          ? DOT_TONE.logged
          : cell.state === 'future'
            ? DOT_TONE.future
            : DOT_TONE.empty
        const numberTone = isSelected
          ? 'text-primary'
          : isToday
            ? 'text-strong'
            : cell.state === 'future'
              ? 'text-muted'
              : 'text-body'

        return (
          <Pressable
            key={cell.isoDate}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            // "Lunes 27, con registro" — mismo helper y mismo diccionario de estados que la web,
            // así ninguna superficie inventa su propia frase.
            accessibilityLabel={formatNutritionWeekDayAccessibilityLabel({
              longLabel: `${cell.longLabel} ${dayNumber}`.trim(),
              state: cell.state,
            })}
            onPress={() => onSelect(cell.isoDate)}
            className={`${CHIP_BASE} ${chipTone}`}
          >
            <Text
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                isSelected ? 'text-primary' : 'text-subtle'
              }`}
            >
              {cell.shortLabel}
            </Text>
            <Text className={`text-[15px] font-bold ${numberTone}`} style={TABULAR_NUMS}>
              {dayNumber}
            </Text>
            <View className={`${DOT_BASE} ${dotTone}`} />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
