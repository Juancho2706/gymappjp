import { Text, View } from 'react-native'
import type { TextStyle } from 'react-native'
import { macroCalorieShares, NUTRITION_MACROS, type NutritionMacroKey } from '@eva/nutrition-v2'
import { FONT, LINE_HEIGHT } from '../../lib/typography'

/**
 * MacroSpark RN (T3.v Cabina, tarea V3.1) — espejo nativo de
 * `apps/web/src/components/nutrition-v2/MacroSpark.tsx`.
 *
 * Pinta UNA cifra (kcal, mono tabular) + una barra apilada de tres segmentos proporcionales al
 * APORTE CALÓRICO de cada macro, y reemplaza la ristra «228 kcal · P 8 · C 39 · G 4» en las
 * superficies del editor único. Los gramos exactos NO desaparecen: viven en el popover que monta
 * `MacroSparkPopover` (mismo directorio), que además aporta el nombre accesible.
 *
 * Presentacional puro: sin estado, sin efectos, sin red. Los porcentajes vienen SIEMPRE de
 * `macroCalorieShares` del paquete compartido —la MISMA función que usa la web, importada por el
 * barrel raíz de `@eva/nutrition-v2` (gotcha Metro: nada de submódulos deep)— y los colores SOLO
 * por los tokens de macro (`NUTRITION_MACROS[*].nativeClass`, espejo RN de `--color-macro-*`):
 * cero hex, igual que `MacroChipRow`.
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
   * angostas donde la unidad ya quedó dicha una vez arriba. El texto accesible NO depende de esto:
   * lo pone el `accessibilityLabel` del trigger del popover.
   */
  hideUnit?: boolean
  /** Clases NativeWind extra para el contenedor (estáticas: nunca `style` como función). */
  className?: string
}

/** Geometría por tamaño (mockup «Cabina v2» §00): track 38×5 / 48×6 / 64×7 px — 1:1 con web. */
const TRACK: Record<MacroSparkSize, { width: number; height: number }> = {
  sm: { width: 38, height: 5 },
  md: { width: 48, height: 6 },
  lg: { width: 64, height: 7 },
}

/** Tamaños de texto 1:1 con los arbitrary values de la web (11 / 12.5 / 14 y 8 / 9 / 10 px). */
const KCAL_PX: Record<MacroSparkSize, number> = { sm: 11, md: 12.5, lg: 14 }
const UNIT_PX: Record<MacroSparkSize, number> = { sm: 8, md: 9, lg: 10 }

function kcalStyle(px: number): TextStyle {
  return {
    fontFamily: FONT.monoSemibold,
    fontSize: px,
    // `lineHeight` explícito para que la cifra centre contra la barra sin depender de la métrica
    // de la cara; `snug` es el mismo multiplicador que usa el DS para texto de una línea.
    lineHeight: Math.round(px * LINE_HEIGHT.snug),
    fontVariant: ['tabular-nums', 'lining-nums'],
  }
}

/** La unidad hereda la cara mono del padre en web (`font-mono` en el span raíz): acá se declara. */
function unitStyle(px: number): TextStyle {
  return { fontFamily: FONT.monoMedium, fontSize: px }
}

const KCAL_STYLE: Record<MacroSparkSize, TextStyle> = {
  sm: kcalStyle(KCAL_PX.sm),
  md: kcalStyle(KCAL_PX.md),
  lg: kcalStyle(KCAL_PX.lg),
}

const UNIT_STYLE: Record<MacroSparkSize, TextStyle> = {
  sm: unitStyle(UNIT_PX.sm),
  md: unitStyle(UNIT_PX.md),
  lg: unitStyle(UNIT_PX.lg),
}

const SEGMENT_ORDER: NutritionMacroKey[] = ['protein', 'carbs', 'fats']

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

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
  const pct: Record<NutritionMacroKey, number> = {
    protein: shares.p,
    carbs: shares.c,
    fats: shares.g,
  }
  const track = TRACK[size]

  return (
    <View className={cx('flex-row items-center gap-2', className)}>
      <Text className="text-strong" style={KCAL_STYLE[size]}>
        {Math.round(calories)}
        {hideUnit ? null : (
          <Text className="text-muted" style={UNIT_STYLE[size]}>
            {' kcal'}
          </Text>
        )}
      </Text>

      {/* La barra no se anuncia (espejo del `aria-hidden` web): el nombre accesible lo pone el
          trigger de `MacroSparkPopover`, que sí dice los gramos. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="shrink-0 flex-row overflow-hidden rounded-pill bg-surface-sunken"
        style={track}
      >
        {SEGMENT_ORDER.map((key) =>
          pct[key] > 0 ? (
            <View
              key={key}
              className={NUTRITION_MACROS[key].nativeClass}
              style={{ width: `${pct[key]}%`, height: '100%' }}
            />
          ) : null,
        )}
      </View>
    </View>
  )
}
