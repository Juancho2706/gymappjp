/**
 * Canonical macro color tokens — EVA redesign DS ramps (TOKENS.md).
 * Shared by coach + alumno nutrition surfaces so color never collides with the
 * success/adherence green (`--color-macro-goal`). The macro palette is the FIXED
 * trio of T2.7 F1 (same as `NUTRITION_MACROS` in `packages/nutrition-v2/design.ts`):
 * protein → blue, carbs → amber, fats → green — stable across coaches/white-label
 * and constant light/dark.
 *
 * Source of truth: `--color-macro-*` tokens in `apps/web/src/app/globals.css`.
 */
export type MacroKey = 'protein' | 'carbs' | 'fats'

export interface MacroMeta {
  /** i18n-neutral default label (Spanish latam). Override via prop where needed. */
  label: string
  /** CSS color (a DS ramp `var()` reference). */
  color: string
  /** Single-letter short label used in dense P/C/G rows. */
  short: string
}

export const MACRO_META: Record<MacroKey, MacroMeta> = {
  protein: { label: 'Proteína', color: 'var(--color-macro-protein)', short: 'P' },
  carbs: { label: 'Carbos', color: 'var(--color-macro-carbs)', short: 'C' },
  fats: { label: 'Grasas', color: 'var(--color-macro-fats)', short: 'G' },
}

/** Over-target (exceeded) hue — distinct from any macro hue. Pair with a word + icon. */
export const MACRO_OVER_COLOR = 'var(--color-macro-over)'
/** Success / adherence green. NEVER used for a macro hue. */
export const MACRO_GOAL_COLOR = 'var(--color-macro-goal)'
/** Neutral ring/bar track. */
export const RING_TRACK = 'var(--ring-track)'
export const RING_TRACK_STRONG = 'var(--ring-track-strong)'

/** Clamp a consumed/target ratio to [0, cap]. Default cap allows a small overshoot. */
export function macroRatio(consumed: number, target: number, cap = 1.1): number {
  if (target <= 0) return 0
  return Math.min(consumed / target, cap)
}

/** Percentage (0–100, clamped) for progress semantics. */
export function macroPct(consumed: number, target: number): number {
  if (target <= 0) return 0
  return Math.min((consumed / target) * 100, 100)
}
