import { MACRO_META, type MacroKey } from '@/components/nutrition/macro-tokens'
import { cn } from '@/lib/utils'

/**
 * Fila compacta de macros: calorías destacadas + tres pastillas P/C/G, cada una
 * con su punto de color (paleta de macros del DS) y su cifra alineada. Reemplaza
 * las ristras de texto ("245 kcal · P 12 · C 30 · G 8") por un bloque legible y
 * consistente en cards, listas y fichas.
 *
 * Solo presentación (tokens del tema, cero hex). Un macro en null/undefined oculta
 * su pastilla; `per` agrega un sufijo de contexto (ej. "por 100 g").
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

const MACRO_ORDER: MacroKey[] = ['protein', 'carbs', 'fats']

/** Entero sin decimales; resto con un decimal (misma convención que la ficha). */
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
  const values: Record<MacroKey, number | null | undefined> = {
    protein: proteinG,
    carbs: carbsG,
    fats: fatsG,
  }

  return (
    // span raíz (display flex): contenido de fraseo válido también dentro de <button>/<span>.
    <span className={cn('flex flex-wrap items-center', sm ? 'gap-1' : 'gap-1.5')}>
      {calories != null ? (
        <span className={cn('font-bold tabular-nums text-strong', sm ? 'text-xs' : 'text-sm')}>
          {Math.round(calories)}
          <span
            className={cn(
              'ml-0.5 font-semibold text-muted',
              sm ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            kcal
          </span>
        </span>
      ) : null}

      {MACRO_ORDER.map((key) => {
        const value = values[key]
        if (value == null) return null
        const meta = MACRO_META[key]
        return (
          <span
            key={key}
            className={cn(
              'inline-flex items-center gap-1 rounded-pill border border-border-subtle bg-surface-sunken font-semibold tabular-nums text-body',
              sm ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
            )}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            />
            <span className="text-muted">{meta.short}</span>
            {fmtMacro(value)}
          </span>
        )
      })}

      {per ? (
        <span className={cn('text-subtle', sm ? 'text-[10px]' : 'text-[11px]')}>{per}</span>
      ) : null}
    </span>
  )
}
