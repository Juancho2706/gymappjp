import { Text, View } from 'react-native'
import { NUTRITION_MACROS, type NutritionMacroKey } from '@eva/nutrition-v2'

/**
 * Fila compacta de macros (paridad con la versión web): calorías destacadas +
 * tres pastillas P/C/G, cada una con su punto de color de la paleta de macros y
 * su cifra alineada. Reemplaza las ristras de texto por un bloque legible.
 *
 * Un macro en null/undefined oculta su pastilla; `per` agrega un sufijo de
 * contexto (ej. "por 100 g"). Solo tokens del tema.
 */
export type MacroChipRowProps = {
  calories?: number | null
  proteinG?: number | null
  carbsG?: number | null
  fatsG?: number | null
  /** Sufijo de contexto opcional (ej. "por 100 g", "/ 100 ml"). */
  per?: string | null
  /** 'sm' para densidad alta (cards/listas), 'md' para fichas. */
  size?: 'sm' | 'md'
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

const MACRO_ORDER: NutritionMacroKey[] = ['protein', 'carbs', 'fats']

/** Entero sin decimales; resto con un decimal (misma convención que la web). */
function fmtMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function MacroChipRow({
  calories,
  proteinG,
  carbsG,
  fatsG,
  per,
  size = 'md',
}: MacroChipRowProps) {
  const sm = size === 'sm'
  const values: Record<NutritionMacroKey, number | null | undefined> = {
    protein: proteinG,
    carbs: carbsG,
    fats: fatsG,
  }

  return (
    <View className={cx('flex-row flex-wrap items-center', sm ? 'gap-1' : 'gap-1.5')}>
      {calories != null ? (
        <Text className={cx('font-bold text-text-strong', sm ? 'text-xs' : 'text-sm')}>
          {Math.round(calories)}
          <Text className={cx('font-semibold text-text-muted', sm ? 'text-[10px]' : 'text-[11px]')}>
            {' kcal'}
          </Text>
        </Text>
      ) : null}

      {MACRO_ORDER.map((key) => {
        const value = values[key]
        if (value == null) return null
        const meta = NUTRITION_MACROS[key]
        return (
          <View
            key={key}
            className={cx(
              'flex-row items-center gap-1 rounded-pill border border-border-subtle bg-surface-sunken',
              sm ? 'px-2 py-0.5' : 'px-2.5 py-1',
            )}
          >
            <View className={cx('rounded-full', meta.nativeClass)} style={{ width: 6, height: 6 }} />
            <Text className={cx('font-semibold text-text-muted', sm ? 'text-[10px]' : 'text-[11px]')}>
              {meta.shortLabel}
            </Text>
            <Text className={cx('font-semibold text-text-body', sm ? 'text-[10px]' : 'text-[11px]')}>
              {fmtMacro(value)}
            </Text>
          </View>
        )
      })}

      {per ? (
        <Text className={cx('text-text-subtle', sm ? 'text-[10px]' : 'text-[11px]')}>{per}</Text>
      ) : null}
    </View>
  )
}
