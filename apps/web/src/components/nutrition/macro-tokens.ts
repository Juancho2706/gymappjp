/**
 * Canonical macro color tokens — EVA redesign DS ramps (token-contract Fase 0).
 * Shared by coach + alumno nutrition surfaces so color never collides with the
 * success/adherence green (`--color-macro-goal`). The design's macro palette is
 * the data-viz triad: protein → ember (nutrition accent), carbs → sport (brand
 * blue, viz-1), fats → aqua (recovery cyan). All three are FIXED ramps (stable
 * across coaches/white-label) and constant light/dark, matching the design refs.
 *
 * Source of truth: DS ramps in `apps/web/src/app/globals.css`
 * (`--ember-500` / `--sport-500` / `--aqua-500`).
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
  protein: { label: 'Proteína', color: 'var(--ember-500)', short: 'P' },
  carbs: { label: 'Carbos', color: 'var(--sport-500)', short: 'C' },
  fats: { label: 'Grasas', color: 'var(--aqua-500)', short: 'G' },
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
