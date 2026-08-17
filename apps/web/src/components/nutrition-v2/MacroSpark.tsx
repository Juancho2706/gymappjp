import { macroCalorieShares } from '@eva/nutrition-v2'

import { MACRO_META, type MacroKey } from '@/components/nutrition/macro-tokens'
import { cn } from '@/lib/utils'

/**
 * MacroSpark (T3.v Cabina, PLAN §2) — el reemplazo de la ristra «228 kcal · P 8 · C 39 · G 4».
 *
 * Pinta UNA cifra (kcal, mono tabular) + una barra apilada de tres segmentos proporcionales al
 * APORTE CALÓRICO de cada macro. El coach aprende el idioma en diez segundos (azul = proteína,
 * ámbar = carbos, verde = grasas — los mismos tokens que el alumno ya ve en su dashboard) y después
 * escanea el plan sin leer un número. Los gramos exactos NO desaparecen: viven en el popover que
 * monta `MacroSparkPopover` (V0.3), que también aporta el texto accesible.
 *
 * Presentacional puro: sin estado, sin popover, sin efectos. Los porcentajes vienen SIEMPRE de
 * `macroCalorieShares` del paquete compartido (una sola fuente web/RN; prohibido recalcularlos acá,
 * ver PLAN §1) y los colores SOLO por token `var(--color-macro-*)` vía `MACRO_META` — cero hex.
 *
 * Track vacío (los tres macros en null/0 ⇒ shares {0,0,0}): se pinta solo el fondo hundido, sin
 * segmentos. Es información, no un error: ese alimento no tiene macros registrados.
 */
export type MacroSparkSize = 'sm' | 'md' | 'lg'

export type MacroSparkProps = {
  calories: number
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
  /** 'sm' filas densas · 'md' subtotales/headers (defecto) · 'lg' totales del día. */
  size?: MacroSparkSize
  /**
   * Oculta el sufijo «kcal» y deja la cifra sola (mockup «Cabina v2» A·1). Es para columnas
   * angostas donde la unidad ya quedó dicha una vez arriba —la fila de item bajo el header de
   * franja, que sí la imprime— y repetirla en cada renglón es la ristra que esta tanda vino a
   * matar. El texto accesible NO depende de esto: lo pone el `aria-label` del trigger del
   * popover, así que ocultar la unidad no le quita información a nadie.
   */
  hideUnit?: boolean
  className?: string
}

/**
 * Geometría por tamaño (mockup «Cabina v2» §00): track 38×5 / 48×6 / 64×7 px.
 * Los px sueltos van en arbitrary values porque la escala de spacing no tiene 5/7 px ni 38.
 */
const SIZE_STYLES: Record<MacroSparkSize, { track: string; kcal: string; unit: string }> = {
  sm: { track: 'h-[5px] w-[38px]', kcal: 'text-[11px]', unit: 'text-[8px]' },
  md: { track: 'h-1.5 w-12', kcal: 'text-[12.5px]', unit: 'text-[9px]' },
  lg: { track: 'h-[7px] w-16', kcal: 'text-sm', unit: 'text-[10px]' },
}

const SEGMENT_ORDER: MacroKey[] = ['protein', 'carbs', 'fats']

export function MacroSpark({
  calories,
  proteinG,
  carbsG,
  fatsG,
  size = 'md',
  hideUnit = false,
  className,
}: MacroSparkProps) {
  const shares = macroCalorieShares(proteinG, carbsG, fatsG)
  const pct: Record<MacroKey, number> = {
    protein: shares.p,
    carbs: shares.c,
    fats: shares.g,
  }
  const styles = SIZE_STYLES[size]

  return (
    // span raíz (display inline-flex): contenido de fraseo válido dentro de <button>/<span>/<p>,
    // que es donde el popover y las filas lo montan.
    <span className={cn('inline-flex items-center gap-2 whitespace-nowrap', className)}>
      <span className={cn('font-mono font-semibold tabular-nums text-strong', styles.kcal)}>
        {Math.round(calories)}
        {hideUnit ? null : (
          <span className={cn('ml-0.5 font-medium text-muted', styles.unit)}>kcal</span>
        )}
      </span>

      {/* La barra no se anuncia: el texto accesible lo pone el trigger de MacroSparkPopover. */}
      <span
        aria-hidden
        className={cn(
          'inline-flex shrink-0 overflow-hidden rounded-pill bg-surface-sunken',
          styles.track,
        )}
      >
        {SEGMENT_ORDER.map((key) =>
          pct[key] > 0 ? (
            <span
              key={key}
              className="h-full"
              style={{ width: `${pct[key]}%`, backgroundColor: MACRO_META[key].color }}
            />
          ) : null,
        )}
      </span>
    </span>
  )
}
