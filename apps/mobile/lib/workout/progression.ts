// Port 1:1 del web (apps/web/src/lib/workout/progression.ts) — lógica PURA framework-agnóstica.
// Anti-drift: mismo motor = misma sobrecarga progresiva en web y mobile.
//
// El coach setea por bloque progression_type ('weight'|'reps') + progression_value (incremento)
// + progression_mode (algoritmo). Este motor calcula el peso OBJETIVO real del día.
//  - weekly_linear (default): base + (semana-1) × incremento.
//  - double (doble progresión): mantén el peso hasta completar el tope del rango de reps en todas
//    las series; ahí subes. Ancla en la última sesión registrada (lastSession).
//  - session_linear / adaptive: reservados (sin motor → no-op seguro).
// Conservador: ante dato faltante/raro devuelve el peso base (nunca rompe el plan).

export const PROGRESSION_MODES = ['weekly_linear', 'double', 'session_linear', 'adaptive'] as const
export type ProgressionMode = (typeof PROGRESSION_MODES)[number]

export const DEFAULT_PROGRESSION_MODE: ProgressionMode = 'weekly_linear'

export const IMPLEMENTED_PROGRESSION_MODES: ReadonlySet<ProgressionMode> = new Set<ProgressionMode>([
  'weekly_linear',
  'double',
])

export function isProgressionMode(v: unknown): v is ProgressionMode {
  return typeof v === 'string' && (PROGRESSION_MODES as readonly string[]).includes(v)
}

export function normalizeProgressionMode(v: unknown): ProgressionMode {
  return isProgressionMode(v) ? v : DEFAULT_PROGRESSION_MODE
}

/** Tope del rango de reps: "8-12" → 12, "12" → 12. Sin número (AMRAP) → null. */
export function parseRepsTop(reps: string | null | undefined): number | null {
  if (!reps) return null
  const nums = String(reps).match(/\d+/g)
  if (!nums || nums.length === 0) return null
  const top = Math.max(...nums.map(Number).filter(Number.isFinite))
  return Number.isFinite(top) && top > 0 ? top : null
}

export interface ProgressionBlockInput {
  target_weight_kg: number | null
  progression_type: 'weight' | 'reps' | null
  progression_value: number | null
  progression_mode?: ProgressionMode | string | null
  reps?: string | null
  sets?: number | null
}

export interface LastSessionForBlock {
  weightKg: number | null
  repsDone: Array<number | null>
}

export interface ProgressionContext {
  currentWeek: number | null
  weeksToRepeat?: number | null
  lastSession?: LastSessionForBlock | null
}

export type ProgressionStatus = 'flat' | 'progressed' | 'holding'

export interface EffectiveTarget {
  weightKg: number | null
  baseWeightKg: number | null
  addedKg: number
  weeksApplied: number
  isProgressed: boolean
  holding: boolean
  repsTopToUnlock: number | null
  status: ProgressionStatus
  modeImplemented: boolean
  mode: ProgressionMode
}

export const KG_STEP = 0.5

function roundToStep(n: number, step = KG_STEP): number {
  return Math.round(n / step) * step
}

export function computeEffectiveTarget(
  block: ProgressionBlockInput,
  ctx: ProgressionContext
): EffectiveTarget {
  const mode = normalizeProgressionMode(block.progression_mode)
  const base = block.target_weight_kg
  const modeImplemented = IMPLEMENTED_PROGRESSION_MODES.has(mode)

  const noop: EffectiveTarget = {
    weightKg: base,
    baseWeightKg: base,
    addedKg: 0,
    weeksApplied: 0,
    isProgressed: false,
    holding: false,
    repsTopToUnlock: null,
    status: 'flat',
    modeImplemented,
    mode,
  }

  if (block.progression_type !== 'weight') return noop
  const value = block.progression_value
  if (value == null || !Number.isFinite(value) || value <= 0) return noop
  if (base == null || !Number.isFinite(base)) return noop
  if (!modeImplemented) return noop

  switch (mode) {
    case 'weekly_linear':
      return weeklyLinear(base, value, ctx, mode)
    case 'double':
      return doubleProgression(block, base, value, ctx, mode)
    default:
      return noop
  }
}

function weeklyLinear(
  base: number,
  value: number,
  ctx: ProgressionContext,
  mode: ProgressionMode
): EffectiveTarget {
  const flat: EffectiveTarget = {
    weightKg: base, baseWeightKg: base, addedKg: 0, weeksApplied: 0,
    isProgressed: false, holding: false, repsTopToUnlock: null,
    status: 'flat', modeImplemented: true, mode,
  }
  const week = ctx.currentWeek
  if (week == null || week < 1) return flat
  const cap = Math.max(1, Number(ctx.weeksToRepeat) || week)
  const cappedWeek = Math.min(week, cap)
  const weeksApplied = Math.max(0, cappedWeek - 1)
  if (weeksApplied === 0) return flat
  const weightKg = roundToStep(base + weeksApplied * value)
  const addedKg = weightKg - base
  return {
    weightKg, baseWeightKg: base, addedKg, weeksApplied,
    isProgressed: addedKg > 0, holding: false, repsTopToUnlock: null,
    status: addedKg > 0 ? 'progressed' : 'flat', modeImplemented: true, mode,
  }
}

function doubleProgression(
  block: ProgressionBlockInput,
  base: number,
  value: number,
  ctx: ProgressionContext,
  mode: ProgressionMode
): EffectiveTarget {
  const top = parseRepsTop(block.reps)
  if (top == null) return weeklyLinear(base, value, ctx, 'weekly_linear')

  const last = ctx.lastSession
  const flatBase: EffectiveTarget = {
    weightKg: base, baseWeightKg: base, addedKg: 0, weeksApplied: 0,
    isProgressed: false, holding: false, repsTopToUnlock: top,
    status: 'flat', modeImplemented: true, mode,
  }
  if (!last || last.weightKg == null || !Number.isFinite(last.weightKg)) return flatBase

  const lastW = last.weightKg
  const expectedSets = Math.max(1, Number(block.sets) || 1)
  const repsArr = last.repsDone.filter((r): r is number => r != null && Number.isFinite(r))
  const completed = repsArr.length >= expectedSets && repsArr.every((r) => r >= top)

  if (completed) {
    const weightKg = roundToStep(lastW + value)
    const addedKg = roundToStep(weightKg - base)
    return {
      weightKg, baseWeightKg: base, addedKg, weeksApplied: 0,
      isProgressed: weightKg > base, holding: false, repsTopToUnlock: top,
      status: 'progressed', modeImplemented: true, mode,
    }
  }

  const weightKg = roundToStep(lastW)
  return {
    weightKg, baseWeightKg: base, addedKg: roundToStep(weightKg - base), weeksApplied: 0,
    isProgressed: false, holding: true, repsTopToUnlock: top,
    status: 'holding', modeImplemented: true, mode,
  }
}
